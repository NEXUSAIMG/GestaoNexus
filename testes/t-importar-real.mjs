// Import de um board no formato completo do Trello, com as armadilhas que
// aparecem em export de verdade: lista arquivada, card arquivado, etiqueta
// sem nome, checklist com itens fora de ordem, comentário de membro conhecido
// e de membro desconhecido, anexo, prazo concluído.
import { login, post, get, equipeDeTeste, ok, titulo } from './api.mjs';

await login();
const equipe_id = await equipeDeTeste();

const board = {
  id: 'b1',
  name: 'Operação Comercial ' + Date.now(),
  lists: [
    { id: 'l1', name: 'Backlog', pos: 65535, closed: false },
    { id: 'l2', name: 'Em andamento', pos: 131070, closed: false },
    { id: 'l3', name: 'Concluído', pos: 196605, closed: false },
    { id: 'l4', name: 'Lista velha arquivada', pos: 262140, closed: true },
  ],
  labels: [
    { id: 'lb1', name: 'Cliente', color: 'green' },
    { id: 'lb2', name: '', color: 'red' },
    { id: 'lb3', name: '', color: 'red' },      // colide com lb2 -> "(red)"
    { id: 'lb4', name: 'Urgente', color: 'orange' },
    { id: 'lb5', name: 'URGENTE', color: 'purple' }, // colide por caixa
  ],
  members: [
    { id: 'm1', fullName: 'Admin Local', username: 'admin' },
    { id: 'm2', fullName: 'Pessoa Que Nao Existe Aqui', username: 'fulano' },
  ],
  cards: [
    {
      id: 'c1', name: 'Fechar contrato com cartório X', idList: 'l2', pos: 65535,
      closed: false, desc: 'Proposta enviada, aguardando retorno.',
      due: '2026-09-30T12:00:00.000Z', dueComplete: false,
      idLabels: ['lb1', 'lb4'], idMembers: ['m1', 'm2'],
      attachments: [{ name: 'Proposta.pdf', url: 'https://trello.com/x/proposta.pdf' }],
    },
    {
      id: 'c2', name: 'Card já concluído', idList: 'l3', pos: 65535,
      closed: false, desc: '', idLabels: ['lb2'], idMembers: [],
      due: '2026-01-10T12:00:00.000Z', dueComplete: true, attachments: [],
    },
    {
      id: 'c3', name: 'Card arquivado no Trello', idList: 'l1', pos: 65535,
      closed: true, idLabels: [], idMembers: [], attachments: [],
    },
    {
      id: 'c4', name: 'Card numa lista arquivada', idList: 'l4', pos: 65535,
      closed: false, idLabels: [], idMembers: [], attachments: [],
    },
  ],
  checklists: [
    {
      id: 'ck1', idCard: 'c1', name: 'Etapas',
      checkItems: [
        { id: 'i2', name: 'Assinar', state: 'incomplete', pos: 131070 },
        { id: 'i1', name: 'Enviar proposta', state: 'complete', pos: 65535 },
      ],
    },
  ],
  actions: [
    {
      id: 'a1', type: 'commentCard', date: '2026-02-01T10:00:00.000Z',
      idMemberCreator: 'm1', data: { card: { id: 'c1' }, text: 'Liguei hoje, retornam semana que vem.' },
    },
    {
      id: 'a2', type: 'commentCard', date: '2026-02-03T10:00:00.000Z',
      idMemberCreator: 'm2', data: { card: { id: 'c1' }, text: 'Enviei a minuta.' },
    },
    { id: 'a3', type: 'updateCard', date: '2026-02-04T10:00:00.000Z', data: {} },
  ],
};

titulo('Import de board no formato completo');
const r = await post('/quadros/importar-trello', { equipe_id, board, criar_membros_ausentes: false });
console.log('   → HTTP', r.status, JSON.stringify(r.dados));
if (!ok(r.status === 201, 'import concluído')) process.exit(1);

const q = (await get('/quadros/' + r.dados.quadro_id)).dados;

ok(q.colunas.length === 3, 'lista arquivada do Trello não virou coluna (3 colunas)');
ok(q.cards.length === 2, 'card arquivado e card de lista arquivada ficaram de fora (2 cards)');
ok(q.etiquetas.length === 3, `etiquetas homônimas fundidas: ${q.etiquetas.map((e) => e.nome).join(', ')}`);

const c1 = q.cards.find((c) => c.titulo.startsWith('Fechar contrato'));
ok(c1?.responsaveis?.length === 1, 'o membro que existe virou responsável; o que não existe foi ignorado');
ok((c1?.etiqueta_ids || []).length === 2, 'as duas etiquetas do card vieram junto');
ok(/Proposta.pdf/.test(c1?.descricao || ''), 'o anexo virou link na descrição');

const ordemColunas = q.colunas.sort((a, b) => a.ordem - b.ordem).map((c) => c.nome);
ok(
  ordemColunas.join(' > ') === 'Backlog > Em andamento > Concluído',
  'ordem das colunas preservada: ' + ordemColunas.join(' > '),
);

const tipos = Object.fromEntries(q.colunas.map((c) => [c.nome, c.tipo]));
ok(tipos['Backlog'] === 'backlog' && tipos['Concluído'] === 'concluida',
  'tipo das colunas deduzido pelo nome');

titulo('Comentários importados');
const coments = (await get(`/cards/${c1.id}/comentarios`)).dados;
console.log('   →', JSON.stringify(coments.map((c) => ({ autor: c.pessoa_nome, texto: c.texto.slice(0, 40) })), null, 0));
ok(coments.length === 2, 'os 2 comentários vieram (a ação updateCard foi ignorada)');
ok(coments.some((c) => c.pessoa_nome === 'Admin Local'), 'comentário do membro conhecido manteve o autor');
ok(coments.some((c) => /Pessoa Que Nao Existe Aqui/.test(c.texto)),
  'comentário de membro desconhecido virou assinatura no texto');

titulo('Checklist importado');
const chks = (await get(`/cards/${c1.id}/checklists`)).dados;
ok(chks.length === 1 && chks[0].itens.length === 2, 'checklist com 2 itens');
ok(chks[0].itens[0].texto === 'Enviar proposta', 'itens reordenados por pos, não pela ordem do arquivo');
ok(chks[0].itens[0].concluido === true, 'estado do item preservado');
