import { z } from 'zod';
import { query, pool } from '../config/database.js';
import { AppError, NaoEncontradoError } from '../utils/errors.js';
import { registrarAcao } from '../utils/audit.js';
import {
  ETAPAS, ETAPA, ETAPAS_CHAVES, ORIGENS, ORIGENS_CHAVES, MOTIVOS_PERDA,
  SEGMENTOS, CADENCIA, MARCOS_TRIAL, SINAIS, RESULTADOS, RESULTADOS_CHAVES, TIPOS_REUNIAO,
  MOTIVOS_NAO_CONTATAR, JANELAS, DIAGNOSTICO_CAMPOS,
  hojeBR, mesDe, addDias, aplicarEtapa, pendenciasPortao, ehRetrocesso,
} from '../services/comercial.regras.js';
import {
  SELECT_LEAD, enriquecer, carregarLead, reunioesDoLead, propostasDoLead,
  metasDoMes, pessoasAtivas, carregarFeriados, verificarBloqueios, exigirContatoLiberado,
  calcularPainel, soDigitos,
} from '../services/comercial.dados.js';

/**
 * Módulo Comercial — Sprint 42 (funil) + 42B (controle minucioso).
 *
 * Regras de controle garantidas pelo servidor (não só pela tela):
 *   - origem obrigatória; perdido exige motivo; ganho exige valor
 *   - PORTÕES de etapa (diagnóstico realizado e preenchido, meta de sucesso,
 *     ativação agendada, proposta registrada). Admin pode forçar, com
 *     justificativa registrada.
 *   - voltar etapa / reabrir ganho ou perdido exige justificativa
 *   - duplicidade (CNS, CNPJ, e-mail, telefone, nome+cidade+UF), já cliente
 *     e lista de não contatar bloqueiam cadastro, importação e contato
 *   - toque só é registrado HOJE e nunca é apagado: erro vira estorno
 *     com motivo (autor no mesmo dia, ou admin)
 *   - toda alteração de campo vai para comercial_alteracoes (de → para)
 *   - só admin arquiva (com motivo) e confirma pagamento manual
 *   - meta de clientes conta PAGOS, não assinados
 */

// ---------------------------------------------------------------------------
// Schemas
// ---------------------------------------------------------------------------
const dataISO = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'data no formato AAAA-MM-DD');
const dataOpc = dataISO.nullable().optional().or(z.literal('').transform(() => null));
const txt = (max) => z.string().max(max).nullable().optional()
  .transform((v) => (v == null || String(v).trim() === '' ? null : String(v).trim()));
const justificativa = z.string().trim().min(10, 'justifique com pelo menos 10 caracteres').max(2000);

const camposLead = {
  nome: z.string().trim().min(1, 'informe o nome do cartório').max(255),
  segmento: txt(60),
  cidade: txt(100),
  uf: z.string().max(2).nullable().optional()
    .transform((v) => (v ? String(v).trim().toUpperCase().slice(0, 2) || null : null)),
  contato: txt(255),
  telefone: txt(60),
  email: txt(255).transform((v) => (v ? v.toLowerCase() : v)),
  cns: z.string().max(20).nullable().optional()
    .transform((v) => soDigitos(v))
    .refine((v) => v == null || (v.length >= 5 && v.length <= 7), 'CNS tem 6 dígitos'),
  cnpj: z.string().max(20).nullable().optional()
    .transform((v) => soDigitos(v))
    .refine((v) => v == null || v.length === 14, 'CNPJ tem 14 dígitos'),
  dono_id: z.string().uuid().nullable().optional(),
  cartorio_id: z.string().uuid().nullable().optional(),
  origem: z.enum(ORIGENS_CHAVES, { errorMap: () => ({ message: 'escolha a origem do lead' }) }),
  campanha: txt(120),
  etapa: z.enum(ETAPAS_CHAVES).optional(),
  valor_mensal: z.coerce.number().min(0).max(1_000_000).nullable().optional(),
  motivo_perda: z.enum(MOTIVOS_PERDA).nullable().optional(),
  motivo_perda_obs: txt(2000),
  proximo_passo: txt(1000),
  proxima_data: dataOpc,
  notas: txt(20000),
  sinais: z.record(z.boolean()).optional(),
  diagnostico: z.record(z.union([z.string().max(2000), z.number(), z.null()])).optional(),
  meta_sucesso: txt(2000),
  indicado_por_id: z.string().uuid().nullable().optional(),
};

const criarSchema = z.object(camposLead);
const atualizarSchema = z.object({
  ...camposLead,
  justificativa: justificativa.optional(),
  forcar_portao: z.boolean().optional(),
}).partial();

const reuniaoSchema = z.object({
  tipo: z.enum(Object.keys(TIPOS_REUNIAO)),
  inicio: z.string().datetime({ offset: true, message: 'data e hora da reunião' }),
  participantes: txt(500),
  nota: txt(2000),
  responsavel_id: z.string().uuid().nullable().optional(),
});

const toqueSchema = z.object({
  tipo: z.enum(['cadencia', 'marco', 'avulso']),
  dia: z.coerce.number().int().min(0).max(30).nullable().optional(),
  canal: txt(40),
  resultado: z.enum(RESULTADOS_CHAVES).nullable().optional(),
  duracao_min: z.coerce.number().int().min(0).max(600).nullable().optional(),
  nota: txt(2000),
  proximo_passo: txt(1000),
  proxima_data: dataOpc,
  reuniao: reuniaoSchema.optional(),
});

const estornoSchema = z.object({ motivo: justificativa });

const propostaSchema = z.object({
  plano: z.string().trim().min(1).max(120),
  valor_mensal: z.coerce.number().positive().max(1_000_000),
  desconto: z.enum(['nenhum', 'mes_gratis_ex_cliente']).optional().default('nenhum'),
  enviada_em: dataISO.optional(),
  validade: dataISO.optional(),
  observacoes: txt(2000),
});

const metaPessoaSchema = z.object({
  novosDia: z.coerce.number().int().min(0).max(10000).optional().default(0),
  toquesDia: z.coerce.number().int().min(0).max(10000).optional().default(0),
  reunioesMes: z.coerce.number().int().min(0).max(10000).optional().default(0),
  pagosMes: z.coerce.number().int().min(0).max(10000).optional().default(0),
});

const metasSchema = z.object({
  metaClientes: z.coerce.number().min(0).max(10000),
  ticket: z.coerce.number().min(0).max(1_000_000),
  diasUteis: z.coerce.number().int().min(1).max(31),
  taxaContatoDiag: z.coerce.number().min(0).max(100),
  taxaDiagTrial: z.coerce.number().min(0).max(100),
  taxaTrialPago: z.coerce.number().min(0).max(100),
  metaNovosDia: z.coerce.number().int().min(0).max(10000),
  metaToquesDia: z.coerce.number().int().min(0).max(10000),
  porPessoa: z.record(metaPessoaSchema).optional().default({}),
});

const importarListaSchema = z.object({
  linhas: z.array(z.object({
    nome: z.string().trim().min(1).max(255),
    cidade: txt(100),
    uf: z.string().max(2).nullable().optional(),
    telefone: txt(60),
    email: txt(255),
    segmento: txt(60),
    contato: txt(255),
    cns: z.string().max(20).nullable().optional(),
    cnpj: z.string().max(20).nullable().optional(),
  })).min(1).max(2000),
  dono_id: z.string().uuid().nullable().optional(),
  origem: z.enum(ORIGENS_CHAVES),
  campanha: txt(120),
  etapa: z.enum(['prospect', 'cadencia']).optional().default('prospect'),
});

const importarQuadroSchema = z.object({
  quadro_id: z.string().uuid(),
  somente_etiqueta: z.string().max(80).nullable().optional(),
  mapa: z.record(z.enum([...ETAPAS_CHAVES, 'ignorar'])),
  origem_padrao: z.enum(ORIGENS_CHAVES),
  campanha: txt(120),
  motivo_perda_padrao: z.enum(MOTIVOS_PERDA).optional().default('Outro'),
});

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
const ehAdmin = (req) => !!req.pessoa?.administrador;

function exigirAdminLocal(req, msg) {
  if (!ehAdmin(req)) throw new AppError(msg || 'Só a gestão (admin) pode fazer isso.', 403, 'so_admin');
}
const ehGestor = (req) => !!req.gestorComercial || ehAdmin(req);
function exigirGestor(req, msg) {
  if (!ehGestor(req)) throw new AppError(msg || 'Só a gestão comercial pode fazer isso.', 403, 'so_gestao');
}

function novoProtocolo(hoje = hojeBR()) {
  return 'SC-' + hoje.replace(/-/g, '') + '-' + Math.random().toString(36).slice(2, 7).toUpperCase();
}

function validarFechamento(etapa, dados) {
  if (etapa === 'perdido' && !dados.motivo_perda) {
    throw new AppError('Escolha o motivo da perda: é o que mostra o que mudar no discurso.', 400, 'motivo_obrigatorio');
  }
  if (etapa === 'ganho' && !(Number(dados.valor_mensal) > 0)) {
    throw new AppError('Informe o valor mensal do contrato para registrar o ganho.', 400, 'valor_obrigatorio');
  }
}

const paraTexto = (v) => (v == null ? null : typeof v === 'object' ? JSON.stringify(v) : String(v));

async function inserirLead(client, dados, pessoaId, extras = {}) {
  const hoje = hojeBR();
  const etapa = dados.etapa || 'prospect';
  const base = { etapa: null, marcos: {}, cadencia_inicio: null, trial_inicio: null };
  // Importação: etapas anteriores datadas na criação do card e a etapa atual
  // na entrada da coluna — senão um "Concluído" antigo contaria como ganho do mês.
  const mud = aplicarEtapa(base, etapa, extras.data_marcos || hoje);
  if (extras.etapa_desde) {
    if (mud.marcos[etapa]) mud.marcos[etapa] = extras.etapa_desde;
    if (etapa === 'cadencia') mud.cadencia_inicio = extras.etapa_desde;
    if (etapa === 'trial') mud.trial_inicio = extras.etapa_desde;
  }
  const { rows } = await client.query(
    `INSERT INTO comercial_leads
       (protocolo, nome, segmento, cidade, uf, contato, telefone, email, cns, cnpj, dono_id,
        cartorio_id, etapa, etapa_desde, marcos, origem, campanha, cadencia_inicio,
        trial_inicio, sinais, diagnostico, meta_sucesso, valor_mensal, motivo_perda, motivo_perda_obs,
        proximo_passo, proxima_data, notas, indicado_por_id, origem_card_id, criado_por_id)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15::jsonb,$16,$17,$18,$19,$20::jsonb,$21::jsonb,
             $22,$23,$24,$25,$26,$27,$28,$29,$30,$31)
     RETURNING id`,
    [
      novoProtocolo(hoje), dados.nome, dados.segmento ?? null, dados.cidade ?? null,
      dados.uf ?? null, dados.contato ?? null, dados.telefone ?? null, dados.email ?? null,
      soDigitos(dados.cns), soDigitos(dados.cnpj),
      dados.dono_id ?? null, dados.cartorio_id ?? null, etapa, extras.etapa_desde || hoje,
      JSON.stringify(mud.marcos), dados.origem, dados.campanha ?? null,
      mud.cadencia_inicio ?? null, mud.trial_inicio ?? null, JSON.stringify(dados.sinais || {}),
      JSON.stringify(dados.diagnostico || {}), dados.meta_sucesso ?? null,
      dados.valor_mensal ?? null, etapa === 'perdido' ? dados.motivo_perda : null,
      dados.motivo_perda_obs ?? null, dados.proximo_passo ?? null, dados.proxima_data ?? null,
      dados.notas ?? null, dados.indicado_por_id ?? null, extras.origem_card_id ?? null, pessoaId,
    ],
  );
  await client.query(
    `INSERT INTO comercial_movimentos (lead_id, de_etapa, para_etapa, pessoa_id, justificativa) VALUES ($1, NULL, $2, $3, $4)`,
    [rows[0].id, etapa, pessoaId, extras.justificativa ?? null],
  );
  return rows[0].id;
}

// ---------------------------------------------------------------------------
// Config, leitura
// ---------------------------------------------------------------------------

/** GET /comercial/config — constantes da metodologia + pessoas */
export async function config(req, res, next) {
  try {
    await carregarFeriados();
    const { rows: feriados } = await query(
      `SELECT data::text AS data, nome, abrangencia FROM comercial_feriados WHERE data >= CURRENT_DATE - 31 ORDER BY data`,
    );
    res.json({
      etapas: ETAPAS, origens: ORIGENS, motivos_perda: MOTIVOS_PERDA, segmentos: SEGMENTOS,
      cadencia: CADENCIA, marcos_trial: MARCOS_TRIAL, sinais: SINAIS, resultados: RESULTADOS,
      tipos_reuniao: TIPOS_REUNIAO, motivos_nao_contatar: MOTIVOS_NAO_CONTATAR, janelas: JANELAS,
      diagnostico_campos: DIAGNOSTICO_CAMPOS,
      pessoas: await pessoasAtivas(),
      feriados,
      eu: { id: req.pessoa.id, admin: ehAdmin(req), gestor: ehGestor(req) },
      hoje: hojeBR(),
    });
  } catch (err) { next(err); }
}

/** GET /comercial/leads */
export async function listar(req, res, next) {
  try {
    await carregarFeriados();
    const partes = ['l.arquivado_em IS NULL'];
    const params = [];
    const add = (sql, v) => { params.push(v); partes.push(sql.replace('$?', '$' + params.length)); };
    if (req.query.etapa) add('l.etapa = $?', req.query.etapa);
    if (req.query.origem) add('l.origem = $?', req.query.origem);
    if (req.query.dono_id === 'sem') partes.push('l.dono_id IS NULL');
    else if (req.query.dono_id) add('l.dono_id = $?', req.query.dono_id);
    if (req.query.campanha) add('l.campanha = $?', req.query.campanha);
    if (req.query.busca) {
      params.push('%' + req.query.busca + '%');
      const i = '$' + params.length;
      partes.push(`(l.nome ILIKE ${i} OR l.cidade ILIKE ${i} OR l.protocolo ILIKE ${i} OR l.contato ILIKE ${i} OR l.email ILIKE ${i} OR l.cns ILIKE ${i} OR l.cnpj ILIKE ${i})`);
    }
    const limite = Math.min(parseInt(req.query.limite, 10) || 3000, 20000);
    const filtro = partes.join(' AND ');
    const { rows: cont } = await query(`SELECT count(*)::int AS n FROM comercial_leads l WHERE ${filtro}`, params);
    params.push(limite);
    const { rows } = await query(
      SELECT_LEAD + ' WHERE ' + filtro + ' ORDER BY l.etapa_desde ASC, l.nome ASC LIMIT $' + params.length,
      params,
    );
    const hoje = hojeBR();
    res.json({ total: cont[0].n, leads: rows.map((l) => enriquecer(l, hoje)) });
  } catch (err) { next(err); }
}

/** GET /comercial/leads/:id — lead + toques + reuniões + propostas + histórico */
export async function obter(req, res, next) {
  try {
    await carregarFeriados();
    const lead = await carregarLead(req.params.id);
    const [{ rows: toques }, { rows: movimentos }, { rows: alteracoes }, reunioes, propostas] = await Promise.all([
      query(
        `SELECT t.id, t.tipo, t.dia, t.canal, t.resultado, t.duracao_min, t.nota, t.data::text AS data, t.criado_em,
                t.pessoa_id, p.nome AS pessoa_nome, t.estornado_em, t.estorno_motivo, pe.nome AS estornado_por_nome
           FROM comercial_toques t
           LEFT JOIN pessoas_acesso p ON p.id = t.pessoa_id
           LEFT JOIN pessoas_acesso pe ON pe.id = t.estornado_por_id
          WHERE t.lead_id = $1 ORDER BY t.criado_em DESC`,
        [req.params.id],
      ),
      query(
        `SELECT m.id, m.de_etapa, m.para_etapa, m.em, m.justificativa, p.nome AS pessoa_nome
           FROM comercial_movimentos m LEFT JOIN pessoas_acesso p ON p.id = m.pessoa_id
          WHERE m.lead_id = $1 ORDER BY m.em DESC`,
        [req.params.id],
      ),
      query(
        `SELECT a.id, a.campo, a.de, a.para, a.em, p.nome AS pessoa_nome
           FROM comercial_alteracoes a LEFT JOIN pessoas_acesso p ON p.id = a.pessoa_id
          WHERE a.lead_id = $1 ORDER BY a.em DESC LIMIT 300`,
        [req.params.id],
      ),
      reunioesDoLead(req.params.id),
      propostasDoLead(req.params.id),
    ]);
    const pend = {};
    for (const e of ETAPAS) {
      if (e.k === lead.etapa || e.k === 'perdido') continue;
      pend[e.k] = pendenciasPortao(lead, e.k, { reunioes, propostas });
    }
    res.json({ ...enriquecer(lead), toques, movimentos, alteracoes, reunioes, propostas, portoes: pend });
  } catch (err) { next(err); }
}

/** POST /comercial/leads/verificar — checa duplicidade/bloqueio antes de salvar */
export async function verificar(req, res, next) {
  try {
    const d = req.body || {};
    const r = await verificarBloqueios(d, { ignorarId: d.id || null, soVerificar: true });
    res.json({ livre: !r, ...(r || {}) });
  } catch (err) { next(err); }
}

// ---------------------------------------------------------------------------
// Criar / atualizar
// ---------------------------------------------------------------------------

/** POST /comercial/leads */
export async function criar(req, res, next) {
  const client = await pool.connect();
  try {
    const dados = criarSchema.parse(req.body);
    const etapa = dados.etapa || 'prospect';
    validarFechamento(etapa, dados);
    // Novo lead entra no máximo em Diagnóstico: as etapas seguintes têm
    // portões que dependem de registros (reunião, proposta) que ainda não existem.
    if (ETAPA[etapa].i > ETAPA.diagnostico.i && etapa !== 'perdido') {
      throw new AppError('Cadastre o cartório e avance pelas etapas: Qualificado, Trial e Proposta exigem reunião e registros.', 400, 'portao');
    }
    await verificarBloqueios(dados, { client });
    await client.query('BEGIN');
    const id = await inserirLead(client, dados, req.pessoa.id);
    await client.query('COMMIT');
    await registrarAcao({ pessoa_acesso_id: req.pessoa.id, acao: 'comercial.lead.criar', detalhes: { lead_id: id, nome: dados.nome }, req });
    res.status(201).json(enriquecer(await carregarLead(id)));
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    next(err);
  } finally { client.release(); }
}

const CAMPOS_SIMPLES = ['nome', 'segmento', 'cidade', 'uf', 'contato', 'telefone', 'email', 'cns', 'cnpj', 'dono_id',
  'cartorio_id', 'origem', 'campanha', 'valor_mensal', 'motivo_perda_obs', 'proximo_passo',
  'proxima_data', 'notas', 'meta_sucesso', 'indicado_por_id'];

/** PUT /comercial/leads/:id */
export async function atualizar(req, res, next) {
  const client = await pool.connect();
  try {
    await carregarFeriados();
    const dados = atualizarSchema.parse(req.body);
    await client.query('BEGIN');
    await client.query('SELECT 1 FROM comercial_leads WHERE id = $1 FOR UPDATE', [req.params.id]);
    const atual = await carregarLead(req.params.id, client);
    const hoje = hojeBR();

    const sets = {};
    CAMPOS_SIMPLES.forEach((k) => { if (dados[k] !== undefined) sets[k] = dados[k]; });
    if (dados.sinais !== undefined) sets.sinais = { ...(atual.sinais || {}), ...dados.sinais };
    if (dados.diagnostico !== undefined) sets.diagnostico = { ...(atual.diagnostico || {}), ...dados.diagnostico };
    if (dados.indicado_por_id && dados.indicado_por_id === atual.id) throw new AppError('Um lead não pode indicar a si mesmo.');

    // Identificação mudou → checa duplicidade/bloqueio de novo
    const mudouIdent = ['nome', 'cidade', 'uf', 'email', 'telefone', 'cns', 'cnpj']
      .some((k) => dados[k] !== undefined && (dados[k] ?? null) !== (atual[k] ?? null));
    if (mudouIdent) await verificarBloqueios({ ...atual, ...dados }, { ignorarId: atual.id, client });

    const novaEtapa = dados.etapa && dados.etapa !== atual.etapa ? dados.etapa : null;
    const etapaFinal = novaEtapa || atual.etapa;
    const efetivo = { ...atual, ...sets };
    if (novaEtapa || dados.motivo_perda !== undefined || dados.valor_mensal !== undefined) {
      validarFechamento(etapaFinal, { ...efetivo, motivo_perda: dados.motivo_perda ?? atual.motivo_perda });
    }
    if (dados.motivo_perda !== undefined || novaEtapa) {
      sets.motivo_perda = etapaFinal === 'perdido' ? (dados.motivo_perda ?? atual.motivo_perda) : null;
    }

    let justif = null;
    if (novaEtapa) {
      // Retrocesso / reabertura exige justificativa
      if (ehRetrocesso(atual.etapa, novaEtapa)) {
        if (!dados.justificativa) throw new AppError('Voltar etapa ou reabrir um lead exige justificativa.', 400, 'justificativa_obrigatoria');
        justif = dados.justificativa;
      }
      // Portões
      if (!ehRetrocesso(atual.etapa, novaEtapa)) {
        const [reunioes, propostas] = await Promise.all([reunioesDoLead(atual.id, client), propostasDoLead(atual.id, client)]);
        const pend = pendenciasPortao(efetivo, novaEtapa, { reunioes, propostas, valor_mensal: efetivo.valor_mensal });
        if (pend.length) {
          if (dados.forcar_portao && ehGestor(req) && dados.justificativa) {
            justif = `[portão forçado pela gestão] ${dados.justificativa} — pendências: ${pend.join('; ')}`;
          } else {
            const e = new AppError(`Para ir a "${ETAPA[novaEtapa].n}" falta: ${pend.join('; ')}.`, 400, 'portao');
            e.detalhes = pend.map((x) => ({ campo: 'portao', mensagem: x }));
            throw e;
          }
        }
        // Ganho aceita a proposta vigente e herda o valor dela se não veio outro
        if (novaEtapa === 'ganho') {
          const vig = propostas.find((x) => x.status === 'enviada');
          if (vig) {
            await client.query(`UPDATE comercial_propostas SET status = 'aceita' WHERE id = $1`, [vig.id]);
            if (!(Number(sets.valor_mensal ?? atual.valor_mensal) > 0)) sets.valor_mensal = vig.valor_mensal;
          }
        }
      }
      const mud = aplicarEtapa(atual, novaEtapa, hoje);
      sets.etapa = mud.etapa; sets.etapa_desde = mud.etapa_desde;
      sets.marcos = mud.marcos;
      if (mud.cadencia_inicio) sets.cadencia_inicio = mud.cadencia_inicio;
      if (mud.trial_inicio) sets.trial_inicio = mud.trial_inicio;
      // Reabrir ganho desfaz o pagamento? Não: pagamento é fato. Só registra.
    }

    const chaves = Object.keys(sets);
    if (chaves.length) {
      const jsonb = new Set(['marcos', 'sinais', 'diagnostico']);
      const frag = chaves.map((k, i) => k + ' = $' + (i + 2) + (jsonb.has(k) ? '::jsonb' : ''));
      await client.query(
        'UPDATE comercial_leads SET ' + frag.join(', ') + ' WHERE id = $1',
        [req.params.id, ...chaves.map((k) => (jsonb.has(k) ? JSON.stringify(sets[k]) : sets[k]))],
      );
      // Histórico campo a campo (de → para)
      const ignorar = new Set(['marcos', 'etapa_desde', 'cadencia_inicio', 'trial_inicio']);
      for (const k of chaves) {
        if (ignorar.has(k)) continue;
        const de = paraTexto(atual[k]); const para = paraTexto(sets[k]);
        if ((de ?? '') === (para ?? '')) continue;
        await client.query(
          `INSERT INTO comercial_alteracoes (lead_id, campo, de, para, pessoa_id) VALUES ($1,$2,$3,$4,$5)`,
          [req.params.id, k, de, para, req.pessoa.id],
        );
      }
    }
    if (novaEtapa) {
      await client.query(
        `INSERT INTO comercial_movimentos (lead_id, de_etapa, para_etapa, pessoa_id, justificativa) VALUES ($1,$2,$3,$4,$5)`,
        [req.params.id, atual.etapa, novaEtapa, req.pessoa.id, justif],
      );
    }
    await client.query('COMMIT');
    if (novaEtapa) {
      await registrarAcao({
        pessoa_acesso_id: req.pessoa.id, acao: 'comercial.lead.etapa',
        detalhes: { lead_id: req.params.id, de: atual.etapa, para: novaEtapa, justificativa: justif }, req,
      });
    }
    res.json(enriquecer(await carregarLead(req.params.id)));
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    next(err);
  } finally { client.release(); }
}

/** POST /comercial/leads/:id/arquivar {motivo} — só admin */
export async function arquivar(req, res, next) {
  try {
    exigirGestor(req, 'Só a gestão arquiva lead. Para encerrar uma negociação, marque como Perdido com o motivo.');
    const { motivo } = estornoSchema.parse(req.body || {});
    const { rowCount } = await query(
      `UPDATE comercial_leads SET arquivado_em = now(), arquivado_motivo = $2, arquivado_por_id = $3
        WHERE id = $1 AND arquivado_em IS NULL`,
      [req.params.id, motivo, req.pessoa.id],
    );
    if (!rowCount) throw new NaoEncontradoError('Lead não encontrado');
    await query(
      `INSERT INTO comercial_alteracoes (lead_id, campo, de, para, pessoa_id) VALUES ($1,'arquivado',NULL,$2,$3)`,
      [req.params.id, motivo, req.pessoa.id],
    );
    await registrarAcao({ pessoa_acesso_id: req.pessoa.id, acao: 'comercial.lead.arquivar', detalhes: { lead_id: req.params.id, motivo }, req });
    res.status(204).end();
  } catch (err) { next(err); }
}

// ---------------------------------------------------------------------------
// Toques (atividade)
// ---------------------------------------------------------------------------

/** POST /comercial/leads/:id/toques — registra atividade feita HOJE */
export async function registrarToque(req, res, next) {
  const client = await pool.connect();
  try {
    await carregarFeriados();
    const d = toqueSchema.parse(req.body);
    const lead = await carregarLead(req.params.id);
    exigirContatoLiberado(lead);
    if (lead.etapa === 'ganho' && d.tipo === 'cadencia') throw new AppError('Lead já é ganho.');
    if (d.tipo !== 'avulso' && d.dia == null) throw new AppError('Informe o dia do roteiro.', 400, 'dia_obrigatorio');
    if (d.tipo === 'cadencia' && !CADENCIA.some((c) => c.d === d.dia)) throw new AppError('Dia fora da cadência.');
    if (d.tipo === 'marco' && !MARCOS_TRIAL.some((m) => m.d === d.dia)) throw new AppError('Marco inexistente.');
    if (d.tipo === 'marco' && !lead.trial_inicio) throw new AppError('O trial ainda não começou.');
    // Contato sempre com resultado (marco do trial é atividade interna: opcional)
    if (d.tipo !== 'marco' && !d.resultado) {
      throw new AppError('Escolha o resultado do contato (atendeu, não atendeu, caixa postal...).', 400, 'resultado_obrigatorio');
    }
    // Agendou → a reunião vem junto
    if (d.resultado === 'agendou' && !d.reuniao) {
      throw new AppError('Resultado "agendou": informe data e hora da reunião.', 400, 'reuniao_obrigatoria');
    }
    const hoje = hojeBR();
    // Etapas de negociação nunca ficam sem próximo passo datado
    const negociando = ['diagnostico', 'qualificado', 'trial', 'proposta'].includes(lead.etapa);
    const temFuturo = lead.proxima_data && lead.proxima_data >= hoje;
    if (d.tipo === 'avulso' && negociando && !temFuturo && !(d.proximo_passo && d.proxima_data)) {
      throw new AppError('Registre o próximo passo e a data (lead em negociação não pode ficar sem próximo passo).', 400, 'proximo_passo_obrigatorio');
    }
    if (d.proxima_data && d.proxima_data < hoje) throw new AppError('A data do próximo passo não pode estar no passado.');

    const canal = d.canal
      || (d.tipo === 'cadencia' ? CADENCIA.find((c) => c.d === d.dia)?.canal : null)
      || null;

    await client.query('BEGIN');
    const { rows } = await client.query(
      `INSERT INTO comercial_toques (lead_id, tipo, dia, canal, resultado, duracao_min, nota, data, pessoa_id)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
       ON CONFLICT (lead_id, tipo, dia) WHERE tipo IN ('cadencia','marco') AND estornado_em IS NULL DO NOTHING
       RETURNING id`,
      [lead.id, d.tipo, d.tipo === 'avulso' ? null : d.dia, canal, d.resultado ?? null, d.duracao_min ?? null,
        d.nota ?? null, hoje, req.pessoa.id],
    );
    const sets = ['atualizado_em = now()']; const vals = [lead.id];
    if (d.proximo_passo && d.proxima_data) {
      vals.push(d.proximo_passo, d.proxima_data);
      sets.push(`proximo_passo = $${vals.length - 1}`, `proxima_data = $${vals.length}`);
    } else if (d.tipo === 'cadencia' && d.dia === 12 && lead.etapa === 'cadencia' && !temFuturo) {
      vals.push('Cadência encerrada: decidir se volta em 90 dias', hoje);
      sets.push(`proximo_passo = $${vals.length - 1}`, `proxima_data = $${vals.length}`);
    }
    await client.query(`UPDATE comercial_leads SET ${sets.join(', ')} WHERE id = $1`, vals);
    if (d.reuniao) {
      await client.query(
        `INSERT INTO comercial_reunioes (lead_id, tipo, inicio, participantes, nota, responsavel_id, criado_por_id)
         VALUES ($1,$2,$3,$4,$5,$6,$7)`,
        [lead.id, d.reuniao.tipo, d.reuniao.inicio, d.reuniao.participantes ?? null, d.reuniao.nota ?? null,
          d.reuniao.responsavel_id || lead.dono_id || req.pessoa.id, req.pessoa.id],
      );
    }
    await client.query('COMMIT');
    // Agendou diagnóstico a partir de prospect/cadência → avança para Diagnóstico
    if (d.reuniao?.tipo === 'diagnostico' && ['prospect', 'cadencia'].includes(lead.etapa)) {
      const mud = aplicarEtapa(lead, 'diagnostico', hoje);
      await query(
        `UPDATE comercial_leads SET etapa = 'diagnostico', etapa_desde = $2, marcos = $3::jsonb WHERE id = $1`,
        [lead.id, hoje, JSON.stringify(mud.marcos)],
      );
      await query(
        `INSERT INTO comercial_movimentos (lead_id, de_etapa, para_etapa, pessoa_id, justificativa) VALUES ($1,$2,'diagnostico',$3,'reunião agendada no contato')`,
        [lead.id, lead.etapa, req.pessoa.id],
      );
    }
    res.status(rows.length ? 201 : 200).json(enriquecer(await carregarLead(lead.id)));
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    next(err);
  } finally { client.release(); }
}

async function estornarToqueRow(req, toque, motivo) {
  const hoje = hojeBR();
  const meu = toque.pessoa_id === req.pessoa.id && toque.data === hoje;
  if (!meu && !ehGestor(req)) {
    throw new AppError('Só quem registrou pode estornar, e só no mesmo dia. Depois disso, peça à gestão.', 403, 'estorno_negado');
  }
  if (toque.estornado_em) throw new AppError('Este toque já foi estornado.');
  await query(
    `UPDATE comercial_toques SET estornado_em = now(), estornado_por_id = $2, estorno_motivo = $3 WHERE id = $1`,
    [toque.id, req.pessoa.id, motivo],
  );
  await registrarAcao({ pessoa_acesso_id: req.pessoa.id, acao: 'comercial.toque.estornar', detalhes: { toque_id: toque.id, lead_id: toque.lead_id, motivo }, req });
}

/** POST /comercial/toques/:id/estornar {motivo} */
export async function estornarToque(req, res, next) {
  try {
    const { motivo } = estornoSchema.parse(req.body || {});
    const { rows } = await query(`SELECT id, lead_id, pessoa_id, data::text AS data, estornado_em FROM comercial_toques WHERE id = $1`, [req.params.id]);
    if (!rows.length) throw new NaoEncontradoError('Toque não encontrado');
    await estornarToqueRow(req, rows[0], motivo);
    res.json(enriquecer(await carregarLead(rows[0].lead_id)));
  } catch (err) { next(err); }
}

/** POST /comercial/leads/:id/toques/estornar {tipo, dia, motivo} — desmarcar no roteiro */
export async function estornarToqueRoteiro(req, res, next) {
  try {
    const b = z.object({ tipo: z.enum(['cadencia', 'marco']), dia: z.coerce.number().int(), motivo: justificativa }).parse(req.body || {});
    const { rows } = await query(
      `SELECT id, lead_id, pessoa_id, data::text AS data, estornado_em FROM comercial_toques
        WHERE lead_id = $1 AND tipo = $2 AND dia = $3 AND estornado_em IS NULL`,
      [req.params.id, b.tipo, b.dia],
    );
    if (!rows.length) throw new NaoEncontradoError('Toque não encontrado');
    await estornarToqueRow(req, rows[0], b.motivo);
    res.json(enriquecer(await carregarLead(req.params.id)));
  } catch (err) { next(err); }
}

// ---------------------------------------------------------------------------
// Reuniões
// ---------------------------------------------------------------------------

/** POST /comercial/leads/:id/reunioes */
export async function agendarReuniao(req, res, next) {
  try {
    const d = reuniaoSchema.parse(req.body);
    const lead = await carregarLead(req.params.id);
    exigirContatoLiberado(lead);
    const { rows } = await query(
      `INSERT INTO comercial_reunioes (lead_id, tipo, inicio, participantes, nota, responsavel_id, criado_por_id)
       VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING id`,
      [lead.id, d.tipo, d.inicio, d.participantes ?? null, d.nota ?? null, d.responsavel_id || lead.dono_id || req.pessoa.id, req.pessoa.id],
    );
    await registrarAcao({ pessoa_acesso_id: req.pessoa.id, acao: 'comercial.reuniao.agendar', detalhes: { lead_id: lead.id, reuniao_id: rows[0].id, tipo: d.tipo, inicio: d.inicio }, req });
    res.status(201).json({ id: rows[0].id, reunioes: await reunioesDoLead(lead.id) });
  } catch (err) { next(err); }
}

/** POST /comercial/reunioes/:id/desfecho {status: realizada|faltou|cancelada, nota} */
export async function desfechoReuniao(req, res, next) {
  try {
    const b = z.object({ status: z.enum(['realizada', 'faltou', 'cancelada']), nota: txt(2000) }).parse(req.body || {});
    const { rows } = await query(`SELECT id, lead_id, inicio, status FROM comercial_reunioes WHERE id = $1`, [req.params.id]);
    if (!rows.length) throw new NaoEncontradoError('Reunião não encontrada');
    const r = rows[0];
    if (r.status !== 'agendada') throw new AppError('Esta reunião já tem desfecho registrado.');
    if (b.status !== 'cancelada' && new Date(r.inicio) > new Date()) {
      throw new AppError('Só dá para marcar "realizada" ou "faltou" depois do horário da reunião.', 400, 'reuniao_futura');
    }
    await query(
      `UPDATE comercial_reunioes SET status = $2, nota = COALESCE($3, nota), desfecho_em = now(), desfecho_por_id = $4 WHERE id = $1`,
      [r.id, b.status, b.nota ?? null, req.pessoa.id],
    );
    await query(`UPDATE comercial_leads SET atualizado_em = now() WHERE id = $1`, [r.lead_id]);
    await registrarAcao({ pessoa_acesso_id: req.pessoa.id, acao: 'comercial.reuniao.desfecho', detalhes: { reuniao_id: r.id, lead_id: r.lead_id, status: b.status }, req });
    res.json({ reunioes: await reunioesDoLead(r.lead_id) });
  } catch (err) { next(err); }
}

/** POST /comercial/reunioes/:id/remarcar {inicio, nota} */
export async function remarcarReuniao(req, res, next) {
  const client = await pool.connect();
  try {
    const b = z.object({ inicio: z.string().datetime({ offset: true }), nota: txt(2000) }).parse(req.body || {});
    const { rows } = await client.query(`SELECT * FROM comercial_reunioes WHERE id = $1`, [req.params.id]);
    if (!rows.length) throw new NaoEncontradoError('Reunião não encontrada');
    const r = rows[0];
    if (r.status !== 'agendada') throw new AppError('Só reunião agendada pode ser remarcada.');
    await client.query('BEGIN');
    const { rows: nova } = await client.query(
      `INSERT INTO comercial_reunioes (lead_id, tipo, inicio, participantes, nota, responsavel_id, criado_por_id)
       VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING id`,
      [r.lead_id, r.tipo, b.inicio, r.participantes, b.nota ?? r.nota, r.responsavel_id, req.pessoa.id],
    );
    await client.query(
      `UPDATE comercial_reunioes SET status = 'remarcada', remarcada_para_id = $2, desfecho_em = now(), desfecho_por_id = $3 WHERE id = $1`,
      [r.id, nova[0].id, req.pessoa.id],
    );
    await client.query('COMMIT');
    res.json({ reunioes: await reunioesDoLead(r.lead_id) });
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    next(err);
  } finally { client.release(); }
}

// ---------------------------------------------------------------------------
// Propostas
// ---------------------------------------------------------------------------

/** POST /comercial/leads/:id/propostas */
export async function registrarProposta(req, res, next) {
  const client = await pool.connect();
  try {
    const d = propostaSchema.parse(req.body);
    const lead = await carregarLead(req.params.id);
    exigirContatoLiberado(lead);
    if (!['trial', 'proposta', 'qualificado'].includes(lead.etapa)) {
      throw new AppError('Proposta só a partir de Qualificado (depois do diagnóstico).', 400, 'portao');
    }
    const hoje = hojeBR();
    const enviada = d.enviada_em || hoje;
    const validade = d.validade || addDias(enviada, 7);
    if (enviada > hoje) throw new AppError('Data de envio não pode ser futura.');
    if (validade < enviada) throw new AppError('Validade antes do envio.');
    // Política de desconto: só 1 mês grátis, só ex-cliente, uma única vez por cartório.
    if (d.desconto === 'mes_gratis_ex_cliente') {
      if (lead.origem !== 'ex_cliente') throw new AppError('O mês grátis é só para ex-cliente que volta. Não há outro desconto.', 400, 'desconto_negado');
      if (!lead.cns && !lead.cnpj) throw new AppError('Informe o CNS ou o CNPJ do cartório: o mês grátis é controlado por cartório.', 400, 'desconto_negado');
      const { rows: usado } = await client.query(
        `SELECT 1 FROM comercial_propostas x JOIN comercial_leads l ON l.id = x.lead_id
          WHERE x.desconto = 'mes_gratis_ex_cliente' AND x.status IN ('enviada','aceita') AND x.lead_id <> $1
            AND ((l.cns IS NOT NULL AND l.cns = $2) OR (l.cnpj IS NOT NULL AND l.cnpj = $3)) LIMIT 1`,
        [lead.id, lead.cns, lead.cnpj],
      );
      if (usado.length) throw new AppError('Este cartório já usou o mês grátis de ex-cliente.', 400, 'desconto_negado');
    }
    await client.query('BEGIN');
    await client.query(`UPDATE comercial_propostas SET status = 'substituida' WHERE lead_id = $1 AND status = 'enviada'`, [lead.id]);
    const { rows } = await client.query(
      `INSERT INTO comercial_propostas (lead_id, plano, valor_mensal, desconto, enviada_em, validade, observacoes, criado_por_id)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING id`,
      [lead.id, d.plano, d.valor_mensal, d.desconto, enviada, validade, d.observacoes ?? null, req.pessoa.id],
    );
    await client.query(`UPDATE comercial_leads SET valor_mensal = $2, atualizado_em = now() WHERE id = $1`, [lead.id, d.valor_mensal]);
    await client.query('COMMIT');
    await registrarAcao({ pessoa_acesso_id: req.pessoa.id, acao: 'comercial.proposta.registrar', detalhes: { lead_id: lead.id, proposta_id: rows[0].id, valor: d.valor_mensal, desconto: d.desconto }, req });
    res.status(201).json({ id: rows[0].id, propostas: await propostasDoLead(lead.id) });
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    next(err);
  } finally { client.release(); }
}

/** POST /comercial/propostas/:id/status {status: recusada|expirada} */
export async function statusProposta(req, res, next) {
  try {
    const b = z.object({ status: z.enum(['recusada', 'expirada']) }).parse(req.body || {});
    const { rows } = await query(`UPDATE comercial_propostas SET status = $2 WHERE id = $1 AND status = 'enviada' RETURNING lead_id`, [req.params.id, b.status]);
    if (!rows.length) throw new AppError('Proposta não encontrada ou já encerrada.');
    res.json({ propostas: await propostasDoLead(rows[0].lead_id) });
  } catch (err) { next(err); }
}

// ---------------------------------------------------------------------------
// Pagamento (assinado × pago)
// ---------------------------------------------------------------------------

/** POST /comercial/leads/:id/pagamento {pago_em, valor, referencia} — só admin (manual) */
export async function confirmarPagamento(req, res, next) {
  try {
    exigirAdminLocal(req, 'Só a gestão confirma pagamento manual (o ASAAS confirma sozinho quando o CNPJ bate).');
    const b = z.object({ pago_em: dataISO, valor: z.coerce.number().positive(), referencia: z.string().trim().min(3).max(120) }).parse(req.body || {});
    const lead = await carregarLead(req.params.id);
    if (lead.etapa !== 'ganho') throw new AppError('Só lead ganho (assinado) recebe pagamento.');
    if (b.pago_em > hojeBR()) throw new AppError('Data de pagamento no futuro.');
    await query(
      `UPDATE comercial_leads SET pago_em = $2, pago_valor = $3, pago_fonte = 'manual', pago_referencia = $4, pago_confirmado_por_id = $5 WHERE id = $1`,
      [lead.id, b.pago_em, b.valor, b.referencia, req.pessoa.id],
    );
    await query(
      `INSERT INTO comercial_alteracoes (lead_id, campo, de, para, pessoa_id) VALUES ($1,'pagamento',NULL,$2,$3)`,
      [lead.id, `${b.pago_em} · R$ ${b.valor} · ${b.referencia}`, req.pessoa.id],
    );
    await registrarAcao({ pessoa_acesso_id: req.pessoa.id, acao: 'comercial.pagamento.confirmar', detalhes: { lead_id: lead.id, ...b }, req });
    res.json(enriquecer(await carregarLead(lead.id)));
  } catch (err) { next(err); }
}

/** POST /comercial/leads/:id/recompensa-indicacao — admin marca o mês grátis concedido a quem indicou */
export async function recompensaIndicacao(req, res, next) {
  try {
    exigirAdminLocal(req);
    const lead = await carregarLead(req.params.id);
    if (!lead.indicado_por_id) throw new AppError('Este lead não tem indicação registrada.');
    if (!lead.pago_em) throw new AppError('A recompensa só vale depois que o indicado pagar.');
    if (lead.recompensa_indicacao_em) throw new AppError('Recompensa já concedida.');
    await query(`UPDATE comercial_leads SET recompensa_indicacao_em = $2 WHERE id = $1`, [lead.id, hojeBR()]);
    await query(
      `INSERT INTO comercial_alteracoes (lead_id, campo, de, para, pessoa_id) VALUES ($1,'recompensa_indicacao',NULL,$2,$3)`,
      [lead.id, 'mês grátis concedido a ' + (lead.indicado_por_nome || 'quem indicou'), req.pessoa.id],
    );
    res.json(enriquecer(await carregarLead(lead.id)));
  } catch (err) { next(err); }
}

// ---------------------------------------------------------------------------
// Painel e metas
// ---------------------------------------------------------------------------

/** GET /comercial/painel — Hoje, Trials, Supervisão e números */
export async function painel(_req, res, next) {
  try { res.json(await calcularPainel()); } catch (err) { next(err); }
}

/** GET /comercial/metas?mes=YYYY-MM */
export async function obterMetas(req, res, next) {
  try {
    const mes = /^\d{4}-\d{2}$/.test(req.query.mes || '') ? req.query.mes : mesDe(hojeBR());
    res.json({ mes, ...(await metasDoMes(mes)) });
  } catch (err) { next(err); }
}

/** PUT /comercial/metas/:mes — só admin */
export async function salvarMetas(req, res, next) {
  try {
    exigirGestor(req, 'Só a gestão define metas.');
    const mes = req.params.mes;
    if (!/^\d{4}-\d{2}$/.test(mes)) throw new AppError('Mês no formato AAAA-MM');
    const valores = metasSchema.parse(req.body);
    const { rows: ant } = await query(`SELECT valores FROM comercial_metas WHERE mes = $1`, [mes]);
    await query(
      `INSERT INTO comercial_metas (mes, valores, atualizado_por_id) VALUES ($1, $2::jsonb, $3)
       ON CONFLICT (mes) DO UPDATE SET valores = EXCLUDED.valores,
         atualizado_por_id = EXCLUDED.atualizado_por_id, atualizado_em = now()`,
      [mes, JSON.stringify(valores), req.pessoa.id],
    );
    await registrarAcao({ pessoa_acesso_id: req.pessoa.id, acao: 'comercial.metas.salvar', detalhes: { mes, antes: ant[0]?.valores ?? null, depois: valores }, req });
    res.json({ mes, ...(await metasDoMes(mes)) });
  } catch (err) { next(err); }
}

// ---------------------------------------------------------------------------
// Importar lista
// ---------------------------------------------------------------------------

/** POST /comercial/leads/importar-lista — colar planilha (prospecção) */
export async function importarLista(req, res, next) {
  const client = await pool.connect();
  try {
    const d = importarListaSchema.parse(req.body);
    await client.query('BEGIN');
    let criados = 0; const recusados = [];
    for (const ln of d.linhas) {
      const seg = SEGMENTOS.find((s) => s.toLowerCase() === String(ln.segmento || '').toLowerCase());
      const dados = {
        nome: ln.nome, cidade: ln.cidade, uf: ln.uf ? String(ln.uf).toUpperCase().slice(0, 2) : null,
        telefone: ln.telefone, email: ln.email ? ln.email.toLowerCase() : null, contato: ln.contato,
        cns: soDigitos(ln.cns), cnpj: soDigitos(ln.cnpj),
        segmento: seg || (ln.segmento ? 'Outro' : null),
        dono_id: d.dono_id ?? null, origem: d.origem, campanha: d.campanha, etapa: d.etapa,
      };
      const bloq = await verificarBloqueios(dados, { soVerificar: true, client });
      if (bloq) { recusados.push({ nome: ln.nome, motivo: bloq.codigo, mensagem: bloq.msg }); continue; }
      await inserirLead(client, dados, req.pessoa.id);
      criados++;
    }
    await client.query('COMMIT');
    const por = recusados.reduce((a, r) => ({ ...a, [r.motivo]: (a[r.motivo] || 0) + 1 }), {});
    await registrarAcao({ pessoa_acesso_id: req.pessoa.id, acao: 'comercial.importar_lista', detalhes: { criados, recusados: por, origem: d.origem, campanha: d.campanha }, req });
    res.status(201).json({ criados, recusados: recusados.length, recusados_por_motivo: por, exemplos: recusados.slice(0, 20) });
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    next(err);
  } finally { client.release(); }
}

// ---------------------------------------------------------------------------
// Importador do quadro Kanban ("Atividade Comercial") — só admin
// ---------------------------------------------------------------------------
const normalizar = (s) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();

/** Palpite de etapa pelo nome da coluna (o admin confirma na tela). */
function palpiteEtapa(nomeColuna, tipoColuna) {
  const n = normalizar(nomeColuna);
  if (/perd|desist|cancel|nao fech|recus/.test(n)) return 'perdido';
  if (/ganh|fechad|assin|ativ|cliente|pronto para ativ/.test(n)) return 'ganho';
  if (/propost|negocia/.test(n)) return 'proposta';
  if (/trial|teste|onboard|implant|desenvolv/.test(n)) return 'trial';
  if (/qualific/.test(n)) return 'qualificado';
  if (/diagn|reuni|apresent|demo/.test(n)) return 'diagnostico';
  if (/cadenc|contat|follow|andamento/.test(n)) return 'cadencia';
  if (tipoColuna === 'concluida') return 'ganho';
  return 'prospect';
}

function palpiteOrigem(texto, padrao) {
  const n = normalizar(texto);
  if (!n) return padrao;
  if (/indica/.test(n)) return 'indicacao';
  if (/ex.?client/.test(n)) return 'ex_cliente';
  if (/evento|congress|anoreg|feira/.test(n)) return 'evento';
  if (/insta/.test(n)) return 'instagram';
  if (/linked/.test(n)) return 'linkedin';
  if (/webinar|live/.test(n)) return 'webinar';
  if (/e-?mail/.test(n)) return 'email_frio';
  if (/whats|inbound/.test(n)) return 'inbound';
  if (/site|blog|google/.test(n)) return 'site';
  if (/liga|prospec|telefon/.test(n)) return 'prospeccao';
  return padrao;
}

/** GET /comercial/importar-quadro/previa?quadro_id= */
export async function previaImportarQuadro(req, res, next) {
  try {
    const quadroId = req.query.quadro_id;
    if (!quadroId) {
      const { rows } = await query(
        `SELECT q.id, q.nome, (SELECT count(*)::int FROM cards c WHERE c.quadro_id = q.id AND c.arquivado_em IS NULL) AS cards
           FROM quadros q WHERE q.arquivado_em IS NULL ORDER BY q.nome`,
      );
      return res.json({ quadros: rows });
    }
    const { rows: colunas } = await query(
      `SELECT col.id, col.nome, col.tipo, col.ordem,
              (SELECT count(*)::int FROM cards c WHERE c.coluna_id = col.id AND c.arquivado_em IS NULL) AS cards
         FROM colunas col WHERE col.quadro_id = $1 AND col.tipo <> 'sustentacao'
        ORDER BY col.ordem`,
      [quadroId],
    );
    const { rows: ja } = await query(
      `SELECT count(*)::int AS n FROM comercial_leads l JOIN cards c ON c.id = l.origem_card_id WHERE c.quadro_id = $1`,
      [quadroId],
    );
    const { rows: campos } = await query(`SELECT nome FROM quadros_campos WHERE quadro_id = $1 ORDER BY ordem`, [quadroId]);
    const { rows: etiquetas } = await query(
      `SELECT qe.nome, count(ce.card_id)::int AS cards
         FROM quadros_etiquetas qe
         LEFT JOIN cards_etiquetas ce ON ce.etiqueta_id = qe.id
         LEFT JOIN cards c ON c.id = ce.card_id AND c.arquivado_em IS NULL
        WHERE qe.quadro_id = $1 AND c.id IS NOT NULL
        GROUP BY qe.nome ORDER BY cards DESC`,
      [quadroId],
    );
    res.json({
      colunas: colunas.map((c) => ({ ...c, etapa_sugerida: palpiteEtapa(c.nome, c.tipo) })),
      ja_importados: ja[0].n,
      campos: campos.map((c) => c.nome),
      etiquetas,
    });
  } catch (err) { next(err); }
}

/** POST /comercial/importar-quadro — traz os cards como leads (idempotente) */
export async function importarQuadro(req, res, next) {
  const client = await pool.connect();
  try {
    const d = importarQuadroSchema.parse(req.body);
    const { rows: cards } = await client.query(
      `SELECT c.id, c.titulo, c.descricao, c.coluna_id,
              to_char(c.criado_em AT TIME ZONE 'America/Sao_Paulo', 'YYYY-MM-DD') AS criado_dia,
              to_char(COALESCE(c.coluna_desde, c.criado_em) AT TIME ZONE 'America/Sao_Paulo', 'YYYY-MM-DD') AS coluna_dia,
              (SELECT array_agg(lower(qe.nome)) FROM cards_etiquetas ce
                 JOIN quadros_etiquetas qe ON qe.id = ce.etiqueta_id WHERE ce.card_id = c.id) AS etiquetas,
              (SELECT cr.pessoa_id FROM cards_responsaveis cr WHERE cr.card_id = c.id
                ORDER BY cr.ordem, cr.adicionado_em LIMIT 1) AS responsavel_id,
              COALESCE((SELECT jsonb_object_agg(qc.nome, v.valor #>> '{}')
                          FROM cards_campos_valores v JOIN quadros_campos qc ON qc.id = v.campo_id
                         WHERE v.card_id = c.id), '{}'::jsonb) AS campos,
              EXISTS (SELECT 1 FROM comercial_leads l WHERE l.origem_card_id = c.id) AS ja
         FROM cards c
        WHERE c.quadro_id = $1 AND c.arquivado_em IS NULL AND c.card_pai_id IS NULL`,
      [d.quadro_id],
    );

    // Lê o campo pelo nome, tolerante a acento/maiúscula e variações.
    const campo = (cs, ...nomes) => {
      const alvo = nomes.map(normalizar);
      const k = Object.keys(cs).find((x) => alvo.includes(normalizar(x)));
      const v = k ? cs[k] : null;
      return v == null || String(v).trim() === '' ? null : String(v).trim();
    };

    const hoje = hojeBR();
    let criados = 0; let pulados = 0; let ignorados = 0; let bloqueados = 0;
    await client.query('BEGIN');
    for (const c of cards) {
      if (c.ja) { pulados++; continue; }
      if (d.somente_etiqueta && !(c.etiquetas || []).includes(d.somente_etiqueta.trim().toLowerCase())) { ignorados++; continue; }
      const etapa = d.mapa[c.coluna_id];
      if (!etapa || etapa === 'ignorar') { ignorados++; continue; }
      const cs = c.campos || {};

      let cidade = campo(cs, 'Cidade/UF', 'Cidade', 'Município');
      let uf = campo(cs, 'UF', 'Estado');
      const m = cidade && cidade.match(/^(.*?)[\s]*[/\-–][\s]*([A-Za-z]{2})$/);
      if (m) { cidade = m[1].trim(); uf = uf || m[2]; }

      const extras = [
        ['Termômetro', campo(cs, 'Termômetro', 'Termometro')],
        ['Faturamento', campo(cs, 'Faturamento')],
        ['Competência', campo(cs, 'Competência', 'Competencia')],
        ['Site', campo(cs, 'Site')],
        ['Origem no quadro', campo(cs, 'Origem')],
      ].filter(([, v]) => v);
      const notas = [
        c.descricao?.trim() || null,
        extras.length ? extras.map(([k, v]) => `${k}: ${v}`).join('\n') : null,
        '(importado do quadro Kanban)',
      ].filter(Boolean).join('\n\n');

      const dados = {
        nome: c.titulo.slice(0, 255),
        cidade, uf: uf ? uf.toUpperCase().slice(0, 2) : null,
        contato: campo(cs, 'Representante/Oficial', 'Representante', 'Oficial', 'Titular', 'Contato'),
        telefone: campo(cs, 'Telefone/WhatsApp', 'Telefone', 'WhatsApp', 'Celular'),
        email: campo(cs, 'E-mail', 'Email'),
        dono_id: c.responsavel_id,
        origem: palpiteOrigem(campo(cs, 'Origem'), d.origem_padrao),
        campanha: d.campanha ?? null,
        etapa,
        notas,
        // Fechamentos importados sem dado completo: motivo padrão / valor fica
        // para a equipe completar (o ganho entra mesmo sem valor, só aqui).
        motivo_perda: etapa === 'perdido' ? d.motivo_perda_padrao : null,
        valor_mensal: null,
      };
      // Importação histórica pula duplicidade com o próprio funil só via
      // origem_card_id; não-contatar e já-cliente continuam barrando.
      const bloq = await verificarBloqueios(dados, { soVerificar: true, client });
      if (bloq && bloq.codigo !== 'duplicado') { bloqueados++; continue; }
      if (bloq && bloq.codigo === 'duplicado') { pulados++; continue; }
      await inserirLead(client, dados, req.pessoa.id, {
        origem_card_id: c.id, etapa_desde: c.coluna_dia || hoje, data_marcos: c.criado_dia || hoje,
        justificativa: 'importado do quadro Kanban',
      });
      criados++;
    }
    await client.query('COMMIT');
    await registrarAcao({
      pessoa_acesso_id: req.pessoa.id, acao: 'comercial.importar_quadro',
      detalhes: { quadro_id: d.quadro_id, criados, pulados, ignorados, bloqueados }, req,
    });
    res.status(201).json({ criados, pulados, ignorados, bloqueados });
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    next(err);
  } finally { client.release(); }
}
