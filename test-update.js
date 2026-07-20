#!/usr/bin/env node
// Reproduz o 500 ao editar um card. Uso: node test-update.js <cardId>
const base=(process.env.APP_URL||'https://gestaonexus-production.up.railway.app').replace(/\/$/,'');
const email=process.env.SEED_ADMIN_EMAIL, senha=process.env.SEED_ADMIN_SENHA;
const card=process.argv[2]||'e27c4b6d-3a3c-4c4a-911b-ca8b362335b3';
const tok=j=>j&&(j.token||j.accessToken||(j.data&&j.data.token));
(async()=>{
  const rl=await fetch(base+'/api/auth/login',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({email,senha})});
  const token=tok(await rl.json().catch(()=>({}))); if(!token){console.log('login falhou',rl.status);return;}
  const auth={Authorization:'Bearer '+token,'Content-Type':'application/json'};
  // 1) mudança simples (prioridade) — não mexe em responsáveis/etiquetas
  let r=await fetch(`${base}/api/cards/${card}`,{method:'PUT',headers:auth,body:JSON.stringify({prioridade:2})});
  console.log('PUT {prioridade} ->', r.status, r.status>=300?(await r.text()).slice(0,200):'ok');
  // 2) mudança de descrição
  r=await fetch(`${base}/api/cards/${card}`,{method:'PUT',headers:auth,body:JSON.stringify({descricao:'teste '+Date.now()})});
  console.log('PUT {descricao} ->', r.status, r.status>=300?(await r.text()).slice(0,200):'ok');
  // 3) mudança de responsáveis (suspeito do bug)
  r=await fetch(`${base}/api/cards/${card}`,{method:'PUT',headers:auth,body:JSON.stringify({responsavel_ids:[]})});
  console.log('PUT {responsavel_ids:[]} ->', r.status, r.status>=300?(await r.text()).slice(0,200):'ok');
})().catch(e=>console.error('ERRO:',e.message));
