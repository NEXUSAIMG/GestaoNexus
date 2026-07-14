import { z } from 'zod';
import { query } from '../config/database.js';
import { NaoAutorizadoError } from '../utils/errors.js';
import { podeVerQuadro } from './quadros.controller.js';
import { tirarSnapshotDiario, percentil } from '../services/metricas.service.js';

/**
 * Sprint 37 — Métricas de fluxo do quadro.
 *
 * Um endpoint só (`GET /quadros/:id/metricas`) que devolve tudo. São
 * consultas pequenas e a tela mostra todas juntas — quebrar em 5 requests
 * só adicionaria latência e chance de estado inconsistente entre gráficos.
 *
 * Filosofia dos números aqui:
 *   - Percentil, não média. Cycle time tem cauda longa; a média mente.
 *   - Aging é o número mais acionável do conjunto: card parado há muito
 *     tempo é dinheiro parado, e ninguém percebe olhando o board.
 *   - Nada é inventado: se não há dado, devolvemos vazio e a UI diz isso.
 */

const paramsSchema = z.object({
  dias: z.coerce.number().int().min(7).max(365).optional().default(90),
});

export async function metricasDoQuadro(req, res, next) {
  try {
    const isAdmin = !!req.pessoa?.administrador;
    const { pode } = await podeVerQuadro(req.pessoa.id, isAdmin, req.params.id);
    if (!pode) throw new NaoAutorizadoError('Sem acesso a este quadro.');

    const { dias } = paramsSchema.parse(req.query);
    const quadroId = req.params.id;

    const [entregues, aging, throughput, cfd, wip] = await Promise.all([
      // -------------------------------------------------------------------
      // 1. Cards entregues no período — base de cycle time e lead time
      // -------------------------------------------------------------------
      query(
        `SELECT c.id, c.titulo, c.concluido_em,
                EXTRACT(EPOCH FROM (c.concluido_em - COALESCE(c.iniciado_em, c.criado_em))) / 86400.0 AS cycle_dias,
                EXTRACT(EPOCH FROM (c.concluido_em - c.criado_em)) / 86400.0 AS lead_dias
           FROM cards c
          WHERE c.quadro_id = $1
            AND c.concluido_em IS NOT NULL
            AND c.concluido_em >= NOW() - ($2 || ' days')::interval
          ORDER BY c.concluido_em DESC`,
        [quadroId, String(dias)],
      ),

      // -------------------------------------------------------------------
      // 2. Aging WIP — cards vivos fora do backlog, por tempo parado
      // -------------------------------------------------------------------
      query(
        `SELECT c.id, c.titulo, c.prioridade, col.nome AS coluna_nome, col.id AS coluna_id,
                GREATEST(0, EXTRACT(EPOCH FROM (NOW() - COALESCE(c.coluna_desde, c.criado_em))) / 86400.0) AS dias_parado,
                COALESCE(
                  (SELECT json_agg(json_build_object('id', pa.id, 'nome', pa.nome) ORDER BY cr.ordem)
                     FROM cards_responsaveis cr
                     JOIN pessoas_acesso pa ON pa.id = cr.pessoa_id
                    WHERE cr.card_id = c.id),
                  '[]'::json
                ) AS responsaveis
           FROM cards c
           JOIN colunas col ON col.id = c.coluna_id
          WHERE c.quadro_id = $1
            AND c.arquivado_em IS NULL
            AND col.arquivada_em IS NULL
            AND col.tipo = 'em_andamento'
          ORDER BY dias_parado DESC
          LIMIT 50`,
        [quadroId],
      ),

      // -------------------------------------------------------------------
      // 3. Throughput semanal (entregas por semana)
      // -------------------------------------------------------------------
      query(
        `SELECT to_char(date_trunc('week', concluido_em), 'YYYY-MM-DD') AS semana,
                COUNT(*)::int AS entregues
           FROM cards
          WHERE quadro_id = $1
            AND concluido_em IS NOT NULL
            AND concluido_em >= NOW() - ($2 || ' days')::interval
          GROUP BY 1
          ORDER BY 1`,
        [quadroId, String(dias)],
      ),

      // -------------------------------------------------------------------
      // 4. CFD — a partir do snapshot diário
      // -------------------------------------------------------------------
      query(
        `SELECT to_char(s.data, 'YYYY-MM-DD') AS data,
                s.coluna_id,
                col.nome AS coluna_nome,
                col.ordem,
                COUNT(*)::int AS n
           FROM cards_snapshot_diario s
           JOIN colunas col ON col.id = s.coluna_id
          WHERE s.quadro_id = $1
            AND s.data >= CURRENT_DATE - ($2 || ' days')::interval
          GROUP BY 1, 2, 3, 4
          ORDER BY 1, col.ordem`,
        [quadroId, String(dias)],
      ),

      // -------------------------------------------------------------------
      // 5. WIP atual por tipo de coluna
      // -------------------------------------------------------------------
      query(
        `SELECT col.tipo, COUNT(*)::int AS n
           FROM cards c
           JOIN colunas col ON col.id = c.coluna_id
          WHERE c.quadro_id = $1
            AND c.arquivado_em IS NULL
            AND col.arquivada_em IS NULL
          GROUP BY 1`,
        [quadroId],
      ),
    ]);

    // Percentis: calculados em JS a partir da lista ordenada. Postgres tem
    // percentile_cont, mas trazer a lista permite mostrar a distribuição
    // (histograma) na mesma passada, sem uma segunda query.
    const cycles = entregues.rows
      .map((r) => Number(r.cycle_dias))
      .filter((n) => Number.isFinite(n) && n >= 0)
      .sort((a, b) => a - b);
    const leads = entregues.rows
      .map((r) => Number(r.lead_dias))
      .filter((n) => Number.isFinite(n) && n >= 0)
      .sort((a, b) => a - b);

    const arred = (n) => (n == null ? null : Math.round(n * 10) / 10);

    const wipMap = Object.fromEntries(wip.rows.map((r) => [r.tipo, r.n]));

    res.json({
      periodo_dias: dias,

      resumo: {
        entregues: entregues.rows.length,
        cycle_p50: arred(percentil(cycles, 50)),
        cycle_p85: arred(percentil(cycles, 85)),
        lead_p50: arred(percentil(leads, 50)),
        lead_p85: arred(percentil(leads, 85)),
        wip_backlog: wipMap.backlog || 0,
        wip_andamento: wipMap.em_andamento || 0,
        wip_concluido: wipMap.concluida || 0,
        // Vazão média por semana no período
        throughput_semanal: throughput.rows.length
          ? arred(throughput.rows.reduce((s, r) => s + r.entregues, 0) / throughput.rows.length)
          : 0,
      },

      // Distribuição pra histograma (1 ponto por card entregue)
      cycle_times: entregues.rows.map((r) => ({
        id: r.id,
        titulo: r.titulo,
        concluido_em: r.concluido_em,
        cycle_dias: arred(Number(r.cycle_dias)),
        lead_dias: arred(Number(r.lead_dias)),
      })),

      aging: aging.rows.map((r) => ({
        ...r,
        dias_parado: arred(Number(r.dias_parado)),
        responsaveis: r.responsaveis || [],
      })),

      throughput: throughput.rows,

      cfd: cfd.rows,

      // Diz honestamente se o CFD ainda não tem histórico suficiente.
      cfd_dias: new Set(cfd.rows.map((r) => r.data)).size,
    });
  } catch (err) { next(err); }
}

/**
 * POST /api/quadros/:id/metricas/snapshot
 *
 * Dispara o snapshot manualmente (só admin). Existe por dois motivos:
 * testar o job sem esperar as 23:50, e semear o primeiro ponto do CFD no
 * dia em que a Sprint 37 sobe — senão o gráfico nasce vazio.
 */
export async function forcarSnapshot(req, res, next) {
  try {
    if (!req.pessoa?.administrador) {
      throw new NaoAutorizadoError('Só administradores podem forçar o snapshot.');
    }
    const n = await tirarSnapshotDiario();
    res.json({ ok: true, cards_fotografados: n });
  } catch (err) { next(err); }
}
