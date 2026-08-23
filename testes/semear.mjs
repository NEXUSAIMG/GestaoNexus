// Popula o ambiente local com um quadro "Atividade Comercial" parecido com
// o real, para conferência visual e para os testes do layout de Cliente.
import { login, post, get, put, equipeDeTeste } from './api.mjs';

await login();
const equipe_id = await equipeDeTeste('Comercial');

const lista = await get('/quadros');
let quadro = (lista.dados || []).find((q) => q.nome === 'Atividade Comercial');
if (!quadro) {
  quadro = (await post('/quadros', {
    equipe_id, nome: 'Atividade Comercial',
    descricao: 'Funil comercial — cards com a etiqueta Cliente mostram a ficha completa.',
  })).dados;
  console.log('quadro criado:', quadro.id);
} else {
  console.log('quadro já existe:', quadro.id);
}

const q = (await get('/quadros/' + quadro.id)).dados;
const col = Object.fromEntries(q.colunas.map((c) => [c.nome, c.id]));
const etq = Object.fromEntries(q.etiquetas.map((e) => [e.nome, e.id]));

// Campos de Cliente — todos digitáveis, conforme pedido.
const CAMPOS = [
  'Origem', 'Termômetro', 'Cidade/UF', 'Representante/Oficial',
  'Competência', 'Site', 'E-mail', 'Telefone/WhatsApp', 'Faturamento',
];
const existentes = new Set((q.campos || []).map((c) => c.nome));
for (const nome of CAMPOS) {
  if (existentes.has(nome)) continue;
  const r = await post(`/quadros/${quadro.id}/campos`, {
    nome, tipo: 'texto', opcoes: null, mostrar_no_card: true,
  });
  if (r.status !== 201) console.log('  falhou', nome, JSON.stringify(r.dados));
}

const q2 = (await get('/quadros/' + quadro.id)).dados;
const campoId = Object.fromEntries(q2.campos.map((c) => [c.nome, c.id]));

const CLIENTES = [
  {
    titulo: '1º Tabelionato de Jaraguá do Sul', coluna: 'Em andamento',
    valores: {
      'Origem': 'Indicação', 'Termômetro': 'Quente', 'Cidade/UF': 'Jaraguá do Sul/SC',
      'Representante/Oficial': 'Dra. Helena Prado', 'Competência': '08/2026',
      'Site': 'https://1tabelionatojs.com.br', 'E-mail': 'contato@1tabelionatojs.com.br',
      'Telefone/WhatsApp': '(47) 99123-4567', 'Faturamento': 'R$ 18.400,00',
    },
  },
  {
    titulo: 'Cartório Central de Blumenau', coluna: 'A fazer',
    valores: {
      'Origem': 'Evento ANOREG', 'Termômetro': 'Morno', 'Cidade/UF': 'Blumenau/SC',
      'Representante/Oficial': 'Dr. Ricardo Amaral', 'Competência': '09/2026',
      'Site': 'https://cartoriocentralbnu.com.br', 'E-mail': 'ricardo@cartoriocentralbnu.com.br',
      'Telefone/WhatsApp': '(47) 98877-1200', 'Faturamento': 'R$ 7.900,00',
    },
  },
  {
    titulo: '2º Registro de Imóveis de Joinville', coluna: 'Concluído',
    valores: {
      'Origem': 'Inbound (site)', 'Termômetro': 'Frio', 'Cidade/UF': 'Joinville/SC',
      'Representante/Oficial': 'Dra. Marina Coelho', 'Competência': '07/2026',
      'Site': 'https://2ri-joinville.com.br', 'E-mail': 'marina@2ri-joinville.com.br',
      'Telefone/WhatsApp': '(47) 3422-8890', 'Faturamento': 'R$ 31.250,00',
    },
  },
];

const jaTem = new Set(q2.cards.map((c) => c.titulo));
const eu = (await get('/pessoas')).dados[0];

for (const cli of CLIENTES) {
  if (jaTem.has(cli.titulo)) { console.log('  card já existe:', cli.titulo); continue; }
  const card = (await post('/cards', {
    coluna_id: col[cli.coluna],
    titulo: cli.titulo,
    etiqueta_ids: [etq['Cliente']],
    responsavel_ids: [eu.id],
    prioridade: 1,
  })).dados;
  for (const [nome, valor] of Object.entries(cli.valores)) {
    if (!campoId[nome]) continue;
    await put(`/cards/${card.id}/campos/${campoId[nome]}`, { valor });
  }
  console.log('  card de cliente:', cli.titulo);
}

// Cards comuns (sem a etiqueta Cliente) para comparar o layout lado a lado.
const COMUNS = [
  { titulo: 'Revisar proposta comercial padrão', coluna: 'A fazer', etq: 'Melhoria' },
  { titulo: 'Corrigir cálculo de comissão', coluna: 'Em andamento', etq: 'Bug' },
  { titulo: 'Preparar apresentação da ANOREG', coluna: 'A fazer', etq: 'Urgente' },
];
for (const c of COMUNS) {
  if (jaTem.has(c.titulo)) continue;
  await post('/cards', {
    coluna_id: col[c.coluna], titulo: c.titulo, etiqueta_ids: [etq[c.etq]],
  });
  console.log('  card comum:', c.titulo);
}

console.log('\nquadro:', `http://localhost:3001/tarefas/${quadro.id}`);
