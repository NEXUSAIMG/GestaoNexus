import { promises as fs } from 'node:fs';
import { z } from 'zod';
import { query, pool } from '../config/database.js';
import { NaoEncontradoError, AppError, NaoAutorizadoError } from '../utils/errors.js';
import { registrarAcao } from '../utils/audit.js';
import { podeVerQuadro } from './quadros.controller.js';
import {
  resolverCaminhoAbsoluto, apagarArquivo, caminhoRelativo,
} from '../utils/uploads.js';
// Sprint 36 — gatilho de automação (checklist 100%)
import { dispararEmBackground } from '../services/automacoes.service.js';

/**
 * Extras do card — Sprint 32 (Kanban nível Trello).
 *
 * Reúne 4 sub-recursos do card, todos endereçados sob /cards/:id/...:
 *   - Checklists (+ itens marcáveis)
 *   - Comentários
 *   - Anexos
 *   - Atividades (feed lido do log_acoes filtrando por card_id)
 *
 * Permissão é sempre derivada do quadro do card (podeVerQuadro):
 *   - ler   → membro da equipe OU sócio se o quadro for aberto_a_socios
 *   - editar→ membro da equipe (ou admin)
 *
 * Comentários têm regra extra: editar/excluir só o próprio autor (ou admin).
 */

// ===========================================================================
// Helper de permissão — resolve o quadro a partir do card
// ===========================================================================

/**
 * Carrega { card_id, quadro_id, pode, podeEditar } a partir do id do card.
 * Lança 404 se o card não existe e 403 se a pessoa não pode ver.
 */
async function contextoCard(req, cardId, { exigirEdicao = false } = {}) {
  const r = await query(`SELECT id, quadro_id FROM cards WHERE id = $1`, [cardId]);
  if (!r.rows[0]) throw new NaoEncontradoError('Card não encontrado');

  const isAdmin = !!req.pessoa?.administrador;
  const { pode, podeEditar } = await podeVerQuadro(req.pessoa.id, isAdmin, r.rows[0].quadro_id);
  if (!pode) throw new NaoAutorizadoError('Sem acesso a este card.');
  if (exigirEdicao && !podeEditar) throw new NaoAutorizadoError('Sem permissão para editar.');

  return { cardId, quadroId: r.rows[0].quadro_id, pode, podeEditar, isAdmin };
}

// ===========================================================================
// CHECKLISTS
// ===========================================================================

const checklistSchema = z.object({
  titulo: z.string().min(1).max(120).default('Checklist'),
});

const itemSchema = z.object({
  texto: z.string().min(1).max(500),
});

const itemPatchSchema = z.object({
  texto: z.string().min(1).max(500).optional(),
  concluido: z.boolean().optional(),
});

/**
 * GET /api/cards/:id/checklists
 * Retorna os checklists do card, cada um com seus itens (ordenados).
 */
export async function listarChecklists(req, res, next) {
  try {
    await contextoCard(req, req.params.id);

    const { rows: checklists } = await query(
      `SELECT id, titulo, ordem, criado_em
         FROM card_checklists
        WHERE card_id = $1
        ORDER BY ordem, criado_em`,
      [req.params.id],
    );

    const { rows: itens } = await query(
      `SELECT i.id, i.checklist_id, i.texto, i.concluido, i.ordem,
              i.concluido_em, p.nome AS concluido_por_nome
         FROM card_checklist_itens i
         LEFT JOIN pessoas_acesso p ON p.id = i.concluido_por_id
        WHERE i.card_id = $1
        ORDER BY i.ordem, i.criado_em`,
      [req.params.id],
    );

    const porChecklist = new Map();
    for (const c of checklists) porChecklist.set(c.id, { ...c, itens: [] });
    for (const it of itens) {
      const alvo = porChecklist.get(it.checklist_id);
      if (alvo) alvo.itens.push(it);
    }

    res.json([...porChecklist.values()]);
  } catch (err) { next(err); }
}

/**
 * POST /api/cards/:id/checklists
 */
export async function criarChecklist(req, res, next) {
  try {
    await contextoCard(req, req.params.id, { exigirEdicao: true });
    const d = checklistSchema.parse(req.body);

    const { rows: ord } = await query(
      `SELECT COALESCE(MAX(ordem), 0) + 1 AS prox FROM card_checklists WHERE card_id = $1`,
      [req.params.id],
    );

    const { rows } = await query(
      `INSERT INTO card_checklists (card_id, titulo, ordem, criado_por_id)
       VALUES ($1, $2, $3, $4)
       RETURNING id, titulo, ordem, criado_em`,
      [req.params.id, d.titulo.trim(), ord[0].prox, req.pessoa.id],
    );

    registrarAcao({
      acao: 'card.checklist.criou',
      pessoa_acesso_id: req.pessoa.id,
      detalhes: { card_id: req.params.id, checklist_id: rows[0].id, titulo: d.titulo },
      req,
    });

    res.status(201).json({ ...rows[0], itens: [] });
  } catch (err) { next(err); }
}

/**
 * PUT /api/cards/:id/checklists/:checklistId  (renomeia)
 */
export async function atualizarChecklist(req, res, next) {
  try {
    await contextoCard(req, req.params.id, { exigirEdicao: true });
    const d = checklistSchema.parse(req.body);

    const { rowCount } = await query(
      `UPDATE card_checklists SET titulo = $1 WHERE id = $2 AND card_id = $3`,
      [d.titulo.trim(), req.params.checklistId, req.params.id],
    );
    if (rowCount === 0) throw new NaoEncontradoError('Checklist não encontrado');
    res.json({ ok: true });
  } catch (err) { next(err); }
}

/**
 * DELETE /api/cards/:id/checklists/:checklistId
 */
export async function excluirChecklist(req, res, next) {
  try {
    await contextoCard(req, req.params.id, { exigirEdicao: true });
    const { rowCount } = await query(
      `DELETE FROM card_checklists WHERE id = $1 AND card_id = $2`,
      [req.params.checklistId, req.params.id],
    );
    if (rowCount === 0) throw new NaoEncontradoError('Checklist não encontrado');

    registrarAcao({
      acao: 'card.checklist.excluiu',
      pessoa_acesso_id: req.pessoa.id,
      detalhes: { card_id: req.params.id, checklist_id: req.params.checklistId },
      req,
    });

    res.status(204).send();
  } catch (err) { next(err); }
}

/**
 * POST /api/cards/:id/checklists/:checklistId/itens
 */
export async function criarItem(req, res, next) {
  try {
    await contextoCard(req, req.params.id, { exigirEdicao: true });
    const d = itemSchema.parse(req.body);

    // Confere que o checklist pertence a este card
    const chk = await query(
      `SELECT id FROM card_checklists WHERE id = $1 AND card_id = $2`,
      [req.params.checklistId, req.params.id],
    );
    if (!chk.rows[0]) throw new NaoEncontradoError('Checklist não encontrado');

    const { rows: ord } = await query(
      `SELECT COALESCE(MAX(ordem), 0) + 1 AS prox
         FROM card_checklist_itens WHERE checklist_id = $1`,
      [req.params.checklistId],
    );

    const { rows } = await query(
      `INSERT INTO card_checklist_itens (checklist_id, card_id, texto, ordem)
       VALUES ($1, $2, $3, $4)
       RETURNING id, checklist_id, texto, concluido, ordem, concluido_em`,
      [req.params.checklistId, req.params.id, d.texto.trim(), ord[0].prox],
    );

    res.status(201).json(rows[0]);
  } catch (err) { next(err); }
}

/**
 * PUT /api/cards/:id/checklists/:checklistId/itens/:itemId
 * Marca/desmarca (concluido) ou renomeia (texto).
 */
export async function atualizarItem(req, res, next) {
  try {
    await contextoCard(req, req.params.id, { exigirEdicao: true });
    const d = itemPatchSchema.parse(req.body);

    const updates = [];
    const params = [];

    if (d.texto !== undefined) {
      params.push(d.texto.trim());
      updates.push('texto = $' + params.length);
    }
    if (d.concluido !== undefined) {
      params.push(d.concluido);
      updates.push('concluido = $' + params.length);
      if (d.concluido) {
        params.push(req.pessoa.id);
        updates.push('concluido_por_id = $' + params.length);
        updates.push('concluido_em = NOW()');
      } else {
        updates.push('concluido_por_id = NULL');
        updates.push('concluido_em = NULL');
      }
    }

    if (updates.length === 0) return res.json({ ok: true });

    params.push(req.params.itemId, req.params.checklistId, req.params.id);
    const sql = 'UPDATE card_checklist_itens SET ' + updates.join(', ')
      + ' WHERE id = $' + (params.length - 2)
      + ' AND checklist_id = $' + (params.length - 1)
      + ' AND card_id = $' + params.length
      + ' RETURNING id, checklist_id, texto, concluido, ordem, concluido_em';
    const { rows } = await query(sql, params);
    if (!rows[0]) throw new NaoEncontradoError('Item não encontrado');

    // Sprint 36 — gatilho `checklist_completo`.
    // Só dispara na transição para 100%: marcar o último item aciona a regra;
    // marcar um item de um checklist que já estava completo, não.
    if (d.concluido === true) {
      const { rows: cnt } = await query(
        `SELECT COUNT(*)::int AS total,
                COUNT(*) FILTER (WHERE concluido)::int AS feitos
           FROM card_checklist_itens WHERE card_id = $1`,
        [req.params.id],
      );
      if (cnt[0].total > 0 && cnt[0].total === cnt[0].feitos) {
        const { rows: q } = await query('SELECT quadro_id FROM cards WHERE id = $1', [req.params.id]);
        if (q[0]) {
          dispararEmBackground('checklist_completo', {
            quadroId: q[0].quadro_id,
            cardId: req.params.id,
            pessoaId: req.pessoa.id,
          });
        }
      }
    }

    res.json(rows[0]);
  } catch (err) { next(err); }
}

/**
 * DELETE /api/cards/:id/checklists/:checklistId/itens/:itemId
 */
export async function excluirItem(req, res, next) {
  try {
    await contextoCard(req, req.params.id, { exigirEdicao: true });
    const { rowCount } = await query(
      `DELETE FROM card_checklist_itens
        WHERE id = $1 AND checklist_id = $2 AND card_id = $3`,
      [req.params.itemId, req.params.checklistId, req.params.id],
    );
    if (rowCount === 0) throw new NaoEncontradoError('Item não encontrado');
    res.status(204).send();
  } catch (err) { next(err); }
}

// ===========================================================================
// COMENTÁRIOS
// ===========================================================================

const comentarioSchema = z.object({
  texto: z.string().min(1).max(5000),
});

function serializarComentario(c) {
  return {
    id: c.id,
    card_id: c.card_id,
    pessoa_id: c.pessoa_id,
    pessoa_nome: c.pessoa_nome,
    texto: c.texto,
    criado_em: c.criado_em,
    editado_em: c.editado_em,
  };
}

/**
 * GET /api/cards/:id/comentarios
 */
export async function listarComentarios(req, res, next) {
  try {
    await contextoCard(req, req.params.id);
    const { rows } = await query(
      `SELECT c.*, p.nome AS pessoa_nome
         FROM card_comentarios c
         LEFT JOIN pessoas_acesso p ON p.id = c.pessoa_id
        WHERE c.card_id = $1
        ORDER BY c.criado_em DESC`,
      [req.params.id],
    );
    res.json(rows.map(serializarComentario));
  } catch (err) { next(err); }
}

/**
 * POST /api/cards/:id/comentarios
 */
export async function criarComentario(req, res, next) {
  try {
    await contextoCard(req, req.params.id, { exigirEdicao: true });
    const d = comentarioSchema.parse(req.body);

    const { rows } = await query(
      `INSERT INTO card_comentarios (card_id, pessoa_id, texto)
       VALUES ($1, $2, $3)
       RETURNING *`,
      [req.params.id, req.pessoa.id, d.texto.trim()],
    );

    // Reconsulta com o nome pra devolver pronto
    const final = await query(
      `SELECT c.*, p.nome AS pessoa_nome
         FROM card_comentarios c LEFT JOIN pessoas_acesso p ON p.id = c.pessoa_id
        WHERE c.id = $1`,
      [rows[0].id],
    );

    registrarAcao({
      acao: 'card.comentou',
      pessoa_acesso_id: req.pessoa.id,
      detalhes: { card_id: req.params.id, comentario_id: rows[0].id },
      req,
    });

    res.status(201).json(serializarComentario(final.rows[0]));
  } catch (err) { next(err); }
}

/**
 * PUT /api/cards/:id/comentarios/:comentarioId  (só o autor ou admin)
 */
export async function atualizarComentario(req, res, next) {
  try {
    const ctx = await contextoCard(req, req.params.id);
    const d = comentarioSchema.parse(req.body);

    const atual = await query(
      `SELECT pessoa_id FROM card_comentarios WHERE id = $1 AND card_id = $2`,
      [req.params.comentarioId, req.params.id],
    );
    if (!atual.rows[0]) throw new NaoEncontradoError('Comentário não encontrado');
    if (atual.rows[0].pessoa_id !== req.pessoa.id && !ctx.isAdmin) {
      throw new NaoAutorizadoError('Só o autor pode editar o comentário.');
    }

    const { rows } = await query(
      `UPDATE card_comentarios SET texto = $1, editado_em = NOW()
        WHERE id = $2 AND card_id = $3
        RETURNING *`,
      [d.texto.trim(), req.params.comentarioId, req.params.id],
    );

    const final = await query(
      `SELECT c.*, p.nome AS pessoa_nome
         FROM card_comentarios c LEFT JOIN pessoas_acesso p ON p.id = c.pessoa_id
        WHERE c.id = $1`,
      [rows[0].id],
    );
    res.json(serializarComentario(final.rows[0]));
  } catch (err) { next(err); }
}

/**
 * DELETE /api/cards/:id/comentarios/:comentarioId  (só o autor ou admin)
 */
export async function excluirComentario(req, res, next) {
  try {
    const ctx = await contextoCard(req, req.params.id);
    const atual = await query(
      `SELECT pessoa_id FROM card_comentarios WHERE id = $1 AND card_id = $2`,
      [req.params.comentarioId, req.params.id],
    );
    if (!atual.rows[0]) throw new NaoEncontradoError('Comentário não encontrado');
    if (atual.rows[0].pessoa_id !== req.pessoa.id && !ctx.isAdmin) {
      throw new NaoAutorizadoError('Só o autor pode excluir o comentário.');
    }

    await query(
      `DELETE FROM card_comentarios WHERE id = $1 AND card_id = $2`,
      [req.params.comentarioId, req.params.id],
    );
    res.status(204).send();
  } catch (err) { next(err); }
}

// ===========================================================================
// ANEXOS  (mesmo padrão de contas_pagar_anexos)
// ===========================================================================

const anexoSchema = z.object({
  descricao: z.string().max(500).optional().nullable(),
});

/**
 * GET /api/cards/:id/anexos
 */
export async function listarAnexos(req, res, next) {
  try {
    await contextoCard(req, req.params.id);
    const { rows } = await query(
      `SELECT a.*, p.nome AS enviado_por_nome
         FROM card_anexos a
         LEFT JOIN pessoas_acesso p ON p.id = a.enviado_por_id
        WHERE a.card_id = $1
        ORDER BY a.criado_em DESC`,
      [req.params.id],
    );
    res.json(rows);
  } catch (err) { next(err); }
}

/**
 * POST /api/cards/:id/anexos  (multipart: arquivo + descricao opcional)
 */
export async function criarAnexo(req, res, next) {
  try {
    if (!req.file) throw new AppError('Nenhum arquivo enviado.', 400);
    await contextoCard(req, req.params.id, { exigirEdicao: true });

    const d = anexoSchema.parse({ descricao: req.body.descricao || null });

    const { rows } = await query(
      `INSERT INTO card_anexos (
         card_id, nome_original, arquivo_path, mime_type,
         tamanho_bytes, descricao, enviado_por_id
       ) VALUES ($1, $2, $3, $4, $5, $6, $7)
       RETURNING *`,
      [
        req.params.id,
        req.file.originalname,
        caminhoRelativo(req.file),
        req.file.mimetype,
        req.file.size,
        d.descricao,
        req.pessoa.id,
      ],
    );

    registrarAcao({
      acao: 'card.anexo.criou',
      pessoa_acesso_id: req.pessoa.id,
      detalhes: { card_id: req.params.id, anexo_id: rows[0].id, nome: req.file.originalname },
      req,
    });

    res.status(201).json(rows[0]);
  } catch (err) {
    if (req.file) { try { await fs.unlink(req.file.path); } catch {} }
    next(err);
  }
}

/**
 * GET /api/cards/:id/anexos/:anexoId/baixar  (inline)
 */
export async function baixarAnexo(req, res, next) {
  try {
    await contextoCard(req, req.params.id);
    const { rows } = await query(
      `SELECT * FROM card_anexos WHERE id = $1 AND card_id = $2`,
      [req.params.anexoId, req.params.id],
    );
    if (!rows[0]) throw new NaoEncontradoError('Anexo não encontrado');
    const anexo = rows[0];

    const abs = resolverCaminhoAbsoluto(anexo.arquivo_path);
    try {
      await fs.access(abs);
    } catch {
      throw new AppError(
        'Arquivo não encontrado no servidor (possível perda em redeploy sem volume).',
        410, 'arquivo_perdido',
      );
    }

    res.setHeader('Content-Type', anexo.mime_type || 'application/octet-stream');
    // Como aceitamos qualquer tipo, forcamos download (nunca render inline)
    // e desligamos o content-sniffing — evita XSS via HTML/SVG anexado.
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader(
      'Content-Disposition',
      'attachment; filename="' + encodeURIComponent(anexo.nome_original) + '"',
    );
    const stream = (await import('node:fs')).createReadStream(abs);
    stream.pipe(res);
    stream.on('error', (err) => next(err));
  } catch (err) { next(err); }
}

/**
 * DELETE /api/cards/:id/anexos/:anexoId
 */
export async function excluirAnexo(req, res, next) {
  try {
    await contextoCard(req, req.params.id, { exigirEdicao: true });
    const { rows } = await query(
      `DELETE FROM card_anexos WHERE id = $1 AND card_id = $2
        RETURNING arquivo_path, nome_original`,
      [req.params.anexoId, req.params.id],
    );
    if (!rows[0]) throw new NaoEncontradoError('Anexo não encontrado');

    if (rows[0].arquivo_path) await apagarArquivo(rows[0].arquivo_path);

    registrarAcao({
      acao: 'card.anexo.excluiu',
      pessoa_acesso_id: req.pessoa.id,
      detalhes: { card_id: req.params.id, anexo_id: req.params.anexoId, nome: rows[0].nome_original },
      req,
    });

    res.status(204).send();
  } catch (err) { next(err); }
}

// ===========================================================================
// ATIVIDADES  (feed lido do log_acoes filtrando por card_id em detalhes)
// ===========================================================================

/**
 * GET /api/cards/:id/atividades
 *
 * Lê o log de auditoria (log_acoes) onde detalhes->>'card_id' = card.
 * Cobre ações de card (criou/editou/moveu/arquivou) + checklist/comentário/
 * anexo (Sprint 32). Devolve já em ordem cronológica reversa.
 */
export async function listarAtividades(req, res, next) {
  try {
    await contextoCard(req, req.params.id);
    const { rows } = await query(
      `SELECT l.id, l.acao, l.detalhes, l.created_at, p.nome AS pessoa_nome
         FROM log_acoes l
         LEFT JOIN pessoas_acesso p ON p.id = l.pessoa_acesso_id
        WHERE l.detalhes->>'card_id' = $1
        ORDER BY l.created_at DESC
        LIMIT 80`,
      [req.params.id],
    );
    res.json(rows);
  } catch (err) { next(err); }
}
