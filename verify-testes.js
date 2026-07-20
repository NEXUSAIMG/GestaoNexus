#!/usr/bin/env node
const fs=require('fs'),path=require('path');
function env(){ if(process.env.DATABASE_PUBLIC_URL||process.env.DATABASE_URL)return;
  for(const p of [path.join(__dirname,'backend','.env'),path.join(__dirname,'.env')]) if(fs.existsSync(p))
    for(const l of fs.readFileSync(p,'utf8').split(/\r?\n/)){const m=l.match(/^\s*DATABASE_URL\s*=\s*(.*)\s*$/);if(m){process.env.DATABASE_URL=m[1].replace(/^["']|["']$/g,'');return;}}
}
const SPRINT='0c83f962-52b6-4403-a7d4-4915b541fa0f';
(async()=>{ env();
  let Client; try{({Client}=require('pg'));}catch(_){({Client}=require(path.join(__dirname,'backend','node_modules','pg')));}
  let url=(process.env.DATABASE_PUBLIC_URL||process.env.DATABASE_URL).replace(/([?&])(sslmode|ssl|channel_binding)=[^&]*/gi,'$1').replace(/[?&]+$/,'');
  const c=new Client({connectionString:url,ssl:{rejectUnauthorized:false}});
  await c.connect();
  const r=await c.query("SELECT titulo,descricao FROM cards WHERE sprint_id=$1 AND arquivado_em IS NULL AND descricao LIKE '%COMO TESTAR%' ORDER BY ordem",[SPRINT]);
  console.log('Cards com roteiro:', r.rows.length, '/ 20');
  // amostra: card com emoji de telefone
  const amostra=r.rows.find(x=>x.descricao.includes('Chamada perdida')) || r.rows[0];
  const d=amostra.descricao;
  const temEmoji=/\p{Extended_Pictographic}/u.test(d);
  const temAcento=/[áàâãéêíóôõúç]/i.test(d);
  console.log('\nAmostra:', amostra.titulo);
  console.log('  contém "PASSOS":', d.includes('PASSOS'), '| "ESPERADO":', d.includes('ESPERADO'));
  console.log('  acentos ok:', temAcento, '| emojis ok:', temEmoji);
  const i=d.indexOf('=== COMO TESTAR ===');
  console.log('\n  trecho do roteiro:\n'+d.slice(i,i+220).split('\n').map(x=>'    '+x).join('\n'));
  await c.end();
})().catch(e=>{console.error('ERRO:',e.message);process.exit(1);});
