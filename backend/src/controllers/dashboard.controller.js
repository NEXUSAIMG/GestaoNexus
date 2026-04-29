import { query } from '../config/database.js';

/**
 * Dashboard / Visão Geral — Sprint 12.
 *
 * Endpoint único que agrega TUDO que aparece na página inicial:
 * cards, agenda, financeiro, governança, atividade.
 *
 * Visibilidade (regra "III"):
 *   - Admin do sistema vê tudo
 *   - Sócio vê:
 *      • cards e eventos dos quadros que tem acesso
 *      • números agregados financeiros (transparência total)
 *      • eventos de governança (são societários, sempre visíveis)
 *
 * Estratégia DEFENSIVA: cada bloco de query é isolado num try/catch.
 * Se uma falhar, o resto continua funcionando — o dashboard mostra
 * "—" no bloco que quebrou, sem derrubar a página inteira.
 * Cada erro é logado com o nome do bloco pra facilitar debug.
 */

const HOJE_SQL = `CURRENT_DATE`;
const SETE_DIAS = `CURRENT_DATE + INTERVAL '7 days'`;
const TRINTA_DIAS = `CURRENT_DATE + INTERVAL '30 days'`;
const INICIO_MES_ATUAL = `date_trunc('month', CURRENT_DATE)`;

/**
 * Helper que executa uma query, captura erro, loga com contexto e
 * retorna um valor default. Não derruba a Promise.
 */
async function tentar(nome, fn, fallback) {
  try {
    return await fn();
  } catch (err) {
    console.error(`[dashboard:${nome}] ${err.message}`);
    if (err.code) console.error(`  code: ${err.code}, position: ${err.position}, hint: ${err.hint || '-'}`);
    return fallback;
  }
}

function condicaoVisibilidadeQuadros(isAdmin, pessoaIdParam) {
  if (isAdmin) return `TRUE`;
  return `(
    EXISTS (SELECT 1 FROM equipes_membros m
             WHERE m.equipe_id = q.equipe_id AND m.pessoa_id = ${pessoaIdParam})
    OR q.aberto_a_socios = TRUE
  )`;
}

/**
 * Constrói o filtro de visibilidade + array de parâmetros pra usar nas
 * queries que filtram quadros. Quando admin, não passa nenhum parâmetro
 * (evita o erro 08P01 "bind message supplies N parameters but prepared
 * statement requires 0" no Postgres).
 */
function filtroEParams(isAdmin, pessoaId) {
  if (isAdmin) return { filtro: 'TRUE', params: [] };
  return {
    filtro: `(
      EXISTS (SELECT 1 FROM equipes_membros m
               WHERE m.equipe_id = q.equipe_id AND m.pessoa_id = $1)
      OR q.aberto_a_socios = TRUE
    )`,
    params: [pessoaId],
  };
}

const RESUMO_VAZIO = {
  atrasados: 0, hoje: 0, proximos_7: 0, proximos_30: 0, sem_prazo: 0, total: 0,
};
const CONTAS_RESUMO_VAZIO = {
  atrasadas: 0, total_atrasadas: 0,
  vencendo_7: 0, total_vencendo_7: 0,
  pendentes_total: 0, total_pendentes: 0,
};
const DISTR_ANO_VAZIO = {
  distribuido: 0, previsto: 0, qtd_efetivadas: 0, qtd_previstas: 0,
};
const GOV_VAZIO = { docs_aprovacao: 0, decisoes_aprovacao: 0, docs_vigentes: 0 };
const GERAIS_VAZIO = { qtd_socios_ativos: 0, qtd_equipes: 0, qtd_quadros_visiveis: 0 };

export async function obter(req, res, next) {
  try {
    const isAdmin = !!req.pessoa?.administrador;
    const pessoaId = req.pessoa.id;

    // Filtro condicional: admin não passa parâmetro (TRUE puro);
    // não-admin passa $1 = pessoaId. Isso é essencial pra não cair em
    // "bind message supplies N parameters but prepared statement requires 0".
    const { filtro: filtroQuadro, params } = filtroEParams(isAdmin, pessoaId);

    // ===========================================================
    // 1. CARDS / TAREFAS
    // ===========================================================

    const cardsResumo = await tentar('cards-resumo', async () => {
      const { rows } = await query(
        `SELECT
           COUNT(*) FILTER (WHERE c.data_prazo IS NOT NULL AND c.data_prazo < ${HOJE_SQL})::int AS atrasados,
           COUNT(*) FILTER (WHERE c.data_prazo = ${HOJE_SQL})::int AS hoje,
           COUNT(*) FILTER (WHERE c.data_prazo > ${HOJE_SQL} AND c.data_prazo <= ${SETE_DIAS})::int AS proximos_7,
           COUNT(*) FILTER (WHERE c.data_prazo > ${SETE_DIAS} AND c.data_prazo <= ${TRINTA_DIAS})::int AS proximos_30,
           COUNT(*) FILTER (WHERE c.data_prazo IS NULL)::int AS sem_prazo,
           COUNT(*)::int AS total
         FROM cards c
         JOIN quadros q ON q.id = c.quadro_id
        WHERE c.arquivado_em IS NULL
          AND q.arquivado_em IS NULL
          AND ${filtroQuadro}`,
        params,
      );
      return rows[0];
    }, RESUMO_VAZIO);

    const meusCards = await tentar('meus-cards', async () => {
      const { rows } = await query(
        `SELECT c.id, c.titulo, c.data_prazo, c.quadro_id,
                q.nome AS quadro_nome, q.equipe_id,
                e.nome AS equipe_nome, e.cor AS equipe_cor
           FROM cards c
           JOIN quadros q ON q.id = c.quadro_id
           JOIN equipes e ON e.id = q.equipe_id
          WHERE c.responsavel_id = $1
            AND c.arquivado_em IS NULL
            AND q.arquivado_em IS NULL
          ORDER BY
            CASE WHEN c.data_prazo IS NULL THEN 1 ELSE 0 END,
            c.data_prazo ASC,
            c.atualizado_em DESC
          LIMIT 30`,
        [pessoaId],
      );
      return rows;
    }, []);

    const cardsPorEquipe = await tentar('cards-por-equipe', async () => {
      const { rows } = await query(
        `SELECT e.id, e.nome, e.cor,
                COUNT(c.id)::int AS total,
                COUNT(c.id) FILTER (WHERE c.data_prazo < ${HOJE_SQL})::int AS atrasados
           FROM equipes e
           LEFT JOIN quadros q ON q.equipe_id = e.id AND q.arquivado_em IS NULL AND ${filtroQuadro}
           LEFT JOIN cards c ON c.quadro_id = q.id AND c.arquivado_em IS NULL
          WHERE e.arquivada_em IS NULL
          GROUP BY e.id, e.nome, e.cor
          HAVING COUNT(c.id) > 0
          ORDER BY total DESC
          LIMIT 8`,
        params,
      );
      return rows;
    }, []);

    // ===========================================================
    // 2. AGENDA
    // ===========================================================

    const eventosGovernanca = await tentar('eventos-governanca', async () => {
      const { rows } = await query(
        `SELECT id, titulo, tipo, data_inicio, dia_inteiro, recorrencia_tipo
           FROM eventos_calendario
          WHERE (data_inicio >= ${HOJE_SQL}::timestamptz
                 AND data_inicio <= ${HOJE_SQL}::timestamptz + INTERVAL '14 days')
             OR (recorrencia_tipo IS NOT NULL
                 AND data_inicio < ${HOJE_SQL}::timestamptz + INTERVAL '14 days'
                 AND (recorrencia_ate IS NULL OR recorrencia_ate >= ${HOJE_SQL}))
          ORDER BY data_inicio
          LIMIT 50`,
      );
      return rows;
    }, []);

    const eventosQuadro = await tentar('eventos-quadro', async () => {
      const { rows } = await query(
        `SELECT eq.id, eq.titulo, eq.tipo, eq.data_inicio, eq.dia_inteiro,
                eq.recorrencia_tipo, eq.quadro_id,
                q.nome AS quadro_nome, e.nome AS equipe_nome, e.cor AS equipe_cor
           FROM eventos_quadro eq
           JOIN quadros q ON q.id = eq.quadro_id
           JOIN equipes e ON e.id = q.equipe_id
          WHERE q.arquivado_em IS NULL
            AND ${filtroQuadro}
            AND ((eq.data_inicio >= ${HOJE_SQL}::timestamptz
                  AND eq.data_inicio <= ${HOJE_SQL}::timestamptz + INTERVAL '14 days')
                 OR (eq.recorrencia_tipo IS NOT NULL
                     AND eq.data_inicio < ${HOJE_SQL}::timestamptz + INTERVAL '14 days'
                     AND (eq.recorrencia_ate IS NULL OR eq.recorrencia_ate >= ${HOJE_SQL})))
          ORDER BY eq.data_inicio
          LIMIT 50`,
        params,
      );
      return rows;
    }, []);

    // ===========================================================
    // 3. FINANCEIRO
    // ===========================================================

    const saldoContas = await tentar('saldo-contas', async () => {
      const { rows } = await query(
        `SELECT id, apelido AS nome, banco, tipo, COALESCE(saldo_atual, 0)::numeric AS saldo
           FROM contas_bancarias
          WHERE ativo = TRUE
          ORDER BY ordem, apelido`,
      );
      return rows;
    }, []);

    const saldoTotal = saldoContas.reduce((s, c) => s + Number(c.saldo || 0), 0);

    const fluxoEntradas = await tentar('fluxo-entradas', async () => {
      const { rows } = await query(
        `SELECT
           COALESCE(SUM(valor) FILTER (
             WHERE data_pagamento IS NOT NULL
               AND data_pagamento >= ${INICIO_MES_ATUAL}
           ), 0) AS entradas_mes,
           COUNT(*) FILTER (
             WHERE data_pagamento IS NOT NULL
               AND data_pagamento >= ${INICIO_MES_ATUAL}
           )::int AS qtd_entradas
         FROM cobrancas_asaas`,
      );
      return rows[0];
    }, { entradas_mes: 0, qtd_entradas: 0 });

    const fluxoSaidas = await tentar('fluxo-saidas', async () => {
      const { rows } = await query(
        `SELECT
           COALESCE(SUM(COALESCE(valor_pago, valor)) FILTER (
             WHERE status = 'paga'
               AND data_pagamento >= ${INICIO_MES_ATUAL}
           ), 0) AS pagamentos_mes,
           COUNT(*) FILTER (
             WHERE status = 'paga'
               AND data_pagamento >= ${INICIO_MES_ATUAL}
           )::int AS qtd_pagamentos
         FROM contas_pagar`,
      );
      return rows[0];
    }, { pagamentos_mes: 0, qtd_pagamentos: 0 });

    const contasResumo = await tentar('contas-resumo', async () => {
      const { rows } = await query(
        `SELECT
           COUNT(*) FILTER (WHERE status = 'pendente' AND data_vencimento < ${HOJE_SQL})::int AS atrasadas,
           COALESCE(SUM(valor) FILTER (WHERE status = 'pendente' AND data_vencimento < ${HOJE_SQL}), 0) AS total_atrasadas,
           COUNT(*) FILTER (WHERE status = 'pendente' AND data_vencimento >= ${HOJE_SQL} AND data_vencimento <= ${SETE_DIAS})::int AS vencendo_7,
           COALESCE(SUM(valor) FILTER (WHERE status = 'pendente' AND data_vencimento >= ${HOJE_SQL} AND data_vencimento <= ${SETE_DIAS}), 0) AS total_vencendo_7,
           COUNT(*) FILTER (WHERE status = 'pendente')::int AS pendentes_total,
           COALESCE(SUM(valor) FILTER (WHERE status = 'pendente'), 0) AS total_pendentes
         FROM contas_pagar`,
      );
      return rows[0];
    }, CONTAS_RESUMO_VAZIO);

    const fluxoSerie = await tentar('fluxo-serie', async () => {
      const { rows } = await query(
        `WITH meses AS (
           SELECT date_trunc('month', CURRENT_DATE) - (n || ' months')::interval AS mes
             FROM generate_series(0, 5) n
         )
         SELECT
           to_char(m.mes, 'YYYY-MM') AS mes,
           COALESCE((
             SELECT SUM(valor) FROM cobrancas_asaas
              WHERE data_pagamento IS NOT NULL
                AND date_trunc('month', data_pagamento::timestamp) = m.mes
           ), 0) AS entradas,
           COALESCE((
             SELECT SUM(COALESCE(valor_pago, valor)) FROM contas_pagar
              WHERE status = 'paga'
                AND data_pagamento IS NOT NULL
                AND date_trunc('month', data_pagamento::timestamp) = m.mes
           ), 0) AS saidas
         FROM meses m
         ORDER BY m.mes`,
      );
      return rows;
    }, []);

    // ===========================================================
    // 4. SÓCIOS / LUCROS
    // ===========================================================

    const distrAno = await tentar('distr-ano', async () => {
      const { rows } = await query(
        `SELECT
           COALESCE(SUM(valor_total) FILTER (WHERE status = 'efetivada'), 0) AS distribuido,
           COALESCE(SUM(valor_total) FILTER (WHERE status = 'prevista'),  0) AS previsto,
           COUNT(*) FILTER (WHERE status = 'efetivada')::int AS qtd_efetivadas,
           COUNT(*) FILTER (WHERE status = 'prevista')::int  AS qtd_previstas
         FROM distribuicoes_lucros
        WHERE EXTRACT(YEAR FROM COALESCE(data_efetivada, data_prevista)) = EXTRACT(YEAR FROM CURRENT_DATE)`,
      );
      return rows[0];
    }, DISTR_ANO_VAZIO);

    const distrPorSocio = await tentar('distr-por-socio', async () => {
      const { rows } = await query(
        `SELECT s.id, s.nome,
                COALESCE(SUM(ms.valor) FILTER (WHERE ms.status = 'efetivado'), 0) AS valor
           FROM socios s
           LEFT JOIN movimentos_socios ms ON ms.socio_id = s.id
                  AND ms.tipo = 'distribuicao'
                  AND EXTRACT(YEAR FROM COALESCE(ms.data_efetivada, ms.data_prevista)) = EXTRACT(YEAR FROM CURRENT_DATE)
          WHERE s.ativo = TRUE
          GROUP BY s.id, s.nome
          HAVING COALESCE(SUM(ms.valor) FILTER (WHERE ms.status = 'efetivado'), 0) > 0
          ORDER BY valor DESC`,
      );
      return rows;
    }, []);

    // ===========================================================
    // 5. GOVERNANÇA
    // ===========================================================

    const govResumo = await tentar('gov-resumo', async () => {
      const { rows } = await query(
        `SELECT
           (SELECT COUNT(*)::int FROM documentos_governanca WHERE status = 'em_aprovacao') AS docs_aprovacao,
           (SELECT COUNT(*)::int FROM decisoes              WHERE status = 'em_aprovacao') AS decisoes_aprovacao,
           (SELECT COUNT(*)::int FROM documentos_governanca WHERE vigente = TRUE)          AS docs_vigentes`,
      );
      return rows[0];
    }, GOV_VAZIO);

    // ===========================================================
    // 6. ATIVIDADE RECENTE
    // ===========================================================

    const atividade = await tentar('atividade', async () => {
      const { rows } = await query(
        `SELECT la.acao, la.detalhes, la.created_at AS criado_em,
                p.nome AS pessoa_nome
           FROM log_acoes la
           LEFT JOIN pessoas_acesso p ON p.id = la.pessoa_acesso_id
          ORDER BY la.created_at DESC
          LIMIT 15`,
      );
      return rows;
    }, []);

    // ===========================================================
    // 7. NÚMEROS GERAIS
    // ===========================================================

    const numerosGerais = await tentar('numeros-gerais', async () => {
      const { rows } = await query(
        `SELECT
           (SELECT COUNT(*)::int FROM socios WHERE ativo = TRUE) AS qtd_socios_ativos,
           (SELECT COUNT(*)::int FROM equipes WHERE arquivada_em IS NULL) AS qtd_equipes,
           (SELECT COUNT(*)::int FROM quadros q
             WHERE q.arquivado_em IS NULL AND ${filtroQuadro}) AS qtd_quadros_visiveis`,
        params,
      );
      return rows[0];
    }, GERAIS_VAZIO);

    // ===========================================================
    // RESPOSTA
    // ===========================================================

    res.json({
      gerados_em: new Date().toISOString(),
      pessoa: { id: pessoaId, nome: req.pessoa.nome, administrador: isAdmin },
      gerais: numerosGerais,
      tarefas: {
        resumo: cardsResumo,
        meus: meusCards,
        por_equipe: cardsPorEquipe,
      },
      agenda: {
        governanca: eventosGovernanca,
        quadros: eventosQuadro,
      },
      financeiro: {
        saldo_total: saldoTotal,
        contas: saldoContas.map((c) => ({ ...c, saldo: Number(c.saldo) })),
        entradas_mes: Number(fluxoEntradas.entradas_mes),
        qtd_entradas: fluxoEntradas.qtd_entradas,
        pagamentos_mes: Number(fluxoSaidas.pagamentos_mes),
        qtd_pagamentos: fluxoSaidas.qtd_pagamentos,
        contas_a_pagar: {
          atrasadas: contasResumo.atrasadas,
          total_atrasadas: Number(contasResumo.total_atrasadas),
          vencendo_7: contasResumo.vencendo_7,
          total_vencendo_7: Number(contasResumo.total_vencendo_7),
          pendentes_total: contasResumo.pendentes_total,
          total_pendentes: Number(contasResumo.total_pendentes),
        },
        fluxo_serie: fluxoSerie.map((f) => ({
          mes: f.mes,
          entradas: Number(f.entradas),
          saidas: Number(f.saidas),
          saldo: Number(f.entradas) - Number(f.saidas),
        })),
      },
      socios: {
        distribuicoes_ano: {
          distribuido: Number(distrAno.distribuido),
          previsto: Number(distrAno.previsto),
          qtd_efetivadas: distrAno.qtd_efetivadas,
          qtd_previstas: distrAno.qtd_previstas,
        },
        por_socio: distrPorSocio.map((s) => ({ ...s, valor: Number(s.valor) })),
      },
      governanca: govResumo,
      atividade,
    });
  } catch (err) {
    // Esse catch só pega erros NÃO relacionados a queries (ex: req.pessoa undefined).
    console.error('[dashboard] erro fatal:', err);
    next(err);
  }
}
