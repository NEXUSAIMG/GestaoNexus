// Sobe um PostgreSQL real, local, sem root e sem Docker.
// Os binários vêm do pacote embedded-postgres (build oficial do Zonky).
import { fileURLToPath } from 'node:url';
import EmbeddedPostgres from 'embedded-postgres';

const pg = new EmbeddedPostgres({
  // `.pathname` de uma file:// URL vira "/C:/Users/..." no Windows — inválido
  // pro initdb nativo. fileURLToPath converte pro caminho real do SO.
  databaseDir: fileURLToPath(new URL('./pgdata', import.meta.url)),
  user: 'nexus',
  password: 'nexus',
  port: 55432,
  persistent: true,
  // Sem isso, o Windows inicializa o cluster com a codificação do locale do
  // SO (WIN1252 em pt-BR) — e toda migração/seed daqui tem acento em UTF-8,
  // o que quebra a importação com "character ... has no equivalent in
  // encoding WIN1252". `--locale=C` evita depender de collation pt-BR
  // instalada no SO (nem sempre presente).
  initdbFlags: ['-E', 'UTF8', '--locale=C'],
});

const acao = process.argv[2];

if (acao === 'init') {
  await pg.initialise();
  await pg.start();
  await pg.createDatabase('gestao_nexus');
  console.log('banco criado');
  process.exit(0);
}

if (acao === 'stop') {
  await pg.stop();
  console.log('parado');
  process.exit(0);
}

await pg.start();
console.log('postgres no ar em localhost:55432');
process.exit(0);
