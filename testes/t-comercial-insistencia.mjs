// Sprint 42G — insistência com método: roteiro de retorno da proposta,
// portão de "Sumiu", retomada em 90 dias e média de contatos antes de perder.
import { login, get, post, put, ok, titulo } from './api.mjs';

const sufixo = Date.now().toString(36);
const rnd = (n) => String(Math.floor(Math.random() * 10 ** n)).padStart(n, '0');
await login();
const cfg = (await get('/comercial/config')).dados;
const hoje = cfg.hoje;
const somar = (d, n) => { const x = new Date(d + 'T12:00:00Z'); x.setUTCDate(x.getUTCDate() + n); return x.toISOString().slice(0, 10); };
const novo = async (nome, extra = {}) => (await post('/comercial/leads', { nome: nome + ' ' + sufixo, origem: 'prospeccao', telefone: `(91) 9${rnd(4)}-${rnd(4)}`, ...extra })).dados;

titulo('Config');
ok(cfg.retorno?.length === 4 && /Encerramento/.test(cfg.retorno[3].acao) && cfg.dias_para_voltar === 90, 'roteiro de retorno com 4 contatos, o último é o encerramento; retomada em 90 dias');

ok(cfg.cadencia?.[0]?.d === 1 && cfg.cadencia[0].canal === 'E-mail' && /Ayio/.test(cfg.cadencia[0].acao), '(42J) cadência começa pelo e-mail de apresentação da Ayio');

titulo('Portão de "Sumiu"');
const a = await novo('Cartório Insistência A', { etapa: 'cadencia' });
const r1 = await put(`/comercial/leads/${a.id}`, { etapa: 'perdido', motivo_perda: 'Sumiu' });
ok(r1.status === 400 && /cadência completa/.test(r1.dados.erro || r1.dados.mensagem || JSON.stringify(r1.dados)), 'Em contatos: "Sumiu" exige a cadência completa');
const r2 = await put(`/comercial/leads/${a.id}`, { etapa: 'perdido', motivo_perda: 'Preço' });
ok(r2.status === 200 && r2.dados.etapa === 'perdido' && !r2.dados.proxima_data, 'motivo que é resposta do cartório (Preço) não tem trava nem retomada');

const b = await novo('Cartório Insistência B', { etapa: 'cadencia' });
const r3 = await put(`/comercial/leads/${b.id}`, { etapa: 'perdido', motivo_perda: 'Sem tempo para implantar' });
ok(r3.status === 200 && r3.dados.proxima_data === somar(hoje, 90) && /Retorno programado/.test(r3.dados.proximo_passo || ''), '"Sem tempo" já sai com a retomada marcada para daqui a 90 dias');

titulo('Roteiro de retorno da proposta');
const c = await novo('Cartório Insistência C', { etapa: 'diagnostico' });
const enviada = somar(hoje, -3);
const p1 = await post(`/comercial/leads/${c.id}/propostas`, { plano: 'Especial', valor_mensal: 499, enviada_em: enviada });
let lc = (await get(`/comercial/leads/${c.id}`)).dados;
ok(p1.status === 201 && /^Retorno 1\/4/.test(lc.proximo_passo || '') && lc.proxima_data === somar(enviada, 2), 'proposta registrada já marca o retorno 1/4 para o 2º dia');
const f = await put(`/comercial/leads/${c.id}`, { etapa: 'proposta', forcar_portao: true, justificativa: 'teste automático de insistência' });
ok(f.status === 200 && f.dados.etapa === 'proposta', '(montagem) lead em Aguardando retorno');
let painel = (await get('/comercial/painel')).dados;
let ret = painel.hoje_listas.retornos.find((x) => x.lead.id === c.id);
ok(ret && ret.n === 1 && ret.atrasado, 'Hoje mostra o retorno 1/4 atrasado');
const sumiuCedo = await put(`/comercial/leads/${c.id}`, { etapa: 'perdido', motivo_perda: 'Sumiu' });
ok(sumiuCedo.status === 400 && /roteiro de retorno/.test(JSON.stringify(sumiuCedo.dados)), 'Aguardando retorno: "Sumiu" exige o roteiro de retorno completo');
const t1 = await post(`/comercial/leads/${c.id}/toques`, { tipo: 'avulso', resultado: 'enviado', canal: 'WhatsApp' });
lc = (await get(`/comercial/leads/${c.id}`)).dados;
ok(t1.status === 201 && /^Retorno 2\/4/.test(lc.proximo_passo || '') && lc.proxima_data === somar(hoje, 1), 'registrou o contato: o sistema marca sozinho o retorno 2/4');
painel = (await get('/comercial/painel')).dados;
ok(!painel.hoje_listas.retornos.some((x) => x.lead.id === c.id), 'retorno feito sai da lista de Hoje');

titulo('Retomada em 90 dias');
await put(`/comercial/leads/${b.id}`, { proxima_data: hoje });
painel = (await get('/comercial/painel')).dados;
const volta = painel.hoje_listas.voltam.find((x) => x.lead.id === b.id);
ok(volta && volta.motivo === 'Sem tempo para implantar', 'perdido por "Sem tempo" aparece em "Voltam a ser contatados hoje" no dia');
const re = await put(`/comercial/leads/${b.id}`, {
  etapa: 'cadencia', justificativa: 'Retorno programado de 90 dias (teste)', proximo_passo: 'Retomada: ligar ao titular', proxima_data: hoje,
});
ok(re.status === 200 && re.dados.etapa === 'cadencia', 'reabre em Em contatos com a ligação de retomada');

titulo('Insistência na Supervisão');
const eu = (await get('/pessoas')).dados.find((p) => p.email === 'admin@local.test');
painel = (await get('/comercial/painel')).dados;
const sup = painel.supervisao.find((s) => s.pessoa.id === eu.id);
ok(sup?.insistencia && sup.insistencia.perdidos >= 1 && typeof sup.insistencia.media_contatos === 'number', 'mostra perdidos do mês e a média de contatos antes de perder');
