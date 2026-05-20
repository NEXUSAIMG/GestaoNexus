import { z } from 'zod';
import { query, pool } from '../config/database.js';
import { NaoEncontradoError, AppError, NaoAutorizadoError } from '../utils/errors.js';
import { registrarAcao } from '../utils/audit.js';
import { podeVerQuadro } from './quadros.controller.js';

/**
 * Eventos do quadro — Sprint 11 + Sprint 24 (cor + múltiplos responsáveis).
 *
 * Calendário por quadro. Reaproveita o algoritmo de recorrência de
 * eventos_calendario (governança), mas escopa por quadro_id.
 *
 * Permissão: alinhada com o quadro.
 *   - VER: membro da equipe OU sócio se quadro for aberto_a_socios
 *   - EDITAR: qualquer membro da equipe
 *
 * Cards com data_prazo são mesclados como "ocorrências virtuais" na
 * listagem, mas não vivem nesta tabela — vêm do JOIN com cards.
 *
 * Sprint 24:
 *   - Cor opcional por evento (token da paleta tailwind). Se NULL, UI usa cor por tipo.
 *   - Múltiplos responsáveis via N:N eventos_quadro_responsaveis (migration 018).
 *     Eventos sem nenhum responsável são permitidos.
 */

const isoDateTime = z.string().regex(
  /^\d{4}-\d{2}-\d{2}(T\d{2}:\d{2}(:\d{2})?(\.\d+)?(Z|[+-]\d{2}:?\d{2})?)?$/,
  'Data deve estar em formato ISO',
);
const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Data deve estar em YYYY-MM-DD');
const tiposRecorrencia = ['mensal', 'trimestral', 'semestral', 'anual'];
const tiposEvento = ['reuniao', 'deadline', 'marco', 'outro'];

// Tokens da paleta aceitos (mesmo conjunto usado em etiquetas)
const coresValidas = [
  'slate', 'red', 'orange', 'amber', 'yellow', 'lime', 'emerald', 'teal',
  'cyan', 'blue', 'indigo', 'violet', 'fuchsia', 'pink', 'rose',
];

const criarSchema = z.object({
  titulo: z.string().min(1).max(255),
  descricao: z.string().max(5000).optional().nullable(),
  tipo: z.enum(tiposEvento).default('outro'),
  data_inicio: isoDateTime,
  data_fim: isoDateTime.optional().nullable(),
  dia_inteiro: z.boolean().default(false),
  local: z.string().max(255).optional().nullable(),
  link: z.string().url().max(2048).optional().nullable(),
  observacao: z.string().max(2000).optional().nullable(),
  recorrencia_tipo: z.enum(tiposRecorrencia).optional().nullable(),
  recorrencia_ate: isoDate.optional().nullable(),
  // Sprint 24
  cor: z.enum(coresValidas).optional().nullable(),
  responsavel_ids: z.array(z.string().uuid()).optional(),
});

const atualizarSchema = criarSchema.partial();

const HORIZONTE_DEFAULT_MESES = 24;
const MAX_OCORRENCIAS = 500;

// SELECT_BASE traz o evento + nome de quem criou + array de responsáveis (Sprint 24)
const SELECT_BASE = `
  SELECT e.*, p.nome AS criado_por_nome,
         COALESCE(
           (SELECT json_agg(
                     json_build_object('id', pa.id, 'nome', pa.nome, 'email', pa.email)
                     ORDER BY er.ordem, er.adicionado_em
                   )
              FROM eventos_quadro_responsaveis er
              JOIN pessoas_acesso pa ON pa.id = er.pessoa_id
             WHERE er.evento_id = e.id),
           '[]'::json
         ) AS responsaveis
    FROM eventos_quadro e
    LEFT JOIN pessoas_acesso p ON p.id = e.criado_por_id
`;

// =============================================================================
// Helpers de recorrência (idênticos ao de eventos_calendario.controller.js)
// =============================================================================

function adicionarMeses(data, meses) {
  const d = new Date(data);
  const dia = d.getDate();
  d.setDate(1);
  d.setMonth(d.getMonth() + meses);
  const ultimoDiaMes = new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate();
  d.setDate(Math.min(dia, ultimoDiaMes));
  return d;
}

function expandirOcorrencias(evento, inicio, fimExclusivo) {
  const ocorrencias = [];
  const inicioJanela = new Date(inicio);
  const fimJanela = new Date(fimExclusivo);

  const dataInicioOriginal = new Date(evento.data_inicio);
  const dataFimOriginal = evento.data_fim ? new Date(evento.data_fim) : null;
  const duracao = dataFimOriginal ? dataFimOriginal - dataInicioOriginal : 0;

  if (!evento.recorrencia_tipo) {
    const fim = dataFimOriginal ?? dataInicioOriginal;
    if (fim >= inicioJanela && dataInicioOriginal < fimJanela) {
      ocorrencias.push({
        data_inicio: dataInicioOriginal.toISOString(),
        data_fim: dataFimOriginal ? dataFimOriginal.toISOString() : null,
        indice: 0,
      });
    }
    return ocorrencias;
  }

  const passoMeses = {
    mensal: 1, trimestral: 3, semestral: 6, anual: 12,
  }[evento.recorrencia_tipo];

  const limiteUsuario = evento.recorrencia_ate
    ? new Date(`${String(evento.recorrencia_ate).slice(0, 10)}T23:59:59`)
    : adicionarMeses(dataInicioOriginal, HORIZONTE_DEFAULT_MESES);
  const limiteEfetivo = limiteUsuario < fimJanela ? limiteUsuario : fimJanela;

  let i = 0;
  while (i < MAX_OCORRENCIAS) {
    const ocorrenciaInicio = i === 0
      ? dataInicioOriginal
      : adicionarMeses(dataInicioOriginal, i * passoMeses);
    if (ocorrenciaInicio > limiteEfetivo) break;

    const ocorrenciaFim = duracao > 0
      ? new Date(ocorrenciaInicio.getTime() + duracao)
      : null;

    const fimComparar = ocorrenciaFim ?? ocorrenciaInicio;
    if (fimComparar >= inicioJanela && ocorrenciaInicio < fimJanela) {
      ocorrencias.push({
        data_inicio: ocorrenciaInicio.toISOString(),
        data_fim: ocorrenciaFim ? ocorrenciaFim.toISOString() : null,
        indice: i,
      });
    }
    i++;
  }

  return ocorrencias;
}

function formatar(e, opcoes = {}) {
  const base = {
    id: e.id,
    quadro_id: e.quadro_id,
    titulo: e.titulo,
    descricao: e.descricao,
    tipo: e.tipo,
    data_inicio: e.data_inicio,
    data_fim: e.data_fim,
    dia_inteiro: e.dia_inteiro,
    local: e.local,
    link: e.link,
    observacao: e.observacao,
    recorrencia_tipo: e.recorrencia_tipo ?? null,
    recorrencia_ate: e.recorrencia_ate ?? null,
    // Sprint 24
    cor: e.cor ?? null,
    responsaveis: e.responsaveis ?? [],
    criado_em: e.criado_em,
    criado_por_nome: e.criado_por_nome,
    fonte: 'evento', // distingue de cards
  };
  if (opcoes.ocorrencia) {
    base.data_inicio = opcoes.ocorrencia.data_inicio;
    base.data_fim = opcoes.ocorrencia.data_fim;
    base.eh_ocorrencia = true;
    base.indice_ocorrencia = opcoes.ocorrencia.indice;
  }
  return base;
}

/**
 * Converte um card com data_prazo num "evento virtual" pro calendário.
 * O card aparece como dia inteiro na sua data de prazo. Click no card
 * no calendário deve abrir o modal do card no kanban (frontend resolve).
 */
function cardComoEvento(card) {
  // data_prazo vem como Date sem hora. Usamos meio-dia pra evitar
  // problemas de timezone que joguem pro dia anterior.
  const dataIso = `${String(card.data_prazo).slice(0, 10)}T12:00:00`;
  return {
    id: `card-${card.id}`,
    card_id: card.id,
    quadro_id: card.quadro_id,
    titulo: card.titulo,
    descricao: null,
    tipo: 'card',
    data_inicio: new Date(dataIso).toISOString(),
    data_fim: null,
    dia_inteiro: true,
    local: null,
    link: null,
    observacao: null,
    recorrencia_tipo: null,
    recorrencia_ate: null,
    cor: null,
    responsaveis: [],
    criado_em: card.criado_em,
    criado_por_nome: null,
    fonte: 'card',
    responsavel_id: card.responsavel_id,
    responsavel_nome: card.responsavel_nome,
    coluna_id: card.coluna_id,
  };
}

// =============================================================================
// Helpers de responsáveis (Sprint 24)
// =============================================================================

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

async function gravarResponsaveisEvento(client, eventoId, ids) {
  await client.query(
    `DELETE FROM eventos_quadro_responsaveis WHERE evento_id = $1`,
    [eventoId],
  );
  for (let i = 0; i < ids.length; i += 1) {
    await client.query(
      `INSERT INTO eventos_quadro_responsaveis (evento_id, pessoa_id, ordem)
       VALUES ($1, $2, $3)`,
      [eventoId, ids[i], i],
    );
  }
}

// =============================================================================
// CRUD
// =============================================================================

/**
 * GET /api/quadros/:id/eventos?inicio=YYYY-MM-DD&fim=YYYY-MM-DD
 *
 * Retorna eventos do quadro + cards com prazo no período, ambos no formato
 * de evento de calendário (com `fonte` diferenciando: 'evento' ou 'card').
 *
 * Permissão: ver o quadro.
 */
export async function listar(req, res, next) {
  try {
    const isAdmin = !!req.pessoa?.administrador;
    const { pode } = await podeVerQuadro(req.pessoa.id, isAdmin, req.params.id);
    if (!pode) throw new NaoAutorizadoError('Sem acesso a este quadro.');

    const inicio = req.query.inicio || `${new Date().getFullYear()}-${String(new Date().getMonth() + 1).padStart(2, '0')}-01`;
    const fim = req.query.fim || (() => {
      const d = new Date(inicio);
      d.setMonth(d.getMonth() + 1);
      return d.toISOString().slice(0, 10);
    })();

    // 1. Eventos do quadro com possível recorrência
    const { rows: eventos } = await query(
      `${SELECT_BASE}
        WHERE e.quadro_id = $3
          AND (
            (e.recorrencia_tipo IS NULL
             AND e.data_inicio < ($2::date + INTERVAL '1 day')
             AND COALESCE(e.data_fim, e.data_inicio) >= $1::date)
            OR
            (e.recorrencia_tipo IS NOT NULL
             AND e.data_inicio < ($2::date + INTERVAL '1 day')
             AND (e.recorrencia_ate IS NULL OR e.recorrencia_ate >= $1::date))
          )
        ORDER BY e.data_inicio ASC`,
      [inicio, fim, req.params.id],
    );

    const inicioISO = `${inicio}T00:00:00`;
    const fimExclusivoISO = (() => {
      const d = new Date(`${fim}T00:00:00`);
      d.setDate(d.getDate() + 1);
      return d.toISOString();
    })();

    const resultado = [];
    for (const evento of eventos) {
      const ocorrencias = expandirOcorrencias(evento, inicioISO, fimExclusivoISO);
      for (const oc of ocorrencias) {
        resultado.push(formatar(evento, { ocorrencia: oc }));
      }
    }

    // 2. Cards do quadro com data_prazo no período
    const { rows: cards } = await query(
      `SELECT c.id, c.quadro_id, c.coluna_id, c.titulo, c.data_prazo,
              c.responsavel_id, c.criado_em,
              p.nome AS responsavel_nome
         FROM cards c
         LEFT JOIN pessoas_acesso p ON p.id = c.responsavel_id
        WHERE c.quadro_id = $1
          AND c.arquivado_em IS NULL
          AND c.data_prazo IS NOT NULL
          AND c.data_prazo >= $2::date
          AND c.data_prazo <= $3::date
        ORDER BY c.data_prazo ASC`,
      [req.params.id, inicio, fim],
    );

    for (const card of cards) {
      resultado.push(cardComoEvento(card));
    }

    // Ordena tudo por data_inicio
    resultado.sort((a, b) => new Date(a.data_inicio) - new Date(b.data_inicio));

    res.json(resultado);
  } catch (err) { next(err); }
}

/**
 * GET /api/quadros/:id/eventos/:eventoId
 * Retorna o evento "raiz" pra edição.
 */
export async function obter(req, res, next) {
  try {
    const isAdmin = !!req.pessoa?.administrador;
    const { pode } = await podeVerQuadro(req.pessoa.id, isAdmin, req.params.id);
    if (!pode) throw new NaoAutorizadoError('Sem acesso.');

    const { rows } = await query(
      `${SELECT_BASE} WHERE e.id = $1 AND e.quadro_id = $2`,
      [req.params.eventoId, req.params.id],
    );
    if (!rows[0]) throw new NaoEncontradoError('Evento não encontrado');
    res.json(formatar(rows[0]));
  } catch (err) { next(err); }
}

/**
 * POST /api/quadros/:id/eventos
 */
export async function criar(req, res, next) {
  const client = await pool.connect();
  try {
    const isAdmin = !!req.pessoa?.administrador;
    const { podeEditar } = await podeVerQuadro(req.pessoa.id, isAdmin, req.params.id);
    if (!podeEditar) throw new NaoAutorizadoError('Sem permissão.');

    const e = criarSchema.parse(req.body);

    if (e.data_fim && e.data_fim < e.data_inicio) {
      throw new AppError('Data fim deve ser posterior à data início', 400);
    }
    if (e.recorrencia_ate && !e.recorrencia_tipo) {
      throw new AppError('Pra definir limite de recorrência é preciso escolher o tipo (mensal, trimestral...).', 400);
    }
    if (e.recorrencia_ate && e.recorrencia_ate < e.data_inicio.slice(0, 10)) {
      throw new AppError('A data limite da recorrência precisa ser igual ou posterior ao início.', 400);
    }

    await client.query('BEGIN');

    const { rows } = await client.query(
      `INSERT INTO eventos_quadro (
         quadro_id, titulo, descricao, tipo,
         data_inicio, data_fim, dia_inteiro,
         local, link, observacao,
         recorrencia_tipo, recorrencia_ate,
         cor,
         criado_por_id
       ) VALUES ($1,$2,$3,$4, $5,$6,$7, $8,$9,$10, $11,$12, $13, $14)
       RETURNING id`,
      [
        req.params.id, e.titulo, e.descricao, e.tipo,
        e.data_inicio, e.data_fim, e.dia_inteiro,
        e.local, e.link, e.observacao,
        e.recorrencia_tipo ?? null, e.recorrencia_ate ?? null,
        e.cor ?? null,
        req.pessoa.id,
      ],
    );
    const eventoId = rows[0].id;

    // Sprint 24 — múltiplos responsáveis (opcional)
    if (e.responsavel_ids && e.responsavel_ids.length > 0) {
      const idsUnicos = [...new Set(e.responsavel_ids)];
      await validarResponsaveisAtivos(client, idsUnicos);
      await gravarResponsaveisEvento(client, eventoId, idsUnicos);
    }

    await client.query('COMMIT');

    registrarAcao({
      acao: 'evento_quadro.criou',
      pessoa_acesso_id: req.pessoa.id,
      detalhes: { evento_id: eventoId, quadro_id: req.params.id, titulo: e.titulo },
      req,
    });

    const final = await query(`${SELECT_BASE} WHERE e.id = $1`, [eventoId]);
    res.status(201).json(formatar(final.rows[0]));
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    next(err);
  } finally {
    client.release();
  }
}

/**
 * PUT /api/quadros/:id/eventos/:eventoId
 */
export async function atualizar(req, res, next) {
  const client = await pool.connect();
  try {
    const isAdmin = !!req.pessoa?.administrador;
    const { podeEditar } = await podeVerQuadro(req.pessoa.id, isAdmin, req.params.id);
    if (!podeEditar) throw new NaoAutorizadoError('Sem permissão.');

    const e = atualizarSchema.parse(req.body);

    if (e.recorrencia_ate && e.recorrencia_tipo === null) {
      throw new AppError('Não dá pra ter limite de recorrência sem tipo de recorrência.', 400);
    }

    await client.query('BEGIN');

    // Monta UPDATE dinâmico só pros campos diretos da tabela.
    // Responsáveis são tratados separadamente (N:N).
    // Concatenação em vez de template literal pra evitar ambiguidade do "$$" em ferramentas.
    const updates = [];
    const params = [];
    for (const [k, v] of Object.entries(e)) {
      if (v === undefined) continue;
      if (k === 'responsavel_ids') continue; // N:N separado
      params.push(v);
      updates.push(k + ' = $' + params.length);
    }

    if (updates.length > 0) {
      params.push(req.params.eventoId, req.params.id);
      const { rowCount } = await client.query(
        'UPDATE eventos_quadro SET ' + updates.join(', ')
          + ' WHERE id = $' + (params.length - 1)
          + ' AND quadro_id = $' + params.length,
        params,
      );
      if (rowCount === 0) {
        throw new NaoEncontradoError('Evento não encontrado');
      }
    } else {
      // Sem campos diretos pra atualizar — confere que o evento existe
      const cR = await client.query(
        `SELECT id FROM eventos_quadro WHERE id = $1 AND quadro_id = $2`,
        [req.params.eventoId, req.params.id],
      );
      if (!cR.rows[0]) throw new NaoEncontradoError('Evento não encontrado');
    }

    // Sprint 24 — responsáveis: se veio responsavel_ids no payload, substitui o conjunto
    if (e.responsavel_ids !== undefined) {
      const idsUnicos = [...new Set(e.responsavel_ids)];
      await validarResponsaveisAtivos(client, idsUnicos);
      await gravarResponsaveisEvento(client, req.params.eventoId, idsUnicos);
    }

    await client.query('COMMIT');

    registrarAcao({
      acao: 'evento_quadro.editou',
      pessoa_acesso_id: req.pessoa.id,
      detalhes: { evento_id: req.params.eventoId, campos: Object.keys(e) },
      req,
    });

    const final = await query(`${SELECT_BASE} WHERE e.id = $1`, [req.params.eventoId]);
    res.json(formatar(final.rows[0]));
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    next(err);
  } finally {
    client.release();
  }
}

/**
 * DELETE /api/quadros/:id/eventos/:eventoId
 * Remove a série inteira (não há suporte a exceção por ocorrência).
 * Os registros em eventos_quadro_responsaveis caem por CASCADE.
 */
export async function excluir(req, res, next) {
  try {
    const isAdmin = !!req.pessoa?.administrador;
    const { podeEditar } = await podeVerQuadro(req.pessoa.id, isAdmin, req.params.id);
    if (!podeEditar) throw new NaoAutorizadoError('Sem permissão.');

    const { rowCount } = await query(
      `DELETE FROM eventos_quadro WHERE id = $1 AND quadro_id = $2`,
      [req.params.eventoId, req.params.id],
    );
    if (rowCount === 0) throw new NaoEncontradoError('Evento não encontrado');

    registrarAcao({
      acao: 'evento_quadro.excluiu',
      pessoa_acesso_id: req.pessoa.id,
      detalhes: { evento_id: req.params.eventoId, quadro_id: req.params.id },
      req,
    });

    res.status(204).send();
  } catch (err) { next(err); }
}
