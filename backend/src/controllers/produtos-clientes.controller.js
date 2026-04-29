import { z } from 'zod';
import { query } from '../config/database.js';
import { NaoEncontradoError, AppError } from '../utils/errors.js';
import { registrarAcao } from '../utils/audit.js';

/**
 * Clientes nominais de produto — Sprint 16.
 *
 * Lista nominal pra aparecer na tela de detalhe. Permite admin cadastrar
 * cliente por cliente, ou (Fase B) ser populado automaticamente pelo sync.
 */

const dataIso = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Data deve estar em YYYY-MM-DD');
const statuses = ['trial', 'ativo', 'pausado', 'cancelado', 'inadimplente'];

const criarSchema = z.object({
  nome: z.string().min(1).max(255),
  documento: z.string().max(20).optional().nullable(),
  email: z.string().email().max(255).optional().nullable().or(z.literal('')),
  telefone: z.string().max(50).optional().nullable(),
  plano: z.string().max(100).optional().nullable(),
  valor_mensal: z.coerce.number().min(0).optional().nullable(),
  data_inicio: dataIso.optional().nullable(),
  data_fim: dataIso.optional().nullable(),
  status: z.enum(statuses).default('ativo'),
  origem: z.string().max(100).optional().nullable(),
  observacao: z.string().max(2000).optional().nullable(),
  externo_id: z.string().max(100).optional().nullable(),
});

const atualizarSchema = criarSchema.partial();

function tratarVazios(d) {
  // Email "" → null pra evitar UNIQUE constraint problems no futuro
  const r = { ...d };
  if (r.email === '') r.email = null;
  return r;
}

/**
 * GET /api/produtos/:id/clientes
 *
 * Aceita ?status=ativo|trial|pausado|cancelado|inadimplente
 * E ?busca= pra filtrar por nome/email/documento (substring case-insensitive)
 */
export async function listar(req, res, next) {
  try {
    const partes = ['produto_id = $1'];
    const params = [req.params.id];

    if (req.query.status && statuses.includes(req.query.status)) {
      params.push(req.query.status);
      partes.push(`status = $${params.length}`);
    }

    if (req.query.busca) {
      params.push(`%${req.query.busca}%`);
      const i = params.length;
      partes.push(`(
        nome ILIKE $${i}
        OR email ILIKE $${i}
        OR documento ILIKE $${i}
      )`);
    }

    const { rows } = await query(
      `SELECT * FROM produtos_clientes
        WHERE ${partes.join(' AND ')}
        ORDER BY status = 'ativo' DESC, nome
        LIMIT 500`,
      params,
    );
    res.json(rows);
  } catch (err) { next(err); }
}

/**
 * POST /api/produtos/:id/clientes (admin)
 */
export async function criar(req, res, next) {
  try {
    const d = tratarVazios(criarSchema.parse(req.body));

    const p = await query(`SELECT id FROM produtos WHERE id = $1`, [req.params.id]);
    if (!p.rows[0]) throw new NaoEncontradoError('Produto não encontrado');

    if (d.data_fim && d.data_inicio && d.data_fim < d.data_inicio) {
      throw new AppError('Data fim não pode ser anterior à data início.', 400);
    }

    const { rows } = await query(
      `INSERT INTO produtos_clientes (
         produto_id, nome, documento, email, telefone,
         plano, valor_mensal, data_inicio, data_fim, status,
         origem, observacao, externo_id
       ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
       RETURNING *`,
      [
        req.params.id,
        d.nome.trim(),
        d.documento?.trim() || null,
        d.email?.trim() || null,
        d.telefone?.trim() || null,
        d.plano?.trim() || null,
        d.valor_mensal ?? null,
        d.data_inicio || null,
        d.data_fim || null,
        d.status,
        d.origem?.trim() || null,
        d.observacao?.trim() || null,
        d.externo_id?.trim() || null,
      ],
    );

    registrarAcao({
      acao: 'produto.cliente.criou',
      pessoa_acesso_id: req.pessoa.id,
      detalhes: { produto_id: req.params.id, cliente_id: rows[0].id, nome: d.nome },
      req,
    });

    res.status(201).json(rows[0]);
  } catch (err) { next(err); }
}

/**
 * PUT /api/produtos/:id/clientes/:clienteId (admin)
 */
export async function atualizar(req, res, next) {
  try {
    const d = tratarVazios(atualizarSchema.parse(req.body));

    const sets = [];
    const params = [];
    for (const [k, v] of Object.entries(d)) {
      if (v === undefined) continue;
      params.push(typeof v === 'string' ? v.trim() || null : v);
      sets.push(`${k} = $${params.length}`);
    }

    if (sets.length === 0) {
      const r = await query(
        `SELECT * FROM produtos_clientes WHERE id = $1 AND produto_id = $2`,
        [req.params.clienteId, req.params.id],
      );
      if (!r.rows[0]) throw new NaoEncontradoError('Cliente não encontrado');
      return res.json(r.rows[0]);
    }

    sets.push(`atualizado_em = NOW()`);
    params.push(req.params.clienteId, req.params.id);

    const { rows } = await query(
      `UPDATE produtos_clientes SET ${sets.join(', ')}
        WHERE id = $${params.length - 1} AND produto_id = $${params.length}
        RETURNING *`,
      params,
    );
    if (!rows[0]) throw new NaoEncontradoError('Cliente não encontrado');

    registrarAcao({
      acao: 'produto.cliente.editou',
      pessoa_acesso_id: req.pessoa.id,
      detalhes: { produto_id: req.params.id, cliente_id: req.params.clienteId, campos: Object.keys(d) },
      req,
    });

    res.json(rows[0]);
  } catch (err) { next(err); }
}

/**
 * DELETE /api/produtos/:id/clientes/:clienteId (admin)
 */
export async function excluir(req, res, next) {
  try {
    const { rowCount } = await query(
      `DELETE FROM produtos_clientes WHERE id = $1 AND produto_id = $2`,
      [req.params.clienteId, req.params.id],
    );
    if (rowCount === 0) throw new NaoEncontradoError('Cliente não encontrado');

    registrarAcao({
      acao: 'produto.cliente.excluiu',
      pessoa_acesso_id: req.pessoa.id,
      detalhes: { produto_id: req.params.id, cliente_id: req.params.clienteId },
      req,
    });

    res.status(204).send();
  } catch (err) { next(err); }
}
