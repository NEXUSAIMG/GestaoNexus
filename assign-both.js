#!/usr/bin/env node
// Coloca Ícaro E Kaleby como responsáveis em TODOS os cards da Sprint 2.
const fs=require('fs'),path=require('path');
function env(){ if(process.env.DATABASE_PUBLIC_URL||process.env.DATABASE_URL)return;
  for(const p of [path.join(__dirname,'backend','.env'),path.join(__dirname,'.env')]) if(fs.existsSync(p))
    for(const l of fs.readFileSync(p,'utf8').split(/\r?\n/)){const m=l.match(/^\s*DATABASE_URL\s*=\s*(.*)\s*$/);if(m){process.env.DATABASE_URL=m[1].replace(/^["']|["']$/g,'');return;}}
}
const SPRINT='6a1abc64-ee14-4eb5-b61a-8fc5ea9297af'; // Sprint 2 - Instalação do Zabbix
(async()=>{ env();
  let Client; try{({Client}=require('pg'));}catch(_){({Client}=require(path.join(__dirname,'backend','node_modules','pg')));}
  let url=(process.env.DATABASE_PUBLIC_URL||process.env.DATABASE_URL).replace(/([?&])(sslmode|ssl|channel_binding)=[^&]*/gi,'$1').replace(/[?&]+$/,'');
  const c=new Client({connectionString:url,ssl:{rejectUnauthorized:false}});
  await c.connect();
  const icaro=(await c.query("SELECT id,nome FROM pessoas_acesso WHERE nome ILIKE '%santana%'")).rows;
  const kaleby=(await c.query("SELECT id,nome FROM pessoas_acesso WHERE nome ILIKE '%kaleby%'")).rows;
  if(icaro.length!==1||kaleby.length!==1){ console.log('ABORT: resolução ambígua', icaro.map(x=>x.nome), kaleby.map(x=>x.nome)); await c.end(); return; }
  console.log('Responsáveis:', icaro[0].nome, '+', kaleby[0].nome);
  const cards=(await c.query('SELECT id FROM cards WHERE sprint_id=$1 AND arquivado_em IS NULL',[SPRINT])).rows;
  await c.query('BEGIN');
  for(const card of cards){
    await c.query('DELETE FROM cards_responsaveis WHERE card_id=$1',[card.id]);
    await c.query('INSERT INTO cards_responsaveis (card_id,pessoa_id,ordem) VALUES ($1,$2,0),($1,$3,1) ON CONFLICT DO NOTHING',[card.id,icaro[0].id,kaleby[0].id]);
    await c.query('UPDATE cards SET responsavel_id=$2, atualizado_em=now() WHERE id=$1',[card.id,icaro[0].id]);
  }
  await c.query('COMMIT');
  console.log('Atualizados', cards.length, 'cards da Sprint 2 com Ícaro + Kaleby.');
  await c.end();
})().catch(e=>{console.error('ERRO:',e.message);process.exit(1);});
