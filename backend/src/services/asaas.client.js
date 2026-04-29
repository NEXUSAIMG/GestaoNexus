import { env, asaasConfigurado } from '../config/env.js';
import { AppError } from '../utils/errors.js';

/**
 * Cliente HTTP do ASAAS.
 *
 * Fino de propósito: só abstrai auth, construção da URL, paginação e
 * mensagem de erro. As regras de negócio ficam em asaas.sync.js.
 *
 * Docs: https://docs.asaas.com/reference
 */

class AsaasError extends AppError {
  constructor(mensagem, status, payload) {
    super(mensagem, status >= 500 ? 502 : 400, 'asaas_error');
    this.payloadAsaas = payload;
  }
}

function exigirConfigurado() {
  if (!asaasConfigurado) {
    throw new AppError(
      'Integração ASAAS não configurada. Defina ASAAS_API_KEY no .env.',
      503,
      'asaas_nao_configurado',
    );
  }
}

/**
 * Faz GET em qualquer path do ASAAS. Retorna o JSON cru.
 *
 * @param {string} path - ex: "/payments"
 * @param {object} [params] - querystring
 */
async function get(path, params = {}) {
  exigirConfigurado();

  const url = new URL(env.ASAAS_BASE_URL + path);
  for (const [k, v] of Object.entries(params)) {
    if (v !== undefined && v !== null && v !== '') {
      url.searchParams.set(k, String(v));
    }
  }

  let res;
  try {
    res = await fetch(url.toString(), {
      method: 'GET',
      headers: {
        access_token: env.ASAAS_API_KEY,
        accept: 'application/json',
        'user-agent': 'GestaoNexus/0.2 (+sprint2)',
      },
    });
  } catch (err) {
    // Falha de rede. Embrulhamos pra ficar consistente.
    throw new AsaasError(`Falha de rede ao chamar ASAAS: ${err.message}`, 502);
  }

  if (!res.ok) {
    let body = null;
    try { body = await res.json(); } catch { /* corpo pode não ser json */ }
    const msg = body?.errors?.[0]?.description
      || body?.message
      || `ASAAS respondeu ${res.status}`;
    throw new AsaasError(msg, res.status, body);
  }

  return res.json();
}

/**
 * Itera todas as páginas de um endpoint paginado do ASAAS.
 * A API devolve `{ data: [...], hasMore, totalCount, limit, offset }`.
 *
 * O chamador recebe os itens como async iterator — isso evita acumular
 * tudo em memória se vier muita coisa.
 */
async function* paginar(path, params = {}, { limit = 100 } = {}) {
  let offset = 0;
  while (true) {
    const pagina = await get(path, { ...params, limit, offset });
    const lote = pagina.data ?? [];
    for (const item of lote) yield item;

    if (!pagina.hasMore) break;
    offset += lote.length;
    // Guarda contra loops infinitos se a API estiver fora do contrato.
    if (lote.length === 0) break;
  }
}

/**
 * Lista cobranças dentro de uma janela de datas.
 *
 * @param {object} opcoes
 * @param {string} [opcoes.dueDateGe] - yyyy-mm-dd  (vencimento >=)
 * @param {string} [opcoes.dueDateLe] - yyyy-mm-dd  (vencimento <=)
 * @param {string} [opcoes.status]    - filtro ASAAS (PENDING, RECEIVED, ...)
 *
 * Retorna async iterator de cobranças.
 */
export function listarCobrancas(opcoes = {}) {
  return paginar('/payments', {
    'dueDate[ge]': opcoes.dueDateGe,
    'dueDate[le]': opcoes.dueDateLe,
    status: opcoes.status,
  });
}

/**
 * Busca uma cobrança específica. Útil em debug/endpoints de detalhe.
 */
export function obterCobranca(asaasId) {
  return get(`/payments/${asaasId}`);
}

/**
 * Busca um cliente pelo id do ASAAS. Usado pela sync para enriquecer
 * cobranças com nome e CPF/CNPJ — o endpoint /payments não devolve
 * esses campos por padrão, só o id do cliente.
 */
export function obterCliente(asaasId) {
  return get(`/customers/${asaasId}`);
}

/**
 * Ping simples: lista 1 cobrança qualquer. Usamos pra validar a chave.
 * Retorna `{ ok: true }` ou `{ ok: false, erro }`.
 */
export async function testarConexao() {
  if (!asaasConfigurado) {
    return { ok: false, erro: 'ASAAS_API_KEY não definida' };
  }
  try {
    await get('/payments', { limit: 1 });
    return { ok: true };
  } catch (err) {
    return { ok: false, erro: err.message };
  }
}
