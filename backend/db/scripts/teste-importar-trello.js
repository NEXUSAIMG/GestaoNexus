/**
 * Teste do importador do Trello (Sprint 38).
 * Monta um board fake no formato de export do Trello, importa e confere.
 * Apaga o quadro no fim (CASCADE leva tudo).
 *
 * Uso: node db/scripts/teste-importar-trello.js
 */
import 'dotenv/config';
import { query, pool } from '../../src/config/database.js';

const ok = (m) => console.log('  ✓ ' + m);
const falha = (m) => { console.error('  ✗ ' + m); process.exitCode = 1; };

// Board de amostra no formato do Trello.
const board = {
  name: '__TESTE_TRELLO__',
  lists: [
    { id: 'l1', name: 'A Fazer', pos: 1, closed: false },
    { id: 'l2', name: 'Fazendo', pos: 2, closed: false },
    { id: 'l3', name: 'Concluido', pos: 3, closed: false },
    { id: 'l4', name: 'Arquivada', pos: 4, closed: true },
  ],
  labels: [
    { id: 'lb1', name: 'Urgente', color: 'red' },
    { id: 'lb2', name: '', color: 'green' },
  ],
  cards: [
    {
      id: 'c1', name: 'Tarefa A', desc: 'descricao A', idList: 'l1',
      pos: 1, closed: false, idLabels: ['lb1'], due: '2026-08-01T12:00:00.000Z',
    },
    { id: 'c2', name: 'Tarefa B', idList: 'l3', pos: 1, closed: false, idLabels: ['lb2'] },
    { id: 'c3', name: 'Card arquivado', idList: 'l1', pos: 2, closed: true },
    { id: 'c4', name: 'Card em lista morta', idList: 'l4', pos: 1, closed: false },
  ],
  checklists: [
    {
      id: 'ch1', idCard: 'c1', name: 'Passos',
      checkItems: [
        { id: 'i1', name: 'passo 1', state: 'complete', pos: 1 },
        { id: 'i2', name: 'passo 2', state: 'incomplete', pos: 2 },
      ],
    },
  ],
  actions: [
    { type: 'commentCard', data: { card: { id: 'c1' }, text: 'primeiro comentario' } },
    { type: 'updateCard', data: { card: { id: 'c1' } } },
  ],
};

let quadroId = null;

try {
  const { importarConteudoParaTeste } = await carregarModuloComExport();

  // Prepara equipe/pessoa e quadro
  const eq = await query('SELECT id FROM equipes WHERE arquivada_em IS NULL LIMIT 1');
  if (!eq.rows[0]) throw new Error('Nenhuma equipe ativa.');
  const pe = await query('SELECT id FROM pessoas_acesso WHERE ativo = TRUE LIMIT 1');

  const q = await query(
    `INSERT INTO quadros (equipe_id, nome, aberto_a_socios) VALUES ($1, $2, FALSE) RETURNING id`,
    [eq.rows[0].id, board.name],
  );
  quadroId = q.rows[0].id;

  const listas = board.lists.filter((l) => !l.closed).sort((a, b) => a.pos - b.pos);
  const r = await importarConteudoParaTeste(
    { query: (s, p) => query(s, p) }, quadroId, board, listas, pe.rows[0]?.id || null,
  );

  if (r.colunas === 3) ok('3 colunas (lista arquivada ignorada)');
  else falha('colunas: ' + r.colunas);

  if (r.cards === 2) ok('2 cards (arquivado e o de lista morta ignorados)');
  else falha('cards: ' + r.cards);

  if (r.etiquetas === 2) ok('2 etiquetas (label sem nome ganhou nome pela cor)');
  else falha('etiquetas: ' + r.etiquetas);

  if (r.checklists === 1) ok('1 checklist com itens');
  else falha('checklists: ' + r.checklists);

  if (r.comentarios === 1) ok('1 comentario (updateCard ignorado)');
  else falha('comentarios: ' + r.comentarios);

  // Card concluido carimbado?
  const conc = await query(
    `SELECT c.concluido_em FROM cards c JOIN colunas col ON col.id = c.coluna_id
      WHERE c.quadro_id = $1 AND col.tipo = 'concluida'`,
    [quadroId],
  );
  if (conc.rows[0]?.concluido_em) ok('card na coluna "Concluido" foi carimbado (metricas ja contam)');
  else falha('card concluido sem carimbo');

  // Checklist item marcado?
  const it = await query(
    `SELECT COUNT(*) FILTER (WHERE concluido)::int feitos, COUNT(*)::int total
       FROM card_checklist_itens ci JOIN cards c ON c.id = ci.card_id
      WHERE c.quadro_id = $1`,
    [quadroId],
  );
  if (it.rows[0].total === 2 && it.rows[0].feitos === 1) ok('itens de checklist com estado preservado (1/2)');
  else falha('itens: ' + JSON.stringify(it.rows[0]));
} catch (err) {
  falha('excecao: ' + (err?.message || err));
} finally {
  if (quadroId) {
    await query('DELETE FROM quadros WHERE id = $1', [quadroId]);
    console.log('\n[teste] Quadro de teste removido.');
  }
  await pool.end();
  console.log(process.exitCode ? '\n[teste] FALHOU\n' : '\n[teste] TUDO OK\n');
}

// O importarConteudo nao e exportado (e interno). Reaproveitamos via um shim
// que reimporta o modulo e extrai a funcao por regex-free eval do arquivo seria
// fragil; em vez disso, exportamos a logica chamando o proprio controller nao da
// (precisa de req/res). Entao duplicamos a chamada minima: importamos o modulo e
// usamos a funcao interna exposta para teste.
async function carregarModuloComExport() {
  const mod = await import('../../src/controllers/importar-trello.controller.js');
  if (mod.importarConteudoParaTeste) return mod;
  throw new Error('Exporte importarConteudoParaTeste do controller para rodar este teste.');
}
