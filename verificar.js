#!/usr/bin/env node
// Verifica os 27 cards importados (tag na descrição) no quadro Atividades Estagiários.
const fs=require('fs'), path=require('path');
function env(){ if(process.env.DATABASE_PUBLIC_URL||process.env.DATABASE_URL)return;
  for(const p of [path.join(__dirname,'backend','.env'),path.join(__dirname,'.env')]) if(fs.existsSync(p))
    for(const l of fs.readFileSync(p,'utf8').split(/\r?\n/)){const m=l.match(/^\s*DATABASE_URL\s*=\s*(.*)\s*$/);if(m){process.env.DATABASE_URL=m[1].replace(/^["']|["']$/g,'');return;}}
}
(async()=>{ env();
  let Client; try{({Client}=require('pg'));}catch(_){({Client}=require(path.join(__dirname,'backend','node_modules','pg')));}
  let url=(process.env.DATABASE_PUBLIC_URL||process.env.DATABASE_URL).replace(/([?&])(sslmode|ssl|channel_binding)=[^&]*/gi,'$1').replace(/[?&]+$/,'').replace(/\?&+/,'?').replace(/&&+/g,'&');
  const c=new Client({connectionString:url,ssl:{rejectUnauthorized:false}});
  await c.connect();
  const base=`FROM cards c
    JOIN quadros q ON q.id=c.quadro_id
    JOIN colunas co ON co.id=c.coluna_id
    WHERE q.nome='Atividades Estagiários' AND c.descricao LIKE '%importado do backlog GestaoNexus%'`;
  const tot=await c.query(`SELECT count(*)::int n, sum(c.estimativa_horas) h, string_agg(DISTINCT co.nome,', ') col ${base}`);
  console.log(`Importados: ${tot.rows[0].n} cards | ${tot.rows[0].h}h | coluna(s): ${tot.rows[0].col}`);
  const pr=await c.query(`SELECT c.prioridade, count(*)::int n, sum(c.estimativa_horas) h ${base} GROUP BY c.prioridade ORDER BY c.prioridade`);
  console.log('Por prioridade (0=Crit,1=Alta,2=Normal,3=Baixa):');
  for(const r of pr.rows) console.log(`  P${r.prioridade}: ${r.n} cards, ${r.h}h`);
  const et=await c.query(`SELECT qe.nome, count(*)::int n
    FROM cards c JOIN quadros q ON q.id=c.quadro_id
    JOIN cards_etiquetas ce ON ce.card_id=c.id
    JOIN quadros_etiquetas qe ON qe.id=ce.etiqueta_id
    WHERE q.nome='Atividades Estagiários' AND c.descricao LIKE '%importado do backlog GestaoNexus%'
    GROUP BY qe.nome ORDER BY n DESC`);
  console.log('Etiquetas vinculadas:');
  for(const r of et.rows) console.log(`  ${r.nome}: ${r.n}`);
  const pk=await c.query(`SELECT c.titulo, c.prioridade, c.estimativa_horas ${base} ORDER BY c.ordem LIMIT 3`);
  console.log('Primeiros por ordem:');
  for(const r of pk.rows) console.log(`  [P${r.prioridade} ${r.estimativa_horas}h] ${r.titulo}`);
  await c.end();
})().catch(e=>{console.error('ERRO:',e.message);process.exit(1);});
