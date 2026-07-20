#!/usr/bin/env node
// Ajusta datas da Sprint 2 (28/07-08/08) e ativa.
const fs=require('fs'),path=require('path');
function env(){ if(process.env.DATABASE_PUBLIC_URL||process.env.DATABASE_URL)return;
  for(const p of [path.join(__dirname,'backend','.env'),path.join(__dirname,'.env')]) if(fs.existsSync(p))
    for(const l of fs.readFileSync(p,'utf8').split(/\r?\n/)){const m=l.match(/^\s*DATABASE_URL\s*=\s*(.*)\s*$/);if(m){process.env.DATABASE_URL=m[1].replace(/^["']|["']$/g,'');return;}}
}
const SPRINT='6a1abc64-ee14-4eb5-b61a-8fc5ea9297af';
(async()=>{ env();
  let Client; try{({Client}=require('pg'));}catch(_){({Client}=require(path.join(__dirname,'backend','node_modules','pg')));}
  let url=(process.env.DATABASE_PUBLIC_URL||process.env.DATABASE_URL).replace(/([?&])(sslmode|ssl|channel_binding)=[^&]*/gi,'$1').replace(/[?&]+$/,'');
  const c=new Client({connectionString:url,ssl:{rejectUnauthorized:false}});
  await c.connect();
  await c.query(`UPDATE sprints SET data_inicio='2026-07-28', data_fim='2026-08-08', estado='ativa', encerrada_em=NULL, atualizado_em=now() WHERE id=$1`,[SPRINT]);
  const r=await c.query('SELECT nome, to_char(data_inicio,\'DD/MM/YYYY\') di, to_char(data_fim,\'DD/MM/YYYY\') df, estado FROM sprints WHERE id=$1',[SPRINT]);
  const s=r.rows[0];
  console.log(`OK: "${s.nome}" -> ${s.di} a ${s.df} · estado: ${s.estado}`);
  await c.end();
})().catch(e=>{console.error('ERRO:',e.message);process.exit(1);});
