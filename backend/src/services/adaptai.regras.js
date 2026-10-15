/**
 * Sprint 43 — Regras da frente AdaptAI (venda B2B para escolas de Belém, foco em TEA).
 *
 * Fonte: "AdaptAI — Método de vendas (diretoria)" e "Plano comercial B2B para
 * escolas de Belém" (out/2026). Tudo aqui é puro (sem banco), para testar.
 */
import { hojeBR, addDias, diffDias } from './comercial.regras.js';

export { hojeBR, addDias, diffDias };

// ---------------------------------------------------------------------------
// Tipos de conta e trilhas (cada trilha tem o seu funil)
// ---------------------------------------------------------------------------
export const TIPOS = [
  { k: 'particular_grande', n: 'Particular grande / rede', trilha: 'escola', ciclo: '30 a 90 dias', decide: 'Direção e mantenedor; coordenação e AEE influenciam', argumento: 'Diferencial competitivo, retenção de famílias, padronização entre professores' },
  { k: 'particular_pequena', n: 'Particular pequena / infantil', trilha: 'escola', ciclo: '15 a 45 dias', decide: 'Diretor(a) ou proprietário(a)', argumento: 'Economia de tempo e demonstração rápida' },
  { k: 'filantropica', n: 'Filantrópica / comunitária', trilha: 'escola', ciclo: '30 a 60 dias', decide: 'Direção e coordenação', argumento: 'Impacto social com proposta enxuta' },
  { k: 'publica_municipal', n: 'Escola pública municipal', trilha: 'escola', ciclo: 'segue a rede (SEMEC)', decide: 'Gestão escolar, com a coordenação de Educação Especial', argumento: 'Apoio ao professor e ao AEE, equidade' },
  { k: 'publica_estadual', n: 'Escola pública estadual', trilha: 'escola', ciclo: 'segue a rede (SEDUC)', decide: 'Gestão escolar, com a coordenação de Educação Especial', argumento: 'Apoio ao professor e ao AEE, equidade' },
  { k: 'rede_publica', n: 'Rede pública (SEMEC / SEDUC / CAEE)', trilha: 'rede', ciclo: '6 a 18 meses', decide: 'Coordenação de Educação Especial e gabinete', argumento: 'Piloto antes da escala; projeto pedagógico, não compra de software' },
  { k: 'canal_indicador', n: 'Canal indicador (clínica, terapeuta, associação)', trilha: 'parceiro', ciclo: 'contínuo', decide: 'Responsável técnico ou presidente da associação', argumento: 'Parceria: oficina para famílias e profissionais; eles indicam escolas' },
];
export const TIPO = Object.fromEntries(TIPOS.map((t) => [t.k, t]));
export const trilhaDoTipo = (tipo) => TIPO[tipo]?.trilha || 'escola';

// ---------------------------------------------------------------------------
// Funis
// ---------------------------------------------------------------------------
export const ETAPAS = {
  escola: [
    { k: 'lista', n: 'Lista', sla: 7, criterio: 'Escola com dados validados e pontuada', acao: 'Primeiro contato (D1 da cadência)' },
    { k: 'contato', n: 'Contato feito', sla: 3, criterio: 'Falou com alguém da escola', acao: 'Identificar decisor e canal direto' },
    { k: 'decisor', n: 'Decisor alcançado', sla: 7, criterio: 'Falou com direção ou coordenação', acao: 'Agendar diagnóstico ou oficina' },
    { k: 'qualificada', n: 'Qualificada', sla: 7, criterio: 'Dor real + decisor + prazo + orçamento', acao: 'Marcar demo ou oficina' },
    { k: 'demo', n: 'Demo / oficina feita', sla: 3, criterio: 'Demonstração com atividade real da escola', acao: 'Propor piloto ou proposta' },
    { k: 'proposta', n: 'Proposta / piloto', sla: 30, criterio: 'Proposta enviada ou piloto iniciado', acao: 'Acompanhamento semanal com data' },
    { k: 'negociacao', n: 'Negociação', sla: 30, criterio: 'Pedido de ajustes ou aprovação interna', acao: 'Resolver objeções; contrato' },
  ],
  rede: [
    { k: 'mapeamento', n: 'Mapeamento', sla: 30, criterio: 'Rede identificada', acao: 'Descobrir quem decide e como a rede contrata' },
    { k: 'apresentacao', n: 'Apresentação institucional', sla: 45, criterio: 'Quem decide identificado', acao: 'Reunião técnica com material pedagógico e protocolo de privacidade' },
    { k: 'piloto_rede', n: 'Piloto em escolas / CAEE', sla: 60, criterio: 'Acordo ou termo de cooperação', acao: 'Medir uso e tempo economizado' },
    { k: 'parecer', n: 'Parecer técnico', sla: 30, criterio: 'Piloto encerrado', acao: 'Relatório para a coordenação e o gabinete' },
    { k: 'contratacao', n: 'Processo de contratação', sla: 180, criterio: 'Parecer favorável', acao: 'Modalidade com o jurídico (Lei 14.133/2021); calendário orçamentário' },
  ],
  parceiro: [
    { k: 'lista', n: 'Lista', sla: 14, criterio: 'Clínica, terapeuta ou associação identificada', acao: 'Primeiro contato' },
    { k: 'contato', n: 'Contato feito', sla: 14, criterio: 'Falou com o responsável', acao: 'Oferecer oficina para famílias e profissionais' },
    { k: 'oficina_parceiro', n: 'Oficina feita', sla: 30, criterio: 'Oficina realizada', acao: 'Combinar indicações' },
  ],
};
export const FINAIS = [
  { k: 'ganho', n: 'Ganho' },
  { k: 'parceiro_ativo', n: 'Parceiro ativo' },
  { k: 'perdido', n: 'Perdido' },
  { k: 'nutricao', n: 'Nutrição' },
];
const TODAS = [...ETAPAS.escola, ...ETAPAS.rede, ...ETAPAS.parceiro, ...FINAIS];
export const NOME_ETAPA = Object.fromEntries(TODAS.map((e) => [e.k, e.n]));
export const ETAPAS_CHAVES = [...new Set(TODAS.map((e) => e.k))];
export const FINAIS_TRILHA = {
  escola: ['ganho', 'perdido', 'nutricao'],
  rede: ['ganho', 'perdido', 'nutricao'],
  parceiro: ['parceiro_ativo', 'perdido', 'nutricao'],
};
export const ETAPA_INICIAL = { escola: 'lista', rede: 'mapeamento', parceiro: 'lista' };
export const ehAberta = (etapa) => !['ganho', 'parceiro_ativo', 'perdido', 'nutricao'].includes(etapa);

export function etapasDaTrilha(trilha) {
  return [...(ETAPAS[trilha] || ETAPAS.escola).map((e) => e.k), ...(FINAIS_TRILHA[trilha] || FINAIS_TRILHA.escola)];
}
export function etapaInfo(trilha, etapa) {
  return (ETAPAS[trilha] || ETAPAS.escola).find((e) => e.k === etapa) || null;
}
/** Posição da etapa no funil (finais = depois de todas). */
function ordem(trilha, etapa) {
  const lista = (ETAPAS[trilha] || ETAPAS.escola).map((e) => e.k);
  const i = lista.indexOf(etapa);
  return i >= 0 ? i : lista.length;
}
export function ehRetrocesso(trilha, de, para) {
  if (!ehAberta(de)) return ehAberta(para); // reabrir ganho/perdido/nutrição
  return ehAberta(para) && ordem(trilha, para) < ordem(trilha, de);
}

export const MOTIVOS_PERDA = [
  'Sem orçamento', 'Sem dor (não atende TEA / já resolvido)', 'Sem decisor', 'Escolheu outra solução',
  'Sem tempo para implantar', 'Piloto sem resultado', 'Sem resposta', 'Contratação pública inviável agora', 'Outro',
];
export const DIAS_NUTRICAO = 60; // "retomo no próximo bimestre"

export const ORIGENS = [
  { k: 'lista', n: 'Lista do plano (diretórios públicos)' },
  { k: 'visita', n: 'Visita na rota' },
  { k: 'indicacao', n: 'Indicação (clínica, terapeuta, família, cliente)' },
  { k: 'evento', n: 'Evento ou formação' },
  { k: 'inbound', n: 'Procurou a AdaptAI' },
  { k: 'conteudo', n: 'Conteúdo / redes' },
  { k: 'outro', n: 'Outro' },
];

// ---------------------------------------------------------------------------
// Rotas por região (Belém)
// ---------------------------------------------------------------------------
export const ROTAS = [
  { k: 'A', n: 'A · Central', dia: 2, quando: 'Terça', bairros: ['Nazaré', 'Batista Campos', 'Umarizal', 'Campina', 'Reduto', 'Campina / Reduto'], obs: 'Tudo próximo; priorizar as escolas A.' },
  { k: 'B', n: 'B · Intermediária', dia: 3, quando: 'Quarta', bairros: ['Pedreira', 'Souza', 'Marco', 'São Braz', 'Cremação', 'Guamá', 'Cidade Velha', 'Parque Verde', 'Av. Augusto Montenegro', 'Parque Verde / Av. Augusto Montenegro'], obs: 'Agrupar por proximidade; considerar o trânsito.' },
  { k: 'C', n: 'C · Distante', dia: null, quando: 'Sob demanda (semanas 2 e 3)', bairros: ['Terra Firme', 'Tapanã', 'Icoaraci', 'Tapanã (Icoaraci)', 'Águas Lindas', 'Marambaia', 'Mangueirão'], obs: 'Preferir ligação, WhatsApp e demo online.' },
];
export function rotaDoBairro(bairro) {
  if (!bairro) return null;
  const b = String(bairro).toLowerCase();
  const r = ROTAS.find((x) => x.bairros.some((y) => y.toLowerCase() === b || b.includes(y.toLowerCase())));
  return r ? r.k : null;
}

// ---------------------------------------------------------------------------
// Pontuação (0 a 10) e prioridade
// ---------------------------------------------------------------------------
export const PONTUACAO = [
  { k: 'pts_etapas', n: 'Etapas atendidas', max: 3, dica: 'Maior para educação infantil e fundamental, onde o diagnóstico de TEA é mais frequente' },
  { k: 'pts_porte', n: 'Porte ou rede', max: 3, dica: 'Escola grande ou de rede = mais professores e alunos atendidos' },
  { k: 'pts_acesso', n: 'Acesso ao decisor', max: 2, dica: 'Maior quando há telefone ou e-mail direto de quem decide' },
  { k: 'pts_rota', n: 'Localização na rota', max: 2, dica: 'Maior quando está numa rota de visita (A ou B)' },
];
export function somaPontos(e) {
  const v = PONTUACAO.map((p) => e[p.k]);
  if (v.some((x) => x == null || x === '')) return null;
  return v.reduce((a, b) => a + Number(b), 0);
}
export function prioridade(pontos) {
  if (pontos == null) return null;
  if (pontos >= 8) return 'A';
  if (pontos >= 6) return 'B';
  return 'C';
}
export const TRATAMENTO = {
  A: 'Visita presencial na semana 1; falar com direção e AEE; oficina e demo.',
  B: 'Ligação e WhatsApp; visita se estiver na rota; convite para oficina.',
  C: 'Cadência digital; priorizar quando a nota subir após o diagnóstico.',
};

// ---------------------------------------------------------------------------
// Cadência multicanal de 20 dias por escola
// ---------------------------------------------------------------------------
export const CADENCIA = [
  { k: 'd1_contato', dia: 1, canal: 'Visita ou ligação', tipos: ['visita', 'ligacao'], acao: 'Apresentação curta; pedir o nome e o contato de quem coordena o AEE ou a parte pedagógica', objetivo: 'Identificar decisor', modelo: 'ligacao_recepcao' },
  { k: 'd1_whatsapp', dia: 1, canal: 'WhatsApp', tipos: ['whatsapp'], acao: 'Mensagem de apresentação depois do contato', objetivo: 'Registrar o canal direto', modelo: 'whatsapp_aee' },
  { k: 'd3_email', dia: 3, canal: 'E-mail', tipos: ['email'], acao: 'Convite para a oficina gratuita de 30 min, com uma pergunta de dor', objetivo: 'Gerar interesse', modelo: 'email_oficina' },
  { k: 'd6_material', dia: 6, canal: 'WhatsApp', tipos: ['whatsapp'], acao: 'Enviar material útil (checklist "adaptação em 5 passos"), sem pedir nada', objetivo: 'Gerar valor', modelo: 'whatsapp_material' },
  { k: 'd9_ligacao', dia: 9, canal: 'Ligação', tipos: ['ligacao'], acao: 'Retomar e propor 2 datas para oficina ou diagnóstico', objetivo: 'Agendar', modelo: 'ligacao_retomada' },
  { k: 'd14_exemplo', dia: 14, canal: 'WhatsApp ou e-mail', tipos: ['whatsapp', 'email'], acao: 'Mostrar exemplo de atividade adaptada de uma escola semelhante (com autorização)', objetivo: 'Prova de valor', modelo: 'whatsapp_exemplo' },
  { k: 'd20_encerramento', dia: 20, canal: 'Mensagem de encerramento', tipos: ['whatsapp', 'email'], acao: '"Vou deixar o contato com você e retomo no próximo bimestre." Mover para nutrição', objetivo: 'Fechar o ciclo com educação', modelo: 'encerramento' },
];
export const PASSO = Object.fromEntries(CADENCIA.map((c) => [c.k, c]));
/** Etapas em que a cadência ainda corre (antes de a escola agendar). */
export const ETAPAS_CADENCIA = ['lista', 'contato', 'decisor'];

// ---------------------------------------------------------------------------
// Atividades
// ---------------------------------------------------------------------------
export const TIPOS_ATIVIDADE = [
  { k: 'visita', n: 'Visita presencial', contato: true },
  { k: 'ligacao', n: 'Ligação', contato: true },
  { k: 'whatsapp', n: 'WhatsApp', contato: true },
  { k: 'email', n: 'E-mail', contato: true },
  { k: 'diagnostico', n: 'Diagnóstico (20 a 30 min)', reuniao: true },
  { k: 'oficina', n: 'Oficina para professores (30 min)', reuniao: true },
  { k: 'demo', n: 'Demonstração para decisor (20 a 30 min)', reuniao: true },
  { k: 'reuniao_direcao', n: 'Reunião com a direção (20 min)', reuniao: true },
  { k: 'reuniao_tecnica', n: 'Reunião técnica (rede pública)', reuniao: true },
  { k: 'piloto_inicio', n: 'Piloto · reunião de início', reuniao: true },
  { k: 'piloto_acomp', n: 'Piloto · acompanhamento', reuniao: true },
  { k: 'piloto_fim', n: 'Piloto · encerramento e relatório', reuniao: true },
  { k: 'outro', n: 'Outro', contato: false },
];
export const TIPO_ATIV = Object.fromEntries(TIPOS_ATIVIDADE.map((t) => [t.k, t]));
export const TIPOS_ATIV_CHAVES = TIPOS_ATIVIDADE.map((t) => t.k);
export const RESULTADOS = [
  { k: 'sem_resposta', n: 'Sem resposta / não atendeu' },
  { k: 'recepcao', n: 'Falou com a recepção ou secretaria' },
  { k: 'falou_aliado', n: 'Falou com AEE ou coordenação' },
  { k: 'falou_decisor', n: 'Falou com quem decide' },
  { k: 'agendou', n: 'Agendou diagnóstico, oficina ou demo' },
  { k: 'sem_interesse', n: 'Disse que não tem interesse' },
];
export const RESULTADOS_CHAVES = RESULTADOS.map((r) => r.k);
export const RESPONDEU = ['recepcao', 'falou_aliado', 'falou_decisor', 'agendou', 'sem_interesse'];
export const DECISOR = ['falou_decisor', 'agendou'];

// ---------------------------------------------------------------------------
// Qualificação e diagnóstico
// ---------------------------------------------------------------------------
export const BANT = [
  { k: 'dor', n: 'Dor real', dica: 'Horas gastas adaptando, falta de padrão, AEE sobrecarregado. Nas palavras da escola.' },
  { k: 'decisor', n: 'Decisor', dica: 'Quem assina: diretor(a), mantenedor(a), secretaria. Já falamos com essa pessoa?' },
  { k: 'prazo', n: 'Prazo', dica: 'Quando querem resolver? Matrícula 2027, início do semestre, planejamento da rede.' },
  { k: 'orcamento', n: 'Orçamento', dica: 'Existe verba ou fonte de recurso? Para a rede pública: programa de Educação Especial.' },
];
export const DIAGNOSTICO = [
  { k: 'contexto', n: 'Contexto', perguntas: 'Quantos alunos com laudo ou necessidades específicas atendem hoje? Quantos com TEA? Existe sala de recursos/AEE ativa? Quantos profissionais de apoio?' },
  { k: 'processo', n: 'Processo atual', perguntas: 'Como os professores adaptam atividades hoje? Quanto tempo isso toma por semana? Quem revisa? Existe padrão entre professores?' },
  { k: 'dor', n: 'Dor', perguntas: 'Qual o maior desafio do AEE e da sala regular? O que mais gera retrabalho ou frustração?' },
  { k: 'historico', n: 'Histórico', perguntas: 'Já usaram alguma tecnologia ou material pronto? O que funcionou e o que não funcionou?' },
  { k: 'decisao', n: 'Decisão', perguntas: 'Quem decide e quem influencia? Qual o processo e o prazo para contratar? Existe orçamento ou fonte de recurso?' },
  { k: 'sucesso', n: 'Sucesso', perguntas: 'Se daqui a 3 meses isso estiver funcionando, o que teria mudado? Como vocês medem isso?' },
];
/** Campos do diagnóstico obrigatórios para mandar proposta. */
export const DIAGNOSTICO_OBRIG = ['processo', 'dor', 'decisao', 'sucesso'];

// ---------------------------------------------------------------------------
// Piloto de 30 dias
// ---------------------------------------------------------------------------
export const DIAS_PILOTO = 30;
export const MARCOS_PILOTO = [
  { dia: 0, k: 'piloto_inicio', n: 'Reunião de início', acao: 'Combinar métricas e critério de sucesso por escrito; treinar 3 a 5 professores e 1 do AEE' },
  { dia: 15, k: 'piloto_acomp', n: 'Acompanhamento', acao: 'Medir uso semanal e tempo por adaptação; destravar quem não usou' },
  { dia: 30, k: 'piloto_fim', n: 'Encerramento', acao: 'Relatório de 1 página para direção/secretaria e proposta de expansão' },
];
export const METRICAS_PILOTO = [
  { k: 'tempo_antes', n: 'Tempo por adaptação antes (min)' },
  { k: 'tempo_depois', n: 'Tempo por adaptação depois (min)' },
  { k: 'adaptacoes', n: 'Adaptações geradas' },
  { k: 'uso_semanal', n: 'Professores usando por semana' },
  { k: 'satisfacao', n: 'Satisfação dos professores (0 a 10)' },
];

// ---------------------------------------------------------------------------
// Metas semanais de partida (hipóteses a calibrar em 4 a 8 semanas)
// ---------------------------------------------------------------------------
export const METAS = [
  { k: 'contatos', n: 'Contatos feitos', padrao: 40, calc: 'Ligações + visitas + mensagens respondidas' },
  { k: 'decisores', n: 'Decisores alcançados', padrao: 10, calc: 'Escolas em que falamos com direção ou coordenação' },
  { k: 'visitas', n: 'Visitas presenciais', padrao: 12, calc: 'Visitas realizadas (faixa 12 a 16)' },
  { k: 'diagnosticos', n: 'Diagnósticos', padrao: 5, calc: 'Conversas de diagnóstico completas' },
  { k: 'demos', n: 'Demos / oficinas', padrao: 3, calc: 'Realizadas na semana (faixa 3 a 5)' },
  { k: 'propostas', n: 'Propostas / pilotos', padrao: 1, calc: 'Escolas que entraram em Proposta/piloto (faixa 1 a 2)' },
];
export const METAS_CHAVES = METAS.map((m) => m.k);

// ---------------------------------------------------------------------------
// Datas
// ---------------------------------------------------------------------------
/** Segunda-feira da semana de `d` (AAAA-MM-DD). */
export function inicioSemana(d) {
  const x = new Date(d + 'T12:00:00Z');
  const dow = x.getUTCDay(); // 0 dom
  const delta = dow === 0 ? -6 : 1 - dow;
  return addDias(d, delta);
}
export function diaDaSemana(d) { return new Date(d + 'T12:00:00Z').getUTCDay(); }

// ---------------------------------------------------------------------------
// Mudança de etapa
// ---------------------------------------------------------------------------
export function aplicarEtapa(e, nova, hoje = hojeBR()) {
  const marcos = { ...(e.marcos || {}) };
  // Quem pulou etapa conta nas anteriores (base das taxas de conversão)
  const lista = (ETAPAS[e.trilha] || ETAPAS.escola).map((x) => x.k);
  const alvo = nova === 'ganho' || nova === 'parceiro_ativo' ? lista.length : lista.indexOf(nova);
  for (let i = 0; i < alvo; i++) if (!marcos[lista[i]]) marcos[lista[i]] = hoje;
  if (!marcos[nova]) marcos[nova] = hoje;
  const mud = { etapa: nova, etapa_desde: hoje, marcos };
  if (nova === 'nutricao' && !e.nutricao_ate) mud.nutricao_ate = addDias(hoje, DIAS_NUTRICAO);
  if (ehAberta(nova)) mud.nutricao_ate = null;
  return mud;
}

const preenchido = (v) => v != null && String(v).trim() !== '';

/**
 * O que falta para a escola entrar na etapa `nova` (lista vazia = pode).
 * ctx: { atividades: [...], dados: campos que vêm junto na mesma gravação }
 */
export function pendenciasPortao(e, nova, ctx = {}) {
  const x = { ...e, ...(ctx.dados || {}) };
  const ativ = (ctx.atividades || []).filter((a) => !a.estornado_em && a.status === 'feito');
  const bant = { ...(e.bant || {}), ...(ctx.dados?.bant || {}) };
  const diag = { ...(e.diagnostico || {}), ...(ctx.dados?.diagnostico || {}) };
  const piloto = { ...(e.piloto || {}), ...(ctx.dados?.piloto || {}) };
  const proposta = { ...(e.proposta || {}), ...(ctx.dados?.proposta || {}) };
  const falta = [];
  const trilha = x.trilha || 'escola';
  const marcado = (tipos) => (ctx.atividades || []).some((a) => !a.estornado_em && tipos.includes(a.tipo) && ['feito', 'agendado'].includes(a.status));
  const feito = (tipos) => ativ.some((a) => tipos.includes(a.tipo));

  switch (nova) {
    case 'contato':
      if (!ativ.some((a) => TIPO_ATIV[a.tipo]?.contato || TIPO_ATIV[a.tipo]?.reuniao)) falta.push('registre o primeiro contato com a escola');
      break;
    case 'decisor':
      if (!preenchido(x.decisor_nome)) falta.push('informe o nome de quem decide (direção ou coordenação)');
      break;
    case 'qualificada':
      for (const b of BANT) if (!preenchido(bant[b.k])) falta.push(`qualificação: ${b.n.toLowerCase()}`);
      if (!preenchido(x.decisor_nome)) falta.push('informe o nome de quem decide');
      break;
    case 'demo':
      if (!feito(['demo', 'oficina'])) falta.push('registre a demo ou a oficina como realizada');
      break;
    case 'proposta': {
      for (const k of DIAGNOSTICO_OBRIG) if (!preenchido(diag[k])) falta.push(`diagnóstico: ${DIAGNOSTICO.find((d) => d.k === k).n.toLowerCase()}`);
      for (const b of BANT) if (!preenchido(bant[b.k])) falta.push(`qualificação: ${b.n.toLowerCase()}`);
      const ehPiloto = preenchido(piloto.criterio) || x.piloto_inicio;
      const ehProposta = preenchido(proposta.enviada_em);
      if (!ehPiloto && !ehProposta) falta.push('defina o piloto (critério de sucesso e início) ou registre a proposta enviada');
      if (ehPiloto && !ehProposta) {
        if (!preenchido(piloto.criterio)) falta.push('piloto: critério de sucesso por escrito');
        if (!x.piloto_inicio) falta.push('piloto: data de início');
      }
      break;
    }
    case 'negociacao':
      if (!preenchido(proposta.enviada_em) && !piloto.encerrado) falta.push('registre a proposta enviada ou encerre o piloto');
      break;
    case 'ganho':
      if (trilha === 'escola' && !(Number(x.valor_mensal) > 0) && !preenchido(proposta.licencas)) falta.push('informe o valor mensal ou o número de licenças fechadas');
      break;
    case 'apresentacao':
      if (!preenchido(x.decisor_nome)) falta.push('informe quem decide na rede (coordenação de Educação Especial ou gabinete)');
      break;
    case 'piloto_rede':
      if (!feito(['reuniao_tecnica', 'demo', 'oficina'])) falta.push('registre a reunião técnica ou a apresentação como realizada');
      if (!preenchido(piloto.criterio)) falta.push('piloto: critério de sucesso por escrito');
      if (!x.piloto_inicio) falta.push('piloto: data de início');
      break;
    case 'parecer':
      if (!piloto.encerrado) falta.push('encerre o piloto com o relatório');
      break;
    case 'oficina_parceiro':
      if (!feito(['oficina', 'demo'])) falta.push('registre a oficina como realizada');
      break;
    case 'perdido':
      if (!preenchido(x.motivo_perda)) falta.push('informe o motivo da perda');
      break;
    default:
  }
  // Agendar já conta para "decisor": quem marcou reunião passou pelo decisor
  if (nova === 'decisor' && falta.length && marcado(['diagnostico', 'oficina', 'demo', 'reuniao_direcao']) && preenchido(x.decisor_nome)) return [];
  return falta;
}

// ---------------------------------------------------------------------------
// O que está devido
// ---------------------------------------------------------------------------
/** Situação do prazo da etapa: ok | perto | estourado. */
export function situacaoPrazo(e, hoje = hojeBR()) {
  if (!ehAberta(e.etapa)) return null;
  const info = etapaInfo(e.trilha, e.etapa);
  if (!info) return null;
  const dias = diffDias(e.etapa_desde, hoje);
  const nivel = dias > info.sla ? 'estourado' : dias >= info.sla - 1 ? 'perto' : 'ok';
  return { dias, sla: info.sla, nivel };
}

/** Próximo passo da cadência ainda não feito (ou null). */
export function passoDevido(e, feitos, hoje = hojeBR()) {
  if (e.trilha !== 'escola' || !ETAPAS_CADENCIA.includes(e.etapa)) return null;
  const inicio = e.cadencia_inicio || hoje;
  const diaAtual = diffDias(inicio, hoje) + 1;
  for (const p of CADENCIA) {
    if (feitos.has(p.k)) continue;
    const data = addDias(inicio, p.dia - 1);
    return { ...p, data, devido: p.dia <= diaAtual, atrasado: p.dia < diaAtual, dia_atual: diaAtual };
  }
  return null;
}

/** Marco do piloto devido (ou null). */
export function marcoPilotoDevido(e, feitosTipos, hoje = hojeBR()) {
  if (!e.piloto_inicio || e.piloto?.encerrado) return null;
  for (const m of MARCOS_PILOTO) {
    if (feitosTipos.has(m.k)) continue;
    const data = addDias(e.piloto_inicio, m.dia);
    return { ...m, data, devido: data <= hoje, atrasado: data < hoje };
  }
  return null;
}
export function situacaoPiloto(e, hoje = hojeBR()) {
  if (!e.piloto_inicio) return null;
  const fim = e.piloto_fim || addDias(e.piloto_inicio, DIAS_PILOTO);
  const dia = diffDias(e.piloto_inicio, hoje);
  return { dia: Math.max(0, dia), fim, de: diffDias(e.piloto_inicio, fim), encerrado: !!e.piloto?.encerrado, vencido: !e.piloto?.encerrado && hoje > fim };
}
