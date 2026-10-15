/**
 * Sprint 43 — Conteúdo do método AdaptAI (fonte: "Método de vendas para
 * escolas — apresentação à diretoria" e "Plano comercial B2B para escolas de
 * Belém", out/2026). Textos para a equipe consultar dentro do Nexus.
 */

export const RESUMO = {
  frase: 'Vender a solução de uma dor que a lei já cobra das escolas. Vender inclusão, não software.',
  pergunta: 'Quanto tempo seus professores levam para adaptar uma atividade para um aluno com TEA?',
  itens: [
    ['Dor', 'Professores e equipes de AEE gastam horas adaptando atividades para estudantes com TEA.'],
    ['Lacuna', 'A lei diz o quê a escola deve garantir, mas não ensina como, com 1 professor para uma turma inteira.'],
    ['Caminho', 'Entrar pelo AEE ou pela coordenação, provar valor numa oficina de 30 min e levar o resultado à diretoria.'],
    ['Prova', 'Piloto de 30 dias com métricas combinadas antes (tempo por adaptação, uso semanal, satisfação).'],
    ['Escolas públicas', 'Projeto pedagógico via coordenação de Educação Especial, com ciclo longo; não é venda rápida.'],
  ],
};

export const PILARES = [
  ['Dor clara', 'Horas gastas adaptando atividades; falta de padrão entre professores; sobrecarga do AEE.', 'Horas por semana por professor (diagnóstico)'],
  ['Decisor e influenciadores', 'Particular: diretor ou mantenedor decide, coordenação e AEE influenciam. Pública: secretaria, coordenação de Educação Especial e gestão escolar.', 'Decisores mapeados por escola'],
  ['Prova de valor', 'Atividade real da própria escola adaptada ao vivo; piloto curto; depoimentos.', 'Demos realizadas; pilotos iniciados'],
  ['Processo estruturado', 'Etapas claras e próximo passo sempre com data.', 'Conversão por etapa'],
  ['Confiança', 'Linguagem pedagógica, não de tecnologia. Respeito ao sigilo dos dados dos alunos (LGPD).', 'Indicações e renovações'],
  ['Gestão por indicadores', 'Revisão semanal de funil, motivos de ganho e perda.', 'Painel semanal (sexta)'],
];

export const LEIS = [
  ['Lei 12.764/2012 (Berenice Piana)', 'Pessoa com TEA é pessoa com deficiência; prevê acompanhante especializado quando necessário e sanção a gestor que recusa matrícula.'],
  ['Lei 13.146/2015 (LBI)', 'Adaptações razoáveis, plano de AEE e proibição de cobrar a mais por isso. Na escola particular, o custo da adaptação é da escola.'],
  ['LDB 9.394/96 e Decreto 7.611/2011', 'Atendimento educacional especializado como dever do sistema de ensino.'],
  ['LGPD 13.709/2018', 'Dados de crianças e de saúde são sensíveis; exige cuidado no produto e na venda.'],
];

export const CAMINHOS = [
  ['Aliado interno', 'Oficina de 30 min com AEE ou coordenação; depois: "Posso mostrar o resultado à direção?"'],
  ['Indicação', 'Clínicas, terapeutas e associações de pais; famílias pressionam as escolas e a indicação abre porta.'],
  ['Visita curta', '5 min na recepção; deixar o one-pager; perguntar "quem coordena a inclusão?" em vez de pedir o diretor.'],
  ['WhatsApp pós-visita', 'Uma só pergunta sobre o tempo de adaptação; mensagens curtas em texto.'],
  ['Rede pública', 'Ofício e reunião técnica com a coordenação de Educação Especial; propor piloto, não compra.'],
];

export const JORNADA = [
  { n: 'Diagnóstico', t: '20 min', com: 'AEE ou coordenação', o: 'Contexto, processo atual, dor, histórico, quem decide e o que seria sucesso em 3 meses. Resumir em 3 linhas e pedir confirmação.' },
  { n: 'Oficina ou demo', t: '30 min', com: 'Professores', o: 'O professor traz uma atividade real e vê a adaptação feita na hora, comparando o tempo antes e depois.' },
  { n: 'Direção', t: '20 min', com: 'Resultado + piloto', o: 'Mostrar o resultado da escola, a lei como contexto e propor o piloto de 30 dias.' },
  { n: 'Proposta', t: 'Sob medida', com: 'Após diagnóstico', o: 'Escopo, licenças, formação, suporte, preço, LGPD, métricas e renovação.' },
];

export const SLIDES = [
  ['A pergunta da dor', 'Fazer a direção falar do problema antes de ouvir a solução.'],
  ['O que a lei pede da escola', 'Dar contexto institucional sem pressão.'],
  ['Onde o professor perde tempo', 'Mostrar o custo em horas.'],
  ['Demonstração com atividade da própria escola', 'Prova de valor concreta.'],
  ['Piloto de 30 dias e próxima data', 'Transformar interesse em compromisso.'],
];

export const OFICINA = [
  ['0–5 min', 'Acolhimento e pergunta de abertura: "Quanto tempo você leva para adaptar uma atividade?"'],
  ['5–12 min', 'Princípios de adaptação para TEA (clareza visual, previsibilidade, apoio de imagens, divisão em passos), em linguagem pedagógica.'],
  ['12–25 min', 'Prática: o professor traz uma atividade real e vê a adaptação feita com o AdaptAI.'],
  ['25–30 min', 'Comparar tempo antes e depois; combinar o próximo passo (piloto) com data.'],
];

export const DEMO = [
  ['Antes', 'Peça uma atividade real da escola (sem dados de alunos) e prepare a adaptação.'],
  ['0–5 min', 'Recapitule o diagnóstico com as palavras do cliente.'],
  ['5–18 min', 'Demo ao vivo com a atividade dele.'],
  ['18–24 min', 'Como cabe na rotina do AEE e da sala regular; privacidade e LGPD; suporte e formação.'],
  ['24–30 min', 'Proposta de piloto e data do próximo encontro.'],
];

export const PROPOSTA_ITENS = [
  'Escopo e número de professores/licenças; plano de formação e implantação; suporte e SLA.',
  'Preço, vigência e condições de pagamento (da tabela aprovada); cláusulas de privacidade e LGPD.',
  'Métricas de acompanhamento e revisão trimestral; condições de renovação.',
];

export const OBJECOES = [
  ['"Já temos profissional de apoio"', 'O AdaptAI não substitui o apoio; ele tira do professor e do AEE o trabalho repetitivo de preparar material.'],
  ['"Não temos orçamento"', 'Proponha o piloto curto e mostre o custo do tempo atual; em públicas, procure fontes e programas de Educação Especial.'],
  ['"Preciso consultar a mantenedora/secretaria"', 'Ofereça material de 1 página e proponha reunião conjunta com a pessoa que decide.'],
  ['"E os dados dos alunos?"', 'Explique o que é coletado, onde fica armazenado e como evitar dados sensíveis (sem laudo ou identificação). Tenha o FAQ de LGPD pronto.'],
  ['"A tecnologia vai substituir o professor?"', 'Não. O professor continua revisando e decidindo; a ferramenta economiza tempo de preparo.'],
  ['"Funciona para todos os níveis de suporte?"', 'Seja honesto: é um apoio ao planejamento; o professor ajusta ao perfil de cada aluno.'],
];

export const RISCOS = [
  ['LGPD e dados de alunos', 'Nunca pedir laudos ou dados identificados na prospecção; FAQ de privacidade validado pelo jurídico.'],
  ['Promessa clínica', 'O AdaptAI apoia o planejamento; o professor valida e decide. Não prometer resultado terapêutico.'],
  ['Tom de ameaça legal', 'Usar a lei como contexto, nunca como pressão.'],
  ['Ética em contratação pública', 'Sem brindes; seguir a modalidade correta (Lei 14.133/2021) com apoio jurídico.'],
  ['Proposta sem diagnóstico', 'Não enviar valores antes de dor, decisor, prazo e orçamento qualificados.'],
];

export const BELEM = [
  'Matrícula 2027: nas particulares, posicionar inclusão como diferencial na época de visitas das famílias.',
  'Visitas pela manhã e por bairro: a chuva da tarde e o trânsito (Almirante Barroso, Augusto Montenegro, BR-316) atrapalham deslocamentos.',
  'WhatsApp é o canal principal: mensagens curtas e diretas.',
  'Referência local pesa: um piloto bem-sucedido vira depoimento para escolas parecidas.',
  'Redes públicas: iniciar agora na coordenação para entrar no planejamento do próximo ano.',
];

export const BRINDES = {
  funciona: ['Rotina visual magnética com pictogramas', 'Bloco de planejamento de adaptação', 'Checklist para a sala de recursos', 'Entregar aos professores na oficina'],
  nao: ['Caneta, ecobag e brinde genérico', 'Rede pública: sem brindes; apenas material institucional (regras de conduta do servidor)'],
};

/** Modelos de mensagem (chave = `modelo` do passo da cadência). */
export const MODELOS = {
  ligacao_recepcao: { canal: 'Ligação (recepção)', texto: 'Bom dia! Meu nome é [nome], trabalho com um apoio para professores adaptarem atividades para alunos com autismo. Com quem posso falar sobre o atendimento educacional especializado ou a coordenação pedagógica?' },
  whatsapp_aee: { canal: 'WhatsApp (AEE)', texto: 'Olá, [nome]! Sou [seu nome], da AdaptAI. Quanto tempo seus professores levam hoje para adaptar uma atividade para um aluno com TEA? Temos uma oficina gratuita de 30 min para a equipe. Posso te mostrar com uma atividade da própria escola?' },
  whatsapp_direcao: { canal: 'WhatsApp (direção)', texto: 'Olá, [nome]! Falei com a coordenação sobre inclusão. Ajudamos a reduzir o tempo de adaptação de atividades para alunos com TEA e a padronizar o trabalho entre professores. Posso levar uma demonstração de 20 minutos?' },
  email_oficina: { canal: 'E-mail', assunto: 'Oficina gratuita: adaptar atividades para alunos com TEA em minutos (30 min, com a sua equipe)', texto: 'Olá, [nome].\n\nSou [seu nome], da AdaptAI. Quanto tempo os professores da [escola] levam hoje para adaptar uma atividade para um aluno com TEA?\n\nOferecemos uma oficina gratuita de 30 minutos para a equipe: o professor traz uma atividade real e vê a adaptação feita na hora, comparando o tempo antes e depois.\n\nPodemos marcar em [data 1] ou [data 2]?\n\n[seu nome] · AdaptAI' },
  whatsapp_material: { canal: 'WhatsApp (material útil)', texto: '[Nome], separei um checklist curto, "adaptação de atividades em 5 passos", que ajuda a equipe do AEE no dia a dia. Segue em anexo, sem compromisso.' },
  ligacao_retomada: { canal: 'Ligação (retomada)', texto: '[Nome], aqui é [seu nome], da AdaptAI. Te mandei o convite da oficina de 30 minutos. Consigo levar na [escola] em [data 1] ou [data 2]: qual fica melhor para a equipe?' },
  whatsapp_exemplo: { canal: 'WhatsApp ou e-mail (exemplo)', texto: '[Nome], olha um exemplo de atividade adaptada numa escola parecida com a de vocês (com autorização e sem dados de alunos): [antes e depois]. Leva poucos minutos. Quer ver com uma atividade da [escola]?' },
  encerramento: { canal: 'Encerramento', texto: '[Nome], vou deixar o meu contato com você e retomo no próximo bimestre. Se a adaptação de atividades virar prioridade antes disso, é só me chamar. Obrigado pela atenção!' },
  secretaria_publica: { canal: 'Secretaria pública', texto: 'Gostaria de apresentar um piloto de apoio à adaptação de materiais para o AEE, com indicadores de uso e tempo economizado, para avaliação técnica da coordenação de Educação Especial.' },
};

/** Plano de 4 semanas (chaves fixas do checklist). */
export const PLANO = [
  { semana: 1, foco: 'Prospecção das 40 escolas; visitas das rotas A e B; agendar demos.', resultado: '10+ decisores; 3 a 5 demos agendadas.', itens: [
    ['p1_lista', 'Validar a lista de escolas e pontuar (meta: 10+ decisores mapeados)'],
    ['p1_telefones', 'Confirmar telefones por ligação e completar os "buscar"'],
    ['p1_rotas', 'Montar as rotas A e B'],
    ['p1_kit', 'Montar o kit: deck, roteiro de diagnóstico e de oficina'],
    ['p1_visitas', 'Visitar as escolas prioridade A'],
  ] },
  { semana: 2, foco: 'Diagnósticos, demos e oficinas; primeiros follow-ups; abrir conversa com SEMEC e SEDUC.', resultado: '3 a 5 demos feitas; 1 a 2 propostas.', itens: [
    ['p2_diagnosticos', 'Fazer os diagnósticos agendados'],
    ['p2_oficinas', 'Realizar oficinas e demos com atividade real'],
    ['p2_redes', 'Abrir conversa com SEMEC e SEDUC (Educação Especial)'],
    ['p2_followup', 'Follow-up de todas as oportunidades abertas'],
  ] },
  { semana: 3, foco: 'Propostas e pilotos; segunda rodada de contatos nas escolas sem resposta.', resultado: '1 a 2 pilotos iniciados.', itens: [
    ['p3_pilotos', 'Iniciar pilotos com critério de sucesso por escrito'],
    ['p3_propostas', 'Enviar propostas só para oportunidades qualificadas'],
    ['p3_segunda', 'Segunda rodada nas escolas sem resposta'],
  ] },
  { semana: 4, foco: 'Acompanhar pilotos; negociar; revisar funil e ajustar a abordagem.', resultado: 'Primeiros fechamentos e lições aprendidas.', itens: [
    ['p4_pilotos', 'Acompanhar pilotos e coletar depoimentos'],
    ['p4_negociar', 'Negociar e fechar'],
    ['p4_revisar', 'Revisar o funil, motivos de perda e a pontuação das escolas'],
  ] },
];

export const KIT = [
  ['kit_deck', 'Apresentação de 10 min (deck enxuto, 5 slides)', 'Direção e coordenação'],
  ['kit_onepager_direcao', 'One-pager para diretor (tempo, inclusão, segurança legal)', 'Direção/mantenedor'],
  ['kit_onepager_aee', 'One-pager para AEE e professores (como funciona em 3 passos)', 'AEE/professores'],
  ['kit_roteiros', 'Roteiro de diagnóstico e de demo', 'Equipe'],
  ['kit_checklist', 'Checklist "adaptação de atividades em 5 passos" (isca digital)', 'Todos'],
  ['kit_antes_depois', '3 exemplos antes e depois (com autorização, sem dados de alunos)', 'Todos'],
  ['kit_faq_lgpd', 'FAQ de LGPD e privacidade (validar com o jurídico)', 'Direção/secretarias'],
  ['kit_modelo_proposta', 'Modelo de proposta e de relatório de piloto', 'Decisores'],
  ['kit_depoimentos', 'Depoimentos de professores (após o primeiro piloto)', 'Todos'],
  ['kit_planilha_tempo', 'Planilha de cálculo de tempo economizado', 'Direção/secretarias'],
  ['kit_brindes', 'Brindes úteis: rotina visual com pictogramas, bloco de planejamento, checklist da sala de recursos', 'Professores (oficina)'],
];

export const DECISOES = [
  ['dec_piloto', 'Aprovar piloto gratuito de 30 dias (3 a 5 professores e 1 AEE por escola)'],
  ['dec_orcamento', 'Aprovar orçamento de materiais e brindes'],
  ['dec_juridico', 'Validação jurídica dos argumentos legais, da LGPD e do modelo de proposta'],
  ['dec_precos', 'Definir tabela de preços e condições do piloto'],
];

export const ROTINA = [
  ['Segunda · Preparação', 'Organizar a lista; pontuar; mapear decisores (10+)', 'Confirmar telefones; montar rotas A e B; revisar deck e roteiros', 'Lista pronta, decisores, rotas e agenda da semana'],
  ['Terça · Rota A (central)', 'Visitas: Nazaré, Batista Campos, Umarizal, Campina/Reduto (6 a 8 escolas)', 'Ligações e WhatsApp para quem não foi encontrado; agendar demos e oficinas', 'Dores registradas no mesmo dia; 3 a 5 demos agendadas'],
  ['Quarta · Rota B + AEE', 'Visitas: Pedreira, Souza, Marco, São Braz, Cremação, Augusto Montenegro', 'Contato com coordenações de AEE; qualificar (BANT)', 'Oportunidades qualificadas e classificadas (A, B, C)'],
  ['Quinta · Redes públicas + demos', 'SEMEC, SEDUC, CAEE e regionais: fluxo de compras, editais, calendário orçamentário', 'Demonstrações e oficinas (30 a 40 min); propostas só para qualificadas', 'Demos feitas; propostas enviadas'],
  ['Sexta · Fechamento', 'Follow-up de todas as oportunidades abertas (resumo + próximo passo com data)', 'Revisar indicadores; ganhos e perdas; agenda da semana por região', 'Painel semanal e agenda da próxima semana'],
];
export const BLOCOS_FIXOS = '08:00 (30 min) planejar o dia e confirmar visitas · 1 bloco de 2 h sem interrupção para ligações e mensagens · 17:30 (30 min) atualizar o Nexus e registrar dores.';
export const COMPLEMENTARES = [
  'Terça ou quarta: publicar 1 conteúdo sobre inclusão e TEA (post, mini-vídeo ou e-mail).',
  'Quinzenal: pedir indicações a clientes e parceiros (terapeutas, clínicas, associações).',
  'Mensal: revisar a pontuação das escolas, os motivos de perda e atualizar a lista.',
  'Trimestral: revisar calendário escolar e orçamentário (fim do ano e matrículas são janelas de compra).',
];
export const FONTES_CAPTACAO = [
  'Censo Escolar/INEP e QEdu: filtrar escolas com Sala de Recursos Multifuncionais/AEE e matrículas de educação especial.',
  'Escolas que divulgam "educação inclusiva" em site e Instagram, e escolas com Montessori, métodos ativos ou bilíngues.',
  'Clínicas, terapeutas e associações de pais: sabem quais escolas aceitam e acompanham alunos com TEA.',
  'Eventos e formações de professores (SEMEC, universidades, congressos de educação especial): ofereça a oficina.',
  'Indicação: cada cliente ou piloto concluído deve gerar 2 indicações.',
];
export const REGRA_OURO = 'Nunca peça dados de alunos com laudo na prospecção. Fale de situações e processos, não de crianças identificadas.';
