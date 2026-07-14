import { z } from 'zod';
import { query } from '../config/database.js';

/**
 * GET /api/relatorios/custos-mensais
 *
 * Payload LEVE: só os totais por mês (Realizado × Projetado) + um resumo de
 * categorias do período realizado. Os lançamentos de cada mês NÃO vêm aqui —
 * são carregados sob demanda em /detalhe-mes quando o usuário clica no mês.
 *
 * Fontes:
 *   - DESPESAS: contas_pagar (exceto canceladas), por competência (vencimento),
 *     valor pago quando houver.
 *   - INVESTIMENTO: aportes de sócios efetivados (movimentos_socios).
 */
export async function custosMensais(_req, res, next) {
  try {
    const [despRes, aporteRes] = await Promise.all([
      query(`
        SELECT to_char(cp.data_vencimento, 'YYYY-MM')   AS mes,
               COALESCE(c.nome, 'Sem categoria')         AS categoria_nome,
               COALESCE(c.cor, 'slate')                  AS categoria_cor,
               SUM(COALESCE(cp.valor_pago, cp.valor))    AS total,
               COUNT(*)::int                             AS qtd
          FROM contas_pagar cp
     LEFT JOIN categorias_despesa c ON c.id = cp.categoria_id
         WHERE cp.status <> 'cancelada'
           AND cp.data_vencimento IS NOT NULL
      GROUP BY 1, 2, 3
      `),
      query(`
        SELECT to_char(data_efetivada, 'YYYY-MM') AS mes,
               SUM(valor)                         AS total
          FROM movimentos_socios
         WHERE tipo = 'aporte'
           AND status = 'efetivado'
           AND data_efetivada IS NOT NULL
      GROUP BY 1
      `),
    ]);

    const agora = new Date();
    const mesAtual = agora.getFullYear() + '-' + String(agora.getMonth() + 1).padStart(2, '0');

    const mapa = new Map();
    const get = (mes) => {
      if (!mapa.has(mes)) mapa.set(mes, { mes, despesas_total: 0, investimento_total: 0, qtd: 0 });
      return mapa.get(mes);
    };
    for (const r of despRes.rows) {
      const m = get(r.mes);
      m.despesas_total += Number(r.total || 0);
      m.qtd += Number(r.qtd || 0);
    }
    for (const r of aporteRes.rows) {
      get(r.mes).investimento_total += Number(r.total || 0);
    }

    const meses = [...mapa.values()]
      .sort((a, b) => a.mes.localeCompare(b.mes))
      .map((m) => ({ ...m, resultado: m.investimento_total - m.despesas_total, projetado: m.mes > mesAtual }));

    const realizado = meses.filter((m) => !m.projetado);
    const projetado = meses.filter((m) => m.projetado);

    const somar = (arr, campo) => arr.reduce((s, m) => s + m[campo], 0);
    const totais = (arr) => {
      const t = { despesas: somar(arr, 'despesas_total'), investimento: somar(arr, 'investimento_total') };
      t.resultado = t.investimento - t.despesas;
      return t;
    };

    // Resumo de categorias do período realizado (mês <= atual).
    const catMap = new Map();
    for (const r of despRes.rows) {
      if (r.mes > mesAtual) continue;
      const cur = catMap.get(r.categoria_nome)
        || { categoria_nome: r.categoria_nome, categoria_cor: r.categoria_cor, total: 0, qtd: 0 };
      cur.total += Number(r.total || 0);
      cur.qtd += Number(r.qtd || 0);
      catMap.set(r.categoria_nome, cur);
    }
    const totalRealDesp = somar(realizado, 'despesas_total');
    const categoriasRealizado = [...catMap.values()]
      .map((c) => ({ ...c, pct: totalRealDesp > 0 ? (c.total / totalRealDesp) * 100 : 0 }))
      .sort((a, b) => b.total - a.total);

    const fechadas = realizado.filter((m) => m.mes < mesAtual);
    const ultimas = fechadas.slice(-3);
    const runRate = ultimas.length ? somar(ultimas, 'despesas_total') / ultimas.length : 0;

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

const detalheSchema = z.object({
  mes: z.string().regex(/^\d{4}-\d{2}$/, 'mes deve estar no formato YYYY-MM'),
});

/**
 * GET /api/relatorios/detalhe-mes?mes=YYYY-MM
 *
 * Os lançamentos (contas a pagar) de UM mês de competência, mais um resumo
 * por categoria daquele mês. Carregado sob demanda quando o usuário expande
 * o mês no relatório.
 */
export async function detalheMes(req, res, next) {
  try {
    const { mes } = detalheSchema.parse(req.query);

    const { rows } = await query(
      `SELECT cp.id,
              cp.descricao,
              cp.fornecedor_nome,
              cp.valor,
              cp.valor_pago,
              cp.status,
              cp.data_vencimento,
              (cp.grupo_recorrencia_id IS NOT NULL)    AS recorrente,
              cp.recorrencia_tipo,
              COALESCE(c.nome, 'Sem categoria')        AS categoria_nome,
              COALESCE(c.cor, 'slate')                 AS categoria_cor
         FROM contas_pagar cp
    LEFT JOIN categorias_despesa c ON c.id = cp.categoria_id
        WHERE cp.status <> 'cancelada'
          AND to_char(cp.data_vencimento, 'YYYY-MM') = $1
     ORDER BY COALESCE(cp.valor_pago, cp.valor) DESC`,
      [mes],
    );

    const itens = rows.map((r) => ({
      id: r.id,
      descricao: r.descricao,
      fornecedor: r.fornecedor_nome || null,
      valor: Number(r.valor_pago ?? r.valor ?? 0),
      status: r.status,
      vencimento: r.data_vencimento,
      recorrente: !!r.recorrente,
      recorrencia_tipo: r.recorrencia_tipo || null,
      categoria_nome: r.categoria_nome,
      categoria_cor: r.categoria_cor,
    }));

    const total = itens.reduce((s, i) => s + i.valor, 0);

    const catMap = new Map();
    for (const i of itens) {
      const cur = catMap.get(i.categoria_nome)
        || { categoria_nome: i.categoria_nome, categoria_cor: i.categoria_cor, total: 0, qtd: 0 };
      cur.total += i.valor;
      cur.qtd += 1;
      catMap.set(i.categoria_nome, cur);
    }
    const categorias = [...catMap.values()]
      .map((c) => ({ ...c, pct: total > 0 ? (c.total / total) * 100 : 0 }))
      .sort((a, b) => b.total - a.total);

    res.json({ mes, total, itens, categorias });
  } catch (err) { next(err); }
}
