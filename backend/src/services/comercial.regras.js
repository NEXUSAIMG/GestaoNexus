/**
 * Módulo Comercial — regras da metodologia (funções puras, sem banco).
 *
 * Mesmas regras da "Mesa Comercial" original: etapas com prazo (SLA),
 * cadência de 12 dias úteis, trial guiado de 14 dias com marcos e
 * pontuação de ativação, desdobramento da meta de trás para frente e
 * supervisão diária por pessoa.
 *
 * Ficam aqui (e não no controller) porque o relatório semanal automático
 * (entrega 3) usa exatamente os mesmos cálculos.
 */

export const ETAPAS = [
  { k: 'prospect',    n: 'Prospect',             sla: 2 },
  { k: 'cadencia',    n: 'Em cadência',          sla: 12 },
  { k: 'diagnostico', n: 'Diagnóstico agendado', sla: 5 },
  { k: 'qualificado', n: 'Qualificado',          sla: 3 },
  { k: 'trial',       n: 'Trial guiado',         sla: 14 },
  { k: 'proposta',    n: 'Proposta',             sla: 7 },
  { k: 'ganho',       n: 'Ganho',                sla: 0 },
  { k: 'perdido',     n: 'Perdido',              sla: 0 },
];
export const ETAPA = Object.fromEntries(ETAPAS.map((e, i) => [e.k, { ...e, i }]));
export const ETAPAS_CHAVES = ETAPAS.map((e) => e.k);
export const ETAPAS_ATIVAS = ['prospect', 'cadencia', 'diagnostico', 'qualificado', 'trial', 'proposta'];

export const SEGMENTOS = ['Registro Civil', 'Tabelionato de Notas', 'Registro de Imóveis', 'Protesto', 'RTD/PJ', 'Outro'];

// Origem é obrigatória: é o que permite apurar custo e conversão por canal.
export const ORIGENS = {
  prospeccao: 'Prospecção ativa (ligação)',
  email_frio: 'E-mail frio',
  inbound:    'Inbound WhatsApp',
  site:       'Site / blog',
  instagram:  'Instagram',
  linkedin:   'LinkedIn',
  indicacao:  'Indicação',
  ex_cliente: 'Ex-cliente',
  evento:     'Congresso / evento',
  webinar:    'Webinar',
  outro:      'Outro',
};
export const ORIGENS_CHAVES = Object.keys(ORIGENS);

export const MOTIVOS_PERDA = [
  'Preço', 'Sem dor', 'Sem decisor', 'Escolheu concorrente',
  'Sem tempo para implantar', 'Problema técnico', 'Sumiu', 'Outro',
];

export const CADENCIA = [
  { d: 1,  canal: 'Ligação + WhatsApp', acao: 'Falar com titular ou responsável; se não atender, mensagem curta com a dor' },
  { d: 2,  canal: 'E-mail',             acao: 'Caso de cartório parecido com um número de resultado' },
  { d: 4,  canal: 'Ligação',            acao: 'Pedir 20 minutos para diagnóstico do atendimento' },
  { d: 6,  canal: 'WhatsApp',           acao: 'Vídeo de 60 segundos do atendimento funcionando' },
  { d: 8,  canal: 'Ligação',            acao: 'Nova tentativa em outro horário' },
  { d: 10, canal: 'WhatsApp',           acao: 'Depoimento de um titular cliente' },
  { d: 11, canal: 'E-mail',             acao: 'Convite para o webinar do mês' },
  { d: 12, canal: 'WhatsApp',           acao: 'Encerramento: posso voltar a falar em 3 meses?' },
];

export const MARCOS_TRIAL = [
  { d: 0,  n: 'Ativação (30 min)',     acao: 'Conectar WhatsApp, logar atendentes, escrever a meta de sucesso' },
  { d: 1,  n: 'Primeiras conversas',   acao: 'Mensagem: já chegou a primeira conversa?' },
  { d: 3,  n: 'Checagem de uso',       acao: 'Conferir sinais; abaixo de 40 pontos, ligar hoje' },
  { d: 7,  n: 'Reunião de resultado',  acao: 'Números contra a meta e proposta ao titular' },
  { d: 10, n: 'Acompanhar proposta',   acao: 'Tirar dúvidas, envolver a TI se preciso' },
  { d: 14, n: 'Decisão',               acao: 'Assinar ou encerrar; prorrogar só com data combinada' },
];

export const SINAIS = [
  { k: 'wa',         n: 'WhatsApp conectado',                              p: 20 },
  { k: 'atendentes', n: '2 ou mais atendentes logados',                    p: 15 },
  { k: 'bot',        n: 'Respostas automáticas ou chatbot ativo',          p: 20 },
  { k: 'conversas',  n: 'Conversas reais atendidas pela plataforma',       p: 25 },
  { k: 'titular',    n: 'Titular abriu relatório ou participou de reunião', p: 20 },
];

// Metas iniciais = números do plano emergencial (dados reais de out/2026).
export const METAS_PADRAO = {
  metaClientes: 5,
  ticket: 540,
  diasUteis: 21,
  taxaContatoDiag: 6,
  taxaDiagTrial: 55,
  taxaTrialPago: 30,
  metaNovosDia: 25,
  metaToquesDia: 80,
  novosPorPessoa: {},
};

// Resultado de cada toque. `conecta` = falou com alguém (base da taxa de conexão).
export const RESULTADOS = [
  { k: 'atendeu',       n: 'Atendeu / conversou',      conecta: true },
  { k: 'agendou',       n: 'Agendou reunião',          conecta: true },
  { k: 'pediu_retorno', n: 'Pediu retorno',            conecta: true },
  { k: 'recusou',       n: 'Recusou',                  conecta: true },
  { k: 'respondeu',     n: 'Respondeu (mensagem)',     conecta: true },
  { k: 'nao_atendeu',   n: 'Não atendeu',              conecta: false },
  { k: 'caixa_postal',  n: 'Caixa postal',             conecta: false },
  { k: 'numero_errado', n: 'Número/contato errado',    conecta: false },
  { k: 'enviado',       n: 'Mensagem enviada',         conecta: false },
];
export const RESULTADOS_CHAVES = RESULTADOS.map((r) => r.k);
export const RESULTADOS_CONECTAM = RESULTADOS.filter((r) => r.conecta).map((r) => r.k);

export const TIPOS_REUNIAO = { diagnostico: 'Diagnóstico', ativacao: 'Ativação do trial', resultado: 'Reunião de resultado (D7)', outra: 'Outra' };
export const MOTIVOS_NAO_CONTATAR = { descadastro: 'Pediu descadastro', pedido_lgpd: 'Pedido LGPD (titular de dados)', pediu_nao_contatar: 'Pediu para não ligar', outro: 'Outro' };
export const JANELAS = { abertura: '8h30 · abertura', meio: '12h30 · meio do dia', fechamento: '17h · fechamento' };

// Campos do diagnóstico exigidos para passar a Qualificado.
export const DIAGNOSTICO_CAMPOS = [
  { k: 'msgs_dia',      n: 'Mensagens de WhatsApp por dia',      obrigatorio: true },
  { k: 'atendentes',    n: 'Pessoas que respondem hoje',          obrigatorio: true },
  { k: 'dor',           n: 'Dor principal (nas palavras do cliente)', obrigatorio: true },
  { k: 'decisor',       n: 'Quem decide a compra',                obrigatorio: true },
  { k: 'prazo',         n: 'Prazo para resolver',                 obrigatorio: true },
  { k: 'sistema_atual', n: 'Como atendem hoje / sistema atual',   obrigatorio: false },
];

// ---------------------------------------------------------------------------
// Datas — sempre 'YYYY-MM-DD' no fuso de Brasília
// ---------------------------------------------------------------------------
const FUSO = 'America/Sao_Paulo';
const fmt = new Intl.DateTimeFormat('en-CA', { timeZone: FUSO, year: 'numeric', month: '2-digit', day: '2-digit' });

export function hojeBR(agora = new Date()) { return fmt.format(agora); }
export const mesDe = (iso) => String(iso).slice(0, 7);

function parse(s) { const [y, m, d] = String(s).split('-').map(Number); return new Date(Date.UTC(y, m - 1, d)); }
function iso(d) { return d.toISOString().slice(0, 10); }
export function addDias(s, n) { const d = parse(s); d.setUTCDate(d.getUTCDate() + n); return iso(d); }
// Feriados carregados do banco pelo controller (comercial_feriados).
let FERIADOS = new Set();
export function definirFeriados(lista) { FERIADOS = new Set(lista); }
export function ehDiaUtil(s) {
  const w = parse(s).getUTCDay();
  return w !== 0 && w !== 6 && !FERIADOS.has(s);
}
export function addDiasUteis(s, n) {
  const d = parse(s); let k = 0;
  while (k < n) { d.setUTCDate(d.getUTCDate() + 1); if (ehDiaUtil(iso(d))) k++; }
  return iso(d);
}
export function diasUteisDoMes(mes) {
  const [y, m] = mes.split('-').map(Number);
  const d = new Date(Date.UTC(y, m - 1, 1)); let n = 0;
  while (d.getUTCMonth() === m - 1) { if (ehDiaUtil(iso(d))) n++; d.setUTCDate(d.getUTCDate() + 1); }
  return n;
}
export function diffDias(a, b) { return Math.round((parse(b) - parse(a)) / 864e5); }

// ---------------------------------------------------------------------------
// Mudança de etapa: registra marcos (primeira vez em cada etapa)
// ---------------------------------------------------------------------------
/**
 * Devolve os campos que mudam quando o lead vai para `nova`.
 * Um lead que pula etapas (ex.: inbound direto para diagnóstico) é contado
 * nas anteriores, senão as taxas de conversão ficam infladas.
 */
export function aplicarEtapa(lead, nova, hoje = hojeBR()) {
  const marcos = { ...(lead.marcos || {}) };
  const mud = { marcos };
  if (lead.etapa !== nova) { mud.etapa = nova; mud.etapa_desde = hoje; }
  if (nova === 'perdido') {
    marcos.perdido = marcos.perdido || hoje;
  } else {
    const idx = ETAPA[nova].i;
    ETAPAS.slice(0, Math.min(idx + 1, 6)).forEach((e) => { if (!marcos[e.k]) marcos[e.k] = hoje; });
    if (nova === 'ganho') marcos.ganho = marcos.ganho || hoje;
  }
  if (nova === 'cadencia' && !lead.cadencia_inicio) mud.cadencia_inicio = hoje;
  if (nova === 'trial' && !lead.trial_inicio) mud.trial_inicio = hoje;
  return mud;
}

// ---------------------------------------------------------------------------
// Portões de etapa (critérios de saída)
// ---------------------------------------------------------------------------
/**
 * O que falta para o lead entrar na etapa `nova`. Os portões são
 * cumulativos: ir de Prospect direto para Trial exige também o que
 * Qualificado exige.
 *
 * @param ctx { reunioes: [{tipo,status}], propostas: [{status}], valor_mensal }
 * @returns lista de pendências (vazia = pode avançar)
 */
export function pendenciasPortao(lead, nova, ctx = {}) {
  const p = [];
  if (nova === 'perdido') return p;
  const alvo = ETAPA[nova].i;
  const reun = ctx.reunioes || [];
  const props = ctx.propostas || [];
  const diag = lead.diagnostico || {};

  // Etapa que o lead já alcançou antes (marco registrado — inclusive vindo
  // da importação do quadro) não é cobrada de novo: o portão vale para a
  // primeira passagem e para etapas puladas.
  const jaPassou = (k) => !!(lead.marcos && lead.marcos[k]);

  if (alvo >= ETAPA.qualificado.i && !jaPassou('qualificado')) {
    if (!reun.some((r) => r.tipo === 'diagnostico' && r.status === 'realizada')) {
      p.push('reunião de diagnóstico marcada como realizada');
    }
    DIAGNOSTICO_CAMPOS.filter((c) => c.obrigatorio).forEach((c) => {
      if (diag[c.k] == null || String(diag[c.k]).trim() === '') p.push('diagnóstico: ' + c.n.toLowerCase());
    });
  }
  if (alvo >= ETAPA.trial.i && !jaPassou('trial')) {
    if (!lead.meta_sucesso || !String(lead.meta_sucesso).trim()) p.push('meta de sucesso do trial escrita');
    if (!reun.some((r) => r.tipo === 'ativacao' && ['agendada', 'realizada'].includes(r.status))) {
      p.push('reunião de ativação agendada');
    }
  }
  if (alvo >= ETAPA.proposta.i && !jaPassou('proposta')) {
    if (!props.some((x) => ['enviada', 'aceita'].includes(x.status))) p.push('proposta registrada (plano, valor e validade)');
  }
  if (nova === 'ganho') {
    if (!(Number(ctx.valor_mensal ?? lead.valor_mensal) > 0)) p.push('valor mensal do contrato');
  }
  return p;
}

/** Mudança que volta no funil (ou reabre ganho/perdido) exige justificativa. */
export function ehRetrocesso(de, para) {
  if (!de || de === para || para === 'perdido') return false;
  if (de === 'perdido' || de === 'ganho') return true;
  return ETAPA[para].i < ETAPA[de].i;
}

// ---------------------------------------------------------------------------
// Cálculos por lead
// ---------------------------------------------------------------------------
export const pontuacao = (l) => SINAIS.reduce((s, x) => s + ((l.sinais || {})[x.k] ? x.p : 0), 0);

export function situacaoPrazo(l, hoje = hojeBR()) {
  const e = ETAPA[l.etapa];
  if (!e || !e.sla || !l.etapa_desde) return null;
  const dias = diffDias(l.etapa_desde, hoje);
  const nivel = dias > e.sla ? 'crit' : dias >= e.sla - 1 ? 'warn' : 'ok';
  return { dias, sla: e.sla, nivel };
}

/** Próximo toque de cadência devido (ou null). l.toques_cadencia = {dia: data} */
export function toqueDevido(l, hoje = hojeBR()) {
  if (l.etapa !== 'cadencia' || !l.cadencia_inicio) return null;
  const feitos = l.toques_cadencia || {};
  for (const c of CADENCIA) {
    if (feitos[c.d]) continue;
    const previsto = addDiasUteis(l.cadencia_inicio, c.d - 1);
    if (previsto <= hoje) return { ...c, previsto, atrasado: previsto < hoje };
    return null;
  }
  return null;
}

/** Próximo marco de trial devido (ou null). l.toques_marco = {dia: data} */
export function marcoDevido(l, hoje = hojeBR()) {
  if (!['trial', 'proposta'].includes(l.etapa) || !l.trial_inicio) return null;
  const feitos = l.toques_marco || {};
  for (const m of MARCOS_TRIAL) {
    if (feitos[m.d]) continue;
    const previsto = addDias(l.trial_inicio, m.d);
    if (previsto <= hoje) return { ...m, previsto, atrasado: previsto < hoje };
    return null;
  }
  return null;
}

export function situacaoTrial(l, hoje = hojeBR()) {
  const dia = l.trial_inicio ? diffDias(l.trial_inicio, hoje) : 0;
  const pts = pontuacao(l);
  let nivel = 'ok'; let texto = 'No caminho';
  if (dia >= 3 && pts < 40) { nivel = 'crit'; texto = 'Em risco'; }
  else if (dia >= 3 && pts < 60) { nivel = 'warn'; texto = 'Atenção'; }
  else if (dia > 14) { nivel = 'crit'; texto = 'Prazo vencido'; }
  if (l.etapa === 'proposta') { texto = 'Proposta enviada'; if (nivel !== 'crit') nivel = 'neu'; }
  const feitos = l.toques_marco || {};
  const prox = MARCOS_TRIAL.find((m) => !feitos[m.d]) || null;
  return {
    dia, pontos: pts, nivel, texto,
    proximo_marco: prox ? { ...prox, previsto: addDias(l.trial_inicio || hoje, prox.d) } : null,
  };
}

// ---------------------------------------------------------------------------
// Metas
// ---------------------------------------------------------------------------
export function desdobrarMeta(m) {
  const t = (m.taxaTrialPago / 100) * (m.taxaDiagTrial / 100) * (m.taxaContatoDiag / 100);
  const contatos = t > 0 ? m.metaClientes / t : null;
  const fTrial = m.taxaTrialPago / 100;
  const fDiag = fTrial * (m.taxaDiagTrial / 100);
  return {
    contatos_mes: contatos != null ? Math.ceil(contatos) : null,
    contatos_dia: contatos != null ? Math.ceil(contatos / (m.diasUteis || 21)) : null,
    diagnosticos_mes: fDiag > 0 ? Math.ceil(m.metaClientes / fDiag) : null,
    trials_mes: fTrial > 0 ? Math.ceil(m.metaClientes / fTrial) : null,
    receita_nova: m.metaClientes * (Number(m.ticket) || 0),
  };
}

// ---------------------------------------------------------------------------
// Metas por pessoa
// ---------------------------------------------------------------------------
/** Metas individuais: porPessoa[id] = {novosDia, toquesDia, reunioesMes, pagosMes}. */
export function metaPessoa(metas, pessoaId) {
  const pp = (metas.porPessoa || {})[pessoaId] || {};
  return {
    novosDia: Number(pp.novosDia ?? (metas.novosPorPessoa || {})[pessoaId] ?? 0),
    toquesDia: Number(pp.toquesDia ?? 0),
    reunioesMes: Number(pp.reunioesMes ?? 0),
    pagosMes: Number(pp.pagosMes ?? 0),
  };
}

// ---------------------------------------------------------------------------
// Painel: Hoje + Trials + Supervisão + números (um cálculo só)
// ---------------------------------------------------------------------------
/**
 * @param leads          leads não arquivados (com toques_cadencia/toques_marco/atualizado_dia)
 * @param toquesHoje     toques vivos (não estornados) de hoje [{lead_id, pessoa_id, resultado}]
 * @param metas          metas do mês
 * @param pessoas        [{id, nome}] — quem aparece na supervisão
 * @param reunioes       reuniões de hoje em diante + agendadas no passado sem desfecho
 * @param propostas      propostas com status 'enviada'
 * @param checagensHoje  [{pessoa_id, janela, sinal, gestor_nome, observacao, criado_em}]
 * @param acoes          planos de ação abertos [{id, pessoa_id, acao, prazo}]
 */
export function montarPainel({
  leads, toquesHoje, metas, pessoas, hoje = hojeBR(),
  reunioes = [], propostas = [], checagensHoje = [], acoes = [], agora = new Date(),
}) {
  const mes = mesDe(hoje);
  const ativo = (l) => ETAPAS_ATIVAS.includes(l.etapa);
  const leadDe = new Map(leads.map((l) => [l.id, l]));
  const resumo = (l) => ({
    id: l.id, nome: l.nome, protocolo: l.protocolo, etapa: l.etapa,
    cidade: l.cidade, uf: l.uf, dono_id: l.dono_id, dono_nome: l.dono_nome,
  });

  // --- Hoje
  const toques = []; const marcos = []; const proximos = []; const parados = [];
  for (const l of leads) {
    if (l.bloqueado_nc) continue; // na lista de não contatar: some das filas
    const t = toqueDevido(l, hoje); if (t) toques.push({ lead: resumo(l), ...t });
    const m = marcoDevido(l, hoje); if (m) marcos.push({ lead: resumo(l), ...m, pontos: pontuacao(l) });
    if (ativo(l) && l.proxima_data && l.proxima_data <= hoje) {
      proximos.push({ lead: resumo(l), proximo_passo: l.proximo_passo, proxima_data: l.proxima_data, vencido: l.proxima_data < hoje });
    }
    const p = situacaoPrazo(l, hoje);
    if (ativo(l) && p && p.nivel === 'crit') parados.push({ lead: resumo(l), ...p });
  }
  const porPrevisto = (a, b) => (a.previsto < b.previsto ? -1 : a.previsto > b.previsto ? 1 : 0);
  toques.sort(porPrevisto); marcos.sort(porPrevisto);
  proximos.sort((a, b) => (a.proxima_data < b.proxima_data ? -1 : 1));
  parados.sort((a, b) => b.dias - a.dias);

  const dataDe = (ts) => hojeBR(new Date(ts));
  const comLead = (r) => ({ ...r, lead: leadDe.get(r.lead_id) ? resumo(leadDe.get(r.lead_id)) : { id: r.lead_id, nome: '(arquivado)' } });
  const reunioesHoje = reunioes.filter((r) => r.status === 'agendada' && dataDe(r.inicio) === hoje).map(comLead)
    .sort((a, b) => (a.inicio < b.inicio ? -1 : 1));
  const semDesfecho = reunioes.filter((r) => r.status === 'agendada' && new Date(r.inicio) < agora && dataDe(r.inicio) < hoje).map(comLead);
  const propostasVencendo = propostas
    .filter((x) => x.status === 'enviada' && x.validade <= addDias(hoje, 2) && leadDe.get(x.lead_id) && ativo(leadDe.get(x.lead_id)))
    .map((x) => ({ ...comLead(x), vencida: x.validade < hoje }));
  const aguardandoPagamento = leads
    .filter((l) => l.etapa === 'ganho' && !l.pago_em)
    .map((l) => ({ lead: resumo(l), assinado_em: l.marcos?.ganho, dias: l.marcos?.ganho ? diffDias(l.marcos.ganho, hoje) : null, valor_mensal: l.valor_mensal }))
    .sort((a, b) => (b.dias ?? 0) - (a.dias ?? 0));

  // --- Números do funil
  const alcancou = (k) => leads.filter((l) => l.marcos && l.marcos[k]).length;
  const rCad = alcancou('cadencia'); const rDiag = alcancou('diagnostico');
  const rTrial = alcancou('trial'); const rGanho = alcancou('ganho');
  const rPago = leads.filter((l) => l.pago_em).length;
  const assinadosMes = leads.filter((l) => l.etapa === 'ganho' && String(l.marcos?.ganho || '').startsWith(mes));
  const pagosMes = leads.filter((l) => String(l.pago_em || '').startsWith(mes));
  const perdidos = leads.filter((l) => l.etapa === 'perdido');
  const motivos = {};
  perdidos.forEach((l) => { const k = l.motivo_perda || 'Sem motivo'; motivos[k] = (motivos[k] || 0) + 1; });
  const taxa = (a, b) => (b ? Math.round((a / b) * 1000) / 10 : null);
  const conexoesHoje = toquesHoje.filter((t) => RESULTADOS_CONECTAM.includes(t.resultado)).length;

  const numeros = {
    novos_hoje: leads.filter((l) => l.marcos?.cadencia === hoje).length,
    toques_hoje: toquesHoje.length,
    conexoes_hoje: conexoesHoje,
    trials_ativos: leads.filter((l) => l.etapa === 'trial').length,
    propostas: leads.filter((l) => l.etapa === 'proposta').length,
    // Meta conta PAGOS. Assinado sem pagamento aparece separado.
    ganhos_mes: pagosMes.length,
    pagos_mes: pagosMes.length,
    assinados_mes: assinadosMes.length,
    aguardando_pagamento: aguardandoPagamento.length,
    receita_nova_mes: pagosMes.reduce((s, l) => s + (Number(l.pago_valor ?? l.valor_mensal) || 0), 0),
    perdidos: perdidos.length,
    motivos_perda: Object.entries(motivos).sort((a, b) => b[1] - a[1]).map(([motivo, n]) => ({ motivo, n })),
    por_etapa: Object.fromEntries(ETAPAS.map((e) => [e.k, leads.filter((l) => l.etapa === e.k).length])),
    taxas: {
      contato_diag: { de: rCad, para: rDiag, real: taxa(rDiag, rCad), meta: metas.taxaContatoDiag },
      diag_trial:   { de: rDiag, para: rTrial, real: taxa(rTrial, rDiag), meta: metas.taxaDiagTrial },
      trial_pago:   { de: rTrial, para: rGanho, real: taxa(rGanho, rTrial), meta: metas.taxaTrialPago },
      assinado_pago: { de: rGanho, para: rPago, real: taxa(rPago, rGanho), meta: 100 },
    },
  };

  // --- Trials
  const trials = leads
    .filter((l) => ['trial', 'proposta'].includes(l.etapa))
    .map((l) => ({ lead: resumo(l), trial_inicio: l.trial_inicio, ...situacaoTrial(l, hoje) }))
    .sort((a, b) => ((a.trial_inicio || '') < (b.trial_inicio || '') ? -1 : 1));

  // --- Supervisão (semáforo por pessoa)
  const supervisao = pessoas.map((p) => {
    const meus = leads.filter((l) => l.dono_id === p.id);
    const ativos = meus.filter(ativo);
    const meusToques = toquesHoje.filter((t) => t.pessoa_id === p.id);
    const feitos = meusToques.length;
    const conexoes = meusToques.filter((t) => RESULTADOS_CONECTAM.includes(t.resultado)).length;
    const pendentes = toques.filter((x) => x.lead.dono_id === p.id).length
      + marcos.filter((x) => x.lead.dono_id === p.id).length;
    const novos = meus.filter((l) => l.marcos?.cadencia === hoje).length;
    const mp = metaPessoa(metas, p.id);
    const total = feitos + pendentes;
    const parcelas = [total ? (feitos / total) * 100 : 100];
    if (mp.novosDia) parcelas.push((novos / mp.novosDia) * 100);
    if (mp.toquesDia) parcelas.push((feitos / mp.toquesDia) * 100);
    const indice = Math.round(Math.min(...parcelas));
    const sinal = indice >= 100 ? 'ok' : indice >= 70 ? 'warn' : 'crit';

    const alertas = [];
    const add = (l, motivo) => alertas.push({ lead: resumo(l), motivo });
    ativos.forEach((l) => {
      if (l.etapa === 'trial' && l.trial_inicio && diffDias(l.trial_inicio, hoje) >= 3 && pontuacao(l) < 40) add(l, 'trial abaixo de 40 pontos');
    });
    ativos.forEach((l) => { const s = situacaoPrazo(l, hoje); if (s && s.nivel === 'crit') add(l, 'fora do prazo da etapa'); });
    ativos.forEach((l) => {
      if (['diagnostico', 'qualificado', 'trial', 'proposta'].includes(l.etapa) && (!l.proxima_data || l.proxima_data < hoje)) add(l, 'sem próximo passo datado');
    });
    semDesfecho.filter((r) => (r.responsavel_id || r.lead.dono_id) === p.id).forEach((r) => {
      alertas.push({ lead: r.lead, motivo: `reunião de ${dataBr(dataDe(r.inicio))} sem desfecho registrado` });
    });
    propostasVencendo.filter((x) => x.lead.dono_id === p.id).forEach((x) => {
      alertas.push({ lead: x.lead, motivo: x.vencida ? 'proposta vencida sem resposta' : 'proposta vence em até 2 dias' });
    });
    aguardandoPagamento.filter((x) => x.lead.dono_id === p.id && (x.dias ?? 0) > 7).forEach((x) => {
      alertas.push({ lead: x.lead, motivo: `assinado há ${x.dias} dias e ainda sem pagamento` });
    });

    const minhasAcoes = acoes.filter((a) => a.pessoa_id === p.id);
    return {
      pessoa: p, feitos, conexoes, pendentes, novos,
      meta_novos: mp.novosDia, meta_toques: mp.toquesDia,
      atualizados_hoje: meus.filter((l) => l.atualizado_dia === hoje).length,
      indice, sinal,
      rotulo: sinal === 'ok' ? 'Em dia' : sinal === 'warn' ? 'Atenção' : 'Conversar hoje',
      ativos: ativos.length,
      alertas,
      checagens: checagensHoje.filter((c) => c.pessoa_id === p.id),
      acoes: minhasAcoes.map((a) => ({ ...a, vencida: a.prazo < hoje })),
    };
  });

  return {
    hoje,
    metas,
    plano: desdobrarMeta(metas),
    numeros,
    hoje_listas: { toques, marcos, proximos, parados, reunioes: reunioesHoje, sem_desfecho: semDesfecho, propostas_vencendo: propostasVencendo, aguardando_pagamento: aguardandoPagamento },
    trials,
    supervisao,
    sem_dono: leads.filter((l) => ativo(l) && !l.dono_id).length,
  };
}

function dataBr(s) { const [, m, d] = String(s).split('-'); return `${d}/${m}`; }
