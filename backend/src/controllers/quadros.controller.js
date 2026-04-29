import { z } from 'zod';
import { query, pool } from '../config/database.js';
import { NaoEncontradoError, AppError, NaoAutorizadoError } from '../utils/errors.js';
import { registrarAcao } from '../utils/audit.js';
import { ehMembroDaEquipe } from './equipes.controller.js';

/**
 * Quadros — Sprint 10.
 *
 * Quadro pertence a UMA equipe. Membros da equipe têm acesso de
 * leitura+escrita. Se `aberto_a_socios = true`, qualquer pessoa
 * autenticada lê o quadro (transparência), mas só membros editam.
 *
 * Ao criar quadro, geramos 3 colunas padrão ("A fazer", "Em andamento",
 * "Concluído") e 4 etiquetas básicas ("Urgente", "Bug", "Melhoria",
 * "Cliente"). O usuário pode editar ou apagar tudo depois.
 */

const criarSchema = z.object({
  equipe_id: z.string().uuid(),
  nome: z.string().min(2).max(100),
  descricao: z.string().max(2000).optional().nullable(),
  // Default é TRUE — alinha com a filosofia da ferramenta (transparência
  // pra sócios). Pra criar quadro privado, marca a flag explicitamente
  // como false.
  aberto_a_socios: z.boolean().default(true),
});

const atualizarSchema = z.object({
  nome: z.string().min(2).max(100).optional(),
  descricao: z.string().max(2000).optional().nullable(),
  aberto_a_socios: z.boolean().optional(),
});

/**
 * Verifica se a pessoa pode VER o quadro:
 *   - Admin do sistema sempre vê
 *   - Membro da equipe sempre vê
 *   - Qualquer autenticado vê se aberto_a_socios = true
 */
export async function podeVerQuadro(pessoaId, isAdmin, quadroId) {
  if (isAdmin) return { pode: true, podeEditar: true };
  const { rows } = await query(
    `SELECT q.aberto_a_socios,
            EXISTS (SELECT 1 FROM equipes_membros m
                     WHERE m.equipe_id = q.equipe_id AND m.pessoa_id = $1) AS eh_membro
       FROM quadros q
      WHERE q.id = $2 AND q.arquivado_em IS NULL`,
    [pessoaId, quadroId],
  );
  if (!rows[0]) return { pode: false, podeEditar: false };
  const ehMembro = rows[0].eh_membro;
  const aberto = rows[0].aberto_a_socios;
  return { pode: ehMembro || aberto, podeEditar: ehMembro };
}

function serializar(q) {
  return {
    id: q.id,
    equipe_id: q.equipe_id,
    equipe_nome: q.equipe_nome,
    equipe_cor: q.equipe_cor,
    nome: q.nome,
    descricao: q.descricao,
    aberto_a_socios: q.aberto_a_socios,
    arquivado: !!q.arquivado_em,
    arquivado_em: q.arquivado_em,
    criado_em: q.criado_em,
    atualizado_em: q.atualizado_em,
    qtd_cards: q.qtd_cards != null ? Number(q.qtd_cards) : undefined,
    qtd_colunas: q.qtd_colunas != null ? Number(q.qtd_colunas) : undefined,
  };
}

const SELECT_BASE = `
  SELECT q.*,
         e.nome AS equipe_nome,
         e.cor  AS equipe_cor,
         (SELECT COUNT(*)::int FROM colunas c WHERE c.quadro_id = q.id AND c.arquivada_em IS NULL) AS qtd_colunas,
         (SELECT COUNT(*)::int FROM cards ca WHERE ca.quadro_id = q.id AND ca.arquivado_em IS NULL) AS qtd_cards
    FROM quadros q
    JOIN equipes e ON e.id = q.equipe_id
`;

/**
 * GET /api/quadros
 *
 * Lista quadros visíveis pra pessoa logada:
 *   - Admin: todos
 *   - Outros: equipes onde é membro + quadros abertos a sócios
 *
 * ?equipe_id filtra por equipe específica.
 */
export async function listar(req, res, next) {
  try {
    const isAdmin = !!req.pessoa?.administrador;
    const partes = [`q.arquivado_em IS NULL`];
    const params = [];

    if (!isAdmin) {
      params.push(req.pessoa.id);
      partes.push(`(
        EXISTS (SELECT 1 FROM equipes_membros m
                 WHERE m.equipe_id = q.equipe_id AND m.pessoa_id = $${params.length})
        OR q.aberto_a_socios = TRUE
      )`);
    }

    if (req.query.equipe_id) {
      params.push(req.query.equipe_id);
      partes.push(`q.equipe_id = $${params.length}`);
    }

    const where = `WHERE ${partes.join(' AND ')}`;
    const { rows } = await query(
      `${SELECT_BASE} ${where} ORDER BY e.nome, q.nome`,
      params,
    );
    res.json(rows.map(serializar));
  } catch (err) { next(err); }
}

/**
 * GET /api/quadros/:id
 * Devolve quadro + colunas + cards + etiquetas, tudo num payload só.
 * O frontend monta o board a partir disso.
 */
export async function obter(req, res, next) {
  try {
    const isAdmin = !!req.pessoa?.administrador;
    const { pode, podeEditar } = await podeVerQuadro(req.pessoa.id, isAdmin, req.params.id);
    if (!pode) throw new NaoAutorizadoError('Você não tem acesso a este quadro.');

    const qR = await query(`${SELECT_BASE} WHERE q.id = $1`, [req.params.id]);
    if (!qR.rows[0]) throw new NaoEncontradoError('Quadro não encontrado');

    const [colR, cardsR, etiqR] = await Promise.all([
      query(
        `SELECT id, nome, ordem, criado_em
           FROM colunas
          WHERE quadro_id = $1 AND arquivada_em IS NULL
          ORDER BY ordem, criado_em`,
        [req.params.id],
      ),
      query(
        `SELECT c.id, c.coluna_id, c.titulo, c.descricao, c.data_prazo,
                c.responsavel_id, c.ordem, c.criado_em, c.atualizado_em,
                p.nome AS responsavel_nome,
                p.email AS responsavel_email,
                COALESCE(
                  (SELECT json_agg(ce.etiqueta_id) FROM cards_etiquetas ce WHERE ce.card_id = c.id),
                  '[]'::json
                ) AS etiqueta_ids
           FROM cards c
           LEFT JOIN pessoas_acesso p ON p.id = c.responsavel_id
          WHERE c.quadro_id = $1 AND c.arquivado_em IS NULL
          ORDER BY c.ordem, c.criado_em`,
        [req.params.id],
      ),
      query(
        `SELECT id, nome, cor, ordem
           FROM quadros_etiquetas
          WHERE quadro_id = $1
          ORDER BY ordem, nome`,
        [req.params.id],
      ),
    ]);

    res.json({
      ...serializar(qR.rows[0]),
      pode_editar: podeEditar,
      colunas: colR.rows,
      cards: cardsR.rows.map((c) => ({
        ...c,
        etiqueta_ids: c.etiqueta_ids || [],
      })),
      etiquetas: etiqR.rows,
    });
  } catch (err) { next(err); }
}

/**
 * POST /api/quadros (membro da equipe ou admin)
 * Cria o quadro e popula colunas/etiquetas padrão.
 */
export async function criar(req, res, next) {
  const client = await pool.connect();
  try {
    const d = criarSchema.parse(req.body);
    const isAdmin = !!req.pessoa?.administrador;

    const ehMembro = await ehMembroDaEquipe(req.pessoa.id, isAdmin, d.equipe_id);
    if (!ehMembro) {
      throw new NaoAutorizadoError('Você precisa ser membro da equipe pra criar quadros nela.');
    }

    await client.query('BEGIN');

    // Confere que a equipe existe e está ativa
    const eR = await client.query(
      `SELECT id, arquivada_em FROM equipes WHERE id = $1`,
      [d.equipe_id],
    );
    if (!eR.rows[0]) throw new NaoEncontradoError('Equipe não encontrada');
    if (eR.rows[0].arquivada_em) throw new AppError('Equipe está arquivada', 400);

    const { rows } = await client.query(
      `INSERT INTO quadros (equipe_id, nome, descricao, aberto_a_socios, criado_por_id)
       VALUES ($1, $2, $3, $4, $5) RETURNING id`,
      [d.equipe_id, d.nome.trim(), d.descricao?.trim() || null, d.aberto_a_socios, req.pessoa.id],
    );
    const quadroId = rows[0].id;

    // Colunas padrão
    const colunasPadrao = [
      { nome: 'A fazer', ordem: 1000 },
      { nome: 'Em andamento', ordem: 2000 },
      { nome: 'Concluído', ordem: 3000 },
    ];
    for (const c of colunasPadrao) {
      await client.query(
        `INSERT INTO colunas (quadro_id, nome, ordem) VALUES ($1, $2, $3)`,
        [quadroId, c.nome, c.ordem],
      );
    }

    // Etiquetas padrão
    const etiquetasPadrao = [
      { nome: 'Urgente', cor: 'red', ordem: 1 },
      { nome: 'Bug', cor: 'orange', ordem: 2 },
      { nome: 'Melhoria', cor: 'emerald', ordem: 3 },
      { nome: 'Cliente', cor: 'blue', ordem: 4 },
    ];
    for (const e of etiquetasPadrao) {
      await client.query(
        `INSERT INTO quadros_etiquetas (quadro_id, nome, cor, ordem)
         VALUES ($1, $2, $3, $4)`,
        [quadroId, e.nome, e.cor, e.ordem],
      );
    }

    await client.query('COMMIT');

    registrarAcao({
      acao: 'quadro.criou',
      pessoa_acesso_id: req.pessoa.id,
      detalhes: { quadro_id: quadroId, equipe_id: d.equipe_id, nome: d.nome },
      req,
    });

    const final = await query(`${SELECT_BASE} WHERE q.id = $1`, [quadroId]);
    res.status(201).json(serializar(final.rows[0]));
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    next(err);
  } finally {
    client.release();
  }
}

/**
 * PUT /api/quadros/:id (membro da equipe)
 */
export async function atualizar(req, res, next) {
  try {
    const isAdmin = !!req.pessoa?.administrador;
    const { podeEditar } = await podeVerQuadro(req.pessoa.id, isAdmin, req.params.id);
    if (!podeEditar) throw new NaoAutorizadoError('Sem permissão pra editar este quadro.');

    const d = atualizarSchema.parse(req.body);
    const updates = [];
    const params = [];
    for (const [k, v] of Object.entries(d)) {
      if (v === undefined) continue;
      params.push(typeof v === 'string' ? v.trim() : v);
      updates.push(`${k} = $${params.length}`);
    }
    if (updates.length === 0) {
      const r = await query(`${SELECT_BASE} WHERE q.id = $1`, [req.params.id]);
      if (!r.rows[0]) throw new NaoEncontradoError('Quadro não encontrado');
      return res.json(serializar(r.rows[0]));
    }

    params.push(req.params.id);
    const { rowCount } = await query(
      `UPDATE quadros SET ${updates.join(', ')} WHERE id = $${params.length}`,
      params,
    );
    if (rowCount === 0) throw new NaoEncontradoError('Quadro não encontrado');

    registrarAcao({
      acao: 'quadro.editou',
      pessoa_acesso_id: req.pessoa.id,
      detalhes: { quadro_id: req.params.id, campos: Object.keys(d) },
      req,
    });

    const r = await query(`${SELECT_BASE} WHERE q.id = $1`, [req.params.id]);
    res.json(serializar(r.rows[0]));
  } catch (err) { next(err); }
}

/**
 * POST /api/quadros/:id/arquivar (membro da equipe)
 */
export async function arquivar(req, res, next) {
  try {
    const isAdmin = !!req.pessoa?.administrador;
    const { podeEditar } = await podeVerQuadro(req.pessoa.id, isAdmin, req.params.id);
    if (!podeEditar) throw new NaoAutorizadoError('Sem permissão.');

    const { rowCount } = await query(
      `UPDATE quadros SET arquivado_em = NOW()
        WHERE id = $1 AND arquivado_em IS NULL`,
      [req.params.id],
    );
    if (rowCount === 0) throw new AppError('Quadro não encontrado ou já arquivado.', 400);

    registrarAcao({
      acao: 'quadro.arquivou',
      pessoa_acesso_id: req.pessoa.id,
      detalhes: { quadro_id: req.params.id },
      req,
    });

    res.status(204).send();
  } catch (err) { next(err); }
}

// =============================================================================
// Etiquetas do quadro
// =============================================================================

const etiquetaSchema = z.object({
  nome: z.string().min(1).max(50),
  cor: z.enum([
    'slate', 'red', 'orange', 'amber', 'yellow', 'lime', 'emerald',
    'teal', 'cyan', 'blue', 'indigo', 'violet', 'fuchsia', 'pink', 'rose',
  ]).default('slate'),
});

export async function criarEtiqueta(req, res, next) {
  try {
    const isAdmin = !!req.pessoa?.administrador;
    const { podeEditar } = await podeVerQuadro(req.pessoa.id, isAdmin, req.params.id);
    if (!podeEditar) throw new NaoAutorizadoError('Sem permissão.');

    const d = etiquetaSchema.parse(req.body);

    const { rows: ord } = await query(
      `SELECT COALESCE(MAX(ordem), 0) + 1 AS prox FROM quadros_etiquetas WHERE quadro_id = $1`,
      [req.params.id],
    );

    try {
      const { rows } = await query(
        `INSERT INTO quadros_etiquetas (quadro_id, nome, cor, ordem)
         VALUES ($1, $2, $3, $4) RETURNING id, nome, cor, ordem`,
        [req.params.id, d.nome.trim(), d.cor, ord[0].prox],
      );
      res.status(201).json(rows[0]);
    } catch (err) {
      if (err.code === '23505') {
        throw new AppError('Já existe uma etiqueta com esse nome neste quadro.', 400);
      }
      throw err;
    }
  } catch (err) { next(err); }
}

export async function atualizarEtiqueta(req, res, next) {
  try {
    const isAdmin = !!req.pessoa?.administrador;
    const { podeEditar } = await podeVerQuadro(req.pessoa.id, isAdmin, req.params.id);
    if (!podeEditar) throw new NaoAutorizadoError('Sem permissão.');

    const d = etiquetaSchema.partial().parse(req.body);
    const updates = [];
    const params = [];
    for (const [k, v] of Object.entries(d)) {
      if (v === undefined) continue;
      params.push(typeof v === 'string' ? v.trim() : v);
      updates.push(`${k} = $${params.length}`);
    }
    if (updates.length === 0) {
      return res.json({ ok: true });
    }
    params.push(req.params.etiquetaId, req.params.id);
    const { rowCount } = await query(
      `UPDATE quadros_etiquetas SET ${updates.join(', ')}
        WHERE id = $${params.length - 1} AND quadro_id = $${params.length}`,
      params,
    );
    if (rowCount === 0) throw new NaoEncontradoError('Etiqueta não encontrada');
    res.json({ ok: true });
  } catch (err) { next(err); }
}

export async function excluirEtiqueta(req, res, next) {
  try {
    const isAdmin = !!req.pessoa?.administrador;
    const { podeEditar } = await podeVerQuadro(req.pessoa.id, isAdmin, req.params.id);
    if (!podeEditar) throw new NaoAutorizadoError('Sem permissão.');

    const { rowCount } = await query(
      `DELETE FROM quadros_etiquetas WHERE id = $1 AND quadro_id = $2`,
      [req.params.etiquetaId, req.params.id],
    );
    if (rowCount === 0) throw new NaoEncontradoError('Etiqueta não encontrada');
    res.status(204).send();
  } catch (err) { next(err); }
}
