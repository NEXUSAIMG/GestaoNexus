// Roteiros e objeções da metodologia (mesmos da Mesa Comercial).

export const SCRIPTS = [
  {
    titulo: "Abertura por ligação",
    texto: "Bom dia, [nome]. Aqui é [vendedor], do Seu Cartório. Cuidamos do atendimento por WhatsApp de cartórios de vários estados, como o [cartório de referência da região]. Liguei porque a maioria dos titulares nos conta que a equipe perde horas respondendo as mesmas perguntas. Isso acontece aí também?\n\nSe sim: Posso marcar 20 minutos para entender como é hoje e mostrar o que outros cartórios mudaram? Quinta às 10h ou às 15h?",
  },
  {
    titulo: "WhatsApp · dia 1 (sem resposta na ligação)",
    texto: "Olá, [nome]! Sou [vendedor], do Seu Cartório. Tentei falar por telefone agora há pouco.\n\nAjudamos cartórios como o [referência] a responder o WhatsApp em minutos sem ocupar o balcão. Vocês recebem muitas mensagens por dia aí no [cartório]?",
  },
  {
    titulo: "E-mail · dia 2",
    texto: "Assunto: Como o [cartório de referência] liberou a equipe do WhatsApp\n\n[Nome], bom dia.\n\nO [cartório de referência] recebia [volume] mensagens por dia e tinha [n] pessoas respondendo no celular. Com o Seu Cartório, [resultado concreto].\n\nVale uma conversa de 20 minutos para ver se faz sentido para o [cartório]? Responda com o melhor horário.\n\n[assinatura]",
  },
  {
    titulo: "WhatsApp · dia 12 (encerramento)",
    texto: "[Nome], vou parar de insistir para não atrapalhar sua rotina. Se o atendimento por WhatsApp virar prioridade, é só me chamar aqui.\n\nPosso voltar a falar com você daqui a 3 meses?",
  },
  {
    titulo: "Diagnóstico (20 minutos)",
    texto: "1. Situação: quantas mensagens chegam por dia? Quem responde, e em qual aparelho?\n2. Problema: o que mais se repete? Quanto tempo leva para responder? Já houve reclamação?\n3. Implicação: o que esse tempo custa? O que acontece quando o atendente falta ou sai? Como fica a LGPD com conversas no celular pessoal?\n4. Necessidade: se isso estivesse resolvido em 2 semanas, como seria o atendimento?\n5. Decisão: quem mais precisa participar? O titular pode estar na ativação?\n\nFechar sempre com a ativação do trial marcada na agenda.",
  },
  {
    titulo: "Fechamento · reunião do dia 7",
    texto: "A meta que definimos era [meta]. Nesta semana vocês chegaram a [resultado]. Faz sentido manter isso funcionando?\n\nO plano [nome] fica em [valor] por mês. Posso enviar o contrato para assinatura hoje?",
  },
  {
    titulo: "Pedido de indicação",
    texto: "[Nome], que bom que o atendimento está rodando bem! Você conhece algum colega titular que sofre com o WhatsApp como vocês sofriam?\n\nSe ele assinar, você ganha um mês grátis. Posso dizer que fui indicado por você?",
  },
];

export const OBJECOES = [
  ["Está caro", "Compare com o custo de uma pessoa respondendo WhatsApp o dia todo. Pergunte: caro comparado a quê?"],
  ["Já uso o WhatsApp normal", "O problema não é o WhatsApp, é a fila, a falta de histórico e o celular pessoal. Mostre o relatório do trial."],
  ["Minha equipe não vai usar", "Por isso a ativação é feita junto, com a equipe. Ofereça acompanhamento na primeira semana."],
  ["E a LGPD e a segurança?", "Explique onde ficam os dados, quem acessa e o fluxo de consentimento; ofereça conversa com a TI."],
  ["Preciso falar com o titular", "Vamos marcar os três juntos? Nunca deixe a decisão sem data."],
  ["Já tenho sistema do cartório", "O sistema cuida dos atos; o Seu Cartório cuida do atendimento. Um não substitui o outro."],
  ["Vou pensar", "O que falta para decidir? Resolva a dúvida real e marque a data da decisão."],
];
