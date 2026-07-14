import { verificarToken } from '../utils/jwt.js';
import { query } from '../config/database.js';
import { podeVerQuadro } from './quadros.controller.js';
import { assinarQuadro } from '../services/realtime.service.js';

/**
 * Sprint 38.1 — Endpoint SSE do quadro.
 *
 * GET /api/quadros/:id/stream?token=JWT
 *
 * Por que o token vai na QUERY e não no header: o EventSource do browser
 * não permite cabeçalhos customizados. É o padrão para SSE autenticado.
 * Contrapartida: a URL pode aparecer em logs de proxy — por isso o stream
 * não carrega dado nenhum, só avisos "mudou". Mesmo vazando a URL, não
 * vaza conteúdo.
 *
 * Esta rota é registrada FORA do `router.use(autenticar)` (que exige header
 * Bearer), então faz a própria autenticação aqui.
 */
export async function streamQuadro(req, res, next) {
  try {
    const token = req.query.token;
    if (!token) {
      return res.status(401).json({ erro: 'Token não fornecido', codigo: 'sem_token' });
    }

    let payload;
    try {
      payload = verificarToken(token);
    } catch {
      return res.status(401).json({ erro: 'Token inválido ou expirado', codigo: 'token_invalido' });
    }

    const { rows } = await query(
      `SELECT id, administrador, ativo FROM pessoas_acesso WHERE id = $1`,
      [payload.sub],
    );
    const pessoa = rows[0];
    if (!pessoa || !pessoa.ativo) {
      return res.status(401).json({ erro: 'Usuário inexistente ou inativo', codigo: 'sem_usuario' });
    }

    const quadroId = req.params.id;
    const { pode } = await podeVerQuadro(pessoa.id, !!pessoa.administrador, quadroId);
    if (!pode) {
      return res.status(403).json({ erro: 'Sem acesso a este quadro', codigo: 'sem_acesso' });
    }

    // ---- Abre o canal SSE -------------------------------------------------
    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
      // Desliga o buffer do proxy do Railway/Nginx — sem isso os eventos
      // ficam presos até o buffer encher.
      'X-Accel-Buffering': 'no',
    });
    res.flushHeaders?.();

    // Evento inicial: confirma que o canal está vivo.
    res.write('event: conectado\n');
    res.write('data: {"ok":true}\n\n');

    // Assina o barramento. Cada mudança vira um evento "mudou".
    const cancelar = assinarQuadro(quadroId, (msg) => {
      res.write('event: mudou\n');
      res.write('data: ' + JSON.stringify(msg) + '\n\n');
    });

    // Heartbeat: um comentário SSE (`:`) a cada 25s. Proxies costumam matar
    // conexões ociosas em 30-60s; o ping mantém viva sem gerar evento no
    // cliente. Também é como detectamos que o socket morreu (write falha).
    const ping = setInterval(() => {
      try {
        res.write(': ping\n\n');
      } catch {
        limpar();
      }
    }, 25000);

    function limpar() {
      clearInterval(ping);
      cancelar();
      try { res.end(); } catch { /* já fechado */ }
    }

    // Cleanup quando o cliente desconecta (fecha aba, navega, perde rede).
    req.on('close', limpar);
    req.on('error', limpar);
  } catch (err) {
    next(err);
  }
}
