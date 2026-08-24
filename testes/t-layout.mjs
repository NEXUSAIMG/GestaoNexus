// Mede o layout num Chromium de verdade: barra de rolagem horizontal na
// página, conteúdo cortado e barras aninhadas. É o que build passando não
// consegue provar.
import { chromium } from 'playwright-core';

const BASE = 'http://localhost:3001';
const LARGURAS = [
  { nome: 'celular  ', w: 390, h: 844 },
  { nome: 'tablet   ', w: 768, h: 1024 },
  { nome: 'notebook ', w: 1280, h: 800 },
];

const PAGINAS = [
  ['/dashboard', 'Dashboard'],
  ['/tarefas', 'Tarefas'],
  ['/socios', 'Sócios'],
  ['/pessoas', 'Pessoas'],
  ['/caixa', 'Caixa'],
  ['/contas-pagar', 'Contas a pagar'],
  ['/lucros', 'Lucros'],
  ['/mensal', 'Mês a mês'],
  ['/representacoes', 'Representações'],
  ['/categorias-despesa', 'Categorias'],
  ['/custos-cloud', 'Custos cloud'],
  ['/inventario', 'Inventário'],
  ['/relatorios', 'Relatórios'],
  ['/governanca', 'Governança'],
  ['/contratos', 'Contratos'],
  ['/processos', 'Processos'],
  ['/portfolio', 'Portfólio'],
  ['/equipes', 'Equipes'],
  ['/visao-geral', 'Visão geral'],
  ['/configuracoes', 'Configurações'],
];

const navegador = await chromium.launch();
const ctx = await navegador.newContext({ viewport: { width: 1280, height: 800 } });
const pg = await ctx.newPage();

// Login uma vez; o token fica no localStorage do contexto.
await pg.goto(BASE + '/login', { waitUntil: 'networkidle' });
await pg.fill('input[type="email"]', 'admin@local.test');
await pg.fill('input[type="password"]', 'SenhaLocal123!');
await pg.click('button[type="submit"]');
await pg.waitForURL((u) => !u.pathname.includes('/login'), { timeout: 15000 });
console.log('login ok\n');

/** Mede overflow horizontal do documento e conta barras horizontais. */
async function medir(page) {
  return page.evaluate(() => {
    const de = document.documentElement;
    const barraNoDocumento = de.scrollWidth > de.clientWidth + 1;

    // Elementos que realmente rolam na horizontal (têm barra própria).
    const rolaveis = [];
    for (const el of document.querySelectorAll('*')) {
      const st = getComputedStyle(el);
      const ox = st.overflowX;
      if ((ox === 'auto' || ox === 'scroll') && el.scrollWidth > el.clientWidth + 1) {
        rolaveis.push(el);
      }
    }
    // Aninhamento: um rolável dentro de outro = duas barras empilhadas.
    let aninhados = 0;
    for (const a of rolaveis) {
      for (const b of rolaveis) {
        if (a !== b && b.contains(a)) { aninhados += 1; break; }
      }
    }

    // Conteúdo cortado: overflow escondido/clip com conteúdo maior que a caixa.
    const cortados = [];
    for (const el of document.querySelectorAll('table')) {
      let p = el.parentElement;
      let protegido = false;
      while (p && p !== document.body) {
        const ox = getComputedStyle(p).overflowX;
        if (ox === 'auto' || ox === 'scroll') { protegido = true; break; }
        if (ox === 'hidden' || ox === 'clip') {
          if (p.scrollWidth > p.clientWidth + 1) {
            cortados.push((p.className || '').toString().slice(0, 60));
          }
          break;
        }
        p = p.parentElement;
      }
      if (!protegido && el.getBoundingClientRect().right > window.innerWidth + 1) {
        cortados.push('tabela vazando: ' + (el.className || ''));
      }
    }

    return {
      barraNoDocumento,
      excedente: de.scrollWidth - de.clientWidth,
      nRolaveis: rolaveis.length,
      aninhados,
      cortados: [...new Set(cortados)],
    };
  });
}

let problemas = 0;
for (const vp of LARGURAS) {
  await pg.setViewportSize({ width: vp.w, height: vp.h });
  console.log(`\x1b[1m${vp.nome} (${vp.w}px)\x1b[0m`);
  for (const [rota, nome] of PAGINAS) {
    await pg.goto(BASE + rota, { waitUntil: 'networkidle' });
    await pg.waitForTimeout(250);
    const m = await medir(pg);
    const ruim = m.barraNoDocumento || m.aninhados > 0 || m.cortados.length > 0;
    if (ruim) problemas += 1;
    const marca = ruim ? '\x1b[31mX\x1b[0m' : '\x1b[32m.\x1b[0m';
    const detalhe = [
      m.barraNoDocumento ? `barra na página (+${m.excedente}px)` : '',
      m.aninhados > 0 ? `${m.aninhados} barra(s) aninhada(s)` : '',
      m.cortados.length ? `cortado: ${m.cortados.join(' | ')}` : '',
    ].filter(Boolean).join('; ');
    console.log(`  ${marca} ${nome.padEnd(16)} ${detalhe}`);
  }
}

console.log(`\n${problemas === 0 ? '\x1b[32mnenhum problema de layout\x1b[0m' : `\x1b[31m${problemas} página(s) com problema\x1b[0m`}`);
await navegador.close();
process.exit(problemas === 0 ? 0 : 1);
