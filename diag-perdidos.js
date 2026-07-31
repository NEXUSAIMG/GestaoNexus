#!/usr/bin/env node
// Lista detalhada dos anexos PERDIDOS (410), pra checklist de reenvio.
const path=require('path');
const base=(process.env.APP_URL||'https://gestaonexus-production.up.railway.app').replace(/\/$/,'');
const email=process.env.SEED_ADMIN_EMAIL, senha=process.env.SEED_ADMIN_SENHA;
const tok=j=>j&&(j.token||j.accessToken||(j.data&&j.data.token));
(async()=>{
  let Client; try{({Client}=require('pg'));}catch(_){({Client}=require(path.join(__dirname,'backend','node_modules','pg')));}
  let url=(process.env.DATABASE_PUBLIC_URL||process.env.DATABASE_URL).replace(/([?&])(sslmode|ssl|channel_binding)=[^&]*/gi,'$1').replace(/[?&]+$/,'');
  const c=new Client({connectionString:url,ssl:{rejectUnauthorized:false}});
  await c.connect();
  const {rows}=await c.query(`
    SELECT a.id, a.card_id, a.nome_original, a.arquivo_path,
           to_char(a.criado_em,'DD/MM HH24:MI') dt,
           COALESCE(p.nome,'?') enviado_por, COALESCE(cd.titulo,'?') card_titulo
      FROM card_anexos a
      LEFT JOIN pessoas_acesso p ON p.id=a.enviado_por_id
      LEFT JOIN cards cd ON cd.id=a.card_id
     ORDER BY a.criado_em ASC`);
  await c.end();
  const rl=await fetch(base+'/api/auth/login',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({email,senha})});
  const token=tok(await rl.json().catch(()=>({})));
  if(!token){ console.log('LOGIN FALHOU',rl.status); return; }
  const perdidos=[];
  for(const a of rows){
    let st; try{ const r=await fetch(`${base}/api/cards/${a.card_id}/anexos/${a.id}/baixar`,{headers:{Authorization:'Bearer '+token}}); st=r.status; }catch(e){ st='ERR'; }
    if(st!==200) perdidos.push(a);
  }
  console.log('ANEXOS PERDIDOS:',perdidos.length,'\n');
  perdidos.forEach((a,i)=>{
    console.log(`${i+1}. ${a.nome_original}`);
    console.log(`   card: ${a.card_titulo}  | enviado por: ${a.enviado_por}  | ${a.dt}`);
  });
})().catch(e=>{console.error('ERRO:',e.message);process.exit(1);});
