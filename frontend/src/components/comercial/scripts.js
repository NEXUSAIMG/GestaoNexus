// Roteiros e objeções da metodologia (sem trial: apresentação → proposta → implantação).
// Sprint 42J — quem fala é a Ayio, a empresa que desenvolve e vende o Seu Cartório;
// a cadência começa pelo e-mail de apresentação.

export const SCRIPTS = [
  {
    titulo: "E-mail · dia 1 (apresentação)",
    texto: "Assunto: [cartório]: atendimento por WhatsApp sem ocupar o balcão\n\n[Nome], bom dia.\n\nSou [vendedor], da Ayio, a empresa que desenvolve o Seu Cartório: a plataforma de atendimento por WhatsApp feita para cartórios.\n\nO [cartório de referência] recebia [volume] mensagens por dia e tinha [n] pessoas respondendo no celular. Com o Seu Cartório, [resultado concreto].\n\nVou ligar para você amanhã para entender como é o atendimento aí no [cartório]. Se preferir, responda este e-mail com o melhor horário para uma conversa de 20 minutos.\n\n[vendedor]\nAyio · Seu Cartório\n[telefone / WhatsApp]",
  },
  {
    titulo: "Ligação · dia 2 (abertura)",
    texto: "Bom dia, [nome]. Aqui é [vendedor], da Ayio, a empresa do Seu Cartório. Ontem mandei um e-mail para você sobre o atendimento por WhatsApp do cartório, conseguiu ver?\n\nCuidamos do atendimento por WhatsApp de cartórios de vários estados, como o [cartório de referência da região]. A maioria dos titulares nos conta que a equipe perde horas respondendo as mesmas perguntas. Isso acontece aí também?\n\nSe sim: Posso marcar 20 minutos para entender como é hoje e mostrar o que outros cartórios mudaram? Quinta às 10h ou às 15h?",
  },
  {
    titulo: "WhatsApp · dia 2 (sem resposta na ligação)",
    texto: "Olá, [nome]! Sou [vendedor], da Ayio, a empresa do Seu Cartório. Mandei um e-mail ontem e tentei falar por telefone agora há pouco.\n\nAjudamos cartórios como o [referência] a responder o WhatsApp em minutos sem ocupar o balcão. Vocês recebem muitas mensagens por dia aí no [cartório]?",
  },
  {
    titulo: "Ligação · dia 4 (pedir 20 minutos)",
    texto: "[Nome], é o [vendedor], da Ayio, do Seu Cartório. Te mandei um e-mail e uma mensagem nesta semana. Queria só 20 minutos com você para entender como funciona o atendimento por WhatsApp aí no [cartório] e mostrar o que outros cartórios mudaram. Fica melhor [dia] às [hora] ou [dia] às [hora]?",
  },
  {
    titulo: "WhatsApp · dia 6 (vídeo)",
    texto: "[Nome], gravei um vídeo de 1 minuto mostrando o Seu Cartório atendendo o WhatsApp de um cartório como o de vocês: [link]. Somos a Ayio, a empresa que desenvolve a plataforma. Faz sentido conversarmos 20 minutos?",
  },
  {
    titulo: "WhatsApp · dia 10 (depoimento)",
    texto: "[Nome], olha o que o(a) [titular cliente], do [cartório cliente], falou depois de 1 mês com o Seu Cartório: \"[depoimento curto]\". Se quiser, conto em 20 minutos como foi a implantação deles.",
  },
  {
    titulo: "E-mail · dia 11 (convite para o webinar)",
    texto: "Assunto: Webinar: atendimento por WhatsApp em cartórios, [data]\n\n[Nome], bom dia.\n\nA Ayio, empresa do Seu Cartório, vai mostrar em [data], às [hora], como cartórios estão organizando o atendimento por WhatsApp: fila, respostas automáticas, LGPD e relatório para o titular. São 40 minutos, com perguntas no final.\n\nInscrição: [link]\n\n[vendedor]\nAyio · Seu Cartório",
  },
  {
    titulo: "WhatsApp · dia 12 (encerramento)",
    texto: "[Nome], aqui é [vendedor], da Ayio (Seu Cartório). Vou parar de insistir para não atrapalhar sua rotina. Se o atendimento por WhatsApp virar prioridade, é só me chamar aqui.\n\nPosso voltar a falar com você daqui a 3 meses?",
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
    texto: "[Nome], é o [seu nome], da Ayio, do Seu Cartório. Liguei para saber se ficou alguma dúvida na proposta e confirmar: a decisão continua para [data combinada]? Mais alguém precisa ver? Posso fazer 10 minutos com vocês e a TI.",
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
    texto: "[Nome], tudo bem? Aqui é [vendedor], da Ayio, a empresa do Seu Cartório. Conversamos há uns meses sobre o atendimento por WhatsApp do cartório. Muita coisa mudou desde então: [novidade ou caso novo]. O momento de vocês mudou? Posso mostrar em 15 minutos.",
  },
  {
    titulo: "Implantação · onboarding (D0)",
    texto: "[Nome], bem-vindos ao Seu Cartório! Aqui é [seu nome], da Ayio. Segue o onboarding para preencher. Vamos marcar o treinamento da equipe (e já ativamos tudo na mesma reunião): [dia] às [hora] fica bom?",
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
