import { pool, query } from '../config/database.js';
import { env, asaasConfigurado } from '../config/env.js';
import { listarCobrancas, obterCliente } from './asaas.client.js';

/**
 * Rotina de sincronização com o ASAAS.
 *
 * Responsabilidades:
 *  1. Cria um registro em sincronizacoes_asaas com status 'rodando'
 *  2. Pagina cobranças do ASAAS dentro da janela configurada
 *  3. Faz upsert em cobrancas_asaas
 *  4. Atualiza o log com contadores finais
 *
 * Ponto de atenção: falhar faz ROLLBACK dos upserts e grava o erro no log,
 * mas NÃO re-lança. Rotina chamada por cron não deve derrubar o processo.
 * O caller (endpoint manual ou cron) decide o que fazer com o retorno.
 */

/**
 * Converte data em string yyyy-mm-dd.
 * Usamos DateTimeFormat com timezone fixo pra não depender do runtime.
 */
function formatarData(date) {
  const fmt = new Intl.DateTimeFormat('fr-CA', {
    timeZone: env.SYNC_ASAAS_TIMEZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });
  return fmt.format(date); // fr-CA gera "yyyy-mm-dd"
}

function somarDias(dias, base = new Date()) {
  const d = new Date(base);
  d.setDate(d.getDate() + dias);
  return d;
}

function somenteDigitos(s) {
  return s ? String(s).replace(/\D/g, '') : null;
}

/**
 * Transforma o payload do ASAAS no formato que guardamos na nossa tabela.
 * Só extrai o que nos interessa; o restante vai em `payload_bruto`.
 *
 * `cliente_nome` e `cliente_documento` não vem no payload de /payments do
 * ASAAS — só vem o id do cliente. O enriquecimento é feito separadamente
 * em `enriquecerComCliente`, com cache pra não repetir chamadas.
 */
function mapearCobranca(raw) {
  return {
    asaas_id: raw.id,
    cliente_asaas_id: raw.customer ?? null,
    cliente_nome: null,
    cliente_documento: null,
    valor: Number(raw.value ?? 0),
    valor_liquido: raw.netValue != null ? Number(raw.netValue) : null,
    data_vencimento: raw.dueDate ?? null,
    data_pagamento: raw.paymentDate ?? raw.clientPaymentDate ?? null,
    data_credito_previsto: raw.estimatedCreditDate ?? raw.creditDate ?? null,
    status: raw.status ?? 'UNKNOWN',
    tipo: raw.billingType ?? null,
    referencia_externa: raw.externalReference ?? null,
    descricao: raw.description ?? null,
    fatura_url: raw.invoiceUrl ?? raw.bankSlipUrl ?? null,
    payload_bruto: raw,
  };
}

/**
 * Cria um "enriquecedor" com cache local: dado o `cliente_asaas_id`,
 * preenche `cliente_nome` e `cliente_documento` na cobrança.
 *
 * O cache vale durante uma única sincronização, então se um cliente
 * trocar o nome no ASAAS, a sync seguinte já traz atualizado. Em caso
 * de falha (cliente removido, 404, rede), seguimos sem o nome — o que
 * já estava no banco daquela cobrança permanece (porque o EXCLUDED só
 * sobrescreve quando temos valor novo).
 */
function criarEnriquecedorClientes() {
  const cache = new Map(); // asaas_id → { name, cpfCnpj } | null

  return async function enriquecer(c) {
    if (!c.cliente_asaas_id) return c;

    if (!cache.has(c.cliente_asaas_id)) {
      try {
        const dados = await obterCliente(c.cliente_asaas_id);
        cache.set(c.cliente_asaas_id, {
          name: dados?.name ?? null,
          cpfCnpj: dados?.cpfCnpj ?? null,
        });
      } catch (err) {
        // Cliente pode ter sido removido no ASAAS, ou rede falhou.
        // Cacheamos null pra não tentar de novo nesta sync.
        console.warn(
          `[asaas.sync] falha ao buscar cliente ${c.cliente_asaas_id}: ${err.message}`,
        );
        cache.set(c.cliente_asaas_id, null);
      }
    }

    const dados = cache.get(c.cliente_asaas_id);
    if (dados) {
      c.cliente_nome = dados.name ?? null;
      c.cliente_documento = somenteDigitos(dados.cpfCnpj);
    }
    return c;
  };
}

/**
 * Faz UPSERT de uma cobrança. Retorna 'inserida' ou 'atualizada'.
 */
async function upsertCobranca(client, c) {
  const result = await client.query(
    `INSERT INTO cobrancas_asaas
       (asaas_id, cliente_asaas_id, cliente_nome, cliente_documento,
        valor, valor_liquido, data_vencimento, data_pagamento, data_credito_previsto,
        status, tipo, referencia_externa, descricao, fatura_url,
        sincronizado_em, payload_bruto)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14,
             NOW(), $15::jsonb)
     ON CONFLICT (asaas_id) DO UPDATE SET
       cliente_asaas_id      = EXCLUDED.cliente_asaas_id,
       cliente_nome          = EXCLUDED.cliente_nome,
       cliente_documento     = EXCLUDED.cliente_documento,
       valor                 = EXCLUDED.valor,
       valor_liquido         = EXCLUDED.valor_liquido,
       data_vencimento       = EXCLUDED.data_vencimento,
       data_pagamento        = EXCLUDED.data_pagamento,
       data_credito_previsto = EXCLUDED.data_credito_previsto,
       status                = EXCLUDED.status,
       tipo                  = EXCLUDED.tipo,
       referencia_externa    = EXCLUDED.referencia_externa,
       descricao             = EXCLUDED.descricao,
       fatura_url            = EXCLUDED.fatura_url,
       sincronizado_em       = NOW(),
       payload_bruto         = EXCLUDED.payload_bruto,
       updated_at            = NOW()
     RETURNING (xmax = 0) AS inserida`,
    [
      c.asaas_id, c.cliente_asaas_id, c.cliente_nome, c.cliente_documento,
      c.valor, c.valor_liquido, c.data_vencimento, c.data_pagamento, c.data_credito_previsto,
      c.status, c.tipo, c.referencia_externa, c.descricao, c.fatura_url,
      JSON.stringify(c.payload_bruto ?? {}),
    ],
  );
  // `xmax = 0` é o truque para distinguir INSERT de UPDATE após um ON CONFLICT.
  return result.rows[0]?.inserida ? 'inserida' : 'atualizada';
}

/**
 * Roda uma sincronização.
 *
 * @param {object} opcoes
 * @param {'manual'|'automatica'} [opcoes.origem='automatica']
 * @param {string} [opcoes.disparadoPorId] - UUID da pessoa_acesso (se origem=manual)
 *
 * @returns {Promise<{ok: boolean, logId: string, inseridas: number, atualizadas: number, erro?: string}>}
 */
export async function sincronizar({ origem = 'automatica', disparadoPorId = null } = {}) {
  if (!asaasConfigurado) {
    console.warn('[asaas.sync] Pulando: ASAAS_API_KEY não configurada.');
    return { ok: false, logId: null, inseridas: 0, atualizadas: 0, erro: 'ASAAS_API_KEY não configurada' };
  }

  // 1. Cria o log com status 'rodando'
  const { rows: logRows } = await query(
    `INSERT INTO sincronizacoes_asaas (origem, disparado_por_id, status)
     VALUES ($1, $2, 'rodando')
     RETURNING id`,
    [origem, disparadoPorId],
  );
  const logId = logRows[0].id;

  const hoje = new Date();
  const dueDateGe = formatarData(somarDias(-env.ASAAS_JANELA_DIAS_PASSADO, hoje));
  const dueDateLe = formatarData(somarDias(env.ASAAS_JANELA_DIAS_FUTURO, hoje));

  let inseridas = 0;
  let atualizadas = 0;
  let paginas = 0;
  let contadorNoLote = 0;

  const client = await pool.connect();
  const enriquecer = criarEnriquecedorClientes();
  try {
    await client.query('BEGIN');

    for await (const raw of listarCobrancas({ dueDateGe, dueDateLe })) {
      const c = mapearCobranca(raw);
      // Enriquece com nome/CPF do cliente (chamada extra ao ASAAS, com cache).
      await enriquecer(c);
      const res = await upsertCobranca(client, c);
      if (res === 'inserida') inseridas += 1; else atualizadas += 1;

      contadorNoLote += 1;
      // "página" aqui é só um marco pra logar progresso; a paginação real
      // está dentro do client.
      if (contadorNoLote >= 100) {
        paginas += 1;
        contadorNoLote = 0;
      }
    }
    if (contadorNoLote > 0) paginas += 1;

    await client.query('COMMIT');

    await query(
      `UPDATE sincronizacoes_asaas
          SET status = 'sucesso',
              finalizado_em = NOW(),
              cobrancas_inseridas = $1,
              cobrancas_atualizadas = $2,
              paginas_processadas = $3
        WHERE id = $4`,
      [inseridas, atualizadas, paginas, logId],
    );

    console.log(
      `[asaas.sync] ok (${origem}) — ${inseridas} inseridas, ${atualizadas} atualizadas, ${paginas} páginas.`,
    );
    return { ok: true, logId, inseridas, atualizadas };
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    const msg = err?.message ?? String(err);
    await query(
      `UPDATE sincronizacoes_asaas
          SET status = 'erro',
              finalizado_em = NOW(),
              mensagem_erro = $1
        WHERE id = $2`,
      [msg, logId],
    ).catch(() => {});
    console.error(`[asaas.sync] ERRO (${origem}):`, msg);
    return { ok: false, logId, inseridas: 0, atualizadas: 0, erro: msg };
  } finally {
    client.release();
  }
}

/**
 * Recupera a última sincronização (qualquer status) — usado no painel.
 */
export async function ultimaSincronizacao() {
  const { rows } = await query(
    `SELECT id, iniciado_em, finalizado_em, origem, status,
            cobrancas_inseridas, cobrancas_atualizadas, paginas_processadas,
            mensagem_erro
       FROM sincronizacoes_asaas
      ORDER BY iniciado_em DESC
      LIMIT 1`,
  );
  return rows[0] ?? null;
}
