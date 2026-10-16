// Sprint 44 — E-mails mais utilizados: biblioteca de modelos, modelo no toque,
// ranking da equipe e por pessoa (Supervisão) e tela do modo TV.
import { login, get, post, ok, titulo, equipeDeTeste } from './api.mjs';

const BASE = 'http://localhost:3001/api';
async function como(token, metodo, caminho, corpo) {
  const o = { method: metodo, headers: { Authorization: `Bearer ${token}` } };
  if (corpo !== undefined) { o.headers['Content-Type'] = 'application/json'; o.body = JSON.stringify(corpo); }
  const r = await fetch(BASE + caminho, o);
  const t = await r.text(); let dados; try { dados = t ? JSON.parse(t) : null; } catch { dados = t; }
  return { status: r.status, dados };
}

const sufixo = Date.now().toString(36);
const rnd = (n) => String(Math.floor(Math.random() * 10 ** n)).padStart(n, '0');
const admin = await login();
const A = (m, c, b) => como(admin.token, m, c, b);

// Vendedora de teste (não é gestão)
const emailV = `vend.email.${sufixo}@local.test`;
const vend = (await post('/pessoas', { nome: 'Vendedora Emails ' + sufixo, email: emailV, senha: 'SenhaLocal123!', acesso_restrito: true })).dados;
const equipeId = await equipeDeTeste('Comercial');
await post(`/equipes/${equipeId}/membros`, { pessoa_id: vend.id, papel: 'membro' });
const lv = await fetch(BASE + '/auth/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: emailV, senha: 'SenhaLocal123!' }) }).then((r) => r.json());
const V = (m, c, b) => como(lv.token, m, c, b);

titulo('Modelos de e-mail');
const cfg = (await V('GET', '/comercial/config')).dados;
const d1 = cfg.modelos_email.find((m) => m.chave === 'cadencia_d1');
const d11 = cfg.modelos_email.find((m) => m.chave === 'cadencia_d11');
ok(d1 && d11 && /\[cartório\]/.test(d1.assunto) && /Ayio/.test(d1.corpo) && /Webinar/.test(d11.assunto), 'config traz os 2 modelos que já existiam (dia 1 e dia 11)');
ok((await V('POST', '/comercial/modelos-email', { titulo: 'Tentativa ' + sufixo, assunto: 'Oi', corpo: 'Texto do e-mail aqui' })).status === 403, 'vendedora não cria modelo (só a gestão)');
const curto = await A('POST', '/comercial/modelos-email', { titulo: 'x', assunto: '', corpo: 'oi' });
ok(curto.status === 400, 'recusa modelo sem nome, assunto ou texto');
const novo = await A('POST', '/comercial/modelos-email', { titulo: 'Retomada ' + sufixo, assunto: '[cartório]: voltando a conversar', corpo: '[Nome], bom dia.\n\nSou [vendedor], da Ayio.', uso: 'Depois de 90 dias' });
ok(novo.status === 201 && novo.dados.id && novo.dados.uso === 'Depois de 90 dias', 'gestão cria modelo novo');
const dup = await A('POST', '/comercial/modelos-email', { titulo: ('Retomada ' + sufixo).toUpperCase(), assunto: 'Outro', corpo: 'Outro texto qualquer' });
ok(dup.status === 409, 'nome de modelo repetido é recusado (sem diferenciar maiúsculas)');
const ed = await A('PUT', `/comercial/modelos-email/${novo.dados.id}`, { titulo: 'Retomada 90 dias ' + sufixo, assunto: '[cartório]: retomando', corpo: '[Nome], bom dia.\n\nTexto novo.' });
ok(ed.status === 200 && ed.dados.titulo === 'Retomada 90 dias ' + sufixo, 'gestão edita o modelo');
const lista = (await V('GET', '/comercial/modelos-email')).dados;
ok(lista.some((m) => m.id === novo.dados.id), 'modelo novo aparece para a equipe');

titulo('Modelo no toque');
const lead = async (n) => (await V('POST', '/comercial/leads', { nome: `Cartório Email ${n} ${sufixo}`, origem: 'prospeccao', etapa: 'cadencia', dono_id: vend.id, telefone: `(91) 9${rnd(4)}-${rnd(4)}` })).dados;
const la = await lead('A'); const lb = await lead('B'); const lc = await lead('C');
const t1 = await V('POST', `/comercial/leads/${la.id}/toques`, { tipo: 'cadencia', dia: 1, canal: 'E-mail', resultado: 'enviado', modelo_email_id: d1.id });
ok(t1.status === 201, 'toque de e-mail com modelo é registrado');
const ficha = (await V('GET', `/comercial/leads/${la.id}`)).dados;
ok(ficha.toques.some((t) => t.modelo_email === d1.titulo), 'histórico do cartório mostra o modelo usado');
await V('POST', `/comercial/leads/${lb.id}/toques`, { tipo: 'cadencia', dia: 1, canal: 'E-mail', resultado: 'enviado', modelo_email_id: d1.id });
await V('POST', `/comercial/leads/${lc.id}/toques`, { tipo: 'avulso', canal: 'E-mail', resultado: 'respondeu', modelo_email_id: novo.dados.id });
await V('POST', `/comercial/leads/${lc.id}/toques`, { tipo: 'avulso', canal: 'E-mail', resultado: 'enviado' }); // sem modelo
// Resposta depois do envio: o cartório A atende a ligação no mesmo dia, depois do e-mail
await V('POST', `/comercial/leads/${la.id}/toques`, { tipo: 'cadencia', dia: 2, canal: 'Ligação', resultado: 'atendeu' });
const fora = await V('POST', `/comercial/leads/${lb.id}/toques`, { tipo: 'avulso', canal: 'Ligação', resultado: 'atendeu', modelo_email_id: d1.id });
ok(fora.status === 400 && fora.dados.codigo === 'modelo_fora_do_email', 'modelo de e-mail em toque de ligação é recusado');
const lixo = await V('POST', `/comercial/leads/${lb.id}/toques`, { tipo: 'avulso', canal: 'E-mail', resultado: 'enviado', modelo_email_id: '00000000-0000-0000-0000-000000000000' });
ok(lixo.status === 400 && lixo.dados.codigo === 'modelo_invalido', 'modelo inexistente é recusado');

titulo('Ranking');
const rk = (await V('GET', '/comercial/emails/ranking')).dados;
const rd1 = rk.modelos.find((m) => m.id === d1.id);
const rnovo = rk.modelos.find((m) => m.id === novo.dados.id);
ok(rd1 && rd1.envios >= 2 && rd1.cartorios >= 2, 'ranking da equipe conta os envios do modelo do dia 1');
ok(rk.modelos.indexOf(rd1) < rk.modelos.indexOf(rnovo), 'modelo mais usado vem primeiro');
ok(rnovo && rnovo.respostas >= 1 && rnovo.taxa_resposta === 100, 'toque que já conectou conta como resposta');
const pv = rk.pessoas.find((p) => p.id === vend.id);
ok(pv && pv.envios === 3 && pv.mais_usado?.id === d1.id, 'por pessoa: envios da vendedora e o modelo que ela mais usou');
ok(pv.respostas === 2 && pv.taxa_resposta === 66.7, 'resposta inclui contato com conexão registrado depois do e-mail');
ok(pv.sem_modelo === 1 && rk.sem_modelo >= 1, 'e-mail enviado sem modelo aparece como "sem modelo"');
const pvd1 = pv.modelos.find((m) => m.id === d1.id);
ok(pvd1 && pvd1.envios === 2 && pvd1.respostas === 1, 'detalhe por pessoa e modelo');
const antigo = (await V('GET', '/comercial/emails/ranking?de=2020-01-01&ate=2020-01-31')).dados;
ok(antigo.total_envios === 0 && antigo.modelos.length === 0, 'período sem envios volta zerado');

titulo('Estorno e arquivamento');
const toqueId = ficha.toques.find((t) => t.modelo_email_id === d1.id).id;
await V('POST', `/comercial/toques/${toqueId}/estornar`, { motivo: 'registrei no cartório errado' });
const rk2 = (await V('GET', '/comercial/emails/ranking')).dados;
ok(rk2.pessoas.find((p) => p.id === vend.id).envios === 2, 'toque estornado sai do ranking');
ok((await V('POST', `/comercial/modelos-email/${novo.dados.id}/arquivar`)).status === 403, 'vendedora não arquiva modelo');
ok((await A('POST', `/comercial/modelos-email/${novo.dados.id}/arquivar`)).status === 200, 'gestão arquiva o modelo');
const cfg2 = (await V('GET', '/comercial/config')).dados;
ok(!cfg2.modelos_email.some((m) => m.id === novo.dados.id), 'modelo arquivado sai da escolha');
const rk3 = (await V('GET', '/comercial/emails/ranking')).dados;
ok(rk3.modelos.find((m) => m.id === novo.dados.id)?.arquivado === true, 'uso do modelo arquivado continua no ranking, marcado como arquivado');
const usoArq = await V('POST', `/comercial/leads/${lb.id}/toques`, { tipo: 'avulso', canal: 'E-mail', resultado: 'enviado', modelo_email_id: novo.dados.id });
ok(usoArq.status === 400 && usoArq.dados.codigo === 'modelo_invalido', 'modelo arquivado não pode mais ser escolhido');

titulo('Modo TV');
const tv = (await V('GET', '/comercial/tv')).dados;
ok(tv.emails && tv.emails.total_envios >= 2 && tv.emails.modelos.length >= 1, 'TV traz os e-mails mais usados do mês');
const ptv = tv.emails.pessoas.find((p) => p.id === vend.id);
ok(ptv && /^Vendedora \w\.$/.test(ptv.nome) && ptv.mais_usado, 'TV mostra nome curto e o modelo mais usado de cada pessoa');
ok(!JSON.stringify(tv.emails).includes('@'), 'TV não expõe e-mail de ninguém');
