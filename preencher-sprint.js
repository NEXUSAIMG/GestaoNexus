#!/usr/bin/env node
/* Preenche os cards da Sprint 1 com responsável, datas e observação (da planilha).
 * Dry-run por padrão; passe --apply para gravar. Idempotente (não duplica obs). */
const fs = require('fs'), path = require('path');
function env(){ if(process.env.DATABASE_PUBLIC_URL||process.env.DATABASE_URL)return;
  for(const p of [path.join(__dirname,'backend','.env'),path.join(__dirname,'.env')]) if(fs.existsSync(p))
    for(const l of fs.readFileSync(p,'utf8').split(/\r?\n/)){const m=l.match(/^\s*DATABASE_URL\s*=\s*(.*)\s*$/);if(m){process.env.DATABASE_URL=m[1].replace(/^["']|["']$/g,'');return;}}
}
const SPRINT = '0c83f962-52b6-4403-a7d4-4915b541fa0f';
const QUADRO = '009fd2bf-8370-41b4-bbac-b5b3f1415dd4';
const APPLY = process.argv.includes('--apply');

// titulo -> { resp, di (dd/mm/yyyy), df, obs }
const DADOS = [
 ["Ajustar formatação do app no celular","Evylin","20/07/2026","20/07/2026",""],
 ["Remover última mensagem de avaliação","Ludmila","20/07/2026","20/07/2026",""],
 ["Transbordo não respeita etiqueta","Ludmila","20/07/2026","21/07/2026","Já no código (tagTransbordo) — testar e deployar"],
 ["Mídia sem texto está transbordando","Ícaro","20/07/2026","20/07/2026",""],
 ["Conversa de escritura na fila errada (privacidade)","Ícaro","20/07/2026","22/07/2026","Conferir se é o mesmo caso do vazamento entre clientes (já corrigido)"],
 ["Checklist incompleto","Kaleby","20/07/2026","20/07/2026","Ligado ao classificador (ajustado hoje) — validar entrega do checklist"],
 ["Ligação duplicada no registro","Ícaro","22/07/2026","22/07/2026","Corrigido nesta sessão (dedup de chamada) — testar e deployar"],
 ["Importação de contatos rejeita acentos","Evylin","20/07/2026","21/07/2026","Já no código (decodifica acento/QUOTED-PRINTABLE) — testar"],
 ["Atrito na transferência entre atendentes","Ícaro","23/07/2026","24/07/2026","Já no código (reclassificação libera atendente) — testar/deployar"],
 ["Mensagem automática de documento divergente","Kaleby","20/07/2026","20/07/2026","Ajuste de texto isolado"],
 ["Direcionar ao atendente solicitado","Ludmila","21/07/2026","22/07/2026",""],
 ["Etiquetas para contatos especiais","Kaleby","20/07/2026","22/07/2026","Já no código (etiquetas ponta a ponta) — testar/deployar"],
 ["Melhorar visualização do histórico","Ludmila","22/07/2026","23/07/2026",""],
 ["Reabrir atendimento encerrado","Ludmila","23/07/2026","24/07/2026",""],
 ["Formatação da pesquisa de satisfação (Forms)","Kaleby","22/07/2026","22/07/2026",""],
 ["Sinalizar áudio na transcrição","Evylin","21/07/2026","21/07/2026","Corrigido nesta sessão (rótulo de áudio) — testar/deployar"],
 ["Enviar checklist em PDF automaticamente","Kaleby","22/07/2026","23/07/2026","Código pronto (anexoBot) — falta config: tabela + PDFs no Botpress Files + publicar"],
 ["Alertas de novas mensagens","Evylin","21/07/2026","22/07/2026",""],
 ["Ações rápidas na ficha do contato","Evylin","22/07/2026","23/07/2026",""],
 ["Validar e-mails dos operadores","Evylin","23/07/2026","23/07/2026",""],
 ["Player de áudio + transcrição","Evylin","","",""],
 ["Respostas em grupos do WhatsApp","Ícaro","","",""],
 ["Transferência silenciosa entre atendentes","Ícaro","","",""],
 ["Chat interno entre operadores","Kaleby","","",""],
 ["Agenda estilo Google Agenda","Ludmila","","",""],
 ["Vincular atendente ao agendamento","Ludmila","","",""],
 ["Lembretes personalizados na agenda","Kaleby","","",""],
];

// Escapes ASCII (\u...) — não corrompem na transferência de arquivo p/ Windows.
const RE_DIACR = new RegExp('[\\u0300-\\u036f]', 'g');
const norm = (s)=>String(s||'').normalize('NFD').replace(RE_DIACR,'').toLowerCase().trim();
function lev(a,b){const m=a.length,n=b.length,d=Array.from({length:m+1},(_,i)=>[i,...Array(n).fill(0)]);for(let j=0;j<=n;j++)d[0][j]=j;for(let i=1;i<=m;i++)for(let j=1;j<=n;j++)d[i][j]=Math.min(d[i-1][j]+1,d[i][j]+0,d[i][j-1]+1,d[i-1][j-1]+(a[i-1]===b[j-1]?0:1));return d[m][n];}
const toISO = (d)=>{ if(!d) return null; const m=d.match(/^(\d{2})\/(\d{2})\/(\d{4})$/); return m?`${m[3]}-${m[2]}-${m[1]}`:null; };

(async()=>{ env();
  let Client; try{({Client}=require('pg'));}catch(_){({Client}=require(path.join(__dirname,'backend','node_modules','pg')));}
  let url=(process.env.DATABASE_PUBLIC_URL||process.env.DATABASE_URL).replace(/([?&])(sslmode|ssl|channel_binding)=[^&]*/gi,'$1').replace(/[?&]+$/,'').replace(/\?&+/,'?').replace(/&&+/g,'&');
  const c=new Client({connectionString:url,ssl:{rejectUnauthorized:false}});
  await c.connect();

  // 1) resolver nomes -> pessoa via SQL ILIKE com token ASCII (sem depender de acento)
  function tokenDe(resp){
    const r = resp.toLowerCase();
    if (r.includes('vyl') || r.includes('vel')) return '%yoshida%'; // Evylin -> Evelin Yoshida
    if (r.includes('ludmila')) return '%ludmila%';
    if (r.includes('caro')) return '%santana%';                    // Ícaro Santos Santana
    if (r.includes('kaleby')) return '%kaleby%';
    return null;
  }
  const nomes=[...new Set(DADOS.map(d=>d[1]))];
  const mapa={};
  console.log('=== RESOLUÇÃO DE NOMES ===');
  for(const nm of nomes){
    const tok=tokenDe(nm);
    if(!tok){ console.log(`  ❌ "${nm}" — sem token de busca`); continue; }
    const r=(await c.query('SELECT id,nome,email FROM pessoas_acesso WHERE nome ILIKE $1',[tok])).rows;
    if(r.length===1){ console.log(`  ✅ "${nm}" → ${r[0].nome} <${r[0].email}>`); mapa[nm]=r[0].id; }
    else { console.log(`  ⚠️  "${nm}" (token ${tok}) — ${r.length} resultados: ${r.map(x=>x.nome).join(' | ')}`); }
  }
  const faltando=nomes.filter(n=>!mapa[n]);
  if(faltando.length){ console.log('\nABORTANDO: nomes sem correspondência:', faltando.join(', ')); await c.end(); return; }

  // 2) casar cards por titulo dentro da sprint
  const cards=(await c.query(`SELECT id,titulo,descricao FROM cards WHERE sprint_id=$1 AND arquivado_em IS NULL`,[SPRINT])).rows;
  const byTit=new Map(cards.map(c=>[c.titulo, c]));
  console.log(`\n=== PLANO (${APPLY?'APPLY':'DRY-RUN'}) ===`);
  let ok=0, semCard=0;
  for(const [tit,resp,di,df,obs] of DADOS){
    const card=byTit.get(tit);
    if(!card){ console.log(`  ❌ card não encontrado na sprint: "${tit}"`); semCard++; continue; }
    const iniISO=toISO(di), fimISO=toISO(df);
    let novaDesc=card.descricao||'';
    if(obs && !novaDesc.includes('Obs: '+obs)) novaDesc=(novaDesc?novaDesc+'\n\n':'')+'Obs: '+obs;
    console.log(`  • ${tit.slice(0,44).padEnd(44)} → ${resp}${iniISO?` | ${iniISO}→${fimISO}`:' | (sem datas)'}${obs?' | +obs':''}`);
    if(APPLY){
      await c.query(`UPDATE cards SET responsavel_id=$2, data_inicio=$3, data_prazo=$4, descricao=$5, atualizado_em=now() WHERE id=$1`,
        [card.id, mapa[resp], iniISO, fimISO, novaDesc]);
      await c.query(`DELETE FROM cards_responsaveis WHERE card_id=$1`,[card.id]);
      await c.query(`INSERT INTO cards_responsaveis (card_id,pessoa_id,ordem) VALUES ($1,$2,0) ON CONFLICT DO NOTHING`,[card.id,mapa[resp]]);
    }
    ok++;
  }
  console.log(`\n${APPLY?'GRAVADO':'Prévia'}: ${ok} cards${semCard?`, ${semCard} sem match`:''}.`);
  if(!APPLY) console.log('Rode com --apply para gravar.');
  await c.end();
})().catch(e=>{console.error('ERRO:',e.message);process.exit(1);});
