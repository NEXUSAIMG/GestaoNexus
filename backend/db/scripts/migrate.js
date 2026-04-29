/**
 * Script de migração.
 *
 * Lê todos os arquivos .sql de db/migrations em ordem alfabética
 * e roda os que ainda não foram aplicados (registrados na tabela
 * registro_migrations).
 *
 * Uso: npm run migrate
 */
import path from 'node:path';
import fs from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { pool, query, closePool } from '../../src/config/database.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const MIGRATIONS_DIR = path.resolve(__dirname, '../migrations');

async function garantirTabelaDeControle() {
  await query(`
    CREATE TABLE IF NOT EXISTS registro_migrations (
      nome      VARCHAR(255) PRIMARY KEY,
      rodada_em TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `);
}

async function jaFoiRodada(nome) {
  const { rows } = await query('SELECT 1 FROM registro_migrations WHERE nome = $1', [nome]);
  return rows.length > 0;
}

async function rodar() {
  console.log('[migrate] Conectando ao banco...');
  await garantirTabelaDeControle();

  const arquivos = (await fs.readdir(MIGRATIONS_DIR))
    .filter((f) => f.endsWith('.sql'))
    .sort();

  if (arquivos.length === 0) {
    console.log('[migrate] Nenhuma migration encontrada.');
    return;
  }

  for (const arquivo of arquivos) {
    if (await jaFoiRodada(arquivo)) {
      console.log(`[migrate] ↷ pulando ${arquivo} (já aplicada)`);
      continue;
    }

    const caminho = path.join(MIGRATIONS_DIR, arquivo);
    const sql = await fs.readFile(caminho, 'utf8');

    console.log(`[migrate] ▶ aplicando ${arquivo}...`);
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      await client.query(sql);
      await client.query(
        'INSERT INTO registro_migrations (nome) VALUES ($1) ON CONFLICT DO NOTHING',
        [arquivo],
      );
      await client.query('COMMIT');
      console.log(`[migrate] ✓ ${arquivo} aplicada`);
    } catch (err) {
      await client.query('ROLLBACK');
      console.error(`[migrate] ✗ falha em ${arquivo}:`, err.message);
      throw err;
    } finally {
      client.release();
    }
  }

  console.log('[migrate] Concluído.');
}

rodar()
  .catch((err) => {
    console.error('[migrate] Erro:', err);
    process.exitCode = 1;
  })
  .finally(closePool);
