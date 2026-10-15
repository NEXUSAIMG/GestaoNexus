/**
 * Sprint 43 — Lista inicial do "Plano comercial B2B para escolas de Belém"
 * (seção 5). Coletada em diretórios públicos (escol.as/Censo Escolar-INEP,
 * Melhor Escola, Imóvel Guide, Lista Tudo, SEDUC) em 15/10/2026 e NÃO
 * confirmada por ligação. Telefone ausente = "buscar" no plano.
 * A nota (0 a 10) é a preliminar do plano: revisar depois do diagnóstico.
 */
export const FONTE_LISTA = 'Plano comercial AdaptAI (diretórios públicos, 15/10/2026) — confirmar por telefone';

export const LISTA_BELEM = [
  // NAZARÉ
  { nome: 'Colégio Marista Nossa Senhora de Nazaré', tipo: 'particular_grande', etapas: 'Rede privada marista', bairro: 'Nazaré', endereco: 'Av. Nazaré, 902', telefone: '(91) 4008-7444', pontos: 10 },
  { nome: 'Colégio Moderno', tipo: 'particular_grande', etapas: 'Etapas a confirmar', bairro: 'Nazaré', endereco: 'Tv. Quintino Bocaiúva, 1808', pontos: 8 },
  { nome: 'Colégio Integrado Belém', tipo: 'particular_grande', etapas: 'Etapas a confirmar', bairro: 'Nazaré', endereco: 'Av. Gov. José Malcher, 1332', telefone: '(91) 98018-1849', pontos: 8 },
  { nome: 'Escola Estadual Prof. Orlando Bitar', tipo: 'publica_estadual', etapas: 'Ensino público estadual', bairro: 'Nazaré', endereco: 'Av. Visconde de Souza Franco (entre Gov. José Malcher e Rua João Balbi)', telefone: 'SEDUC (91) 3201-5162', pontos: 7 },
  { nome: 'Escola Estadual Dr. Ulysses Guimarães', tipo: 'publica_estadual', etapas: 'Ensino Médio; estrutura completa', bairro: 'Nazaré', endereco: 'Av. Gov. José Malcher, 1670', telefone: 'SEDUC (91) 3201-5162', pontos: 7 },
  { nome: 'Centro Educacional Tecnológico da Amazônia', tipo: 'particular_grande', etapas: 'Etapas a confirmar', bairro: 'Nazaré', endereco: 'Av. Gov. José Malcher, 1255 (próx. SEMEC)', pontos: 7 },
  { nome: 'Hotel Escola Montessori Casa da Criança', tipo: 'particular_pequena', etapas: 'Educação infantil; método Montessori', bairro: 'Nazaré', endereco: 'Tv. 14 de Março, 1778', pontos: 7 },
  { nome: 'Sistema de Ensino Equipe Integrado', tipo: 'particular_grande', etapas: 'Etapas a confirmar', bairro: 'Nazaré', endereco: 'Av. Gentil Bittencourt, 827', pontos: 6 },
  { nome: 'Centro de Educação Infantil Anjinho Aprendiz', tipo: 'particular_pequena', etapas: 'Educação infantil', bairro: 'Nazaré', endereco: 'Av. Alcindo Cacela, 2176', pontos: 6 },
  // BATISTA CAMPOS
  { nome: 'Colégio Santa Rosa', tipo: 'filantropica', etapas: 'Creche ao Ensino Médio; filantrópico', bairro: 'Batista Campos', endereco: 'Tv. Padre Eutíquio, 1549', pontos: 9 },
  { nome: 'Centro de Ensino Técnico Ideal', tipo: 'particular_grande', etapas: 'Pré-escola, Fundamental e Médio', bairro: 'Batista Campos', endereco: 'Rua dos Mundurucus, 1412', pontos: 8 },
  { nome: 'Escola Nossa Sra. do Perpétuo Socorro', tipo: 'particular_grande', etapas: 'Etapas a confirmar', bairro: 'Batista Campos', endereco: 'Av. Serzedelo Corrêa, 853', telefone: '(91) 3225-1976 (fonte secundária)', pontos: 8 },
  { nome: 'Sistema de Ensino Equipe (Ensino Médio)', tipo: 'particular_grande', etapas: 'Ensino Médio', bairro: 'Batista Campos', endereco: 'Av. Gentil Bittencourt, 706', telefone: '(91) 3241-3083', pontos: 7 },
  { nome: 'Centro Educacional Corujinha', tipo: 'particular_pequena', etapas: 'Etapas a confirmar', bairro: 'Batista Campos', endereco: 'Tv. Tupinambás, 692', pontos: 6 },
  { nome: 'O Mundo da Abelhinha', tipo: 'particular_pequena', etapas: 'Etapas a confirmar', bairro: 'Batista Campos', endereco: 'Av. Padre Eutíquio, 2140', pontos: 6 },
  // UMARIZAL
  { nome: 'Centro Integrado Primeiros Passos', tipo: 'particular_grande', etapas: 'Pré-escola, Fundamental e Médio', bairro: 'Umarizal', endereco: 'Rua Ferreira Pena, 155 (em frente ao Líder)', telefone: '(91) 3241-6793', email: 'cipp@oi.com.br', pontos: 9 },
  { nome: 'Escola de Educação Bilíngue Step By Step', tipo: 'particular_pequena', etapas: 'Creche, pré-escola e Fundamental I; bilíngue', bairro: 'Umarizal', endereco: 'Rua Diogo Moia, 1031', telefone: '(91) 3241-1022', pontos: 9 },
  { nome: 'Centro Educacional Olimpus', tipo: 'particular_grande', etapas: 'Ensino Fundamental', bairro: 'Umarizal', endereco: 'Av. Alcindo Cacela, 675', telefone: '(91) 3246-4446', pontos: 8 },
  { nome: 'Centro Espírita Osvaldo Santos', tipo: 'filantropica', etapas: 'Creche e pré-escola; filantrópico', bairro: 'Umarizal', endereco: 'Rua Diogo Moia, 1668', telefone: '(91) 98351-1258', email: 'centroespiritaosvaldosantos@yahoo.com.br', pontos: 7 },
  { nome: 'Physics Umarizal', tipo: 'particular_grande', etapas: 'Perfil a confirmar', bairro: 'Umarizal', endereco: 'Rua Domingos Marreiros, 941', telefone: '(91) 3228-3116', pontos: 6 },
  // CAMPINA / REDUTO
  { nome: 'Colégio Santo Antônio', tipo: 'particular_grande', etapas: 'Educação infantil e Fundamental', bairro: 'Campina', endereco: 'Av. Assis de Vasconcelos, CEP 66010-010', telefone: '(91) 3366-6262', email: 'csanto@csanto.com.br', pontos: 10 },
  // PEDREIRA
  { nome: 'Centro de Estudos Jean Piaget', tipo: 'particular_pequena', etapas: 'Etapas a confirmar', bairro: 'Pedreira', endereco: 'Tv. Mariz e Barros, 1226', pontos: 5 },
  { nome: 'Colégio Sucesso', tipo: 'particular_grande', etapas: 'Ensino Médio', bairro: 'Pedreira', endereco: 'Av. Pedro Miranda, 1984', pontos: 5 },
  { nome: 'Centro de Serviços Educacionais do Pará', tipo: 'particular_grande', etapas: 'Ensino Médio', bairro: 'Pedreira', endereco: 'Av. Pedro Miranda, 100', pontos: 5 },
  // SOUZA
  { nome: 'Centro Educacional Heureca', tipo: 'particular_pequena', etapas: 'Etapas a confirmar', bairro: 'Souza', endereco: 'Av. Pedro Álvares Cabral, 137', pontos: 5 },
  // PARQUE VERDE / AUGUSTO MONTENEGRO
  { nome: 'Colégio Pequeno Príncipe Avante', tipo: 'particular_grande', etapas: 'Etapas a confirmar', bairro: 'Parque Verde', endereco: 'Rod. Augusto Montenegro, 3649 (km 07)', pontos: 6 },
  { nome: 'Centro de Educação União Perfect', tipo: 'particular_pequena', etapas: 'Etapas a confirmar', bairro: 'Parque Verde', endereco: 'Rod. Augusto Montenegro, 50, Cj. Benjamin Sodré', pontos: 5 },
  // ÁGUAS LINDAS
  { nome: 'Centro Educacional Paradigma', tipo: 'particular_pequena', etapas: 'Etapas a confirmar', bairro: 'Águas Lindas', endereco: 'Rua Osvaldo Cruz, 07, Cj. Verdejante', pontos: 5 },
  // TERRA FIRME
  { nome: 'Escola Municipal Parque Amazônia', tipo: 'publica_municipal', etapas: 'Ensino Fundamental', bairro: 'Terra Firme', endereco: 'Av. Celso Malcher, 445', telefone: 'SEMEC (91) 3075-5401 / 3075-5439', pontos: 7 },
  { nome: 'Escola Infantil Primeiro Passos', tipo: 'particular_pequena', etapas: 'Educação infantil', bairro: 'Terra Firme', endereco: 'Rua Universal, 11, Quadra G', pontos: 5 },
  // TAPANÃ (ICOARACI)
  { nome: 'Sistema de Ensino Integrado Essencial', tipo: 'particular_pequena', etapas: 'Pré-escola e Fundamental', bairro: 'Tapanã', endereco: 'Quadra A-1, 95, Rua São Clemente, CEP 66825-253', telefone: '(91) 98989-3588', email: 'escolaessencial@r7.com', pontos: 7 },
  // REDES PÚBLICAS
  { nome: 'SEMEC — Secretaria Municipal de Educação (Educação Especial)', tipo: 'rede_publica', etapas: 'Gabinete / Educação Especial', bairro: null, endereco: 'Endereço a confirmar (Av. Gov. José Malcher e região)', telefone: '(91) 3075-5401 / 3075-5439', email: 'gabs@semec.pmb.pa.gov.br', pontos: null },
  { nome: 'SEDUC-PA — Secretaria de Estado de Educação (Educação Especial)', tipo: 'rede_publica', etapas: 'Educação Especial / regionais', bairro: null, endereco: 'Endereço a confirmar', telefone: '(91) 3201-5162', email: 'comunicacao2@seduc.pa.gov.br', pontos: null },
  { nome: 'CAEE de Belém (Centro de Atendimento Educacional Especializado)', tipo: 'rede_publica', etapas: 'Código INEP 15177254', bairro: null, endereco: 'Localizar endereço na lista SEDUC/INEP', pontos: null },
];

/** Bairros sugeridos para completar até 40 (seção 8 do plano). */
export const VAGAS_A_COMPLETAR = ['Marco', 'São Braz', 'Cremação', 'Guamá', 'Cidade Velha', 'Marambaia / Mangueirão'];
