/**
 * Serviço de sincronização do portfólio de produtos — Sprint 16.
 *
 * Cada produto pode ter integração 'manual' (não sincroniza) ou 'api_rest'
 * (puxa snapshot de um endpoint do próprio produto).
 *
 * Contrato esperado do endpoint do produto-fonte (ex: SeuCartorio):
 *
 *   GET {url_base}/portfolio-snapshot
 *   Authorization: Bearer {api_key}
 *
 *   Resposta 200 OK:
 *   {
 *     "ano_mes": "2026-04",
 *     "metricas": {
 *       "mrr": 12500.00,
 *       "receita_no_mes": 9800.00,
 *       "clientes_ativos": 42,
 *       "clientes_trial": 5,
 *       "clientes_suspensos": 2,
 *       "novos_clientes": 7,
 *       "cancelamentos": 3,
 *       "tickets_abertos": 4,
 *       "tickets_resolvidos": 18,
 *       "avaliacao_media": 4.6,
 *       "visitantes_landing": null,
 *       "trials_iniciados": null
 *     },
 *     "clientes": [
 *       {
 *         "externo_id": "uuid-da-empresa-no-produto",
 *         "nome": "Cartório do Centro",
 *         "documento": "12.345.678/0001-90",
 *         "email": "contato@cartoriocentro.com.br",
 *         "cidade": "São Paulo",
 *         "estado": "SP",
 *         "plano_nome": "Profissional",
 *         "valor_mensal": 297.00,
 *         "status": "ATIVA",
 *         "data_inicio": "2025-08-15",
 *         "data_proximo_pagamento": "2026-05-10"
 *       }
 *     ]
 *   }
 *
 * Estratégia de gravação (transacional):
 *   1. UPSERT em produtos_metricas_mensais (chave: produto_id + ano_mes)
 *   2. DELETE FROM produtos_clientes WHERE produto_id = X
 *   3. INSERT lista nova
 *   4. Atualiza produtos_integracoes.ultima_sync_*
 *   5. Grava log
 */

import { pool } from '../config/database.js';

const TIMEOUT_MS = 30_000;

/**
 * Sincroniza um produto. Retorna o resultado (ou lança).
 *
 * @param {object} args
 * @param {string} args.produtoId
 * @param {'cron'|'manual'} args.origem
 * @param {string} [args.disparadoPorId]
 */
export async function sincronizarProduto({ produtoId, origem, disparadoPorId = null }) {
  const client = await pool.connect();
  let logId = null;

  try {
    // 1. Confere integração
    const { rows: integ } = await client.query(
      `SELECT pi.*, p.nome AS produto_nome
         FROM produtos_integracoes pi
         JOIN produtos p ON p.id = pi.produto_id
        WHERE pi.produto_id = $1`,
      [produtoId],
    );
    const cfg = integ[0];
    if (!cfg) throw new Error('Produto não tem integração configurada.');
    if (cfg.tipo !== 'api_rest') {
      throw new Error(`Produto está em modo "${cfg.tipo}" (não sincroniza automaticamente).`);
    }
    if (!cfg.ativa) throw new Error('Integração desativada.');
    if (!cfg.url_base || !cfg.api_key) {
      throw new Error('Integração incompleta: url_base e api_key são obrigatórios.');
    }

    // 2. Cria log "em_andamento"
    const inicioMs = Date.now();
    const { rows: logIns } = await client.query(
      `INSERT INTO produtos_sync_logs (produto_id, origem, disparado_por_id, status)
       VALUES ($1, $2, $3, 'em_andamento')
       RETURNING id`,
      [produtoId, origem, disparadoPorId],
    );
    logId = logIns[0].id;

    // 3. Faz fetch
    const url = `${cfg.url_base.replace(/\/$/, '')}/portfolio-snapshot`;
    const ctrl = new AbortController();
    const timeout = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
    let resp;
    try {
      resp = await fetch(url, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${cfg.api_key}`,
          'Accept': 'application/json',
        },
        signal: ctrl.signal,
      });
    } catch (err) {
      throw new Error(`Falha de rede: ${err.message}`);
    } finally {
      clearTimeout(timeout);
    }

    if (!resp.ok) {
      const corpo = await resp.text().catch(() => '');
      throw new Error(`Endpoint retornou ${resp.status}. Corpo: ${corpo.slice(0, 300)}`);
    }

    const dados = await resp.json().catch(() => {
      throw new Error('Resposta não é JSON válido.');
    });

    // 4. Valida payload mínimo
    if (!dados.ano_mes || !/^\d{4}-\d{2}$/.test(dados.ano_mes)) {
      throw new Error('Payload sem ano_mes válido (esperado YYYY-MM).');
    }
    if (!dados.metricas || typeof dados.metricas !== 'object') {
      throw new Error('Payload sem objeto metricas.');
    }
    if (!Array.isArray(dados.clientes)) {
      throw new Error('Payload sem array clientes.');
    }

    // 5. Grava em transação
    await client.query('BEGIN');

    const m = dados.metricas;
    const ticketMedio = (Number(m.clientes_ativos) > 0)
      ? Number(m.mrr || 0) / Number(m.clientes_ativos)
      : 0;
    const churnPct = (Number(m.clientes_ativos) > 0)
      ? (Number(m.cancelamentos || 0) / Number(m.clientes_ativos)) * 100
      : 0;
    const conversaoPct = (Number(m.visitantes_landing) > 0)
      ? (Number(m.trials_iniciados || 0) / Number(m.visitantes_landing)) * 100
      : null;

    await client.query(
      `INSERT INTO produtos_metricas_mensais (
         produto_id, ano_mes,
         mrr, receita_no_mes, ticket_medio,
         clientes_ativos, clientes_trial, clientes_suspensos,
         novos_clientes, cancelamentos, churn_pct,
         visitantes_landing, trials_iniciados, conversao_pct,
         tickets_abertos, tickets_resolvidos, avaliacao_media,
         atualizado_em
       )
       VALUES ($1, $2,
               $3, $4, $5,
               $6, $7, $8,
               $9, $10, $11,
               $12, $13, $14,
               $15, $16, $17,
               NOW())
       ON CONFLICT (produto_id, ano_mes) DO UPDATE SET
         mrr = EXCLUDED.mrr,
         receita_no_mes = EXCLUDED.receita_no_mes,
         ticket_medio = EXCLUDED.ticket_medio,
         clientes_ativos = EXCLUDED.clientes_ativos,
         clientes_trial = EXCLUDED.clientes_trial,
         clientes_suspensos = EXCLUDED.clientes_suspensos,
         novos_clientes = EXCLUDED.novos_clientes,
         cancelamentos = EXCLUDED.cancelamentos,
         churn_pct = EXCLUDED.churn_pct,
         visitantes_landing = EXCLUDED.visitantes_landing,
         trials_iniciados = EXCLUDED.trials_iniciados,
         conversao_pct = EXCLUDED.conversao_pct,
         tickets_abertos = EXCLUDED.tickets_abertos,
         tickets_resolvidos = EXCLUDED.tickets_resolvidos,
         avaliacao_media = EXCLUDED.avaliacao_media,
         atualizado_em = NOW()`,
      [
        produtoId, dados.ano_mes,
        Number(m.mrr || 0), Number(m.receita_no_mes || 0), ticketMedio,
        Number(m.clientes_ativos || 0), Number(m.clientes_trial || 0), Number(m.clientes_suspensos || 0),
        Number(m.novos_clientes || 0), Number(m.cancelamentos || 0), churnPct,
        m.visitantes_landing != null ? Number(m.visitantes_landing) : null,
        m.trials_iniciados != null ? Number(m.trials_iniciados) : null,
        conversaoPct,
        Number(m.tickets_abertos || 0), Number(m.tickets_resolvidos || 0),
        m.avaliacao_media != null ? Number(m.avaliacao_media) : null,
      ],
    );

    // Replace-all dos clientes
    await client.query(`DELETE FROM produtos_clientes WHERE produto_id = $1`, [produtoId]);
    for (const c of dados.clientes) {
      if (!c.externo_id || !c.nome) continue; // skip inválido
      await client.query(
        `INSERT INTO produtos_clientes (
           produto_id, externo_id, nome, documento, email,
           cidade, estado, plano_nome, valor_mensal,
           status, data_inicio, data_proximo_pagamento, atualizado_em
         ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,NOW())
         ON CONFLICT (produto_id, externo_id) DO NOTHING`,
        [
          produtoId, String(c.externo_id), String(c.nome).trim(),
          c.documento || null, c.email || null,
          c.cidade || null, c.estado || null,
          c.plano_nome || null,
          c.valor_mensal != null ? Number(c.valor_mensal) : null,
          c.status || null,
          c.data_inicio || null,
          c.data_proximo_pagamento || null,
        ],
      );
    }

    // Atualiza integracao
    await client.query(
      `UPDATE produtos_integracoes
          SET ultima_sync_em = NOW(),
              ultima_sync_status = 'ok',
              ultima_sync_erro = NULL,
              atualizado_em = NOW()
        WHERE produto_id = $1`,
      [produtoId],
    );

    // Fecha log
    const duracaoMs = Date.now() - inicioMs;
    await client.query(
      `UPDATE produtos_sync_logs
          SET concluido_em = NOW(),
              status = 'ok',
              http_status = $2,
              duracao_ms = $3,
              qtd_clientes = $4,
              resumo = $5
        WHERE id = $1`,
      [
        logId, resp.status, duracaoMs, dados.clientes.length,
        JSON.stringify({ ano_mes: dados.ano_mes, metricas: dados.metricas }),
      ],
    );

    await client.query('COMMIT');

    return {
      ok: true,
      ano_mes: dados.ano_mes,
      qtd_clientes: dados.clientes.length,
      duracao_ms: duracaoMs,
    };
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});

    // Marca como erro (fora da transação que rollou)
    if (logId) {
      await pool.query(
        `UPDATE produtos_sync_logs
            SET concluido_em = NOW(), status = 'erro', erro_mensagem = $2
          WHERE id = $1`,
        [logId, String(err.message).slice(0, 2000)],
      ).catch(() => {});
    }
    await pool.query(
      `UPDATE produtos_integracoes
          SET ultima_sync_em = NOW(),
              ultima_sync_status = 'erro',
              ultima_sync_erro = $2,
              atualizado_em = NOW()
        WHERE produto_id = $1`,
      [produtoId, String(err.message).slice(0, 2000)],
    ).catch(() => {});

    throw err;
  } finally {
    client.release();
  }
}

/**
 * Sincroniza TODOS os produtos com integração ativa.
 * Usado pelo cron. Erro num não impede sincronizar os outros.
 */
export async function sincronizarTodos({ origem = 'cron' } = {}) {
  const { rows } = await pool.query(
    `SELECT produto_id FROM produtos_integracoes
      WHERE tipo = 'api_rest' AND ativa = TRUE`,
  );
  const resultados = [];
  for (const r of rows) {
    try {
      const r2 = await sincronizarProduto({ produtoId: r.produto_id, origem });
      resultados.push({ produto_id: r.produto_id, ...r2 });
    } catch (err) {
      resultados.push({ produto_id: r.produto_id, ok: false, erro: err.message });
    }
  }
  return resultados;
}
