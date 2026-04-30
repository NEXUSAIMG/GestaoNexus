import { z } from 'zod';
import { query } from '../config/database.js';
import { NaoEncontradoError, AppError } from '../utils/errors.js';
import { registrarAcao } from '../utils/audit.js';

/**
 * Categorias de inventário — Sprint 17.
 *
 * Categorias livres pelo admin. Vêm pré-populadas pelo seed da migration
 * (Mobília, TI, Eletrônicos, Veículos, Suprimentos, Outros) mas o admin
 * pode arquivar ou criar novas.
 */

const cores = [
  'slate', 'red', 'orange', 'amber', 'yellow', 'lime',
  'emerald', 'teal', 'cyan', 'blue', 'indigo', 'violet',
  'fuchsia', 'pink', 'rose',
];

const criarSchema = z.object({
  nome: z.string().min(1).max(100),
  slug: z.string().min(1).max(80).regex(/^[a-z0-9-]+$/, 'Slug aceita só letras minúsculas, números e hífens'),
  cor: z.enum(cores).default('slate'),
  icone: z.string().max(50).optional().nullable(),
  ordem: z.coerce.number().int().min(0).default(0),
});

const atualizarSchema = criarSchema.partial();

/**
 * GET /api/inventario/categorias
 *
 * Lista categorias não-arquivadas com a quantidade de itens em cada.
 * Aceita ?incluir_arquivadas=true.
 */
export async function listar(req, res, next) {
  try {
    const incluirArquivadas = req.query.incluir_arquivadas === 'true';
    const where = incluirArquivadas ? '' : 'WHERE c.arquivada_em IS NULL';

    const { rows } = await query(
      `SELECT c.*,
              COUNT(i.id)::int AS qtd_itens
         FROM inventario_categorias c
         LEFT JOIN inventario_itens i ON i.categoria_id = c.id
         ${where}
        GROUP BY c.id
        ORDER BY c.arquivada_em IS NOT NULL, c.ordem, c.nome`,
    );

    res.json(rows);
  } catch (err) { next(err); }
}

/**
 * POST /api/inventario/categorias (admin)
 */
export async function criar(req, res, next) {
  try {
    const d = criarSchema.parse(req.body);

    try {
      const { rows } = await query(
        `INSERT INTO inventario_categorias (nome, slug, cor, icone, ordem)
         VALUES ($1, $2, $3, $4, $5)
         RETURNING *`,
        [d.nome.trim(), d.slug.trim(), d.cor, d.icone || null, d.ordem],
      );

      registrarAcao({
        acao: 'inventario.categoria.criou',
        pessoa_acesso_id: req.pessoa.id,
        detalhes: { categoria_id: rows[0].id, nome: d.nome },
        req,
      });

      res.status(201).json(rows[0]);
    } catch (err) {
      if (err.code === '23505') {
        throw new AppError('Já existe categoria com este nome ou slug.', 400);
      }
      throw err;
    }
  } catch (err) { next(err); }
}

/**
 * PUT /api/inventario/categorias/:id (admin)
 */
export async function atualizar(req, res, next) {
  try {
    const d = atualizarSchema.parse(req.body);

    const sets = [];
    const params = [];
    for (const [k, v] of Object.entries(d)) {
      if (v === undefined) continue;
      params.push(typeof v === 'string' ? v.trim() : v);
      sets.push(`${k} = $${params.length}`);
    }

    if (sets.length === 0) {
      const r = await query(`SELECT * FROM inventario_categorias WHERE id = $1`, [req.params.id]);
      if (!r.rows[0]) throw new NaoEncontradoError('Categoria não encontrada');
      return res.json(r.rows[0]);
    }

    sets.push('atualizado_em = NOW()');
    params.push(req.params.id);

    try {
      const { rows } = await query(
        `UPDATE inventario_categorias SET ${sets.join(', ')}
          WHERE id = $${params.length}
        RETURNING *`,
        params,
      );
      if (!rows[0]) throw new NaoEncontradoError('Categoria não encontrada');

      registrarAcao({
        acao: 'inventario.categoria.editou',
        pessoa_acesso_id: req.pessoa.id,
        detalhes: { categoria_id: req.params.id, campos: Object.keys(d) },
        req,
      });

      res.json(rows[0]);
    } catch (err) {
      if (err.code === '23505') {
        throw new AppError('Já existe outra categoria com este nome ou slug.', 400);
      }
      throw err;
    }
  } catch (err) { next(err); }
}

/**
 * POST /api/inventario/categorias/:id/arquivar (admin)
 *
 * Não permite arquivar categoria que ainda tem itens (segurança contra
 * sumir referência). Admin deve mover itens primeiro.
 */
export async function arquivar(req, res, next) {
  try {
    const { rows: itens } = await query(
      `SELECT COUNT(*)::int AS qtd FROM inventario_itens WHERE categoria_id = $1`,
      [req.params.id],
    );
    if (itens[0].qtd > 0) {
      throw new AppError(
        `Não dá pra arquivar: a categoria ainda tem ${itens[0].qtd} item(s). ` +
        'Mova-os pra outra categoria primeiro.',
        400,
      );
    }

    const { rowCount } = await query(
      `UPDATE inventario_categorias SET arquivada_em = NOW()
        WHERE id = $1 AND arquivada_em IS NULL`,
      [req.params.id],
    );
    if (rowCount === 0) throw new AppError('Categoria não encontrada ou já arquivada', 400);

    registrarAcao({
      acao: 'inventario.categoria.arquivou',
      pessoa_acesso_id: req.pessoa.id,
      detalhes: { categoria_id: req.params.id },
      req,
    });

    res.status(204).send();
  } catch (err) { next(err); }
}

/**
 * POST /api/inventario/categorias/:id/desarquivar (admin)
 */
export async function desarquivar(req, res, next) {
  try {
    const { rowCount } = await query(
      `UPDATE inventario_categorias SET arquivada_em = NULL
        WHERE id = $1 AND arquivada_em IS NOT NULL`,
      [req.params.id],
    );
    if (rowCount === 0) throw new AppError('Categoria não encontrada ou não arquivada', 400);

    res.status(204).send();
  } catch (err) { next(err); }
}
