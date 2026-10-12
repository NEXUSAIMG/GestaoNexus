/**
 * Guia do módulo Comercial (Sprint 42C) — todo o texto de ajuda num lugar só.
 *
 * Regra de escrita: frase curta, verbo no imperativo, sem jargão. Quem lê
 * é a vendedora no meio do dia, não quem desenhou o processo. Cada regra
 * diz POR QUE existe — regra sem motivo vira "o sistema é chato".
 */

// ---------------------------------------------------------------------------
// Etapas: objetivo, o que fazer, quando avançar, prazo
// ---------------------------------------------------------------------------
export const GUIA_ETAPAS = {
  prospect: {
    objetivo: 'Cartório que ainda não recebeu nenhum contato.',
    fazer: [
      'Confira se o cadastro está certo (nome, cidade, telefone; CNS se tiver).',
      'Mude a etapa para "Em cadência" no dia em que for fazer o 1º contato.',
    ],
    avancar: 'Vai para Em cadência quando você começar os contatos.',
    prazo: '2 dias. Cartório parado em Prospect é lista esquecida.',
  },
  cadencia: {
    objetivo: 'Conseguir uma conversa de 20 minutos (diagnóstico) com o titular ou responsável.',
    fazer: [
      'Faça o toque do dia que aparece em Hoje — ligação, WhatsApp ou e-mail, nessa ordem do roteiro.',
      'Registre cada toque com o resultado (atendeu, não atendeu, caixa postal…).',
      'Se a pessoa topar conversar, escolha "Agendou reunião" e informe data e hora: o cartório vai sozinho para Diagnóstico.',
    ],
    avancar: 'Avança sozinho quando você registra "Agendou reunião". Se os 12 dias acabarem sem resposta, marque Perdido com motivo "Sumiu".',
    prazo: '12 dias úteis (o roteiro inteiro).',
  },
  diagnostico: {
    objetivo: 'Entender a dor do cartório e combinar o teste (trial).',
    fazer: [
      'Faça a reunião usando o roteiro "Diagnóstico (20 minutos)" na aba Scripts.',
      'Depois da reunião, marque o desfecho: realizada ou faltou.',
      'Preencha o diagnóstico: mensagens por dia, quantas pessoas respondem, a dor, quem decide e o prazo.',
    ],
    avancar: 'Vai para Qualificado quando a reunião estiver marcada como realizada e o diagnóstico estiver preenchido.',
    prazo: '5 dias entre agendar e qualificar.',
  },
  qualificado: {
    objetivo: 'Preparar o trial para dar certo antes de começar.',
    fazer: [
      'Escreva a meta de sucesso combinada com o cartório (ex.: responder 90% das mensagens em até 10 minutos).',
      'Agende a reunião de ativação (30 minutos) com o titular presente.',
    ],
    avancar: 'Vai para Trial guiado quando a meta de sucesso estiver escrita e a ativação agendada.',
    prazo: '3 dias. Cartório qualificado esfria rápido.',
  },
  trial: {
    objetivo: 'Fazer o cartório usar de verdade e ver resultado em 14 dias.',
    fazer: [
      'Siga os marcos D0, D1, D3, D7, D10 e D14 que aparecem em Hoje.',
      'Marque os sinais de uso (WhatsApp conectado, atendentes, conversas reais…). Abaixo de 40 pontos no dia 3: ligue no mesmo dia.',
      'No D7, faça a reunião de resultado e registre a proposta.',
    ],
    avancar: 'Vai para Proposta quando a proposta estiver registrada (plano, valor e validade).',
    prazo: '14 dias. Trial sem prazo vira uso grátis.',
  },
  proposta: {
    objetivo: 'Fechar: assinatura e primeiro pagamento.',
    fazer: [
      'Acompanhe até a validade da proposta; tire dúvidas e envolva a TI se precisar.',
      'Assinou? Mude para Ganho. O valor vem da proposta.',
      'Recusou? Marque a proposta como recusada e o cartório como Perdido, com o motivo.',
    ],
    avancar: 'Vai para Ganho quando o cliente assinar.',
    prazo: '7 dias (validade padrão da proposta).',
  },
  ganho: {
    objetivo: 'Cliente assinou. Agora falta o primeiro pagamento.',
    fazer: [
      'Preencha o CNPJ: o Nexus confere o pagamento sozinho no ASAAS.',
      'Sem ASAAS? A gestão confirma o pagamento com o comprovante.',
      'Peça uma indicação (script "Pedido de indicação").',
    ],
    avancar: 'Só conta na meta quando o pagamento entra.',
    prazo: 'Assinado há mais de 7 dias sem pagamento vira alerta.',
  },
  perdido: {
    objetivo: 'Negociação encerrada. O motivo ensina o que mudar no discurso.',
    fazer: [
      'Escolha o motivo certo — é o dado mais usado na revisão do mês.',
      'Se o cartório pediu para não ser mais contatado, inclua na lista de não contatar (aba Controles).',
    ],
    avancar: 'Para reabrir, mude a etapa e escreva a justificativa.',
    prazo: '—',
  },
};

// ---------------------------------------------------------------------------
// Glossário (usado pelos ícones "?")
// ---------------------------------------------------------------------------
export const GLOSSARIO = {
  cadencia: 'Roteiro de 8 toques em 12 dias úteis (ligação, WhatsApp, e-mail) para conseguir a primeira conversa. O sistema mostra em Hoje o toque de cada dia.',
  toque: 'Qualquer contato feito com o cartório: ligação, mensagem, e-mail. Todo toque é registrado com o resultado.',
  conexao: 'Toque em que você falou com alguém: atendeu, agendou, pediu retorno, recusou ou respondeu a mensagem. Toques são esforço; conexões são o que gera reunião.',
  sla: 'Prazo máximo que um cartório pode ficar parado na mesma etapa. Passou do prazo, ele aparece em "Parados além do prazo" e na Supervisão.',
  portao: 'Critério para mudar de etapa. Ex.: só vai para Qualificado com o diagnóstico feito. Existe para o funil mostrar a verdade: cada etapa significa a mesma coisa para todo mundo.',
  pontos: 'Pontuação de uso no trial (0 a 100), somando os sinais marcados. 60 ou mais no dia 3: no caminho. Abaixo de 40: ligue no mesmo dia.',
  estorno: 'Como corrigir um registro errado. Nada é apagado: o registro fica riscado no histórico, com quem estornou e o motivo. Quem registrou estorna no mesmo dia; depois, só a gestão.',
  semaforo: 'Verde: atividade do dia em dia. Amarelo: entre 70% e 99%. Vermelho: abaixo de 70% — conversa rápida com a gestão para tirar o bloqueio.',
  assinado_pago: 'Assinado é quando o cliente aceita. Pago é quando o primeiro pagamento entra. A meta conta pagos — assinatura sem pagamento ainda não é cliente.',
  nao_contatar: 'Lista de quem pediu para não ser contatado (LGPD ou descadastro). Quem está nela não pode ser cadastrado, importado nem receber contato.',
  duplicidade: 'O sistema não deixa o mesmo cartório entrar duas vezes (mesmo CNS, CNPJ, e-mail, telefone ou nome+cidade). A mensagem diz com quem ele já está.',
  cns: 'Código Nacional da Serventia: o número de 6 dígitos que identifica o cartório no CNJ. É o jeito mais seguro de evitar cadastro repetido.',
  checagem: 'Olhada rápida da gestão na atividade de cada pessoa às 8h30, 12h30 e 17h. Fica registrada com o semáforo do momento e o que foi combinado.',
  um_a_um: 'Conversa semanal (sexta) entre a gestão e cada pessoa: números da semana, bloqueios e plano de ação com prazo.',
  proximo_passo: 'O que vai acontecer a seguir com o cartório e quando. Cartório em negociação nunca fica sem próximo passo com data.',
  origem: 'De onde o cartório veio (ligação, e-mail frio, indicação, evento…). Serve para saber qual canal dá resultado e quanto custa cada cliente.',
  campanha: 'Nome da ação específica (ex.: "E-mail onda 1", "Congresso Recife"). Opcional, mas ajuda a comparar ações do mesmo canal.',
};

// ---------------------------------------------------------------------------
// "Como funciona" de cada aba
// ---------------------------------------------------------------------------
export const COMO_FUNCIONA = {
  hoje: {
    titulo: 'Hoje é a sua lista de tarefas',
    itens: [
      'Trabalhe de cima para baixo: reuniões, desfechos pendentes, marcos de trial, toques de cadência, próximos passos.',
      'Cada linha tem o botão que resolve. Ao registrar, a linha some e o próximo passo aparece sozinho.',
      'Comece o dia aqui e termine com a tela vazia.',
    ],
  },
  funil: {
    titulo: 'Funil: onde está cada cartório',
    itens: [
      'Cada coluna é uma etapa. O número ao lado é quantos cartórios estão nela e o prazo da etapa.',
      'Clique no cartório para abrir a ficha: ela diz o que fazer agora e o que falta para avançar.',
      'Novo cartório começa em Prospect. Para listas grandes, use "Importar lista".',
    ],
  },
  trials: {
    titulo: 'Trials: os testes em andamento',
    itens: [
      'Cada trial dura 14 dias, com marcos D0 a D14.',
      'A barra é a pontuação de uso. Em risco (vermelho) = ligue hoje.',
    ],
  },
  supervisao: {
    titulo: 'Supervisão: como está cada pessoa hoje',
    itens: [
      'O semáforo compara o que foi feito com o que estava previsto para hoje.',
      'Os alertas dizem exatamente qual cartório precisa de ação e por quê.',
      'A gestão registra as checagens das 8h30, 12h30 e 17h e o 1:1 de sexta aqui.',
    ],
  },
  placar: {
    titulo: 'Placar: esforço e resultado lado a lado',
    itens: [
      'Muitos toques e poucas conexões: problema de horário ou de lista. Muitas reuniões e poucos trials: problema de diagnóstico.',
      'Números em vermelho estão abaixo da meta individual.',
    ],
  },
  metas: {
    titulo: 'Metas: de trás para frente',
    itens: [
      'A meta de clientes pagos vira contatos por dia, usando as taxas de conversão.',
      'À direita, as taxas reais do funil. Quando ficarem diferentes das previstas, ajuste a meta.',
    ],
  },
  controles: {
    titulo: 'Controles: listas que protegem a equipe',
    itens: [
      'Não contatar: quem pediu para sair. O sistema bloqueia qualquer contato.',
      'Rotina: mostra se as checagens da gestão estão acontecendo.',
      'Feriados: não contam como dia útil na cadência nem nas metas.',
    ],
  },
  scripts: {
    titulo: 'Scripts: o que falar',
    itens: ['Roteiros, não falas decoradas. Troque os campos entre colchetes e mantenha a ordem.'],
  },
};

// ---------------------------------------------------------------------------
// Perguntas frequentes
// ---------------------------------------------------------------------------
export const FAQ = [
  { p: 'Registrei um toque errado. Como corrijo?', r: 'Abra o cartório, desmarque o toque na cadência (ou use o histórico) e escreva o motivo. Isso é um estorno: o registro fica riscado, não some. No mesmo dia, você mesma estorna; depois disso, peça à gestão.' },
  { p: 'O sistema não me deixa mudar a etapa. Por quê?', r: 'Cada etapa tem um critério (portão). A ficha do cartório mostra a lista do que falta, com o botão para resolver cada item — por exemplo, "Agendar reunião" ou "Preencher diagnóstico". Resolva os itens e tente de novo.' },
  { p: 'Quero voltar um cartório para uma etapa anterior.', r: 'Pode. Mude a etapa e escreva a justificativa quando o sistema pedir. Ela fica no histórico.' },
  { p: 'Apareceu "Este cartório já está no funil".', r: 'Alguém já cadastrou esse cartório. A mensagem diz o nome, o protocolo e com quem ele está. Procure pelo nome no Funil e fale com a pessoa — não cadastre de novo com outro nome.' },
  { p: 'O cartório pediu para não ser mais contatado.', r: 'Vá em Controles → Lista de não contatar e inclua o e-mail ou o telefone com o motivo. Depois marque o cartório como Perdido. O sistema passa a bloquear qualquer contato.' },
  { p: 'O cliente pediu desconto.', r: 'A única concessão permitida é 1 mês grátis para ex-cliente que volta, uma vez por cartório. Qualquer outro pedido: leve para a gestão. Na conversa, compare com o custo de uma pessoa respondendo WhatsApp o dia todo.' },
  { p: 'O cliente assinou, mas a meta não mudou.', r: 'A meta conta pagos, não assinados. Preencha o CNPJ do cartório: quando o primeiro pagamento entrar no ASAAS, o sistema confirma sozinho. Se pagou fora do ASAAS, peça à gestão para confirmar com o comprovante.' },
  { p: 'A reunião não aconteceu.', r: 'Abra a reunião (em Hoje ou na ficha do cartório) e escolha "Cliente faltou" ou "Remarcar". Reunião passada sem desfecho vira alerta para você e para a gestão.' },
  { p: 'Terminei os 12 dias de cadência e ninguém respondeu.', r: 'Marque o cartório como Perdido com o motivo "Sumiu". Se fizer sentido, deixe um próximo passo para daqui a 90 dias antes de encerrar.' },
  { p: 'Por que o meu semáforo está vermelho?', r: 'Você fez menos de 70% do que estava previsto para hoje (toques e marcos pendentes) ou está abaixo da sua meta de novos ou de toques. Veja os alertas no seu cartão da Supervisão e os itens em Hoje.' },
  { p: 'Não sei o que falar na ligação.', r: 'Abra a aba Scripts. Dentro da ficha do cartório também aparece o roteiro do passo atual, com botão para copiar.' },
  { p: 'Quem pode arquivar um cartório?', r: 'Só a gestão, com motivo — arquivar tira o cartório das contas. Para encerrar uma negociação, use Perdido.' },
];

// ---------------------------------------------------------------------------
// Tour de boas-vindas
// ---------------------------------------------------------------------------
export const TOUR = [
  {
    titulo: 'Boas-vindas ao Comercial',
    texto: 'Aqui fica todo o trabalho de venda do Seu Cartório: quem contatar, o que falar e o que fazer em cada etapa. Leva 1 minuto para entender.',
  },
  {
    titulo: '1. Comece o dia em "Hoje"',
    texto: 'É a sua lista de tarefas, em ordem. Cada linha tem o botão que resolve. A meta é terminar o dia com a lista vazia.',
  },
  {
    titulo: '2. Cada contato tem um resultado',
    texto: 'Ligou e não atendeu? Registre "Não atendeu". Atendeu e marcou conversa? "Agendou reunião", com data e hora. É assim que a gestão sabe o que funciona.',
  },
  {
    titulo: '3. A ficha do cartório diz o próximo passo',
    texto: 'Abra qualquer cartório: no topo aparece o que fazer agora e o que falta para avançar de etapa, com botões. Não precisa decorar regra.',
  },
  {
    titulo: '4. Errou? Tem conserto',
    texto: 'Nada é apagado, mas tudo pode ser corrigido com um estorno e um motivo. Dúvidas? Abra a aba "Ajuda" ou clique nos ícones (?) espalhados pela tela.',
  },
];

// ---------------------------------------------------------------------------
// Script sugerido para o passo atual do cartório
// ---------------------------------------------------------------------------
export function scriptDoPasso(lead) {
  if (!lead) return null;
  if (lead.etapa === 'cadencia') {
    const feitos = Object.keys(lead.toques_cadencia || {}).map(Number);
    const proximo = [1, 2, 4, 6, 8, 10, 11, 12].find((d) => !feitos.includes(d));
    if (proximo === 1) return 'Abertura por ligação';
    if (proximo === 2) return 'E-mail · dia 2';
    if (proximo === 12) return 'WhatsApp · dia 12 (encerramento)';
    return 'Abertura por ligação';
  }
  if (lead.etapa === 'diagnostico') return 'Diagnóstico (20 minutos)';
  if (lead.etapa === 'trial' || lead.etapa === 'proposta') return 'Fechamento · reunião do dia 7';
  if (lead.etapa === 'ganho') return 'Pedido de indicação';
  if (lead.etapa === 'prospect') return 'Abertura por ligação';
  return null;
}
