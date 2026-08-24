// Arquivar deixa de ser caminho sem volta.
import { login, post, get, put, equipeDeTeste, ok, titulo } from './api.mjs';

await login();
const equipe_id = await equipeDeTeste();

const q = (await post('/quadros', { equipe_id, nome: 'Quadro arquivados ' + Date.now() })).dados;
const cA = (await post(`/quadros/${q.id}/colunas`, { nome: 'A fazer', tipo: 'backlog' })).dados;
const cB = (await post(`/quadros/${q.id}/colunas`, { nome: 'Coluna com nome errrado' })).dados;
const card = (await post('/cards', { coluna_id: cA.id, titulo: 'Card para arquivar' })).dados;

titulo('Renomear coluna (o backend sempre aceitou; faltava botão)');
const ren = await put(`/colunas/${cB.id}`, { nome: 'Coluna com nome certo' });
ok(ren.status === 200, 'PUT /colunas/:id aceita renomear');
const qr = (await get('/quadros/' + q.id)).dados;
ok(qr.colunas.some((c) => c.nome === 'Coluna com nome certo'), 'nome novo aparece no quadro');

titulo('Arquivar e restaurar card');
await post(`/cards/${card.id}/arquivar`);
let arq = (await get(`/quadros/${q.id}/arquivados`)).dados;
ok(arq.cards.length === 1 && arq.cards[0].id === card.id, 'card arquivado aparece na gaveta');
ok(arq.cards[0].coluna_nome === 'A fazer', 'a gaveta diz de qual coluna ele saiu');

const volta = await post(`/cards/${card.id}/desarquivar`);
ok(volta.status === 200, 'card restaurado');
const q2 = (await get('/quadros/' + q.id)).dados;
ok(q2.cards.some((c) => c.id === card.id), 'card voltou para o board');
ok(q2.cards.find((c) => c.id === card.id).coluna_id === cA.id, 'voltou para a coluna de origem');

titulo('Restaurar card cuja coluna foi arquivada no meio tempo');
await post(`/cards/${card.id}/arquivar`);
await post(`/colunas/${cA.id}/arquivar`);
const volta2 = await post(`/cards/${card.id}/desarquivar`);
ok(volta2.status === 200, 'restaura mesmo com a coluna de origem arquivada');
ok(volta2.dados.coluna_trocada === true, 'e avisa que o card foi para outra coluna');
const q4 = (await get('/quadros/' + q.id)).dados;
const primeiraAtiva = q4.colunas.sort((a, b) => a.ordem - b.ordem)[0];
ok(volta2.dados.coluna_id === primeiraAtiva.id,
  'foi para a primeira coluna ativa do quadro: ' + primeiraAtiva.nome);

titulo('Arquivar e restaurar coluna');
arq = (await get(`/quadros/${q.id}/arquivados`)).dados;
ok(arq.colunas.some((c) => c.id === cA.id), 'coluna arquivada aparece na gaveta');

const voltaCol = await post(`/colunas/${cA.id}/desarquivar`);
ok(voltaCol.status === 200, 'coluna restaurada');
const q3 = (await get('/quadros/' + q.id)).dados;
ok(q3.colunas.some((c) => c.id === cA.id), 'coluna voltou para o board');

titulo('Casos de borda');
const jaAtiva = await post(`/colunas/${cA.id}/desarquivar`);
ok(jaAtiva.status === 400, 'desarquivar coluna que não está arquivada devolve 400, não 500');
const inexistente = await post('/cards/00000000-0000-0000-0000-000000000000/desarquivar');
ok(inexistente.status === 404, 'card inexistente devolve 404');
