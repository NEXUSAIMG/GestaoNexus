import { z } from 'zod';
import { query, pool } from '../config/database.js';
import { NaoEncontradoError, AppError, NaoAutorizadoError } from '../utils/errors.js';
import { registrarAcao } from '../utils/audit.js';
import { podeVerQuadro, montarCardDoQuadro } from './quadros.controller.js';
import { presetSchema } from '../utils/kanban-visual.js';
import {
  disparar,
  notificarPessoas,
  lerConfig,
} from '../services/notificacoes.service.js';
import { tplCardAtribuido } from '../services/email-templates.js';
import { avancarApos } from '../services/instancias.service.js';
// Sprint 34 — hierarquia e dependencias
import { bloqueadoresAbertos, criariaCicloHierarquia } from './projetos.controller.js';
// Sprint 36 — motor de automação
import { dispararEmBackground } from '../services/automacoes.service.js';
// Sprint 38.1 — tempo real
import { publicarMudanca } from '../services/realtime.service.js';

/**
 * Cards — Sprint 10 + Sprint 18 (múltiplos responsáveis).
 *
 * Card pertence a uma coluna (e por denormalização, a um quadro).
 * Mover entre colunas é o caso comum (drag & drop). Mover entre
 * quadros não é suportado.
 *
 * Sprint 18: múltiplos responsáveis via tabela N:N `cards_responsaveis`.
 * A coluna legada `cards.responsavel_id` é mantida e sincronizada pelo
 * trigger sync_card_responsavel_principal (= primeiro da lista).
 *
 * Notificação: ao atribuir responsável, se a pessoa for diferente do
 * criador/editor, notificamos in-app + e-mail (se config permitir).
 * Por simplicidade, notificamos apenas o "principal" (1 pessoa); fan-out
 * pra todos os responsáveis pode entrar em iteração futura.
 */

const dataIso = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Data deve estar em YYYY-MM-DD');

// Sprint 32 — token de cor da capa (mesma paleta das etiquetas)
const corCapa = z.enum([
  'slate', 'red', 'orange', 'amber', 'yellow', 'lime', 'emerald',
  'teal', 'cyan', 'blue', 'indigo', 'violet', 'fuchsia', 'pink', 'rose',
]);

const criarSchema = z.object({
  coluna_id: z.string().uuid(),
  titulo: z.string().min(1).max(255),
  descricao: z.string().max(20000).optional().nullable(),
  // responsavel_id (singular) mantido por back-compat. Sprint 18: prefira responsavel_ids.
  // Se ambos vierem, responsavel_ids ganha.
  responsavel_id: z.string().uuid().optional().nullable(),
  responsavel_ids: z.array(z.string().uuid()).optional(),
  data_prazo: dataIso.optional().nullable(),
  // Sprint 32
  data_inicio: dataIso.optional().nullable(),
  prazo_concluido: z.boolean().optional(),
  capa_cor: corCapa.optional().nullable(),
  // Sprint 34 — 0=P0 critico ... 3=baixa (2 = normal)
  prioridade: z.number().int().min(0).max(3).optional(),
  estimativa_horas: z.number().min(0).max(9999).optional().nullable(),
  pontos: z.number().int().min(0).max(999).optional().nullable(),
  card_pai_id: z.string().uuid().optional().nullable(),
  etiqueta_ids: z.array(z.string().uuid()).optional().default([]),
  posicao: z.number().int().min(0).optional(),
});

const atualizarSchema = z.object({
  titulo: z.string().min(1).max(255).optional(),
  descricao: z.string().max(20000).optional().nullable(),
  // Sprint 18: prefira responsavel_ids. Singular continua aceito por back-compat.
  responsavel_id: z.string().uuid().nullable().optional(),
  responsavel_ids: z.array(z.string().uuid()).optional(),
  data_prazo: dataIso.nullable().optional(),
  // Sprint 32
  data_inicio: dataIso.nullable().optional(),
  prazo_concluido: z.boolean().optional(),
  capa_cor: corCapa.nullable().optional(),
  // Sprint 39 — capa por preset de gradiente (alternativa a capa_cor)
  capa_preset: presetSchema,
  // Sprint 34
  prioridade: z.number().int().min(0).max(3).optional(),
  estimativa_horas: z.number().min(0).max(9999).nullable().optional(),
  pontos: z.number().int().min(0).max(999).nullable().optional(),
  card_pai_id: z.string().uuid().nullable().optional(),
  etiqueta_ids: z.array(z.string().uuid()).optional(),
});

const moverSchema = z.object({
  coluna_id: z.string().uuid(),
  posicao: z.number().int().min(0),
  // Sprint 34 — o quadro avisa quando ha bloqueador aberto e devolve 409.
  // A UI reenvia com forcar=true se a pessoa decidir mover mesmo assim.
  forcar: z.boolean().optional().default(false),
});

// =============================================================================
// Helpers de ordem (mesmo esquema das colunas)
// =============================================================================

async function calcularOrdemCard(client, colunaId, posicaoDesejada, excluirId = null) {
  const params = [colunaId];
  let excluiSql = '';
  if (excluirId) {
    params.push(excluirId);
    excluiSql = `AND id <> $${params.length}`;
  }
  const { rows: lista } = await client.query(
    `SELECT id, ordem FROM cards
      WHERE coluna_id = $1 AND arquivado_em IS NULL ${excluiSql}
      ORDER BY ordem`,
    params,
  );

  const antes = posicaoDesejada > 0 ? lista[posicaoDesejada - 1] : null;
  const depois = posicaoDesejada < lista.length ? lista[posicaoDesejada] : null;

  if (!antes && !depois) return 1000;
  if (!antes) return Number(depois.ordem) - 1000;
  if (!depois) return Number(antes.ordem) + 1000;

  const meio = Math.floor((Number(antes.ordem) + Number(depois.ordem)) / 2);
  if (meio === Number(antes.ordem) || meio === Number(depois.ordem)) {
    await renormalizarCards(client, colunaId);
    return calcularOrdemCard(client, colunaId, posicaoDesejada, excluirId);
  }
  return meio;
}

async function renormalizarCards(client, colunaId) {
  const { rows } = await client.query(
    `SELECT id FROM cards
      WHERE coluna_id = $1 AND arquivado_em IS NULL
      ORDER BY ordem, criado_em`,
    [colunaId],
  );
  let ordem = 1000;
  for (const c of rows) {
    await client.query(`UPDATE cards SET ordem = $1 WHERE id = $2`, [ordem, c.id]);
    ordem += 1000;
  }
}

// =============================================================================
// Notificação de atribuição
// =============================================================================

/**
 * Avisa o responsável principal que foi atribuído num card. Só dispara se:
 *   - há responsável (cards.responsavel_id setado pelo trigger)
 *   - o responsável é diferente de quem fez a ação
 *   - a pessoa está ativa
 */
async function notificarAtribuicao(card, atribuidoPorId) {
  if (!card.responsavel_id) return;
  if (card.responsavel_id === atribuidoPorId) return;

  const { rows } = await query(
    `SELECT id, nome, email FROM pessoas_acesso
      WHERE id = $1 AND ativo = TRUE`,
    [card.responsavel_id],
  );
  const pessoa = rows[0];
  if (!pessoa) return;

  // Pega contexto extra (nome do quadro, da equipe) pro template
  const ctxR = await query(
    `SELECT q.id AS quadro_id, q.nome AS quadro_nome,
            e.nome AS equipe_nome,
            p.nome AS atribuido_por_nome
       FROM quadros q
       JOIN equipes e ON e.id = q.equipe_id
       LEFT JOIN pessoas_acesso p ON p.id = $2
      WHERE q.id = $1`,
    [card.quadro_id, atribuidoPorId],
  );
  const ctx = ctxR.rows[0] || {};

  const config = await lerConfig();
  const tpl = tplCardAtribuido({
    card,
    quadroNome: ctx.quadro_nome,
    equipeNome: ctx.equipe_nome,
    atribuidoPor: ctx.atribuido_por_nome,
  });

  await notificarPessoas({
    pessoas: [pessoa],
    tipo: 'tarefa.card_atribuido',
    titulo: `Você foi atribuído: ${card.titulo}`,
    descricao: ctx.quadro_nome
      ? `Quadro "${ctx.quadro_nome}"${ctx.equipe_nome ? ` · ${ctx.equipe_nome}` : ''}`
      : null,
    link: `/tarefas/${card.quadro_id}?card=${card.id}`,
    contexto: { card_id: card.id, quadro_id: card.quadro_id },
    email: (config.email_card_atribuido && pessoa.email)
      ? { assunto: tpl.assunto, html: tpl.html, template: 'card_atribuido' }
      : null,
  });
}

// =============================================================================
// Serializer
// =============================================================================

function serializar(c) {
  return {
    id: c.id,
    coluna_id: c.coluna_id,
    quadro_id: c.quadro_id,
    titulo: c.titulo,
    descricao: c.descricao,
    // Sprint 18: campo legado (= primeiro da N:N por trigger). Mantido pra back-compat.
    responsavel_id: c.responsavel_id,
    responsavel_nome: c.responsavel_nome,
    responsavel_email: c.responsavel_email,
    // Sprint 18: nova fonte da verdade. Array de { id, nome, email } em ordem.
    responsaveis: c.responsaveis ?? [],
    data_prazo: c.data_prazo,
    // Sprint 32
    data_inicio: c.data_inicio,
    prazo_concluido: !!c.prazo_concluido,
    capa_cor: c.capa_cor ?? null,
    capa_preset: c.capa_preset ?? null,
    // Sprint 34
    prioridade: c.prioridade ?? 2,
    estimativa_horas: c.estimativa_horas != null ? Number(c.estimativa_horas) : null,
    pontos: c.pontos ?? null,
    card_pai_id: c.card_pai_id ?? null,
    concluido_em: c.concluido_em ?? null,
    ordem: c.ordem,
    arquivado: !!c.arquivado_em,
    arquivado_em: c.arquivado_em,
    criado_em: c.criado_em,
    atualizado_em: c.atualizado_em,
    etiqueta_ids: c.etiqueta_ids ?? [],
  };
}

const SELECT_BASE = `
  SELECT c.*, p.nome AS responsavel_nome, p.email AS responsavel_email,
         COALESCE(
           (SELECT json_agg(ce.etiqueta_id) FROM cards_etiquetas ce WHERE ce.card_id = c.id),
           '[]'::json
         ) AS etiqueta_ids,
         COALESCE(
           (SELECT json_agg(
                     json_build_object('id', pa.id, 'nome', pa.nome, 'email', pa.email)
                     ORDER BY cr.ordem, cr.adicionado_em
                   )
              FROM cards_responsaveis cr
              JOIN pessoas_acesso pa ON pa.id = cr.pessoa_id
             WHERE cr.card_id = c.id),
           '[]'::json
         ) AS responsaveis
    FROM cards c
    LEFT JOIN pessoas_acesso p ON p.id = c.responsavel_id
`;

// =============================================================================
// Helper: resolve a lista final de responsáveis a partir do payload
// =============================================================================

/**
 * Aplica a regra de precedência (responsavel_ids > responsavel_id) e devolve
 * { lista, vieio } onde:
 *   - lista: array deduplicado de uuids (pode ser vazio)
 *   - veio: boolean, true se o payload mencionou QUALQUER campo de responsável
 *     (mesmo que vazio/null — sinaliza "limpar responsáveis").
 *
 * Usado no atualizar pra distinguir "não mexer" vs "limpar".
 */
function resolverResponsaveis(d) {
  if (d.responsavel_ids !== undefined) {
    return { lista: [...new Set(d.responsavel_ids)], veio: true };
  }
  if (d.responsavel_id !== undefined) {
    return { lista: d.responsavel_id ? [d.responsavel_id] : [], veio: true };
  }
  return { lista: [], veio: false };
}

async function validarResponsaveisAtivos(client, ids) {
  if (ids.length === 0) return;
  const { rows: ativas } = await client.query(
    `SELECT id FROM pessoas_acesso WHERE id = ANY($1::uuid[]) AND ativo = TRUE`,
    [ids],
  );
  if (ativas.length !== ids.length) {
    throw new AppError('Uma ou mais pessoas responsáveis não estão ativas.', 400);
  }
}

// =============================================================================
// CRUD
// =============================================================================

/**
 * GET /api/cards/meus
 *
 * Lista cards atribuídos à pessoa logada. Filtros opcionais:
 *   ?atrasados=true   → só com data_prazo < hoje
 *   ?proximos=true    → só com data_prazo entre hoje e +7 dias
 *
 * Sprint 18: usa a N:N pra cobrir múltiplos responsáveis. O EXISTS garante
 * que cada card aparece UMA vez mesmo se a pessoa estiver atribuída duas
 * vezes (não acontece, mas defesa em profundidade).
 */
export async function meusCards(req, res, next) {
  try {
    const partes = [
      `EXISTS (SELECT 1 FROM cards_responsaveis cr WHERE cr.card_id = c.id AND cr.pessoa_id = $1)`,
      `c.arquivado_em IS NULL`,
    ];
    const params = [req.pessoa.id];

    if (req.query.atrasados === 'true') {
      partes.push(`c.data_prazo < CURRENT_DATE`);
    }
    if (req.query.proximos === 'true') {
      partes.push(`c.data_prazo BETWEEN CURRENT_DATE AND CURRENT_DATE + INTERVAL '7 days'`);
    }

    const { rows } = await query(
      `${SELECT_BASE}
        WHERE ${partes.join(' AND ')}
        ORDER BY c.data_prazo NULLS LAST, c.atualizado_em DESC
        LIMIT 200`,
      params,
    );
    res.json(rows.map(serializar));
  } catch (err) { next(err); }
}

/**
 * GET /api/cards/:id
 * Retorna o card detalhado. Permite verificar permissão pelo quadro.
 */
export async function obter(req, res, next) {
  try {
    const cR = await query(`${SELECT_BASE} WHERE c.id = $1`, [req.params.id]);
    if (!cR.rows[0]) throw new NaoEncontradoError('Card não encontrado');

    const isAdmin = !!req.pessoa?.administrador;
    const { pode } = await podeVerQuadro(req.pessoa.id, isAdmin, cR.rows[0].quadro_id);
    if (!pode) throw new NaoAutorizadoError('Sem acesso.');

    res.json(serializar(cR.rows[0]));
  } catch (err) { next(err); }
}

/**
 * POST /api/cards
 */
export async function criar(req, res, next) {
  const client = await pool.connect();
  try {
    const d = criarSchema.parse(req.body);

    // Pega o quadro da coluna pra validar permissão (e o tipo, pra Sprint 37)
    const colR = await query(
      `SELECT quadro_id, tipo FROM colunas WHERE id = $1 AND arquivada_em IS NULL`,
      [d.coluna_id],
    );
    if (!colR.rows[0]) throw new NaoEncontradoError('Coluna não encontrada');
    const quadroId = colR.rows[0].quadro_id;
    const tipoColunaInicial = colR.rows[0].tipo;

    const isAdmin = !!req.pessoa?.administrador;
    const { podeEditar } = await podeVerQuadro(req.pessoa.id, isAdmin, quadroId);
    if (!podeEditar) throw new NaoAutorizadoError('Sem permissão.');

    await client.query('BEGIN');

    let ordem;
    if (d.posicao !== undefined) {
      ordem = await calcularOrdemCard(client, d.coluna_id, d.posicao);
    } else {
      const { rows: max } = await client.query(
        `SELECT COALESCE(MAX(ordem), 0) + 1000 AS prox
           FROM cards WHERE coluna_id = $1 AND arquivado_em IS NULL`,
        [d.coluna_id],
      );
      ordem = max[0].prox;
    }

    // Sprint 34 — card pai precisa ser do mesmo quadro.
    if (d.card_pai_id) {
      const paiR = await client.query(
        'SELECT quadro_id FROM cards WHERE id = $1 AND arquivado_em IS NULL',
        [d.card_pai_id],
      );
      if (!paiR.rows[0]) throw new NaoEncontradoError('Card pai nao encontrado');
      if (paiR.rows[0].quadro_id !== quadroId) {
        throw new AppError('O card pai precisa estar no mesmo quadro.', 400);
      }
    }

    // Sprint 37 — o card já nasce carimbado: `coluna_desde` conta o aging
    // desde o minuto zero, e se ele nasce fora do backlog o cycle time
    // começa a correr agora (é trabalho que já entrou na esteira).
    const nasceIniciado = tipoColunaInicial !== 'backlog';

    // INSERT do card sem responsavel_id — o trigger preenche a partir da N:N.
    const { rows } = await client.query(
      `INSERT INTO cards (
         coluna_id, quadro_id, titulo, descricao,
         data_prazo, data_inicio, capa_cor, ordem, criado_por_id,
         prioridade, estimativa_horas, pontos, card_pai_id,
         coluna_desde, iniciado_em
       ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13,
                 NOW(), $14) RETURNING id`,
      [
        d.coluna_id, quadroId, d.titulo.trim(), d.descricao?.trim() || null,
        d.data_prazo || null, d.data_inicio || null, d.capa_cor || null,
        ordem, req.pessoa.id,
        d.prioridade ?? 2, d.estimativa_horas ?? null, d.pontos ?? null,
        d.card_pai_id || null,
        nasceIniciado ? new Date().toISOString() : null,
      ],
    );
    const cardId = rows[0].id;

    // Movimento de entrada (de_coluna_id = NULL marca a criação).
    await client.query(
      `INSERT INTO cards_movimentos
         (card_id, quadro_id, de_coluna_id, para_coluna_id, de_tipo, para_tipo, pessoa_id)
       VALUES ($1, $2, NULL, $3, NULL, $4, $5)`,
      [cardId, quadroId, d.coluna_id, tipoColunaInicial, req.pessoa.id],
    );

    // Sprint 18 — múltiplos responsáveis.
    // Prioridade: responsavel_ids (array) > responsavel_id (singular, back-compat).
    const { lista: idsResp } = resolverResponsaveis(d);
    if (idsResp.length > 0) {
      await validarResponsaveisAtivos(client, idsResp);
      // INSERT unico multi-linha (antes: 1 round-trip por responsavel).
      const vals = [];
      const params = [];
      idsResp.forEach((pid, i) => {
        const base = params.length;
        params.push(cardId, pid, i, req.pessoa.id);
        vals.push(`($${base + 1}, $${base + 2}, $${base + 3}, $${base + 4})`);
      });
      await client.query(
        `INSERT INTO cards_responsaveis (card_id, pessoa_id, ordem, adicionado_por_id)
         VALUES ${vals.join(', ')}`,
        params,
      );
    }

    if (d.etiqueta_ids && d.etiqueta_ids.length > 0) {
      // Confere que todas as etiquetas pertencem ao mesmo quadro
      const { rows: validas } = await client.query(
        `SELECT id FROM quadros_etiquetas
          WHERE quadro_id = $1 AND id = ANY($2::uuid[])`,
        [quadroId, d.etiqueta_ids],
      );
      const idsValidos = new Set(validas.map((e) => e.id));
      const idsInvalidos = d.etiqueta_ids.filter((id) => !idsValidos.has(id));
      if (idsInvalidos.length > 0) {
        throw new AppError(`Etiqueta(s) não pertence(m) a este quadro: ${idsInvalidos.join(', ')}`, 400);
      }
      // INSERT unico multi-linha (antes: 1 round-trip por etiqueta).
      const vals = [];
      const params = [];
      d.etiqueta_ids.forEach((eid) => {
        const base = params.length;
        params.push(cardId, eid);
        vals.push(`($${base + 1}, $${base + 2})`);
      });
      await client.query(
        `INSERT INTO cards_etiquetas (card_id, etiqueta_id) VALUES ${vals.join(', ')}`,
        params,
      );
    }

    await client.query('COMMIT');

    registrarAcao({
      acao: 'card.criou',
      pessoa_acesso_id: req.pessoa.id,
      detalhes: { card_id: cardId, quadro_id: quadroId, titulo: d.titulo },
      req,
    });

    // Card no formato do board: serve tanto pra notificacao quanto pra
    // resposta que o front mescla localmente (sem refazer o quadro todo).
    const card = await montarCardDoQuadro(cardId);

    // Notifica responsável principal (= primeiro da N:N, espelhado em responsavel_id)
    if (card?.responsavel_id) {
      disparar(() => notificarAtribuicao(card, req.pessoa.id));
    }

    // Sprint 36 — gatilho de automação. Em background: se a regra falhar,
    // quem falhou foi a regra, não a criação do card.
    dispararEmBackground('card_criado', {
      quadroId,
      cardId,
      colunaId: d.coluna_id,
      pessoaId: req.pessoa.id,
    });

    publicarMudanca(quadroId, 'card_criado');
    res.status(201).json(card);
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    next(err);
  } finally {
    client.release();
  }
}

/**
 * PUT /api/cards/:id
 */
export async function atualizar(req, res, next) {
  const client = await pool.connect();
  try {
    const cAtual = await query(
      `SELECT id, quadro_id, responsavel_id FROM cards WHERE id = $1`,
      [req.params.id],
    );
    if (!cAtual.rows[0]) throw new NaoEncontradoError('Card não encontrado');

    const isAdmin = !!req.pessoa?.administrador;
    const { podeEditar } = await podeVerQuadro(req.pessoa.id, isAdmin, cAtual.rows[0].quadro_id);
    if (!podeEditar) throw new NaoAutorizadoError('Sem permissão.');

    const d = atualizarSchema.parse(req.body);
    const responsavelAnterior = cAtual.rows[0].responsavel_id;

    // Sprint 34 — mudanca de pai: mesmo quadro e sem ciclo na hierarquia.
    if (d.card_pai_id) {
      const paiR = await query(
        'SELECT quadro_id FROM cards WHERE id = $1 AND arquivado_em IS NULL',
        [d.card_pai_id],
      );
      if (!paiR.rows[0]) throw new NaoEncontradoError('Card pai nao encontrado');
      if (paiR.rows[0].quadro_id !== cAtual.rows[0].quadro_id) {
        throw new AppError('O card pai precisa estar no mesmo quadro.', 400);
      }
      if (await criariaCicloHierarquia({ query }, req.params.id, d.card_pai_id)) {
        throw new AppError('Essa hierarquia criaria um ciclo (o card ja e ancestral do pai).', 400);
      }
    }

    await client.query('BEGIN');

    // Monta UPDATE dinâmico apenas pros campos diretos da tabela cards.
    // Responsáveis e etiquetas são tratados separadamente (N:N).
    // Concatenação em vez de template literal pra evitar ambiguidade do "$$" em ferramentas.
    const updates = [];
    const params = [];
    for (const [k, v] of Object.entries(d)) {
      if (v === undefined) continue;
      if (k === 'etiqueta_ids') continue;
      if (k === 'responsavel_id') continue;
      if (k === 'responsavel_ids') continue;
      params.push(typeof v === 'string' ? v.trim() : v);
      updates.push(k + ' = $' + params.length);
    }

    if (updates.length > 0) {
      params.push(req.params.id);
      await client.query(
        'UPDATE cards SET ' + updates.join(', ') + ' WHERE id = $' + params.length,
        params,
      );
    }

    // Sprint 18 — Responsáveis: se veio responsavel_ids OU responsavel_id
    // explicitamente no payload, substitui o conjunto inteiro.
    const { lista: novoConjunto, veio } = resolverResponsaveis(d);
    if (veio) {
      await validarResponsaveisAtivos(client, novoConjunto);
      await client.query(`DELETE FROM cards_responsaveis WHERE card_id = $1`, [req.params.id]);
      if (novoConjunto.length > 0) {
        // INSERT unico multi-linha (antes: 1 round-trip por responsavel).
        const vals = [];
        const params = [];
        novoConjunto.forEach((pid, i) => {
          const base = params.length;
          params.push(req.params.id, pid, i, req.pessoa.id);
          vals.push(`($${base + 1}, $${base + 2}, $${base + 3}, $${base + 4})`);
        });
        await client.query(
          `INSERT INTO cards_responsaveis (card_id, pessoa_id, ordem, adicionado_por_id)
           VALUES ${vals.join(', ')}`,
          params,
        );
      }
    }

    // Etiquetas: se vier no payload, substitui o conjunto inteiro
    if (d.etiqueta_ids !== undefined) {
      if (d.etiqueta_ids.length > 0) {
        const { rows: validas } = await client.query(
          `SELECT id FROM quadros_etiquetas
            WHERE quadro_id = $1 AND id = ANY($2::uuid[])`,
          [cAtual.rows[0].quadro_id, d.etiqueta_ids],
        );
        if (validas.length !== d.etiqueta_ids.length) {
          throw new AppError('Uma ou mais etiquetas não pertencem a este quadro.', 400);
        }
      }
      await client.query(`DELETE FROM cards_etiquetas WHERE card_id = $1`, [req.params.id]);
      if (d.etiqueta_ids.length > 0) {
        // INSERT unico multi-linha (antes: 1 round-trip por etiqueta).
        const vals = [];
        const params = [];
        d.etiqueta_ids.forEach((eid) => {
          const base = params.length;
          params.push(req.params.id, eid);
          vals.push(`($${base + 1}, $${base + 2})`);
        });
        await client.query(
          `INSERT INTO cards_etiquetas (card_id, etiqueta_id) VALUES ${vals.join(', ')}`,
          params,
        );
      }
    }

    await client.query('COMMIT');

    registrarAcao({
      acao: 'card.editou',
      pessoa_acesso_id: req.pessoa.id,
      detalhes: { card_id: req.params.id, campos: Object.keys(d) },
      req,
    });

    // Card no formato do board: serve pra notificacao e pra resposta que o
    // front mescla localmente (sem refazer o quadro todo).
    const card = await montarCardDoQuadro(req.params.id);

    // Notifica se o RESPONSÁVEL PRINCIPAL mudou (e veio mudança no payload)
    if (
      veio
      && card?.responsavel_id
      && card.responsavel_id !== responsavelAnterior
    ) {
      disparar(() => notificarAtribuicao(card, req.pessoa.id));
    }

    publicarMudanca(cAtual.rows[0].quadro_id, 'card_editado');
    res.json(card);
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    next(err);
  } finally {
    client.release();
  }
}

/**
 * POST /api/cards/:id/mover
 * Move o card para outra coluna OU reordena dentro da mesma coluna.
 */
export async function mover(req, res, next) {
  const client = await pool.connect();
  try {
    // Sprint 37 — trazemos o tipo e o carimbo da coluna de ORIGEM: são eles
    // que alimentam o log de movimentos (e, por consequência, cycle time,
    // aging e CFD).
    const cAtual = await query(
      `SELECT c.id, c.quadro_id, c.coluna_id, c.coluna_desde, c.iniciado_em,
              col.tipo AS coluna_tipo
         FROM cards c
         JOIN colunas col ON col.id = c.coluna_id
        WHERE c.id = $1`,
      [req.params.id],
    );
    if (!cAtual.rows[0]) throw new NaoEncontradoError('Card não encontrado');

    const isAdmin = !!req.pessoa?.administrador;
    const { podeEditar } = await podeVerQuadro(req.pessoa.id, isAdmin, cAtual.rows[0].quadro_id);
    if (!podeEditar) throw new NaoAutorizadoError('Sem permissão.');

    const { coluna_id, posicao, forcar } = moverSchema.parse(req.body);

    // Confere que a coluna destino é do MESMO quadro
    const colR = await query(
      `SELECT quadro_id, tipo, wip_limite, nome
         FROM colunas WHERE id = $1 AND arquivada_em IS NULL`,
      [coluna_id],
    );
    if (!colR.rows[0]) throw new NaoEncontradoError('Coluna destino não encontrada');
    if (colR.rows[0].quadro_id !== cAtual.rows[0].quadro_id) {
      throw new AppError('Não é possível mover cards entre quadros.', 400);
    }

    const colDestino = colR.rows[0];
    const mudouDeColuna = coluna_id !== cAtual.rows[0].coluna_id;

    // -----------------------------------------------------------------------
    // Sprint 34 — Gate de dependências.
    // Sair do backlog com bloqueador aberto é quase sempre erro. Avisamos
    // com 409 e a lista de bloqueadores; a UI oferece "mover mesmo assim"
    // (reenvia com forcar=true). Kanban saudável orienta, não impede.
    // -----------------------------------------------------------------------
    let bloqueadores = [];
    if (mudouDeColuna && colDestino.tipo !== 'backlog' && !forcar) {
      bloqueadores = await bloqueadoresAbertos({ query }, req.params.id);
      if (bloqueadores.length > 0) {
        const err = new AppError('Este card está bloqueado por outro(s) card(s) em aberto.', 409);
        err.detalhes = { bloqueadores, pode_forcar: true };
        throw err;
      }
    }

    // -----------------------------------------------------------------------
    // Sprint 34 — WIP limit: avisa, não bloqueia (devolvido no payload).
    // -----------------------------------------------------------------------
    let wipEstourado = null;
    if (mudouDeColuna && colDestino.wip_limite) {
      const { rows: cnt } = await query(
        `SELECT COUNT(*)::int AS n FROM cards
          WHERE coluna_id = $1 AND arquivado_em IS NULL AND id <> $2`,
        [coluna_id, req.params.id],
      );
      if (cnt[0].n + 1 > colDestino.wip_limite) {
        wipEstourado = {
          coluna: colDestino.nome,
          limite: colDestino.wip_limite,
          atual: cnt[0].n + 1,
        };
      }
    }

    await client.query('BEGIN');

    const novaOrdem = await calcularOrdemCard(client, coluna_id, posicao, req.params.id);

    // Carimbo de conclusão: entra em coluna 'concluida' → marca; sai → limpa.
    // É a base de cycle time / lead time (Sprint 37). Resolvido em JS pra
    // não montar CASE WHEN condicional com uuid no SQL.
    const concluiAgora = colDestino.tipo === 'concluida';

    // Sprint 37 — carimbos de fluxo.
    // `iniciado_em` marca a PRIMEIRA saída do backlog (base do cycle time).
    // Só grava se ainda não existe: voltar pro backlog e sair de novo não
    // reinicia a contagem — o trabalho já tinha começado.
    const saiuDoBacklog = colDestino.tipo !== 'backlog';
    const jaIniciado = !!cAtual.rows[0].iniciado_em;
    const deveIniciar = saiuDoBacklog && !jaIniciado;

    // SET montado por concatenação. Cuidado central: `coluna_desde` só é
    // reescrito quando o card MUDA de coluna. Reordenar dentro da mesma
    // coluna não pode zerar o aging — senão bastava arrastar o card pra
    // cima pra ele "rejuvenescer" e a métrica viraria ficção.
    const sets = ['coluna_id = $1', 'ordem = $2'];
    sets.push(concluiAgora ? 'concluido_em = COALESCE(concluido_em, NOW())' : 'concluido_em = NULL');
    if (mudouDeColuna) sets.push('coluna_desde = NOW()');
    if (deveIniciar || (concluiAgora && !jaIniciado)) sets.push('iniciado_em = NOW()');

    await client.query(
      'UPDATE cards SET ' + sets.join(', ') + ' WHERE id = $3',
      [coluna_id, novaOrdem, req.params.id],
    );

    // Log de movimento — só quando muda de coluna de fato (reordenar dentro
    // da mesma coluna não é evento de fluxo e poluiria as métricas).
    if (mudouDeColuna) {
      // Minutos na origem calculados em JS: nada de aritmética condicional
      // com uuid no SQL.
      const desde = cAtual.rows[0].coluna_desde
        ? new Date(cAtual.rows[0].coluna_desde).getTime()
        : null;
      const minutosNaOrigem = desde
        ? Math.max(0, Math.round((Date.now() - desde) / 60000))
        : null;

      await client.query(
        `INSERT INTO cards_movimentos
           (card_id, quadro_id, de_coluna_id, para_coluna_id,
            de_tipo, para_tipo, minutos_na_origem, pessoa_id)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
        [
          req.params.id, cAtual.rows[0].quadro_id,
          cAtual.rows[0].coluna_id, coluna_id,
          cAtual.rows[0].coluna_tipo, colDestino.tipo,
          minutosNaOrigem, req.pessoa.id,
        ],
      );
    }

    // Sprint 15 — Hook de instancia.
    // Se este card pertence a uma instância E foi movido pra a coluna
    // "Concluído" daquela instância, dispara avanço do fluxo (concluir nó,
    // ativar próximos, gerar próximos cards).
    let avancoInstancia = null;
    {
      const { rows: hr } = await client.query(
        `SELECT i.id AS instancia_id, i.coluna_concluida_id
           FROM cards c
           JOIN processos_instancias_nos inn ON inn.id = c.instancia_no_id
           JOIN processos_instancias i ON i.id = inn.instancia_id
          WHERE c.id = $1`,
        [req.params.id],
      );
      if (hr[0] && hr[0].coluna_concluida_id === coluna_id) {
        const r = await avancarApos(client, { cardId: req.params.id });
        avancoInstancia = r;
      }
    }

    await client.query('COMMIT');

    registrarAcao({
      acao: 'card.moveu',
      pessoa_acesso_id: req.pessoa.id,
      detalhes: {
        card_id: req.params.id,
        de_coluna: cAtual.rows[0].coluna_id,
        para_coluna: coluna_id,
        posicao,
        avanco_instancia: avancoInstancia,
      },
      req,
    });

    // Sprint 36 — gatilho de automação. Só quando muda de coluna: reordenar
    // dentro da mesma coluna não é evento de fluxo.
    if (mudouDeColuna) {
      dispararEmBackground('card_movido', {
        quadroId: cAtual.rows[0].quadro_id,
        cardId: req.params.id,
        colunaId: coluna_id,
        pessoaId: req.pessoa.id,
      });
    }

    publicarMudanca(cAtual.rows[0].quadro_id, 'card_movido');
    res.json({
      ok: true,
      coluna_id,
      ordem: novaOrdem,
      avanco_instancia: avancoInstancia,
      // Sprint 34 — avisos (nao sao erro; a UI mostra um toast)
      wip_estourado: wipEstourado,
      concluido: concluiAgora,
    });
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    next(err);
  } finally {
    client.release();
  }
}

/**
 * POST /api/cards/:id/arquivar
 */
export async function arquivar(req, res, next) {
  try {
    const cR = await query(
      `SELECT quadro_id FROM cards WHERE id = $1`,
      [req.params.id],
    );
    if (!cR.rows[0]) throw new NaoEncontradoError('Card não encontrado');

    const isAdmin = !!req.pessoa?.administrador;
    const { podeEditar } = await podeVerQuadro(req.pessoa.id, isAdmin, cR.rows[0].quadro_id);
    if (!podeEditar) throw new NaoAutorizadoError('Sem permissão.');

    const { rowCount } = await query(
      `UPDATE cards SET arquivado_em = NOW()
        WHERE id = $1 AND arquivado_em IS NULL`,
      [req.params.id],
    );
    if (rowCount === 0) throw new AppError('Card não encontrado ou já arquivado.', 400);

    registrarAcao({
      acao: 'card.arquivou',
      pessoa_acesso_id: req.pessoa.id,
      detalhes: { card_id: req.params.id },
      req,
    });

    publicarMudanca(cR.rows[0].quadro_id, 'card_arquivado');
    res.status(204).send();
  } catch (err) { next(err); }
}

/**
 * POST /api/cards/:id/desarquivar
 *
 * Contrapartida de `arquivar`. Sem isto, arquivar um card por engano era
 * definitivo do ponto de vista de quem usa a ferramenta.
 *
 * Se a coluna de origem tiver sido arquivada nesse meio tempo, o card volta
 * para a primeira coluna ativa do quadro — senão ele reapareceria num lugar
 * que não existe mais no board.
 */
export async function desarquivar(req, res, next) {
  try {
    const cR = await query(
      `SELECT c.quadro_id, c.coluna_id, c.titulo, c.arquivado_em,
              col.arquivada_em AS coluna_arquivada_em
         FROM cards c JOIN colunas col ON col.id = c.coluna_id
        WHERE c.id = $1`,
      [req.params.id],
    );
    if (!cR.rows[0]) throw new NaoEncontradoError('Card não encontrado');
    if (!cR.rows[0].arquivado_em) throw new AppError('Este card não está arquivado.', 400);

    const isAdmin = !!req.pessoa?.administrador;
    const { podeEditar } = await podeVerQuadro(req.pessoa.id, isAdmin, cR.rows[0].quadro_id);
    if (!podeEditar) throw new NaoAutorizadoError('Sem permissão.');

    let colunaDestino = cR.rows[0].coluna_id;
    let colunaTrocada = false;
    if (cR.rows[0].coluna_arquivada_em) {
      const { rows: alt } = await query(
        `SELECT id FROM colunas
          WHERE quadro_id = $1 AND arquivada_em IS NULL
          ORDER BY ordem LIMIT 1`,
        [cR.rows[0].quadro_id],
      );
      if (!alt[0]) {
        throw new AppError(
          'O quadro não tem nenhuma coluna ativa para receber o card. Desarquive uma coluna antes.',
          400,
        );
      }
      colunaDestino = alt[0].id;
      colunaTrocada = true;
    }

    const { rows: max } = await query(
      `SELECT COALESCE(MAX(ordem), 0) + 1000 AS prox
         FROM cards WHERE coluna_id = $1 AND arquivado_em IS NULL`,
      [colunaDestino],
    );

    const { rows } = await query(
      `UPDATE cards
          SET arquivado_em = NULL, coluna_id = $2, ordem = $3, coluna_desde = NOW()
        WHERE id = $1
        RETURNING id, titulo, coluna_id, ordem`,
      [req.params.id, colunaDestino, max[0].prox],
    );

    registrarAcao({
      acao: 'card.desarquivou',
      pessoa_acesso_id: req.pessoa.id,
      detalhes: {
        card_id: req.params.id,
        coluna_id: colunaDestino,
        coluna_trocada: colunaTrocada,
      },
      req,
    });

    publicarMudanca(cR.rows[0].quadro_id, 'card_desarquivado');
    res.json({ ...rows[0], coluna_trocada: colunaTrocada });
  } catch (err) { next(err); }
}
