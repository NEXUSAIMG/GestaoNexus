// Casamento de coluna extra da planilha com campo personalizado do quadro
// (Ficha de Cliente: Origem, Termômetro, Faturamento...) e fallback pra
// descrição quando não casa. Não precisa de servidor nem banco rodando —
// só as funções puras de utils/csv.js.
import assert from 'node:assert/strict';
import {
  indexarCabecalho, colunasExtras, mapaCampos, interpretarLinha, normalizarValorCampoImport,
  ordenarPorTermometro,
} from '../backend/src/utils/csv.js';

function ok(cond, msg) {
  assert.ok(cond, msg);
  console.log('  OK -', msg);
}

// Cabeçalho real do relato: cadastro de cartórios com colunas comerciais.
const cabecalho = [
  'Nome', 'Responsável', 'Status Atual', 'Origem', 'Termometro', 'Observações',
  'Cidade', 'UF', 'Site', 'E-mail', 'Telefone / WhatsApp', 'Faturamento',
];
const col = indexarCabecalho(cabecalho);
ok(col.titulo === 0, '"Nome" reconhecido como título');
ok(col.responsavel === 1, '"Responsável" reconhecido');
ok(col.coluna === 2, '"Status Atual" agora casa com a coluna do quadro (antes só "Status")');

const extras = colunasExtras(cabecalho, col);
ok(extras.length === 9, 'sobram 9 colunas fora dos campos fixos do card: ' + extras.map((e) => e.nome).join(', '));

// Quadro comercial já tem os campos da Ficha de Cliente cadastrados.
const camposDoQuadro = [
  { id: 'c-origem', nome: 'Origem', tipo: 'texto' },
  { id: 'c-term', nome: 'Termômetro', tipo: 'selecao', opcoes: ['Quente', 'Morno', 'Frio'] },
  { id: 'c-site', nome: 'Site', tipo: 'url' },
  { id: 'c-fat', nome: 'Faturamento', tipo: 'moeda' },
  { id: 'c-tel', nome: 'Telefone/WhatsApp', tipo: 'texto' }, // sem espaço em volta da barra
];
const camposPorChave = mapaCampos(camposDoQuadro);

const linha = [
  'Cartório do 3º Ofício de Notas de Belém', 'Ana', 'Reunião de apresentação',
  'Indicação', 'quente', 'Cliente antigo, já usou concorrente',
  'Belém', 'PA', 'exemplo.com.br', 'ana@exemplo.com.br', '(91) 99999-0000', '5000',
];
const item = interpretarLinha(linha, col, extras, camposPorChave);

ok(item.campos_valores['c-origem'] === 'Indicação', 'Origem foi pro campo personalizado');
ok(item.campos_valores['c-term'] === 'Quente', 'Termômetro casou por texto, normalizado pra opção cadastrada');
ok(item.campos_valores['c-site'] === 'https://exemplo.com.br', 'Site ganhou https:// e foi pro campo');
ok(item.campos_valores['c-fat'] === 5000, 'Faturamento convertido pra número');
ok(item.campos_valores['c-tel'] === '(91) 99999-0000',
  '"Telefone / WhatsApp" (planilha) casou com "Telefone/WhatsApp" (campo) apesar do espaço');

ok(item.descricao.includes('Observações: Cliente antigo, já usou concorrente'),
  'coluna sem campo correspondente (Observações) foi pra descrição, não sumiu');
ok(item.descricao.includes('Cidade: Belém') && item.descricao.includes('UF: PA'),
  'Cidade/UF sem campo composto casado também foram pra descrição');
ok(item.extras_na_descricao.includes('Observações'), 'prévia consegue listar o que foi pra descrição');

// Campo malformado não trava o import: cai pra descrição em vez de lançar.
ok(normalizarValorCampoImport({ tipo: 'moeda' }, 'não é número') === null,
  'valor de moeda ilegível devolve null (vira texto na descrição) em vez de quebrar');
ok(normalizarValorCampoImport({ tipo: 'selecao', opcoes: ['A', 'B'] }, 'C') === null,
  'opção de seleção fora da lista devolve null');

// Termômetro: sem coluna de Prioridade na planilha, "quente" empurra a
// prioridade do card pra Alta (1) — planilha não tem Prioridade nesse teste.
ok(item.termometro === 'quente', 'valor bruto do termômetro capturado pra ordenação/prioridade');
ok(item.prioridade === 1, 'termômetro "quente" sem coluna de Prioridade virou prioridade Alta (1)');

console.log('\ntudo certo — colunas do CRM casam com campo personalizado ou viram descrição.');

// ---------------------------------------------------------------------------
// Ordenação por Termômetro: quente > médio/morno > frio > sem termômetro
// reconhecido (que mantém a ordem original — "tratamento especial" é só
// pra quem tem o campo preenchido).
const fila = [
  { titulo: 'Frio 1', termometro: 'Frio' },
  { titulo: 'Sem termômetro 1', termometro: null },
  { titulo: 'Quente 1', termometro: 'Quente' },
  { titulo: 'Médio 1', termometro: 'Médio' },
  { titulo: 'Quente 2', termometro: 'quente' }, // caixa diferente, mesma chave
  { titulo: 'Morno 1', termometro: 'Morno' }, // sinônimo de Médio
  { titulo: 'Sem termômetro 2', termometro: '' },
  { titulo: 'Texto desconhecido', termometro: 'Abandonado' },
];
const ordenada = ordenarPorTermometro(fila).map((i) => i.titulo);
ok(
  ordenada.slice(0, 2).join(',') === 'Quente 1,Quente 2',
  'os dois "quente" (caixa diferente) vêm primeiro, na ordem que já vinham: ' + ordenada.join(' | '),
);
ok(
  ordenada.slice(2, 4).join(',') === 'Médio 1,Morno 1',
  '"médio" e o sinônimo "morno" vêm em seguida: ' + ordenada.join(' | '),
);
ok(ordenada[4] === 'Frio 1', '"frio" vem depois de médio/morno');
ok(
  ordenada.slice(5).join(',') === 'Sem termômetro 1,Sem termômetro 2,Texto desconhecido',
  'sem termômetro reconhecido mantém a ordem original que já tinha, por último: ' + ordenada.join(' | '),
);

console.log('\ntudo certo — quente/médio/frio ordenam o funil, o resto mantém a ordem que já tinha.');
