import { z } from 'zod';
import { query } from '../config/database.js';
import { NaoEncontradoError } from '../utils/errors.js';
import { registrarAcao } from '../utils/audit.js';

/**
 * Roadmap de produto — Sprint 16.
 *
 * Lista de features planejadas/em desenvolvimento/lançadas. Permite
 * vincular a um card existente no /tarefas (continuidade da tarefa real
 * pra entrega real).
 */

const dataIso = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Data deve estar em YYYY-MM-DD');
const statuses = ['planejado', 'em_desenvolvimento', 'em_teste', 'lancado', 'cancelado'];
const prioridades = ['baixa', 'media', 'alta'];

const criarSchema = z.object({
  titulo: z.string().min(2).max(255),
  descricao: z.string().max(5000).optional().nullable(),
  status: z.enum(statuses).default('planejado'),
  prioridade: z.enum(prioridades).default('media'),
  data_prevista: dataIso.optional().nullable(),
  data_lancamento: dataIso.optional().nullable(),
  card_id: z.string().uuid().optional().nullable(),
  ordem: z.number().int().default(0),
});

const atualizarSchema = criarSchema.partial();

/**
 * GET /api/produtos/:id/roadmap
 */
export async function listar(req, res, next) {
  try {
    const { rows } = await query(
      `SELECT r.*,
              p.nome AS criado_por_nome,
              c.titulo AS card_titulo,
              c.quadro_id AS card_quadro_id
         FROM produtos_roadmap r
         LEFT JOIN pessoas_acesso p ON p.id = r.criado_por_id
         LEFT JOIN cards c ON c.id = r.card_id
        WHERE r.produto_id = $1
        ORDER BY
          CASE r.status
            WHEN 'em_desenvolvimento' THEN 1
            WHEN 'em_teste' THEN 2
            WHEN 'planejado' THEN 3
            WHEN 'lancado' THEN 4
            WHEN 'cancelado' THEN 5
          END,
          r.ordem,
          r.criado_em DESC`,
      [req.params.id],
    );
    res.json(rows);
  } catch (err) { next(err); }
}

/**
 * POST /api/produtos/:id/roadmap (admin)
 */
export async function criar(req, res, next) {
  try {
    const d = criarSchema.parse(req.body);

    const p = await query(`SELECT id FROM produtos WHERE id = $1`, [req.params.id]);
    if (!p.rows[0]) throw new NaoEncontradoError('Produto não encontrado');

    const { rows } = await query(
      `INSERT INTO produtos_roadmap (
         produto_id, titulo, descricao,
         status, prioridade,
         data_prevista, data_lancamento,
         card_id, ordem, criado_por_id
       ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
       RETURNING *`,
      [
        req.params.id,
        d.titulo.trim(),
        d.descricao?.trim() || null,
        d.status,
        d.prioridade,
        d.data_prevista || null,
        d.data_lancamento || null,
        d.card_id || null,
        d.ordem,
        req.pessoa.id,
      ],
    );

    registrarAcao({
      acao: 'produto.roadmap.criou',
      pessoa_acesso_id: req.pessoa.id,
      detalhes: { produto_id: req.params.id, item_id: rows[0].id, titulo: d.titulo },
      req,
    });

    res.status(201).json(rows[0]);
  } catch (err) { next(err); }
}

/**
 * PUT /api/produtos/:id/roadmap/:itemId (admin)
 */
export async function atualizar(req, res, next) {
  try {
    const d = atualizarSchema.parse(req.body);

    const sets = [];
    const params = [];
    for (const [k, v] of Object.entries(d)) {
      if (v === undefined) continue;
      params.push(typeof v === 'string' ? v.trim() || null : v);
      sets.push(`${k} = $${params.length}`);
    }

    if (sets.length === 0) {
      const r = await query(
        `SELECT * FROM produtos_roadmap WHERE id = $1 AND produto_id = $2`,
        [req.params.itemId, req.params.id],
      );
      if (!r.rows[0]) throw new NaoEncontradoError('Item não encontrado');
      return res.json(r.rows[0]);
    }

    sets.push(`atualizado_em = NOW()`);
    params.push(req.params.itemId, req.params.id);

    const { rows } = await query(
      `UPDATE produtos_roadmap SET ${sets.join(', ')}
        WHERE id = $${params.length - 1} AND produto_id = $${params.length}
        RETURNING *`,
      params,
    );
    if (!rows[0]) throw new NaoEncontradoError('Item não encontrado');

    registrarAcao({
      acao: 'produto.roadmap.editou',
      pessoa_acesso_id: req.pessoa.id,
      detalhes: { produto_id: req.params.id, item_id: req.params.itemId, campos: Object.keys(d) },
      req,
    });

    res.json(rows[0]);
  } catch (err) { next(err); }
}

/**
 * DELETE /api/produtos/:id/roadmap/:itemId (admin)
 */
export async function excluir(req, res, next) {
  try {
    const { rowCount } = await query(
      `DELETE FROM produtos_roadmap WHERE id = $1 AND produto_id = $2`,
      [req.params.itemId, req.params.id],
    );
    if (rowCount === 0) throw new NaoEncontradoError('Item não encontrado');

    registrarAcao({
      acao: 'produto.roadmap.excluiu',
      pessoa_acesso_id: req.pessoa.id,
      detalhes: { produto_id: req.params.id, item_id: req.params.itemId },
      req,
    });

    res.status(204).send();
  } catch (err) { next(err); }
}
