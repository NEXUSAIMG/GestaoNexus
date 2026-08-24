// Histórico do card: quem moveu, quando, de onde para onde.
import { login, post, get, put, equipeDeTeste, ok, titulo } from './api.mjs';

await login();
const equipe_id = await equipeDeTeste();

const q = (await post('/quadros', { equipe_id, nome: 'Quadro histórico ' + Date.now() })).dados;
const cA = (await post(`/quadros/${q.id}/colunas`, { nome: 'A fazer', tipo: 'backlog' })).dados;
const cB = (await post(`/quadros/${q.id}/colunas`, { nome: 'Em andamento', tipo: 'em_andamento' })).dados;
const cC = (await post(`/quadros/${q.id}/colunas`, { nome: 'Concluído', tipo: 'concluida' })).dados;

const card = (await post('/cards', { coluna_id: cA.id, titulo: 'Card rastreado' })).dados;

titulo('Movimentando o card pelo fluxo');
await post(`/cards/${card.id}/mover`, { coluna_id: cB.id, posicao: 0 });
await post(`/cards/${card.id}/mover`, { coluna_id: cC.id, posicao: 0 });
// reordenar dentro da mesma coluna NÃO é evento de fluxo
await post(`/cards/${card.id}/mover`, { coluna_id: cC.id, posicao: 0 });
await put(`/cards/${card.id}`, { titulo: 'Card rastreado (renomeado)' });
await post(`/cards/${card.id}/comentarios`, { texto: 'comentário de teste' });

const h = (await get(`/cards/${card.id}/historico`)).dados;
console.log('\n   linha do tempo:');
for (const i of h.itens) {
  const quem = i.pessoa_nome || '—';
  const quando = new Date(i.quando).toLocaleString('pt-BR');
  if (i.origem === 'movimento') {
    console.log(`   · ${quando}  ${quem}  ${i.de_coluna_nome ?? '(criação)'} → ${i.para_coluna_nome}  [${i.minutos_na_origem ?? '-'} min na origem]`);
  } else {
    console.log(`   · ${quando}  ${quem}  ${i.acao}`);
  }
}

titulo('Verificações');
const movs = h.itens.filter((i) => i.origem === 'movimento');
ok(movs.length === 3, `3 movimentos registrados (criação + 2 trocas de coluna), veio ${movs.length}`);
ok(
  movs.every((m) => m.para_coluna_nome),
  'todo movimento traz o NOME da coluna de destino, não o uuid',
);
const paraConcluido = movs.find((m) => m.para_coluna_nome === 'Concluído');
ok(paraConcluido?.de_coluna_nome === 'Em andamento',
  'o movimento diz de onde veio: ' + paraConcluido?.de_coluna_nome + ' → ' + paraConcluido?.para_coluna_nome);
ok(movs.every((m) => m.pessoa_nome === 'Admin Local'), 'todo movimento diz quem fez');
ok(movs.every((m) => m.quando), 'todo movimento tem data e hora');

const acoes = h.itens.filter((i) => i.origem === 'acao');
ok(acoes.some((a) => a.acao === 'card.criou'), 'a criação aparece na linha do tempo');
ok(acoes.some((a) => a.acao === 'card.editou'), 'a edição aparece');
ok(acoes.some((a) => a.acao === 'card.comentou'), 'o comentário aparece');
ok(!acoes.some((a) => a.acao === 'card.moveu'),
  'movimento não aparece duplicado (uma vez como movimento, não como ação)');

ok(h.coluna_atual === 'Concluído', 'informa a coluna atual: ' + h.coluna_atual);
ok(!!h.coluna_desde, 'informa desde quando está nela');

const ordenado = h.itens.every((it, i, arr) => i === 0 || new Date(arr[i - 1].quando) >= new Date(it.quando));
ok(ordenado, 'linha do tempo em ordem cronológica reversa');

titulo('Filtro por tipo');
const soMov = (await get(`/cards/${card.id}/historico?tipo=movimentos`)).dados;
ok(soMov.itens.every((i) => i.origem === 'movimento'), 'filtro tipo=movimentos devolve só movimentação');
const soAcoes = (await get(`/cards/${card.id}/historico?tipo=acoes`)).dados;
ok(soAcoes.itens.every((i) => i.origem === 'acao'), 'filtro tipo=acoes devolve só ações');

titulo('Permissão');
const semAcesso = await get('/cards/00000000-0000-0000-0000-000000000000/historico');
ok(semAcesso.status === 404, 'card inexistente devolve 404, não 500');
