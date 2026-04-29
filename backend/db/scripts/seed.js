/**
 * Script de seed — Sprint 1.5
 *
 * Garante que exista pelo menos uma pessoa de acesso administradora
 * para se logar na ferramenta. Se houver variáveis SEED_SOCIO_*, também
 * cria um primeiro sócio e amarra o admin como "titular" dele.
 *
 * É idempotente: roda várias vezes sem criar duplicatas.
 *
 * Uso: npm run seed
 */
import { query, closePool } from '../../src/config/database.js';
import { hashSenha } from '../../src/utils/password.js';
import { env } from '../../src/config/env.js';

async function garantirPessoaAdmin() {
  const {
    SEED_ADMIN_NOME,
    SEED_ADMIN_EMAIL,
    SEED_ADMIN_SENHA,
  } = env;

  const { rows: existentes } = await query(
    `SELECT id, administrador FROM pessoas_acesso
      WHERE lower(email) = lower($1)`,
    [SEED_ADMIN_EMAIL],
  );

  if (existentes[0]) {
    // Garante que o sinalizador de administrador está ligado, mesmo se
    // o registro tiver vindo da migração automática do socio antigo.
    if (!existentes[0].administrador) {
      await query(
        `UPDATE pessoas_acesso SET administrador = TRUE, updated_at = NOW()
          WHERE id = $1`,
        [existentes[0].id],
      );
      console.log('[seed] ↻ pessoa já existia — marcada como administradora.');
    } else {
      console.log('[seed] ✓ pessoa administradora já existe. Nada a fazer.');
    }
    return existentes[0].id;
  }

  const hash = await hashSenha(SEED_ADMIN_SENHA);
  const { rows: criada } = await query(
    `INSERT INTO pessoas_acesso
       (nome, email, senha_hash, administrador, ativo)
     VALUES ($1, $2, $3, TRUE, TRUE)
     RETURNING id`,
    [SEED_ADMIN_NOME, SEED_ADMIN_EMAIL, hash],
  );

  console.log('[seed] ✓ Administrador(a) criado(a):');
  console.log(`       nome:  ${SEED_ADMIN_NOME}`);
  console.log(`       email: ${SEED_ADMIN_EMAIL}`);
  console.log('       senha: (a definida em SEED_ADMIN_SENHA)');
  console.log('[seed] Lembre de trocar a senha no primeiro acesso.');
  return criada[0].id;
}

async function garantirPrimeiroSocio(pessoaAdminId) {
  // Se não foram informadas variáveis de sócio, não cria.
  const nomeSocio = process.env.SEED_SOCIO_NOME;
  if (!nomeSocio) return;

  const {
    SEED_ADMIN_PERCENTUAL: percentualPadrao,
  } = env;

  const tipoPessoa = (process.env.SEED_SOCIO_TIPO_PESSOA ?? 'fisica').toLowerCase();
  const documento = process.env.SEED_SOCIO_DOCUMENTO ?? null;
  const email = process.env.SEED_SOCIO_EMAIL ?? null;
  const telefone = process.env.SEED_SOCIO_TELEFONE ?? null;
  const percentual = parseFloat(process.env.SEED_SOCIO_PERCENTUAL ?? String(percentualPadrao ?? 0));

  if (!['fisica', 'juridica'].includes(tipoPessoa)) {
    console.warn('[seed] ⚠ SEED_SOCIO_TIPO_PESSOA deve ser "fisica" ou "juridica". Ignorando sócio.');
    return;
  }

  // Não duplica se já existe sócio com mesmo documento ou nome.
  const { rows: existentes } = await query(
    `SELECT id FROM socios
      WHERE ($1::text IS NOT NULL AND documento = $1)
         OR lower(nome) = lower($2)
      LIMIT 1`,
    [documento, nomeSocio],
  );
  let socioId;
  if (existentes[0]) {
    socioId = existentes[0].id;
    console.log('[seed] ✓ sócio já existia. Mantendo cadastro atual.');
  } else {
    const { rows } = await query(
      `INSERT INTO socios
         (nome, tipo_pessoa, documento, email, telefone,
          percentual_participacao, data_entrada)
       VALUES ($1, $2, $3, $4, $5, $6, CURRENT_DATE)
       RETURNING id`,
      [nomeSocio, tipoPessoa, documento, email, telefone, percentual],
    );
    socioId = rows[0].id;
    console.log(`[seed] ✓ Sócio criado: ${nomeSocio} (${tipoPessoa}, ${percentual}%)`);
  }

  // Cria representação "titular" ligando o admin ao sócio, se ainda não existir.
  const { rows: repr } = await query(
    `SELECT id FROM representacoes
      WHERE pessoa_acesso_id = $1 AND socio_id = $2 AND ativo = TRUE`,
    [pessoaAdminId, socioId],
  );
  if (repr[0]) {
    console.log('[seed] ✓ representação admin→sócio já existia.');
    return;
  }

  await query(
    `INSERT INTO representacoes
       (pessoa_acesso_id, socio_id, papel,
        pode_ver_financeiro, pode_votar,
        pode_aprovar_atas, pode_aprovar_distribuicoes,
        data_inicio, observacoes, criado_por_id)
     VALUES ($1, $2, 'titular', TRUE, TRUE, TRUE, TRUE,
             CURRENT_DATE, $3, $1)`,
    [
      pessoaAdminId, socioId,
      'Representação "titular" criada no seed inicial da ferramenta.',
    ],
  );
  console.log('[seed] ✓ Representação "titular" criada entre administrador e sócio.');
}

async function rodar() {
  console.log('[seed] Iniciando seed...');
  const pessoaAdminId = await garantirPessoaAdmin();
  await garantirPrimeiroSocio(pessoaAdminId);
  console.log('[seed] Concluído.');
}

rodar()
  .catch((err) => {
    console.error('[seed] Erro:', err);
    process.exitCode = 1;
  })
  .finally(closePool);
