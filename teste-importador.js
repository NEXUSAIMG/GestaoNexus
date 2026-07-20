#!/usr/bin/env node
/* Helper de TESTE (produção): cria / conta / apaga um quadro temporário.
 * Uso: node teste-importador.js <create|contar|limpar>
 * Quadro: "ZZ Teste Importador (apagar)" na equipe Desenvolvimento. */
const fs = require('fs'), path = require('path');
const NOME = 'ZZ Teste Importador (apagar)';
function env(){ if(process.env.DATABASE_PUBLIC_URL||process.env.DATABASE_URL)return;
  for(const p of [path.join(__dirname,'backend','.env'),path.join(__dirname,'.env')]) if(fs.existsSync(p))
    for(const l of fs.readFileSync(p,'utf8').split(/\r?\n/)){const m=l.match(/^\s*DATABASE_URL\s*=\s*(.*)\s*$/);if(m){process.env.DATABASE_URL=m[1].replace(/^["']|["']$/g,'');return;}}
}
(async()=>{
  const cmd=process.argv[2];
  env();
  let Client; try{({Client}=require('pg'));}catch(_){({Client}=require(path.join(__dirname,'backend','node_modules','pg')));}
  let url=(process.env.DATABASE_PUBLIC_URL||process.env.DATABASE_URL).replace(/([?&])(sslmode|ssl|channel_binding)=[^&]*/gi,'$1').replace(/[?&]+$/,'').replace(/\?&+/,'?').replace(/&&+/g,'&');
  const c=new Client({connectionString:url,ssl:{rejectUnauthorized:false}});
  await c.connect();
  try{
    if(cmd==='create'){
      const ex=await c.query('SELECT id FROM quadros WHERE nome=$1 AND arquivado_em IS NULL',[NOME]);
      if(ex.rows.length){console.log('Quadro de teste já existe:',ex.rows[0].id);}
      else{
        const eqRows=await c.query("SELECT id FROM equipes WHERE nome='Desenvolvimento' LIMIT 1");
        const eq=(eqRows.rows[0]||(await c.query('SELECT id FROM equipes LIMIT 1')).rows[0]).id;
        const admRows=await c.query('SELECT id FROM pessoas_acesso LIMIT 1');
        const adm=admRows.rows[0]?admRows.rows[0].id:null;
        const q=(await c.query('INSERT INTO quadros (equipe_id,nome,aberto_a_socios,criado_por_id) VALUES ($1,$2,true,$3) RETURNING id',[eq,NOME,adm])).rows[0].id;
        await c.query(`INSERT INTO colunas (quadro_id,nome,ordem,tipo) VALUES
          ($1,'A fazer',1000,'backlog'),($1,'Em andamento',2000,'em_andamento'),($1,'Concluído',3000,'concluida')`,[q]);
        console.log('Quadro de teste criado:',q);
      }
    } else if(cmd==='contar'){
      const r=await c.query(`SELECT count(*)::int n, sum(estimativa_horas) h, string_agg(DISTINCT co.nome,',') col
        FROM cards ca JOIN quadros q ON q.id=ca.quadro_id JOIN colunas co ON co.id=ca.coluna_id
        WHERE q.nome=$1`,[NOME]);
      const pr=await c.query(`SELECT prioridade,count(*)::int n FROM cards ca JOIN quadros q ON q.id=ca.quadro_id
        WHERE q.nome=$1 GROUP BY prioridade ORDER BY prioridade`,[NOME]);
      const et=await c.query(`SELECT qe.nome,count(*)::int n FROM cards ca JOIN quadros q ON q.id=ca.quadro_id
        JOIN cards_etiquetas ce ON ce.card_id=ca.id JOIN quadros_etiquetas qe ON qe.id=ce.etiqueta_id
        WHERE q.nome=$1 GROUP BY qe.nome ORDER BY n DESC`,[NOME]);
      console.log(`Cards: ${r.rows[0].n} | ${r.rows[0].h}h | coluna(s): ${r.rows[0].col}`);
      console.log('Prioridade:', pr.rows.map(x=>`P${x.prioridade}:${x.n}`).join(' '));
      console.log('Etiquetas:', et.rows.map(x=>`${x.nome}:${x.n}`).join(' '));
    } else if(cmd==='limpar'){
      const q=(await c.query('SELECT id FROM quadros WHERE nome=$1',[NOME])).rows.map(r=>r.id);
      for(const id of q){
        await c.query('DELETE FROM cards WHERE quadro_id=$1',[id]);      // cards_etiquetas cascateia
        await c.query('DELETE FROM colunas WHERE quadro_id=$1',[id]);
        await c.query('DELETE FROM quadros_etiquetas WHERE quadro_id=$1',[id]);
        await c.query('DELETE FROM quadros WHERE id=$1',[id]);
      }
      console.log(`Quadro(s) de teste apagado(s): ${q.length}`);
    } else {
      console.log('Uso: node teste-importador.js <create|contar|limpar>');
    }
  } finally { await c.end(); }
})().catch(e=>{console.error('ERRO:',e.message);process.exit(1);});
