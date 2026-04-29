import pg from 'pg';
import { env, isProduction } from './env.js';

const { Pool } = pg;

/**
 * Decide se SSL é necessário pra esta conexão.
 *
 * Liga SSL quando:
 *   - estamos em produção (Railway força SSL),
 *   - OU a connection string contém 'sslmode=require' (Neon, Supabase, dbaas.com.br),
 *   - OU o host NÃO é localhost/127.0.0.1 (qualquer banco remoto exige SSL).
 *
 * Quando SSL está ligado, usamos `rejectUnauthorized: false` + `checkServerIdentity`
 * desabilitado pra aceitar:
 *   - certificados gerenciados pela plataforma (Railway, Neon, dbaas.com.br)
 *   - certificados auto-assinados
 *   - certificados expirados (comum em DBaaS quando o provedor atrasa rotação)
 *
 * O servidor ainda criptografa o tráfego em trânsito — só não validamos
 * a autoridade que emitiu o certificado nem sua data. Aceitável pra
 * conexão de aplicação a banco gerenciado onde o host é confiável.
 *
 * NOTA sobre `pg-connection-string`: a partir do pg v8.13, `sslmode=require`
 * na URL é tratado como `verify-full`. Pra evitar que isso sobreponha
 * nossa configuração de pool, removemos `?sslmode=...` da URL e configuramos
 * o SSL apenas via objeto.
 */
function configurarPool(url) {
  if (!url) {
    throw new Error('DATABASE_URL não definida');
  }

  let ehLocalhost = false;
  let urlSemSslMode = url;

  try {
    const u = new URL(url);
    ehLocalhost = u.hostname === 'localhost' || u.hostname === '127.0.0.1';
    // Remove parâmetros de SSL da URL pra evitar conflito com nosso objeto ssl
    u.searchParams.delete('sslmode');
    u.searchParams.delete('ssl');
    urlSemSslMode = u.toString();
  } catch {
    // URL malformada — deixa o pg reclamar depois
  }

  const precisaSSL = isProduction
    || url.includes('sslmode=require')
    || url.includes('sslmode=prefer')
    || (!ehLocalhost && url.startsWith('postgres'));

  return {
    connectionString: urlSemSslMode,
    ssl: precisaSSL
      ? {
          // Não rejeita certificados não autorizados (cadeia de confiança).
          rejectUnauthorized: false,
          // Desabilita verificação de hostname e validade.
          // Aceita certificados expirados — comum em DBaaS gerenciado.
          checkServerIdentity: () => undefined,
        }
      : false,
    max: 10,
    idleTimeoutMillis: 30_000,
    connectionTimeoutMillis: 5_000,
  };
}

// Pool único compartilhado em toda a aplicação.
export const pool = new Pool(configurarPool(env.DATABASE_URL));

pool.on('error', (err) => {
  console.error('[db] Erro inesperado no pool do Postgres:', err);
});

/**
 * Helper para executar uma query com parâmetros.
 * Uso: const { rows } = await query('SELECT * FROM socios WHERE id = $1', [id]);
 */
export async function query(text, params) {
  return pool.query(text, params);
}

/**
 * Fecha o pool. Usado em scripts que rodam e saem (migrate, seed).
 */
export async function closePool() {
  await pool.end();
}
