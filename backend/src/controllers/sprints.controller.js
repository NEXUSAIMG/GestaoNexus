import { z } from 'zod';
import { query, pool } from '../config/database.js';
import { NaoEncontradoError, AppError, NaoAutorizadoError } from '../utils/errors.js';
import { registrarAcao } from '../utils/audit.js';
import { podeVerQuadro } from './quadros.controller.js';
import { publicarMudanca } from '../services/realtime.service.js';

/**
 * Sprints — Sprint 41.
 *
 * Sprint e um compromisso time-boxed filho de um quadro. VARIAS podem estar
 * 'ativa' ao mesmo tempo (correm em paralelo, cada uma vira uma raia sobre
 * as mesmas colunas de fluxo do quadro).
 *
 * O card aponta pra sprint via cards.sprint_id (NULL = backlog do produto).
 * "Puxar do backlog" = setar sprint_id num lote de cards. Encerrar a sprint
 * devolve os cards NAO concluidos pro destino escolhido (backlog por padrao,
 * ou outra sprint); os concluidos ficam presos a ela pra historico/velocidade.
 */

const dataIso = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Data deve estar em YYYY-MM-DD');

const criarSchema = z.object({
  quadro_id: z.string().uuid(),
  nome: z.string().min(1).max(100),
  meta: z.string().max(2000).optional().nullable(),
  data_inicio: dataIso,
  data_fim: dataIso,
  capacidade_pontos: z.number().int().min(0).max(100000).optional().nullable(),
  ordem: z.number().int().min(0).optional(),
});

const atualizarSchema = z.object({
  nome: z.string().min(1).max(100).optional(),
  meta: z.string().max(2000).optional().nullable(),
  data_inicio: dataIso.optional(),
  data_fim: dataIso.optional(),
  capacidade_pontos: z.number().int().min(0).max(100000).optional().nullable(),
  estado: z.enum(['planejamento', 'ativa', 'encerrada']).optional(),
  ordem: z.number().int().min(0).optional(),
});

const puxarSchema = z.object({
  card_ids: z.array(z.string().uuid()).min(1),
});

const encerrarSchema = z.object({
  // 'backlog' devolve os cards nao concluidos ao backlog do produto;
  // um uuid move-os pra outra sprint (do mesmo quadro).
  destino: z.union([z.literal('backlog'), z.string().uuid()]).optional().default('backlog'),
});

// Selecao com selos de progresso (pontos comprometidos vs concluidos).
const SPRINT_SELECT = `
  SELECT s.*,
         (SELECT COUNT(*)::int FROM cards c
           WHERE c.sprint_id = s.id AND c.arquivado_em IS NULL) AS n_cards,
         (SELECT COUNT(*)::int FROM cards c
           WHERE c.sprint_id = s.id AND c.arquivado_em IS NULL
             AND c.concluido_em IS NOT NULL) AS n_concluidos,
         (SELECT COALESCE(SUM(c.pontos), 0)::int FROM cards c
           WHERE c.sprint_id = s.id AND c.arquivado_em IS NULL) AS pontos_comprometidos,
         (SELECT COALESCE(SUM(c.pontos), 0)::int FROM cards c
           WHERE c.sprint_id = s.id AND c.arquivado_em IS NULL
             AND c.concluido_em IS NOT NULL) AS pontos_concluidos
    FROM sprints s
`;

function serializar(s) {
  return {
    id: s.id,
    quadro_id: s.quadro_id,
    nome: s.nome,
    meta: s.meta ?? null,
    data_inicio: s.data_inicio,
    data_fim: s.data_fim,
    estado: s.estado,
    capacidade_pontos: s.capacidade_pontos ?? null,
    ordem: s.ordem,
    encerrada_em: s.encerrada_em ?? null,
    criado_em: s.criado_em,
    atualizado_em: s.atualizado_em,
    n_cards: s.n_cards != null ? Number(s.n_cards) : 0,
    n_concluidos: s.n_concluidos != null ? Number(s.n_concluidos) : 0,
    pontos_comprometidos: s.pontos_comprometidos != null ? Number(s.pontos_comprometidos) : 0,
    pontos_concluidos: s.pontos_concluidos != null ? Number(s.pontos_concluidos) : 0,
  };
}

async function selecionarSprint(id) {
  const { rows } = await query(`${SPRINT_SELECT} WHERE s.id = $1`, [id]);
  return rows[0] || null;
}

// Carrega a sprint "crua" (sem selos) + valida existencia. Devolve a row.
async function carregarSprintBase(id) {
  const { rows } = await query(
    `SELECT id, quadro_id, estado FROM sprints WHERE id = $1`,
    [id],
  );
  if (!rows[0]) throw new NaoEncontradoError('Sprint nao encontrada');
  return rows[0];
}

async function exigirEdicao(req, quadroId) {
  const isAdmin = !!req.pessoa?.administrador;
  const { pode, podeEditar } = await podeVerQuadro(req.pessoa.id, isAdmin, quadroId);
  if (!pode) throw new NaoAutorizadoError('Voce nao tem acesso a este quadro.');
  if (!podeEditar) throw new NaoAutorizadoError('Sem permissao para editar este quadro.');
}

/**
 * GET /api/sprints?quadro_id=...
 * Lista as sprints do quadro (com selos de progresso).
 */
export async function listar(req, res, next) {
  try {
    const quadroId = z.string().uuid().parse(req.query.quadro_id);
    const isAdmin = !!req.pessoa?.administrador;
    const { pode } = await podeVerQuadro(req.pessoa.id, isAdmin, quadroId);
    if (!pode) throw new NaoAutorizadoError('Voce nao tem acesso a este quadro.');

    const { rows } = await query(
      `${SPRINT_SELECT}
        WHERE s.quadro_id = $1
        ORDER BY CASE s.estado
                   WHEN 'ativa' THEN 0
                   WHEN 'planejamento' THEN 1
                   ELSE 2
                 END,
                 s.data_inicio DESC, s.ordem`,
      [quadroId],
    );
    res.json(rows.map(serializar));
  } catch (err) { next(err); }
}

/**
 * POST /api/sprints
 */
export async function criar(req, res, next) {
  try {
    const d = criarSchema.parse(req.body);
    if (d.data_fim < d.data_inicio) {
      throw new AppError('A data de fim nao pode ser antes do inicio.', 400);
    }
    await exigirEdicao(req, d.quadro_id);

    const { rows } = await query(
      `INSERT INTO sprints
         (quadro_id, nome, meta, data_inicio, data_fim, capacidade_pontos, ordem, criado_por_id)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       RETURNING id`,
      [
        d.quadro_id, d.nome.trim(), d.meta?.trim() || null,
        d.data_inicio, d.data_fim, d.capacidade_pontos ?? null,
        d.ordem ?? 0, req.pessoa.id,
      ],
    );
    const id = rows[0].id;

    registrarAcao({
      acao: 'sprint.criou',
      pessoa_acesso_id: req.pessoa.id,
      detalhes: { sprint_id: id, quadro_id: d.quadro_id, nome: d.nome },
      req,
    });

    res.status(201).json(serializar(await selecionarSprint(id)));
  } catch (err) { next(err); }
}

/**
 * PUT /api/sprints/:id
 */
export async function atualizar(req, res, next) {
  try {
    const base = await carregarSprintBase(req.params.id);
    await exigirEdicao(req, base.quadro_id);

    const d = atualizarSchema.parse(req.body);

    const updates = [];
    const params = [];
    for (const [k, v] of Object.entries(d)) {
      if (v === undefined) continue;
      params.push(typeof v === 'string' ? v.trim() : v);
      updates.push(`${k} = $${params.length}`);
    }
    if (updates.length > 0) {
      updates.push(`atualizado_em = now()`);
      params.push(req.params.id);
      await query(
        `UPDATE sprints SET ${updates.join(', ')} WHERE id = $${params.length}`,
        params,
      );
    }

    publicarMudanca(base.quadro_id, 'sprint_editada');
    res.json(serializar(await selecionarSprint(req.params.id)));
  } catch (err) { next(err); }
}

/**
 * POST /api/sprints/:id/ativar
 */
export async function ativar(req, res, next) {
  try {
    const base = await carregarSprintBase(req.params.id);
    await exigirEdicao(req, base.quadro_id);

    await query(
      `UPDATE sprints SET estado = 'ativa', encerrada_em = NULL, atualizado_em = now()
        WHERE id = $1`,
      [req.params.id],
    );
    publicarMudanca(base.quadro_id, 'sprint_ativada');
    res.json(serializar(await selecionarSprint(req.params.id)));
  } catch (err) { next(err); }
}

/**
 * POST /api/sprints/:id/encerrar
 * Body: { destino: 'backlog' | <sprint_id> }
 * Move os cards NAO concluidos pro destino; os concluidos ficam na sprint.
 */
export async function encerrar(req, res, next) {
  const client = await pool.connect();
  try {
    const base = await carregarSprintBase(req.params.id);
    await exigirEdicao(req, base.quadro_id);

    const { destino } = encerrarSchema.parse(req.body ?? {});

    let destinoSprintId = null;
    if (destino !== 'backlog') {
      if (destino === req.params.id) {
        throw new AppError('O destino nao pode ser a propria sprint.', 400);
      }
      const { rows } = await query(
        `SELECT id FROM sprints WHERE id = $1 AND quadro_id = $2`,
        [destino, base.quadro_id],
      );
      if (!rows[0]) throw new AppError('Sprint de destino invalida (outro quadro?).', 400);
      destinoSprintId = destino;
    }

    await client.query('BEGIN');

    // Cards nao concluidos e nao arquivados vao pro destino.
    const upd = await client.query(
      `UPDATE cards
          SET sprint_id = $2, atualizado_em = now()
        WHERE sprint_id = $1
          AND arquivado_em IS NULL
          AND concluido_em IS NULL`,
      [req.params.id, destinoSprintId],
    );

    await client.query(
      `UPDATE sprints
          SET estado = 'encerrada', encerrada_em = now(), atualizado_em = now()
        WHERE id = $1`,
      [req.params.id],
    );

    await client.query('COMMIT');

    registrarAcao({
      acao: 'sprint.encerrou',
      pessoa_acesso_id: req.pessoa.id,
      detalhes: {
        sprint_id: req.params.id,
        quadro_id: base.quadro_id,
        cards_movidos: upd.rowCount,
        destino: destinoSprintId ?? 'backlog',
      },
      req,
    });

    publicarMudanca(base.quadro_id, 'sprint_encerrada');
    res.json({
      sprint: serializar(await selecionarSprint(req.params.id)),
      cards_movidos: upd.rowCount,
      destino: destinoSprintId ?? 'backlog',
    });
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    next(err);
  } finally {
    client.release();
  }
}

/**
 * DELETE /api/sprints/:id
 * Remove a sprint. Os cards voltam pro backlog (sprint_id vira NULL via
 * ON DELETE SET NULL), nada e apagado.
 */
export async function remover(req, res, next) {
  try {
    const base = await carregarSprintBase(req.params.id);
    await exigirEdicao(req, base.quadro_id);

    await query(`DELETE FROM sprints WHERE id = $1`, [req.params.id]);

    registrarAcao({
      acao: 'sprint.removeu',
      pessoa_acesso_id: req.pessoa.id,
      detalhes: { sprint_id: req.params.id, quadro_id: base.quadro_id },
      req,
    });

    publicarMudanca(base.quadro_id, 'sprint_removida');
    res.status(204).end();
  } catch (err) { next(err); }
}

/**
 * POST /api/sprints/:id/cards  { card_ids: [...] }
 * "Puxar do backlog": vincula um lote de cards de PROJETO a esta sprint.
 */
export async function puxarCards(req, res, next) {
  try {
    const base = await carregarSprintBase(req.params.id);
    await exigirEdicao(req, base.quadro_id);

    const { card_ids } = puxarSchema.parse(req.body);

    // So move cards de projeto, do mesmo quadro, vivos. Sustentacao nao entra
    // em sprint (fluxo diferente).
    const upd = await query(
      `UPDATE cards
          SET sprint_id = $1, atualizado_em = now()
        WHERE id = ANY($2::uuid[])
          AND quadro_id = $3
          AND fluxo = 'projeto'
          AND arquivado_em IS NULL`,
      [req.params.id, card_ids, base.quadro_id],
    );

    publicarMudanca(base.quadro_id, 'sprint_cards');
    res.json({
      movidos: upd.rowCount,
      sprint: serializar(await selecionarSprint(req.params.id)),
    });
  } catch (err) { next(err); }
}

/**
 * DELETE /api/sprints/:id/cards/:cardId
 * Tira um card da sprint (volta pro backlog do produto).
 */
export async function removerCard(req, res, next) {
  try {
    const base = await carregarSprintBase(req.params.id);
    await exigirEdicao(req, base.quadro_id);

    await query(
      `UPDATE cards SET sprint_id = NULL, atualizado_em = now()
        WHERE id = $1 AND sprint_id = $2`,
      [req.params.cardId, req.params.id],
    );

    publicarMudanca(base.quadro_id, 'sprint_cards');
    res.status(204).end();
  } catch (err) { next(err); }
}
