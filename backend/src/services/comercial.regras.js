/**
 * Módulo Comercial — regras da metodologia (funções puras, sem banco).
 *
 * Etapas com prazo (SLA), cadência de 12 dias úteis, reunião de
 * apresentação (diagnóstico + demonstração), proposta e decisão.
 * SEM TRIAL (decisão da empresa, out/2026): a prova é a demonstração na
 * reunião e a implantação assistida depois do Ganho, acompanhada por marcos
 * (onboarding, treinamento, ativação, pós-venda) e pontuação de uso.
 * Desdobramento da meta de trás para frente e supervisão diária por pessoa.
 *
 * Ficam aqui (e não no controller) porque o relatório semanal automático
 * (entrega 3) usa exatamente os mesmos cálculos.
 */

// Nomes iguais às colunas do quadro "Atividade Comercial" da equipe (facilita
// a migração). Chaves internas mantidas por compatibilidade com o banco.
export const ETAPAS = [
  { k: 'prospect',     n: 'Em prospecção',             sla: 2 },
  { k: 'cadencia',     n: 'Em contatos',               sla: 12 },
  { k: 'diagnostico',  n: 'Reunião de apresentação',   sla: 5 },
  { k: 'proposta',     n: 'Aguardando retorno',        sla: 7 },
  { k: 'corregedoria', n: 'Aguardando a Corregedoria', sla: 30 },
  { k: 'ganho',       n: 'Ganho',                sla: 0 },
  { k: 'perdido',     n: 'Perdido',              sla: 0 },
];
export const ETAPA = Object.fromEntries(ETAPAS.map((e, i) => [e.k, { ...e, i }]));
export const ETAPAS_CHAVES = ETAPAS.map((e) => e.k);
export const ETAPAS_ATIVAS = ['prospect', 'cadencia', 'diagnostico', 'proposta', 'corregedoria'];
// Etapas em negociação: não podem ficar sem próximo passo datado.
export const ETAPAS_NEGOCIACAO = ['diagnostico', 'proposta', 'corregedoria'];
// Caminho comum de todo cartório (Corregedoria é desvio do interino):
// pular etapas marca as anteriores DESTE caminho como alcançadas.
const CAMINHO = ['prospect', 'cadencia', 'diagnostico', 'proposta'];

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

// Sprint 42I — canais das ações de marketing. `origem` é a origem que o
// cartório que chega por essa ação recebe no funil (sugestão no cadastro).
export const CANAIS_MKT = {
  linkedin:   { nome: 'LinkedIn',                 origem: 'linkedin' },
  instagram:  { nome: 'Instagram',                origem: 'instagram' },
  facebook:   { nome: 'Facebook',                 origem: 'outro' },
  site:       { nome: 'Site / blog',              origem: 'site' },
  email:      { nome: 'E-mail',                   origem: 'email_frio' },
  whatsapp:   { nome: 'Lista de WhatsApp',        origem: 'inbound' },
  evento:     { nome: 'Congresso / evento',       origem: 'evento' },
  webinar:    { nome: 'Webinar',                  origem: 'webinar' },
  indicacao:  { nome: 'Indicação',                origem: 'indicacao' },
  casos:      { nome: 'Casos de clientes',        origem: 'indicacao' },
  parcerias:  { nome: 'Associações e parcerias',  origem: 'evento' },
  anuncios:   { nome: 'Anúncios pagos',           origem: 'site' },
  interno:    { nome: 'Interno / preparação',     origem: null },
  outro:      { nome: 'Outro',                    origem: 'outro' },
};
export const CANAIS_MKT_CHAVES = Object.keys(CANAIS_MKT);
export const STATUS_MKT = {
  planejada: 'Planejada', em_andamento: 'Em andamento', feita: 'Feita', adiada: 'Adiada', cancelada: 'Cancelada',
};

export const MOTIVOS_PERDA = [
  'Preço', 'Sem dor', 'Sem decisor', 'Escolheu concorrente',
  'Sem tempo para implantar', 'Problema técnico', 'Sumiu',
  'Fora do funil (sem interesse)', 'Desistência (usou e desistiu)', 'Outro',
];

// Sprint 42J — o 1º contato é o e-mail de apresentação (Ayio, a empresa do
// Seu Cartório); a ligação do dia 2 já pode citar o e-mail.
export const CADENCIA = [
  { d: 1,  canal: 'E-mail',             acao: 'E-mail de apresentação: quem somos (Ayio, a empresa do Seu Cartório) e o caso de um cartório parecido' },
  { d: 2,  canal: 'Ligação + WhatsApp', acao: 'Ligar para o titular ou responsável citando o e-mail; se não atender, mensagem curta com a dor' },
  { d: 4,  canal: 'Ligação',            acao: 'Pedir 20 minutos para diagnóstico do atendimento' },
  { d: 6,  canal: 'WhatsApp',           acao: 'Vídeo de 60 segundos do atendimento funcionando' },
  { d: 8,  canal: 'Ligação',            acao: 'Nova tentativa em outro horário' },
  { d: 10, canal: 'WhatsApp',           acao: 'Depoimento de um titular cliente' },
  { d: 11, canal: 'E-mail',             acao: 'Convite para o webinar do mês' },
  { d: 12, canal: 'WhatsApp',           acao: 'Encerramento: posso voltar a falar em 3 meses?' },
];

// Sprint 42G — Insistência com método.
// Roteiro de retorno da proposta (dias corridos desde o envio). Cada contato
// leva algo novo; o último é o encerramento educado — a mensagem que mais
// responde. Só depois dele dá para dizer que o cartório "sumiu".
export const RETORNO = [
  { d: 2, canal: 'WhatsApp',           acao: 'Caso de um cartório parecido e "ficou alguma dúvida sobre a proposta?"' },
  { d: 4, canal: 'Ligação',            acao: 'Ligar: tirar dúvidas, confirmar quem decide e a data combinada' },
  { d: 6, canal: 'Ligação ao titular', acao: 'Falar com o titular (não só com quem recebeu): resumo do valor e pedido de decisão' },
  { d: 7, canal: 'WhatsApp',           acao: 'Encerramento: "Vou entender que agora não é o momento e encerro por aqui. Se mudar, é só me chamar."' },
];
// Perdido por estes motivos volta a ser contatado em 90 dias
export const MOTIVOS_VOLTAM = ['Sumiu', 'Sem tempo para implantar'];
export const DIAS_PARA_VOLTAR = 90;
// Tentativas mínimas antes de "Sumiu" em reunião / corregedoria
export const TENTATIVAS_MINIMAS = 3;

// Implantação assistida depois do Ganho (dias corridos desde a assinatura).
// Mesmos nomes das colunas do quadro depois da venda.
export const MARCOS_IMPLANTACAO = [
  { d: 0,  n: 'Enviar onboarding',                 acao: 'Enviar o onboarding e marcar a reunião de treinamento em até 48 horas' },
  { d: 2,  n: 'Reunião de treinamento e ativação', acao: 'Treinar os colaboradores e ativar: WhatsApp conectado, atendentes logados' },
  { d: 7,  n: 'Em desenvolvimento: bot no ar',     acao: 'Bot desenvolvido e funcionando; conferir os sinais de uso (abaixo de 40 pontos, agir hoje)' },
  { d: 15, n: 'Checagem de uso',                   acao: 'Ligar para o titular: o atendimento melhorou? Algo travou?' },
  { d: 30, n: 'Pós-venda',                         acao: 'Acompanhamento: mostrar o resultado do mês; pedir depoimento e indicação' },
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
  // Chaves antigas mantidas (metas já salvas): taxaDiagTrial = reunião → proposta;
  // taxaTrialPago = proposta → cliente pago.
  taxaDiagTrial: 60,
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

// Chaves mantidas por compatibilidade com o banco; os nomes seguem o processo sem trial.
export const TIPOS_REUNIAO = { diagnostico: 'Apresentação (diagnóstico + demonstração)', ativacao: 'Treinamento / ativação', resultado: 'Pós-venda', outra: 'Outra' };
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
    CAMINHO.filter((k) => ETAPA[k].i <= idx).forEach((k) => { if (!marcos[k]) marcos[k] = hoje; });
    if (nova === 'corregedoria' && !marcos.corregedoria) marcos.corregedoria = hoje;
    if (nova === 'ganho') marcos.ganho = marcos.ganho || hoje;
  }
  if (nova === 'cadencia' && !lead.cadencia_inicio) mud.cadencia_inicio = hoje;
  // Assinou: começa a implantação assistida.
  if (nova === 'ganho' && !lead.implantacao_inicio) mud.implantacao_inicio = hoje;
  return mud;
}

// ---------------------------------------------------------------------------
// Portões de etapa (critérios de saída)
// ---------------------------------------------------------------------------
/**
 * O que falta para o lead entrar na etapa `nova`. Os portões são
 * cumulativos: Aguardando retorno exige a reunião de apresentação feita, o
 * diagnóstico e a proposta; Corregedoria e Ganho exigem o mesmo.
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

  if (alvo >= ETAPA.proposta.i && !jaPassou('proposta')) {
    if (!reun.some((r) => r.tipo === 'diagnostico' && r.status === 'realizada')) {
      p.push('reunião de apresentação marcada como realizada');
    }
    DIAGNOSTICO_CAMPOS.filter((c) => c.obrigatorio).forEach((c) => {
      if (diag[c.k] == null || String(diag[c.k]).trim() === '') p.push('diagnóstico: ' + c.n.toLowerCase());
    });
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

/**
 * Próximo contato do roteiro de retorno da proposta (ou null).
 * l.proposta_enviada_em = envio da proposta vigente;
 * l.toques_pos_proposta = contatos registrados depois do envio.
 */
export function retornoDevido(l, hoje = hojeBR()) {
  if (l.etapa !== 'proposta' || !l.proposta_enviada_em) return null;
  const feitos = Number(l.toques_pos_proposta || 0);
  if (feitos >= RETORNO.length) return null;
  const passo = RETORNO[feitos];
  const previsto = addDias(l.proposta_enviada_em, passo.d);
  if (previsto > hoje) return null;
  return { ...passo, n: feitos + 1, de: RETORNO.length, previsto, atrasado: previsto < hoje };
}

/**
 * Portão de perda por "Sumiu": só depois de insistir com método.
 *   - Em prospecção / Em contatos: a cadência inteira (o último é o encerramento)
 *   - Aguardando retorno: o roteiro de retorno inteiro
 *   - Reunião / Corregedoria: pelo menos 3 tentativas nesta etapa
 * Os outros motivos (preço, sem interesse, concorrente...) são resposta do
 * cartório: não têm portão.
 */
export function pendenciasPerda(l, motivo) {
  if (motivo !== 'Sumiu') return [];
  if (['prospect', 'cadencia'].includes(l.etapa)) {
    const feitos = CADENCIA.filter((c) => (l.toques_cadencia || {})[c.d]).length;
    return feitos < CADENCIA.length
      ? [`cadência completa antes de "Sumiu" (feitos ${feitos} de ${CADENCIA.length} contatos; o último é a mensagem de encerramento)`]
      : [];
  }
  if (l.etapa === 'proposta') {
    const feitos = Math.min(Number(l.toques_pos_proposta || 0), RETORNO.length);
    return feitos < RETORNO.length
      ? [`roteiro de retorno da proposta completo antes de "Sumiu" (feitos ${feitos} de ${RETORNO.length}; o último é a mensagem de encerramento)`]
      : [];
  }
  const n = Number(l.toques_na_etapa || 0);
  return n < TENTATIVAS_MINIMAS
    ? [`pelo menos ${TENTATIVAS_MINIMAS} tentativas de contato nesta etapa antes de "Sumiu" (feitas ${n})`]
    : [];
}

/** Implantação em andamento: ganho, com início registrado e pós-venda ainda não feito. */
export function emImplantacao(l) {
  if (l.etapa !== 'ganho' || !l.implantacao_inicio) return false;
  const ultimo = MARCOS_IMPLANTACAO[MARCOS_IMPLANTACAO.length - 1].d;
  return !(l.toques_marco || {})[ultimo];
}

/** Próximo marco de implantação devido (ou null). l.toques_marco = {dia: data} */
export function marcoDevido(l, hoje = hojeBR()) {
  if (!emImplantacao(l)) return null;
  const feitos = l.toques_marco || {};
  for (const m of MARCOS_IMPLANTACAO) {
    if (feitos[m.d]) continue;
    const previsto = addDias(l.implantacao_inicio, m.d);
    if (previsto <= hoje) return { ...m, previsto, atrasado: previsto < hoje };
    return null;
  }
  return null;
}

export function situacaoImplantacao(l, hoje = hojeBR()) {
  const dia = l.implantacao_inicio ? diffDias(l.implantacao_inicio, hoje) : 0;
  const pts = pontuacao(l);
  let nivel = 'ok'; let texto = 'No caminho';
  if (dia >= 7 && pts < 40) { nivel = 'crit'; texto = 'Uso baixo'; }
  else if (dia >= 7 && pts < 60) { nivel = 'warn'; texto = 'Atenção'; }
  if (!l.pago_em && dia > 7) { nivel = nivel === 'ok' ? 'warn' : nivel; texto = texto === 'No caminho' ? 'Sem pagamento' : texto; }
  const feitos = l.toques_marco || {};
  const prox = MARCOS_IMPLANTACAO.find((m) => !feitos[m.d]) || null;
  return {
    dia, pontos: pts, nivel, texto,
    proximo_marco: prox ? { ...prox, previsto: addDias(l.implantacao_inicio || hoje, prox.d), atrasado: addDias(l.implantacao_inicio || hoje, prox.d) < hoje } : null,
  };
}

// ---------------------------------------------------------------------------
// Metas
// ---------------------------------------------------------------------------
export function desdobrarMeta(m) {
  // contatos → (taxaContatoDiag) reuniões → (taxaDiagTrial) propostas → (taxaTrialPago) pagos
  const t = (m.taxaTrialPago / 100) * (m.taxaDiagTrial / 100) * (m.taxaContatoDiag / 100);
  const contatos = t > 0 ? m.metaClientes / t : null;
  const fProposta = m.taxaTrialPago / 100;
  const fReuniao = fProposta * (m.taxaDiagTrial / 100);
  return {
    contatos_mes: contatos != null ? Math.ceil(contatos) : null,
    contatos_dia: contatos != null ? Math.ceil(contatos / (m.diasUteis || 21)) : null,
    diagnosticos_mes: fReuniao > 0 ? Math.ceil(m.metaClientes / fReuniao) : null,
    propostas_mes: fProposta > 0 ? Math.ceil(m.metaClientes / fProposta) : null,
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
// Painel: Hoje + Implantação + Supervisão + números (um cálculo só)
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
  totais = null, insistencia = {},
}) {
  const mes = mesDe(hoje);
  const ativo = (l) => ETAPAS_ATIVAS.includes(l.etapa);
  // Prospect sem dono é FILA (lista importada), não atraso: o prazo da
  // etapa só começa a contar quando alguém pega o lead.
  const naFila = (l) => l.etapa === 'prospect' && !l.dono_id;
  const leadDe = new Map(leads.map((l) => [l.id, l]));
  const resumo = (l) => ({
    id: l.id, nome: l.nome, protocolo: l.protocolo, etapa: l.etapa,
    cidade: l.cidade, uf: l.uf, dono_id: l.dono_id, dono_nome: l.dono_nome,
  });

  // --- Hoje
  const toques = []; const marcos = []; const proximos = []; const parados = [];
  const retornos = []; const voltam = [];
  for (const l of leads) {
    if (l.bloqueado_nc) continue; // na lista de não contatar: some das filas
    const t = toqueDevido(l, hoje); if (t) toques.push({ lead: resumo(l), ...t });
    const r = retornoDevido(l, hoje); if (r) retornos.push({ lead: resumo(l), ...r });
    // Perdido por "Sumiu"/"Sem tempo" volta a ser contatado depois de 90 dias
    if (l.etapa === 'perdido' && MOTIVOS_VOLTAM.includes(l.motivo_perda) && l.proxima_data && l.proxima_data <= hoje) {
      voltam.push({ lead: resumo(l), motivo: l.motivo_perda, perdido_em: l.marcos?.perdido || null });
    }
    const m = marcoDevido(l, hoje); if (m) marcos.push({ lead: resumo(l), ...m, pontos: pontuacao(l) });
    if (ativo(l) && l.proxima_data && l.proxima_data <= hoje) {
      proximos.push({ lead: resumo(l), proximo_passo: l.proximo_passo, proxima_data: l.proxima_data, vencido: l.proxima_data < hoje });
    }
    const p = situacaoPrazo(l, hoje);
    if (ativo(l) && !naFila(l) && p && p.nivel === 'crit') parados.push({ lead: resumo(l), ...p });
  }
  const porPrevisto = (a, b) => (a.previsto < b.previsto ? -1 : a.previsto > b.previsto ? 1 : 0);
  toques.sort(porPrevisto); marcos.sort(porPrevisto); retornos.sort(porPrevisto);
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
  // `totais` (agregados do banco) quando o painel não carrega todos os leads
  const alcancou = (k) => (totais?.alcancou ? totais.alcancou[k] || 0 : leads.filter((l) => l.marcos && l.marcos[k]).length);
  const rCad = alcancou('cadencia'); const rDiag = alcancou('diagnostico');
  const rProposta = alcancou('proposta'); const rGanho = alcancou('ganho');
  const rPago = totais ? totais.pagos : leads.filter((l) => l.pago_em).length;
  const assinadosMes = leads.filter((l) => l.etapa === 'ganho' && String(l.marcos?.ganho || '').startsWith(mes));
  const pagosMes = leads.filter((l) => String(l.pago_em || '').startsWith(mes));
  const perdidos = leads.filter((l) => l.etapa === 'perdido');
  const motivos = {};
  if (totais?.motivos) Object.assign(motivos, totais.motivos);
  else perdidos.forEach((l) => { const k = l.motivo_perda || 'Sem motivo'; motivos[k] = (motivos[k] || 0) + 1; });
  const taxa = (a, b) => (b ? Math.round((a / b) * 1000) / 10 : null);
  const conexoesHoje = toquesHoje.filter((t) => RESULTADOS_CONECTAM.includes(t.resultado)).length;

  const numeros = {
    novos_hoje: leads.filter((l) => l.marcos?.cadencia === hoje).length,
    toques_hoje: toquesHoje.length,
    conexoes_hoje: conexoesHoje,
    implantacoes: leads.filter(emImplantacao).length,
    reunioes_agendadas: leads.filter((l) => l.etapa === 'diagnostico').length,
    propostas: leads.filter((l) => l.etapa === 'proposta').length,
    // Meta conta PAGOS. Assinado sem pagamento aparece separado.
    ganhos_mes: pagosMes.length,
    pagos_mes: pagosMes.length,
    assinados_mes: assinadosMes.length,
    aguardando_pagamento: aguardandoPagamento.length,
    receita_nova_mes: pagosMes.reduce((s, l) => s + (Number(l.pago_valor ?? l.valor_mensal) || 0), 0),
    perdidos: totais ? totais.perdidos : perdidos.length,
    motivos_perda: Object.entries(motivos).sort((a, b) => b[1] - a[1]).map(([motivo, n]) => ({ motivo, n })),
    por_etapa: Object.fromEntries(ETAPAS.map((e) => [e.k, totais?.por_etapa ? totais.por_etapa[e.k] || 0 : leads.filter((l) => l.etapa === e.k).length])),
    taxas: {
      contato_diag: { de: rCad, para: rDiag, real: taxa(rDiag, rCad), meta: metas.taxaContatoDiag },
      diag_proposta: { de: rDiag, para: rProposta, real: taxa(rProposta, rDiag), meta: metas.taxaDiagTrial },
      proposta_ganho: { de: rProposta, para: rGanho, real: taxa(rGanho, rProposta), meta: metas.taxaTrialPago },
      assinado_pago: { de: rGanho, para: rPago, real: taxa(rPago, rGanho), meta: 100 },
    },
  };

  // --- Implantação (clientes assinados até o pós-venda)
  const implantacoes = leads
    .filter(emImplantacao)
    .map((l) => ({ lead: resumo(l), implantacao_inicio: l.implantacao_inicio, pago_em: l.pago_em, ...situacaoImplantacao(l, hoje) }))
    .sort((a, b) => ((a.implantacao_inicio || '') < (b.implantacao_inicio || '') ? -1 : 1));

  // --- Supervisão (semáforo por pessoa)
  const supervisao = pessoas.map((p) => {
    const meus = leads.filter((l) => l.dono_id === p.id);
    const ativos = meus.filter(ativo);
    const meusToques = toquesHoje.filter((t) => t.pessoa_id === p.id);
    const feitos = meusToques.length;
    const conexoes = meusToques.filter((t) => RESULTADOS_CONECTAM.includes(t.resultado)).length;
    const pendentes = toques.filter((x) => x.lead.dono_id === p.id).length
      + marcos.filter((x) => x.lead.dono_id === p.id).length
      + retornos.filter((x) => x.lead.dono_id === p.id).length;
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
      // (alertas de implantação ficam abaixo: lead ganho não está em `ativos`)
    });
    ativos.forEach((l) => { const s = situacaoPrazo(l, hoje); if (s && s.nivel === 'crit') add(l, 'fora do prazo da etapa'); });
    ativos.forEach((l) => {
      if (ETAPAS_NEGOCIACAO.includes(l.etapa) && (!l.proxima_data || l.proxima_data < hoje)) add(l, 'sem próximo passo datado');
    });
    meus.filter(emImplantacao).forEach((l) => {
      if (diffDias(l.implantacao_inicio, hoje) >= 7 && pontuacao(l) < 40) add(l, 'implantação com uso baixo (menos de 40 pontos)');
    });
    semDesfecho.filter((r) => (r.responsavel_id || r.lead.dono_id) === p.id).forEach((r) => {
      alertas.push({ lead: r.lead, motivo: `reunião de ${dataBr(dataDe(r.inicio))} sem desfecho registrado` });
    });
    propostasVencendo.filter((x) => x.lead.dono_id === p.id).forEach((x) => {
      alertas.push({ lead: x.lead, motivo: x.vencida ? 'proposta vencida sem resposta' : 'proposta vence em até 2 dias' });
    });
    retornos.filter((x) => x.lead.dono_id === p.id && x.atrasado).forEach((x) => {
      alertas.push({ lead: x.lead, motivo: `proposta sem o retorno ${x.n}/${x.de} (${x.canal}) previsto para ${dataBr(x.previsto)}` });
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
      // Insistência: perdidos do mês e média de contatos antes de perder
      insistencia: insistencia[p.id] || null,
      acoes: minhasAcoes.map((a) => ({ ...a, vencida: a.prazo < hoje })),
    };
  });

  return {
    hoje,
    metas,
    plano: desdobrarMeta(metas),
    numeros,
    hoje_listas: { toques, marcos, retornos, voltam, proximos, parados, reunioes: reunioesHoje, sem_desfecho: semDesfecho, propostas_vencendo: propostasVencendo, aguardando_pagamento: aguardandoPagamento },
    implantacoes,
    supervisao,
    sem_dono: totais ? totais.sem_dono : leads.filter((l) => ativo(l) && !l.dono_id && !naFila(l)).length,
    fila: totais ? totais.fila : leads.filter(naFila).length,
  };
}

function dataBr(s) { const [, m, d] = String(s).split('-'); return `${d}/${m}`; }
