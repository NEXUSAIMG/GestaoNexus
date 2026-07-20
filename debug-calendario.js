#!/usr/bin/env node
// Reproduz a chamada do calendário do quadro para capturar o erro 500.
// Rode com: railway run --service GestaoNexus node debug-calendario.js [quadroId]
const base = (process.env.APP_URL || 'https://gestaonexus-production.up.railway.app').replace(/\/$/, '');
const email = process.env.SEED_ADMIN_EMAIL;
const senha = process.env.SEED_ADMIN_SENHA;
const quadro = process.argv[2] || '009fd2bf-8370-41b4-bbac-b5b3f1415dd4';

function tok(j){ return j && (j.token || j.accessToken || j.access_token || (j.data && (j.data.token||j.data.accessToken)) || (j.usuario && j.usuario.token)); }

(async () => {
  console.log('APP_URL:', base, '| email:', email ? email : '(sem SEED_ADMIN_EMAIL)');
  const rl = await fetch(base + '/api/auth/login', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, senha }),
  });
  const jl = await rl.json().catch(() => ({}));
  console.log('login status:', rl.status);
  const token = tok(jl);
  if (!token) { console.log('login resp (300):', JSON.stringify(jl).slice(0, 300)); return; }
  console.log('token ok.');

  for (const pth of [
    `/api/quadros/${quadro}/eventos?inicio=2026-07-01&fim=2026-08-01`,
    `/api/quadros/${quadro}/eventos?inicio=2026-07-01&fim=2026-07-31`,
  ]) {
    const r = await fetch(base + pth, { headers: { Authorization: 'Bearer ' + token } });
    const t = await r.text();
    console.log(`\nGET ${pth}\n  status: ${r.status}\n  body: ${t.slice(0, 600)}`);
    if (r.status < 500) break;
  }
})().catch(e => console.error('ERRO no debug:', e.message));
