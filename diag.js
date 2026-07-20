#!/usr/bin/env node
// Diagnóstico: em qual banco estou e quão atual ele está.
const fs=require('fs'), path=require('path');
function env(){ if(process.env.DATABASE_PUBLIC_URL||process.env.DATABASE_URL)return;
  for(const p of [path.join(__dirname,'backend','.env'),path.join(__dirname,'.env')]) if(fs.existsSync(p))
    for(const l of fs.readFileSync(p,'utf8').split(/\r?\n/)){const m=l.match(/^\s*DATABASE_URL\s*=\s*(.*)\s*$/);if(m){process.env.DATABASE_URL=m[1].replace(/^["']|["']$/g,'');return;}}
}
(async()=>{ env();
  let Client; try{({Client}=require('pg'));}catch(_){({Client}=require(path.join(__dirname,'backend','node_modules','pg')));}
  const raw=process.env.DATABASE_PUBLIC_URL||process.env.DATABASE_URL;
  const host=(raw.match(/@([^:/?]+)/)||[])[1];
  let url=raw.replace(/([?&])(sslmode|ssl|channel_binding)=[^&]*/gi,'$1').replace(/[?&]+$/,'').replace(/\?&+/,'?').replace(/&&+/g,'&');
  const c=new Client({connectionString:url,ssl:{rejectUnauthorized:false}});
  await c.connect();
  console.log('Host do .env:', host);
  const a=await c.query('SELECT current_database() db, inet_server_addr() ip, version()');
  console.log('current_database:', a.rows[0].db, '| server ip:', a.rows[0].ip);
  const b=await c.query('SELECT count(*)::int n, max(criado_em) ultimo FROM quadros');
  console.log('quadros:', b.rows[0].n, '| ultimo criado_em:', b.rows[0].ultimo);
  const d=await c.query('SELECT max(criado_em) ultimo_card, count(*)::int n FROM cards');
  console.log('cards:', d.rows[0].n, '| ultimo card criado_em:', d.rows[0].ultimo_card);
  const e=await c.query("SELECT nome FROM quadros WHERE nome ILIKE '%estag%'");
  console.log('quadros com \"estag\":', e.rows.map(r=>r.nome));
  await c.end();
})().catch(e=>{console.error('ERRO:',e.message);process.exit(1);});
