import { z } from 'zod';
import { query } from '../config/database.js';
import { asaasConfigurado } from '../config/env.js';
import { sincronizar, ultimaSincronizacao } from '../services/asaas.sync.js';
import { testarConexao } from '../services/asaas.client.js';
import { AppError } from '../utils/errors.js';

/**
 * Endpoints do painel de Caixa.
 *
 * Ampliado na Sprint 5 para considerar movimentos_socios previstos:
 *   - ENTRADAS previstas:  cobrancas_asaas + aportes previstos
 *   - SAÍDAS previstas:    contas_pagar pendentes + pró-labore previsto
 *                          + distribuição prevista
 *   - ATRASADAS: contas_pagar pendentes vencidas + movimentos_socios
 *                previstos (pro_labore/distribuicao) com data_prevista < hoje
 *
 * Regras de classificação das cobranças ASAAS:
 *   Previstas: PENDING, CONFIRMED, OVERDUE, AWAITING_RISK_ANALYSIS, DUNNING_REQUESTED
 *   Recebidas: RECEIVED, RECEIVED_IN_CASH, CONFIRMED
 *   Descartadas: REFUNDED, REFUND_REQUESTED, CHARGEBACK_*
 */

const STATUS_PREVISTO = [
  'PENDING',
  'CONFIRMED',
  'OVERDUE',
  'AWAITING_RISK_ANALYSIS',
  'DUNNING_REQUESTED',
];
const STATUS_RECEBIDO = ['RECEIVED', 'RECEIVED_IN_CASH', 'CONFIRMED'];

function serializarCobranca(r) {
  return {
    asaas_id: r.asaas_id,
    cliente_nome: r.cliente_nome,
    cliente_documento: r.cliente_documento,
    valor: Number(r.valor),
    valor_liquido: r.valor_liquido != null ? Number(r.valor_liquido) : null,
    data_vencimento: r.data_vencimento,
    data_pagamento: r.data_pagamento,
    data_credito_previsto: r.data_credito_previsto,
    status: r.status,
    tipo: r.tipo,
    descricao: r.descricao,
    fatura_url: r.fatura_url,
    referencia_externa: r.referencia_externa,
  };
}

/**
 * GET /api/caixa/resumo
 */
export async function resumo(_req, res, next) {
  try {
    const [saldos, previsaoEntradas, recebido, previsaoSaidas, atrasadas, config, ultima] = await Promise.all([
      query(
        `SELECT COALESCE(SUM(saldo_atual), 0) AS total,
                COUNT(*)::int AS qtd_contas,
                MAX(saldo_atualizado_em) AS mais_recente
           FROM contas_bancarias
          WHERE ativo = TRUE`,
      ),

      // Entradas previstas = cobranças ASAAS + aportes previstos.
      // Agregamos via UNION ALL + GROUP BY por faixa de dias.
      query(
        `WITH fontes AS (
          SELECT COALESCE(valor_liquido, valor) AS valor,
                 data_vencimento AS data_ref
            FROM cobrancas_asaas
           WHERE status = ANY($1::text[])
             AND data_vencimento >= CURRENT_DATE
             AND data_vencimento <= CURRENT_DATE + INTERVAL '90 days'
          UNION ALL
          SELECT valor, data_prevista
            FROM movimentos_socios
           WHERE tipo = 'aporte' AND status = 'previsto'
             AND data_prevista >= CURRENT_DATE
             AND data_prevista <= CURRENT_DATE + INTERVAL '90 days'
        )
        SELECT
          COALESCE(SUM(CASE WHEN data_ref <= CURRENT_DATE + INTERVAL '30 days'
                            THEN valor ELSE 0 END), 0) AS em_30,
          COALESCE(SUM(CASE WHEN data_ref <= CURRENT_DATE + INTERVAL '60 days'
                            THEN valor ELSE 0 END), 0) AS em_60,
          COALESCE(SUM(CASE WHEN data_ref <= CURRENT_DATE + INTERVAL '90 days'
                            THEN valor ELSE 0 END), 0) AS em_90,
          COUNT(*)::int AS qtd
          FROM fontes`,
        [STATUS_PREVISTO],
      ),

      query(
        `SELECT COALESCE(SUM(COALESCE(valor_liquido, valor)), 0) AS total,
                COUNT(*)::int AS qtd
           FROM cobrancas_asaas
          WHERE status = ANY($1::text[])
            AND data_pagamento >= CURRENT_DATE - INTERVAL '30 days'`,
        [STATUS_RECEBIDO],
      ),

      // Saídas previstas = contas_pagar pendentes (não vencidas) +
      //                    pró-labore previsto + distribuição prevista.
      query(
        `WITH fontes AS (
          SELECT valor, data_vencimento AS data_ref
            FROM contas_pagar
           WHERE status = 'pendente'
             AND data_vencimento >= CURRENT_DATE
             AND data_vencimento <= CURRENT_DATE + INTERVAL '90 days'
          UNION ALL
          SELECT valor, data_prevista
            FROM movimentos_socios
           WHERE tipo IN ('pro_labore', 'distribuicao')
             AND status = 'previsto'
             AND data_prevista >= CURRENT_DATE
             AND data_prevista <= CURRENT_DATE + INTERVAL '90 days'
        )
        SELECT
          COALESCE(SUM(CASE WHEN data_ref <= CURRENT_DATE + INTERVAL '30 days'
                            THEN valor ELSE 0 END), 0) AS em_30,
          COALESCE(SUM(CASE WHEN data_ref <= CURRENT_DATE + INTERVAL '60 days'
                            THEN valor ELSE 0 END), 0) AS em_60,
          COALESCE(SUM(CASE WHEN data_ref <= CURRENT_DATE + INTERVAL '90 days'
                            THEN valor ELSE 0 END), 0) AS em_90,
          COUNT(*)::int AS qtd
          FROM fontes`,
      ),

      // Atrasadas = contas pendentes vencidas + movimentos_socios previstos vencidos.
      query(
        `WITH fontes AS (
          SELECT valor
            FROM contas_pagar
           WHERE status = 'pendente' AND data_vencimento < CURRENT_DATE
          UNION ALL
          SELECT valor
            FROM movimentos_socios
           WHERE tipo IN ('pro_labore', 'distribuicao')
             AND status = 'previsto'
             AND data_prevista < CURRENT_DATE
        )
        SELECT COALESCE(SUM(valor), 0) AS total,
               COUNT(*)::int AS qtd
          FROM fontes`,
      ),

      query(`SELECT caixa_minimo FROM configuracoes_financeiras WHERE id = 1`),
      ultimaSincronizacao(),
    ]);

    const saldoAtual = Number(saldos.rows[0].total);
    const entradas30 = Number(previsaoEntradas.rows[0].em_30);
    const saidas30   = Number(previsaoSaidas.rows[0].em_30);
    const atrasadasVal = Number(atrasadas.rows[0].total);
    const caixaMinimo = Number(config.rows[0]?.caixa_minimo ?? 0);

    const saldoProjetado30 = saldoAtual + entradas30 - saidas30 - atrasadasVal;
    const abaixoDoMinimo = caixaMinimo > 0 && saldoProjetado30 < caixaMinimo;

    res.json({
      saldos_contas: {
        total: saldoAtual,
        qtd_contas: saldos.rows[0].qtd_contas,
        atualizado_mais_recente_em: saldos.rows[0].mais_recente,
      },
      previsao_entradas: {
        em_30: entradas30,
        em_60: Number(previsaoEntradas.rows[0].em_60),
        em_90: Number(previsaoEntradas.rows[0].em_90),
        qtd_cobrancas: previsaoEntradas.rows[0].qtd,
      },
      recebido_ultimos_30_dias: {
        total: Number(recebido.rows[0].total),
        qtd: recebido.rows[0].qtd,
      },
      previsao_saidas: {
        em_30: saidas30,
        em_60: Number(previsaoSaidas.rows[0].em_60),
        em_90: Number(previsaoSaidas.rows[0].em_90),
        qtd_contas: previsaoSaidas.rows[0].qtd,
      },
      contas_atrasadas: {
        total: atrasadasVal,
        qtd: atrasadas.rows[0].qtd,
      },
      projecao: {
        saldo_projetado_30_dias: saldoProjetado30,
        caixa_minimo: caixaMinimo,
        abaixo_do_minimo: abaixoDoMinimo,
        diferenca: saldoProjetado30 - caixaMinimo,
      },
      integracao_asaas: {
        configurada: asaasConfigurado,
        ultima_sincronizacao: ultima,
      },
    });
  } catch (err) { next(err); }
}

/**
 * GET /api/caixa/entradas  — lista de cobranças ASAAS com filtros.
 */
const entradasSchema = z.object({
  dias: z.coerce.number().int().min(1).max(365).optional(),
  status: z.enum(['todas', 'previstas', 'recebidas']).optional(),
  q: z.string().max(100).optional(),
});

export async function entradas(req, res, next) {
  try {
    const { dias = 90, status = 'previstas', q } = entradasSchema.parse(req.query);

    const partes = [];
    const params = [];

    if (status === 'previstas') {
      params.push(STATUS_PREVISTO);
      partes.push(`status = ANY($${params.length}::text[])`);
      partes.push(`data_vencimento <= CURRENT_DATE + ($${params.push(dias)}::int || ' days')::interval`);
      partes.push(`data_vencimento >= CURRENT_DATE - INTERVAL '30 days'`);
    } else if (status === 'recebidas') {
      params.push(STATUS_RECEBIDO);
      partes.push(`status = ANY($${params.length}::text[])`);
      partes.push(`data_pagamento >= CURRENT_DATE - ($${params.push(dias)}::int || ' days')::interval`);
    } else {
      partes.push(`(
        data_vencimento BETWEEN CURRENT_DATE - INTERVAL '30 days'
                            AND CURRENT_DATE + ($${params.push(dias)}::int || ' days')::interval
        OR data_pagamento >= CURRENT_DATE - ($${params.length}::int || ' days')::interval
      )`);
    }

    if (q) {
      const termo = `%${q.replace(/[%_]/g, '\\$&')}%`;
      params.push(termo);
      const idx = params.length;
      partes.push(`(
        cliente_nome ILIKE $${idx}
        OR descricao ILIKE $${idx}
        OR referencia_externa ILIKE $${idx}
      )`);
    }

    const where = partes.length ? `WHERE ${partes.join(' AND ')}` : '';
    const sql = `
      SELECT asaas_id, cliente_nome, cliente_documento,
             valor, valor_liquido,
             data_vencimento, data_pagamento, data_credito_previsto,
             status, tipo, descricao, fatura_url, referencia_externa
        FROM cobrancas_asaas
        ${where}
       ORDER BY
         CASE WHEN status = ANY($1::text[]) THEN data_vencimento
              ELSE data_pagamento END ASC NULLS LAST
       LIMIT 500
    `;

    const { rows } = await query(sql, params);
    res.json(rows.map(serializarCobranca));
  } catch (err) { next(err); }
}

/**
 * GET /api/caixa/fluxo?dias=90
 *
 * Fluxo dia a dia: entradas previstas (ASAAS + aportes) − saídas previstas
 * (contas_pagar + pró-labore + distribuição), com saldo projetado acumulado.
 */
const fluxoSchema = z.object({
  dias: z.coerce.number().int().min(7).max(180).default(90),
});

export async function fluxo(req, res, next) {
  try {
    const { dias } = fluxoSchema.parse(req.query);

    const [saldoR, entradasR, saidasR, atrasadasR] = await Promise.all([
      query(
        `SELECT COALESCE(SUM(saldo_atual), 0) AS total
           FROM contas_bancarias WHERE ativo = TRUE`,
      ),

      // Entradas dia a dia = cobranças + aportes previstos
      query(
        `SELECT dia, SUM(total) AS total FROM (
           SELECT data_vencimento AS dia,
                  SUM(COALESCE(valor_liquido, valor)) AS total
             FROM cobrancas_asaas
            WHERE status = ANY($1::text[])
              AND data_vencimento >= CURRENT_DATE
              AND data_vencimento <= CURRENT_DATE + ($2::int || ' days')::interval
         GROUP BY data_vencimento
           UNION ALL
           SELECT data_prevista AS dia, SUM(valor) AS total
             FROM movimentos_socios
            WHERE tipo = 'aporte' AND status = 'previsto'
              AND data_prevista >= CURRENT_DATE
              AND data_prevista <= CURRENT_DATE + ($2::int || ' days')::interval
         GROUP BY data_prevista
         ) u
       GROUP BY dia`,
        [STATUS_PREVISTO, dias],
      ),

      // Saídas dia a dia = contas_pagar + pró-labore + distribuição previstos
      query(
        `SELECT dia, SUM(total) AS total FROM (
           SELECT data_vencimento AS dia, SUM(valor) AS total
             FROM contas_pagar
            WHERE status = 'pendente'
              AND data_vencimento >= CURRENT_DATE
              AND data_vencimento <= CURRENT_DATE + ($1::int || ' days')::interval
         GROUP BY data_vencimento
           UNION ALL
           SELECT data_prevista AS dia, SUM(valor) AS total
             FROM movimentos_socios
            WHERE tipo IN ('pro_labore', 'distribuicao') AND status = 'previsto'
              AND data_prevista >= CURRENT_DATE
              AND data_prevista <= CURRENT_DATE + ($1::int || ' days')::interval
         GROUP BY data_prevista
         ) u
       GROUP BY dia`,
        [dias],
      ),

      // Atrasadas = contas pendentes vencidas + movimentos_socios previstos vencidos.
      query(
        `SELECT COALESCE(SUM(valor), 0) AS total FROM (
           SELECT valor FROM contas_pagar
            WHERE status = 'pendente' AND data_vencimento < CURRENT_DATE
           UNION ALL
           SELECT valor FROM movimentos_socios
            WHERE tipo IN ('pro_labore', 'distribuicao') AND status = 'previsto'
              AND data_prevista < CURRENT_DATE
         ) u`,
      ),
    ]);

    const mapEntradas = new Map();
    for (const r of entradasR.rows) {
      const k = new Date(r.dia).toISOString().slice(0, 10);
      mapEntradas.set(k, Number(r.total));
    }
    const mapSaidas = new Map();
    for (const r of saidasR.rows) {
      const k = new Date(r.dia).toISOString().slice(0, 10);
      mapSaidas.set(k, Number(r.total));
    }

    const saldoInicial = Number(saldoR.rows[0].total) - Number(atrasadasR.rows[0].total);

    const pontos = [];
    let saldoAcumulado = saldoInicial;
    const hoje = new Date();
    hoje.setHours(0, 0, 0, 0);

    for (let i = 0; i <= dias; i++) {
      const d = new Date(hoje);
      d.setDate(hoje.getDate() + i);
      const k = d.toISOString().slice(0, 10);

      const entrada = mapEntradas.get(k) ?? 0;
      const saida = mapSaidas.get(k) ?? 0;
      saldoAcumulado += entrada - saida;

      pontos.push({
        data: k,
        entrada,
        saida,
        saldo: saldoAcumulado,
      });
    }

    res.json({
      saldo_inicial: saldoInicial,
      saldo_bruto_contas: Number(saldoR.rows[0].total),
      atrasadas_descontadas: Number(atrasadasR.rows[0].total),
      dias,
      pontos,
    });
  } catch (err) { next(err); }
}

/**
 * POST /api/caixa/sincronizar — sync manual do ASAAS (admin-only).
 */
export async function sincronizarManualmente(req, res, next) {
  try {
    if (!asaasConfigurado) {
      throw new AppError(
        'Integração ASAAS não está configurada. Defina ASAAS_API_KEY.',
        503,
        'asaas_nao_configurado',
      );
    }

    const resultado = await sincronizar({
      origem: 'manual',
      disparadoPorId: req.pessoa.id,
    });
    if (!resultado.ok) {
      throw new AppError(
        `Falha na sincronização: ${resultado.erro || 'erro desconhecido'}`,
        502,
        'sync_falhou',
      );
    }
    res.json(resultado);
  } catch (err) { next(err); }
}

export async function statusIntegracao(_req, res, next) {
  try {
    const resultado = await testarConexao();
    res.json({ configurada: asaasConfigurado, ...resultado });
  } catch (err) { next(err); }
}
