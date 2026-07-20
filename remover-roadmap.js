#!/usr/bin/env node
// Tira da Sprint 1 os cards de Roadmap (prioridade=3/Baixa) -> voltam ao backlog do produto.
const fs=require('fs'),path=require('path');
function env(){ if(process.env.DATABASE_PUBLIC_URL||process.env.DATABASE_URL)return;
  for(const p of [path.join(__dirname,'backend','.env'),path.join(__dirname,'.env')]) if(fs.existsSync(p))
    for(const l of fs.readFileSync(p,'utf8').split(/\r?\n/)){const m=l.match(/^\s*DATABASE_URL\s*=\s*(.*)\s*$/);if(m){process.env.DATABASE_URL=m[1].replace(/^["']|["']$/g,'');return;}}
}
const SPRINT='0c83f962-52b6-4403-a7d4-4915b541fa0f';
(async()=>{ env();
  let Client; try{({Client}=require('pg'));}catch(_){({Client}=require(path.join(__dirname,'backend','node_modules','pg')));}
  let url=(process.env.DATABASE_PUBLIC_URL||process.env.DATABASE_URL).replace(/([?&])(sslmode|ssl|channel_binding)=[^&]*/gi,'$1').replace(/[?&]+$/,'').replace(/\?&+/,'?').replace(/&&+/g,'&');
  const c=new Client({connectionString:url,ssl:{rejectUnauthorized:false}});
  await c.connect();
  const alvo=await c.query(`SELECT titulo FROM cards WHERE sprint_id=$1 AND prioridade=3 AND arquivado_em IS NULL ORDER BY ordem`,[SPRINT]);
  console.log('Removendo da sprint ('+alvo.rows.length+'):');
  alvo.rows.forEach(x=>console.log('  - '+x.titulo));
  const upd=await c.query(`UPDATE cards SET sprint_id=NULL, atualizado_em=now() WHERE sprint_id=$1 AND prioridade=3 AND arquivado_em IS NULL`,[SPRINT]);
  const rest=await c.query(`SELECT count(*)::int n, sum(estimativa_horas) h FROM cards WHERE sprint_id=$1 AND arquivado_em IS NULL`,[SPRINT]);
  console.log(`\nRemovidos: ${upd.rowCount}. Sprint 1 agora: ${rest.rows[0].n} cards, ${rest.rows[0].h}h.`);
  await c.end();
})().catch(e=>{console.error('ERRO:',e.message);process.exit(1);});
