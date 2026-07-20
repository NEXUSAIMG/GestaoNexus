#!/usr/bin/env node
// Move os 22 cards da minha sprint duplicada para a Sprint 2 do usuário e apaga a duplicata.
const fs=require('fs'),path=require('path');
function env(){ if(process.env.DATABASE_PUBLIC_URL||process.env.DATABASE_URL)return;
  for(const p of [path.join(__dirname,'backend','.env'),path.join(__dirname,'.env')]) if(fs.existsSync(p))
    for(const l of fs.readFileSync(p,'utf8').split(/\r?\n/)){const m=l.match(/^\s*DATABASE_URL\s*=\s*(.*)\s*$/);if(m){process.env.DATABASE_URL=m[1].replace(/^["']|["']$/g,'');return;}}
}
const DEST='6a1abc64-ee14-4eb5-b61a-8fc5ea9297af';   // Sprint 2 - Instalação do Zabbix (do usuário)
const DUP ='d2b3b009-ffb5-425f-9d83-5cbd35a4ea35';   // a que eu criei (apagar)
(async()=>{ env();
  let Client; try{({Client}=require('pg'));}catch(_){({Client}=require(path.join(__dirname,'backend','node_modules','pg')));}
  let url=(process.env.DATABASE_PUBLIC_URL||process.env.DATABASE_URL).replace(/([?&])(sslmode|ssl|channel_binding)=[^&]*/gi,'$1').replace(/[?&]+$/,'');
  const c=new Client({connectionString:url,ssl:{rejectUnauthorized:false}});
  await c.connect();
  await c.query('BEGIN');
  const upd=await c.query('UPDATE cards SET sprint_id=$1, atualizado_em=now() WHERE sprint_id=$2',[DEST,DUP]);
  await c.query('DELETE FROM sprints WHERE id=$1',[DUP]);
  await c.query('COMMIT');
  const r=await c.query('SELECT nome, (SELECT count(*)::int FROM cards ca WHERE ca.sprint_id=s.id AND ca.arquivado_em IS NULL) n, (SELECT sum(estimativa_horas) FROM cards ca WHERE ca.sprint_id=s.id AND ca.arquivado_em IS NULL) h FROM sprints s WHERE id=$1',[DEST]);
  console.log(`Movidos: ${upd.rowCount} cards. Duplicata apagada.`);
  console.log(`Sprint destino "${r.rows[0].nome}": ${r.rows[0].n} cards, ${r.rows[0].h}h.`);
  await c.end();
})().catch(e=>{console.error('ERRO:',e.message);process.exit(1);});
