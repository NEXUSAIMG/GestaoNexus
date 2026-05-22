/**
 * Script CLI — Listar pessoas de acesso
 *
 * Sem argumentos: lista todas as pessoas cadastradas.
 * Com argumento: filtra por nome OU e-mail (busca parcial, case-insensitive).
 *
 * Uso:
 *   npm run pessoas                  # lista todas
 *   npm run pessoas nestor           # filtra por "nestor" em nome ou email
 *   npm run pessoas -- carlos        # com -- antes pra evitar npm parsear o argumento
 *
 * Ou direto via node:
 *   node db/scripts/listar-pessoas.js
 *   node db/scripts/listar-pessoas.js nestor
 */
import { query, closePool } from '../../src/config/database.js';

function formatarData(d) {
  if (!d) return '—';
  try {
    return new Date(d).toLocaleString('pt-BR', {
      day: '2-digit', month: '2-digit', year: '2-digit',
      hour: '2-digit', minute: '2-digit',
    });
  } catch {
    return '—';
  }
}

function truncar(s, n) {
  if (!s) return '';
  return s.length > n ? s.slice(0, n - 1) + '…' : s;
}

async function rodar() {
  const filtro = process.argv[2]?.trim();

  let sql;
  let params;

  if (filtro) {
    sql = `
      SELECT id, nome, email, administrador, acesso_restrito, ativo, ultimo_login_em, created_at
        FROM pessoas_acesso
       WHERE LOWER(nome) LIKE LOWER($1)
          OR LOWER(email) LIKE LOWER($1)
       ORDER BY administrador DESC, nome
    `;
    params = [`%${filtro}%`];
    console.log(`\n🔎 Buscando pessoas com "${filtro}" no nome ou e-mail...\n`);
  } else {
    sql = `
      SELECT id, nome, email, administrador, acesso_restrito, ativo, ultimo_login_em, created_at
        FROM pessoas_acesso
       ORDER BY administrador DESC, nome
    `;
    params = [];
    console.log('\n👥 Listando todas as pessoas de acesso...\n');
  }

  const { rows } = await query(sql, params);

  if (rows.length === 0) {
    console.log(filtro
      ? `❌ Nenhuma pessoa encontrada com "${filtro}".`
      : '❌ Nenhuma pessoa cadastrada.');
    return;
  }

  // Imprime tabela formatada
  const colNome = Math.max(20, ...rows.map((r) => r.nome?.length || 0));
  const colEmail = Math.max(25, ...rows.map((r) => r.email?.length || 0));

  const sep = '─'.repeat(colNome + colEmail + 60);
  console.log(sep);
  console.log(
    'Nome'.padEnd(colNome),
    ' | ',
    'E-mail'.padEnd(colEmail),
    ' | Admin | Restr | Ativo | Último login',
  );
  console.log(sep);

  for (const r of rows) {
    console.log(
      truncar(r.nome, colNome).padEnd(colNome),
      ' | ',
      truncar(r.email, colEmail).padEnd(colEmail),
      ' |  ', r.administrador ? '✓ ' : '  ',
      ' |  ', r.acesso_restrito ? '🔒' : '  ',
      ' |  ', r.ativo ? '✓ ' : '✗ ',
      ' | ', formatarData(r.ultimo_login_em),
    );
  }
  console.log(sep);
  console.log(`\nTotal: ${rows.length} pessoa(s).`);

  // Resumo final
  const admins = rows.filter((r) => r.administrador).length;
  const restritas = rows.filter((r) => r.acesso_restrito && !r.administrador).length;
  const ativas = rows.filter((r) => r.ativo).length;
  const inativas = rows.length - ativas;
  const nuncaLogaram = rows.filter((r) => !r.ultimo_login_em && r.ativo).length;

  console.log(`  • ${admins} admin(s)`);
  if (restritas > 0) {
    console.log(`  • ${restritas} com acesso restrito 🔒 (só Tarefas, Processos, Em andamento, Cartórios)`);
  }
  console.log(`  • ${ativas} ativa(s) · ${inativas} inativa(s)`);
  if (nuncaLogaram > 0) {
    console.log(`  • ${nuncaLogaram} ainda não fez login (onboarding parado?)`);
  }
  console.log('');
}

rodar()
  .catch((err) => {
    console.error('\n❌ Erro:', err.message || err);
    process.exitCode = 1;
  })
  .finally(closePool);
