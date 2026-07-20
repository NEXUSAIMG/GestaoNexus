#!/usr/bin/env node
// Verifica o endpoint de sustentação (leitura) após deploy.
// railway run --service GestaoNexus node debug-sustentacao.js [quadroId]
const base = (process.env.APP_URL || 'https://gestaonexus-production.up.railway.app').replace(/\/$/, '');
const email = process.env.SEED_ADMIN_EMAIL, senha = process.env.SEED_ADMIN_SENHA;
const quadro = process.argv[2] || '009fd2bf-8370-41b4-bbac-b5b3f1415dd4';
const tok = (j) => j && (j.token || j.accessToken || (j.data && j.data.token));
(async () => {
  const rl = await fetch(base + '/api/auth/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email, senha }) });
  const token = tok(await rl.json().catch(() => ({})));
  if (!token) { console.log('login falhou', rl.status); return; }
  const r = await fetch(base + `/api/sustentacao?quadro_id=${quadro}`, { headers: { Authorization: 'Bearer ' + token } });
  const t = await r.text();
  console.log('GET /api/sustentacao status:', r.status);
  console.log('body:', t.slice(0, 300));
})().catch((e) => console.error('ERRO:', e.message));
