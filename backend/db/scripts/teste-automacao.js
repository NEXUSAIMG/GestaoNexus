/**
 * Teste ponta a ponta do motor de automação (Sprint 36).
 *
 * Cria um quadro descartável, uma regra, dispara o gatilho e confere o log.
 * Apaga tudo no fim (o quadro cai em CASCATA e leva junto colunas, cards,
 * automações e execuções).
 *
 * Uso: node db/scripts/teste-automacao.js
 */
import 'dotenv/config';
import { query, pool } from '../../src/config/database.js';
import { dispatch } from '../../src/services/automacoes.service.js';

const ok = (m) => console.log('  ✓ ' + m);
const falha = (m) => { console.error('  ✗ ' + m); process.exitCode = 1; };

let quadroId = null;

try {
  console.log('\n[teste] Preparando cenário...');

  const eq = await query('SELECT id FROM equipes WHERE arquivada_em IS NULL LIMIT 1');
  if (!eq.rows[0]) throw new Error('Nenhuma equipe ativa — impossível criar quadro de teste.');

  const q = await query(
    `INSERT INTO quadros (equipe_id, nome, aberto_a_socios)
     VALUES ($1, '__TESTE_AUTOMACAO__', FALSE) RETURNING id`,
    [eq.rows[0].id],
  );
  quadroId = q.rows[0].id;

  const c1 = await query(
    `INSERT INTO colunas (quadro_id, nome, ordem, tipo)
     VALUES ($1, 'A fazer', 1000, 'backlog') RETURNING id`, [quadroId],
  );
  const c2 = await query(
    `INSERT INTO colunas (quadro_id, nome, ordem, tipo)
     VALUES ($1, 'Concluído', 2000, 'concluida') RETURNING id`, [quadroId],
  );
  ok('quadro + colunas criados');

  // Regra: quando o card for movido para "Concluído", SE prioridade <= 1,
  // então comentar e criar conta a pagar.
  const regra = await query(
    `INSERT INTO automacoes (quadro_id, nome, gatilho, condicoes, acoes)
     VALUES ($1, 'Teste', $2::jsonb, $3::jsonb, $4::jsonb) RETURNING id`,
    [
      quadroId,
      JSON.stringify({ tipo: 'card_movido', coluna_id: c2.rows[0].id }),
      JSON.stringify([{ campo: 'prioridade', op: '<=', valor: 1 }]),
      JSON.stringify([
        { tipo: 'comentar', texto: 'Entregue: {{titulo}}' },
        {
          tipo: 'criar_conta_pagar',
          descricao: 'Serviço — {{titulo}}',
          valor: 250.5,
          dias_vencimento: 15,
        },
      ]),
    ],
  );
  ok('regra criada');

  // ---------------------------------------------------------------------
  // Caso 1 — card P0: deve RODAR (condição passa)
  // ---------------------------------------------------------------------
  const cardA = await query(
    `INSERT INTO cards (coluna_id, quadro_id, titulo, ordem, prioridade, coluna_desde)
     VALUES ($1, $2, 'Card critico', 1000, 0, NOW()) RETURNING id`,
    [c2.rows[0].id, quadroId],
  );
  await dispatch('card_movido', {
    quadroId, cardId: cardA.rows[0].id, colunaId: c2.rows[0].id,
  });

  const exec1 = await query(
    `SELECT status, detalhe FROM automacoes_execucoes
      WHERE automacao_id = $1 AND card_id = $2`,
    [regra.rows[0].id, cardA.rows[0].id],
  );
  if (exec1.rows[0]?.status === 'ok') ok('P0 → regra executou (status ok)');
  else falha('P0 deveria ter executado, veio: ' + JSON.stringify(exec1.rows[0]));

  const com = await query(
    'SELECT texto FROM card_comentarios WHERE card_id = $1', [cardA.rows[0].id],
  );
  if (com.rows[0]?.texto === 'Entregue: Card critico') ok('comentário criado com interpolação');
  else falha('comentário: ' + JSON.stringify(com.rows[0]));

  const vinc = await query(
    `SELECT v.alvo_id, cp.descricao, cp.valor
       FROM cards_vinculos v JOIN contas_pagar cp ON cp.id = v.alvo_id
      WHERE v.card_id = $1 AND v.tipo = 'conta_pagar'`,
    [cardA.rows[0].id],
  );
  if (vinc.rows[0]) {
    ok('conta a pagar criada e vinculada: "' + vinc.rows[0].descricao
       + '" R$ ' + vinc.rows[0].valor);
    await query('DELETE FROM contas_pagar WHERE id = $1', [vinc.rows[0].alvo_id]);
  } else falha('conta a pagar NÃO foi criada');

  // ---------------------------------------------------------------------
  // Caso 2 — card P3: deve ser IGNORADO (condição reprova)
  // ---------------------------------------------------------------------
  const cardB = await query(
    `INSERT INTO cards (coluna_id, quadro_id, titulo, ordem, prioridade, coluna_desde)
     VALUES ($1, $2, 'Card baixo', 2000, 3, NOW()) RETURNING id`,
    [c2.rows[0].id, quadroId],
  );
  await dispatch('card_movido', {
    quadroId, cardId: cardB.rows[0].id, colunaId: c2.rows[0].id,
  });

  const exec2 = await query(
    `SELECT status, detalhe FROM automacoes_execucoes
      WHERE automacao_id = $1 AND card_id = $2`,
    [regra.rows[0].id, cardB.rows[0].id],
  );
  if (exec2.rows[0]?.status === 'ignorada') {
    ok('P3 → ignorada, e o log diz por quê: campo "'
       + exec2.rows[0].detalhe?.condicao_reprovada?.campo + '"');
  } else falha('P3 deveria ser ignorada, veio: ' + JSON.stringify(exec2.rows[0]));

  const contasB = await query(
    `SELECT 1 FROM cards_vinculos WHERE card_id = $1 AND tipo = 'conta_pagar'`,
    [cardB.rows[0].id],
  );
  if (contasB.rows.length === 0) ok('P3 não gerou conta a pagar (correto)');
  else falha('P3 gerou conta a pagar indevidamente');

  // ---------------------------------------------------------------------
  // Caso 3 — gatilho de coluna diferente: nem avalia
  // ---------------------------------------------------------------------
  const antes = await query(
    'SELECT COUNT(*)::int n FROM automacoes_execucoes WHERE automacao_id = $1',
    [regra.rows[0].id],
  );
  await dispatch('card_movido', {
    quadroId, cardId: cardA.rows[0].id, colunaId: c1.rows[0].id,
  });
  const depois = await query(
    'SELECT COUNT(*)::int n FROM automacoes_execucoes WHERE automacao_id = $1',
    [regra.rows[0].id],
  );
  if (antes.rows[0].n === depois.rows[0].n) ok('coluna diferente → regra nem foi avaliada');
  else falha('regra rodou para a coluna errada');

  // ---------------------------------------------------------------------
  // Caso 4 — guarda de recursão
  // ---------------------------------------------------------------------
  const r = await dispatch('card_movido', {
    quadroId, cardId: cardA.rows[0].id, colunaId: c2.rows[0].id, profundidade: 3,
  });
  if (r.motivo === 'profundidade-maxima') ok('guarda de recursão barrou a corrente (profundidade 3)');
  else falha('guarda de recursão não funcionou: ' + JSON.stringify(r));
} catch (err) {
  falha('exceção: ' + (err?.message || err));
} finally {
  if (quadroId) {
    await query('DELETE FROM quadros WHERE id = $1', [quadroId]);
    console.log('\n[teste] Cenário removido (CASCADE).');
  }
  await pool.end();
  console.log(process.exitCode ? '\n[teste] FALHOU\n' : '\n[teste] TUDO OK\n');
}
