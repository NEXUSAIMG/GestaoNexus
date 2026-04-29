import { z } from 'zod';
import { query, pool } from '../config/database.js';
import { NaoEncontradoError, AppError, NaoAutorizadoError } from '../utils/errors.js';
import { registrarAcao } from '../utils/audit.js';

/**
 * Equipes — Sprint 10.
 *
 * Equipes agrupam pessoas_acesso pra organizar o acesso aos quadros de
 * tarefas. Não têm vínculo com sócios — são puramente operacionais.
 *
 * Papéis:
 *   - 'lider'  → pode editar a equipe (renomear, mexer em membros)
 *   - 'membro' → usa os quadros normalmente
 *
 * Admin do sistema sempre tem todos os poderes, independente do papel.
 */

const cores = [
  'slate', 'red', 'orange', 'amber', 'yellow',
  'lime', 'emerald', 'teal', 'cyan', 'blue',
  'indigo', 'violet', 'fuchsia', 'pink', 'rose',
];

const criarSchema = z.object({
  nome: z.string().min(2).max(100),
  descricao: z.string().max(2000).optional().nullable(),
  cor: z.enum(cores).default('slate'),
});

const atualizarSchema = criarSchema.partial();

const adicionarMembroSchema = z.object({
  pessoa_id: z.string().uuid(),
  papel: z.enum(['lider', 'membro']).default('membro'),
});

const atualizarMembroSchema = z.object({
  papel: z.enum(['lider', 'membro']),
});

/**
 * Verifica se a pessoa logada pode gerenciar (editar/membros) uma equipe.
 * Admin do sistema OU líder da equipe.
 */
export async function podeGerenciarEquipe(pessoaId, isAdmin, equipeId) {
  if (isAdmin) return true;
  const { rows } = await query(
    `SELECT 1 FROM equipes_membros
      WHERE equipe_id = $1 AND pessoa_id = $2 AND papel = 'lider'`,
    [equipeId, pessoaId],
  );
  return rows.length > 0;
}

/**
 * Verifica se a pessoa logada é membro (qualquer papel) de uma equipe.
 * Admin do sistema sempre passa.
 */
export async function ehMembroDaEquipe(pessoaId, isAdmin, equipeId) {
  if (isAdmin) return true;
  const { rows } = await query(
    `SELECT 1 FROM equipes_membros WHERE equipe_id = $1 AND pessoa_id = $2`,
    [equipeId, pessoaId],
  );
  return rows.length > 0;
}

function serializar(e) {
  return {
    id: e.id,
    nome: e.nome,
    descricao: e.descricao,
    cor: e.cor,
    arquivada: !!e.arquivada_em,
    arquivada_em: e.arquivada_em,
    criada_em: e.criada_em,
    atualizada_em: e.atualizada_em,
    qtd_membros: e.qtd_membros != null ? Number(e.qtd_membros) : undefined,
    qtd_quadros: e.qtd_quadros != null ? Number(e.qtd_quadros) : undefined,
    meu_papel: e.meu_papel ?? null,
  };
}

const SELECT_BASE = `
  SELECT e.*,
         (SELECT COUNT(*)::int FROM equipes_membros m WHERE m.equipe_id = e.id) AS qtd_membros,
         (SELECT COUNT(*)::int FROM quadros q WHERE q.equipe_id = e.id AND q.arquivado_em IS NULL) AS qtd_quadros,
         (SELECT papel FROM equipes_membros m WHERE m.equipe_id = e.id AND m.pessoa_id = $1) AS meu_papel
    FROM equipes e
`;

/**
 * GET /api/equipes
 *
 * - Admin vê todas (incluindo as que não é membro)
 * - Não-admin vê apenas equipes onde é membro
 * - ?incluir_arquivadas=true mostra arquivadas também (default: só ativas)
 */
export async function listar(req, res, next) {
  try {
    const isAdmin = !!req.pessoa?.administrador;
    const incluirArquivadas = req.query.incluir_arquivadas === 'true';

    const partes = [];
    if (!incluirArquivadas) partes.push(`e.arquivada_em IS NULL`);
    if (!isAdmin) {
      partes.push(`EXISTS (
        SELECT 1 FROM equipes_membros m
         WHERE m.equipe_id = e.id AND m.pessoa_id = $1
      )`);
    }
    const where = partes.length ? `WHERE ${partes.join(' AND ')}` : '';

    const { rows } = await query(
      `${SELECT_BASE} ${where} ORDER BY e.arquivada_em IS NOT NULL, e.nome`,
      [req.pessoa.id],
    );
    res.json(rows.map(serializar));
  } catch (err) { next(err); }
}

/**
 * GET /api/equipes/:id
 * Retorna a equipe + lista de membros.
 */
export async function obter(req, res, next) {
  try {
    const isAdmin = !!req.pessoa?.administrador;
    const ehMembro = await ehMembroDaEquipe(req.pessoa.id, isAdmin, req.params.id);
    if (!ehMembro) {
      throw new NaoAutorizadoError('Você não faz parte desta equipe.');
    }

    const eR = await query(`${SELECT_BASE} WHERE e.id = $2`, [req.pessoa.id, req.params.id]);
    if (!eR.rows[0]) throw new NaoEncontradoError('Equipe não encontrada');

    const mR = await query(
      `SELECT m.id, m.papel, m.adicionado_em,
              p.id AS pessoa_id, p.nome AS pessoa_nome, p.email AS pessoa_email,
              p.administrador AS pessoa_administrador
         FROM equipes_membros m
         JOIN pessoas_acesso p ON p.id = m.pessoa_id
        WHERE m.equipe_id = $1
        ORDER BY m.papel = 'lider' DESC, p.nome`,
      [req.params.id],
    );

    res.json({
      ...serializar(eR.rows[0]),
      membros: mR.rows.map((m) => ({
        id: m.id,
        papel: m.papel,
        adicionado_em: m.adicionado_em,
        pessoa: {
          id: m.pessoa_id,
          nome: m.pessoa_nome,
          email: m.pessoa_email,
          administrador: m.pessoa_administrador,
        },
      })),
    });
  } catch (err) { next(err); }
}

/**
 * POST /api/equipes (admin)
 * Cria a equipe. O criador é adicionado automaticamente como líder.
 */
export async function criar(req, res, next) {
  const client = await pool.connect();
  try {
    const d = criarSchema.parse(req.body);

    await client.query('BEGIN');

    const { rows } = await client.query(
      `INSERT INTO equipes (nome, descricao, cor, criado_por_id)
       VALUES ($1, $2, $3, $4) RETURNING id`,
      [d.nome.trim(), d.descricao?.trim() || null, d.cor, req.pessoa.id],
    );

    // Criador entra como líder automaticamente.
    await client.query(
      `INSERT INTO equipes_membros (equipe_id, pessoa_id, papel, adicionado_por_id)
       VALUES ($1, $2, 'lider', $2)`,
      [rows[0].id, req.pessoa.id],
    );

    await client.query('COMMIT');

    registrarAcao({
      acao: 'equipe.criou',
      pessoa_acesso_id: req.pessoa.id,
      detalhes: { equipe_id: rows[0].id, nome: d.nome },
      req,
    });

    const final = await query(`${SELECT_BASE} WHERE e.id = $2`, [req.pessoa.id, rows[0].id]);
    res.status(201).json(serializar(final.rows[0]));
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    next(err);
  } finally {
    client.release();
  }
}

/**
 * PUT /api/equipes/:id (admin OU líder)
 */
export async function atualizar(req, res, next) {
  try {
    const isAdmin = !!req.pessoa?.administrador;
    const podeGerenciar = await podeGerenciarEquipe(req.pessoa.id, isAdmin, req.params.id);
    if (!podeGerenciar) {
      throw new NaoAutorizadoError('Apenas líderes da equipe ou administradores podem editar.');
    }

    const d = atualizarSchema.parse(req.body);
    const updates = [];
    const params = [];
    for (const [k, v] of Object.entries(d)) {
      if (v === undefined) continue;
      params.push(typeof v === 'string' ? v.trim() : v);
      updates.push(`${k} = $${params.length}`);
    }
    if (updates.length === 0) {
      const r = await query(`${SELECT_BASE} WHERE e.id = $2`, [req.pessoa.id, req.params.id]);
      if (!r.rows[0]) throw new NaoEncontradoError('Equipe não encontrada');
      return res.json(serializar(r.rows[0]));
    }

    params.push(req.params.id);
    const { rowCount } = await query(
      `UPDATE equipes SET ${updates.join(', ')} WHERE id = $${params.length}`,
      params,
    );
    if (rowCount === 0) throw new NaoEncontradoError('Equipe não encontrada');

    registrarAcao({
      acao: 'equipe.editou',
      pessoa_acesso_id: req.pessoa.id,
      detalhes: { equipe_id: req.params.id, campos: Object.keys(d) },
      req,
    });

    const r = await query(`${SELECT_BASE} WHERE e.id = $2`, [req.pessoa.id, req.params.id]);
    res.json(serializar(r.rows[0]));
  } catch (err) { next(err); }
}

/**
 * POST /api/equipes/:id/arquivar (admin OU líder)
 */
export async function arquivar(req, res, next) {
  try {
    const isAdmin = !!req.pessoa?.administrador;
    const podeGerenciar = await podeGerenciarEquipe(req.pessoa.id, isAdmin, req.params.id);
    if (!podeGerenciar) {
      throw new NaoAutorizadoError('Apenas líderes ou administradores podem arquivar a equipe.');
    }

    const { rowCount } = await query(
      `UPDATE equipes SET arquivada_em = NOW()
        WHERE id = $1 AND arquivada_em IS NULL`,
      [req.params.id],
    );
    if (rowCount === 0) {
      throw new AppError('Equipe não encontrada ou já arquivada.', 400);
    }

    registrarAcao({
      acao: 'equipe.arquivou',
      pessoa_acesso_id: req.pessoa.id,
      detalhes: { equipe_id: req.params.id },
      req,
    });

    res.status(204).send();
  } catch (err) { next(err); }
}

/**
 * POST /api/equipes/:id/desarquivar (admin)
 */
export async function desarquivar(req, res, next) {
  try {
    if (!req.pessoa?.administrador) {
      throw new NaoAutorizadoError('Apenas administradores podem desarquivar.');
    }
    const { rowCount } = await query(
      `UPDATE equipes SET arquivada_em = NULL
        WHERE id = $1 AND arquivada_em IS NOT NULL`,
      [req.params.id],
    );
    if (rowCount === 0) throw new AppError('Equipe não encontrada ou não arquivada.', 400);

    registrarAcao({
      acao: 'equipe.desarquivou',
      pessoa_acesso_id: req.pessoa.id,
      detalhes: { equipe_id: req.params.id },
      req,
    });

    res.status(204).send();
  } catch (err) { next(err); }
}

// =============================================================================
// Membros
// =============================================================================

/**
 * POST /api/equipes/:id/membros (admin OU líder)
 */
export async function adicionarMembro(req, res, next) {
  try {
    const isAdmin = !!req.pessoa?.administrador;
    const podeGerenciar = await podeGerenciarEquipe(req.pessoa.id, isAdmin, req.params.id);
    if (!podeGerenciar) {
      throw new NaoAutorizadoError('Apenas líderes ou administradores podem gerenciar membros.');
    }

    const d = adicionarMembroSchema.parse(req.body);

    // Confere que a pessoa existe e está ativa
    const pR = await query(
      `SELECT id, nome, ativo FROM pessoas_acesso WHERE id = $1`,
      [d.pessoa_id],
    );
    if (!pR.rows[0]) throw new NaoEncontradoError('Pessoa não encontrada');
    if (!pR.rows[0].ativo) throw new AppError('Pessoa está inativa', 400);

    try {
      await query(
        `INSERT INTO equipes_membros (equipe_id, pessoa_id, papel, adicionado_por_id)
         VALUES ($1, $2, $3, $4)`,
        [req.params.id, d.pessoa_id, d.papel, req.pessoa.id],
      );
    } catch (err) {
      if (err.code === '23505') {
        throw new AppError('Esta pessoa já é membro da equipe.', 400);
      }
      throw err;
    }

    registrarAcao({
      acao: 'equipe.adicionou_membro',
      pessoa_acesso_id: req.pessoa.id,
      detalhes: { equipe_id: req.params.id, pessoa_id: d.pessoa_id, papel: d.papel },
      req,
    });

    res.status(201).json({ ok: true });
  } catch (err) { next(err); }
}

/**
 * PUT /api/equipes/:equipeId/membros/:membroId (admin OU líder)
 * Muda o papel do membro.
 */
export async function atualizarMembro(req, res, next) {
  try {
    const isAdmin = !!req.pessoa?.administrador;
    const podeGerenciar = await podeGerenciarEquipe(req.pessoa.id, isAdmin, req.params.equipeId);
    if (!podeGerenciar) {
      throw new NaoAutorizadoError('Sem permissão.');
    }

    const { papel } = atualizarMembroSchema.parse(req.body);

    const { rowCount } = await query(
      `UPDATE equipes_membros SET papel = $1
        WHERE id = $2 AND equipe_id = $3`,
      [papel, req.params.membroId, req.params.equipeId],
    );
    if (rowCount === 0) throw new NaoEncontradoError('Membro não encontrado');

    registrarAcao({
      acao: 'equipe.atualizou_membro',
      pessoa_acesso_id: req.pessoa.id,
      detalhes: { equipe_id: req.params.equipeId, membro_id: req.params.membroId, papel },
      req,
    });

    res.json({ ok: true });
  } catch (err) { next(err); }
}

/**
 * DELETE /api/equipes/:equipeId/membros/:membroId (admin OU líder)
 *
 * Não permite remover o último líder — alguém precisa poder gerenciar.
 */
export async function removerMembro(req, res, next) {
  const client = await pool.connect();
  try {
    const isAdmin = !!req.pessoa?.administrador;
    const podeGerenciar = await podeGerenciarEquipe(req.pessoa.id, isAdmin, req.params.equipeId);
    if (!podeGerenciar) {
      throw new NaoAutorizadoError('Sem permissão.');
    }

    await client.query('BEGIN');

    const mR = await client.query(
      `SELECT papel FROM equipes_membros WHERE id = $1 AND equipe_id = $2`,
      [req.params.membroId, req.params.equipeId],
    );
    if (!mR.rows[0]) throw new NaoEncontradoError('Membro não encontrado');

    if (mR.rows[0].papel === 'lider') {
      const { rows } = await client.query(
        `SELECT COUNT(*)::int AS qtd FROM equipes_membros
          WHERE equipe_id = $1 AND papel = 'lider'`,
        [req.params.equipeId],
      );
      if (rows[0].qtd <= 1) {
        throw new AppError(
          'Não é possível remover o último líder. Promova outro membro a líder antes.',
          400,
        );
      }
    }

    await client.query(
      `DELETE FROM equipes_membros WHERE id = $1 AND equipe_id = $2`,
      [req.params.membroId, req.params.equipeId],
    );

    await client.query('COMMIT');

    registrarAcao({
      acao: 'equipe.removeu_membro',
      pessoa_acesso_id: req.pessoa.id,
      detalhes: { equipe_id: req.params.equipeId, membro_id: req.params.membroId },
      req,
    });

    res.status(204).send();
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    next(err);
  } finally {
    client.release();
  }
}
