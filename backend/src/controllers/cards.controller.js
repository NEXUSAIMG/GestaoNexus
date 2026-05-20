import { z } from 'zod';
import { query, pool } from '../config/database.js';
import { NaoEncontradoError, AppError, NaoAutorizadoError } from '../utils/errors.js';
import { registrarAcao } from '../utils/audit.js';
import { podeVerQuadro } from './quadros.controller.js';
import {
  disparar,
  notificarPessoas,
  lerConfig,
} from '../services/notificacoes.service.js';
import { tplCardAtribuido } from '../services/email-templates.js';
import { avancarApos } from '../services/instancias.service.js';

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

const criarSchema = z.object({
  coluna_id: z.string().uuid(),
  titulo: z.string().min(1).max(255),
  descricao: z.string().max(20000).optional().nullable(),
  // responsavel_id (singular) mantido por back-compat. Sprint 18: prefira responsavel_ids.
  // Se ambos vierem, responsavel_ids ganha.
  responsavel_id: z.string().uuid().optional().nullable(),
  responsavel_ids: z.array(z.string().uuid()).optional(),
  data_prazo: dataIso.optional().nullable(),
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
  etiqueta_ids: z.array(z.string().uuid()).optional(),
});

const moverSchema = z.object({
  coluna_id: z.string().uuid(),
  posicao: z.number().int().min(0),
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

    // Pega o quadro da coluna pra validar permissão
    const colR = await query(
      `SELECT quadro_id FROM colunas WHERE id = $1 AND arquivada_em IS NULL`,
      [d.coluna_id],
    );
    if (!colR.rows[0]) throw new NaoEncontradoError('Coluna não encontrada');
    const quadroId = colR.rows[0].quadro_id;

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

    // INSERT do card sem responsavel_id — o trigger preenche a partir da N:N.
    const { rows } = await client.query(
      `INSERT INTO cards (
         coluna_id, quadro_id, titulo, descricao,
         data_prazo, ordem, criado_por_id
       ) VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING id`,
      [
        d.coluna_id, quadroId, d.titulo.trim(), d.descricao?.trim() || null,
        d.data_prazo || null, ordem, req.pessoa.id,
      ],
    );
    const cardId = rows[0].id;

    // Sprint 18 — múltiplos responsáveis.
    // Prioridade: responsavel_ids (array) > responsavel_id (singular, back-compat).
    const { lista: idsResp } = resolverResponsaveis(d);
    if (idsResp.length > 0) {
      await validarResponsaveisAtivos(client, idsResp);
      for (let i = 0; i < idsResp.length; i += 1) {
        await client.query(
          `INSERT INTO cards_responsaveis (card_id, pessoa_id, ordem, adicionado_por_id)
           VALUES ($1, $2, $3, $4)`,
          [cardId, idsResp[i], i, req.pessoa.id],
        );
      }
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
      for (const eid of d.etiqueta_ids) {
        await client.query(
          `INSERT INTO cards_etiquetas (card_id, etiqueta_id) VALUES ($1, $2)`,
          [cardId, eid],
        );
      }
    }

    await client.query('COMMIT');

    registrarAcao({
      acao: 'card.criou',
      pessoa_acesso_id: req.pessoa.id,
      detalhes: { card_id: cardId, quadro_id: quadroId, titulo: d.titulo },
      req,
    });

    const final = await query(`${SELECT_BASE} WHERE c.id = $1`, [cardId]);
    const card = final.rows[0];

    // Notifica responsável principal (= primeiro da N:N, espelhado em responsavel_id)
    if (card.responsavel_id) {
      disparar(() => notificarAtribuicao(card, req.pessoa.id));
    }

    res.status(201).json(serializar(card));
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
      for (let i = 0; i < novoConjunto.length; i += 1) {
        await client.query(
          `INSERT INTO cards_responsaveis (card_id, pessoa_id, ordem, adicionado_por_id)
           VALUES ($1, $2, $3, $4)`,
          [req.params.id, novoConjunto[i], i, req.pessoa.id],
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
      for (const eid of d.etiqueta_ids) {
        await client.query(
          `INSERT INTO cards_etiquetas (card_id, etiqueta_id) VALUES ($1, $2)`,
          [req.params.id, eid],
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

    const final = await query(`${SELECT_BASE} WHERE c.id = $1`, [req.params.id]);
    const card = final.rows[0];

    // Notifica se o RESPONSÁVEL PRINCIPAL mudou (e veio mudança no payload)
    if (
      veio
      && card.responsavel_id
      && card.responsavel_id !== responsavelAnterior
    ) {
      disparar(() => notificarAtribuicao(card, req.pessoa.id));
    }

    res.json(serializar(card));
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
    const cAtual = await query(
      `SELECT id, quadro_id, coluna_id FROM cards WHERE id = $1`,
      [req.params.id],
    );
    if (!cAtual.rows[0]) throw new NaoEncontradoError('Card não encontrado');

    const isAdmin = !!req.pessoa?.administrador;
    const { podeEditar } = await podeVerQuadro(req.pessoa.id, isAdmin, cAtual.rows[0].quadro_id);
    if (!podeEditar) throw new NaoAutorizadoError('Sem permissão.');

    const { coluna_id, posicao } = moverSchema.parse(req.body);

    // Confere que a coluna destino é do MESMO quadro
    const colR = await query(
      `SELECT quadro_id FROM colunas WHERE id = $1 AND arquivada_em IS NULL`,
      [coluna_id],
    );
    if (!colR.rows[0]) throw new NaoEncontradoError('Coluna destino não encontrada');
    if (colR.rows[0].quadro_id !== cAtual.rows[0].quadro_id) {
      throw new AppError('Não é possível mover cards entre quadros.', 400);
    }

    await client.query('BEGIN');

    const novaOrdem = await calcularOrdemCard(client, coluna_id, posicao, req.params.id);
    await client.query(
      `UPDATE cards SET coluna_id = $1, ordem = $2 WHERE id = $3`,
      [coluna_id, novaOrdem, req.params.id],
    );

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

    res.json({ ok: true, coluna_id, ordem: novaOrdem, avanco_instancia: avancoInstancia });
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

    res.status(204).send();
  } catch (err) { next(err); }
}
