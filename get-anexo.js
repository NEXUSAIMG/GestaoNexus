#!/usr/bin/env node
const fs=require('fs'),path=require('path');
function env(){ if(process.env.DATABASE_PUBLIC_URL||process.env.DATABASE_URL)return;
  for(const p of [path.join(__dirname,'backend','.env'),path.join(__dirname,'.env')]) if(fs.existsSync(p))
    for(const l of fs.readFileSync(p,'utf8').split(/\r?\n/)){const m=l.match(/^\s*DATABASE_URL\s*=\s*(.*)\s*$/);if(m){process.env.DATABASE_URL=m[1].replace(/^["']|["']$/g,'');return;}}
}
(async()=>{ env();
  let Client; try{({Client}=require('pg'));}catch(_){({Client}=require(path.join(__dirname,'backend','node_modules','pg')));}
  let url=(process.env.DATABASE_PUBLIC_URL||process.env.DATABASE_URL).replace(/([?&])(sslmode|ssl|channel_binding)=[^&]*/gi,'$1').replace(/[?&]+$/,'');
  const c=new Client({connectionString:url,ssl:{rejectUnauthorized:false}});
  await c.connect();
  const dist=await c.query("SELECT to_char(criado_em,'YYYY-MM-DD') d, count(*)::int n FROM card_anexos GROUP BY 1 ORDER BY 1");
  console.log('anexos por data:'); dist.rows.forEach(x=>console.log('  '+x.d+': '+x.n));
  const r=await c.query('SELECT id anexo_id, card_id, nome_original, arquivo_path, to_char(criado_em,\'DD/MM HH24:MI\') dt FROM card_anexos ORDER BY criado_em ASC LIMIT 4');
  console.log('\nMAIS ANTIGOS:');
  for(const x of r.rows) console.log(`card=${x.card_id} anexo=${x.anexo_id} | ${x.nome_original} | ${x.dt} | ${x.arquivo_path}`);
  await c.end();
})().catch(e=>{console.error('ERRO:',e.message);process.exit(1);});
