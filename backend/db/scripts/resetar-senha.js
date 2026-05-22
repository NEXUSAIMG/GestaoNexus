/**
 * Script CLI — Resetar senha de uma pessoa de acesso
 *
 * Encontra a pessoa pelo e-mail (case-insensitive), gera uma senha
 * temporária forte (ou usa a fornecida), pede confirmação, e atualiza
 * o senha_hash no banco.
 *
 * Uso:
 *   npm run resetar-senha -- nestor@exemplo.com.br
 *   npm run resetar-senha -- nestor@exemplo.com.br MinhaSenhaTemp123!
 *
 * Ou direto via node:
 *   node db/scripts/resetar-senha.js nestor@exemplo.com.br
 *   node db/scripts/resetar-senha.js nestor@exemplo.com.br MinhaSenhaTemp123!
 *
 * Comportamento:
 *   - Se a senha não for fornecida, gera uma aleatória de 16 caracteres
 *     misturando maiúsculas, minúsculas, números e símbolos
 *   - Mostra a pessoa encontrada antes de pedir confirmação
 *   - Confirma com [s/N] (default: NÃO faz nada)
 *   - Imprime a senha temporária no terminal pra você passar pro usuário
 *
 * Orientação ao usuário final:
 *   1. Passa a senha por canal seguro (presencial, Signal, etc.)
 *   2. Pede pra trocar imediatamente no primeiro acesso
 *   3. Confirma que ela conseguiu logar e trocou
 */
import { createInterface } from 'node:readline/promises';
import { stdin as input, stdout as output } from 'node:process';
import crypto from 'node:crypto';
import { query, closePool } from '../../src/config/database.js';
import { hashSenha } from '../../src/utils/password.js';

// =============================================================================
// Helpers
// =============================================================================

function gerarSenhaForte(tamanho = 16) {
  // Conjunto que evita caracteres ambíguos (0/O, 1/l/I) e seguros pra terminal
  const minus = 'abcdefghjkmnpqrstuvwxyz';
  const mai = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
  const num = '23456789';
  const sim = '!@#$%&*?+-';
  const todos = minus + mai + num + sim;

  // Garante pelo menos 1 de cada categoria
  const obrigatorios = [
    minus[crypto.randomInt(minus.length)],
    mai[crypto.randomInt(mai.length)],
    num[crypto.randomInt(num.length)],
    sim[crypto.randomInt(sim.length)],
  ];

  const restante = Array.from({ length: tamanho - obrigatorios.length }, () =>
    todos[crypto.randomInt(todos.length)],
  );

  // Embaralha (Fisher-Yates)
  const arr = [...obrigatorios, ...restante];
  for (let i = arr.length - 1; i > 0; i -= 1) {
    const j = crypto.randomInt(i + 1);
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr.join('');
}

function formatarData(d) {
  if (!d) return '—';
  try {
    return new Date(d).toLocaleString('pt-BR');
  } catch {
    return '—';
  }
}

// =============================================================================
// Main
// =============================================================================

async function rodar() {
  const email = process.argv[2]?.trim();
  let senhaArg = process.argv[3]?.trim();

  if (!email) {
    console.error('\n❌ Uso: node db/scripts/resetar-senha.js <email> [senha-temporaria]');
    console.error('   Ex:  node db/scripts/resetar-senha.js nestor@exemplo.com.br');
    console.error('   Ou:  npm run resetar-senha -- nestor@exemplo.com.br\n');
    process.exitCode = 1;
    return;
  }

  // 1. Procura a pessoa
  const { rows } = await query(
    `SELECT id, nome, email, administrador, ativo, ultimo_login_em, created_at
       FROM pessoas_acesso
      WHERE LOWER(email) = LOWER($1)`,
    [email],
  );

  if (rows.length === 0) {
    console.error(`\n❌ Nenhuma pessoa encontrada com e-mail "${email}".`);
    console.error('   Dica: roda "npm run pessoas" pra listar todas, ou');
    console.error('         "npm run pessoas <nome>" pra buscar.\n');
    process.exitCode = 1;
    return;
  }

  const p = rows[0];

  // 2. Mostra preview
  console.log('\n┌─────────────────────────────────────────────────────┐');
  console.log('│  Pessoa encontrada:                                  │');
  console.log('├─────────────────────────────────────────────────────┤');
  console.log(`│  Nome:          ${(p.nome || '').padEnd(36)} │`);
  console.log(`│  E-mail:        ${(p.email || '').padEnd(36)} │`);
  console.log(`│  Administrador: ${(p.administrador ? 'sim' : 'não').padEnd(36)} │`);
  console.log(`│  Ativo:         ${(p.ativo ? 'sim' : 'não').padEnd(36)} │`);
  console.log(`│  Cadastrada em: ${formatarData(p.created_at).padEnd(36)} │`);
  console.log(`│  Último login:  ${formatarData(p.ultimo_login_em).padEnd(36)} │`);
  console.log('└─────────────────────────────────────────────────────┘\n');

  if (!p.ativo) {
    console.log('⚠ Atenção: esta pessoa está INATIVA. Mesmo após resetar a senha,');
    console.log('  ela não conseguirá logar até alguém ativá-la novamente.\n');
  }

  // 3. Define a senha temporária
  if (!senhaArg) {
    senhaArg = gerarSenhaForte(16);
    console.log(`🔐 Senha temporária gerada (16 caracteres): ${senhaArg}\n`);
  } else if (senhaArg.length < 8) {
    console.error('❌ A senha temporária deve ter pelo menos 8 caracteres.\n');
    process.exitCode = 1;
    return;
  } else {
    console.log(`🔐 Usando senha temporária fornecida (${senhaArg.length} caracteres).\n`);
  }

  // 4. Confirma
  const rl = createInterface({ input, output });
  const resposta = await rl.question(
    `Confirma reset da senha de "${p.nome}" (${p.email})? [s/N]: `,
  );
  rl.close();

  if (resposta.trim().toLowerCase() !== 's') {
    console.log('\n✋ Cancelado. Nenhuma alteração feita.\n');
    return;
  }

  // 5. Faz o hash e atualiza
  console.log('\n⏳ Gerando hash bcrypt...');
  const hash = await hashSenha(senhaArg);

  await query(
    `UPDATE pessoas_acesso
        SET senha_hash = $1,
            updated_at = NOW()
      WHERE id = $2`,
    [hash, p.id],
  );

  // 6. Confirmação visual
  console.log('\n┌─────────────────────────────────────────────────────┐');
  console.log('│  ✅ Senha resetada com sucesso                       │');
  console.log('├─────────────────────────────────────────────────────┤');
  console.log(`│  Para:   ${(p.nome || '').padEnd(42)} │`);
  console.log(`│  E-mail: ${(p.email || '').padEnd(42)} │`);
  console.log('│                                                      │');
  console.log('│  Senha temporária:                                   │');
  console.log(`│    ${senhaArg.padEnd(48)} │`);
  console.log('└─────────────────────────────────────────────────────┘');

  console.log('\n📋 Próximos passos:');
  console.log('   1. Copia a senha acima e passa pela pessoa em canal seguro');
  console.log('      (presencial, Signal, ligação — NÃO use e-mail/WhatsApp).');
  console.log('   2. Avisa pra trocar imediatamente no primeiro login.');
  console.log('   3. Confirma com ela depois que conseguiu entrar e trocou.\n');

  if (!p.ativo) {
    console.log('⚠ Lembre que esta pessoa está INATIVA e não conseguirá logar.');
    console.log('  Ative-a em Cadastros → Pessoas de acesso antes.\n');
  }
}

rodar()
  .catch((err) => {
    console.error('\n❌ Erro:', err.message || err);
    process.exitCode = 1;
  })
  .finally(closePool);
