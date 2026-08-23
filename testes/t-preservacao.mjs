// Importar para um quadro EM USO não pode mexer no que já está lá.
import { login, post, get, put, equipeDeTeste, ok, titulo } from './api.mjs';

const BASE = 'http://localhost:3001/api';
const { token } = await login();
const equipe_id = await equipeDeTeste();

async function enviarCsv(rota, csv, campos) {
  const form = new FormData();
  form.append('arquivo', new Blob([csv], { type: 'text/csv' }), 'x.csv');
  for (const [k, v] of Object.entries(campos)) form.append(k, String(v));
  const r = await fetch(BASE + rota, {
    method: 'POST', headers: { Authorization: `Bearer ${token}` }, body: form,
  });
  return { status: r.status, dados: await r.json().catch(() => null) };
}

titulo('Quadro em uso, com etiquetas e cards já existentes');
const q = (await post('/quadros', { equipe_id, nome: 'Quadro em uso ' + Date.now() })).dados;
const antes = (await get('/quadros/' + q.id)).dados;
const etqBug = antes.etiquetas.find((e) => e.nome === 'Bug');
const etqCliente = antes.etiquetas.find((e) => e.nome === 'Cliente');
const colA = antes.colunas.find((c) => c.tipo === 'backlog');

// Um card de verdade, com etiqueta e responsável, como os de produção.
const eu = (await get('/pessoas')).dados[0];
const cardExistente = (await post('/cards', {
  coluna_id: colA.id,
  titulo: 'Card que já existia em produção',
  descricao: 'Descrição original que não pode sumir',
  etiqueta_ids: [etqBug.id, etqCliente.id],
  responsavel_ids: [eu.id],
  prioridade: 0,
})).dados;

console.log('   etiquetas antes:', antes.etiquetas.map((e) => `${e.nome}(${e.cor})`).join(', '));

// A planilha traz "BUG" e "cliente" — mesma etiqueta, caixa diferente.
const csv = 'Titulo,Tipo\nTarefa nova vinda da planilha,BUG\nOutra tarefa nova,cliente\n';
const r = await enviarCsv('/quadros/importar-csv', csv, { quadro_id: q.id });
ok(r.status === 201, 'import para quadro existente concluiu');

const depois = (await get('/quadros/' + q.id)).dados;
console.log('   etiquetas depois:', depois.etiquetas.map((e) => `${e.nome}(${e.cor})`).join(', '));

titulo('O que já existia continua intacto?');
const bugDepois = depois.etiquetas.find((e) => e.id === etqBug.id);
const cliDepois = depois.etiquetas.find((e) => e.id === etqCliente.id);
ok(bugDepois?.nome === 'Bug', `etiqueta "Bug" manteve o nome — veio "${bugDepois?.nome}"`);
ok(cliDepois?.nome === 'Cliente', `etiqueta "Cliente" manteve o nome — veio "${cliDepois?.nome}"`);
ok(bugDepois?.cor === etqBug.cor, `etiqueta "Bug" manteve a cor (${etqBug.cor}) — veio "${bugDepois?.cor}"`);
ok(cliDepois?.cor === etqCliente.cor, `etiqueta "Cliente" manteve a cor (${etqCliente.cor})`);
ok(depois.etiquetas.length === antes.etiquetas.length,
  `não criou etiqueta duplicada: ${antes.etiquetas.length} antes, ${depois.etiquetas.length} depois`);

const cardDepois = depois.cards.find((c) => c.id === cardExistente.id);
ok(!!cardDepois, 'o card que já existia continua no quadro');
ok(cardDepois?.titulo === 'Card que já existia em produção', 'título intacto');
ok(cardDepois?.descricao === 'Descrição original que não pode sumir', 'descrição intacta');
ok((cardDepois?.etiqueta_ids || []).length === 2, 'etiquetas do card intactas');
ok((cardDepois?.responsaveis || []).length === 1, 'responsável do card intacto');
ok(Number(cardDepois?.prioridade) === 0, 'prioridade intacta');
ok(cardDepois?.coluna_id === colA.id, 'continua na mesma coluna');

const novos = depois.cards.filter((c) => c.id !== cardExistente.id);
ok(novos.length === 2, 'os 2 cards da planilha entraram');
ok(novos.every((c) => (c.etiqueta_ids || []).length === 1), 'cards novos reaproveitaram as etiquetas existentes');

titulo('Etiqueta com caixa diferente na planilha não renomeia a existente');
const q2 = (await post('/quadros', { equipe_id, nome: 'Caixa etiqueta ' + Date.now() })).dados;
const csv2 = 'Titulo,Tipo\nCard A,URGENTE\nCard B,melhoria\n';
await enviarCsv('/quadros/importar-csv', csv2, { quadro_id: q2.id });
const d2 = (await get('/quadros/' + q2.id)).dados;
const nomes = d2.etiquetas.map((e) => e.nome).sort();
console.log('   etiquetas:', nomes.join(', '));
ok(nomes.includes('Urgente') && !nomes.includes('URGENTE'), '"URGENTE" reaproveitou "Urgente" sem renomear');
ok(nomes.includes('Melhoria') && !nomes.includes('melhoria'), '"melhoria" reaproveitou "Melhoria" sem renomear');
ok(d2.etiquetas.length === 4, 'continua com as 4 etiquetas padrão, sem duplicata');

titulo('Remover opção de "seleção" em uso é recusado, não apaga o valor');
const q3 = (await post('/quadros', { equipe_id, nome: 'Campo selecao ' + Date.now() })).dados;
const campo = (await post(`/quadros/${q3.id}/campos`, {
  nome: 'Termômetro', tipo: 'selecao', opcoes: ['Frio', 'Morno', 'Quente'], mostrar_no_card: true,
})).dados;
const f3 = (await get('/quadros/' + q3.id)).dados;
const card3 = (await post('/cards', { coluna_id: f3.colunas[0].id, titulo: 'Lead quente' })).dados;
await put(`/cards/${card3.id}/campos/${campo.id}`, { valor: 'Quente' });

const tentativa = await put(`/quadros/${q3.id}/campos/${campo.id}`, {
  nome: 'Termômetro', opcoes: ['Frio', 'Morno'],
});
console.log('   →', tentativa.status, tentativa.dados?.erro);
ok(tentativa.status === 409, 'recusa remover a opção em uso');
ok(/Quente/.test(tentativa.dados?.erro || ''), 'diz qual opção e quantos cards dependem dela');

const conferir = (await get('/quadros/' + q3.id)).dados;
const c3 = conferir.cards.find((c) => c.id === card3.id);
ok(c3.campos[campo.id] === 'Quente', 'o valor gravado no card continua lá');
ok((conferir.campos.find((c) => c.id === campo.id).opcoes || []).length === 3,
  'as opções do campo não foram alteradas');

titulo('Renomear e mexer no que NÃO está em uso continua liberado');
const ok2 = await put(`/quadros/${q3.id}/campos/${campo.id}`, {
  nome: 'Temperatura', opcoes: ['Frio', 'Morno', 'Quente', 'Fervendo'],
});
ok(ok2.status === 200, 'renomear o campo e acrescentar opção funciona');
const conf2 = (await get('/quadros/' + q3.id)).dados;
ok(conf2.campos.find((c) => c.id === campo.id).nome === 'Temperatura', 'nome novo gravado');
ok(conf2.cards.find((c) => c.id === card3.id).campos[campo.id] === 'Quente',
  'e o valor do card sobreviveu ao rename');
