#!/usr/bin/env node
// Testa o download de um anexo. Uso: node test-baixar.js <cardId> <anexoId>
const base=(process.env.APP_URL||'https://gestaonexus-production.up.railway.app').replace(/\/$/,'');
const email=process.env.SEED_ADMIN_EMAIL, senha=process.env.SEED_ADMIN_SENHA;
const card=process.argv[2], anexo=process.argv[3];
const tok=j=>j&&(j.token||j.accessToken||(j.data&&j.data.token));
(async()=>{
  const rl=await fetch(base+'/api/auth/login',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({email,senha})});
  const token=tok(await rl.json().catch(()=>({})));
  if(!token){ console.log('login falhou', rl.status); return; }
  const r=await fetch(`${base}/api/cards/${card}/anexos/${anexo}/baixar`,{headers:{Authorization:'Bearer '+token}});
  console.log('GET baixar status:', r.status, r.status===200?'✅ ARQUIVO EXISTE (recuperado!)':(r.status===410?'❌ 410 arquivo perdido':'?'));
  if(r.status===200) console.log('  bytes:', (await r.arrayBuffer()).byteLength, '| content-type:', r.headers.get('content-type'));
  else console.log('  body:', (await r.text()).slice(0,200));
})().catch(e=>console.error('ERRO:',e.message));
