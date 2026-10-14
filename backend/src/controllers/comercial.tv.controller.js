import { verificarToken } from '../utils/jwt.js';
import { query } from '../config/database.js';
import { calcularTv } from '../services/comercial.tv.js';
import { assinarComercial, aoMudarComercial } from '../services/realtime.service.js';

/**
 * Sprint 42M — Modo TV do Comercial.
 *
 * GET /api/comercial/tv          → números do dia (autenticado como o resto do módulo)
 * GET /api/comercial/stream?token=JWT → SSE: avisa "mudou" a cada escrita no Comercial
 *
 * Mesmo desenho do SSE do quadro (Sprint 38.1): o stream não carrega dado,
 * só o aviso; a TV busca o estado novo em GET /comercial/tv.
 */

// Cache curtinho: várias TVs + rajada de avisos não multiplicam as consultas.
let cache = { em: 0, dados: null, promessa: null };
let geracao = 0; // sobe a cada escrita: resultado calculado antes dela não entra no cache
const CACHE_MS = 3000;

export async function painelTv(_req, res, next) {
  try {
    const agora = Date.now();
    if (cache.dados && agora - cache.em < CACHE_MS) return res.json(cache.dados);
    if (!cache.promessa) {
      const g = geracao;
      cache.promessa = calcularTv()
        .then((d) => {
          cache = { em: g === geracao ? Date.now() : 0, dados: d, promessa: null };
          return d;
        })
        .catch((e) => { cache.promessa = null; throw e; });
    }
    res.json(await cache.promessa);
  } catch (err) { next(err); }
}

// Qualquer escrita no Comercial invalida o cache: a próxima leitura já vem nova.
aoMudarComercial(() => { geracao += 1; cache.em = 0; cache.promessa = null; });

export async function streamComercial(req, res, next) {
  try {
    const token = req.query.token;
    if (!token) return res.status(401).json({ erro: 'Token não fornecido', codigo: 'sem_token' });
    let payload;
    try { payload = verificarToken(token); } catch {
      return res.status(401).json({ erro: 'Token inválido ou expirado', codigo: 'token_invalido' });
    }
    const { rows } = await query(`SELECT id, ativo FROM pessoas_acesso WHERE id = $1`, [payload.sub]);
    if (!rows[0]?.ativo) return res.status(401).json({ erro: 'Usuário inexistente ou inativo', codigo: 'sem_usuario' });

    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
      'X-Accel-Buffering': 'no',
    });
    res.flushHeaders?.();
    res.write('event: conectado\ndata: {"ok":true}\n\n');

    const cancelar = assinarComercial((msg) => {
      res.write('event: mudou\n');
      res.write('data: ' + JSON.stringify(msg) + '\n\n');
    });
    const ping = setInterval(() => {
      try { res.write(': ping\n\n'); } catch { limpar(); }
    }, 25000);
    function limpar() {
      clearInterval(ping);
      cancelar();
      try { res.end(); } catch { /* já fechado */ }
    }
    req.on('close', limpar);
    req.on('error', limpar);
  } catch (err) { next(err); }
}
