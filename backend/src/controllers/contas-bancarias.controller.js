import { z } from 'zod';
import { query } from '../config/database.js';
import { NaoEncontradoError, AppError } from '../utils/errors.js';
import { registrarAcao } from '../utils/audit.js';

/**
 * CRUD de contas bancárias.
 *
 * Na Sprint 2, o saldo é digitado manualmente pela equipe. A ideia é que
 * alguém marque, no fim do expediente ou de manhã, o saldo real daquela
 * conta. O campo `saldo_atualizado_em` deixa explícito há quanto tempo
 * o número está fresco.
 *
 * Open Finance / conciliação automática ficam pra depois.
 */

const contaSchema = z.object({
  apelido: z.string().min(2).max(100),
  banco: z.string().max(100).optional().nullable(),
  agencia: z.string().max(20).optional().nullable(),
  conta: z.string().max(30).optional().nullable(),
  tipo: z.enum(['corrente', 'poupanca', 'investimento', 'caixa']).default('corrente'),
  // Aceita number direto OU string "vinda do <input type=number>". Z.coerce.number
  // converte ambos. Se vier null/undefined/string vazia, usa 0.
  saldo_atual: z.coerce.number().default(0).nullable().transform((v) => v ?? 0),
  ordem: z.coerce.number().int().min(0).max(999).default(0).nullable().transform((v) => v ?? 0),
  observacoes: z.string().max(2000).optional().nullable(),
});

const contaUpdateSchema = contaSchema.partial().extend({
  ativo: z.boolean().optional(),
});

const saldoSchema = z.object({
  saldo_atual: z.coerce.number(),
});

function serializar(row, saldoAtualizadoPor = null) {
  return {
    id: row.id,
    apelido: row.apelido,
    banco: row.banco,
    agencia: row.agencia,
    conta: row.conta,
    tipo: row.tipo,
    saldo_atual: Number(row.saldo_atual),
    saldo_atualizado_em: row.saldo_atualizado_em,
    saldo_atualizado_por_id: row.saldo_atualizado_por,
    saldo_atualizado_por_nome: saldoAtualizadoPor ?? row.saldo_atualizado_por_nome ?? null,
    ativo: row.ativo,
    ordem: row.ordem,
    observacoes: row.observacoes,
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

export async function listar(_req, res, next) {
  try {
    const { rows } = await query(
      `SELECT c.id, c.apelido, c.banco, c.agencia, c.conta, c.tipo,
              c.saldo_atual, c.saldo_atualizado_em, c.saldo_atualizado_por,
              c.ativo, c.ordem, c.observacoes, c.created_at, c.updated_at,
              p.nome AS saldo_atualizado_por_nome
         FROM contas_bancarias c
    LEFT JOIN pessoas_acesso p ON p.id = c.saldo_atualizado_por
     ORDER BY c.ativo DESC, c.ordem, c.apelido`,
    );
    res.json(rows.map((r) => serializar(r)));
  } catch (err) { next(err); }
}

export async function obter(req, res, next) {
  try {
    const { rows } = await query(
      `SELECT c.*, p.nome AS saldo_atualizado_por_nome
         FROM contas_bancarias c
    LEFT JOIN pessoas_acesso p ON p.id = c.saldo_atualizado_por
        WHERE c.id = $1`,
      [req.params.id],
    );
    if (!rows[0]) throw new NaoEncontradoError('Conta bancária não encontrada');
    res.json(serializar(rows[0]));
  } catch (err) { next(err); }
}

export async function criar(req, res, next) {
  try {
    const d = contaSchema.parse(req.body);
    const { rows } = await query(
      `INSERT INTO contas_bancarias
         (apelido, banco, agencia, conta, tipo,
          saldo_atual, saldo_atualizado_em, saldo_atualizado_por,
          ordem, observacoes)
       VALUES ($1, $2, $3, $4, $5, $6,
               CASE WHEN $6 != 0 THEN NOW() ELSE NULL END,
               CASE WHEN $6 != 0 THEN $7 ELSE NULL END,
               $8, $9)
       RETURNING *`,
      [
        d.apelido, d.banco ?? null, d.agencia ?? null, d.conta ?? null, d.tipo,
        d.saldo_atual, req.pessoa.id, d.ordem, d.observacoes ?? null,
      ],
    );

    await registrarAcao({
      pessoa_acesso_id: req.pessoa.id,
      acao: 'conta_bancaria.criar',
      detalhes: { conta_id: rows[0].id, apelido: d.apelido },
      req,
    });

    res.status(201).json(serializar(rows[0]));
  } catch (err) { next(err); }
}

export async function atualizar(req, res, next) {
  try {
    const d = contaUpdateSchema.parse(req.body);
    // saldo_atual não pode ser alterado por este endpoint — use POST /saldo.
    delete d.saldo_atual;

    const campos = Object.keys(d);
    if (campos.length === 0) throw new AppError('Nenhum campo para atualizar', 400);

    const sets = campos.map((c, i) => `${c} = $${i + 1}`).join(', ');
    const valores = campos.map((c) => d[c]);
    valores.push(req.params.id);

    const { rows } = await query(
      `UPDATE contas_bancarias SET ${sets}, updated_at = NOW()
        WHERE id = $${valores.length}
        RETURNING *`,
      valores,
    );
    if (!rows[0]) throw new NaoEncontradoError('Conta bancária não encontrada');

    await registrarAcao({
      pessoa_acesso_id: req.pessoa.id,
      acao: 'conta_bancaria.atualizar',
      detalhes: { conta_id: rows[0].id, campos },
      req,
    });

    res.json(serializar(rows[0]));
  } catch (err) { next(err); }
}

/**
 * POST /api/contas-bancarias/:id/saldo
 *
 * Endpoint dedicado para atualizar o saldo. Garante que os campos de
 * "atualizado em / atualizado por" batam com o ato de registrar o saldo.
 */
export async function registrarSaldo(req, res, next) {
  try {
    const { saldo_atual } = saldoSchema.parse(req.body);

    const { rows } = await query(
      `UPDATE contas_bancarias
          SET saldo_atual = $1,
              saldo_atualizado_em = NOW(),
              saldo_atualizado_por = $2,
              updated_at = NOW()
        WHERE id = $3
        RETURNING *`,
      [saldo_atual, req.pessoa.id, req.params.id],
    );
    if (!rows[0]) throw new NaoEncontradoError('Conta bancária não encontrada');

    await registrarAcao({
      pessoa_acesso_id: req.pessoa.id,
      acao: 'conta_bancaria.registrar_saldo',
      detalhes: { conta_id: rows[0].id, saldo_atual },
      req,
    });

    res.json(serializar(rows[0]));
  } catch (err) { next(err); }
}
