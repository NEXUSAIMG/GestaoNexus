#!/usr/bin/env node
// Leitura: lista sprints do quadro + cards de cada sprint + backlog de projeto.
const fs = require('fs'), path = require('path');
function env(){ if(process.env.DATABASE_PUBLIC_URL||process.env.DATABASE_URL)return;
  for(const p of [path.join(__dirname,'backend','.env'),path.join(__dirname,'.env')]) if(fs.existsSync(p))
    for(const l of fs.readFileSync(p,'utf8').split(/\r?\n/)){const m=l.match(/^\s*DATABASE_URL\s*=\s*(.*)\s*$/);if(m){process.env.DATABASE_URL=m[1].replace(/^["']|["']$/g,'');return;}}
}
const QUADRO = process.argv[2] || '009fd2bf-8370-41b4-bbac-b5b3f1415dd4';
(async()=>{ env();
  let Client; try{({Client}=require('pg'));}catch(_){({Client}=require(path.join(__dirname,'backend','node_modules','pg')));}
  let url=(process.env.DATABASE_PUBLIC_URL||process.env.DATABASE_URL).replace(/([?&])(sslmode|ssl|channel_binding)=[^&]*/gi,'$1').replace(/[?&]+$/,'').replace(/\?&+/,'?').replace(/&&+/g,'&');
  const c=new Client({connectionString:url,ssl:{rejectUnauthorized:false}});
  await c.connect();
  const q=await c.query('SELECT nome FROM quadros WHERE id=$1',[QUADRO]);
  console.log('Quadro:', q.rows[0]?.nome);
  const s=await c.query(`SELECT id,nome,estado,data_inicio,data_fim,criado_em,
      (SELECT count(*)::int FROM cards ca WHERE ca.sprint_id=s.id AND ca.arquivado_em IS NULL) n
      FROM sprints s WHERE quadro_id=$1 ORDER BY criado_em`,[QUADRO]);
  console.log('\nSPRINTS ('+s.rows.length+'):');
  for(const r of s.rows) console.log(`  [${r.estado}] "${r.nome}" ${String(r.data_inicio).slice(0,10)}→${String(r.data_fim).slice(0,10)} — ${r.n} cards (id ${r.id})`);
  for(const r of s.rows){
    const cc=await c.query(`SELECT titulo FROM cards WHERE sprint_id=$1 AND arquivado_em IS NULL ORDER BY ordem`,[r.id]);
    if(cc.rows.length) console.log(`\n  Cards em "${r.nome}":`), cc.rows.forEach(x=>console.log('    - '+x.titulo));
  }
  const bl=await c.query(`SELECT count(*)::int n FROM cards WHERE quadro_id=$1 AND fluxo='projeto' AND sprint_id IS NULL AND arquivado_em IS NULL`,[QUADRO]);
  console.log('\nCards de projeto SEM sprint (backlog):', bl.rows[0].n);
  await c.end();
})().catch(e=>{console.error('ERRO:',e.message);process.exit(1);});
