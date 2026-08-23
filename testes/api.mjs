// Helper compartilhado pelos testes: login + chamadas autenticadas.
const BASE = 'http://localhost:3001/api';
let token = null;

export async function login(email = 'admin@local.test', senha = 'SenhaLocal123!') {
  const r = await fetch(`${BASE}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, senha }),
  });
  const d = await r.json();
  if (!d.token) throw new Error('login falhou: ' + JSON.stringify(d));
  token = d.token;
  return d;
}

export async function req(metodo, caminho, corpo) {
  const opcoes = { method: metodo, headers: { Authorization: `Bearer ${token}` } };
  if (corpo !== undefined) {
    opcoes.headers['Content-Type'] = 'application/json';
    opcoes.body = JSON.stringify(corpo);
  }
  const r = await fetch(BASE + caminho, opcoes);
  const texto = await r.text();
  let dados;
  try { dados = texto ? JSON.parse(texto) : null; } catch { dados = texto; }
  return { status: r.status, dados };
}

export const get = (c) => req('GET', c);
export const post = (c, b) => req('POST', c, b);
export const put = (c, b) => req('PUT', c, b);
export const del = (c) => req('DELETE', c);

/** Garante uma equipe de teste e devolve o id. */
export async function equipeDeTeste(nome = 'Equipe de Teste') {
  const lista = await get('/equipes');
  const achada = (lista.dados || []).find((e) => e.nome === nome);
  if (achada) return achada.id;
  const criada = await post('/equipes', { nome, cor: 'slate' });
  if (criada.status !== 201) throw new Error('não criou equipe: ' + JSON.stringify(criada));
  return criada.dados.id;
}

export function ok(condicao, descricao) {
  console.log((condicao ? '  \x1b[32mPASSOU\x1b[0m  ' : '  \x1b[31mFALHOU\x1b[0m  ') + descricao);
  if (!condicao) process.exitCode = 1;
  return condicao;
}

export function titulo(t) { console.log(`\n\x1b[1m${t}\x1b[0m`); }
