// Sprint 42I — Marketing no Comercial: calendário das ações com o resultado no funil.
import { login, get, post, put, del, ok, titulo } from './api.mjs';

const sufixo = Date.now().toString(36);
const rnd = (n) => String(Math.floor(Math.random() * 10 ** n)).padStart(n, '0');
await login();
const cfg = (await get('/comercial/config')).dados;
const hoje = cfg.hoje;
const somar = (d, n) => { const x = new Date(d + 'T12:00:00Z'); x.setUTCDate(x.getUTCDate() + n); return x.toISOString().slice(0, 10); };

titulo('Ações');
const a1 = await post('/comercial/marketing/acoes', { titulo: 'Post LinkedIn caso Socorro ' + sufixo, canal: 'linkedin', data: hoje, custo: 0 });
ok(a1.status === 201 && a1.dados.status === 'planejada' && a1.dados.campanha.startsWith('Post LinkedIn caso Socorro'), 'cria a ação; a campanha nasce do título');
const camp = 'Congresso teste ' + sufixo;
const a2 = await post('/comercial/marketing/acoes', { titulo: 'Estande no congresso ' + sufixo, canal: 'evento', data: somar(hoje, -2), custo: 1500, campanha: camp });
ok(a2.status === 201 && a2.dados.campanha === camp, 'campanha informada é respeitada');
const dup = await post('/comercial/marketing/acoes', { titulo: 'Outra ação ' + sufixo, canal: 'site', data: hoje, campanha: camp.toUpperCase() });
ok(dup.status === 409, 'campanha já usada por outra ação é recusada (o resultado não se mistura)');
const ruim = await post('/comercial/marketing/acoes', { titulo: 'x', canal: 'tiktok', data: hoje });
ok(ruim.status === 400, 'título curto e canal desconhecido são recusados');

titulo('Resultado no funil');
const l1 = (await post('/comercial/leads', { nome: 'Cartório Mkt A ' + sufixo, origem: 'evento', campanha: camp.toLowerCase(), telefone: `(91) 9${rnd(4)}-${rnd(4)}` })).dados;
await post('/comercial/leads', { nome: 'Cartório Mkt B ' + sufixo, origem: 'evento', campanha: camp, telefone: `(91) 9${rnd(4)}-${rnd(4)}`, etapa: 'cadencia' });
await post(`/comercial/leads/${l1.id}/reunioes`, { tipo: 'diagnostico', inicio: new Date(Date.now() + 86_400_000).toISOString() });
const painel = (await get(`/comercial/marketing?de=${somar(hoje, -10)}&ate=${somar(hoje, 10)}`)).dados;
const r2 = painel.acoes.find((a) => a.id === a2.dados.id);
ok(r2 && r2.cartorios === 2 && r2.reunioes === 1 && r2.custo === 1500, 'ação conta os cartórios da campanha (sem diferenciar maiúsculas) e quantos chegaram à reunião');
ok(painel.resumo && typeof painel.resumo.atrasadas === 'number' && painel.resumo.atrasadas >= 1, 'resumo aponta ação planejada com data vencida como atrasada');
ok(painel.por_canal.some((c) => c.origem === 'evento' && c.cartorios >= 2), 'resultado por canal (origem) dos últimos 90 dias');
ok(cfg.campanhas !== undefined, 'config traz as campanhas para o cadastro do cartório');
const cfg2 = (await get('/comercial/config')).dados;
const c = cfg2.campanhas.find((x) => x.campanha === camp);
ok(c && c.origem === 'evento', 'campanha da ação aparece no cadastro com a origem sugerida');

titulo('Atualizar e remover');
const f = await put(`/comercial/marketing/acoes/${a1.dados.id}`, { status: 'feita', resultado: '1.200 visualizações, 3 comentários' });
ok(f.status === 200 && f.dados.status === 'feita' && f.dados.feita_em === hoje && /visualizações/.test(f.dados.resultado), 'marcar feita guarda o dia e o resultado');
const arq = await post(`/comercial/marketing/acoes/${a1.dados.id}/arquivar`);
ok(arq.status === 200, 'remove a ação');

titulo('Plano em lote e datas');
const lote = { acoes: [
  { titulo: 'Lote A ' + sufixo, canal: 'instagram', data: somar(hoje, 3), responsavel: 'Sócio' },
  { titulo: 'Lote B ' + sufixo, canal: 'webinar', data: somar(hoje, 5), responsavel: 'Admin' },
], datas: [{ titulo: 'Congresso X ' + sufixo, data: somar(hoje, 20), nota: 'Brasília' }] };
const l = await post('/comercial/marketing/lote', lote);
const l2 = await post('/comercial/marketing/lote', lote);
ok(l.status === 201 && l.dados.criadas === 2 && l.dados.datas === 1 && l2.dados.criadas === 0 && l2.dados.puladas === 2, 'lança o plano em lote, sem duplicar se rodar de novo');
const p2 = (await get(`/comercial/marketing?de=${hoje}&ate=${somar(hoje, 30)}`)).dados;
const la = p2.acoes.find((a) => a.titulo === 'Lote A ' + sufixo);
ok(la && la.responsavel_texto === 'Sócio' && !la.responsavel_id, 'responsável que não está no Nexus fica como texto');
const dt = p2.datas.find((d) => d.titulo === 'Congresso X ' + sufixo);
ok(dt && (await del(`/comercial/marketing/datas/${dt.id}`)).status === 200, 'datas importantes aparecem e podem ser removidas');
