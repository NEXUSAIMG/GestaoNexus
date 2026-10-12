import { z } from 'zod';
import { query, pool } from '../config/database.js';
import { AppError, NaoEncontradoError } from '../utils/errors.js';
import { registrarAcao } from '../utils/audit.js';
import {
  ETAPAS, ETAPAS_CHAVES, ETAPAS_ATIVAS, ORIGENS, ORIGENS_CHAVES, MOTIVOS_PERDA,
  SEGMENTOS, CADENCIA, MARCOS_TRIAL, SINAIS, METAS_PADRAO,
  hojeBR, mesDe, aplicarEtapa, montarPainel, situacaoPrazo, pontuacao,
} from '../services/comercial.regras.js';

/**
 * Módulo Comercial — Sprint 42.
 *
 * Funil de vendas do Seu Cartório com a metodologia da Mesa Comercial:
 * etapas com prazo, cadência, trial guiado, metas e supervisão diária.
 *
 * Acesso: qualquer pessoa logada (a equipe comercial costuma ter acesso
 * restrito). Importar o quadro Kanban é só para admin.
 *
 * Datas de negócio (etapa_desde, proxima_data...) trafegam sempre como
 * 'YYYY-MM-DD' (cast ::text no SELECT) para não escorregarem de dia por
 * causa de fuso.
 */

// ---------------------------------------------------------------------------
// Schemas
// ---------------------------------------------------------------------------
const dataISO = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'data no formato AAAA-MM-DD');
const txt = (max) => z.string().max(max).nullable().optional()
  .transform((v) => (v == null || String(v).trim() === '' ? null : String(v).trim()));

const camposLead = {
  nome: z.string().trim().min(1, 'informe o nome do cartório').max(255),
  segmento: txt(60),
  cidade: txt(100),
  uf: z.string().max(2).nullable().optional()
    .transform((v) => (v ? String(v).trim().toUpperCase().slice(0, 2) || null : null)),
  contato: txt(255),
  telefone: txt(60),
  email: txt(255),
  dono_id: z.string().uuid().nullable().optional(),
  cartorio_id: z.string().uuid().nullable().optional(),
  origem: z.enum(ORIGENS_CHAVES, { errorMap: () => ({ message: 'escolha a origem do lead' }) }),
  campanha: txt(120),
  etapa: z.enum(ETAPAS_CHAVES).optional(),
  valor_mensal: z.coerce.number().min(0).max(1_000_000).nullable().optional(),
  motivo_perda: z.enum(MOTIVOS_PERDA).nullable().optional(),
  motivo_perda_obs: txt(2000),
  proximo_passo: txt(1000),
  proxima_data: dataISO.nullable().optional().or(z.literal('').transform(() => null)),
  notas: txt(20000),
  sinais: z.record(z.boolean()).optional(),
};

const criarSchema = z.object(camposLead);
const atualizarSchema = z.object(camposLead).partial();

const toqueSchema = z.object({
  tipo: z.enum(['cadencia', 'marco', 'avulso']),
  dia: z.coerce.number().int().min(0).max(30).nullable().optional(),
  canal: txt(40),
  nota: txt(2000),
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
  novosPorPessoa: z.record(z.coerce.number().int().min(0).max(10000)).optional().default({}),
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
  })).min(1).max(2000),
  dono_id: z.string().uuid().nullable().optional(),
  origem: z.enum(ORIGENS_CHAVES),
  campanha: txt(120),
  etapa: z.enum(['prospect', 'cadencia']).optional().default('prospect'),
});

const importarQuadroSchema = z.object({
  quadro_id: z.string().uuid(),
  // Só cards com esta etiqueta (ex.: "Cliente"); null = todos
  somente_etiqueta: z.string().max(80).nullable().optional(),
  // coluna_id -> etapa (ou 'ignorar')
  mapa: z.record(z.enum([...ETAPAS_CHAVES, 'ignorar'])),
  origem_padrao: z.enum(ORIGENS_CHAVES),
  campanha: txt(120),
  motivo_perda_padrao: z.enum(MOTIVOS_PERDA).optional().default('Outro'),
});

// ---------------------------------------------------------------------------
// Leitura
// ---------------------------------------------------------------------------
const SELECT_LEAD = `
  SELECT l.id, l.protocolo, l.nome, l.segmento, l.cidade, l.uf, l.contato,
         l.telefone, l.email, l.cartorio_id, l.produto_cliente_id, l.dono_id,
         pd.nome AS dono_nome,
         l.etapa, l.etapa_desde::text AS etapa_desde, l.marcos, l.origem, l.campanha,
         l.cadencia_inicio::text AS cadencia_inicio, l.trial_inicio::text AS trial_inicio,
         l.sinais, l.valor_mensal::float AS valor_mensal, l.motivo_perda, l.motivo_perda_obs,
         l.proximo_passo, l.proxima_data::text AS proxima_data, l.notas,
         l.origem_card_id, l.criado_em, l.atualizado_em,
         to_char(l.atualizado_em AT TIME ZONE 'America/Sao_Paulo', 'YYYY-MM-DD') AS atualizado_dia,
         COALESCE((SELECT jsonb_object_agg(t.dia::text, t.data::text)
                     FROM comercial_toques t
                    WHERE t.lead_id = l.id AND t.tipo = 'cadencia'), '{}'::jsonb) AS toques_cadencia,
         COALESCE((SELECT jsonb_object_agg(t.dia::text, t.data::text)
                     FROM comercial_toques t
                    WHERE t.lead_id = l.id AND t.tipo = 'marco'), '{}'::jsonb) AS toques_marco
    FROM comercial_leads l
    LEFT JOIN pessoas_acesso pd ON pd.id = l.dono_id
`;

function enriquecer(l, hoje = hojeBR()) {
  return {
    ...l,
    prazo: situacaoPrazo(l, hoje),
    pontos: ['trial', 'proposta', 'ganho'].includes(l.etapa) ? pontuacao(l) : null,
  };
}

async function carregarLead(id, client = { query }) {
  const { rows } = await client.query(SELECT_LEAD + ' WHERE l.id = $1', [id]);
  if (!rows.length) throw new NaoEncontradoError('Lead não encontrado');
  return rows[0];
}

async function metasDoMes(mes) {
  const { rows } = await query(
    `SELECT mes, valores FROM comercial_metas WHERE mes <= $1 ORDER BY mes DESC LIMIT 1`,
    [mes],
  );
  return {
    ...METAS_PADRAO,
    ...(rows[0]?.valores || {}),
    _mes_origem: rows[0]?.mes || null,
  };
}

async function pessoasAtivas() {
  const { rows } = await query(
    `SELECT id, nome FROM pessoas_acesso WHERE ativo = TRUE ORDER BY nome`,
  );
  return rows;
}

// ---------------------------------------------------------------------------
// Helpers de escrita
// ---------------------------------------------------------------------------
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

async function inserirLead(client, dados, pessoaId, extras = {}) {
  const hoje = hojeBR();
  const etapa = dados.etapa || 'prospect';
  const base = { etapa: null, marcos: {}, cadencia_inicio: null, trial_inicio: null };
  // Importação: etapas anteriores datadas na criação do card e a etapa
  // atual na data em que o card entrou na coluna — senão um "Concluído"
  // antigo contaria como ganho deste mês.
  const mud = aplicarEtapa(base, etapa, extras.data_marcos || hoje);
  if (extras.etapa_desde) {
    if (mud.marcos[etapa]) mud.marcos[etapa] = extras.etapa_desde;
    if (etapa === 'cadencia') mud.cadencia_inicio = extras.etapa_desde;
    if (etapa === 'trial') mud.trial_inicio = extras.etapa_desde;
  }
  const { rows } = await client.query(
    `INSERT INTO comercial_leads
       (protocolo, nome, segmento, cidade, uf, contato, telefone, email, dono_id,
        cartorio_id, etapa, etapa_desde, marcos, origem, campanha, cadencia_inicio,
        trial_inicio, sinais, valor_mensal, motivo_perda, motivo_perda_obs,
        proximo_passo, proxima_data, notas, origem_card_id, criado_por_id)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13::jsonb,$14,$15,$16,$17,$18::jsonb,
             $19,$20,$21,$22,$23,$24,$25,$26)
     RETURNING id`,
    [
      novoProtocolo(hoje), dados.nome, dados.segmento ?? null, dados.cidade ?? null,
      dados.uf ?? null, dados.contato ?? null, dados.telefone ?? null, dados.email ?? null,
      dados.dono_id ?? null, dados.cartorio_id ?? null, etapa, extras.etapa_desde || hoje,
      JSON.stringify(mud.marcos), dados.origem, dados.campanha ?? null,
      mud.cadencia_inicio ?? null, mud.trial_inicio ?? null, JSON.stringify(dados.sinais || {}),
      dados.valor_mensal ?? null, etapa === 'perdido' ? dados.motivo_perda : null,
      dados.motivo_perda_obs ?? null, dados.proximo_passo ?? null, dados.proxima_data ?? null,
      dados.notas ?? null, extras.origem_card_id ?? null, pessoaId,
    ],
  );
  await client.query(
    `INSERT INTO comercial_movimentos (lead_id, de_etapa, para_etapa, pessoa_id) VALUES ($1, NULL, $2, $3)`,
    [rows[0].id, etapa, pessoaId],
  );
  return rows[0].id;
}

// ---------------------------------------------------------------------------
// Endpoints
// ---------------------------------------------------------------------------

/** GET /comercial/config — constantes da metodologia + pessoas */
export async function config(_req, res, next) {
  try {
    res.json({
      etapas: ETAPAS, origens: ORIGENS, motivos_perda: MOTIVOS_PERDA, segmentos: SEGMENTOS,
      cadencia: CADENCIA, marcos_trial: MARCOS_TRIAL, sinais: SINAIS,
      pessoas: await pessoasAtivas(),
      hoje: hojeBR(),
    });
  } catch (err) { next(err); }
}

/** GET /comercial/leads */
export async function listar(req, res, next) {
  try {
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
      partes.push(`(l.nome ILIKE ${i} OR l.cidade ILIKE ${i} OR l.protocolo ILIKE ${i} OR l.contato ILIKE ${i} OR l.email ILIKE ${i})`);
    }
    const limite = Math.min(parseInt(req.query.limite, 10) || 3000, 20000);
    params.push(limite);
    const { rows } = await query(
      SELECT_LEAD + ' WHERE ' + partes.join(' AND ')
        + ' ORDER BY l.etapa_desde ASC, l.nome ASC LIMIT $' + params.length,
      params,
    );
    const hoje = hojeBR();
    const { rows: cont } = await query(
      `SELECT count(*)::int AS n FROM comercial_leads l WHERE ${partes.join(' AND ')}`,
      params.slice(0, -1),
    );
    res.json({ total: cont[0].n, leads: rows.map((l) => enriquecer(l, hoje)) });
  } catch (err) { next(err); }
}

/** GET /comercial/leads/:id — lead + toques + histórico de etapas */
export async function obter(req, res, next) {
  try {
    const lead = await carregarLead(req.params.id);
    const [{ rows: toques }, { rows: movimentos }] = await Promise.all([
      query(
        `SELECT t.id, t.tipo, t.dia, t.canal, t.nota, t.data::text AS data, t.criado_em,
                p.nome AS pessoa_nome
           FROM comercial_toques t LEFT JOIN pessoas_acesso p ON p.id = t.pessoa_id
          WHERE t.lead_id = $1 ORDER BY t.criado_em DESC`,
        [req.params.id],
      ),
      query(
        `SELECT m.id, m.de_etapa, m.para_etapa, m.em, p.nome AS pessoa_nome
           FROM comercial_movimentos m LEFT JOIN pessoas_acesso p ON p.id = m.pessoa_id
          WHERE m.lead_id = $1 ORDER BY m.em DESC`,
        [req.params.id],
      ),
    ]);
    res.json({ ...enriquecer(lead), toques, movimentos });
  } catch (err) { next(err); }
}

/** POST /comercial/leads */
export async function criar(req, res, next) {
  const client = await pool.connect();
  try {
    const dados = criarSchema.parse(req.body);
    validarFechamento(dados.etapa || 'prospect', dados);
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

/** PUT /comercial/leads/:id */
export async function atualizar(req, res, next) {
  const client = await pool.connect();
  try {
    const dados = atualizarSchema.parse(req.body);
    await client.query('BEGIN');
    const atual = await carregarLead(req.params.id, client);
    const hoje = hojeBR();

    const sets = {};
    const simples = ['nome', 'segmento', 'cidade', 'uf', 'contato', 'telefone', 'email', 'dono_id',
      'cartorio_id', 'origem', 'campanha', 'valor_mensal', 'motivo_perda_obs', 'proximo_passo',
      'proxima_data', 'notas'];
    simples.forEach((k) => { if (dados[k] !== undefined) sets[k] = dados[k]; });
    if (dados.sinais !== undefined) sets.sinais = JSON.stringify({ ...(atual.sinais || {}), ...dados.sinais });

    const novaEtapa = dados.etapa && dados.etapa !== atual.etapa ? dados.etapa : null;
    const etapaFinal = novaEtapa || atual.etapa;
    const efetivo = { ...atual, ...dados };
    if (novaEtapa || dados.motivo_perda !== undefined || dados.valor_mensal !== undefined) {
      validarFechamento(etapaFinal, efetivo);
    }
    if (dados.motivo_perda !== undefined || novaEtapa) {
      sets.motivo_perda = etapaFinal === 'perdido' ? efetivo.motivo_perda : null;
    }
    if (novaEtapa) {
      const mud = aplicarEtapa(atual, novaEtapa, hoje);
      sets.etapa = mud.etapa; sets.etapa_desde = mud.etapa_desde;
      sets.marcos = JSON.stringify(mud.marcos);
      if (mud.cadencia_inicio) sets.cadencia_inicio = mud.cadencia_inicio;
      if (mud.trial_inicio) sets.trial_inicio = mud.trial_inicio;
    }

    const chaves = Object.keys(sets);
    if (chaves.length) {
      const jsonb = new Set(['marcos', 'sinais']);
      const frag = chaves.map((k, i) => k + ' = $' + (i + 2) + (jsonb.has(k) ? '::jsonb' : ''));
      await client.query(
        'UPDATE comercial_leads SET ' + frag.join(', ') + ' WHERE id = $1',
        [req.params.id, ...chaves.map((k) => sets[k])],
      );
    }
    if (novaEtapa) {
      await client.query(
        `INSERT INTO comercial_movimentos (lead_id, de_etapa, para_etapa, pessoa_id) VALUES ($1,$2,$3,$4)`,
        [req.params.id, atual.etapa, novaEtapa, req.pessoa.id],
      );
    }
    await client.query('COMMIT');
    if (novaEtapa) {
      await registrarAcao({
        pessoa_acesso_id: req.pessoa.id, acao: 'comercial.lead.etapa',
        detalhes: { lead_id: req.params.id, de: atual.etapa, para: novaEtapa }, req,
      });
    }
    res.json(enriquecer(await carregarLead(req.params.id)));
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    next(err);
  } finally { client.release(); }
}

/** POST /comercial/leads/:id/arquivar */
export async function arquivar(req, res, next) {
  try {
    const { rowCount } = await query(
      `UPDATE comercial_leads SET arquivado_em = now() WHERE id = $1 AND arquivado_em IS NULL`,
      [req.params.id],
    );
    if (!rowCount) throw new NaoEncontradoError('Lead não encontrado');
    await registrarAcao({ pessoa_acesso_id: req.pessoa.id, acao: 'comercial.lead.arquivar', detalhes: { lead_id: req.params.id }, req });
    res.status(204).end();
  } catch (err) { next(err); }
}

/** POST /comercial/leads/:id/toques — registra atividade feita hoje */
export async function registrarToque(req, res, next) {
  try {
    const dados = toqueSchema.parse(req.body);
    const lead = await carregarLead(req.params.id);
    if (dados.tipo !== 'avulso' && (dados.dia == null)) {
      throw new AppError('Informe o dia do roteiro.', 400, 'dia_obrigatorio');
    }
    const hoje = hojeBR();
    const canal = dados.canal
      || (dados.tipo === 'cadencia' ? CADENCIA.find((c) => c.d === dados.dia)?.canal : null)
      || null;
    const { rows } = await query(
      `INSERT INTO comercial_toques (lead_id, tipo, dia, canal, nota, data, pessoa_id)
       VALUES ($1,$2,$3,$4,$5,$6,$7)
       ON CONFLICT (lead_id, tipo, dia) WHERE tipo IN ('cadencia','marco') DO NOTHING
       RETURNING id`,
      [lead.id, dados.tipo, dados.tipo === 'avulso' ? null : dados.dia, canal, dados.nota ?? null, hoje, req.pessoa.id],
    );
    // Toque registra atividade: o lead conta como "atualizado hoje" na supervisão.
    await query(`UPDATE comercial_leads SET atualizado_em = now() WHERE id = $1`, [lead.id]);
    // Último toque da cadência sem resposta: deixa um próximo passo para decidir.
    if (dados.tipo === 'cadencia' && dados.dia === 12 && lead.etapa === 'cadencia' && !lead.proxima_data) {
      await query(
        `UPDATE comercial_leads SET proximo_passo = COALESCE(proximo_passo, $2), proxima_data = $3 WHERE id = $1`,
        [lead.id, 'Cadência encerrada: decidir se volta em 90 dias', hoje],
      );
    }
    res.status(rows.length ? 201 : 200).json(enriquecer(await carregarLead(lead.id)));
  } catch (err) { next(err); }
}

/** DELETE /comercial/toques/:id — desfaz um toque marcado por engano */
export async function excluirToque(req, res, next) {
  try {
    const { rows } = await query(`DELETE FROM comercial_toques WHERE id = $1 RETURNING lead_id`, [req.params.id]);
    if (!rows.length) throw new NaoEncontradoError('Toque não encontrado');
    res.json(enriquecer(await carregarLead(rows[0].lead_id)));
  } catch (err) { next(err); }
}

/** DELETE /comercial/leads/:id/toques?tipo=&dia= — desmarca pelo roteiro */
export async function desmarcarToque(req, res, next) {
  try {
    const tipo = String(req.query.tipo || '');
    const dia = parseInt(req.query.dia, 10);
    if (!['cadencia', 'marco'].includes(tipo) || Number.isNaN(dia)) throw new AppError('tipo/dia inválidos');
    await query(`DELETE FROM comercial_toques WHERE lead_id = $1 AND tipo = $2 AND dia = $3`, [req.params.id, tipo, dia]);
    res.json(enriquecer(await carregarLead(req.params.id)));
  } catch (err) { next(err); }
}

/** GET /comercial/painel — Hoje, Trials, Supervisão e números */
export async function painel(_req, res, next) {
  try {
    const hoje = hojeBR();
    const [{ rows: leads }, { rows: toquesHoje }, metas, pessoas] = await Promise.all([
      query(SELECT_LEAD + ' WHERE l.arquivado_em IS NULL'),
      query(`SELECT t.lead_id, t.pessoa_id FROM comercial_toques t
               JOIN comercial_leads l ON l.id = t.lead_id AND l.arquivado_em IS NULL
              WHERE t.data = $1`, [hoje]),
      metasDoMes(mesDe(hoje)),
      pessoasAtivas(),
    ]);
    // Supervisão: quem tem lead ativo ou meta de novos no mês.
    const comLead = new Set(leads.filter((l) => ETAPAS_ATIVAS.includes(l.etapa)).map((l) => l.dono_id));
    const comMeta = new Set(Object.keys(metas.novosPorPessoa || {}).filter((k) => Number(metas.novosPorPessoa[k]) > 0));
    const sup = pessoas.filter((p) => comLead.has(p.id) || comMeta.has(p.id));
    res.json(montarPainel({ leads, toquesHoje, metas, pessoas: sup, hoje }));
  } catch (err) { next(err); }
}

/** GET /comercial/metas?mes=YYYY-MM */
export async function obterMetas(req, res, next) {
  try {
    const mes = /^\d{4}-\d{2}$/.test(req.query.mes || '') ? req.query.mes : mesDe(hojeBR());
    res.json({ mes, ...(await metasDoMes(mes)) });
  } catch (err) { next(err); }
}

/** PUT /comercial/metas/:mes */
export async function salvarMetas(req, res, next) {
  try {
    const mes = req.params.mes;
    if (!/^\d{4}-\d{2}$/.test(mes)) throw new AppError('Mês no formato AAAA-MM');
    const valores = metasSchema.parse(req.body);
    await query(
      `INSERT INTO comercial_metas (mes, valores, atualizado_por_id) VALUES ($1, $2::jsonb, $3)
       ON CONFLICT (mes) DO UPDATE SET valores = EXCLUDED.valores,
         atualizado_por_id = EXCLUDED.atualizado_por_id, atualizado_em = now()`,
      [mes, JSON.stringify(valores), req.pessoa.id],
    );
    await registrarAcao({ pessoa_acesso_id: req.pessoa.id, acao: 'comercial.metas.salvar', detalhes: { mes }, req });
    res.json({ mes, ...(await metasDoMes(mes)) });
  } catch (err) { next(err); }
}

/** POST /comercial/leads/importar-lista — colar planilha (prospecção) */
export async function importarLista(req, res, next) {
  const client = await pool.connect();
  try {
    const d = importarListaSchema.parse(req.body);
    await client.query('BEGIN');
    let criados = 0;
    for (const ln of d.linhas) {
      const seg = SEGMENTOS.find((s) => s.toLowerCase() === String(ln.segmento || '').toLowerCase());
      await inserirLead(client, {
        nome: ln.nome, cidade: ln.cidade, uf: ln.uf ? String(ln.uf).toUpperCase().slice(0, 2) : null,
        telefone: ln.telefone, email: ln.email, contato: ln.contato,
        segmento: seg || (ln.segmento ? 'Outro' : null),
        dono_id: d.dono_id ?? null, origem: d.origem, campanha: d.campanha, etapa: d.etapa,
      }, req.pessoa.id);
      criados++;
    }
    await client.query('COMMIT');
    await registrarAcao({ pessoa_acesso_id: req.pessoa.id, acao: 'comercial.importar_lista', detalhes: { criados, origem: d.origem, campanha: d.campanha }, req });
    res.status(201).json({ criados });
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
    let criados = 0; let pulados = 0; let ignorados = 0;
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
      await inserirLead(client, dados, req.pessoa.id, {
        origem_card_id: c.id, etapa_desde: c.coluna_dia || hoje, data_marcos: c.criado_dia || hoje,
      });
      criados++;
    }
    await client.query('COMMIT');
    await registrarAcao({
      pessoa_acesso_id: req.pessoa.id, acao: 'comercial.importar_quadro',
      detalhes: { quadro_id: d.quadro_id, criados, pulados, ignorados }, req,
    });
    res.status(201).json({ criados, pulados, ignorados });
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    next(err);
  } finally { client.release(); }
}
