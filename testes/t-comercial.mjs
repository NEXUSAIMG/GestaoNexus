// Módulo Comercial (Sprint 42): funil, regras de fechamento, toques,
// painel/supervisão, metas e importadores (lista e quadro Kanban).
import { login, get, post, put, del, ok, titulo } from './api.mjs';

await login();
const eu = (await get('/pessoas')).dados[0];

titulo('Config');
const cfg = await get('/comercial/config');
ok(cfg.status === 200 && cfg.dados.etapas.length === 8, 'devolve as 8 etapas');
ok(Object.keys(cfg.dados.origens).includes('email_frio'), 'origens incluem e-mail frio');
ok(cfg.dados.pessoas.some((p) => p.id === eu.id), 'lista as pessoas ativas');

titulo('Criar lead');
const semOrigem = await post('/comercial/leads', { nome: 'Cartório sem origem' });
ok(semOrigem.status === 400, 'recusa lead sem origem (apuração por canal)');
const sufixo = Date.now().toString(36);
const l1 = await post('/comercial/leads', {
  nome: 'Cartório Teste ' + sufixo, cidade: 'Castanhal', uf: 'pa', origem: 'prospeccao',
  campanha: 'Onda 1', dono_id: eu.id,
});
ok(l1.status === 201, 'cria lead');
ok(l1.dados.uf === 'PA', 'UF normalizada em maiúsculas');
ok(/^SC-\d{8}-/.test(l1.dados.protocolo), 'gera protocolo SC-AAAAMMDD-xxxxx');
ok(l1.dados.etapa === 'prospect' && l1.dados.marcos.prospect, 'nasce em Prospect com marco');
const id = l1.dados.id;

titulo('Etapas e marcos');
const cad = await put('/comercial/leads/' + id, { etapa: 'cadencia' });
ok(cad.status === 200 && cad.dados.cadencia_inicio === cfg.dados.hoje, 'entrar em cadência grava o início');
const pulo = await put('/comercial/leads/' + id, { etapa: 'trial' });
ok(pulo.dados.marcos.diagnostico && pulo.dados.marcos.qualificado, 'pular para trial marca diagnóstico e qualificado');
ok(pulo.dados.trial_inicio === cfg.dados.hoje, 'trial grava o início');
const perdSem = await put('/comercial/leads/' + id, { etapa: 'perdido' });
ok(perdSem.status === 400 && perdSem.dados.codigo === 'motivo_obrigatorio', 'perdido exige motivo');
const ganhoSem = await put('/comercial/leads/' + id, { etapa: 'ganho' });
ok(ganhoSem.status === 400 && ganhoSem.dados.codigo === 'valor_obrigatorio', 'ganho exige valor mensal');

titulo('Sinais e toques');
const sin = await put('/comercial/leads/' + id, { sinais: { wa: true, conversas: true } });
ok(sin.dados.pontos === 45, 'pontuação de ativação soma os sinais (20+25)');
const mk = await post(`/comercial/leads/${id}/toques`, { tipo: 'marco', dia: 0 });
ok(mk.status === 201 && mk.dados.toques_marco['0'] === cfg.dados.hoje, 'marca o marco D0 do trial');
const mk2 = await post(`/comercial/leads/${id}/toques`, { tipo: 'marco', dia: 0 });
ok(mk2.status === 200, 'marcar de novo não duplica');
const desm = await del(`/comercial/leads/${id}/toques?tipo=marco&dia=0`);
ok(desm.status === 200 && !desm.dados.toques_marco['0'], 'desmarca o marco');
await post(`/comercial/leads/${id}/toques`, { tipo: 'marco', dia: 0 });
const av = await post(`/comercial/leads/${id}/toques`, { tipo: 'avulso', canal: 'Ligação', nota: 'falou com titular' });
ok(av.status === 201, 'registra toque avulso');

titulo('Fechamento');
const ganho = await put('/comercial/leads/' + id, { etapa: 'ganho', valor_mensal: 540 });
ok(ganho.status === 200 && ganho.dados.marcos.ganho, 'ganho com valor');
const det = await get('/comercial/leads/' + id);
ok(det.dados.movimentos.length >= 4, 'histórico de etapas registrado');
ok(det.dados.toques.length >= 2, 'toques aparecem no detalhe');

const l2 = await post('/comercial/leads', { nome: 'Perdido ' + sufixo, origem: 'inbound', dono_id: eu.id });
const perd = await put('/comercial/leads/' + l2.dados.id, { etapa: 'perdido', motivo_perda: 'Preço' });
ok(perd.status === 200 && perd.dados.motivo_perda === 'Preço', 'perdido com motivo');

titulo('Metas');
const mes = cfg.dados.hoje.slice(0, 7);
const mt = await put('/comercial/metas/' + mes, {
  metaClientes: 5, ticket: 540, diasUteis: 21, taxaContatoDiag: 6, taxaDiagTrial: 55,
  taxaTrialPago: 30, metaNovosDia: 25, metaToquesDia: 80, novosPorPessoa: { [eu.id]: 3 },
});
ok(mt.status === 200 && mt.dados.novosPorPessoa[eu.id] === 3, 'salva metas do mês');
const prox = await get('/comercial/metas?mes=2099-01');
ok(prox.dados.metaClientes === 5 && prox.dados._mes_origem === mes, 'mês futuro herda a última meta');

titulo('Painel');
const pn = await get('/comercial/painel');
ok(pn.status === 200, 'painel responde');
ok(pn.dados.numeros.ganhos_mes >= 1 && pn.dados.numeros.receita_nova_mes >= 540, 'conta ganho e receita nova do mês');
ok(pn.dados.numeros.motivos_perda.some((m) => m.motivo === 'Preço'), 'agrega motivos de perda');
ok(pn.dados.plano.contatos_mes === Math.ceil(5 / (0.3 * 0.55 * 0.06)), 'desdobra a meta em contatos/mês');
const minha = pn.dados.supervisao.find((s) => s.pessoa.id === eu.id);
ok(minha && minha.feitos >= 2, 'supervisão conta toques de hoje da pessoa');
ok(minha && ['ok', 'warn', 'crit'].includes(minha.sinal), 'supervisão devolve semáforo');

titulo('Importar lista');
const imp = await post('/comercial/leads/importar-lista', {
  origem: 'email_frio', campanha: 'Onda teste', dono_id: eu.id, etapa: 'cadencia',
  linhas: [
    { nome: 'Lista A ' + sufixo, cidade: 'Belém', uf: 'PA', segmento: 'registro civil' },
    { nome: 'Lista B ' + sufixo, cidade: 'Marabá', uf: 'PA', segmento: 'xpto' },
  ],
});
ok(imp.status === 201 && imp.dados.criados === 2, 'importa 2 linhas');
const busca = await get('/comercial/leads?busca=' + encodeURIComponent('Lista B ' + sufixo));
ok(busca.dados.leads[0]?.segmento === 'Outro' && busca.dados.leads[0]?.etapa === 'cadencia', 'segmento desconhecido vira Outro; entra em cadência');
const pn2 = await get('/comercial/painel');
ok(pn2.dados.hoje_listas.toques.some((t) => t.lead.nome === 'Lista A ' + sufixo && t.d === 1), 'lead em cadência gera toque do dia 1 hoje');

titulo('Importar quadro Kanban');
const quadros = await get('/comercial/importar-quadro/previa');
const qa = (quadros.dados.quadros || []).find((q) => q.nome === 'Atividade Comercial');
if (!qa) {
  console.log('  (pulado: rode `npm run semear` para criar o quadro Atividade Comercial)');
} else {
  const pv = await get('/comercial/importar-quadro/previa?quadro_id=' + qa.id);
  ok(pv.status === 200 && pv.dados.colunas.length > 0, 'prévia lista as colunas com etapa sugerida');
  const mapa = Object.fromEntries(pv.dados.colunas.map((c) => [c.id, c.etapa_sugerida]));
  ok((pv.dados.etiquetas || []).some((e) => e.nome === 'Cliente'), 'prévia lista etiquetas em uso');
  const r1 = await post('/comercial/importar-quadro', { quadro_id: qa.id, mapa, origem_padrao: 'prospeccao', somente_etiqueta: 'Cliente' });
  ok(r1.status === 201 && (r1.dados.criados + r1.dados.pulados) >= 1, 'importa o quadro (ou pula o que já veio)');
  const tarefa = await get('/comercial/leads?busca=' + encodeURIComponent('Preparar apresentação da ANOREG'));
  ok(tarefa.dados.total === 0, 'card sem a etiqueta Cliente não vira lead');
  const r2 = await post('/comercial/importar-quadro', { quadro_id: qa.id, mapa, origem_padrao: 'prospeccao', somente_etiqueta: 'Cliente' });
  ok(r2.status === 201 && r2.dados.criados === 0 && r2.dados.pulados >= r1.dados.criados, 'reimportar não duplica');
  const jar = await get('/comercial/leads?busca=' + encodeURIComponent('Jaraguá'));
  const lj = jar.dados.leads[0];
  ok(lj && lj.cidade === 'Jaraguá do Sul' && lj.uf === 'SC', 'separa Cidade/UF do campo personalizado');
  ok(lj && lj.origem === 'indicacao', 'traduz a origem do quadro ("Indicação")');
  ok(lj && /Termômetro: Quente/.test(lj.notas || ''), 'guarda Termômetro e Faturamento nas anotações');
}

titulo('Arquivar');
const arq = await post(`/comercial/leads/${l2.dados.id}/arquivar`);
ok(arq.status === 204, 'arquiva lead');
const sum = await get('/comercial/leads?busca=' + encodeURIComponent('Perdido ' + sufixo));
ok(sum.dados.total === 0, 'arquivado some da lista');
