// Quadro: ficha de cliente no card, aba Histórico, renomear coluna,
// gaveta de arquivados. Gera capturas para conferência.
import { chromium } from 'playwright-core';
import { login, get } from './api.mjs';

const BASE = 'http://localhost:3001';
const SAIDA = new URL('./capturas/', import.meta.url).pathname;
const { mkdirSync } = await import('node:fs');
mkdirSync(SAIDA, { recursive: true });

await login();
const quadros = (await get('/quadros')).dados;
const quadro = quadros.find((q) => q.nome === 'Atividade Comercial');
if (!quadro) throw new Error('rode semear.mjs antes');

const navegador = await chromium.launch();
const ctx = await navegador.newContext({ viewport: { width: 1440, height: 900 } });
const pg = await ctx.newPage();

const erros = [];
pg.on('console', (m) => { if (m.type() === 'error') erros.push(m.text()); });
pg.on('pageerror', (e) => erros.push('pageerror: ' + e.message));

await pg.goto(BASE + '/login', { waitUntil: 'networkidle' });
await pg.fill('input[type="email"]', 'admin@local.test');
await pg.fill('input[type="password"]', 'SenhaLocal123!');
await pg.click('button[type="submit"]');
await pg.waitForURL((u) => !u.pathname.includes('/login'));
await pg.waitForTimeout(800);

// O modal de boas-vindas ("suas tarefas pendentes") abre sobre tudo ao logar.
async function fecharModalBoasVindas() {
  const dialogo = pg.locator('[aria-labelledby="modal-tarefas-titulo"]');
  if (await dialogo.count()) {
    // O botão de fechar é o overlay atrás do cartão; clique normal é
    // interceptado pelo próprio cartão, então forçamos.
    await dialogo.locator('button[aria-label="Fechar"]').first().click({ force: true });
    await pg.waitForTimeout(400);
  }
}
await fecharModalBoasVindas();

await pg.goto(`${BASE}/tarefas/${quadro.id}`, { waitUntil: 'networkidle' });
await pg.waitForTimeout(700);
await fecharModalBoasVindas();

function ok(cond, msg) {
  console.log((cond ? '  \x1b[32mPASSOU\x1b[0m  ' : '  \x1b[31mFALHOU\x1b[0m  ') + msg);
  if (!cond) process.exitCode = 1;
}

console.log('\n\x1b[1mFicha de cliente no card\x1b[0m');
const textoBoard = await pg.locator('body').innerText();
for (const campo of ['ORIGEM', 'TERMÔMETRO', 'CIDADE/UF', 'REPRESENTANTE/OFICIAL',
  'COMPETÊNCIA', 'FATURAMENTO', 'SITE', 'E-MAIL', 'TELEFONE/WHATSAPP', 'RESPONSÁVEL']) {
  ok(textoBoard.includes(campo), `rótulo "${campo}" aparece no card`);
}
ok(textoBoard.includes('Jaraguá do Sul/SC'), 'valor de Cidade/UF renderizado');
ok(textoBoard.includes('R$ 18.400,00'), 'valor de Faturamento renderizado');

// Card comum não pode ganhar a ficha.
const cardComum = pg.locator('div', { hasText: /^Revisar proposta comercial padrão$/ }).first();
const paiComum = pg.locator('.rounded-lg.border.bg-white', { hasText: 'Revisar proposta comercial padrão' }).first();
const textoComum = await paiComum.innerText();
ok(!/ORIGEM|TERMÔMETRO/.test(textoComum), 'card sem a etiqueta Cliente segue no layout normal');

// Links clicáveis
ok(await pg.locator('a[href^="mailto:"]').count() >= 3, 'e-mail virou link mailto:');
ok(await pg.locator('a[href*="wa.me"]').count() >= 3, 'telefone virou link do WhatsApp');
ok(await pg.locator('a[href^="https://1tabelionatojs"]').count() >= 1, 'site virou link');

await pg.screenshot({ path: SAIDA + '01-quadro-cliente.png', fullPage: false });

console.log('\n\x1b[1mAba Histórico do card\x1b[0m');
await pg.locator('text=1º Tabelionato de Jaraguá do Sul').first().click();
await pg.waitForTimeout(600);
ok(await pg.locator('button:has-text("Histórico")').count() > 0, 'aba Histórico existe no modal');
ok(await pg.locator('button:has-text("Atividade")').count() === 0, 'aba Atividade foi fundida (não duplica)');
await pg.locator('button:has-text("Histórico")').first().click();
await pg.waitForTimeout(700);
const th = await pg.locator('body').innerText();
ok(/criou o card em/.test(th), 'histórico mostra a criação com a coluna');
ok(/Está em/.test(th), 'histórico mostra a coluna atual e desde quando');
ok(/Admin Local/.test(th), 'histórico mostra quem fez');
await pg.screenshot({ path: SAIDA + '02-historico.png' });

// Expandir uma linha
await pg.locator('li button').first().click();
await pg.waitForTimeout(300);
ok(/Quando|Quem/.test(await pg.locator('body').innerText()), 'linha do histórico expande com o detalhe');
await pg.screenshot({ path: SAIDA + '03-historico-expandido.png' });

await pg.keyboard.press('Escape');
await pg.locator('header button:has-text("")').first().click().catch(() => {});
await pg.goto(`${BASE}/tarefas/${quadro.id}`, { waitUntil: 'networkidle' });
await pg.waitForTimeout(500);
await fecharModalBoasVindas();

console.log('\n\x1b[1mRenomear coluna\x1b[0m');
// Renomeia a coluna do meio, qualquer que seja o nome atual — assim o teste
// pode rodar quantas vezes for preciso sem depender do estado anterior.
const colunas = pg.locator('h3.text-sm.font-semibold');
const nomeAntes = (await colunas.nth(1).innerText()).trim();
const nomeNovo = 'Coluna Renomeada ' + Date.now().toString().slice(-5);
await colunas.nth(1).dblclick();
await pg.waitForTimeout(200);
const input = pg.locator('input[aria-label="Nome da coluna"]');
ok(await input.count() === 1, `duplo clique em "${nomeAntes}" abre o campo de renomear`);
await input.fill(nomeNovo);
await input.press('Enter');
await pg.waitForTimeout(900);
const depoisTexto = await pg.locator('body').innerText();
ok(depoisTexto.includes(nomeNovo), `nome novo aparece no board: ${nomeNovo}`);
ok(!depoisTexto.includes(nomeAntes), 'nome antigo sumiu');
await pg.screenshot({ path: SAIDA + '04-coluna-renomeada.png' });

console.log('\n\x1b[1mGaveta de arquivados\x1b[0m');
await pg.locator('button:has-text("Arquivados")').first().click();
await pg.waitForTimeout(700);
const ta = await pg.locator('body').innerText();
ok(/Arquivados/.test(ta), 'modal de arquivados abre');
ok(/Cards|Colunas/.test(ta), 'tem as abas de cards e colunas');
await pg.screenshot({ path: SAIDA + '05-arquivados.png' });

console.log('\n\x1b[1mErros de console\x1b[0m');
const relevantes = erros.filter((e) => !/favicon|Download the React DevTools/i.test(e));
ok(relevantes.length === 0, relevantes.length ? 'erros: ' + relevantes.join(' | ') : 'nenhum erro de console');

console.log('\ncapturas em:', SAIDA);
await navegador.close();
