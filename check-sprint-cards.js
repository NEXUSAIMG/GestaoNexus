#!/usr/bin/env node
const fs = require('fs'), path = require('path');
function env(){ if(process.env.DATABASE_PUBLIC_URL||process.env.DATABASE_URL)return;
  for(const p of [path.join(__dirname,'backend','.env'),path.join(__dirname,'.env')]) if(fs.existsSync(p))
    for(const l of fs.readFileSync(p,'utf8').split(/\r?\n/)){const m=l.match(/^\s*DATABASE_URL\s*=\s*(.*)\s*$/);if(m){process.env.DATABASE_URL=m[1].replace(/^["']|["']$/g,'');return;}}
}
const SPRINT = process.argv[2] || '0c83f962-52b6-4403-a7d4-4915b541fa0f';
(async()=>{ env();
  let Client; try{({Client}=require('pg'));}catch(_){({Client}=require(path.join(__dirname,'backend','node_modules','pg')));}
  let url=(process.env.DATABASE_PUBLIC_URL||process.env.DATABASE_URL).replace(/([?&])(sslmode|ssl|channel_binding)=[^&]*/gi,'$1').replace(/[?&]+$/,'').replace(/\?&+/,'?').replace(/&&+/g,'&');
  const c=new Client({connectionString:url,ssl:{rejectUnauthorized:false}});
  await c.connect();
  const r=await c.query(`
    SELECT c.titulo, c.prioridade, c.estimativa_horas,
           (c.descricao IS NOT NULL AND c.descricao<>'') AS tem_desc,
           left(coalesce(c.descricao,''),40) AS desc_ini,
           (SELECT count(*)::int FROM cards_etiquetas ce WHERE ce.card_id=c.id) AS n_etq,
           (SELECT string_agg(qe.nome,',') FROM cards_etiquetas ce JOIN quadros_etiquetas qe ON qe.id=ce.etiqueta_id WHERE ce.card_id=c.id) AS etqs
      FROM cards c WHERE c.sprint_id=$1 AND c.arquivado_em IS NULL ORDER BY c.ordem`,[SPRINT]);
  console.log('titulo | prio | est_h | etiquetas | desc');
  for(const x of r.rows) console.log(`- ${x.titulo.slice(0,42).padEnd(42)} | P${x.prioridade} | ${x.estimativa_horas ?? '-'} | ${x.etqs||'(sem)'} | ${x.tem_desc?x.desc_ini:'(vazia)'}`);
  const tot=await c.query(`SELECT count(*)::int n, count(estimativa_horas)::int com_est, sum(estimativa_horas) soma FROM cards WHERE sprint_id=$1 AND arquivado_em IS NULL`,[SPRINT]);
  console.log(`\nTotal: ${tot.rows[0].n} cards | com estimativa: ${tot.rows[0].com_est} | soma horas: ${tot.rows[0].soma}`);
  await c.end();
})().catch(e=>{console.error('ERRO:',e.message);process.exit(1);});
