/**
 * Gerador de ocorrências de contas a pagar recorrentes — Sprint 13.
 *
 * Modelo: cada ocorrência é uma linha em contas_pagar, ligadas por
 * grupo_recorrencia_id. Esta utilidade calcula as datas e cria as
 * linhas em uma transação.
 *
 * "Infinito" (qtd e ate ambos nulos) gera HORIZONTE_PADRAO_MESES
 * ocorrências e o cron mensal estende quando faltam < 12 meses.
 */

import { randomUUID } from 'node:crypto';

const PASSO_MESES = {
  mensal: 1,
  trimestral: 3,
  semestral: 6,
  anual: 12,
};

// Quantos meses pra frente geramos quando o usuário escolhe "infinito"
// (qtd e ate ambos nulos). O cron extende quando faltam < 12 meses.
export const HORIZONTE_PADRAO_MESES = 24;

// Limite de segurança: nunca gera mais que isso de uma vez. Protege contra
// usuário definir qtd=10000 sem querer.
export const MAX_OCORRENCIAS = 240;

/**
 * Adiciona N meses a uma data, ajustando o dia pro último do mês quando
 * o original não existir no destino (ex: 31/jan + 1 mês = 28/fev).
 */
export function adicionarMeses(data, meses) {
  const d = new Date(data);
  const dia = d.getUTCDate();
  d.setUTCDate(1);
  d.setUTCMonth(d.getUTCMonth() + meses);
  const ultimoDiaMes = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0)).getUTCDate();
  d.setUTCDate(Math.min(dia, ultimoDiaMes));
  return d;
}

function ymd(d) {
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-${String(d.getUTCDate()).padStart(2, '0')}`;
}

/**
 * Decide quantas ocorrências precisam ser geradas a partir de `inicio`,
 * dadas as regras (qtd, ate). Retorna array de objetos { indice, data }.
 *
 * @param {object} opts
 * @param {string} opts.dataInicio — YYYY-MM-DD da primeira ocorrência
 * @param {string} opts.tipo       — 'mensal'|'trimestral'|'semestral'|'anual'
 * @param {number|null} opts.qtd   — total de ocorrências desejadas (1..N), ou null
 * @param {string|null} opts.ate   — YYYY-MM-DD limite, ou null
 * @param {number} [opts.indiceInicial=1] — útil pra extender série existente
 * @param {number} [opts.maxAdicional]    — limite extra (cron usa 12)
 */
export function calcularOcorrencias({ dataInicio, tipo, qtd, ate, indiceInicial = 1, maxAdicional }) {
  const passo = PASSO_MESES[tipo];
  if (!passo) throw new Error(`Tipo de recorrência inválido: ${tipo}`);

  const inicio = new Date(`${dataInicio}T12:00:00Z`);
  const limiteData = ate ? new Date(`${ate}T23:59:59Z`) : null;

  // Limite efetivo: o menor entre qtd e o horizonte padrão (pra "infinito"),
  // depois clamp em MAX_OCORRENCIAS.
  let totalDesejado;
  if (qtd != null) {
    totalDesejado = qtd;
  } else if (limiteData != null) {
    totalDesejado = MAX_OCORRENCIAS; // o limite real vai ser por data
  } else {
    totalDesejado = HORIZONTE_PADRAO_MESES; // "infinito" = 24 meses iniciais
  }
  totalDesejado = Math.min(totalDesejado, MAX_OCORRENCIAS);
  if (maxAdicional != null) totalDesejado = Math.min(totalDesejado, maxAdicional);

  const ocorrencias = [];
  for (let i = 0; i < totalDesejado; i++) {
    // i=0 = primeira ocorrência (na data de início informada)
    const data = i === 0 ? inicio : adicionarMeses(inicio, i * passo);
    if (limiteData && data > limiteData) break;
    ocorrencias.push({
      indice: indiceInicial + i,
      data: ymd(data),
    });
  }
  return ocorrencias;
}

/**
 * Cria uma série de contas no banco a partir de um template e regra de
 * recorrência. Roda dentro de uma transação fornecida pelo chamador.
 *
 * Retorna { grupoId, contas: [{ id, data_vencimento, indice }] }.
 */
export async function gerarSerieContas(client, {
  template,        // dados comuns: descricao, fornecedor_*, categoria_id, valor, observacoes, comprovante_url
  primeiraData,    // YYYY-MM-DD
  tipo,            // 'mensal'|'trimestral'|'semestral'|'anual'
  qtd,             // null pra ate-ou-infinito
  ate,             // null pra qtd-ou-infinito
  pessoaId,
  grupoId = randomUUID(),
  indiceInicial = 1,
  maxAdicional,
}) {
  const ocs = calcularOcorrencias({
    dataInicio: primeiraData,
    tipo, qtd, ate,
    indiceInicial, maxAdicional,
  });

  if (ocs.length === 0) return { grupoId, contas: [] };

  const contas = [];
  for (const oc of ocs) {
    const { rows } = await client.query(
      `INSERT INTO contas_pagar (
         descricao, fornecedor_nome, fornecedor_documento,
         categoria_id, valor, data_vencimento,
         observacoes, comprovante_url, criado_por_id,
         grupo_recorrencia_id, recorrencia_tipo, recorrencia_qtd,
         recorrencia_ate, recorrencia_indice
       ) VALUES ($1,$2,$3, $4,$5,$6, $7,$8,$9, $10,$11,$12, $13,$14)
       RETURNING id, data_vencimento, recorrencia_indice`,
      [
        template.descricao,
        template.fornecedor_nome ?? null,
        template.fornecedor_documento ?? null,
        template.categoria_id ?? null,
        template.valor,
        oc.data,
        template.observacoes ?? null,
        template.comprovante_url ?? null,
        pessoaId,
        grupoId,
        tipo,
        qtd ?? null,
        ate ?? null,
        oc.indice,
      ],
    );
    contas.push({
      id: rows[0].id,
      data_vencimento: rows[0].data_vencimento,
      indice: rows[0].recorrencia_indice,
    });
  }

  return { grupoId, contas };
}

/**
 * Estende séries "infinitas" (qtd=NULL e ate=NULL) sempre que o último
 * vencimento futuro está a menos de 12 meses de hoje. Garante sempre 12
 * meses de "vida" disponível pra frente.
 *
 * Roda no cron mensal. Idempotente — se já estiver tudo gerado, não faz nada.
 */
export async function estenderSeriesInfinitas(pool) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // Acha grupos infinitos cujo MAIOR vencimento está a < 12 meses de hoje
    const { rows: grupos } = await client.query(
      `SELECT
         grupo_recorrencia_id AS grupo_id,
         recorrencia_tipo AS tipo,
         MAX(recorrencia_indice) AS ultimo_indice,
         MAX(data_vencimento) AS ultimo_vencimento
       FROM contas_pagar
      WHERE grupo_recorrencia_id IS NOT NULL
        AND recorrencia_qtd IS NULL
        AND recorrencia_ate IS NULL
      GROUP BY grupo_recorrencia_id, recorrencia_tipo
      HAVING MAX(data_vencimento) < CURRENT_DATE + INTERVAL '12 months'`,
    );

    let totalEstendidos = 0;
    let totalContas = 0;

    for (const g of grupos) {
      // Pega um template a partir de qualquer linha do grupo (todas iguais
      // exceto data_vencimento e recorrencia_indice).
      const { rows: tpl } = await client.query(
        `SELECT descricao, fornecedor_nome, fornecedor_documento,
                categoria_id, valor, observacoes, comprovante_url,
                criado_por_id
           FROM contas_pagar
          WHERE grupo_recorrencia_id = $1
          LIMIT 1`,
        [g.grupo_id],
      );
      if (!tpl[0]) continue;

      // Próxima data = última + passo
      const passo = PASSO_MESES[g.tipo];
      const proxData = adicionarMeses(new Date(`${g.ultimo_vencimento.toISOString?.().slice(0, 10) || g.ultimo_vencimento}T12:00:00Z`), passo);

      // Gera mais 12 ocorrências
      const novas = calcularOcorrencias({
        dataInicio: ymd(proxData),
        tipo: g.tipo,
        qtd: null, ate: null,
        indiceInicial: Number(g.ultimo_indice) + 1,
        maxAdicional: 12,
      });

      for (const oc of novas) {
        await client.query(
          `INSERT INTO contas_pagar (
             descricao, fornecedor_nome, fornecedor_documento,
             categoria_id, valor, data_vencimento,
             observacoes, comprovante_url, criado_por_id,
             grupo_recorrencia_id, recorrencia_tipo,
             recorrencia_qtd, recorrencia_ate, recorrencia_indice
           ) VALUES ($1,$2,$3, $4,$5,$6, $7,$8,$9, $10,$11, $12,$13,$14)`,
          [
            tpl[0].descricao, tpl[0].fornecedor_nome, tpl[0].fornecedor_documento,
            tpl[0].categoria_id, tpl[0].valor, oc.data,
            tpl[0].observacoes, tpl[0].comprovante_url, tpl[0].criado_por_id,
            g.grupo_id, g.tipo,
            null, null, oc.indice,
          ],
        );
        totalContas += 1;
      }
      totalEstendidos += 1;
    }

    await client.query('COMMIT');
    return { grupos: totalEstendidos, contas: totalContas };
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    throw err;
  } finally {
    client.release();
  }
}
