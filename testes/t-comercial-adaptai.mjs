// Sprint 43 — frente AdaptAI no Comercial.
import { login, get, post, put, ok, titulo } from './api.mjs';

const sufixo = Date.now().toString(36);
await login();
const B = '/comercial/adaptai';

titulo('Config');
const cfg = (await get(`${B}/config`)).dados;
const hoje = cfg.hoje;
ok(cfg.etapas.escola.length === 7 && cfg.etapas.rede.length === 5 && cfg.cadencia.length === 7, 'funil das escolas (7), da rede pública (5) e cadência de 7 passos em 20 dias');
ok(cfg.metas.contatos === 40 && cfg.metas.decisores === 10 && cfg.metas.diagnosticos === 5, 'metas semanais de partida do plano');

titulo('Lista inicial de Belém');
const l1 = await post(`${B}/carregar-lista`);
const l2 = await post(`${B}/carregar-lista`);
ok(l1.status === 200 && l1.dados.carregadas + l1.dados.ja_existiam === 34 && l2.dados.carregadas === 0, 'carrega as 34 escolas/redes do plano e não duplica');
const lista = (await get(`${B}/escolas`)).dados.escolas;
const marista = lista.find((e) => e.nome.startsWith('Colégio Marista'));
ok(marista && marista.prioridade === 'A' && marista.rota === 'A' && marista.pontos_preliminar, 'Marista: nota 10 (preliminar), prioridade A, rota A (Nazaré)');
const semec = lista.find((e) => e.nome.startsWith('SEMEC'));
ok(semec && semec.trilha === 'rede' && cfg.etapas.rede.some((x) => x.k === semec.etapa), 'SEMEC entra no funil da rede pública');

titulo('Cadastro e pontuação');
const c = await post(`${B}/escolas`, { nome: 'Escola Teste ' + sufixo, tipo: 'particular_pequena', bairro: 'Umarizal', pts_etapas: 3, pts_porte: 2, pts_acesso: 2, pts_rota: 1 });
ok(c.status === 201 && c.dados.pontos === 8 && c.dados.prioridade === 'A' && c.dados.rota === 'A' && c.dados.etapa === 'lista', 'nota = soma dos componentes (8 = A); rota pelo bairro');
const id = c.dados.id;
const dup = await post(`${B}/escolas`, { nome: 'escola teste ' + sufixo, tipo: 'particular_pequena' });
ok(dup.status === 409, 'nome repetido é recusado');

titulo('Cadência e contato');
ok(c.dados.passo?.k === 'd1_contato' && c.dados.passo.devido, 'D1 (visita ou ligação) aparece como devido');
const semRes = await post(`${B}/escolas/${id}/atividades`, { tipo: 'ligacao', passo: 'd1_contato' });
ok(semRes.status === 400, 'contato sem resultado é recusado');
const a1 = await post(`${B}/escolas/${id}/atividades`, { tipo: 'visita', passo: 'd1_contato', resultado: 'falou_aliado', com_quem: 'Coord. pedagógica' });
ok(a1.status === 201 && a1.dados.etapa === 'contato' && a1.dados.escola.cadencia_inicio === hoje, 'visita com resposta: vai sozinha para Contato feito e a cadência começa hoje');
ok(a1.dados.escola.passo?.k === 'd1_whatsapp' && /D1: WhatsApp/.test(a1.dados.escola.proximo_passo), 'próximo passo: WhatsApp do D1');
const errado = await post(`${B}/escolas/${id}/atividades`, { tipo: 'email', passo: 'd1_whatsapp', resultado: 'sem_resposta' });
ok(errado.status === 400, 'passo com canal errado é recusado');
const futuro = await post(`${B}/escolas/${id}/atividades`, { tipo: 'ligacao', resultado: 'sem_resposta', data: '2099-01-01' });
ok(futuro.status === 400, 'atividade feita com data futura é recusada');

titulo('Portões');
const p1 = await put(`${B}/escolas/${id}`, { etapa: 'decisor' });
ok(p1.status === 400 && /quem decide/.test(JSON.stringify(p1.dados)), 'Decisor alcançado exige o nome de quem decide');
const p2 = await put(`${B}/escolas/${id}`, { etapa: 'decisor', decisor_nome: 'Diretora Ana', decisor_cargo: 'Diretora' });
ok(p2.status === 200 && p2.dados.etapa === 'decisor', 'com o decisor, avança');
const p3 = await put(`${B}/escolas/${id}`, { etapa: 'qualificada', bant: { dor: '4 h por semana adaptando' } });
ok(p3.status === 400 && /prazo/.test(JSON.stringify(p3.dados)) && /orçamento/.test(JSON.stringify(p3.dados)), 'Qualificada exige BANT completo');
const p4 = await put(`${B}/escolas/${id}`, { etapa: 'qualificada', bant: { dor: '4 h por semana adaptando', decisor: 'Diretora', prazo: 'matrícula 2027', orcamento: 'piloto gratuito, depois verba da escola' } });
ok(p4.status === 200 && p4.dados.etapa === 'qualificada' && p4.dados.bant.dor, 'BANT completo: Qualificada');

titulo('Demo agendada e realizada');
const ag = await post(`${B}/escolas/${id}/atividades`, { tipo: 'oficina', status: 'agendado', data: hoje, hora: '09:00', com_quem: 'professores' });
ok(ag.status === 201 && /Oficina/.test(ag.dados.escola.proximo_passo), 'oficina agendada vira o próximo passo');
const ativId = ag.dados.escola.atividades.find((a) => a.status === 'agendado').id;
let painel = (await get(`${B}/painel`)).dados;
ok(painel.hoje_listas.agenda_hoje.some((a) => a.id === ativId), 'oficina de hoje aparece na agenda de Hoje');
const des = await post(`${B}/atividades/${ativId}/desfecho`, { status: 'feito' });
ok(des.status === 200 && des.dados.escola.etapa === 'demo', 'oficina realizada: vai sozinha para Demo / oficina feita');

titulo('Proposta / piloto');
const q1 = await put(`${B}/escolas/${id}`, { etapa: 'proposta' });
const t1 = JSON.stringify(q1.dados);
ok(q1.status === 400 && /diagnóstico/.test(t1) && /piloto/.test(t1), 'sem diagnóstico nem piloto/proposta, não vai para Proposta / piloto');
const q2 = await put(`${B}/escolas/${id}`, {
  etapa: 'proposta',
  diagnostico: { processo: 'cada professor adapta sozinho', dor: 'AEE sobrecarregado', decisao: 'diretora, até dezembro', sucesso: 'adaptar em 15 min' },
  piloto: { criterio: 'reduzir 50% do tempo por adaptação', professores: '4', aee: '1' },
  piloto_inicio: hoje,
});
ok(q2.status === 200 && q2.dados.etapa === 'proposta' && q2.dados.piloto_fim && q2.dados.piloto_marco?.k === 'piloto_inicio', 'com diagnóstico e piloto definido: Proposta / piloto; piloto de 30 dias com marco de início');
painel = (await get(`${B}/painel`)).dados;
ok(painel.pilotos.some((x) => x.id === id) && painel.hoje_listas.pilotos.some((x) => x.id === id), 'piloto aparece em Pilotos e no Hoje');

titulo('Retrocesso, perda e nutrição');
const v1 = await put(`${B}/escolas/${id}`, { etapa: 'contato' });
ok(v1.status === 400 && /justificativa/.test(JSON.stringify(v1.dados)), 'voltar etapa exige justificativa');
const c2 = (await post(`${B}/escolas`, { nome: 'Escola Perda ' + sufixo, tipo: 'filantropica' })).dados;
const pd = await put(`${B}/escolas/${c2.id}`, { etapa: 'perdido' });
ok(pd.status === 400 && /motivo/.test(JSON.stringify(pd.dados)), 'perdido exige motivo');
const nu = await put(`${B}/escolas/${c2.id}`, { etapa: 'nutricao' });
ok(nu.status === 200 && nu.dados.nutricao_ate > hoje && /nutrição/.test(nu.dados.proximo_passo), 'nutrição marca a retomada (60 dias)');

titulo('Semana, metas e TV');
painel = (await get(`${B}/painel`)).dados;
const n = painel.semana.numeros;
ok(n.visitas >= 1 && n.contatos >= 1 && n.demos >= 1 && n.propostas >= 1 && n.decisores >= 1, 'semana conta visitas, contatos, decisores, demos e propostas/pilotos');
ok(painel.conversao.length === 7 && painel.serie.length === 8, 'conversão por etapa e série de 8 semanas');
const m = await put(`${B}/metas`, { contatos: 45 });
ok(m.status === 200 && m.dados.metas.contatos === 45, 'gestão ajusta a meta semanal');
await put(`${B}/metas`, { contatos: 40 });
const tv = (await get('/comercial/tv')).dados;
ok(tv.adaptai && tv.adaptai.funil.length && tv.adaptai.semana.metas.contatos === 40, 'Modo TV recebe o bloco AdaptAI');

titulo('Plano, kit e estorno');
const ck = await put(`${B}/checklist/kit_onepager_direcao`, { tipo: 'kit', feito: true });
const lst = (await get(`${B}/checklist`)).dados.itens;
ok(ck.status === 200 && lst.kit_onepager_direcao?.feito === true, 'kit de curadoria marca item pronto');
const ficha = (await get(`${B}/escolas/${id}`)).dados;
const visita = ficha.atividades.find((a) => a.tipo === 'visita');
const es = await post(`${B}/atividades/${visita.id}/estornar`, { motivo: 'registrado na escola errada' });
ok(es.status === 200 && es.dados.escola.atividades.find((a) => a.id === visita.id).estornado_em, 'erro vira estorno com motivo (não some)');
