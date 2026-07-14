/**
 * Smoke test do SSE (Sprint 38.1) — SEM subir o servidor HTTP.
 * Testa o barramento e o handler de stream com req/res falsos.
 *
 * Uso: node db/scripts/teste-sse.js
 */
import 'dotenv/config';
import { EventEmitter } from 'node:events';
import { query, pool } from '../../src/config/database.js';
import { gerarToken } from '../../src/utils/jwt.js';
import { publicarMudanca, totalConexoes } from '../../src/services/realtime.service.js';
import { streamQuadro } from '../../src/controllers/stream.controller.js';

const ok = (m) => console.log('  ✓ ' + m);
const falha = (m) => { console.error('  ✗ ' + m); process.exitCode = 1; };

// req/res falsos que capturam o que o handler escreveria no socket.
function fakeReqRes(token, quadroId) {
  const req = new EventEmitter();
  req.query = { token };
  req.params = { id: quadroId };

  const escrito = [];
  const res = {
    headersSent: false,
    statusCode: 200,
    writeHead() { this.headersSent = true; return this; },
    flushHeaders() {},
    write(s) { escrito.push(s); return true; },
    end() { this.finalizado = true; },
    status(c) { this.statusCode = c; return this; },
    json(o) { this.body = o; return this; },
  };
  return { req, res, escrito };
}

try {
  // Acha uma pessoa que enxergue algum quadro (admin serve).
  const pe = await query(
    `SELECT id FROM pessoas_acesso WHERE administrador = TRUE AND ativo = TRUE LIMIT 1`,
  );
  if (!pe.rows[0]) throw new Error('Nenhum admin ativo pra testar.');
  const q = await query(`SELECT id FROM quadros WHERE arquivado_em IS NULL LIMIT 1`);
  if (!q.rows[0]) throw new Error('Nenhum quadro pra testar.');

  const pessoaId = pe.rows[0].id;
  const quadroId = q.rows[0].id;
  const token = gerarToken({ pessoa_acesso_id: pessoaId });

  // --- 1. Token invalido e barrado ---
  {
    const { req, res } = fakeReqRes('lixo', quadroId);
    await streamQuadro(req, res, () => {});
    if (res.statusCode === 401) ok('token invalido -> 401');
    else falha('token invalido deveria dar 401, deu ' + res.statusCode);
  }

  // --- 2. Conexao valida abre o canal e recebe o evento ---
  {
    const { req, res, escrito } = fakeReqRes(token, quadroId);
    await streamQuadro(req, res, (e) => { throw e; });

    const abriu = escrito.some((s) => s.includes('event: conectado'));
    if (abriu) ok('conexao valida abriu o canal (event: conectado)');
    else falha('canal nao abriu: ' + JSON.stringify(escrito));

    if (totalConexoes() >= 1) ok('conexao contabilizada (' + totalConexoes() + ')');
    else falha('conexao nao contabilizada');

    // Publica uma mudanca e confere que chegou no socket.
    publicarMudanca(quadroId, 'card_movido');
    await new Promise((r) => setTimeout(r, 50));

    // O handler escreve "event: mudou\n" e "data: ...\n\n" em writes separados;
    // concatenamos pra checar o fluxo inteiro.
    const fluxo = escrito.join('');
    const recebeu = fluxo.includes('event: mudou') && fluxo.includes('card_movido');
    if (recebeu) ok('publicarMudanca chegou no cliente (event: mudou)');
    else falha('evento nao chegou: ' + JSON.stringify(escrito.slice(-4)));

    // Fecha e confere cleanup (listener removido).
    req.emit('close');
    await new Promise((r) => setTimeout(r, 20));
    if (totalConexoes() === 0) ok('cleanup no close removeu o listener');
    else falha('listener vazou: ' + totalConexoes() + ' conexoes ainda abertas');
  }

  // --- 3. Evento em OUTRO quadro nao vaza pra este ---
  {
    const { req, res, escrito } = fakeReqRes(token, quadroId);
    await streamQuadro(req, res, () => {});
    const antes = escrito.length;
    publicarMudanca('00000000-0000-0000-0000-000000000000', 'card_movido');
    await new Promise((r) => setTimeout(r, 30));
    if (escrito.length === antes) ok('evento de outro quadro nao vazou');
    else falha('vazou evento de outro quadro');
    req.emit('close');
  }
} catch (err) {
  falha('excecao: ' + (err?.message || err));
} finally {
  await pool.end();
  console.log(process.exitCode ? '\n[teste] FALHOU\n' : '\n[teste] TUDO OK\n');
}
