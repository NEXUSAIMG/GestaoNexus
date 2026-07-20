#!/usr/bin/env node
// Adiciona a Karina Santos Rebêlo à equipe dos estagiários (mesma do Ícaro/Kaleby/Evelin).
const fs=require('fs'),path=require('path');
function env(){ if(process.env.DATABASE_PUBLIC_URL||process.env.DATABASE_URL)return;
  for(const p of [path.join(__dirname,'backend','.env'),path.join(__dirname,'.env')]) if(fs.existsSync(p))
    for(const l of fs.readFileSync(p,'utf8').split(/\r?\n/)){const m=l.match(/^\s*DATABASE_URL\s*=\s*(.*)\s*$/);if(m){process.env.DATABASE_URL=m[1].replace(/^["']|["']$/g,'');return;}}
}
const KARINA='12b8feec-d261-437e-94f0-5aeb4f815db6';
const REFS=['9c060fc7-25e4-4647-a5d9-899e376d04d9','bb2562ce-1f30-44c5-a798-3237e2d91756','97db6b15-38a7-49ed-ae0e-79a734c740be']; // Ícaro, Kaleby, Evelin
(async()=>{ env();
  let Client; try{({Client}=require('pg'));}catch(_){({Client}=require(path.join(__dirname,'backend','node_modules','pg')));}
  let url=(process.env.DATABASE_PUBLIC_URL||process.env.DATABASE_URL).replace(/([?&])(sslmode|ssl|channel_binding)=[^&]*/gi,'$1').replace(/[?&]+$/,'');
  const c=new Client({connectionString:url,ssl:{rejectUnauthorized:false}});
  await c.connect();
  // equipe + papel usados pelos estagiários de referência
  const ref=await c.query(`SELECT em.equipe_id, em.papel, e.nome FROM equipes_membros em JOIN equipes e ON e.id=em.equipe_id
    WHERE em.pessoa_id = ANY($1::uuid[]) AND e.arquivada_em IS NULL ORDER BY em.adicionado_em LIMIT 1`,[REFS]);
  if(!ref.rows[0]){ console.log('ABORT: não achei equipe de referência'); await c.end(); return; }
  const {equipe_id, papel, nome}=ref.rows[0];
  console.log(`Equipe alvo: ${nome} (${equipe_id}) · papel: ${papel}`);
  const adm=(await c.query("SELECT id FROM pessoas_acesso WHERE administrador=true LIMIT 1")).rows[0]?.id||null;
  await c.query(`INSERT INTO equipes_membros (equipe_id,pessoa_id,papel,adicionado_por_id)
    VALUES ($1,$2,$3,$4) ON CONFLICT DO NOTHING`,[equipe_id,KARINA,papel||'membro',adm]);
  const chk=await c.query(`SELECT count(*)::int n FROM equipes_membros em JOIN equipes e ON e.id=em.equipe_id
    WHERE em.pessoa_id=$1 AND e.arquivada_em IS NULL`,[KARINA]);
  console.log(`Karina agora em ${chk.rows[0].n} equipe(s) ativa(s). ${chk.rows[0].n>0?'✅ pode logar':'❌'}`);
  await c.end();
})().catch(e=>{console.error('ERRO:',e.message);process.exit(1);});
