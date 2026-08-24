// A ficha de cliente não pode vazar para quadros que só usam a etiqueta
// "Cliente" padrão (que TODO quadro novo ganha) sem os campos comerciais.
import { chromium } from 'playwright-core';
import { login, post, get, equipeDeTeste, ok, titulo } from './api.mjs';

await login();
const equipe_id = await equipeDeTeste();

// Quadro comum: usa a etiqueta Cliente padrão, sem nenhum campo comercial.
const q = (await post('/quadros', { equipe_id, nome: 'Quadro comum ' + Date.now() })).dados;
const full = (await get('/quadros/' + q.id)).dados;
const etqCliente = full.etiquetas.find((e) => e.nome === 'Cliente');
const col = full.colunas[0];
const eu = (await get('/pessoas')).dados[0];

await post('/cards', {
  coluna_id: col.id,
  titulo: 'Reunião com cliente Alfa',
  etiqueta_ids: [etqCliente.id],
  responsavel_ids: [eu.id],
});

const navegador = await chromium.launch();
const ctx = await navegador.newContext({ viewport: { width: 1280, height: 800 } });
const pg = await ctx.newPage();
await pg.goto('http://localhost:3001/login', { waitUntil: 'networkidle' });
await pg.fill('input[type="email"]', 'admin@local.test');
await pg.fill('input[type="password"]', 'SenhaLocal123!');
await pg.click('button[type="submit"]');
await pg.waitForURL((u) => !u.pathname.includes('/login'));
await pg.waitForTimeout(700);
const dlg = pg.locator('[aria-labelledby="modal-tarefas-titulo"]');
if (await dlg.count()) {
  await dlg.locator('button[aria-label="Fechar"]').first().click({ force: true });
  await pg.waitForTimeout(300);
}

await pg.goto('http://localhost:3001/tarefas/' + q.id, { waitUntil: 'networkidle' });
await pg.waitForTimeout(700);

titulo('Quadro comum, etiqueta Cliente padrão, sem campos comerciais');
const card = pg.locator('.rounded-lg.border.bg-white', { hasText: 'Reunião com cliente Alfa' }).first();
const texto = await card.innerText();
console.log('   card renderizado:\n   ' + texto.split('\n').join('\n   '));

ok(!/RESPONSÁVEL/.test(texto), 'não mostra a linha "RESPONSÁVEL" da ficha comercial');
ok(!/ORIGEM|TERMÔMETRO|FATURAMENTO/.test(texto), 'não mostra rótulos da ficha comercial');
ok(await card.locator('span.rounded-full').count() > 0, 'mantém o avatar do responsável do card comum');

await pg.screenshot({ path: new URL('./capturas/09-quadro-comum.png', import.meta.url).pathname });
await navegador.close();
