import { z } from 'zod';
import { query } from '../config/database.js';

/**
 * Resumo mês a mês — Sprint 4 + ampliado pela Sprint 5.
 *
 * As fontes de movimento financeiro são:
 *
 *   ENTRADAS
 *     - cobrancas_asaas com data_pagamento no mês e status terminal
 *       (RECEIVED, RECEIVED_IN_CASH, CONFIRMED, DUNNING_RECEIVED)
 *     - movimentos_socios tipo='aporte' com status='efetivado'
 *
 *   SAÍDAS
 *     - contas_pagar com status='paga'
 *     - movimentos_socios tipo='pro_labore' com status='efetivado'
 *     - movimentos_socios tipo='distribuicao' com status='efetivado'
 *
 * A âncora temporal é sempre a data de efetivação do pagamento
 * (regime de caixa).
 */

const STATUS_RECEBIDO = ['RECEIVED', 'RECEIVED_IN_CASH', 'CONFIRMED', 'DUNNING_RECEIVED'];

const mesSchema = z.object({
  mes: z.string().regex(/^\d{4}-\d{2}$/).optional(),
});

const historicoSchema = z.object({
  meses: z.coerce.number().int().min(1).max(24).default(6),
  mes: z.string().regex(/^\d{4}-\d{2}$/).optional(),
});

function primeiroDiaDoMes(mesISO) {
  if (mesISO) return `${mesISO}-01`;
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01`;
}

/**
 * Calcula totais de um mês: entradas (cobranças + aportes) e saídas
 * (contas pagas + pró-labore + distribuição).
 */
async function calcularTotaisDoMes(dataRef) {
  const { rows } = await query(
    `WITH
     ent_cobrancas AS (
       SELECT COALESCE(SUM(COALESCE(valor_liquido, valor)), 0) AS total,
              COUNT(*)::int AS qtd
         FROM cobrancas_asaas
        WHERE status = ANY($1::text[])
          AND data_pagamento IS NOT NULL
          AND date_trunc('month', data_pagamento) = date_trunc('month', $2::date)
     ),
     ent_aportes AS (
       SELECT COALESCE(SUM(valor), 0) AS total,
              COUNT(*)::int AS qtd
         FROM movimentos_socios
        WHERE tipo = 'aporte' AND status = 'efetivado'
          AND date_trunc('month', data_efetivada) = date_trunc('month', $2::date)
     ),
     sai_contas AS (
       SELECT COALESCE(SUM(COALESCE(valor_pago, valor)), 0) AS total,
              COUNT(*)::int AS qtd
         FROM contas_pagar
        WHERE status = 'paga'
          AND date_trunc('month', data_pagamento) = date_trunc('month', $2::date)
     ),
     sai_prolabore AS (
       SELECT COALESCE(SUM(valor), 0) AS total,
              COUNT(*)::int AS qtd
         FROM movimentos_socios
        WHERE tipo = 'pro_labore' AND status = 'efetivado'
          AND date_trunc('month', data_efetivada) = date_trunc('month', $2::date)
     ),
     sai_distribuicao AS (
       SELECT COALESCE(SUM(valor), 0) AS total,
              COUNT(*)::int AS qtd
         FROM movimentos_socios
        WHERE tipo = 'distribuicao' AND status = 'efetivado'
          AND date_trunc('month', data_efetivada) = date_trunc('month', $2::date)
     )
     SELECT
       (SELECT total FROM ent_cobrancas)  AS ent_cobrancas_total,
       (SELECT qtd   FROM ent_cobrancas)  AS ent_cobrancas_qtd,
       (SELECT total FROM ent_aportes)    AS ent_aportes_total,
       (SELECT qtd   FROM ent_aportes)    AS ent_aportes_qtd,
       (SELECT total FROM sai_contas)     AS sai_contas_total,
       (SELECT qtd   FROM sai_contas)     AS sai_contas_qtd,
       (SELECT total FROM sai_prolabore)  AS sai_prolabore_total,
       (SELECT qtd   FROM sai_prolabore)  AS sai_prolabore_qtd,
       (SELECT total FROM sai_distribuicao) AS sai_distribuicao_total,
       (SELECT qtd   FROM sai_distribuicao) AS sai_distribuicao_qtd`,
    [STATUS_RECEBIDO, dataRef],
  );
  const r = rows[0];

  const entradasTotal = Number(r.ent_cobrancas_total) + Number(r.ent_aportes_total);
  const entradasQtd = Number(r.ent_cobrancas_qtd) + Number(r.ent_aportes_qtd);
  const saidasTotal = Number(r.sai_contas_total) + Number(r.sai_prolabore_total) + Number(r.sai_distribuicao_total);
  const saidasQtd = Number(r.sai_contas_qtd) + Number(r.sai_prolabore_qtd) + Number(r.sai_distribuicao_qtd);

  return {
    entradas: { total: entradasTotal, qtd: entradasQtd },
    saidas:   { total: saidasTotal, qtd: saidasQtd },
    quebras: {
      cobrancas_asaas:    { total: Number(r.ent_cobrancas_total),    qtd: Number(r.ent_cobrancas_qtd) },
      aportes:            { total: Number(r.ent_aportes_total),      qtd: Number(r.ent_aportes_qtd) },
      contas_pagar:       { total: Number(r.sai_contas_total),       qtd: Number(r.sai_contas_qtd) },
      pro_labore:         { total: Number(r.sai_prolabore_total),    qtd: Number(r.sai_prolabore_qtd) },
      distribuicoes:      { total: Number(r.sai_distribuicao_total), qtd: Number(r.sai_distribuicao_qtd) },
    },
  };
}

/**
 * GET /api/mensal/resumo?mes=YYYY-MM
 */
export async function resumo(req, res, next) {
  try {
    const { mes } = mesSchema.parse(req.query);
    const dataAtual = primeiroDiaDoMes(mes);

    const { rows: anteriorRows } = await query(
      `SELECT (date_trunc('month', $1::date) - INTERVAL '1 month')::date AS mes_anterior`,
      [dataAtual],
    );
    const dataAnterior = anteriorRows[0].mes_anterior;

    const [totaisAtual, totaisAnterior, categorias, contasPagas, movimentosSocios] = await Promise.all([
      calcularTotaisDoMes(dataAtual),
      calcularTotaisDoMes(dataAnterior),

      query(
        `SELECT c.id   AS categoria_id,
                c.nome AS categoria_nome,
                c.cor  AS categoria_cor,
                COALESCE(SUM(COALESCE(cp.valor_pago, cp.valor)), 0) AS total,
                COUNT(cp.id)::int AS qtd
           FROM contas_pagar cp
      LEFT JOIN categorias_despesa c ON c.id = cp.categoria_id
          WHERE cp.status = 'paga'
            AND date_trunc('month', cp.data_pagamento) = date_trunc('month', $1::date)
       GROUP BY c.id, c.nome, c.cor
       ORDER BY total DESC`,
        [dataAtual],
      ),

      query(
        `SELECT cp.id, cp.descricao, cp.fornecedor_nome,
                cp.valor, cp.valor_pago, cp.data_vencimento, cp.data_pagamento,
                cp.forma_pagamento,
                c.nome AS categoria_nome, c.cor AS categoria_cor
           FROM contas_pagar cp
      LEFT JOIN categorias_despesa c ON c.id = cp.categoria_id
          WHERE cp.status = 'paga'
            AND date_trunc('month', cp.data_pagamento) = date_trunc('month', $1::date)
       ORDER BY cp.data_pagamento DESC, cp.descricao
          LIMIT 500`,
        [dataAtual],
      ),

      // Novo: movimentos de sócios efetivados no mês (pra listar na tela)
      query(
        `SELECT m.id, m.tipo, m.descricao, m.valor,
                m.data_efetivada, m.forma_pagamento,
                s.nome AS socio_nome
           FROM movimentos_socios m
           JOIN socios s ON s.id = m.socio_id
          WHERE m.status = 'efetivado'
            AND date_trunc('month', m.data_efetivada) = date_trunc('month', $1::date)
       ORDER BY m.data_efetivada DESC, m.tipo, s.nome`,
        [dataAtual],
      ),
    ]);

    function comporPainel({ entradas, saidas, quebras }) {
      const sobra = entradas.total - saidas.total;
      const margem_pct = entradas.total > 0 ? (sobra / entradas.total) * 100 : null;
      return {
        entradas: entradas.total,
        entradas_qtd: entradas.qtd,
        saidas: saidas.total,
        saidas_qtd: saidas.qtd,
        sobra,
        margem_pct,
        quebras,
      };
    }

    function variacaoPct(atual, anterior) {
      if (anterior === 0) return atual === 0 ? 0 : null;
      return ((atual - anterior) / Math.abs(anterior)) * 100;
    }

    const atual = comporPainel(totaisAtual);
    const anterior = comporPainel(totaisAnterior);
    const totalSaidasMes = atual.saidas;

    // Saídas por categoria vem do contas_pagar; adicionamos duas "categorias
    // virtuais" pra pró-labore e distribuição (que não têm categoria_despesa,
    // mas são saídas reais que o leitor precisa ver).
    const saidasPorCategoria = categorias.rows.map((r) => ({
      categoria_id: r.categoria_id,
      categoria_nome: r.categoria_nome ?? 'Sem categoria',
      categoria_cor: r.categoria_cor ?? 'slate',
      total: Number(r.total),
      qtd: r.qtd,
      fonte: 'contas_pagar',
    }));

    if (atual.quebras.pro_labore.total > 0) {
      saidasPorCategoria.push({
        categoria_id: null,
        categoria_nome: 'Pró-labore',
        categoria_cor: 'indigo',
        total: atual.quebras.pro_labore.total,
        qtd: atual.quebras.pro_labore.qtd,
        fonte: 'movimentos_socios',
      });
    }
    if (atual.quebras.distribuicoes.total > 0) {
      saidasPorCategoria.push({
        categoria_id: null,
        categoria_nome: 'Distribuição de lucros',
        categoria_cor: 'emerald',
        total: atual.quebras.distribuicoes.total,
        qtd: atual.quebras.distribuicoes.qtd,
        fonte: 'movimentos_socios',
      });
    }

    // Reordena e calcula o pct em cima do total final.
    saidasPorCategoria.sort((a, b) => b.total - a.total);
    for (const c of saidasPorCategoria) {
      c.pct = totalSaidasMes > 0 ? (c.total / totalSaidasMes) * 100 : 0;
    }

    const contas_pagas = contasPagas.rows.map((r) => ({
      id: r.id,
      descricao: r.descricao,
      fornecedor_nome: r.fornecedor_nome,
      categoria_nome: r.categoria_nome,
      categoria_cor: r.categoria_cor,
      valor: Number(r.valor),
      valor_pago: r.valor_pago != null ? Number(r.valor_pago) : null,
      data_vencimento: r.data_vencimento,
      data_pagamento: r.data_pagamento,
      forma_pagamento: r.forma_pagamento,
    }));

    const movimentos_socios = movimentosSocios.rows.map((m) => ({
      id: m.id,
      tipo: m.tipo,
      descricao: m.descricao,
      valor: Number(m.valor),
      data_efetivada: m.data_efetivada,
      forma_pagamento: m.forma_pagamento,
      socio_nome: m.socio_nome,
    }));

    res.json({
      mes_referencia: dataAtual,
      mes_anterior: dataAnterior,
      atual,
      anterior,
      variacao: {
        entradas_pct: variacaoPct(atual.entradas, anterior.entradas),
        saidas_pct: variacaoPct(atual.saidas, anterior.saidas),
        sobra_abs: atual.sobra - anterior.sobra,
      },
      saidas_por_categoria: saidasPorCategoria,
      contas_pagas,
      movimentos_socios,
    });
  } catch (err) { next(err); }
}

/**
 * GET /api/mensal/historico?meses=6
 *
 * Agora inclui aportes nas entradas e pró-labore+distribuição nas saídas.
 */
export async function historico(req, res, next) {
  try {
    const { meses, mes } = historicoSchema.parse(req.query);
    const dataFim = primeiroDiaDoMes(mes);

    const { rows } = await query(
      `WITH meses AS (
         SELECT generate_series(
           date_trunc('month', $1::date) - (($2::int - 1) || ' months')::interval,
           date_trunc('month', $1::date),
           INTERVAL '1 month'
         )::date AS mes
       ),
       /* entradas = cobranças recebidas + aportes efetivados */
       ent AS (
         SELECT mes, SUM(total) AS total FROM (
           SELECT date_trunc('month', data_pagamento)::date AS mes,
                  SUM(COALESCE(valor_liquido, valor)) AS total
             FROM cobrancas_asaas
            WHERE status = ANY($3::text[])
              AND data_pagamento IS NOT NULL
              AND data_pagamento >= date_trunc('month', $1::date) - (($2::int - 1) || ' months')::interval
              AND data_pagamento <  date_trunc('month', $1::date) + INTERVAL '1 month'
         GROUP BY 1
           UNION ALL
           SELECT date_trunc('month', data_efetivada)::date AS mes,
                  SUM(valor) AS total
             FROM movimentos_socios
            WHERE tipo = 'aporte' AND status = 'efetivado'
              AND data_efetivada >= date_trunc('month', $1::date) - (($2::int - 1) || ' months')::interval
              AND data_efetivada <  date_trunc('month', $1::date) + INTERVAL '1 month'
         GROUP BY 1
         ) u
     GROUP BY mes
       ),
       /* saídas = contas pagas + pró-labore efetivado + distribuição efetivada */
       sai AS (
         SELECT mes, SUM(total) AS total FROM (
           SELECT date_trunc('month', data_pagamento)::date AS mes,
                  SUM(COALESCE(valor_pago, valor)) AS total
             FROM contas_pagar
            WHERE status = 'paga'
              AND data_pagamento >= date_trunc('month', $1::date) - (($2::int - 1) || ' months')::interval
              AND data_pagamento <  date_trunc('month', $1::date) + INTERVAL '1 month'
         GROUP BY 1
           UNION ALL
           SELECT date_trunc('month', data_efetivada)::date AS mes,
                  SUM(valor) AS total
             FROM movimentos_socios
            WHERE tipo IN ('pro_labore', 'distribuicao') AND status = 'efetivado'
              AND data_efetivada >= date_trunc('month', $1::date) - (($2::int - 1) || ' months')::interval
              AND data_efetivada <  date_trunc('month', $1::date) + INTERVAL '1 month'
         GROUP BY 1
         ) u
     GROUP BY mes
       )
       SELECT m.mes,
              COALESCE(ent.total, 0) AS entradas,
              COALESCE(sai.total, 0) AS saidas
         FROM meses m
    LEFT JOIN ent ON ent.mes = m.mes
    LEFT JOIN sai ON sai.mes = m.mes
     ORDER BY m.mes`,
      [dataFim, meses, STATUS_RECEBIDO],
    );

    const pontos = rows.map((r) => {
      const entradas = Number(r.entradas);
      const saidas = Number(r.saidas);
      return {
        mes: r.mes,
        entradas,
        saidas,
        sobra: entradas - saidas,
      };
    });

    res.json({ meses: pontos.length, pontos });
  } catch (err) { next(err); }
}
