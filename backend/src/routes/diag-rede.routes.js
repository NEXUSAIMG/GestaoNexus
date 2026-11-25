import { Router } from 'express';
import { pool } from '../config/database.js';
import { autenticar, exigirAdmin } from '../middleware/auth.middleware.js';

// TEMPORÁRIO (25/11/2026) — diagnóstico de lentidão em respostas grandes.
// Só administrador. Remover assim que a causa for achada.
//
//   GET /api/diag-rede            → mede banco→app (queries de tamanhos conhecidos)
//   GET /api/diag-rede?bytes=N    → devolve N bytes sem banco (app→edge→cliente)
const router = Router();
router.use(autenticar, exigirAdmin);

const agora = () => performance.now();

router.get('/', async (req, res, next) => {
  try {
    const bytes = Math.min(Number(req.query.bytes) || 0, 5_000_000);
    if (bytes) return res.type('text/plain').send('x'.repeat(bytes));

    // Lag do event loop durante os testes: se alto, o Node está bloqueado;
    // se ~0 com tempo alto, o app está só esperando rede.
    let lag = 0;
    let ultimo = agora();
    const iv = setInterval(() => {
      const n = agora();
      lag = Math.max(lag, n - ultimo - 50);
      ultimo = n;
    }, 50);

    const out = { node: process.version, testes: [] };
    const client = await pool.connect();
    try {
      const sock = client.connection?.stream;
      out.socket = {
        tls: !!sock?.encrypted,
        cifra: sock?.getCipher?.()?.name,
        remoto: sock?.remoteAddress?.replace(/\d+$/, 'x'),
        recvHighWaterMark: sock?.readableHighWaterMark,
      };
      out.pg = (await client.query(
        `SELECT version() AS v, (SELECT ssl FROM pg_stat_ssl WHERE pid = pg_backend_pid()) AS ssl`,
      )).rows[0];

      const casos = [
        ['select 1', `SELECT 1`],
        ['100 KB', `SELECT repeat('x', 100000) AS v`],
        ['500 KB', `SELECT repeat('x', 500000) AS v`],
        ['cards 200 linhas', `SELECT c.* FROM cards c WHERE arquivado_em IS NULL LIMIT 200`],
      ];
      for (const [nome, sql] of casos) {
        const cpu0 = process.cpuUsage();
        const t = agora();
        const r = await client.query(sql);
        const cpu = process.cpuUsage(cpu0);
        out.testes.push({
          nome,
          ms: Math.round(agora() - t),
          cpu_ms: Math.round((cpu.user + cpu.system) / 1000),
          bytes: JSON.stringify(r.rows).length,
        });
      }
    } finally {
      client.release();
      clearInterval(iv);
    }
    out.lag_max_event_loop_ms = Math.round(lag);
    res.json(out);
  } catch (err) { next(err); }
});

export default router;
