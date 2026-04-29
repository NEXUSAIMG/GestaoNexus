import { z } from 'zod';
import { query } from '../config/database.js';
import { NaoEncontradoError, AppError } from '../utils/errors.js';
import { registrarAcao } from '../utils/audit.js';

/**
 * Categorias de despesa — Sprint 3.
 *
 * Usadas para classificar as contas a pagar. Simples: nome, cor, ordem, ativo.
 * A migration 004 já cria um conjunto padrão para não começar vazio.
 */

const CORES_PERMITIDAS = [
  'slate', 'red', 'orange', 'amber', 'yellow',
  'lime', 'emerald', 'teal', 'cyan', 'blue',
  'indigo', 'violet', 'fuchsia', 'pink', 'rose',
];

const criarSchema = z.object({
  nome: z.string().min(2).max(100),
  cor: z.enum(CORES_PERMITIDAS).default('slate'),
  descricao: z.string().max(500).optional().nullable(),
  ordem: z.number().int().min(0).max(999).optional(),
});

const atualizarSchema = criarSchema.partial().extend({
  ativo: z.boolean().optional(),
});

function serializar(r) {
  return {
    id: r.id,
    nome: r.nome,
    cor: r.cor,
    descricao: r.descricao,
    ordem: r.ordem,
    ativo: r.ativo,
    qtd_contas: r.qtd_contas != null ? Number(r.qtd_contas) : undefined,
    created_at: r.created_at,
    updated_at: r.updated_at,
  };
}

/**
 * GET /api/categorias-despesa
 *
 * Inclui a contagem de contas já usando a categoria (serve pra avisar
 * o admin antes de inativar: "essa categoria é usada em N contas").
 */
export async function listar(_req, res, next) {
  try {
    const { rows } = await query(
      `SELECT c.id, c.nome, c.cor, c.descricao, c.ordem, c.ativo,
              c.created_at, c.updated_at,
              COUNT(cp.id) FILTER (WHERE cp.status <> 'cancelada') AS qtd_contas
         FROM categorias_despesa c
    LEFT JOIN contas_pagar cp ON cp.categoria_id = c.id
     GROUP BY c.id
     ORDER BY c.ativo DESC, c.ordem, c.nome`,
    );
    res.json(rows.map(serializar));
  } catch (err) { next(err); }
}

export async function obter(req, res, next) {
  try {
    const { rows } = await query(
      `SELECT * FROM categorias_despesa WHERE id = $1`,
      [req.params.id],
    );
    if (!rows[0]) throw new NaoEncontradoError('Categoria não encontrada');
    res.json(serializar(rows[0]));
  } catch (err) { next(err); }
}

export async function criar(req, res, next) {
  try {
    const d = criarSchema.parse(req.body);

    // Se ordem não foi informada, coloca no final.
    let ordem = d.ordem;
    if (ordem === undefined) {
      const { rows } = await query(
        `SELECT COALESCE(MAX(ordem), 0) + 10 AS prox FROM categorias_despesa`,
      );
      ordem = rows[0].prox;
    }

    const { rows } = await query(
      `INSERT INTO categorias_despesa (nome, cor, descricao, ordem)
       VALUES ($1, $2, $3, $4)
       RETURNING *`,
      [d.nome.trim(), d.cor, d.descricao ?? null, ordem],
    );

    await registrarAcao({
      pessoa_acesso_id: req.pessoa.id,
      acao: 'categoria_despesa.criar',
      detalhes: { categoria_id: rows[0].id, nome: d.nome },
      req,
    });

    res.status(201).json(serializar(rows[0]));
  } catch (err) { next(err); }
}

export async function atualizar(req, res, next) {
  try {
    const d = atualizarSchema.parse(req.body);
    const campos = Object.keys(d);
    if (campos.length === 0) throw new AppError('Nenhum campo para atualizar', 400);

    const sets = campos.map((c, i) => `${c} = $${i + 1}`).join(', ');
    const valores = campos.map((c) => (typeof d[c] === 'string' ? d[c].trim() : d[c]));
    valores.push(req.params.id);

    const { rows } = await query(
      `UPDATE categorias_despesa
          SET ${sets}, updated_at = NOW()
        WHERE id = $${valores.length}
        RETURNING *`,
      valores,
    );
    if (!rows[0]) throw new NaoEncontradoError('Categoria não encontrada');

    await registrarAcao({
      pessoa_acesso_id: req.pessoa.id,
      acao: 'categoria_despesa.atualizar',
      detalhes: { categoria_id: rows[0].id, campos },
      req,
    });

    res.json(serializar(rows[0]));
  } catch (err) { next(err); }
}
