#!/usr/bin/env node
/**
 * Importa o backlog "cards_gestaonexus" (27 cards) no quadro
 * "Atividades Estagiários" do GestaoNexus.
 *
 * Usa a MESMA conexão do app (DATABASE_URL do .env), então funciona
 * de onde o backend normalmente conecta (SSL já tratado).
 *
 * Como rodar (na raiz do projeto OU dentro de backend/):
 *     node importar-cards.js
 *
 * É idempotente: rodar de novo NÃO duplica cards.
 */
const fs = require('fs');
const path = require('path');

// 1) Carrega DATABASE_URL do .env (tenta backend/.env e ./.env)
function carregarEnv() {
  if (process.env.DATABASE_PUBLIC_URL || process.env.DATABASE_URL) return;
  const candidatos = [
    path.join(__dirname, 'backend', '.env'),
    path.join(__dirname, '.env'),
    path.join(process.cwd(), 'backend', '.env'),
    path.join(process.cwd(), '.env'),
  ];
  for (const p of candidatos) {
    if (fs.existsSync(p)) {
      for (const linha of fs.readFileSync(p, 'utf8').split(/\r?\n/)) {
        const m = linha.match(/^\s*DATABASE_URL\s*=\s*(.*)\s*$/);
        if (m) {
          process.env.DATABASE_URL = m[1].replace(/^["']|["']$/g, '');
          return;
        }
      }
    }
  }
}

function acharSQL() {
  const candidatos = [
    path.join(__dirname, 'importar_cards_gestaonexus.sql'),
    path.join(process.cwd(), 'importar_cards_gestaonexus.sql'),
  ];
  for (const p of candidatos) if (fs.existsSync(p)) return p;
  throw new Error('Arquivo importar_cards_gestaonexus.sql não encontrado ao lado deste script.');
}

(async () => {
  carregarEnv();
  if (!process.env.DATABASE_PUBLIC_URL && !process.env.DATABASE_URL) {
    console.error('❌ DATABASE_URL não encontrada. Rode na raiz do projeto ou defina a variável.');
    process.exit(1);
  }

  let Client;
  try {
    ({ Client } = require('pg'));            // usa o pg do backend
  } catch (_) {
    try {
      ({ Client } = require(path.join(__dirname, 'backend', 'node_modules', 'pg')));
    } catch (e) {
      console.error('❌ Módulo "pg" não encontrado. Rode dentro da pasta backend/ (onde o pg está instalado).');
      process.exit(1);
    }
  }

  let url = process.env.DATABASE_PUBLIC_URL || process.env.DATABASE_URL;
  const ehLocal = /localhost|127\.0\.0\.1/.test(url);
  // Remove sslmode/ssl da URL: no pg novo, "sslmode=require" vira "verify-full"
  // e rejeita o certificado (aqui o cert está expirado). Tratamos SSL manualmente.
  url = url.replace(/([?&])(sslmode|ssl|channel_binding)=[^&]*/gi, '$1')
           .replace(/[?&]+$/,'')
           .replace(/\?&+/,'?')
           .replace(/&&+/g,'&');
  const client = new Client({
    connectionString: url,
    ssl: ehLocal ? undefined : { rejectUnauthorized: false },
  });

  const sql = fs.readFileSync(acharSQL(), 'utf8');

  client.on('notice', (msg) => console.log('ℹ️ ', msg.message));

  try {
    await client.connect();
    console.log('✅ Conectado ao banco. Rodando importação...');
    await client.query(sql);
    // Confirma o resultado
    const r = await client.query(
      `SELECT count(*)::int AS cards, COALESCE(sum(estimativa_horas),0) AS horas
         FROM cards c JOIN quadros q ON q.id = c.quadro_id
        WHERE q.nome = 'Atividades Estagiários'`);
    console.log(`✅ Quadro "Atividades Estagiários": ${r.rows[0].cards} cards, ${r.rows[0].horas}h no total.`);
  } catch (e) {
    console.error('❌ Erro na importação:', e.message);
    process.exit(1);
  } finally {
    await client.end();
  }
})();
