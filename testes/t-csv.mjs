// Importação por planilha: prévia, criação, idempotência e casos chatos
// de CSV brasileiro (BOM, ponto e vírgula, acento, aspas).
import { login, post, get, equipeDeTeste, ok, titulo } from './api.mjs';

const BASE = 'http://localhost:3001/api';
const { token } = await login();
const equipe_id = await equipeDeTeste();

async function enviar(rota, csv, campos = {}, nomeArquivo = 'cards.csv') {
  const form = new FormData();
  form.append('arquivo', new Blob([csv], { type: 'text/csv' }), nomeArquivo);
  for (const [k, v] of Object.entries(campos)) form.append(k, String(v));
  const r = await fetch(BASE + rota, {
    method: 'POST', headers: { Authorization: `Bearer ${token}` }, body: form,
  });
  return { status: r.status, dados: await r.json().catch(() => null) };
}

// ---------------------------------------------------------------------------
titulo('Prévia — CSV com BOM, ponto e vírgula e acento (o do Excel brasileiro)');
const csvBr = '﻿'
  + 'Titulo;Descrição;Prioridade;Tipo;Estimativa_h;Coluna;Responsável;Prazo\n'
  + 'Migrar contrato do cartório;"Inclui revisão jurídica; prazo curto";Urgente;Bug;8;Em andamento;Admin Local;30/09/2026\n'
  + 'Revisar proposta;;Alta;Melhoria;3;A fazer;;2026-10-15\n'
  + 'Tarefa sem coluna conhecida;;Baixa;;1;Coluna Inexistente;;\n'
  + ';linha sem título;;;;;;\n';

const p1 = await enviar('/quadros/importar-csv/previa', csvBr, { equipe_id });
console.log('   →', p1.status, JSON.stringify({
  delim: p1.dados?.delimitador, validos: p1.dados?.cards_validos,
  semTitulo: p1.dados?.linhas_sem_titulo, etiquetas: p1.dados?.etiquetas,
}));
ok(p1.status === 200, 'prévia responde 200');
ok(p1.dados.delimitador === ';', 'detectou o separador ponto e vírgula');
ok(p1.dados.cards_validos === 3, '3 cards válidos');
ok(p1.dados.linhas_sem_titulo === 1, 'a linha sem título foi contada como descartada');
const am = p1.dados.amostra[0];
ok(am.titulo === 'Migrar contrato do cartório', 'acento no título preservado: ' + am.titulo);
ok(am.descricao.includes('revisão jurídica; prazo curto'),
  'ponto e vírgula dentro de aspas não quebrou o campo');
ok(am.prioridade === 0, '"Urgente" virou prioridade 0');
ok(am.estimativa_horas === 8, 'estimativa lida');
ok(am.data_prazo === '2026-09-30', 'data 30/09/2026 virou 2026-09-30');
ok(p1.dados.amostra[1].data_prazo === '2026-10-15', 'data já em ISO também funciona');
ok(p1.dados.etiquetas.includes('Bug') && p1.dados.etiquetas.includes('Melhoria'),
  'etiquetas extraídas de Tipo');
ok(p1.dados.colunas_novas.some((c) => c.nome === 'Coluna Inexistente'),
  'prévia avisa que "Coluna Inexistente" vai virar coluna nova do Kanban');
ok(p1.dados.campos_personalizados_novos.length === 0,
  'CSV só com campos fixos não propõe nenhum campo personalizado novo');

// ---------------------------------------------------------------------------
titulo('Importa criando quadro novo');
const imp = await enviar('/quadros/importar-csv', csvBr, {
  equipe_id, nome: 'Backlog importado ' + Date.now(),
});
console.log('   →', imp.status, JSON.stringify(imp.dados));
ok(imp.status === 201, 'import responde 201');
ok(imp.dados.cards_criados === 3, '3 cards criados');
ok(imp.dados.responsaveis === 1, 'o responsável que existe foi atribuído');
ok(imp.dados.colunas_criadas === 1, 'a coluna nova ("Coluna Inexistente") foi de fato criada');

const q = (await get('/quadros/' + imp.dados.quadro_id)).dados;
const porNome = Object.fromEntries(q.cards.map((c) => [c.titulo, c]));
const colPorId = Object.fromEntries(q.colunas.map((c) => [c.id, c.nome]));

ok(colPorId[porNome['Migrar contrato do cartório'].coluna_id] === 'Em andamento',
  'card foi para a coluna indicada na planilha');
ok(colPorId[porNome['Tarefa sem coluna conhecida'].coluna_id] === 'Coluna Inexistente',
  'coluna que não existia no quadro foi criada, card foi pra ela');
ok(porNome['Migrar contrato do cartório'].responsaveis.length === 1,
  'responsável aparece no board (gravado na N:N)');
ok(String(porNome['Migrar contrato do cartório'].data_prazo).startsWith('2026-09-30'),
  'prazo gravado');
ok((porNome['Migrar contrato do cartório'].etiqueta_ids || []).length === 1, 'etiqueta aplicada');

// ---------------------------------------------------------------------------
titulo('Rodar de novo não duplica');
const imp2 = await enviar('/quadros/importar-csv', csvBr, { quadro_id: imp.dados.quadro_id });
console.log('   →', imp2.status, JSON.stringify(imp2.dados));
ok(imp2.dados.cards_criados === 0, 'nenhum card novo');
ok(imp2.dados.cards_pulados === 3, 'os 3 foram pulados por já existirem');
const q2 = (await get('/quadros/' + imp.dados.quadro_id)).dados;
ok(q2.cards.length === 3, 'o quadro continua com 3 cards');

// ---------------------------------------------------------------------------
titulo('Prévia em quadro existente avisa o que já existe');
const p2 = await enviar('/quadros/importar-csv/previa', csvBr, { quadro_id: imp.dados.quadro_id });
ok(p2.dados.ja_existem.length === 3, 'prévia lista os 3 títulos que seriam pulados');
ok(p2.dados.colunas_novas.length === 0,
  '"Coluna Inexistente" já foi criada no import anterior — prévia não propõe de novo');

// ---------------------------------------------------------------------------
titulo('CSV com vírgula (formato internacional)');
const csvUs = 'Titulo,Prioridade,Tipo\nCorrigir login,Alta,Bug\nMelhorar dashboard,Média,Melhoria\n';
const p3 = await enviar('/quadros/importar-csv/previa', csvUs, { equipe_id });
ok(p3.dados.delimitador === ',', 'detectou o separador vírgula');
ok(p3.dados.cards_validos === 2, '2 cards válidos');

// ---------------------------------------------------------------------------
titulo('Erros com mensagem útil, não 500');
const semTitulo = await enviar('/quadros/importar-csv/previa', 'Coluna A,Coluna B\nx,y\n', { equipe_id });
console.log('   →', semTitulo.status, JSON.stringify(semTitulo.dados));
ok(semTitulo.status === 400, 'planilha sem coluna de título devolve 400');
ok(/T[ií]tulo/i.test(semTitulo.dados.erro), 'e a mensagem diz qual coluna falta');

const vazio = await enviar('/quadros/importar-csv/previa', 'Titulo\n', { equipe_id });
ok(vazio.status === 400, 'planilha só com cabeçalho devolve 400');

const semDestino = await enviar('/quadros/importar-csv/previa', csvUs, {});
ok(semDestino.status === 400, 'sem equipe nem quadro devolve 400');
