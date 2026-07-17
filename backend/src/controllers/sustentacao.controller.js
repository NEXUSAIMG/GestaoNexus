import { z } from 'zod';
import { query } from '../config/database.js';
import { NaoEncontradoError, AppError, NaoAutorizadoError } from '../utils/errors.js';
import { registrarAcao } from '../utils/audit.js';
import { podeVerQuadro } from './quadros.controller.js';
import { publicarMudanca } from '../services/realtime.service.js';

/**
 * Sustentação — Sprint 41 (fluxo reativo/contínuo).
 *
 * Diferente do projeto (que vive em colunas do kanban), sustentação é uma
 * FILA VIVA com ciclo próprio: aberto → triado → atendendo → aguardando →
 * resolvido, com severidade e SLA. Reaproveita a tabela `cards` (fluxo=
 * 'sustentacao'); por causa do NOT NULL de coluna_id, os cards moram numa
 * coluna oculta do tipo 'sustentacao' (criada sob demanda) e nunca aparecem
 * no kanban. Um chamado pode ser "promovido" para uma sprint (vira projeto).
 */

const STATUS = ['aberto', 'triado', 'atendendo', 'aguardando', 'resolvido'];
const SEVERIDADES = ['baixa', 'media', 'alta', 'critica'];
const isoDateTime = z.string().regex(
  /^\d{4}-\d{2}-\d{2}([T ]\d{2}:\d{2}(:\d{2})?(\.\d+)?(Z|[+-]\d{2}:?\d{2})?)?$/,
  'Data/hora inválida',
);

const criarSchema = z.object({
  quadro_id: z.string().uuid(),
  titulo: z.string().min(1).max(255),
  descricao: z.string().max(20000).optional().nullable(),
  severidade: z.enum(SEVERIDADES).optional().nullable(),
  canal_origem: z.string().max(120).optional().nullable(),
  sla_vence_em: isoDateTime.optional().nullable(),
});

const atualizarSchema = z.object({
  titulo: z.string().min(1).max(255).optional(),
  descricao: z.string().max(20000).nullable().optional(),
  sustentacao_status: z.enum(STATUS).optional(),
  severidade: z.enum(SEVERIDADES).nullable().optional(),
  canal_origem: z.string().max(120).nullable().optional(),
  sla_vence_em: isoDateTime.nullable().optional(),
});

const promoverSchema = z.object({
  sprint_id: z.string().uuid().optional().nullable(),
});

function serializar(c) {
  return {
    id: c.id,
    quadro_id: c.quadro_id,
    titulo: c.titulo,
    descricao: c.descricao ?? null,
    sustentacao_status: c.sustentacao_status ?? 'aberto',
    severidade: c.severidade ?? null,
    sla_vence_em: c.sla_vence_em ?? null,
    canal_origem: c.canal_origem ?? null,
    sprint_id: c.sprint_id ?? null,
    concluido_em: c.concluido_em ?? null,
    criado_em: c.criado_em,
    atualizado_em: c.atualizado_em,
  };
}

async function exigirVer(req, quadroId) {
  const isAdmin = !!req.pessoa?.administrador;
  const r = await podeVerQuadro(req.pessoa.id, isAdmin, quadroId);
  if (!r.pode) throw new NaoAutorizadoError('Você não tem acesso a este quadro.');
  return r;
}
async function exigirEdicao(req, quadroId) {
  const r = await exigirVer(req, quadroId);
  if (!r.podeEditar) throw new NaoAutorizadoError('Sem permissão para editar este quadro.');
}

// Coluna oculta 'sustentacao' do quadro — cria sob demanda.
async function colunaSustentacao(quadroId) {
  const r = await query(
    `SELECT id FROM colunas
      WHERE quadro_id = $1 AND tipo = 'sustentacao' AND arquivada_em IS NULL
      ORDER BY ordem LIMIT 1`,
    [quadroId],
  );
  if (r.rows[0]) return r.rows[0].id;
  const ins = await query(
    `INSERT INTO colunas (quadro_id, nome, ordem, tipo)
     VALUES ($1, 'Sustentação', 99000, 'sustentacao') RETURNING id`,
    [quadroId],
  );
  return ins.rows[0].id;
}

async function carregarChamado(id) {
  const { rows } = await query(
    `SELECT id, quadro_id, titulo, descricao, sustentacao_status, severidade,
            sla_vence_em, canal_origem, sprint_id, concluido_em, criado_em, atualizado_em, fluxo
       FROM cards WHERE id = $1 AND arquivado_em IS NULL`,
    [id],
  );
  const c = rows[0];
  if (!c || c.fluxo !== 'sustentacao') throw new NaoEncontradoError('Chamado não encontrado');
  return c;
}

/**
 * GET /api/sustentacao?quadro_id=...
 * Fila de sustentação do quadro (aberto → ... → resolvido).
 */
export async function listar(req, res, next) {
  try {
    const quadroId = z.string().uuid().parse(req.query.quadro_id);
    await exigirVer(req, quadroId);
    const { rows } = await query(
      `SELECT id, quadro_id, titulo, descricao, sustentacao_status, severidade,
              sla_vence_em, canal_origem, sprint_id, concluido_em, criado_em, atualizado_em
         FROM cards
        WHERE quadro_id = $1 AND fluxo = 'sustentacao' AND arquivado_em IS NULL
        ORDER BY
          CASE sustentacao_status
            WHEN 'aberto' THEN 0 WHEN 'triado' THEN 1 WHEN 'atendendo' THEN 2
            WHEN 'aguardando' THEN 3 WHEN 'resolvido' THEN 4 ELSE 5 END,
          sla_vence_em ASC NULLS LAST,
          criado_em ASC`,
      [quadroId],
    );
    res.json(rows.map(serializar));
  } catch (err) { next(err); }
}

/**
 * POST /api/sustentacao  { quadro_id, titulo, ... }
 * Abre um chamado (fluxo='sustentacao', status 'aberto').
 */
export async function criar(req, res, next) {
  try {
    const d = criarSchema.parse(req.body);
    await exigirEdicao(req, d.quadro_id);
    const colunaId = await colunaSustentacao(d.quadro_id);
    const { rows } = await query(
      `INSERT INTO cards
         (coluna_id, quadro_id, titulo, descricao, fluxo, sustentacao_status,
          severidade, sla_vence_em, canal_origem, criado_por_id)
       VALUES ($1, $2, $3, $4, 'sustentacao', 'aberto', $5, $6, $7, $8)
       RETURNING id`,
      [
        colunaId, d.quadro_id, d.titulo.trim(), d.descricao?.trim() || null,
        d.severidade ?? null, d.sla_vence_em || null, d.canal_origem?.trim() || null,
        req.pessoa.id,
      ],
    );
    registrarAcao({
      acao: 'sustentacao.abriu',
      pessoa_acesso_id: req.pessoa.id,
      detalhes: { card_id: rows[0].id, quadro_id: d.quadro_id, titulo: d.titulo },
      req,
    });
    publicarMudanca(d.quadro_id, 'sustentacao');
    res.status(201).json(serializar(await carregarChamado(rows[0].id)));
  } catch (err) { next(err); }
}

/**
 * PATCH /api/sustentacao/:id
 * Muda status na fila / severidade / SLA / canal / título / descrição.
 * status='resolvido' carimba concluido_em; sair de resolvido limpa.
 */
export async function atualizar(req, res, next) {
  try {
    const base = await carregarChamado(req.params.id);
    await exigirEdicao(req, base.quadro_id);
    const d = atualizarSchema.parse(req.body);

    const updates = [];
    const params = [];
    for (const [k, v] of Object.entries(d)) {
      if (v === undefined) continue;
      params.push(typeof v === 'string' ? v.trim() : v);
      updates.push(`${k} = $${params.length}`);
    }
    // carimbo de conclusão quando entra/sai de 'resolvido'
    if (d.sustentacao_status === 'resolvido') {
      updates.push('concluido_em = COALESCE(concluido_em, now())');
    } else if (d.sustentacao_status !== undefined) {
      updates.push('concluido_em = NULL');
    }
    if (updates.length > 0) {
      updates.push('atualizado_em = now()');
      params.push(req.params.id);
      await query(`UPDATE cards SET ${updates.join(', ')} WHERE id = $${params.length}`, params);
    }
    publicarMudanca(base.quadro_id, 'sustentacao');
    res.json(serializar(await carregarChamado(req.params.id)));
  } catch (err) { next(err); }
}

/**
 * POST /api/sustentacao/:id/promover  { sprint_id? }
 * Promove o chamado a trabalho de PROJETO: vira fluxo='projeto', vai pra
 * coluna backlog (ou a primeira) e, se informado, entra numa sprint.
 */
export async function promover(req, res, next) {
  try {
    const base = await carregarChamado(req.params.id);
    await exigirEdicao(req, base.quadro_id);
    const { sprint_id } = promoverSchema.parse(req.body ?? {});

    if (sprint_id) {
      const s = await query(
        `SELECT id FROM sprints WHERE id = $1 AND quadro_id = $2`,
        [sprint_id, base.quadro_id],
      );
      if (!s.rows[0]) throw new AppError('Sprint inválida (outro quadro?).', 400);
    }

    // Coluna de destino: backlog do quadro, senão a primeira não-sustentação.
    const col = await query(
      `SELECT id FROM colunas
        WHERE quadro_id = $1 AND arquivada_em IS NULL AND tipo <> 'sustentacao'
        ORDER BY CASE WHEN tipo = 'backlog' THEN 0 ELSE 1 END, ordem
        LIMIT 1`,
      [base.quadro_id],
    );
    if (!col.rows[0]) throw new AppError('O quadro não tem coluna de destino.', 400);

    await query(
      `UPDATE cards
          SET fluxo = 'projeto', sprint_id = $2, coluna_id = $3,
              sustentacao_status = NULL, sla_vence_em = NULL, canal_origem = NULL,
              atualizado_em = now()
        WHERE id = $1`,
      [req.params.id, sprint_id ?? null, col.rows[0].id],
    );

    registrarAcao({
      acao: 'sustentacao.promoveu',
      pessoa_acesso_id: req.pessoa.id,
      detalhes: { card_id: req.params.id, quadro_id: base.quadro_id, sprint_id: sprint_id ?? null },
      req,
    });
    publicarMudanca(base.quadro_id, 'sustentacao');
    res.json({ ok: true, card_id: req.params.id, sprint_id: sprint_id ?? null });
  } catch (err) { next(err); }
}

/**
 * DELETE /api/sustentacao/:id — arquiva o chamado (não apaga).
 */
export async function remover(req, res, next) {
  try {
    const base = await carregarChamado(req.params.id);
    await exigirEdicao(req, base.quadro_id);
    await query(`UPDATE cards SET arquivado_em = now() WHERE id = $1`, [req.params.id]);
    publicarMudanca(base.quadro_id, 'sustentacao');
    res.status(204).end();
  } catch (err) { next(err); }
}
