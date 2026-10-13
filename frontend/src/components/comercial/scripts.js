// Roteiros e objeções da metodologia (sem trial: apresentação → proposta → implantação).

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
    titulo: "Reunião de apresentação · diagnóstico",
    texto: "1. Situação: quantas mensagens chegam por dia? Quem responde, e em qual aparelho?\n2. Problema: o que mais se repete? Quanto tempo leva para responder? Já houve reclamação?\n3. Implicação: o que esse tempo custa? O que acontece quando o atendente falta ou sai? Como fica a LGPD com conversas no celular pessoal?\n4. Necessidade: se isso estivesse resolvido em 2 semanas, como seria o atendimento?\n5. Decisão: quem mais precisa participar? É interino (depende da corregedoria)?\n\nDepois das perguntas, faça a demonstração e combine a data da proposta.",
  },
  {
    titulo: "Reunião de apresentação · demonstração",
    texto: "Mostre só o que resolve a dor que o titular falou, nesta ordem, de preferência com o WhatsApp do próprio cartório:\n1. A mensagem chegando.\n2. A resposta automática.\n3. A passagem para o atendente.\n4. O relatório que o titular vai ver.\n\nFeche a reunião combinando a proposta: \"Posso te mandar a proposta até [dia]? Quem mais precisa ver para decidir?\"",
  },
  {
    titulo: "Proposta e fechamento",
    texto: "[Nome], como combinamos na reunião: vocês recebem [volume] mensagens por dia e hoje [n] pessoas respondem no celular. Com o Seu Cartório, [o que muda para eles].\n\nO plano [nome] fica em [valor] por mês, com implantação assistida: em até 48 horas treinamos a equipe e deixamos tudo funcionando.\n\nPosso enviar o contrato para assinatura?",
  },
  {
    titulo: "Na reunião · combinar a data da decisão",
    texto: "Antes de mandar a proposta: \"Para eu mandar tudo certinho: quem mais participa da decisão? E até quando vocês conseguem me dar o retorno? Dia [data] fica bom?\"\n\nCom a data combinada, cobrar no dia vira cumprir o combinado, e não insistir.",
  },
  {
    titulo: "Retorno 1/4 (dia 2) · WhatsApp com um caso",
    texto: "[Nome], tudo bem? Lembrei de vocês: o [cartório parecido], de [cidade], tinha a mesma fila no WhatsApp e hoje [resultado, ex.: responde em minutos sem tirar ninguém do balcão]. Ficou alguma dúvida sobre a proposta?",
  },
  {
    titulo: "Retorno 2/4 (dia 4) · ligação",
    texto: "[Nome], é o [seu nome], do Seu Cartório. Liguei para saber se ficou alguma dúvida na proposta e confirmar: a decisão continua para [data combinada]? Mais alguém precisa ver? Posso fazer 10 minutos com vocês e a TI.",
  },
  {
    titulo: "Retorno 3/4 (dia 6) · titular",
    texto: "Dr(a). [titular], tudo bem? Mandei a proposta para [quem recebeu] e queria ouvir do senhor(a): o que pesa mais na decisão? Em resumo: [dor que ele falou] → [o que muda]. Por [valor]/mês, com a implantação feita por nós em 48 horas. Podemos fechar?",
  },
  {
    titulo: "Retorno 4/4 (dia 7) · encerramento educado",
    texto: "[Nome], não quero ser inconveniente: vou entender que agora não é o momento e encerro a proposta por aqui. Se mudar, é só me chamar que retomamos de onde paramos. Obrigado pela atenção!\n\n(É a mensagem que mais recebe resposta. Se não vier nada, aí sim: Perdido por \"Sumiu\", e o sistema programa o retorno em 90 dias.)",
  },
  {
    titulo: "Aguardando a Corregedoria · acompanhamento quinzenal",
    texto: "[Nome], tudo bem? Já tiveram retorno da corregedoria? Posso ajudar com algum documento ou uma explicação técnica para o pedido.",
  },
  {
    titulo: "Retomada depois de 90 dias",
    texto: "[Nome], tudo bem? Conversamos há uns meses sobre o atendimento por WhatsApp do cartório. Muita coisa mudou desde então: [novidade ou caso novo]. O momento de vocês mudou? Posso mostrar em 15 minutos.",
  },
  {
    titulo: "Implantação · onboarding (D0)",
    texto: "[Nome], bem-vindos ao Seu Cartório! Segue o onboarding para preencher. Vamos marcar o treinamento da equipe (e já ativamos tudo na mesma reunião): [dia] às [hora] fica bom?",
  },
  {
    titulo: "Pedido de indicação",
    texto: "[Nome], que bom que o atendimento está rodando bem! Você conhece algum colega titular que sofre com o WhatsApp como vocês sofriam?\n\nSe ele assinar, você ganha um mês grátis. Posso dizer que fui indicado por você?",
  },
];

export const OBJECOES = [
  ["Está caro", "Compare com o custo de uma pessoa respondendo WhatsApp o dia todo. Pergunte: caro comparado a quê?"],
  ["Já uso o WhatsApp normal", "O problema não é o WhatsApp, é a fila, a falta de histórico e o celular pessoal. Mostre na demonstração como fica o relatório."],
  ["Minha equipe não vai usar", "Por isso a implantação é assistida: treinamos a equipe em até 48 horas e acompanhamos o primeiro mês."],
  ["E a LGPD e a segurança?", "Explique onde ficam os dados, quem acessa e o fluxo de consentimento; ofereça conversa com a TI."],
  ["Preciso falar com o titular", "Vamos marcar os três juntos? Nunca deixe a decisão sem data."],
  ["Já tenho sistema do cartório", "O sistema cuida dos atos; o Seu Cartório cuida do atendimento. Um não substitui o outro."],
  ["Vou pensar", "O que falta para decidir? Resolva a dúvida real e marque a data da decisão."],
];
