// Testes do importador do Trello.
import { login, post, equipeDeTeste, ok, titulo } from './api.mjs';

await login();
const equipe_id = await equipeDeTeste();

// ---------------------------------------------------------------------------
// Cenário 1 — board com DUAS etiquetas de mesmo nome.
// Acontece de verdade: o Trello permite etiquetas homônimas de cores
// diferentes, e etiquetas sem nome viram "(cor)" — duas sem nome e da mesma
// cor colidem no índice único idx_quadros_etiquetas_nome.
// ---------------------------------------------------------------------------
titulo('Cenário 1 — etiquetas com nome duplicado');
const boardDuplicado = {
  name: 'Board com etiqueta duplicada',
  lists: [{ id: 'l1', name: 'A fazer', pos: 1, closed: false }],
  labels: [
    { id: 'e1', name: 'Urgente', color: 'red' },
    { id: 'e2', name: 'urgente', color: 'orange' }, // mesmo nome, caixa diferente
  ],
  cards: [{ id: 'c1', name: 'Card qualquer', idList: 'l1', pos: 1, closed: false, idLabels: ['e1'] }],
  checklists: [], actions: [], members: [],
};

const r1 = await post('/quadros/importar-trello', { equipe_id, board: boardDuplicado });
console.log('   → HTTP', r1.status, JSON.stringify(r1.dados).slice(0, 160));
ok(r1.status === 201, 'importa board com etiqueta duplicada em vez de dar 500');

// ---------------------------------------------------------------------------
// Cenário 2 — board acima do limite do express.json (10 MB).
// Um export real do Trello passa disso com folga por causa de `actions`.
// ---------------------------------------------------------------------------
titulo('Cenário 2 — arquivo acima do limite de tamanho');
const encheLinguica = 'x'.repeat(1024 * 1024); // 1 MB por ação
const boardGrande = {
  name: 'Board gigante',
  lists: [{ id: 'l1', name: 'A fazer', pos: 1, closed: false }],
  labels: [],
  cards: [{ id: 'c1', name: 'Card', idList: 'l1', pos: 1, closed: false }],
  checklists: [],
  members: [],
  actions: Array.from({ length: 12 }, (_, i) => ({
    id: 'a' + i, type: 'updateCard', data: { texto: encheLinguica },
  })),
};

const r2 = await post('/quadros/importar-trello', { equipe_id, board: boardGrande });
console.log('   → HTTP', r2.status, JSON.stringify(r2.dados).slice(0, 200));
ok(r2.status !== 500, 'não devolve 500 genérico quando o arquivo é grande demais');

// ---------------------------------------------------------------------------
// Cenário 3 — responsável importado precisa aparecer no quadro.
// O board lê de cards_responsaveis; se o import gravar só em
// cards.responsavel_id, o card abre sem dono nenhum.
// ---------------------------------------------------------------------------
titulo('Cenário 3 — responsável importado aparece no board');
const boardComMembro = {
  name: 'Board com responsavel ' + Date.now(),
  lists: [{ id: 'l1', name: 'A fazer', pos: 1, closed: false }],
  labels: [],
  members: [{ id: 'm1', fullName: 'Admin Local', username: 'admin' }],
  cards: [{ id: 'c1', name: 'Card com dono', idList: 'l1', pos: 1, closed: false, idMembers: ['m1'] }],
  checklists: [], actions: [],
};

const r3 = await post('/quadros/importar-trello', { equipe_id, board: boardComMembro });
console.log('   → HTTP', r3.status, 'responsaveis contados:', r3.dados?.responsaveis);

if (r3.status === 201) {
  const { get } = await import('./api.mjs');
  const q = await get('/quadros/' + r3.dados.quadro_id);
  const card = q.dados?.cards?.[0];
  console.log('   → responsaveis no payload do board:', JSON.stringify(card?.responsaveis));
  ok(
    Array.isArray(card?.responsaveis) && card.responsaveis.length === 1,
    'o responsável importado aparece no payload do quadro',
  );
} else {
  ok(false, 'import do cenário 3 falhou antes de poder conferir');
}
