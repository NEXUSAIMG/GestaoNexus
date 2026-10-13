// Sprint 42L — trial guiado de 14 dias.
import { login, get, post, put, ok, titulo } from './api.mjs';

const sufixo = Date.now().toString(36);
const rnd = (n) => String(Math.floor(Math.random() * 10 ** n)).padStart(n, '0');
await login();
const cfg = (await get('/comercial/config')).dados;
const hoje = cfg.hoje;
const somar = (d, n) => { const x = new Date(d + 'T12:00:00Z'); x.setUTCDate(x.getUTCDate() + n); return x.toISOString().slice(0, 10); };

titulo('Config');
ok(cfg.etapas.some((e) => e.k === 'trial' && e.sla === 14) && cfg.marcos_trial?.length === 8 && cfg.dias_trial === 14,
  'etapa Trial (14 dias) entre a reunião e Aguardando retorno, com 8 marcos');
const ordem = cfg.etapas.map((e) => e.k);
ok(ordem.indexOf('trial') === ordem.indexOf('diagnostico') + 1 && ordem.indexOf('proposta') === ordem.indexOf('trial') + 1, 'ordem: reunião → trial → aguardando retorno');

titulo('Portão de entrada');
const l = (await post('/comercial/leads', { nome: 'Cartório Trial ' + sufixo, origem: 'prospeccao', telefone: `(91) 9${rnd(4)}-${rnd(4)}`, etapa: 'cadencia' })).dados;
const r0 = await put(`/comercial/leads/${l.id}`, { etapa: 'trial' });
const txt0 = JSON.stringify(r0.dados);
ok(r0.status === 400 && /meta de sucesso/.test(txt0) && /reunião de resultado/.test(txt0) && /realizada/.test(txt0),
  'sem reunião feita, diagnóstico, meta de sucesso e reunião de resultado, o trial não começa');
const ini = new Date(Date.now() - 2 * 3600_000).toISOString();
const reu = await post(`/comercial/leads/${l.id}/reunioes`, { tipo: 'diagnostico', inicio: ini });
await post(`/comercial/reunioes/${reu.dados.reunioes?.[0]?.id || reu.dados.id}/desfecho`, { status: 'realizada' });
await put(`/comercial/leads/${l.id}`, {
  etapa: 'diagnostico',
  diagnostico: { msgs_dia: 120, atendentes: 3, dor: 'fila no WhatsApp', decisor: 'titular', prazo: 'este mês' },
  meta_sucesso: 'responder 90% das mensagens em até 10 minutos',
});
const r1 = await put(`/comercial/leads/${l.id}`, { etapa: 'trial' });
ok(r1.status === 400 && /reunião de resultado/.test(JSON.stringify(r1.dados)) && !/meta de sucesso/.test(JSON.stringify(r1.dados)),
  'ainda falta a reunião de resultado agendada');
await post(`/comercial/leads/${l.id}/reunioes`, { tipo: 'resultado', inicio: new Date(Date.now() + 12 * 86_400_000).toISOString() });
const r2 = await put(`/comercial/leads/${l.id}`, { etapa: 'trial' });
ok(r2.status === 200 && r2.dados.etapa === 'trial' && r2.dados.trial_inicio === hoje && r2.dados.trial_fim === somar(hoje, 14),
  'com tudo combinado, o trial começa hoje e vai até o 14º dia');
ok(/D0: ativação/.test(r2.dados.proximo_passo || '') && r2.dados.proxima_data === hoje, 'próximo passo: ativação hoje');

titulo('Marcos no Hoje');
let painel = (await get('/comercial/painel')).dados;
let t = painel.hoje_listas.trials?.find((x) => x.lead.id === l.id);
ok(t && t.d === 0 && /Ativação/.test(t.n), 'Hoje mostra o D0 (ativação)');
const m0 = await post(`/comercial/leads/${l.id}/toques`, { tipo: 'trial', dia: 0, nota: 'WhatsApp conectado' });
ok(m0.status === 201, 'registra o marco do trial sem exigir resultado de contato');
painel = (await get('/comercial/painel')).dados;
ok(!painel.hoje_listas.trials?.some((x) => x.lead.id === l.id), 'feito o D0, o próximo (D1) só aparece amanhã');
ok(painel.trials_ativos?.some((x) => x.lead.id === l.id && x.dia === 0), 'lista de trials em andamento com o dia do trial');
const fora = await post(`/comercial/leads/${l.id}/toques`, { tipo: 'trial', dia: 9 });
ok(fora.status === 400, 'dia que não é marco do trial é recusado');

titulo('Prorrogação (gestão, uma vez)');
const p1 = await post(`/comercial/leads/${l.id}/trial/prorrogar`, { dias: 5, motivo: 'titular de férias até sexta' });
ok(p1.status === 200 && p1.dados.trial_fim === somar(hoje, 19) && p1.dados.trial_prorrogado, 'prorroga até 7 dias, com motivo');
const p2 = await post(`/comercial/leads/${l.id}/trial/prorrogar`, { dias: 2, motivo: 'de novo' });
ok(p2.status === 400, 'segunda prorrogação é recusada');

titulo('Proposta e decisão');
const pr = await post(`/comercial/leads/${l.id}/propostas`, { plano: 'Especial', valor_mensal: 499, enviada_em: hoje });
const lp = (await get(`/comercial/leads/${l.id}`)).dados;
ok(pr.status === 201 && /reunião de resultado/.test(lp.proximo_passo || ''), 'proposta no trial: o próximo passo é a reunião de resultado');
const g = await put(`/comercial/leads/${l.id}`, { etapa: 'ganho' });
const lg = (await get(`/comercial/leads/${l.id}`)).dados;
ok(g.status === 200 && lg.etapa === 'ganho' && lg.toques_marco['0'] && lg.toques_marco['2'] && !lg.toques_marco['7'],
  'assinou depois do trial: onboarding e treinamento contam como feitos; a implantação segue do D7');
painel = (await get('/comercial/painel')).dados;
ok(painel.numeros.taxas.diag_proposta.para >= 1, 'taxa reunião → trial conta quem entrou no trial');
