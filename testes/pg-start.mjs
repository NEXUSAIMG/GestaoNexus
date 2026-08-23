// Sobe um PostgreSQL real, local, sem root e sem Docker.
// Os binários vêm do pacote embedded-postgres (build oficial do Zonky).
import EmbeddedPostgres from 'embedded-postgres';

const pg = new EmbeddedPostgres({
  databaseDir: new URL('./pgdata', import.meta.url).pathname,
  user: 'nexus',
  password: 'nexus',
  port: 55432,
  persistent: true,
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
