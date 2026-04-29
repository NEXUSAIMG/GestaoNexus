import { z } from 'zod';
import { query } from '../config/database.js';
import { NaoEncontradoError, AppError } from '../utils/errors.js';
import { registrarAcao } from '../utils/audit.js';

/**
 * Cadastro de sócios — agora representa APENAS a participação societária.
 * Credenciais de login ficam em pessoas_acesso.
 */

const socioSchema = z.object({
  nome: z.string().min(2).max(255),
  tipo_pessoa: z.enum(['fisica', 'juridica']).default('fisica'),
  documento: z.string().max(18).optional().nullable(),
  email: z.string().email().max(255).optional().nullable(),
  telefone: z.string().max(50).optional().nullable(),
  percentual_participacao: z.number().min(0).max(100).default(0),
  data_entrada: z.string().optional().nullable(),
});

const socioUpdateSchema = socioSchema.partial().extend({
  ativo: z.boolean().optional(),
});

function serializar(row) {
  return {
    id: row.id,
    nome: row.nome,
    tipo_pessoa: row.tipo_pessoa,
    documento: row.documento,
    email: row.email,
    telefone: row.telefone,
    percentual_participacao: Number(row.percentual_participacao),
    data_entrada: row.data_entrada,
    ativo: row.ativo,
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

export async function listar(_req, res, next) {
  try {
    const { rows } = await query(
      `SELECT id, nome, tipo_pessoa, documento, email, telefone,
              percentual_participacao, data_entrada, ativo,
              created_at, updated_at
         FROM socios
        ORDER BY ativo DESC, nome ASC`,
    );
    res.json(rows.map(serializar));
  } catch (err) { next(err); }
}

export async function obter(req, res, next) {
  try {
    const { rows } = await query(
      `SELECT id, nome, tipo_pessoa, documento, email, telefone,
              percentual_participacao, data_entrada, ativo,
              created_at, updated_at
         FROM socios WHERE id = $1`,
      [req.params.id],
    );
    if (!rows[0]) throw new NaoEncontradoError('Sócio não encontrado');
    res.json(serializar(rows[0]));
  } catch (err) { next(err); }
}

export async function criar(req, res, next) {
  try {
    const d = socioSchema.parse(req.body);
    const { rows } = await query(
      `INSERT INTO socios
         (nome, tipo_pessoa, documento, email, telefone,
          percentual_participacao, data_entrada)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       RETURNING *`,
      [d.nome, d.tipo_pessoa, d.documento ?? null, d.email ?? null,
       d.telefone ?? null, d.percentual_participacao, d.data_entrada ?? null],
    );

    await registrarAcao({
      pessoa_acesso_id: req.pessoa.id,
      socio_id: null,
      acao: 'socio.criar',
      detalhes: { socio_id: rows[0].id, nome: d.nome },
      req,
    });

    res.status(201).json(serializar(rows[0]));
  } catch (err) { next(err); }
}

export async function atualizar(req, res, next) {
  try {
    const d = socioUpdateSchema.parse(req.body);
    const campos = Object.keys(d);
    if (campos.length === 0) throw new AppError('Nenhum campo para atualizar', 400);

    const sets = campos.map((c, i) => `${c} = $${i + 1}`).join(', ');
    const valores = campos.map((c) => d[c]);
    valores.push(req.params.id);

    const { rows } = await query(
      `UPDATE socios SET ${sets}, updated_at = NOW()
        WHERE id = $${valores.length}
        RETURNING *`,
      valores,
    );
    if (!rows[0]) throw new NaoEncontradoError('Sócio não encontrado');

    await registrarAcao({
      pessoa_acesso_id: req.pessoa.id,
      socio_id: rows[0].id,
      acao: 'socio.atualizar',
      detalhes: { campos: campos },
      req,
    });

    res.json(serializar(rows[0]));
  } catch (err) { next(err); }
}
