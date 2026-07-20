#!/usr/bin/env node
/* Migra o roteiro "Como testar" (como_testar.json) para a descrição dos cards
 * da Sprint 1. Dry-run por padrão; --apply grava. Idempotente. */
const fs=require('fs'),path=require('path');
function env(){ if(process.env.DATABASE_PUBLIC_URL||process.env.DATABASE_URL)return;
  for(const p of [path.join(__dirname,'backend','.env'),path.join(__dirname,'.env')]) if(fs.existsSync(p))
    for(const l of fs.readFileSync(p,'utf8').split(/\r?\n/)){const m=l.match(/^\s*DATABASE_URL\s*=\s*(.*)\s*$/);if(m){process.env.DATABASE_URL=m[1].replace(/^["']|["']$/g,'');return;}}
}
const SPRINT='0c83f962-52b6-4403-a7d4-4915b541fa0f';
const APPLY=process.argv.includes('--apply');
const MARCADOR='=== COMO TESTAR ===';

(async()=>{ env();
  const roteiros=JSON.parse(fs.readFileSync(path.join(__dirname,'como_testar.json'),'utf8'));
  let Client; try{({Client}=require('pg'));}catch(_){({Client}=require(path.join(__dirname,'backend','node_modules','pg')));}
  let url=(process.env.DATABASE_PUBLIC_URL||process.env.DATABASE_URL).replace(/([?&])(sslmode|ssl|channel_binding)=[^&]*/gi,'$1').replace(/[?&]+$/,'').replace(/\?&+/,'?').replace(/&&+/g,'&');
  const c=new Client({connectionString:url,ssl:{rejectUnauthorized:false}});
  await c.connect();
  const cards=(await c.query('SELECT id,titulo,descricao FROM cards WHERE sprint_id=$1 AND arquivado_em IS NULL',[SPRINT])).rows;
  const byTit=new Map(cards.map(x=>[x.titulo,x]));
  let add=0, skip=0, semCard=0;
  console.log(`=== ${APPLY?'APLICANDO':'DRY-RUN'} — ${Object.keys(roteiros).length} roteiros ===`);
  for(const [tit,roteiro] of Object.entries(roteiros)){
    const card=byTit.get(tit);
    if(!card){ console.log('  ❌ card não encontrado: '+tit); semCard++; continue; }
    const desc=card.descricao||'';
    if(desc.includes(MARCADOR)){ console.log('  ↷ já tem roteiro: '+tit.slice(0,45)); skip++; continue; }
    const nova=(desc?desc.trimEnd()+'\n\n':'')+MARCADOR+'\n'+roteiro;
    console.log('  ✓ '+tit.slice(0,50)+`  (+${roteiro.length} chars)`);
    if(APPLY) await c.query('UPDATE cards SET descricao=$2, atualizado_em=now() WHERE id=$1',[card.id,nova]);
    add++;
  }
  console.log(`\n${APPLY?'GRAVADO':'Prévia'}: ${add} cards atualizados, ${skip} já tinham, ${semCard} sem match.`);
  if(!APPLY) console.log('Rode com --apply para gravar.');
  await c.end();
})().catch(e=>{console.error('ERRO:',e.message);process.exit(1);});
