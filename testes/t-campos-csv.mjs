// Casamento de coluna extra da planilha com campo personalizado do quadro
// (Ficha de Cliente: Origem, Termômetro, Faturamento...) e fallback pra
// descrição quando não casa. Não precisa de servidor nem banco rodando —
// só as funções puras de utils/csv.js.
import assert from 'node:assert/strict';
import {
  indexarCabecalho, colunasExtras, mapaCampos, interpretarLinha, normalizarValorCampoImport,
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

console.log('\ntudo certo — colunas do CRM casam com campo personalizado ou viram descrição.');
