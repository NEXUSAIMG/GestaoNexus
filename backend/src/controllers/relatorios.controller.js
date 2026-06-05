import { query } from '../config/database.js';

/**
 * GET /api/relatorios/custos-mensais
 *
 * Relatório de custos por competência (data de vencimento), separando
 * Realizado (até o mês atual) de Projetado (meses futuros — reflete só os
 * compromissos recorrentes já cadastrados, é um piso de custo).
 *
 * Fontes:
 *   - DESPESAS: contas_pagar (exceto canceladas), valor pago quando houver.
 *   - INVESTIMENTO: aportes de sócios efetivados (movimentos_socios).
 *
 * Não inclui pró-labore, distribuição de lucros nem receita do ASAAS.
 */
export async function custosMensais(_req, res, next) {
  try {
    const [despRes, aporteRes] = await Promise.all([
      query(`
        SELECT to_char(cp.data_vencimento, 'YYYY-MM')        AS mes,
               c.id                                          AS categoria_id,
               COALESCE(c.nome, 'Sem categoria')             AS categoria_nome,
               COALESCE(c.cor, 'slate')                      AS categoria_cor,
               SUM(COALESCE(cp.valor_pago, cp.valor))        AS total,
               COUNT(*)::int                                 AS qtd
          FROM contas_pagar cp
     LEFT JOIN categorias_despesa c ON c.id = cp.categoria_id
         WHERE cp.status <> 'cancelada'
           AND cp.data_vencimento IS NOT NULL
      GROUP BY 1, 2, 3, 4
      ORDER BY 1
      `),
      query(`
        SELECT to_char(data_efetivada, 'YYYY-MM') AS mes,
               SUM(valor)                         AS total,
               COUNT(*)::int                      AS qtd
          FROM movimentos_socios
         WHERE tipo = 'aporte'
           AND status = 'efetivado'
           AND data_efetivada IS NOT NULL
      GROUP BY 1
      `),
    ]);

    const agora = new Date();
    const mesAtual = agora.getFullYear() + '-' + String(agora.getMonth() + 1).padStart(2, '0');

    // Mapa mês -> agregados
    const mapa = new Map();
    const get = (mes) => {
      if (!mapa.has(mes)) mapa.set(mes, { mes, despesas_total: 0, investimento_total: 0, categorias: [] });
      return mapa.get(mes);
    };
    for (const r of despRes.rows) {
      const m = get(r.mes);
      const total = Number(r.total || 0);
      m.despesas_total += total;
      m.categorias.push({
        categoria_id: r.categoria_id,
        categoria_nome: r.categoria_nome,
        categoria_cor: r.categoria_cor,
        total,
        qtd: r.qtd,
      });
    }
    for (const r of aporteRes.rows) {
      get(r.mes).investimento_total += Number(r.total || 0);
    }

    const meses = [...mapa.values()]
      .sort((a, b) => a.mes.localeCompare(b.mes))
      .map((m) => {
        m.categorias.sort((a, b) => b.total - a.total);
        for (const c of m.categorias) {
          c.pct = m.despesas_total > 0 ? (c.total / m.despesas_total) * 100 : 0;
        }
        return { ...m, resultado: m.investimento_total - m.despesas_total, projetado: m.mes > mesAtual };
      });

    const realizado = meses.filter((m) => !m.projetado);
    const projetado = meses.filter((m) => m.projetado);

    const somar = (arr, campo) => arr.reduce((s, m) => s + m[campo], 0);
    const totais = (arr) => {
      const t = { despesas: somar(arr, 'despesas_total'), investimento: somar(arr, 'investimento_total') };
      t.resultado = t.investimento - t.despesas;
      return t;
    };

    // Despesas por categoria agregadas no período realizado.
    const catMap = new Map();
    for (const m of realizado) {
      for (const c of m.categorias) {
        const k = c.categoria_nome;
        const cur = catMap.get(k) || { categoria_nome: c.categoria_nome, categoria_cor: c.categoria_cor, total: 0, qtd: 0 };
        cur.total += c.total;
        cur.qtd += c.qtd;
        catMap.set(k, cur);
      }
    }
    const totalRealDesp = somar(realizado, 'despesas_total');
    const categoriasRealizado = [...catMap.values()]
      .map((c) => ({ ...c, pct: totalRealDesp > 0 ? (c.total / totalRealDesp) * 100 : 0 }))
      .sort((a, b) => b.total - a.total);

    // Run-rate: média das últimas até 3 competências FECHADAS (exclui o mês
    // atual, que é parcial).
    const fechadas = realizado.filter((m) => m.mes < mesAtual);
    const ultimas = fechadas.slice(-3);
    const runRate = ultimas.length ? somar(ultimas, 'despesas_total') / ultimas.length : 0;

    // Fixo recorrente estimado: mediana das competências projetadas.
    let fixoEstimado = null;
    if (projetado.length) {
      const vals = projetado.map((m) => m.despesas_total).sort((a, b) => a - b);
      const mid = Math.floor(vals.length / 2);
      fixoEstimado = vals.length % 2 ? vals[mid] : (vals[mid - 1] + vals[mid]) / 2;
    }
    const variavelEstimado = fixoEstimado != null ? Math.max(0, runRate - fixoEstimado) : null;

    res.json({
      gerado_em: new Date().toISOString(),
      mes_atual: mesAtual,
      base: 'Despesas por competência (vencimento), valor pago quando houver. Investimento = aportes de sócios efetivados. Não inclui pró-labore, distribuição nem receita do ASAAS.',
      resumo: {
        run_rate_mensal: runRate,
        meses_run_rate: ultimas.map((m) => m.mes),
        fixo_recorrente_estimado: fixoEstimado,
        variavel_estimado: variavelEstimado,
      },
      realizado: { meses: realizado, categorias: categoriasRealizado, totais: totais(realizado) },
      projetado: { meses: projetado, totais: totais(projetado) },
    });
  } catch (err) { next(err); }
}
