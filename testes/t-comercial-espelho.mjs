// Sprint 42F — quadro e Comercial em espelho (nos dois sentidos).
import { login, get, post, put, ok, titulo, equipeDeTeste } from './api.mjs';

const esperar = (ms) => new Promise((r) => setTimeout(r, ms));
const sufixo = Date.now().toString(36);
const rnd = (n) => String(Math.floor(Math.random() * 10 ** n)).padStart(n, '0');

await login();
const eu = (await get('/pessoas')).dados.find((p) => p.email === 'admin@local.test');
const equipeId = await equipeDeTeste('Comercial');

titulo('Montagem: quadro com as colunas da equipe');
const q = await post('/quadros', { equipe_id: equipeId, nome: 'Atividade Comercial ' + sufixo });
ok(q.status === 201, 'cria o quadro');
const quadroId = q.dados.id;
const NOMES = ['Em prospecção', 'Em contatos', 'Reunião de apresentação', 'Aguardando retorno',
  'Aguardando a Corregedoria', 'Enviar Onboarding', 'Reunião de Treinamento', 'Em Desenvolvimento',
  'Pós venda', 'Fora do funil', 'Desistência', 'Ideias soltas'];
const col = {};
for (const n of NOMES) {
  const r = await post(`/quadros/${quadroId}/colunas`, { nome: n });
  col[n] = r.dados.id;
}
const campoTel = (await post(`/quadros/${quadroId}/campos`, { nome: 'Telefone/WhatsApp', tipo: 'texto' })).dados.id;
const campoCid = (await post(`/quadros/${quadroId}/campos`, { nome: 'Cidade/UF', tipo: 'texto' })).dados.id;
ok(Object.keys(col).length === NOMES.length && campoTel && campoCid, 'colunas e campos criados');

// Um card antigo (já em Em Desenvolvimento) para a importação
const antigo = await post('/cards', { coluna_id: col['Em Desenvolvimento'], titulo: 'Cartório Antigo ' + sufixo });
await put(`/cards/${antigo.dados.id}/campos/${campoTel}`, { valor: `(91) 9${rnd(4)}-${rnd(4)} / (91) 9${rnd(4)}-${rnd(4)} (titular) / (91) 3${rnd(3)}-${rnd(4)} (cartório, só de manhã)` });

titulo('Importação liga o espelho');
const previa = await get(`/comercial/importar-quadro/previa?quadro_id=${quadroId}`);
const mapa = Object.fromEntries(previa.dados.colunas.map((c) => [c.id, c.etapa_sugerida]));
mapa[col['Ideias soltas']] = 'ignorar';
ok(mapa[col['Pós venda']] === 'ganho' && mapa[col['Fora do funil']] === 'perdido' && mapa[col['Aguardando a Corregedoria']] === 'corregedoria',
  'palpite de etapa pelo nome das colunas');
ok(previa.dados.colunas.find((c) => c.id === col['Em Desenvolvimento']).marco === 7, 'reconhece a coluna do marco D7');
const imp = await post('/comercial/importar-quadro', { quadro_id: quadroId, mapa, origem_padrao: 'prospeccao', espelhar: true, criar_cards: true });
ok(imp.status === 201 && imp.dados.criados === 1 && imp.dados.espelho, 'importa e liga o espelho');
const esp = await get('/comercial/espelho');
ok(esp.dados.some((e) => e.quadro_id === quadroId && e.ativo), 'espelho aparece nos Controles');
const leadAntigo = (await get(`/comercial/leads?busca=${encodeURIComponent('Cartório Antigo ' + sufixo)}`)).dados.leads?.[0];
const fichaAntigo = leadAntigo && (await get(`/comercial/leads/${leadAntigo.id}`)).dados;
ok(fichaAntigo?.etapa === 'ganho' && fichaAntigo.toques_marco['0'] && fichaAntigo.toques_marco['2'] && !fichaAntigo.toques_marco['7'],
  'importado em Em Desenvolvimento já vem com onboarding e treinamento feitos');
ok(fichaAntigo?.quadro?.coluna === 'Em Desenvolvimento' && fichaAntigo.quadro.espelho, 'ficha mostra onde está no quadro');
ok(fichaAntigo?.telefone?.length <= 60 && /Telefone completo: .*só de manhã/.test(fichaAntigo.notas || ''),
  'telefone longo no card não quebra a importação: corta e guarda o texto inteiro nas anotações');

titulo('Quadro → Comercial');
const c1 = await post('/cards', { coluna_id: col['Em prospecção'], titulo: '1º Ofício Espelho ' + sufixo });
ok(c1.status === 201 && c1.dados.comercial?.etapa === 'prospect', 'card novo numa coluna do funil vira lead (selo no card)');
const leadId = c1.dados.comercial.lead_id;
let lead = (await get(`/comercial/leads/${leadId}`)).dados;
ok(lead.origem === 'prospeccao' && !lead.dono_id, 'lead nasce com a origem padrão, na fila');

await put(`/cards/${c1.dados.id}/campos/${campoCid}`, { valor: 'Castanhal/pa' });
await put(`/cards/${c1.dados.id}`, { titulo: '1º Ofício de Notas Espelho ' + sufixo, responsavel_ids: [eu.id] });
lead = (await get(`/comercial/leads/${leadId}`)).dados;
ok(lead.nome === '1º Ofício de Notas Espelho ' + sufixo && lead.cidade === 'Castanhal' && lead.uf === 'PA' && lead.dono_id === eu.id,
  'título, cidade/UF e responsável do card vão para o lead');

const m1 = await post(`/cards/${c1.dados.id}/mover`, { coluna_id: col['Em contatos'], posicao: 0 });
lead = (await get(`/comercial/leads/${leadId}`)).dados;
ok(m1.status === 200 && lead.etapa === 'cadencia' && lead.movimentos[0].justificativa.includes('pelo quadro'),
  'mover para Em contatos muda a etapa (com rastro "pelo quadro")');

const m2 = await post(`/cards/${c1.dados.id}/mover`, { coluna_id: col['Aguardando retorno'], posicao: 0 });
ok(m2.status === 409 && m2.dados.detalhes?.comercial?.pendencias?.length > 0, 'portão: recusa pular para Aguardando retorno sem reunião e proposta');
const cardDepois = (await get(`/cards/${c1.dados.id}`)).dados;
ok(cardDepois.coluna_id === col['Em contatos'], 'recusado, o card não sai do lugar');

const m3 = await post(`/cards/${c1.dados.id}/mover`, { coluna_id: col['Em prospecção'], posicao: 0 });
ok(m3.status === 409 && /justificativa/.test(m3.dados.detalhes?.comercial?.mensagem || ''), 'voltar etapa pelo quadro é recusado (exige justificativa na ficha)');

const m4 = await post(`/cards/${c1.dados.id}/mover`, { coluna_id: col['Ideias soltas'], posicao: 0 });
lead = (await get(`/comercial/leads/${leadId}`)).dados;
ok(m4.status === 200 && lead.etapa === 'cadencia', 'coluna "fica só no quadro": card anda, lead fica');

titulo('Comercial → quadro');
// Agendar reunião de apresentação pelo contato: lead vai para Reunião de apresentação
const inicio = new Date(Date.now() + 86_400_000).toISOString();
const t1 = await post(`/comercial/leads/${leadId}/toques`, { tipo: 'avulso', resultado: 'agendou', canal: 'Ligação', reuniao: { tipo: 'diagnostico', inicio } });
await esperar(800);
let card = (await get(`/cards/${c1.dados.id}`)).dados;
ok(t1.status === 201 && card.coluna_id === col['Reunião de apresentação'], 'reunião agendada no Comercial move o card para Reunião de apresentação');

const telNovo = `(91) 9${rnd(4)}-${rnd(4)}`;
await put(`/comercial/leads/${leadId}`, { telefone: telNovo });
await esperar(800);
const board = (await get(`/quadros/${quadroId}`)).dados;
const noBoard = board.cards.find((c) => c.id === c1.dados.id);
ok(noBoard?.campos?.[campoTel] === telNovo, 'telefone editado no Comercial aparece no campo do card');
ok(noBoard?.comercial?.etapa === 'diagnostico', 'selo do card acompanha a etapa');
const ec = board.espelho_comercial;
ok(ec?.colunas?.[col['Em contatos']]?.etapa === 'cadencia' && ec.colunas[col['Ideias soltas']]?.etapa === 'ignorar'
  && ec.colunas[col['Em Desenvolvimento']]?.marco === 7, '(42H) quadro diz o que cada coluna é no Comercial');
ok(noBoard && 'proximo_passo' in noBoard.comercial && 'proxima_data' in noBoard.comercial && noBoard.comercial.dono_id === eu.id,
  '(42H) card traz o próximo passo e o responsável do lead');

// Perdido pela ficha → card vai para a coluna do motivo
await put(`/comercial/leads/${leadId}`, { etapa: 'perdido', motivo_perda: 'Desistência (usou e desistiu)' });
await esperar(800);
card = (await get(`/cards/${c1.dados.id}`)).dados;
ok(card.coluna_id === col['Desistência'], 'perdido por desistência vai para a coluna Desistência');

titulo('Lead novo no Comercial ganha card');
const novo = await post('/comercial/leads', { nome: 'Cartório Novo Espelho ' + sufixo, origem: 'inbound', cidade: 'Belém', uf: 'PA' });
await esperar(1000);
const fichaNovo = (await get(`/comercial/leads/${novo.dados.id}`)).dados;
ok(novo.status === 201 && fichaNovo.quadro?.coluna === 'Em prospecção', 'lead cadastrado no Comercial ganha card em Em prospecção');
const board2 = (await get(`/quadros/${quadroId}`)).dados;
const cNovo = board2.cards.find((c) => c.id === fichaNovo.quadro.card_id);
ok(cNovo?.campos?.[campoCid] === 'Belém/PA' && cNovo.responsaveis[0]?.id === eu.id, 'card nasce com cidade/UF e responsável');

titulo('Implantação: colunas viram marcos');
const mi = await post(`/cards/${antigo.dados.id}/mover`, { coluna_id: col['Pós venda'], posicao: 0 });
const fa = (await get(`/comercial/leads/${leadAntigo.id}`)).dados;
ok(mi.status === 200 && fa.toques_marco['7'] && fa.toques_marco['15'] && !fa.toques_marco['30'], 'entrar em Pós venda marca D7 e D15 como feitos');
const back = await post(`/cards/${antigo.dados.id}/mover`, { coluna_id: col['Reunião de Treinamento'], posicao: 0 });
ok(back.status === 200, 'recuar dentro da implantação é permitido (o card fica onde a pessoa pôs)');
await post(`/comercial/leads/${leadAntigo.id}/toques`, { tipo: 'marco', dia: 30 });
await esperar(800);
card = (await get(`/cards/${antigo.dados.id}`)).dados;
ok(card.coluna_id === col['Pós venda'], 'marco registrado no Comercial leva o card para a frente');

const cardAntigo = (await get(`/quadros/${quadroId}`)).dados.cards.find((c) => c.id === antigo.dados.id);
ok(/só de manhã/.test(cardAntigo?.campos?.[campoTel] || ''), 'o card continua com o telefone completo (o espelho não encurta)');

titulo('Desligar');
await put(`/comercial/espelho/${quadroId}`, { ativo: false });
const c9 = await post('/cards', { coluna_id: col['Em prospecção'], titulo: 'Sem espelho ' + sufixo });
ok(c9.status === 201 && !c9.dados.comercial, 'com o espelho desligado, card novo não vira lead');
// fica desligado: os outros testes não devem criar cards neste quadro
