#!/usr/bin/env node
/* Importa os cards do zabbix_cards.json como tarefas na Sprint 2 do quadro
 * "Atividades Estagiários". Cria a Sprint 2 se não existir. Dry-run por padrão;
 * --apply grava. Idempotente (não duplica card por título no quadro). */
const fs=require('fs'),path=require('path');
function env(){ if(process.env.DATABASE_PUBLIC_URL||process.env.DATABASE_URL)return;
  for(const p of [path.join(__dirname,'backend','.env'),path.join(__dirname,'.env')]) if(fs.existsSync(p))
    for(const l of fs.readFileSync(p,'utf8').split(/\r?\n/)){const m=l.match(/^\s*DATABASE_URL\s*=\s*(.*)\s*$/);if(m){process.env.DATABASE_URL=m[1].replace(/^["']|["']$/g,'');return;}}
}
const QUADRO='009fd2bf-8370-41b4-bbac-b5b3f1415dd4';
const SPRINT_NOME='Sprint 2 — Zabbix (Monitoramento Seu Cartório)';
const SPRINT_META='PoC de Zabbix do zero + piloto read-only monitorando serviços do Seu Cartório; entregar o QUADRO (dashboard + catálogo).';
const SPRINT_INI='2026-07-28', SPRINT_FIM='2026-08-08';
const APPLY=process.argv.includes('--apply');
const CORES=['cyan','teal','indigo','violet','amber','lime','pink','fuchsia','blue','emerald','orange','rose','yellow','slate','red'];

function tokenResp(nome){
  const r=nome.toLowerCase();
  if(r.includes('caro')) return '%santana%';   // Ícaro Santos Santana
  if(r.includes('kaleby')) return '%kaleby%';   // Wesley Kaleby
  if(r.includes('vyl')||r.includes('vel')) return '%yoshida%';
  if(r.includes('ludmila')) return '%ludmila%';
  return null;
}

(async()=>{ env();
  const {cards}=JSON.parse(fs.readFileSync(path.join(__dirname,'zabbix_cards.json'),'utf8'));
  let Client; try{({Client}=require('pg'));}catch(_){({Client}=require(path.join(__dirname,'backend','node_modules','pg')));}
  let url=(process.env.DATABASE_PUBLIC_URL||process.env.DATABASE_URL).replace(/([?&])(sslmode|ssl|channel_binding)=[^&]*/gi,'$1').replace(/[?&]+$/,'').replace(/\?&+/,'?').replace(/&&+/g,'&');
  const c=new Client({connectionString:url,ssl:{rejectUnauthorized:false}});
  await c.connect();

  console.log(`=== ${APPLY?'APLICANDO':'DRY-RUN'} — ${cards.length} cards -> "${SPRINT_NOME}" ===`);

  // criador (dono do quadro) e coluna backlog
  const dono=(await c.query('SELECT criado_por_id FROM quadros WHERE id=$1',[QUADRO])).rows[0]?.criado_por_id||null;
  const colBl=(await c.query(`SELECT id FROM colunas WHERE quadro_id=$1 AND arquivada_em IS NULL AND tipo='backlog' ORDER BY ordem LIMIT 1`,[QUADRO])).rows[0];
  if(!colBl){ console.log('ABORT: coluna backlog não encontrada'); await c.end(); return; }

  // resolver responsáveis
  const nomes=[...new Set(cards.flatMap(x=>x.responsaveis))];
  const mapaResp={};
  for(const nm of nomes){
    const tok=tokenResp(nm);
    const r=tok?(await c.query('SELECT id,nome FROM pessoas_acesso WHERE nome ILIKE $1',[tok])).rows:[];
    if(r.length===1){ mapaResp[nm]=r[0].id; console.log(`  resp "${nm}" -> ${r[0].nome}`); }
    else { console.log(`  ⚠️ resp "${nm}": ${r.length} matches`); }
  }
  if(nomes.some(n=>!mapaResp[n])){ console.log('ABORT: responsável não resolvido.'); await c.end(); return; }

  if(!APPLY){
    console.log('\nCards que seriam criados:');
    cards.forEach(x=>console.log(`  • [P${x.prioridade} ${x.estimativa}h] ${x.titulo}  {${x.tipo}} -> ${x.responsaveis.join(', ')}`));
    console.log(`\nSprint 2: ${SPRINT_INI} a ${SPRINT_FIM}. Total ${cards.reduce((s,x)=>s+(x.estimativa||0),0)}h.`);
    console.log('Rode com --apply para gravar.');
    await c.end(); return;
  }

  await c.query('BEGIN');
  // Sprint 2 (reusa se já existir por nome)
  const sp=(await c.query('SELECT id FROM sprints WHERE quadro_id=$1 AND nome=$2 LIMIT 1',[QUADRO,SPRINT_NOME])).rows[0];
  let sprintId;
  if(sp){ sprintId=sp.id; console.log('Sprint 2 já existia, reusando.'); }
  else {
    sprintId=(await c.query(
      `INSERT INTO sprints (quadro_id,nome,meta,data_inicio,data_fim,estado,ordem,criado_por_id)
       VALUES ($1,$2,$3,$4,$5,'planejamento',1,$6) RETURNING id`,
      [QUADRO,SPRINT_NOME,SPRINT_META,SPRINT_INI,SPRINT_FIM,dono])).rows[0].id;
    console.log('Sprint 2 criada:', sprintId);
  }

  // etiquetas existentes
  const etq=new Map((await c.query('SELECT id,nome FROM quadros_etiquetas WHERE quadro_id=$1',[QUADRO])).rows.map(e=>[e.nome.toLowerCase(),e.id]));
  let ordEtq=(await c.query('SELECT COALESCE(MAX(ordem),0)+1 n FROM quadros_etiquetas WHERE quadro_id=$1',[QUADRO])).rows[0].n;
  let corIdx=(await c.query('SELECT count(*)::int n FROM quadros_etiquetas WHERE quadro_id=$1',[QUADRO])).rows[0].n;
  async function etiquetaId(nome){
    const k=nome.toLowerCase();
    if(etq.has(k)) return etq.get(k);
    const cor=CORES[corIdx++ % CORES.length];
    const id=(await c.query('INSERT INTO quadros_etiquetas (quadro_id,nome,cor,ordem) VALUES ($1,$2,$3,$4) RETURNING id',[QUADRO,nome,cor,ordEtq++])).rows[0].id;
    etq.set(k,id); return id;
  }

  let base=(await c.query('SELECT COALESCE(MAX(ordem),0) n FROM cards WHERE coluna_id=$1',[colBl.id])).rows[0].n;
  let ins=0,skip=0,seq=0;
  for(const x of cards){
    seq++;
    if((await c.query('SELECT 1 FROM cards WHERE quadro_id=$1 AND arquivado_em IS NULL AND titulo=$2 LIMIT 1',[QUADRO,x.titulo])).rowCount){ skip++; continue; }
    const cardId=(await c.query(
      `INSERT INTO cards (coluna_id,quadro_id,titulo,descricao,ordem,prioridade,estimativa_horas,fluxo,sprint_id,responsavel_id,criado_por_id)
       VALUES ($1,$2,$3,$4,$5,$6,$7,'projeto',$8,$9,$10) RETURNING id`,
      [colBl.id,QUADRO,x.titulo,x.descricao,base+seq*10,x.prioridade,x.estimativa,sprintId,mapaResp[x.responsaveis[0]],dono])).rows[0].id;
    ins++;
    if(x.tipo){ const eid=await etiquetaId(x.tipo); await c.query('INSERT INTO cards_etiquetas (card_id,etiqueta_id) VALUES ($1,$2) ON CONFLICT DO NOTHING',[cardId,eid]); }
    let o=0;
    for(const nm of x.responsaveis){ await c.query('INSERT INTO cards_responsaveis (card_id,pessoa_id,ordem) VALUES ($1,$2,$3) ON CONFLICT DO NOTHING',[cardId,mapaResp[nm],o++]); }
  }
  await c.query('COMMIT');
  console.log(`\nGRAVADO: ${ins} cards criados na Sprint 2, ${skip} já existentes (pulados).`);
  await c.end();
})().catch(async e=>{console.error('ERRO:',e.message);process.exit(1);});
