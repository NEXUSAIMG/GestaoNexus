// Roteiros e objeções da metodologia (42L: apresentação → trial de 14 dias → proposta → implantação).
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
    titulo: "Fim da reunião · convite para o trial",
    texto: "[Nome], o melhor jeito de decidir é ver funcionando no seu cartório. Proponho 14 dias de trial, com a gente do lado: amanhã conectamos o WhatsApp e treinamos a equipe em 45 minutos.\n\nPara valer a pena, vamos combinar o que é sucesso: [ex.: responder 90% das mensagens em até 10 minutos / tirar 3 horas por dia do escrevente]. Se isso acontecer, faz sentido seguir?\n\nE já vamos marcar a reunião de resultado com o senhor no dia [data do 12º dia], às [hora], para olharmos os números juntos.",
  },
  {
    titulo: "Trial D0 · ativação",
    texto: "Roteiro da reunião de ativação (45 min):\n1. Conectar o WhatsApp do cartório e testar uma mensagem.\n2. Criar o acesso de cada atendente e fazer cada um responder uma conversa de teste.\n3. Ligar as respostas das 10 perguntas mais comuns (horário, documentos, valores, prazos).\n4. Ler em voz alta a meta de sucesso e confirmar a reunião de resultado.\n5. Combinar: amanhã eu confiro as primeiras conversas com vocês.",
  },
  {
    titulo: "Trial D1 · primeiras conversas",
    texto: "[Nome], tudo bem? Aqui é [seu nome], da Ayio. Já chegaram conversas pelo Seu Cartório? Se alguém da equipe não conseguiu entrar ou alguma resposta não ficou boa, me diga que eu ajusto hoje.",
  },
  {
    titulo: "Trial · uso baixo (ligação)",
    texto: "[Nome], aqui é [seu nome], da Ayio. Vi que ainda passaram poucas conversas pela plataforma. O que travou? (WhatsApp não conectou? Alguém não conseguiu entrar? A equipe voltou para o celular?)\n\nPosso fazer 20 minutos com a equipe hoje ou amanhã para deixar tudo rodando? Quero que o senhor chegue na reunião do dia [data] com números de verdade.",
  },
  {
    titulo: "Trial D7 · relatório ao titular",
    texto: "Dr(a). [titular], primeira semana do Seu Cartório aí no [cartório]:\n• [n] conversas atendidas\n• tempo médio de resposta: [x] minutos\n• [n] perguntas respondidas automaticamente (as mais comuns: [assuntos])\n\nA meta que combinamos era [meta]. Estamos [no caminho / perto / ajustando X]. Nossa reunião de resultado continua [dia] às [hora]?",
  },
  {
    titulo: "Trial D12 · reunião de resultado",
    texto: "Roteiro (30 min, com o titular):\n1. Relembrar a meta de sucesso combinada.\n2. Mostrar os números do trial contra a meta (relatório).\n3. Perguntar: \"O que mudou para a equipe e para o cidadão?\"\n4. Pedir a decisão: \"Faz sentido seguirmos? A proposta que mandei fica em [valor]/mês e nada precisa ser desligado.\"\n5. Se houver dúvida, combinar o que falta e a data da resposta (até o 14º dia).",
  },
  {
    titulo: "Trial D14 · decisão",
    texto: "[Nome], hoje fecha o trial de 14 dias. Como combinamos, os números foram: [resumo]. Posso seguir com o contrato para manter tudo funcionando sem interrupção?\n\n(Se a resposta for \"vou pensar\": combine a data e mude para Aguardando retorno — os 4 retornos começam. Se for \"não\": registre o motivo.)",
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
