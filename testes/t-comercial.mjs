// Módulo Comercial (Sprints 42 e 42B): funil, portões de etapa, resultado de
// toques, reuniões, propostas, assinado × pago, duplicidade, não contatar,
// estorno, histórico campo a campo, rotina da gestão, metas, importadores.
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
const isoEm = (min) => new Date(Date.now() + min * 60_000).toISOString();

const admin = await login();
const adminToken = admin.token;
const eu = (await get('/pessoas')).dados.find((p) => p.email === 'admin@local.test') || (await get('/pessoas')).dados[0];

// Vendedora de teste (acesso restrito, não admin)
const emailV = `vendedora.${sufixo}@local.test`;
const cv = await post('/pessoas', { nome: 'Vendedora ' + sufixo, email: emailV, senha: 'SenhaLocal123!', acesso_restrito: true });
const vend = cv.dados;
// Sem vínculo (equipe) a pessoa não loga
const equipeId = await equipeDeTeste('Comercial');
await post(`/equipes/${equipeId}/membros`, { pessoa_id: vend.id, papel: 'membro' });
const lv = await fetch(BASE + '/auth/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: emailV, senha: 'SenhaLocal123!' }) }).then((r) => r.json());
const V = (m, c, b) => como(lv.token, m, c, b);
const A = (m, c, b) => como(adminToken, m, c, b);

titulo('Config');
const cfg = (await V('GET', '/comercial/config')).dados;
ok(cfg.etapas.length === 8 && cfg.etapas.some((e) => e.k === 'trial') && !cfg.etapas.some((e) => e.k === 'qualificado') && cfg.etapas[1].n === 'Em contatos' && cfg.marcos_implantacao.length === 5 && cfg.marcos_implantacao[1].n === 'Reunião de treinamento e ativação', 'devolve as 8 etapas (com o trial de 14 dias) e os marcos de implantação');
ok(cfg.resultados.some((r) => r.k === 'caixa_postal'), 'lista resultados de contato');
ok(cfg.feriados.length > 0, 'feriados carregados');
ok(cfg.eu.admin === false, 'vendedora não é gestão');
const hoje = cfg.hoje;

titulo('Cadastro, duplicidade e não contatar');
const semOrigem = await V('POST', '/comercial/leads', { nome: 'Sem origem' });
ok(semOrigem.status === 400, 'recusa lead sem origem');
const cns = rnd(6); const cnpj = rnd(14); const tel = `(91) 9${rnd(4)}-${rnd(4)}`;
const nome = `1º Ofício de Teste ${sufixo}`;
const c1 = await V('POST', '/comercial/leads', {
  nome, cidade: 'Castanhal', uf: 'pa', origem: 'prospeccao', campanha: 'Onda 1',
  dono_id: vend.id, cns, cnpj, telefone: tel, email: `contato.${sufixo}@cartorio.test`,
});
ok(c1.status === 201, 'cria lead com CNS e CNPJ');
const id = c1.dados.id;
ok(c1.dados.cns === cns && c1.dados.uf === 'PA', 'normaliza CNS e UF');
const dupCns = await V('POST', '/comercial/leads', { nome: 'Outro nome', origem: 'inbound', cns });
ok(dupCns.status === 409 && dupCns.dados.codigo === 'duplicado', 'barra CNS repetido');
const dupNome = await V('POST', '/comercial/leads', { nome: nome.toUpperCase().replace('º', 'º '), cidade: 'Castanhal', uf: 'PA', origem: 'inbound' });
ok(dupNome.status === 409, 'barra mesmo nome+cidade+UF (maiúsculas/espaços)');
const dupTel = await V('POST', '/comercial/leads', { nome: 'Fone igual ' + sufixo, origem: 'inbound', telefone: '+55 ' + tel });
ok(dupTel.status === 409, 'barra telefone igual com +55');
const ver = await V('POST', '/comercial/leads/verificar', { cns });
ok(ver.dados.livre === false && ver.dados.codigo === 'duplicado', 'verificação prévia avisa duplicidade');

const emailBloq = `lgpd.${sufixo}@cartorio.test`;
const nc = await V('POST', '/comercial/nao-contatar', { tipo: 'email', valor: emailBloq.toUpperCase(), motivo: 'pedido_lgpd' });
ok(nc.status === 201 && nc.dados.incluidos === 1, 'vendedora inclui na lista de não contatar');
const bloq = await V('POST', '/comercial/leads', { nome: 'Bloqueado ' + sufixo, origem: 'email_frio', email: emailBloq });
ok(bloq.status === 409 && bloq.dados.codigo === 'nao_contatar', 'não cadastra contato da lista de não contatar');
const lst = await V('GET', '/comercial/nao-contatar?busca=' + encodeURIComponent('lgpd.' + sufixo));
const ncId = lst.dados[0]?.id;
ok((await V('DELETE', '/comercial/nao-contatar/' + ncId)).status === 403, 'vendedora não remove da lista');

const pulo = await V('POST', '/comercial/leads', { nome: 'Pulo ' + sufixo, origem: 'inbound', etapa: 'proposta' });
ok(pulo.status === 400 && pulo.dados.codigo === 'portao', 'não cria lead direto em Aguardando retorno');
const semTrial = await V('POST', '/comercial/leads', { nome: 'Trial ' + sufixo, origem: 'inbound', etapa: 'trial' });
ok(semTrial.status === 400, 'etapa trial não existe mais');

titulo('Toques com resultado');
await V('PUT', '/comercial/leads/' + id, { etapa: 'cadencia' });
const semRes = await V('POST', `/comercial/leads/${id}/toques`, { tipo: 'cadencia', dia: 1 });
ok(semRes.status === 400 && semRes.dados.codigo === 'resultado_obrigatorio', 'toque exige resultado');
const t1 = await V('POST', `/comercial/leads/${id}/toques`, { tipo: 'cadencia', dia: 1, resultado: 'nao_atendeu' });
ok(t1.status === 201 && t1.dados.toques_cadencia['1'] === hoje, 'registra toque do dia 1 com resultado');
const agSem = await V('POST', `/comercial/leads/${id}/toques`, { tipo: 'avulso', canal: 'Ligação', resultado: 'agendou' });
ok(agSem.status === 400 && agSem.dados.codigo === 'reuniao_obrigatoria', '"agendou" exige data da reunião');
const ag = await V('POST', `/comercial/leads/${id}/toques`, {
  tipo: 'avulso', canal: 'Ligação', resultado: 'agendou', duracao_min: 6,
  reuniao: { tipo: 'diagnostico', inicio: isoEm(60 * 24) },
});
ok(ag.status === 201 && ag.dados.etapa === 'diagnostico', 'agendou diagnóstico → lead vai para Diagnóstico');

titulo('Portões de etapa');
const q1 = await V('PUT', '/comercial/leads/' + id, { etapa: 'proposta' });
ok(q1.status === 400 && q1.dados.codigo === 'portao', 'Aguardando retorno bloqueado sem reunião realizada');
ok(/reunião de apresentação/.test(q1.dados.erro) && /dor principal/.test(q1.dados.erro), 'mensagem lista o que falta');
let det = (await V('GET', '/comercial/leads/' + id)).dados;
const reuFutura = det.reunioes.find((r) => r.status === 'agendada');
const fut = await V('POST', `/comercial/reunioes/${reuFutura.id}/desfecho`, { status: 'realizada' });
ok(fut.status === 400 && fut.dados.codigo === 'reuniao_futura', 'não marca realizada antes do horário');
const rem = await V('POST', `/comercial/reunioes/${reuFutura.id}/remarcar`, { inicio: isoEm(-30) });
ok(rem.status === 200 && rem.dados.reunioes.some((r) => r.status === 'remarcada'), 'remarca (fica registrado)');
const nova = rem.dados.reunioes.find((r) => r.status === 'agendada');
const real = await V('POST', `/comercial/reunioes/${nova.id}/desfecho`, { status: 'realizada', nota: 'titular presente' });
ok(real.status === 200, 'marca diagnóstico realizado');
await V('PUT', '/comercial/leads/' + id, { diagnostico: { msgs_dia: 120, atendentes: 3, dor: 'fila no WhatsApp', decisor: 'titular', prazo: 'novembro' } });
await V('PUT', '/comercial/leads/' + id, { meta_sucesso: 'responder em até 10 min', proximo_passo: 'enviar proposta', proxima_data: hoje });

titulo('Proposta e desconto');
const pr0 = await V('PUT', '/comercial/leads/' + id, { etapa: 'proposta' });
ok(pr0.status === 400 && /proposta registrada/.test(pr0.dados.erro) && !/reunião|diagnóstico|ativação|meta de sucesso/.test(pr0.dados.erro), 'com reunião e diagnóstico feitos, Aguardando retorno (pulando o trial) só pede a proposta');
const desc = await V('POST', `/comercial/leads/${id}/propostas`, { plano: 'Pro', valor_mensal: 540, desconto: 'mes_gratis_ex_cliente' });
ok(desc.status === 400 && desc.dados.codigo === 'desconto_negado', 'mês grátis só para ex-cliente');
const pr = await V('POST', `/comercial/leads/${id}/propostas`, { plano: 'Pro', valor_mensal: 540 });
ok(pr.status === 201 && pr.dados.propostas[0].validade, 'registra proposta com validade (padrão 7 dias)');
const pr1 = await V('PUT', '/comercial/leads/' + id, { etapa: 'proposta' });
ok(pr1.status === 200 && pr1.dados.etapa === 'proposta', 'proposta registrada → Aguardando retorno');
const cg = await V('PUT', '/comercial/leads/' + id, { etapa: 'corregedoria', proximo_passo: 'cobrar retorno da corregedoria', proxima_data: hoje });
ok(cg.status === 200 && cg.dados.etapa === 'corregedoria', 'interino vai para Aguardando a Corregedoria');

titulo('Assinado × pago');
const g = await V('PUT', '/comercial/leads/' + id, { etapa: 'ganho' });
ok(g.status === 200 && g.dados.valor_mensal === 540, 'ganho herda o valor da proposta');
ok(g.dados.implantacao_inicio === hoje, 'ganho começa a implantação');
const mk = await V('POST', `/comercial/leads/${id}/toques`, { tipo: 'marco', dia: 0 });
ok(mk.status === 201 && mk.dados.toques_marco['0'], 'marco de implantação (onboarding) registrado');
det = (await V('GET', '/comercial/leads/' + id)).dados;
ok(det.propostas[0].status === 'aceita', 'proposta vira aceita');
let pn = (await V('GET', '/comercial/painel')).dados;
ok(pn.hoje_listas.aguardando_pagamento.some((x) => x.lead.id === id), 'assinado aparece aguardando pagamento');
ok(pn.implantacoes.some((x) => x.lead.id === id && x.proximo_marco && x.proximo_marco.d === 2), 'aparece em Implantação com o próximo marco (treinamento)');
const pagoV = await V('POST', `/comercial/leads/${id}/pagamento`, { pago_em: hoje, valor: 540, referencia: 'PIX 123' });
ok(pagoV.status === 403, 'vendedora não confirma pagamento');
const pagoA = await A('POST', `/comercial/leads/${id}/pagamento`, { pago_em: hoje, valor: 540, referencia: 'PIX 123' });
ok(pagoA.status === 200 && pagoA.dados.pago_em === hoje, 'gestão confirma pagamento');
pn = (await V('GET', '/comercial/painel')).dados;
ok(pn.numeros.pagos_mes >= 1 && pn.numeros.receita_nova_mes >= 540, 'meta conta pagos e receita');

titulo('Retrocesso e estorno');
const volta = await V('PUT', '/comercial/leads/' + id, { etapa: 'proposta' });
ok(volta.status === 400 && volta.dados.codigo === 'justificativa_obrigatoria', 'reabrir ganho exige justificativa');
const toques = (await V('GET', '/comercial/leads/' + id)).dados.toques;
const meuToque = toques.find((t) => t.tipo === 'cadencia' && !t.estornado_em);
const e1 = await V('POST', `/comercial/toques/${meuToque.id}/estornar`, { motivo: 'erro' });
ok(e1.status === 400, 'estorno exige motivo de verdade');
const e2 = await V('POST', `/comercial/toques/${meuToque.id}/estornar`, { motivo: 'marquei no lead errado' });
ok(e2.status === 200 && !e2.dados.toques_cadencia['1'], 'estorna o próprio toque do dia');
det = (await V('GET', '/comercial/leads/' + id)).dados;
ok(det.toques.some((t) => t.id === meuToque.id && t.estornado_em), 'toque estornado continua no histórico');
ok(det.alteracoes.some((a) => a.campo === 'meta_sucesso') && det.alteracoes.some((a) => a.campo === 'diagnostico'), 'histórico campo a campo');

titulo('Arquivar');
const l2 = await V('POST', '/comercial/leads', { nome: 'Arquivar ' + sufixo, origem: 'inbound', dono_id: vend.id });
ok((await V('POST', `/comercial/leads/${l2.dados.id}/arquivar`, { motivo: 'cadastro duplicado' })).status === 403, 'vendedora não arquiva');
ok((await A('POST', `/comercial/leads/${l2.dados.id}/arquivar`, {})).status === 400, 'arquivar exige motivo');
ok((await A('POST', `/comercial/leads/${l2.dados.id}/arquivar`, { motivo: 'cadastro duplicado' })).status === 204, 'gestão arquiva com motivo');

titulo('Contato bloqueado depois do cadastro');
const l3 = await V('POST', '/comercial/leads', { nome: 'Pediu para sair ' + sufixo, origem: 'inbound', telefone: `(91) 8${rnd(4)}-${rnd(4)}`, dono_id: vend.id });
await V('POST', '/comercial/nao-contatar', { tipo: 'telefone', valor: '+55 ' + l3.dados.telefone, motivo: 'pediu_nao_contatar' });
const tb = await V('POST', `/comercial/leads/${l3.dados.id}/toques`, { tipo: 'avulso', canal: 'Ligação', resultado: 'atendeu' });
ok(tb.status === 409 && tb.dados.codigo === 'nao_contatar', 'não registra contato com lead bloqueado');

titulo('Metas e rotina da gestão');
const mes = hoje.slice(0, 7);
const metas = { metaClientes: 5, ticket: 540, diasUteis: 21, taxaContatoDiag: 6, taxaDiagTrial: 55, taxaTrialPago: 30, metaNovosDia: 25, metaToquesDia: 80, porPessoa: { [vend.id]: { novosDia: 2, toquesDia: 10, reunioesMes: 8, pagosMes: 2 } } };
ok((await V('PUT', '/comercial/metas/' + mes, metas)).status === 403, 'vendedora não altera metas');
const mt = await A('PUT', '/comercial/metas/' + mes, metas);
ok(mt.status === 200 && mt.dados.porPessoa[vend.id].toquesDia === 10, 'gestão salva metas por pessoa');
pn = (await V('GET', '/comercial/painel')).dados;
const sv = pn.supervisao.find((s) => s.pessoa.id === vend.id);
ok(sv && sv.meta_toques === 10 && sv.conexoes >= 1, 'supervisão usa meta de toques e conta conexões');
const chk0 = await A('POST', '/comercial/checagens', { janela: 'abertura', pessoa_id: vend.id });
ok(sv.sinal === 'ok' ? chk0.status === 201 : chk0.dados.codigo === 'observacao_obrigatoria', 'checagem fora do verde exige observação');
const chk = await A('POST', '/comercial/checagens', { janela: 'abertura', pessoa_id: vend.id, observacao: 'combinado bloco de ligações às 9h' });
ok(chk.status === 201, 'gestão registra checagem das 8h30');
pn = (await V('GET', '/comercial/painel')).dados;
ok(pn.supervisao.find((s) => s.pessoa.id === vend.id).checagens.length === 1, 'checagem aparece na supervisão');
const um = await A('POST', '/comercial/1a1', { pessoa_id: vend.id, combinados: 'subir conexões', acoes: [{ acao: 'ouvir 2 ligações gravadas', prazo: hoje }] });
ok(um.status === 201, 'registra 1:1 com plano de ação');
const lista1 = (await V('GET', '/comercial/1a1?pessoa_id=' + vend.id)).dados;
ok(lista1[0]?.numeros?.toques >= 1, '1:1 congela o placar da semana');
const acao = lista1[0].acoes[0];
ok((await V('PUT', '/comercial/acoes/' + acao.id, { status: 'cancelada' })).status === 403, 'vendedora não cancela ação');
ok((await V('PUT', '/comercial/acoes/' + acao.id, { status: 'feita' })).status === 200, 'vendedora conclui a própria ação');
const plc = (await V('GET', '/comercial/placar')).dados;
const pl = plc.linhas.find((x) => x.id === vend.id);
ok(pl && pl.pagos >= 1 && pl.reunioes_realizadas >= 1 && pl.estornos >= 1 && pl.checagens >= 1, 'placar: pagos, reuniões, estornos e checagens');

titulo('Importar lista');
const imp = await V('POST', '/comercial/leads/importar-lista', {
  origem: 'email_frio', campanha: 'Onda teste', dono_id: vend.id, etapa: 'cadencia',
  linhas: [
    { nome: 'Lista A ' + sufixo, cidade: 'Belém', uf: 'PA', segmento: 'registro civil' },
    { nome: 'Lista B ' + sufixo, cidade: 'Marabá', uf: 'PA', segmento: 'xpto' },
    { nome: 'Repetido', cns },
    { nome: 'Bloqueado lista', email: emailBloq },
  ],
});
ok(imp.status === 201 && imp.dados.criados === 2 && imp.dados.recusados === 2, 'importa 2 e recusa duplicado + não contatar');
ok(imp.dados.recusados_por_motivo.duplicado === 1 && imp.dados.recusados_por_motivo.nao_contatar === 1, 'informa o motivo das recusas');
pn = (await V('GET', '/comercial/painel')).dados;
ok(pn.hoje_listas.toques.some((t) => t.lead.nome === 'Lista A ' + sufixo && t.d === 1), 'lead em cadência gera toque do dia 1');

titulo('Importar quadro Kanban');
const quadros = await A('GET', '/comercial/importar-quadro/previa');
const qa = (quadros.dados.quadros || []).find((q) => q.nome === 'Atividade Comercial');
if (!qa) {
  console.log('  (pulado: rode `npm run semear` para criar o quadro Atividade Comercial)');
} else {
  const pv = await A('GET', '/comercial/importar-quadro/previa?quadro_id=' + qa.id);
  ok(pv.status === 200 && pv.dados.colunas.length > 0, 'prévia lista as colunas com etapa sugerida');
  const mapa = Object.fromEntries(pv.dados.colunas.map((c) => [c.id, c.etapa_sugerida]));
  const r1 = await A('POST', '/comercial/importar-quadro', { quadro_id: qa.id, mapa, origem_padrao: 'prospeccao', somente_etiqueta: 'Cliente' });
  ok(r1.status === 201 && (r1.dados.criados + r1.dados.pulados) >= 1, 'importa o quadro (ou pula o que já veio)');
  const tarefa = await A('GET', '/comercial/leads?busca=' + encodeURIComponent('Preparar apresentação da ANOREG'));
  ok(tarefa.dados.total === 0, 'card sem a etiqueta Cliente não vira lead');
  const r2 = await A('POST', '/comercial/importar-quadro', { quadro_id: qa.id, mapa, origem_padrao: 'prospeccao', somente_etiqueta: 'Cliente' });
  ok(r2.status === 201 && r2.dados.criados === 0, 'reimportar não duplica');
  const jar = await A('GET', '/comercial/leads?busca=' + encodeURIComponent('Tabelionato de Jaraguá do Sul'));
  const lj = jar.dados.leads[0];
  ok(lj && lj.cidade === 'Jaraguá do Sul' && lj.uf === 'SC', 'separa Cidade/UF do campo personalizado');
  ok(lj && lj.origem === 'indicacao', 'traduz a origem do quadro ("Indicação")');
}

titulo('Feriados');
const fer = await A('POST', '/comercial/feriados', { data: '2026-12-08', nome: 'Feriado municipal de teste', abrangencia: 'municipal' });
ok(fer.status === 201, 'gestão inclui feriado');
ok((await V('POST', '/comercial/feriados', { data: '2026-12-09', nome: 'x' })).status === 403, 'vendedora não inclui feriado');
await A('DELETE', '/comercial/feriados/2026-12-08');

titulo('Gestão comercial sem ser admin (lista definida pelo admin)');
const emailL = `lider.${sufixo}@local.test`;
const lid = (await post('/pessoas', { nome: 'Líder ' + sufixo, email: emailL, senha: 'SenhaLocal123!', acesso_restrito: true })).dados;
await post(`/equipes/${equipeId}/membros`, { pessoa_id: lid.id, papel: 'lider' });
const ll = await fetch(BASE + '/auth/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: emailL, senha: 'SenhaLocal123!' }) }).then((r) => r.json());
const L = (m, c, b) => como(ll.token, m, c, b);
ok((await L('GET', '/comercial/config')).dados.eu.gestor === false, 'ser líder de equipe "Comercial" não basta (nome de equipe é texto livre)');
ok((await V('PUT', '/comercial/gestores', { pessoas: [vend.id] })).status === 403, 'só admin define a gestão comercial');
const gs = await A('PUT', '/comercial/gestores', { pessoas: [lid.id] });
ok(gs.status === 200 && gs.dados.some((g) => g.pessoa_id === lid.id), 'admin marca a pessoa como gestão comercial');
const cfgL = (await L('GET', '/comercial/config')).dados;
ok(cfgL.eu.gestor === true && cfgL.eu.admin === false, 'pessoa marcada é gestão comercial, sem ser admin');
const chkL = await L('POST', '/comercial/checagens', { janela: 'meio', pessoa_id: vend.id, observacao: 'checagem feita pela gestora' });
ok(chkL.status === 201, 'gestora registra checagem');
const pagL = await L('POST', `/comercial/leads/${id}/pagamento`, { pago_em: hoje, valor: 1, referencia: 'teste' });
ok(pagL.status === 403, 'pagamento manual continua só admin');
ok((await V('POST', '/comercial/checagens', { janela: 'meio', pessoa_id: vend.id, observacao: 'x' })).status === 403, 'membro comum não registra checagem');
const u1L = await L('POST', '/comercial/1a1', { pessoa_id: lid.id, bloqueios: 'teste de escopo', combinados: 'manter a rotina de checagens', acoes: [] });
const u1V = (await V('GET', '/comercial/1a1?pessoa_id=' + lid.id)).dados;
ok(u1L.status === 201 && Array.isArray(u1V) && u1V.every((u) => u.pessoa_id === vend.id), 'vendedora só vê os próprios 1:1');
const chV = (await V('GET', '/comercial/checagens')).dados;
ok(chV.checagens.every((c) => c.pessoa_id === vend.id), 'vendedora só vê as próprias checagens');
await A('PUT', '/comercial/gestores', { pessoas: [] });

titulo('Varredura 42D: furos de controle fechados');
// Duplicidade sem acento/maiúscula (cidade também)
const ac = await V('POST', '/comercial/leads', { nome: `Cartório São José ${sufixo}`, cidade: 'São Paulo', uf: 'SP', origem: 'inbound' });
const ac2 = await V('POST', '/comercial/leads', { nome: `CARTORIO SAO JOSE ${sufixo}`, cidade: 'SAO PAULO', uf: 'sp', origem: 'inbound' });
ok(ac.status === 201 && ac2.status === 409 && ac2.dados.codigo === 'duplicado', 'duplicidade ignora acento e maiúscula no nome e na cidade');
ok(ac.dados.dono_id === vend.id, 'quem cadastra fica responsável');

// Não cria já fechado
ok((await V('POST', '/comercial/leads', { nome: 'Já perdido ' + sufixo, origem: 'inbound', etapa: 'perdido', motivo_perda: 'Outro' })).status === 400, 'não cadastra direto como Perdido');

// Reabrir perdido não pula portão
const rp = (await V('POST', '/comercial/leads', { nome: 'Reabre ' + sufixo, cidade: 'Belém', uf: 'PA', origem: 'inbound' })).dados;
await V('PUT', '/comercial/leads/' + rp.id, { etapa: 'perdido', motivo_perda: 'Outro' });
const reab = await V('PUT', '/comercial/leads/' + rp.id, { etapa: 'proposta', justificativa: 'cliente voltou a conversar' });
ok(reab.status === 400 && reab.dados.codigo === 'portao', 'reabrir Perdido → Proposta cobra os portões');
const reab2 = await V('PUT', '/comercial/leads/' + rp.id, { etapa: 'cadencia', justificativa: 'cliente voltou a conversar' });
ok(reab2.status === 200 && reab2.dados.etapa === 'cadencia', 'reabrir para Cadência (sem portão) funciona com justificativa');

// Ganho → perdido exige justificativa
const gp = await A('PUT', '/comercial/leads/' + id, { etapa: 'perdido', motivo_perda: 'Outro' });
ok(gp.status === 400 && gp.dados.codigo === 'justificativa_obrigatoria', 'ganho → perdido exige justificativa');

// Reunião retroativa
const rr = await V('POST', `/comercial/leads/${rp.id}/reunioes`, { tipo: 'diagnostico', inicio: isoEm(-180) });
ok(rr.status === 403 && rr.dados.codigo === 'retroativo', 'vendedora não registra reunião no passado');
ok((await A('POST', `/comercial/leads/${rp.id}/reunioes`, { tipo: 'diagnostico', inicio: isoEm(-180) })).status === 201, 'gestão registra reunião retroativa');

// Dono e origem
const doAdmin = (await A('POST', '/comercial/leads', { nome: 'Do admin ' + sufixo, cidade: 'Ananindeua', uf: 'PA', origem: 'inbound' })).dados;
const tomar = await V('PUT', '/comercial/leads/' + doAdmin.id, { dono_id: vend.id });
ok(tomar.status === 403 && tomar.dados.codigo === 'dono_negado', 'vendedora não toma lead de outra pessoa');
const ori = await V('PUT', '/comercial/leads/' + doAdmin.id, { origem: 'ex_cliente' });
ok(ori.status === 403 && ori.dados.codigo === 'origem_negada', 'vendedora não muda a origem de lead alheio');
ok((await V('PUT', '/comercial/leads/' + rp.id, { origem: 'indicacao' })).status === 200, 'quem cadastrou corrige a origem nas primeiras 24h');
const repassa = await V('PUT', '/comercial/leads/' + rp.id, { dono_id: lid.id });
ok(repassa.status === 200 && repassa.dados.dono_id === lid.id, 'vendedora repassa o próprio lead');

// Toque duplicado não repete efeitos
const cad = (await V('POST', '/comercial/leads', { nome: 'Duplo clique ' + sufixo, cidade: 'Belém', uf: 'PA', origem: 'inbound', etapa: 'cadencia' })).dados;
const dc1 = await V('POST', `/comercial/leads/${cad.id}/toques`, { tipo: 'cadencia', dia: 1, resultado: 'nao_atendeu' });
const dc2 = await V('POST', `/comercial/leads/${cad.id}/toques`, { tipo: 'cadencia', dia: 1, resultado: 'nao_atendeu' });
ok(dc1.status === 201 && dc2.status === 200 && dc2.dados.duplicado === true, 'toque repetido do roteiro é ignorado (clique duplo)');

// Importação: validação por linha, duplicata dentro da planilha, fila
const campFila = 'Fila ' + sufixo;
const impF = await A('POST', '/comercial/leads/importar-lista', {
  origem: 'prospeccao', campanha: campFila, etapa: 'prospect',
  linhas: [
    { nome: 'Fila 1 ' + sufixo, cidade: 'Óbidos', uf: 'PA' },
    { nome: 'Fila 2 ' + sufixo, cidade: 'Breves', uf: 'PA' },
    { nome: 'FILA 2 ' + sufixo, cidade: 'breves', uf: 'pa' },
    { nome: 'Fila 3 ' + sufixo, cidade: 'Soure', uf: 'PA', cnpj: '123' },
    { nome: 'Fila 4 ' + sufixo, cidade: 'Salinópolis', uf: 'Pará' },
    { nome: 'Fila 5 ' + sufixo, cidade: 'Bragança', uf: 'PA' },
  ],
});
ok(impF.status === 201 && impF.dados.criados === 3, 'linha com CNPJ/UF inválido é recusada sem derrubar o lote');
ok(impF.dados.recusados_por_motivo.invalido === 2 && impF.dados.recusados_por_motivo.duplicado === 1, 'duplicata dentro da própria planilha também é recusada');
ok(impF.dados.lista_recusados.length === 3 && impF.dados.lista_recusados[0].linha > 0, 'devolve todas as recusas com o número da linha');
const pnF = (await V('GET', '/comercial/painel')).dados;
ok(pnF.fila >= 3 && !pnF.hoje_listas.parados.some((x) => x.lead.nome.startsWith('Fila ')), 'prospect sem dono é fila, não "parado"');
const peg = await V('POST', '/comercial/leads/pegar', { quantidade: 2, campanha: campFila });
ok(peg.status === 200 && peg.dados.pegos === 2, 'vendedora pega 2 leads da fila');
const minha = (await V('GET', '/comercial/leads?campanha=' + encodeURIComponent(campFila) + '&dono_id=' + vend.id)).dados;
ok(minha.total === 2 && minha.por_etapa.prospect === 2, 'leads pegos ficam com ela (e a lista devolve contagem por etapa)');
ok((await V('POST', '/comercial/leads/importar-lista', { origem: 'prospeccao', etapa: 'cadencia', linhas: [{ nome: 'Sem dono ' + sufixo, cidade: 'Belém', uf: 'PA' }] })).status === 400,
  'importar direto em Cadência exige responsável');
