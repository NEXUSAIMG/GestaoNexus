#!/usr/bin/env node
// Prova a persistência: sobe um arquivo novo num card e baixa de volta.
// Uso: railway run --service GestaoNexus node test-roundtrip.js <cardId>
const base=(process.env.APP_URL||'https://gestaonexus-production.up.railway.app').replace(/\/$/,'');
const email=process.env.SEED_ADMIN_EMAIL, senha=process.env.SEED_ADMIN_SENHA;
const card=process.argv[2]||'e27c4b6d-3a3c-4c4a-911b-ca8b362335b3';
const tok=j=>j&&(j.token||j.accessToken||(j.data&&j.data.token));
(async()=>{
  const rl=await fetch(base+'/api/auth/login',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({email,senha})});
  const token=tok(await rl.json().catch(()=>({})));
  if(!token){ console.log('login falhou',rl.status); return; }
  const auth={Authorization:'Bearer '+token};

  // upload
  const fd=new FormData();
  fd.append('arquivo', new Blob(['teste de persistencia de anexo '+Date.now()],{type:'text/plain'}), 'teste-persistencia.txt');
  fd.append('descricao','teste automatico (pode apagar)');
  const up=await fetch(`${base}/api/cards/${card}/anexos`,{method:'POST',headers:auth,body:fd});
  const upj=await up.json().catch(()=>({}));
  console.log('UPLOAD status:', up.status, up.status<300?'ok':JSON.stringify(upj).slice(0,200));
  if(up.status>=300){ return; }
  const anexoId=upj.id;
  console.log('  anexo criado:', anexoId, '| path:', upj.arquivo_path);

  // download
  const dl=await fetch(`${base}/api/cards/${card}/anexos/${anexoId}/baixar`,{headers:auth});
  console.log('DOWNLOAD status:', dl.status, dl.status===200?'✅ PERSISTIU (fix funcionou!)':'❌ falhou');
  if(dl.status===200) console.log('  bytes:', (await dl.arrayBuffer()).byteLength);

  // cleanup
  const del=await fetch(`${base}/api/cards/${card}/anexos/${anexoId}`,{method:'DELETE',headers:auth});
  console.log('CLEANUP (delete) status:', del.status);
})().catch(e=>console.error('ERRO:',e.message));
