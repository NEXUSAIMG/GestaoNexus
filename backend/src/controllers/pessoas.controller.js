import { z } from 'zod';
import { query } from '../config/database.js';
import { hashSenha, verificarSenha } from '../utils/password.js';
import { NaoEncontradoError, AppError } from '../utils/errors.js';
import { registrarAcao } from '../utils/audit.js';

/**
 * CRUD de pessoas de acesso — quem efetivamente loga na ferramenta.
 * Pode ser um sócio titular, um representante, ou ambos.
 */

const criarSchema = z.object({
  nome: z.string().min(2).max(255),
  email: z.string().email().max(255),
  senha: z.string().min(8, 'Senha deve ter pelo menos 8 caracteres'),
  telefone: z.string().max(50).optional().nullable(),
  cpf: z.string().max(14).optional().nullable(),
  administrador: z.boolean().default(false),
});

const atualizarSchema = z.object({
  nome: z.string().min(2).max(255).optional(),
  email: z.string().email().max(255).optional(),
  telefone: z.string().max(50).nullable().optional(),
  cpf: z.string().max(14).nullable().optional(),
  administrador: z.boolean().optional(),
  ativo: z.boolean().optional(),
});

const alterarSenhaSchema = z.object({
  senha_atual: z.string().min(1),
  senha_nova: z.string().min(8, 'Nova senha deve ter pelo menos 8 caracteres'),
});

function serializar(row) {
  return {
    id: row.id,
    nome: row.nome,
    email: row.email,
    telefone: row.telefone,
    cpf: row.cpf,
    administrador: row.administrador,
    ativo: row.ativo,
    ultimo_login_em: row.ultimo_login_em,
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

export async function listar(_req, res, next) {
  try {
    const { rows } = await query(
      `SELECT p.id, p.nome, p.email, p.telefone, p.cpf,
              p.administrador, p.ativo, p.ultimo_login_em,
              p.created_at, p.updated_at,
              COUNT(r.id) FILTER (WHERE r.ativo = TRUE) AS qtd_representacoes
         FROM pessoas_acesso p
    LEFT JOIN representacoes r ON r.pessoa_acesso_id = p.id
     GROUP BY p.id
     ORDER BY p.ativo DESC, p.nome ASC`,
    );
    res.json(rows.map((r) => ({
      ...serializar(r),
      qtd_representacoes: Number(r.qtd_representacoes),
    })));
  } catch (err) { next(err); }
}

export async function obter(req, res, next) {
  try {
    const { rows } = await query(
      `SELECT * FROM pessoas_acesso WHERE id = $1`,
      [req.params.id],
    );
    if (!rows[0]) throw new NaoEncontradoError('Pessoa não encontrada');
    res.json(serializar(rows[0]));
  } catch (err) { next(err); }
}

export async function criar(req, res, next) {
  try {
    const d = criarSchema.parse(req.body);
    const senha_hash = await hashSenha(d.senha);

    const { rows } = await query(
      `INSERT INTO pessoas_acesso
         (nome, email, senha_hash, telefone, cpf, administrador)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING *`,
      [d.nome, d.email, senha_hash, d.telefone ?? null, d.cpf ?? null, d.administrador],
    );

    await registrarAcao({
      pessoa_acesso_id: req.pessoa.id,
      acao: 'pessoa_acesso.criar',
      detalhes: { criado_id: rows[0].id, email: d.email },
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
    const valores = campos.map((c) => d[c]);
    valores.push(req.params.id);

    const { rows } = await query(
      `UPDATE pessoas_acesso SET ${sets}, updated_at = NOW()
        WHERE id = $${valores.length}
        RETURNING *`,
      valores,
    );
    if (!rows[0]) throw new NaoEncontradoError('Pessoa não encontrada');

    await registrarAcao({
      pessoa_acesso_id: req.pessoa.id,
      acao: 'pessoa_acesso.atualizar',
      detalhes: { alvo_id: rows[0].id, campos },
      req,
    });

    res.json(serializar(rows[0]));
  } catch (err) { next(err); }
}

export async function alterarSenha(req, res, next) {
  try {
    const { senha_atual, senha_nova } = alterarSenhaSchema.parse(req.body);
    const alvoId = req.params.id;
    const souAdmin = req.pessoa.administrador;
    const souEu = req.pessoa.id === alvoId;

    if (!souAdmin && !souEu) {
      throw new AppError('Você só pode alterar a sua própria senha', 403);
    }

    const { rows } = await query('SELECT senha_hash FROM pessoas_acesso WHERE id = $1', [alvoId]);
    if (!rows[0]) throw new NaoEncontradoError('Pessoa não encontrada');

    if (souEu) {
      const confere = await verificarSenha(senha_atual, rows[0].senha_hash);
      if (!confere) throw new AppError('Senha atual incorreta', 400);
    }

    const novoHash = await hashSenha(senha_nova);
    await query(
      'UPDATE pessoas_acesso SET senha_hash = $1, updated_at = NOW() WHERE id = $2',
      [novoHash, alvoId],
    );

    await registrarAcao({
      pessoa_acesso_id: req.pessoa.id,
      acao: souEu ? 'pessoa_acesso.trocar_propria_senha' : 'pessoa_acesso.resetar_senha',
      detalhes: { alvo_id: alvoId },
      req,
    });

    res.json({ ok: true });
  } catch (err) { next(err); }
}
