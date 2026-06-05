/**
 * Script CLI — Relatório mensal (resumo de custos + investimento)
 *
 * SÓ LEITURA. Não altera nada. Agrega, mês a mês:
 *   - DESPESAS: contas_pagar (saídas), por competência = data_vencimento,
 *     somando o valor pago quando houver, senão o valor previsto.
 *     Quebra também por categoria.
 *   - INVESTIMENTO: aportes de sócios (movimentos_socios tipo='aporte')
 *     efetivados, por data_efetivada.
 *   - RESULTADO: investimento - despesas (só pra leitura rápida).
 *
 * NÃO inclui pró-labore nem distribuição de lucros (são saídas a sócios,
 * não "despesas" operacionais) nem receita do ASAAS. Dá pra adicionar depois.
 *
 * Uso:
 *   npm run relatorio-mensal
 *
 * Saída:
 *   ./relatorio-mensal.json  (na pasta backend)
 */
import { writeFileSync } from 'fs';
import { resolve } from 'path';
import { query, closePool } from '../../src/config/database.js';

function brl(n) {
  return Number(n || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

async function rodar() {
  console.log('\n📊 Gerando relatório mensal (despesas + investimento)...\n');

  const { rows: desp } = await query(`
    SELECT to_char(cp.data_vencimento, 'YYYY-MM') AS mes,
           COALESCE(c.nome, 'Sem categoria')       AS categoria,
           SUM(COALESCE(cp.valor_pago, cp.valor))  AS total,
           COUNT(*)                                AS qtd
      FROM contas_pagar cp
 LEFT JOIN categorias_despesa c ON c.id = cp.categoria_id
     WHERE cp.status <> 'cancelada'
       AND cp.data_vencimento IS NOT NULL
  GROUP BY 1, 2
  ORDER BY 1, 3 DESC
  `);

  const { rows: aportes } = await query(`
    SELECT to_char(m.data_efetivada, 'YYYY-MM') AS mes,
           SUM(m.valor)                         AS total,
           COUNT(*)                             AS qtd
      FROM movimentos_socios m
     WHERE m.tipo = 'aporte'
       AND m.status = 'efetivado'
       AND m.data_efetivada IS NOT NULL
  GROUP BY 1
  ORDER BY 1
  `);

  // Monta o mapa mês -> { despesas, categorias[], investimento }
  const mapa = new Map();
  const get = (mes) => {
    if (!mapa.has(mes)) mapa.set(mes, { mes, despesas_total: 0, investimento_total: 0, categorias: [] });
    return mapa.get(mes);
  };

  for (const r of desp) {
    const m = get(r.mes);
    const total = Number(r.total || 0);
    m.despesas_total += total;
    m.categorias.push({ categoria: r.categoria, total, qtd: Number(r.qtd) });
  }
  for (const r of aportes) {
    get(r.mes).investimento_total += Number(r.total || 0);
  }

  const meses = [...mapa.values()]
    .map((m) => ({ ...m, resultado: m.investimento_total - m.despesas_total }))
    .sort((a, b) => a.mes.localeCompare(b.mes));

  const totais = meses.reduce(
    (acc, m) => ({
      despesas: acc.despesas + m.despesas_total,
      investimento: acc.investimento + m.investimento_total,
    }),
    { despesas: 0, investimento: 0 },
  );
  totais.resultado = totais.investimento - totais.despesas;

  const saida = {
    gerado_em: new Date().toISOString(),
    base: 'despesas por competencia (data_vencimento), valor pago quando houver; investimento = aportes de socios efetivados (data_efetivada)',
    meses,
    totais,
  };

  const caminho = resolve(process.cwd(), 'relatorio-mensal.json');
  writeFileSync(caminho, JSON.stringify(saida, null, 2), 'utf8');

  // Tabela rápida no terminal
  console.log('Mês      | Despesas        | Investimento    | Resultado');
  console.log('─'.repeat(62));
  for (const m of meses) {
    console.log(
      m.mes.padEnd(8),
      ' | ', brl(m.despesas_total).padStart(13),
      ' | ', brl(m.investimento_total).padStart(13),
      ' | ', brl(m.resultado).padStart(13),
    );
  }
  console.log('─'.repeat(62));
  console.log(
    'TOTAL   ',
    ' | ', brl(totais.despesas).padStart(13),
    ' | ', brl(totais.investimento).padStart(13),
    ' | ', brl(totais.resultado).padStart(13),
  );
  console.log(`\n📄 Arquivo: ${caminho}`);
  console.log('Envie esse JSON aqui que eu monto o relatório formatado. 🙂\n');
}

rodar()
  .catch((err) => {
    console.error('\n❌ Erro:', err.message || err);
    process.exitCode = 1;
  })
  .finally(closePool);
