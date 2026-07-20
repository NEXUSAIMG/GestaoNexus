#!/usr/bin/env node
// Lista os quadros do banco (nome + colunas) para achar o alvo da importação.
const fs = require('fs');
const path = require('path');
function carregarEnv(){
  if (process.env.DATABASE_URL) return;
  for (const p of [path.join(__dirname,'backend','.env'), path.join(__dirname,'.env')]) {
    if (fs.existsSync(p)) for (const l of fs.readFileSync(p,'utf8').split(/\r?\n/)) {
      const m=l.match(/^\s*DATABASE_URL\s*=\s*(.*)\s*$/); if(m){process.env.DATABASE_URL=m[1].replace(/^["']|["']$/g,''); return;}
    }
  }
}
(async()=>{
  carregarEnv();
  let Client; try{({Client}=require('pg'));}catch(_){({Client}=require(path.join(__dirname,'backend','node_modules','pg')));}
  let url=process.env.DATABASE_URL.replace(/([?&])(sslmode|ssl|channel_binding)=[^&]*/gi,'$1').replace(/[?&]+$/,'').replace(/\?&+/,'?').replace(/&&+/g,'&');
  const c=new Client({connectionString:url, ssl:{rejectUnauthorized:false}});
  await c.connect();
  const q=await c.query(`SELECT q.id, q.nome, q.arquivado_em IS NOT NULL AS arquivado,
      (SELECT string_agg(co.nome||' ['||co.tipo||']', ', ' ORDER BY co.ordem)
         FROM colunas co WHERE co.quadro_id=q.id AND co.arquivada_em IS NULL) AS colunas
    FROM quadros q ORDER BY q.criado_em`);
  for (const r of q.rows) {
    console.log(`- "${r.nome}"${r.arquivado?' (ARQUIVADO)':''}\n    colunas: ${r.colunas||'(nenhuma)'}`);
  }
  await c.end();
})().catch(e=>{console.error('ERRO:',e.message);process.exit(1);});
