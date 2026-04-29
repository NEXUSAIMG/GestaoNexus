import { z } from 'zod';
import { query } from '../config/database.js';
import { NaoEncontradoError, AppError } from '../utils/errors.js';
import { registrarAcao } from '../utils/audit.js';

/**
 * Eventos de calendário — Sprint 6 + recorrência da Sprint 8.
 *
 * O banco guarda UMA linha por evento. Eventos recorrentes têm
 * `recorrencia_tipo` (`mensal`, `trimestral`, `semestral`, `anual`) e
 * opcionalmente `recorrencia_ate` (data limite). Na hora de listar,
 * o backend expande virtualmente as ocorrências dentro da janela
 * pedida.
 *
 * Editar/excluir afeta toda a série — não há suporte a exceções
 * individuais (entra em iteração futura se for pedido).
 */

const isoDateTime = z.string().regex(
  /^\d{4}-\d{2}-\d{2}(T\d{2}:\d{2}(:\d{2})?(\.\d+)?(Z|[+-]\d{2}:?\d{2})?)?$/,
  'Data deve estar em formato ISO',
);

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Data deve estar em YYYY-MM-DD');

const tiposRecorrencia = ['mensal', 'trimestral', 'semestral', 'anual'];

const criarSchema = z.object({
  titulo: z.string().min(1).max(255),
  descricao: z.string().max(5000).optional().nullable(),
  tipo: z.enum(['reuniao', 'vencimento_legal', 'pagamento_importante', 'outro']).default('outro'),
  data_inicio: isoDateTime,
  data_fim: isoDateTime.optional().nullable(),
  dia_inteiro: z.boolean().default(false),
  local: z.string().max(255).optional().nullable(),
  link: z.string().url().max(2048).optional().nullable(),
  observacao: z.string().max(2000).optional().nullable(),
  recorrencia_tipo: z.enum(tiposRecorrencia).optional().nullable(),
  recorrencia_ate: isoDate.optional().nullable(),
});

const atualizarSchema = criarSchema.partial();

const SELECT_BASE = `
  SELECT e.*, p.nome AS criado_por_nome
    FROM eventos_calendario e
    LEFT JOIN pessoas_acesso p ON p.id = e.criado_por_id
`;

/**
 * Limite máximo de expansão quando `recorrencia_ate` for null. Evita que
 * um evento "mensal indefinido" gere milhares de ocorrências em queries
 * com janela ampla (ex: ano inteiro). 24 meses é mais que suficiente
 * pra qualquer planejamento.
 */
const HORIZONTE_DEFAULT_MESES = 24;

/**
 * Limite duro de ocorrências geradas por evento numa única expansão.
 * Defesa adicional contra payloads gigantes em janelas longas.
 */
const MAX_OCORRENCIAS = 500;

function formatar(e, opcoes = {}) {
  const base = {
    id: e.id,
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
    criado_em: e.criado_em,
    criado_por_nome: e.criado_por_nome,
  };
  // Quando expandido, sobrepõe data_inicio/data_fim com a ocorrência
  if (opcoes.ocorrencia) {
    base.data_inicio = opcoes.ocorrencia.data_inicio;
    base.data_fim = opcoes.ocorrencia.data_fim;
    base.eh_ocorrencia = true;
    base.indice_ocorrencia = opcoes.ocorrencia.indice;
  }
  return base;
}

/**
 * Soma N meses a uma data preservando hora/minuto/segundo. Lida com
 * casos de "31 de janeiro + 1 mês = 28/29 de fevereiro" usando o último
 * dia válido do mês de destino.
 */
function adicionarMeses(data, meses) {
  const d = new Date(data);
  const dia = d.getDate();
  d.setDate(1); // evita overflow
  d.setMonth(d.getMonth() + meses);
  // Restaura o dia, capando no último dia do mês de destino
  const ultimoDiaMes = new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate();
  d.setDate(Math.min(dia, ultimoDiaMes));
  return d;
}

/**
 * Expande as ocorrências de um evento dentro da janela [inicio, fimExclusivo].
 * Retorna array de { data_inicio, data_fim, indice }. Para eventos sem
 * recorrência, retorna no máximo 1 ocorrência (se sobreposição com janela).
 */
function expandirOcorrencias(evento, inicio, fimExclusivo) {
  const ocorrencias = [];
  const inicioJanela = new Date(inicio);
  const fimJanela = new Date(fimExclusivo);

  const dataInicioOriginal = new Date(evento.data_inicio);
  const dataFimOriginal = evento.data_fim ? new Date(evento.data_fim) : null;
  const duracao = dataFimOriginal ? dataFimOriginal - dataInicioOriginal : 0;

  if (!evento.recorrencia_tipo) {
    // Evento único: inclui se sobrepõe a janela
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

  // Tem recorrência: gera ocorrências do início até o limite efetivo
  const passoMeses = {
    mensal: 1, trimestral: 3, semestral: 6, anual: 12,
  }[evento.recorrencia_tipo];

  // Limite final: o que vier primeiro entre recorrencia_ate, horizonte default
  // e fim da janela pedida (não vale ir além do que o cliente quer).
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

    // Inclui se sobrepõe a janela pedida
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

/**
 * GET /api/governanca/eventos?inicio=YYYY-MM-DD&fim=YYYY-MM-DD
 *
 * Sem parâmetros, retorna eventos do mês atual.
 * Eventos recorrentes são expandidos em ocorrências dentro da janela.
 */
export async function listar(req, res, next) {
  try {
    const inicio = req.query.inicio || `${new Date().getFullYear()}-${String(new Date().getMonth() + 1).padStart(2, '0')}-01`;
    const fim = req.query.fim || (() => {
      const d = new Date(inicio);
      d.setMonth(d.getMonth() + 1);
      return d.toISOString().slice(0, 10);
    })();

    // Estratégia de busca:
    //  - Eventos sem recorrência: data_inicio dentro da janela (inclusivo no fim)
    //  - Eventos com recorrência: data_inicio antes do fim da janela E
    //    (recorrencia_ate >= inicio OU recorrencia_ate IS NULL)
    // O JS depois filtra/expande exatamente.
    const { rows } = await query(
      `${SELECT_BASE}
        WHERE
          (e.recorrencia_tipo IS NULL
           AND e.data_inicio < ($2::date + INTERVAL '1 day')
           AND COALESCE(e.data_fim, e.data_inicio) >= $1::date)
          OR
          (e.recorrencia_tipo IS NOT NULL
           AND e.data_inicio < ($2::date + INTERVAL '1 day')
           AND (e.recorrencia_ate IS NULL OR e.recorrencia_ate >= $1::date))
        ORDER BY e.data_inicio ASC`,
      [inicio, fim],
    );

    const inicioISO = `${inicio}T00:00:00`;
    const fimExclusivoISO = (() => {
      const d = new Date(`${fim}T00:00:00`);
      d.setDate(d.getDate() + 1);
      return d.toISOString();
    })();

    const resultado = [];
    for (const evento of rows) {
      const ocorrencias = expandirOcorrencias(evento, inicioISO, fimExclusivoISO);
      for (const oc of ocorrencias) {
        resultado.push(formatar(evento, { ocorrencia: oc }));
      }
    }

    // Ordena por data_inicio efetivo da ocorrência (mais cedo primeiro)
    resultado.sort((a, b) => new Date(a.data_inicio) - new Date(b.data_inicio));

    res.json(resultado);
  } catch (err) { next(err); }
}

/**
 * GET /api/governanca/eventos/:id
 *
 * Retorna o evento "raiz" (a definição original, não a ocorrência expandida).
 * Quem está obtendo está prestes a editar/excluir, então faz sentido ver os
 * dados-mestre (data de início original, recorrência, etc).
 */
export async function obter(req, res, next) {
  try {
    const { rows } = await query(`${SELECT_BASE} WHERE e.id = $1`, [req.params.id]);
    if (!rows[0]) throw new NaoEncontradoError('Evento não encontrado');
    res.json(formatar(rows[0]));
  } catch (err) { next(err); }
}

/**
 * POST /api/governanca/eventos (admin)
 */
export async function criar(req, res, next) {
  try {
    const e = criarSchema.parse(req.body);

    if (e.data_fim && e.data_fim < e.data_inicio) {
      throw new AppError('Data fim deve ser posterior à data início', 400);
    }
    if (e.recorrencia_ate && !e.recorrencia_tipo) {
      throw new AppError('Para definir um limite de recorrência é preciso escolher um tipo (mensal, trimestral...).', 400);
    }
    if (e.recorrencia_ate && e.recorrencia_ate < e.data_inicio.slice(0, 10)) {
      throw new AppError('A data limite da recorrência precisa ser igual ou posterior ao início.', 400);
    }

    const { rows } = await query(
      `INSERT INTO eventos_calendario (
         titulo, descricao, tipo,
         data_inicio, data_fim, dia_inteiro,
         local, link, observacao,
         recorrencia_tipo, recorrencia_ate,
         criado_por_id
       ) VALUES ($1,$2,$3, $4,$5,$6, $7,$8,$9, $10,$11, $12)
       RETURNING id`,
      [
        e.titulo, e.descricao, e.tipo,
        e.data_inicio, e.data_fim, e.dia_inteiro,
        e.local, e.link, e.observacao,
        e.recorrencia_tipo ?? null, e.recorrencia_ate ?? null,
        req.pessoa?.id,
      ],
    );

    registrarAcao({
      acao: 'evento_calendario.criou',
      pessoaId: req.pessoa?.id,
      socioId: req.representacaoAtual?.socio_id,
      detalhes: {
        id: rows[0].id, titulo: e.titulo, data_inicio: e.data_inicio,
        recorrencia_tipo: e.recorrencia_tipo ?? null,
      },
    });

    const final = await query(`${SELECT_BASE} WHERE e.id = $1`, [rows[0].id]);
    res.status(201).json(formatar(final.rows[0]));
  } catch (err) { next(err); }
}

/**
 * PUT /api/governanca/eventos/:id (admin)
 *
 * Edição afeta toda a série quando o evento for recorrente.
 */
export async function atualizar(req, res, next) {
  try {
    const e = atualizarSchema.parse(req.body);

    // Validação extra: se passou recorrencia_ate sem recorrencia_tipo (e o
    // evento atual também não tem), recusa. Pra simplificar, pego o estado
    // atual quando precisar.
    if (e.recorrencia_ate && e.recorrencia_tipo === null) {
      throw new AppError('Não dá pra ter limite de recorrência sem tipo de recorrência.', 400);
    }

    const updates = [];
    const params = [];
    for (const [k, v] of Object.entries(e)) {
      if (v === undefined) continue;
      params.push(v);
      updates.push(`${k} = $${params.length}`);
    }
    if (updates.length === 0) {
      const final = await query(`${SELECT_BASE} WHERE e.id = $1`, [req.params.id]);
      if (!final.rows[0]) throw new NaoEncontradoError('Evento não encontrado');
      return res.json(formatar(final.rows[0]));
    }

    params.push(req.params.id);
    const { rowCount } = await query(
      `UPDATE eventos_calendario SET ${updates.join(', ')} WHERE id = $${params.length}`,
      params,
    );
    if (rowCount === 0) throw new NaoEncontradoError('Evento não encontrado');

    registrarAcao({
      acao: 'evento_calendario.editou',
      pessoaId: req.pessoa?.id,
      socioId: req.representacaoAtual?.socio_id,
      detalhes: { id: req.params.id },
    });

    const final = await query(`${SELECT_BASE} WHERE e.id = $1`, [req.params.id]);
    res.json(formatar(final.rows[0]));
  } catch (err) { next(err); }
}

/**
 * DELETE /api/governanca/eventos/:id (admin)
 *
 * Exclusão remove toda a série recorrente.
 */
export async function excluir(req, res, next) {
  try {
    const { rowCount } = await query(
      `DELETE FROM eventos_calendario WHERE id = $1`,
      [req.params.id],
    );
    if (rowCount === 0) throw new NaoEncontradoError('Evento não encontrado');

    registrarAcao({
      acao: 'evento_calendario.excluiu',
      pessoaId: req.pessoa?.id,
      socioId: req.representacaoAtual?.socio_id,
      detalhes: { id: req.params.id },
    });

    res.status(204).send();
  } catch (err) { next(err); }
}
