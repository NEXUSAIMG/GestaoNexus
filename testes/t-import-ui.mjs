// Fluxo de importação na tela: escolher formato, ver a prévia, importar.
import { chromium } from 'playwright-core';
import { writeFileSync } from 'node:fs';

const BASE = 'http://localhost:3001';
const SAIDA = new URL('./capturas/', import.meta.url).pathname;
const CSV = SAIDA + '../backlog-teste.csv';

writeFileSync(CSV, '﻿'
  + 'Titulo;Descrição;Prioridade;Tipo;Estimativa_h;Coluna;Prazo\n'
  + 'Implantar assinatura digital;"Depende do jurídico; validar ICP";Urgente;Melhoria;16;Em andamento;30/11/2026\n'
  + 'Treinar equipe do cartório;;Alta;Melhoria;8;A fazer;15/12/2026\n'
  + 'Corrigir importação de contatos;;Alta;Bug;4;A fazer;\n'
  + 'Revisar contrato padrão;;Média;;2;Fase Que Nao Existe;\n', 'utf8');

const navegador = await chromium.launch();
const ctx = await navegador.newContext({ viewport: { width: 1280, height: 900 } });
const pg = await ctx.newPage();
const erros = [];
pg.on('pageerror', (e) => erros.push(e.message));

await pg.goto(BASE + '/login', { waitUntil: 'networkidle' });
await pg.fill('input[type="email"]', 'admin@local.test');
await pg.fill('input[type="password"]', 'SenhaLocal123!');
await pg.click('button[type="submit"]');
await pg.waitForURL((u) => !u.pathname.includes('/login'));
await pg.waitForTimeout(800);
const dlg = pg.locator('[aria-labelledby="modal-tarefas-titulo"]');
if (await dlg.count()) {
  await dlg.locator('button[aria-label="Fechar"]').first().click({ force: true });
  await pg.waitForTimeout(400);
}

function ok(c, m) {
  console.log((c ? '  \x1b[32mPASSOU\x1b[0m  ' : '  \x1b[31mFALHOU\x1b[0m  ') + m);
  if (!c) process.exitCode = 1;
}

await pg.goto(BASE + '/tarefas', { waitUntil: 'networkidle' });
await pg.waitForTimeout(500);

console.log('\n\x1b[1mModal de importação\x1b[0m');
await pg.locator('button:has-text("Importar")').first().click();
await pg.waitForTimeout(500);
const t = await pg.locator('body').innerText();
ok(/Importar quadro/.test(t), 'modal abre');
ok(/Planilha \(CSV\)/.test(t) && /Trello \(JSON\)/.test(t), 'oferece os dois formatos');
ok(/Destino/.test(t), 'CSV é o formato inicial (mostra o seletor de destino)');

console.log('\n\x1b[1mPrévia da planilha\x1b[0m');
await pg.setInputFiles('input[type="file"]', CSV);
await pg.waitForTimeout(1500);
const tp = await pg.locator('body').innerText();
ok(/4 card\(s\) serão criados/.test(tp), 'prévia conta os cards: ' + (tp.match(/\d+ card\(s\) serão criados/) || [''])[0]);
ok(/Implantar assinatura digital/.test(tp), 'mostra a amostra das linhas');
ok(/Fase Que Nao Existe/.test(tp), 'avisa a coluna da planilha que não casa');
ok(/Colunas reconhecidas/.test(tp), 'lista as colunas reconhecidas');
await pg.screenshot({ path: SAIDA + '06-import-csv-previa.png' });

console.log('\n\x1b[1mImportar\x1b[0m');
await pg.locator('button:has-text("Importar"):not(:has-text("quadro"))').last().click();
await pg.waitForTimeout(2500);
const tr = await pg.locator('body').innerText();
ok(/card\(s\) criado\(s\)/.test(tr), 'resultado mostra o que foi criado: '
  + (tr.match(/\d+ card\(s\) criado\(s\)[^.]*/) || [''])[0]);
ok(/Abrir quadro/.test(tr), 'oferece abrir o quadro criado');
await pg.screenshot({ path: SAIDA + '07-import-csv-resultado.png' });

console.log('\n\x1b[1mQuadro importado abre\x1b[0m');
await pg.locator("a:has-text(\"Abrir quadro\")").first().click();
await pg.waitForTimeout(1200);
ok(!/Nenhum quadro/.test(await pg.locator('body').innerText()), 'quadro importado abre');
await pg.screenshot({ path: SAIDA + '08-quadro-importado.png' });

ok(erros.length === 0, erros.length ? 'erros: ' + erros.join(' | ') : 'nenhum erro de página');
await navegador.close();
