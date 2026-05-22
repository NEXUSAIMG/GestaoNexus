/**
 * Script CLI — Definir acesso restrito de uma pessoa
 *
 * Marca/desmarca a flag `acesso_restrito` de uma pessoa. Quando TRUE
 * (e a pessoa não for admin), ela só consegue acessar 4 módulos
 * operacionais via UI e via API:
 *   - Tarefas
 *   - Processos
 *   - Em andamento (instâncias)
 *   - Cartórios
 *
 * Uso:
 *   npm run acesso-restrito -- nestor@exemplo.com.br --restringir
 *   npm run acesso-restrito -- nestor@exemplo.com.br --liberar
 *
 * Ou direto via node:
 *   node db/scripts/definir-acesso-restrito.js nestor@exemplo.com.br --restringir
 *   node db/scripts/definir-acesso-restrito.js nestor@exemplo.com.br --liberar
 *
 * Comportamento:
 *   - Mostra a pessoa encontrada com a flag ATUAL
 *   - Pede confirmação [s/N]
 *   - Atualiza o banco e mostra resultado
 *   - Recusa restringir uma pessoa administradora (admin sempre tem
 *     acesso total — a flag é ignorada pra admins)
 */
import { createInterface } from 'node:readline/promises';
import { stdin as input, stdout as output } from 'node:process';
import { query, closePool } from '../../src/config/database.js';

function formatarData(d) {
  if (!d) return '—';
  try {
    return new Date(d).toLocaleString('pt-BR');
  } catch {
    return '—';
  }
}

async function rodar() {
  const email = process.argv[2]?.trim();
  const acao = process.argv[3]?.trim();

  if (!email || !acao || !['--restringir', '--liberar'].includes(acao)) {
    console.error('\n❌ Uso: node db/scripts/definir-acesso-restrito.js <email> --restringir|--liberar');
    console.error('   Ex:  node db/scripts/definir-acesso-restrito.js nestor@exemplo.com.br --restringir');
    console.error('   Ou:  npm run acesso-restrito -- nestor@exemplo.com.br --restringir\n');
    console.error('   Use --liberar pra desfazer.\n');
    process.exitCode = 1;
    return;
  }

  const novoValor = acao === '--restringir';

  // 1. Procura a pessoa
  const { rows } = await query(
    `SELECT id, nome, email, administrador, ativo, acesso_restrito,
            ultimo_login_em, created_at
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

  // 2. Validações
  if (p.administrador) {
    console.error(`\n❌ ${p.nome} é administrador(a). A flag de acesso restrito não se aplica a admins.`);
    console.error('   Pra restringir uma pessoa, primeiro desmarque "administrador" via UI ou ajuste manual no banco.\n');
    process.exitCode = 1;
    return;
  }

  if (p.acesso_restrito === novoValor) {
    console.log(`\nℹ  ${p.nome} já está ${novoValor ? 'com acesso restrito' : 'sem restrição'}. Nada a fazer.\n`);
    return;
  }

  // 3. Mostra preview
  const acaoTxt = novoValor ? 'RESTRINGIR' : 'LIBERAR';
  const corAcao = novoValor ? '🔒' : '🔓';

  console.log('\n┌─────────────────────────────────────────────────────┐');
  console.log(`│  Ação: ${corAcao} ${acaoTxt.padEnd(43)} │`);
  console.log('├─────────────────────────────────────────────────────┤');
  console.log(`│  Nome:          ${(p.nome || '').padEnd(36)} │`);
  console.log(`│  E-mail:        ${(p.email || '').padEnd(36)} │`);
  console.log(`│  Ativo:         ${(p.ativo ? 'sim' : 'não').padEnd(36)} │`);
  console.log(`│  Cadastrada em: ${formatarData(p.created_at).padEnd(36)} │`);
  console.log(`│  Último login:  ${formatarData(p.ultimo_login_em).padEnd(36)} │`);
  console.log(`│  Restrito agora: ${(p.acesso_restrito ? 'sim' : 'não').padEnd(35)} │`);
  console.log(`│  Restrito depois: ${(novoValor ? 'sim' : 'não').padEnd(34)} │`);
  console.log('└─────────────────────────────────────────────────────┘\n');

  if (novoValor) {
    console.log('🔒 Após restringir, esta pessoa SÓ verá:');
    console.log('   • Tarefas');
    console.log('   • Processos');
    console.log('   • Em andamento');
    console.log('   • Cartórios');
    console.log('   E NÃO verá: Caixa, Contas a Pagar, Governança, Sócios &');
    console.log('   Lucros, Configurações, Cadastros etc.\n');
  } else {
    console.log('🔓 Após liberar, esta pessoa volta a ter acesso completo ao sistema.\n');
  }

  // 4. Confirma
  const rl = createInterface({ input, output });
  const resposta = await rl.question(
    `Confirma? [s/N]: `,
  );
  rl.close();

  if (resposta.trim().toLowerCase() !== 's') {
    console.log('\n✋ Cancelado. Nenhuma alteração feita.\n');
    return;
  }

  // 5. Atualiza
  await query(
    `UPDATE pessoas_acesso
        SET acesso_restrito = $1,
            updated_at = NOW()
      WHERE id = $2`,
    [novoValor, p.id],
  );

  // 6. Confirmação visual
  console.log('\n┌─────────────────────────────────────────────────────┐');
  console.log(`│  ✅ ${(novoValor ? 'Acesso restringido' : 'Acesso liberado').padEnd(48)} │`);
  console.log('├─────────────────────────────────────────────────────┤');
  console.log(`│  Pessoa: ${(p.nome || '').padEnd(43)} │`);
  console.log(`│  E-mail: ${(p.email || '').padEnd(43)} │`);
  console.log('└─────────────────────────────────────────────────────┘');

  if (novoValor) {
    console.log('\n📋 Próximos passos:');
    console.log('   • Avise a pessoa que o menu dela ficou diferente — só verá os 4 módulos.');
    console.log('   • Se ela já estiver logada, pode ser necessário pedir pra ela fazer');
    console.log('     logout e login novamente pra refletir a mudança.');
    console.log('   • Pra desfazer: npm run acesso-restrito -- ' + p.email + ' --liberar\n');
  } else {
    console.log('\n📋 A pessoa volta a ter acesso a todos os módulos no próximo login.\n');
  }
}

rodar()
  .catch((err) => {
    console.error('\n❌ Erro:', err.message || err);
    process.exitCode = 1;
  })
  .finally(closePool);
