import { z } from 'zod';
import { query } from '../config/database.js';
import { NaoEncontradoError, AppError } from '../utils/errors.js';
import { registrarAcao } from '../utils/audit.js';

/**
 * Métricas mensais de produtos — Sprint 16.
 *
 * Uma linha por produto x mês. UPSERT: salvar o mesmo mês duas vezes
 * sobrescreve. Mês sempre é o primeiro dia (constraint no banco).
 */

const dataMes = z.string().regex(/^\d{4}-\d{2}-01$/, 'Mês deve ser YYYY-MM-01 (primeiro dia)');
const numero = z.coerce.number().min(0).max(99_999_999);
const inteiro = z.coerce.number().int().min(0).max(9_999_999);

const upsertSchema = z.object({
  mes: dataMes,
  mrr: numero.default(0),
  receita_total: numero.default(0),
  clientes_ativos: inteiro.default(0),
  novos_clientes: inteiro.default(0),
  churn_clientes: inteiro.default(0),
  churn_mrr: numero.default(0),
  tickets_abertos: inteiro.default(0),
  tickets_resolvidos: inteiro.default(0),
  visitantes_landing: inteiro.default(0),
  trials_iniciados: inteiro.default(0),
  conversoes: inteiro.default(0),
  observacao: z.string().max(2000).optional().nullable(),
});

/**
 * GET /api/produtos/:id/metricas
 *
 * Lista todas as métricas mensais do produto, ordem decrescente.
 * Aceita ?desde=YYYY-MM-DD pra limitar o histórico.
 */
export async function listar(req, res, next) {
  try {
    const partes = ['produto_id = $1'];
    const params = [req.params.id];

    if (req.query.desde) {
      params.push(req.query.desde);
      partes.push(`mes >= $${params.length}`);
    }

    const { rows } = await query(
      `SELECT * FROM produtos_metricas_mensais
        WHERE ${partes.join(' AND ')}
        ORDER BY mes DESC`,
      params,
    );
    res.json(rows);
  } catch (err) { next(err); }
}

/**
 * POST /api/produtos/:id/metricas (admin)
 *
 * Upsert por (produto, mês). Salvar o mesmo mês de novo sobrescreve.
 */
export async function upsert(req, res, next) {
  try {
    const d = upsertSchema.parse(req.body);

    // Confere produto existe
    const p = await query(`SELECT id FROM produtos WHERE id = $1`, [req.params.id]);
    if (!p.rows[0]) throw new NaoEncontradoError('Produto não encontrado');

    const { rows } = await query(
      `INSERT INTO produtos_metricas_mensais (
         produto_id, mes, mrr, receita_total,
         clientes_ativos, novos_clientes, churn_clientes, churn_mrr,
         tickets_abertos, tickets_resolvidos,
         visitantes_landing, trials_iniciados, conversoes,
         observacao
       ) VALUES (
         $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14
       )
       ON CONFLICT (produto_id, mes) DO UPDATE SET
         mrr = EXCLUDED.mrr,
         receita_total = EXCLUDED.receita_total,
         clientes_ativos = EXCLUDED.clientes_ativos,
         novos_clientes = EXCLUDED.novos_clientes,
         churn_clientes = EXCLUDED.churn_clientes,
         churn_mrr = EXCLUDED.churn_mrr,
         tickets_abertos = EXCLUDED.tickets_abertos,
         tickets_resolvidos = EXCLUDED.tickets_resolvidos,
         visitantes_landing = EXCLUDED.visitantes_landing,
         trials_iniciados = EXCLUDED.trials_iniciados,
         conversoes = EXCLUDED.conversoes,
         observacao = EXCLUDED.observacao,
         atualizado_em = NOW()
       RETURNING *`,
      [
        req.params.id, d.mes,
        d.mrr, d.receita_total,
        d.clientes_ativos, d.novos_clientes, d.churn_clientes, d.churn_mrr,
        d.tickets_abertos, d.tickets_resolvidos,
        d.visitantes_landing, d.trials_iniciados, d.conversoes,
        d.observacao || null,
      ],
    );

    registrarAcao({
      acao: 'produto.metrica.upsert',
      pessoa_acesso_id: req.pessoa.id,
      detalhes: { produto_id: req.params.id, mes: d.mes },
      req,
    });

    res.status(201).json(rows[0]);
  } catch (err) { next(err); }
}

/**
 * DELETE /api/produtos/:id/metricas/:metricaId (admin)
 */
export async function excluir(req, res, next) {
  try {
    const { rowCount } = await query(
      `DELETE FROM produtos_metricas_mensais
        WHERE id = $1 AND produto_id = $2`,
      [req.params.metricaId, req.params.id],
    );
    if (rowCount === 0) throw new NaoEncontradoError('Métrica não encontrada');

    registrarAcao({
      acao: 'produto.metrica.excluiu',
      pessoa_acesso_id: req.pessoa.id,
      detalhes: { produto_id: req.params.id, metrica_id: req.params.metricaId },
      req,
    });

    res.status(204).send();
  } catch (err) { next(err); }
}
