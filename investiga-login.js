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
  console.log('=== colunas de equipes_membros ===');
  console.log((await c.query("SELECT column_name,data_type FROM information_schema.columns WHERE table_name='equipes_membros' ORDER BY ordinal_position")).rows.map(r=>r.column_name+':'+r.data_type).join(' | '));
  console.log('\n=== equipes ===');
  (await c.query('SELECT id,nome FROM equipes WHERE arquivada_em IS NULL ORDER BY nome')).rows.forEach(r=>console.log('  '+r.nome+' -> '+r.id));
  console.log('\n=== estagiários: pessoa + qtd equipes ===');
  const r=await c.query(`
    SELECT p.id, p.nome, p.email, p.ativo, p.administrador,
           (SELECT count(*)::int FROM equipes_membros em JOIN equipes e ON e.id=em.equipe_id WHERE em.pessoa_id=p.id AND e.arquivada_em IS NULL) AS n_equipes
      FROM pessoas_acesso p
     WHERE p.nome ILIKE '%karina%' OR p.nome ILIKE '%ludmila%' OR p.nome ILIKE '%santana%'
        OR p.nome ILIKE '%kaleby%' OR p.nome ILIKE '%yoshida%'
     ORDER BY p.nome`);
  for(const x of r.rows) console.log(`  ${x.nome} <${x.email}> ativo=${x.ativo} admin=${x.administrador} equipes=${x.n_equipes} (id ${x.id})`);
  await c.end();
})().catch(e=>{console.error('ERRO:',e.message);process.exit(1);});
