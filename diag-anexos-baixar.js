#!/usr/bin/env node
// Diagnóstico: testa o download (endpoint /baixar) de TODOS os anexos de card.
// Roda com: railway run --service GestaoNexus node diag-anexos-baixar.js
const fs=require('fs'),path=require('path');
const base=(process.env.APP_URL||'https://gestaonexus-production.up.railway.app').replace(/\/$/,'');
const email=process.env.SEED_ADMIN_EMAIL, senha=process.env.SEED_ADMIN_SENHA;
const tok=j=>j&&(j.token||j.accessToken||(j.data&&j.data.token));
(async()=>{
  let Client; try{({Client}=require('pg'));}catch(_){({Client}=require(path.join(__dirname,'backend','node_modules','pg')));}
  let url=(process.env.DATABASE_PUBLIC_URL||process.env.DATABASE_URL).replace(/([?&])(sslmode|ssl|channel_binding)=[^&]*/gi,'$1').replace(/[?&]+$/,'');
  const c=new Client({connectionString:url,ssl:{rejectUnauthorized:false}});
  await c.connect();
  const {rows}=await c.query("SELECT id, card_id, nome_original, arquivo_path, to_char(criado_em,'YYYY-MM-DD') d FROM card_anexos ORDER BY criado_em ASC");
  await c.end();
  const rl=await fetch(base+'/api/auth/login',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({email,senha})});
  const token=tok(await rl.json().catch(()=>({})));
  if(!token){ console.log('LOGIN FALHOU status',rl.status,'- sem token. Preciso de credenciais válidas.'); return; }
  console.log('login OK. Testando',rows.length,'anexos...\n');
  const byDate={}, bad=[];
  let ok=0,perdido=0,outro=0;
  for(const a of rows){
    let st;
    try{ const r=await fetch(`${base}/api/cards/${a.card_id}/anexos/${a.id}/baixar`,{headers:{Authorization:'Bearer '+token}}); st=r.status; }
    catch(e){ st='ERR'; }
    byDate[a.d]=byDate[a.d]||{ok:0,perdido:0,outro:0};
    if(st===200){ok++;byDate[a.d].ok++;}
    else if(st===410){perdido++;byDate[a.d].perdido++;bad.push(a);}
    else{outro++;byDate[a.d].outro++;bad.push({...a,st});}
  }
  console.log('=== RESUMO ===');
  console.log('OK(200):',ok,'| PERDIDO(410):',perdido,'| OUTRO:',outro,'| TOTAL:',rows.length);
  console.log('\n=== POR DATA (ok / perdido / outro) ===');
  for(const d of Object.keys(byDate).sort()) console.log(' ',d,':',byDate[d].ok,'/',byDate[d].perdido,'/',byDate[d].outro);
  console.log('\n=== PRIMEIRO OK (menor data com arquivo presente) ===');
  const primeiroOk=rows.find(a=>byDate[a.d].ok>0);
  console.log(primeiroOk?('data '+primeiroOk.d):'nenhum arquivo presente!');
})().catch(e=>{console.error('ERRO:',e.message);process.exit(1);});
