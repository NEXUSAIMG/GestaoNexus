#!/usr/bin/env node
// Verifica o fix do 500 (editar card com etiqueta+responsável) e testa mover p/ Concluído.
const base=(process.env.APP_URL||'https://gestaonexus-production.up.railway.app').replace(/\/$/,'');
const email=process.env.SEED_ADMIN_EMAIL, senha=process.env.SEED_ADMIN_SENHA;
const BOARD='009fd2bf-8370-41b4-bbac-b5b3f1415dd4';
const CARD='e27c4b6d-3a3c-4c4a-911b-ca8b362335b3';
const tok=j=>j&&(j.token||j.accessToken||(j.data&&j.data.token));
(async()=>{
  const rl=await fetch(base+'/api/auth/login',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({email,senha})});
  const token=tok(await rl.json().catch(()=>({}))); if(!token){console.log('login falhou',rl.status);return;}
  const auth={Authorization:'Bearer '+token,'Content-Type':'application/json'};
  const board=await (await fetch(`${base}/api/quadros/${BOARD}`,{headers:auth})).json();
  const card=board.cards.find(c=>c.id===CARD);
  const origEtq=(card.etiqueta_ids||[]).slice();
  const origResp=(card.responsaveis||[]).map(r=>r.id);
  const origCol=card.coluna_id;
  const umaEtq=(board.etiquetas[0]||{}).id;
  const umResp=(board.cards.flatMap(c=>c.responsaveis||[])[0]||{}).id;
  const colConcluida=(board.colunas.find(c=>c.tipo==='concluida')||{});
  console.log('card:', card.titulo, '| etiquetas atuais:', origEtq.length, '| resp:', origResp.length);

  // BUG 1: editar com etiqueta + responsável (era 500)
  let r=await fetch(`${base}/api/cards/${CARD}`,{method:'PUT',headers:auth,body:JSON.stringify({etiqueta_ids:[umaEtq],responsavel_ids:[umResp]})});
  console.log('EDIT etiqueta+responsavel ->', r.status, r.status===200?'✅ fix OK':'❌ '+(await r.text()).slice(0,150));
  // restaura
  await fetch(`${base}/api/cards/${CARD}`,{method:'PUT',headers:auth,body:JSON.stringify({etiqueta_ids:origEtq,responsavel_ids:origResp})});
  console.log('  (estado restaurado)');

  // BUG 2: mover p/ Concluído e voltar
  if(colConcluida.id){
    r=await fetch(`${base}/api/cards/${CARD}/mover`,{method:'POST',headers:auth,body:JSON.stringify({coluna_id:colConcluida.id,posicao:0})});
    console.log('MOVER -> Concluído:', r.status, r.status<300?'ok':'❌ '+(await r.text()).slice(0,150));
    await fetch(`${base}/api/cards/${CARD}/mover`,{method:'POST',headers:auth,body:JSON.stringify({coluna_id:origCol,posicao:0})});
    console.log('  (movido de volta)');
  } else console.log('MOVER: sem coluna concluida no board');
})().catch(e=>console.error('ERRO:',e.message));
