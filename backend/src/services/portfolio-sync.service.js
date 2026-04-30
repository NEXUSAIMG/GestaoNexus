/**
 * Serviço de sincronização do portfólio de produtos — Sprint 16 Fase B.
 *
 * Como funciona:
 *   1. Lê produtos da tabela `produtos` cuja `fonte_dados` indica integração
 *      (ex: 'seu_cartorio').
 *   2. Pra cada um, faz fetch no endpoint correspondente do produto-fonte,
 *      autenticando com X-API-Key (env vars).
 *   3. UPSERT em `produtos_metricas_mensais` (por produto_id + mes).
 *   4. UPSERT em `produtos_clientes` (por produto_id + externo_id).
 *   5. Atualiza `produtos.sincronizado_em`.
 *
 * Idempotente: rodar várias vezes no mesmo dia não duplica nada.
 *
 * Configuração:
 *   Cada fonte tem seu par (URL, API_KEY) em env vars. Hoje só temos
 *   o SeuCartorio (`SEU_CARTORIO_URL` + `SEU_CARTORIO_API_KEY`).
 *
 * Erros num produto não impedem sincronizar os outros — a função
 * `sincronizarTodos()` pega individualmente e segue.
 */

import { pool } from '../config/database.js';
import { env } from '../config/env.js';

const TIMEOUT_MS = 30_000;

// =============================================================================
// Mapa de fontes de dados
// =============================================================================
//
// Cada fonte sabe como construir a URL do endpoint e qual API key usar.
// Adicionar uma nova fonte = adicionar uma entrada aqui (e env vars).

function fontesDisponiveis() {
  return {
    seu_cartorio: {
      base_url: env.SEU_CARTORIO_URL,
      api_key: env.SEU_CARTORIO_API_KEY,
      // Quantos meses de histórico puxar a cada sync. Sync diário só
      // precisa atualizar o mês corrente, mas pra primeira sincronização
      // queremos histórico — o endpoint manual passa ?meses=N maior.
    },
  };
}

function fonteEstaConfigurada(fonteDados) {
  const fonte = fontesDisponiveis()[fonteDados];
  return !!(fonte && fonte.base_url && fonte.api_key);
}

// =============================================================================
// Sincronização de UM produto
// =============================================================================

/**
 * Sincroniza um produto específico.
 *
 * @param {object} args
 * @param {string} args.produtoId
 * @param {number} [args.meses=1]   quantos meses de histórico puxar
 * @returns {Promise<{ok, qtd_clientes, qtd_metricas, duracao_ms}>}
 */
export async function sincronizarProduto({ produtoId, meses = 1 }) {
  const inicioMs = Date.now();
  const client = await pool.connect();

  try {
    // 1. Busca config do produto
    const { rows } = await client.query(
      `SELECT id, nome, slug, fonte_dados
         FROM produtos
        WHERE id = $1 AND arquivado_em IS NULL`,
      [produtoId],
    );
    const produto = rows[0];
    if (!produto) throw new Error('Produto não encontrado ou arquivado.');

    if (produto.fonte_dados === 'manual') {
      throw new Error(
        'Produto está em modo manual. Pra sincronizar, edite o produto e ' +
        'mude "fonte_dados" pra "seu_cartorio".',
      );
    }

    if (!fonteEstaConfigurada(produto.fonte_dados)) {
      throw new Error(
        `Fonte "${produto.fonte_dados}" não está configurada no servidor ` +
        `(verifique env vars SEU_CARTORIO_URL e SEU_CARTORIO_API_KEY).`,
      );
    }

    const fonte = fontesDisponiveis()[produto.fonte_dados];

    // 2. Faz fetch no endpoint
    const url = new URL('/api/integracoes/portfolio', fonte.base_url);
    url.searchParams.set('meses', String(Math.max(1, Math.min(meses, 24))));
    url.searchParams.set('incluir_clientes', 'true');

    const ctrl = new AbortController();
    const timeoutId = setTimeout(() => ctrl.abort(), TIMEOUT_MS);

    let resp;
    try {
      resp = await fetch(url.toString(), {
        method: 'GET',
        headers: {
          'X-API-Key': fonte.api_key,
          Accept: 'application/json',
        },
        signal: ctrl.signal,
      });
    } catch (err) {
      throw new Error(`Falha de rede: ${err.message}`);
    } finally {
      clearTimeout(timeoutId);
    }

    if (!resp.ok) {
      const corpo = await resp.text().catch(() => '');
      throw new Error(`Endpoint retornou HTTP ${resp.status}. ${corpo.slice(0, 300)}`);
    }

    const dados = await resp.json().catch(() => {
      throw new Error('Resposta não é JSON válido.');
    });

    // 3. Valida payload
    if (!Array.isArray(dados.metricas_mensais)) {
      throw new Error('Payload sem metricas_mensais.');
    }
    if (!Array.isArray(dados.clientes) && dados.clientes !== null) {
      throw new Error('Payload com clientes inválido (esperado array ou null).');
    }

    // 4. Grava em transação
    await client.query('BEGIN');

    let qtdMetricas = 0;
    for (const m of dados.metricas_mensais) {
      if (!m.mes || !/^\d{4}-\d{2}-01$/.test(m.mes)) continue;

      await client.query(
        `INSERT INTO produtos_metricas_mensais (
           produto_id, mes,
           mrr, receita_total,
           clientes_ativos, novos_clientes, churn_clientes, churn_mrr,
           tickets_abertos, tickets_resolvidos,
           visitantes_landing, trials_iniciados, conversoes,
           observacao
         ) VALUES (
           $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14
         )
         ON CONFLICT (produto_id, mes) DO UPDATE SET
           mrr = EXCLUDED.mrr,
           receita_total = EXCLUDED.receita_total,
           clientes_ativos = EXCLUDED.clientes_ativos,
           novos_clientes = EXCLUDED.novos_clientes,
           churn_clientes = EXCLUDED.churn_clientes,
           churn_mrr = EXCLUDED.churn_mrr,
           tickets_abertos = EXCLUDED.tickets_abertos,
           tickets_resolvidos = EXCLUDED.tickets_resolvidos,
           visitantes_landing = EXCLUDED.visitantes_landing,
           trials_iniciados = EXCLUDED.trials_iniciados,
           conversoes = EXCLUDED.conversoes,
           atualizado_em = NOW()`,
        [
          produtoId, m.mes,
          Number(m.mrr || 0),
          Number(m.receita_total || 0),
          Number(m.clientes_ativos || 0),
          Number(m.novos_clientes || 0),
          Number(m.churn_clientes || 0),
          Number(m.churn_mrr || 0),
          Number(m.tickets_abertos || 0),
          Number(m.tickets_resolvidos || 0),
          Number(m.visitantes_landing || 0),
          Number(m.trials_iniciados || 0),
          Number(m.conversoes || 0),
          // Observação só anota que foi sync automático na primeira inserção;
          // em UPDATE preserva o valor existente. Por isso fica fora do
          // SET acima.
          'Sincronizado automaticamente do ' + produto.fonte_dados,
        ],
      );
      qtdMetricas++;
    }

    // 5. Sincroniza clientes nominais (UPSERT por externo_id)
    let qtdClientes = 0;
    if (Array.isArray(dados.clientes)) {
      for (const c of dados.clientes) {
        if (!c.externo_id || !c.nome) continue;

        await client.query(
          `INSERT INTO produtos_clientes (
             produto_id, externo_id, nome,
             documento, email, telefone,
             plano, valor_mensal,
             data_inicio, data_fim, status,
             origem
           ) VALUES (
             $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12
           )
           ON CONFLICT (produto_id, externo_id)
             WHERE externo_id IS NOT NULL
             DO UPDATE SET
               nome = EXCLUDED.nome,
               documento = EXCLUDED.documento,
               email = EXCLUDED.email,
               telefone = EXCLUDED.telefone,
               plano = EXCLUDED.plano,
               valor_mensal = EXCLUDED.valor_mensal,
               data_inicio = EXCLUDED.data_inicio,
               data_fim = EXCLUDED.data_fim,
               status = EXCLUDED.status,
               origem = EXCLUDED.origem,
               atualizado_em = NOW()`,
          [
            produtoId, String(c.externo_id), String(c.nome).trim(),
            c.documento || null, c.email || null, c.telefone || null,
            c.plano || null,
            c.valor_mensal != null ? Number(c.valor_mensal) : null,
            c.data_inicio || null, c.data_fim || null,
            c.status || 'ativo',
            c.origem || null,
          ],
        );
        qtdClientes++;
      }
    }

    // 6. Atualiza timestamp do sync no produto
    await client.query(
      `UPDATE produtos SET sincronizado_em = NOW(), atualizado_em = NOW()
        WHERE id = $1`,
      [produtoId],
    );

    await client.query('COMMIT');

    return {
      ok: true,
      qtd_metricas: qtdMetricas,
      qtd_clientes: qtdClientes,
      duracao_ms: Date.now() - inicioMs,
    };
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    throw err;
  } finally {
    client.release();
  }
}

// =============================================================================
// Migration: a tabela produtos_clientes precisa de UNIQUE(produto_id, externo_id)
// pra ON CONFLICT funcionar. A migration 014 não tem isso ainda — vou
// adicionar uma 015. Aqui só checa.
// =============================================================================

/**
 * Sincroniza TODOS os produtos com fonte_dados configurada.
 * Usado pelo cron. Erros num produto não impedem os outros.
 */
export async function sincronizarTodos({ origem = 'cron' } = {}) {
  // Pega todos os produtos não-arquivados com fonte != manual
  const { rows } = await pool.query(
    `SELECT id, nome, fonte_dados
       FROM produtos
      WHERE arquivado_em IS NULL AND fonte_dados <> 'manual'`,
  );

  if (rows.length === 0) {
    return { tentados: 0, ok: 0, erros: 0, detalhes: [] };
  }

  const detalhes = [];
  let oks = 0;
  let erros = 0;

  for (const p of rows) {
    if (!fonteEstaConfigurada(p.fonte_dados)) {
      detalhes.push({
        produto_id: p.id, nome: p.nome,
        ok: false,
        erro: `Fonte "${p.fonte_dados}" não configurada no servidor`,
      });
      erros++;
      continue;
    }

    try {
      // No cron diário, só puxa o mês corrente. Pra histórico, usa o
      // endpoint manual com ?meses=N.
      const r = await sincronizarProduto({ produtoId: p.id, meses: 1 });
      detalhes.push({ produto_id: p.id, nome: p.nome, ok: true, ...r });
      oks++;
    } catch (err) {
      detalhes.push({
        produto_id: p.id, nome: p.nome,
        ok: false,
        erro: err.message,
      });
      erros++;
      console.error(`[portfolio-sync] Erro sincronizando ${p.nome}:`, err.message);
    }
  }

  return { tentados: rows.length, ok: oks, erros, origem, detalhes };
}

/**
 * Testa só a conectividade (chama /portfolio/health no SeuCartorio).
 * Útil pra um botão "Testar conexão" no admin.
 */
export async function testarFonte(fonteDados) {
  const fonte = fontesDisponiveis()[fonteDados];
  if (!fonte) throw new Error(`Fonte desconhecida: ${fonteDados}`);
  if (!fonte.base_url || !fonte.api_key) {
    throw new Error('Fonte não configurada (env vars vazias).');
  }

  const url = new URL('/api/integracoes/portfolio/health', fonte.base_url);
  const ctrl = new AbortController();
  const timeoutId = setTimeout(() => ctrl.abort(), 5_000);

  try {
    const resp = await fetch(url.toString(), {
      headers: { 'X-API-Key': fonte.api_key },
      signal: ctrl.signal,
    });
    clearTimeout(timeoutId);

    if (!resp.ok) {
      const corpo = await resp.text().catch(() => '');
      return {
        ok: false,
        http_status: resp.status,
        erro: corpo.slice(0, 200) || `HTTP ${resp.status}`,
      };
    }

    const dados = await resp.json().catch(() => null);
    return { ok: true, http_status: 200, dados };
  } catch (err) {
    clearTimeout(timeoutId);
    return { ok: false, erro: err.message };
  }
}
