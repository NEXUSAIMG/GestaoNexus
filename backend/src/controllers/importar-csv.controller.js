import { promises as fs } from 'node:fs';
import { pool, query } from '../config/database.js';
import { NaoEncontradoError, AppError, NaoAutorizadoError } from '../utils/errors.js';
import { registrarAcao } from '../utils/audit.js';
import { ehMembroDaEquipe } from './equipes.controller.js';
import { podeVerQuadro } from './quadros.controller.js';
import { publicarMudanca } from '../services/realtime.service.js';
import {
  parseCSV, indexarCabecalho, semAcento,
  colunasExtras, interpretarLinha, mapaCampos, chaveCampo,
} from '../utils/csv.js';

/**
 * Importador de planilha (CSV).
 *
 * Complementa o import do Trello: nem todo mundo vem do Trello, mas quase
 * todo mundo tem o backlog numa planilha.
 *
 * Duas rotas, de propósito:
 *   POST /quadros/importar-csv/previa  -> lê e devolve o que FARIA
 *   POST /quadros/importar-csv         -> grava
 *
 * A prévia é obrigatória na tela: importar para um quadro que já está em uso
 * é a operação com mais chance de sujar dado, e ver antes é o que separa
 * "importei errado" de "cancelei a tempo".
 *
 * Idempotente: card cujo título já existe no quadro (não arquivado) é
 * pulado. Rodar duas vezes não duplica — mesmo comportamento do importador
 * de linha de comando.
 *
 * Colunas que não são nenhum campo fixo do card (Título, Descrição,
 * Prioridade, Tipo, Etiquetas, Categoria, Cliente, Coluna, Responsável,
 * Prazo) casam com um *campo personalizado* do quadro (mesma tabela que
 * alimenta a Ficha de Cliente — Origem, Termômetro, Faturamento, Site,
 * etc., ver `FichaCliente.jsx`). Sem casar, a importação CRIA o campo na
 * hora (tipo texto) — funciona pra qualquer quadro escolhido no momento da
 * importação, sem exigir setup manual antes. O mesmo vale pra "Status
 * Atual"/"Coluna": valor que não é nenhuma coluna do Kanban vira uma coluna
 * nova. A prévia mostra o que vai ser criado antes de gravar — é a mesma
 * confirmação que já existe pra "cards que seriam pulados" etc.
 */

/** Colunas padrão de um quadro criado por este import — mesma lista usada
 * na tela. Compartilhada entre a prévia (pra saber contra o que casar
 * "Status Atual" quando o quadro ainda nem existe) e a gravação. */
const COLUNAS_PADRAO = [
  { nome: 'A fazer', ordem: 1000, tipo: 'backlog' },
  { nome: 'Em andamento', ordem: 2000, tipo: 'em_andamento' },
  { nome: 'Concluído', ordem: 3000, tipo: 'concluida' },
];

/** Nome de campo/coluna pronto pra virar registro: cabeçalho de planilha
 * do Sheets vem às vezes com quebra de linha manual dentro da célula do
 * título ("Representante /Oficial\n(Cargo / Função)") — sem limpar isso
 * vira um nome de campo esquisito no quadro. */
function limparNome(nome, tamanho = 60) {
  return String(nome).replace(/\s+/g, ' ').trim().slice(0, tamanho);
}

/**
 * Valores distintos de uma coluna do corpo do CSV, na ordem em que
 * aparecem primeiro. Serve tanto pra saber se uma coluna extra tem algo
 * pra importar (lista não vazia) quanto pra listar os estágios do
 * "Status Atual" que ainda não são coluna do quadro.
 */
function valoresDistintos(linhas, indice) {
  if (indice < 0) return [];
  const vistos = new Set();
  const ordem = [];
  for (const linha of linhas) {
    const v = linha[indice] != null ? String(linha[indice]).trim() : '';
    if (v && !vistos.has(v)) { vistos.add(v); ordem.push(v); }
  }
  return ordem;
}

/**
 * Tipo de uma coluna do Kanban criada automaticamente a partir de um
 * estágio de funil ("Status Atual" etc.) que a planilha trouxe e o quadro
 * ainda não tinha.
 *
 * ponytail: heurística ingênua por palavra-chave — cobre os nomes óbvios
 * de estágio terminal (ativado/ganho/perdido/desistência); o resto nasce
 * "em_andamento" e o tipo dá pra corrigir na tela de colunas depois. Um
 * "Status" sem nenhuma dessas palavras não tem como saber se é início,
 * meio ou fim só pelo nome.
 */
function tipoColunaAuto(nome) {
  const n = semAcento(nome);
  if (/ativad|ganh|convert|fechad|perdid|negativ|desist|cancel|recus/.test(n)) return 'concluida';
  return 'em_andamento';
}

/** Lê o arquivo do multer e devolve as linhas + o mapa de colunas. */
async function lerPlanilha(arquivo) {
  const texto = await fs.readFile(arquivo.path, 'utf8');
  const { linhas, delimitador } = parseCSV(texto);

  if (linhas.length < 2) {
    throw new AppError(
      'A planilha precisa de uma linha de cabeçalho e pelo menos uma linha de dados.',
      400,
    );
  }

  const cabecalho = linhas[0];
  const col = indexarCabecalho(cabecalho);

  if (col.titulo < 0) {
    throw new AppError(
      'Não achei a coluna do título. A planilha precisa de uma coluna chamada '
      + '"Titulo" (ou "Card", "Nome", "Tarefa").',
      400,
    );
  }

  return {
    cabecalho, col, corpo: linhas.slice(1), delimitador, extras: colunasExtras(cabecalho, col),
  };
}

/**
 * Confere permissão e resolve o destino: quadro existente ou novo.
 * Não grava nada — serve tanto para a prévia quanto para o import.
 */
async function resolverDestino(req, corpo) {
  const isAdmin = !!req.pessoa?.administrador;

  if (corpo.quadro_id) {
    const { pode, podeEditar } = await podeVerQuadro(req.pessoa.id, isAdmin, corpo.quadro_id);
    if (!pode) throw new NaoEncontradoError('Quadro não encontrado');
    if (!podeEditar) throw new NaoAutorizadoError('Sem permissão para escrever neste quadro.');

    const q = await query('SELECT id, nome, equipe_id FROM quadros WHERE id = $1', [corpo.quadro_id]);
    if (!q.rows[0]) throw new NaoEncontradoError('Quadro não encontrado');

    const colunas = await query(
      `SELECT id, nome, tipo, ordem FROM colunas
        WHERE quadro_id = $1 AND arquivada_em IS NULL ORDER BY ordem`,
      [corpo.quadro_id],
    );
    if (colunas.rows.length === 0) {
      throw new AppError('Este quadro não tem nenhuma coluna ativa para receber os cards.', 400);
    }
    const campos = await query(
      'SELECT id, nome, tipo, opcoes FROM quadros_campos WHERE quadro_id = $1',
      [corpo.quadro_id],
    );
    return {
      novo: false, quadro: q.rows[0], colunas: colunas.rows, campos: campos.rows,
    };
  }

  if (!corpo.equipe_id) {
    throw new AppError('Escolha a equipe (para criar um quadro) ou o quadro de destino.', 400);
  }
  const ehMembro = await ehMembroDaEquipe(req.pessoa.id, isAdmin, corpo.equipe_id);
  if (!ehMembro) {
    throw new NaoAutorizadoError('Você precisa ser membro da equipe pra criar quadros nela.');
  }
  const e = await query('SELECT id, arquivada_em FROM equipes WHERE id = $1', [corpo.equipe_id]);
  if (!e.rows[0]) throw new NaoEncontradoError('Equipe não encontrada');
  if (e.rows[0].arquivada_em) throw new AppError('Equipe está arquivada', 400);

  // Quadro novo nasce sem campo personalizado nenhum — nada pra casar ainda.
  return {
    novo: true, quadro: null, colunas: [], campos: [],
  };
}

/** Casa o valor da coluna "Coluna" da planilha com uma coluna do quadro. */
function acharColuna(colunas, nome, fallbackId) {
  if (nome) {
    const alvo = semAcento(nome);
    const achada = colunas.find((c) => semAcento(c.nome) === alvo);
    if (achada) return { id: achada.id, casou: true };
  }
  return { id: fallbackId, casou: false };
}

function colunaPadrao(colunas, colunaIdPedida) {
  if (colunaIdPedida) {
    const c = colunas.find((x) => x.id === colunaIdPedida);
    if (c) return c.id;
  }
  const backlog = colunas.find((c) => c.tipo === 'backlog');
  return (backlog || colunas[0]).id;
}

/**
 * POST /api/quadros/importar-csv/previa   (multipart: arquivo)
 *
 * Lê a planilha e devolve o que aconteceria, sem gravar: quantas linhas,
 * quais colunas foram reconhecidas, quais cards já existem (seriam pulados),
 * e as 10 primeiras linhas já interpretadas.
 */
export async function previaCsv(req, res, next) {
  try {
    if (!req.file) throw new AppError('Nenhum arquivo enviado.', 400);

    const {
      cabecalho, col, corpo: linhas, delimitador, extras,
    } = await lerPlanilha(req.file);
    const destino = await resolverDestino(req, req.body);
    const camposPorChave = mapaCampos(destino.campos);

    // Simula a auto-criação (a gravação de verdade faz o mesmo em
    // importarCsv): campo personalizado que a planilha pede e o quadro
    // ainda não tem entra no mapa com um id "novo:..." só pra prévia casar
    // igual vai casar depois de criado de verdade.
    const camposNovos = extras.filter(({ i, nome }) => (
      !camposPorChave.has(chaveCampo(nome)) && valoresDistintos(linhas, i).length > 0
    ));
    for (const { nome } of camposNovos) {
      camposPorChave.set(chaveCampo(nome), { id: 'novo:' + chaveCampo(nome), nome: limparNome(nome), tipo: 'texto' });
    }

    const itens = linhas.map((l) => interpretarLinha(l, col, extras, camposPorChave))
      .filter((c) => c.titulo);
    const semTitulo = linhas.length - itens.length;

    // Quais já existem no quadro de destino (seriam pulados)?
    let jaExistem = [];
    if (!destino.novo && itens.length) {
      const { rows } = await query(
        `SELECT lower(titulo) AS t FROM cards
          WHERE quadro_id = $1 AND arquivado_em IS NULL`,
        [destino.quadro.id],
      );
      const existentes = new Set(rows.map((r) => r.t));
      jaExistem = itens.filter((i) => existentes.has(i.titulo.toLowerCase())).map((i) => i.titulo);
    }

    const reconhecidas = Object.entries(col)
      .filter(([, i]) => i >= 0)
      .map(([nome, i]) => ({ campo: nome, coluna_do_arquivo: cabecalho[i] }));

    // Extras: casaram com campo personalizado que o quadro já tinha, viram
    // campo personalizado NOVO (criado na hora da importação de verdade),
    // viraram texto na descrição (algo deu errado ao converter o valor pro
    // tipo do campo), ou seguem genuinamente vazias (nada pra importar).
    const nomesCamposNovos = new Set(camposNovos.map((e) => e.nome));
    const camposPersonalizadosCasados = extras
      .filter(({ nome }) => camposPorChave.has(chaveCampo(nome)) && !nomesCamposNovos.has(nome))
      .map(({ nome }) => ({ campo: camposPorChave.get(chaveCampo(nome)).nome, coluna_do_arquivo: nome }));
    const camposPersonalizadosNovos = camposNovos
      .map(({ nome }) => ({ campo: limparNome(nome), coluna_do_arquivo: nome }));
    const nomesNaDescricao = new Set(itens.flatMap((i) => i.extras_na_descricao));
    const colunasParaDescricao = extras.map((e) => e.nome).filter((n) => nomesNaDescricao.has(n));
    const ignoradas = extras
      .map((e) => e.nome)
      .filter((n) => !camposPorChave.has(chaveCampo(n)) && !nomesNaDescricao.has(n));

    // "Status Atual" (ou equivalente): valor que não é nenhuma coluna do
    // quadro vira uma coluna nova do Kanban na importação de verdade — a
    // prévia simula isso pra mostrar o que vai ser criado. Quadro novo usa
    // a mesma lista padrão que será criada, pra prévia bater com o real.
    let colunasNovas = [];
    if (col.coluna >= 0) {
      const colunasBase = destino.novo ? COLUNAS_PADRAO : destino.colunas;
      colunasNovas = valoresDistintos(linhas, col.coluna)
        .filter((v) => !acharColuna(colunasBase, v, null).casou)
        .map((nome) => ({ nome: limparNome(nome), tipo: tipoColunaAuto(nome) }));
    }

    res.json({
      delimitador,
      total_linhas: linhas.length,
      cards_validos: itens.length,
      linhas_sem_titulo: semTitulo,
      ja_existem: jaExistem,
      colunas_reconhecidas: reconhecidas,
      campos_personalizados_casados: camposPersonalizadosCasados,
      campos_personalizados_novos: camposPersonalizadosNovos,
      colunas_para_descricao: colunasParaDescricao,
      colunas_ignoradas: ignoradas,
      colunas_novas: colunasNovas,
      etiquetas: [...new Set(itens.flatMap((i) => i.etiquetas))],
      destino: destino.novo
        ? { tipo: 'novo_quadro' }
        : { tipo: 'quadro_existente', nome: destino.quadro.nome, colunas: destino.colunas },
      amostra: itens.slice(0, 10),
    });
  } catch (err) {
    next(err);
  } finally {
    if (req.file) { try { await fs.unlink(req.file.path); } catch { /* já foi */ } }
  }
}

/**
 * POST /api/quadros/importar-csv   (multipart: arquivo + campos)
 *
 * Campos: equipe_id OU quadro_id, nome (quando cria), coluna_id (destino
 * padrão), aberto_a_socios.
 */
export async function importarCsv(req, res, next) {
  const client = await pool.connect();
  try {
    if (!req.file) throw new AppError('Nenhum arquivo enviado.', 400);

    const { cabecalho, col, corpo: linhas, extras } = await lerPlanilha(req.file);
    const destino = await resolverDestino(req, req.body);
    const camposPorChave = mapaCampos(destino.campos);

    await client.query('BEGIN');

    let quadroId;
    let colunas;

    if (destino.novo) {
      const nome = (String(req.body.nome || '').trim() || 'Importado de planilha').slice(0, 100);
      const { rows } = await client.query(
        `INSERT INTO quadros (equipe_id, nome, descricao, aberto_a_socios, criado_por_id)
         VALUES ($1, $2, $3, $4, $5) RETURNING id`,
        [
          req.body.equipe_id, nome, 'Importado de planilha CSV.',
          req.body.aberto_a_socios === 'false' ? false : true,
          req.pessoa.id,
        ],
      );
      quadroId = rows[0].id;

      // Mesmas colunas padrão de um quadro novo pela tela — assim o board
      // importado já nasce com as métricas funcionando.
      colunas = [];
      for (const c of COLUNAS_PADRAO) {
        const r = await client.query(
          `INSERT INTO colunas (quadro_id, nome, ordem, tipo) VALUES ($1, $2, $3, $4)
           RETURNING id, nome, tipo, ordem`,
          [quadroId, c.nome, c.ordem, c.tipo],
        );
        colunas.push(r.rows[0]);
      }
    } else {
      quadroId = destino.quadro.id;
      colunas = destino.colunas;
    }

    // Campo personalizado que a planilha pede e o quadro ainda não tem:
    // cria na hora (tipo texto). É o que faz a importação funcionar sempre,
    // pra qualquer quadro escolhido no momento, sem exigir que alguém tenha
    // configurado os campos antes (a prévia já mostrou que isso ia
    // acontecer — ver camposPersonalizadosNovos em previaCsv).
    let proximaOrdemCampo = camposPorChave.size;
    let camposCriados = 0;
    for (const { i, nome } of extras) {
      const chave = chaveCampo(nome);
      if (camposPorChave.has(chave)) continue;
      if (valoresDistintos(linhas, i).length === 0) continue;
      proximaOrdemCampo += 1;
      const { rows } = await client.query(
        `INSERT INTO quadros_campos (quadro_id, nome, tipo, ordem)
         VALUES ($1, $2, 'texto', $3) RETURNING id, nome, tipo, opcoes`,
        [quadroId, limparNome(nome), proximaOrdemCampo],
      );
      camposPorChave.set(chave, rows[0]);
      camposCriados += 1;
    }

    // Estágio de "Status Atual" (ou equivalente) que ainda não é coluna do
    // quadro: cria a coluna do Kanban na hora, mesma lógica.
    let colunasCriadas = 0;
    if (col.coluna >= 0) {
      let proximaOrdemColuna = colunas.reduce((m, c) => Math.max(m, c.ordem), 0);
      for (const valor of valoresDistintos(linhas, col.coluna)) {
        if (acharColuna(colunas, valor, null).casou) continue;
        proximaOrdemColuna += 1000;
        const { rows } = await client.query(
          `INSERT INTO colunas (quadro_id, nome, ordem, tipo) VALUES ($1, $2, $3, $4)
           RETURNING id, nome, tipo, ordem`,
          [quadroId, limparNome(valor), proximaOrdemColuna, tipoColunaAuto(valor)],
        );
        colunas.push(rows[0]);
        colunasCriadas += 1;
      }
    }

    const itens = linhas.map((l) => interpretarLinha(l, col, extras, camposPorChave))
      .filter((c) => c.titulo);
    if (itens.length === 0) {
      throw new AppError('Nenhuma linha da planilha tem título preenchido.', 400);
    }

    const fallbackId = colunaPadrao(colunas, req.body.coluna_id || null);
    const rotuloColuna = col.coluna >= 0 ? cabecalho[col.coluna] : null;

    // Etiquetas existentes do quadro, para reaproveitar em vez de duplicar.
    const etqR = await client.query(
      'SELECT id, nome FROM quadros_etiquetas WHERE quadro_id = $1', [quadroId],
    );
    const etiquetaPorNome = new Map(etqR.rows.map((e) => [semAcento(e.nome), e.id]));
    let proximaOrdemEtq = etqR.rows.length;

    async function idDaEtiqueta(nome) {
      const chave = semAcento(nome);
      if (etiquetaPorNome.has(chave)) return etiquetaPorNome.get(chave);
      proximaOrdemEtq += 1;
      const { rows } = await client.query(
        `INSERT INTO quadros_etiquetas (quadro_id, nome, cor, ordem)
         VALUES ($1, $2, 'slate', $3)
         ON CONFLICT (quadro_id, lower(nome)) DO UPDATE SET ordem = quadros_etiquetas.ordem
         RETURNING id`,
        [quadroId, nome, proximaOrdemEtq],
      );
      etiquetaPorNome.set(chave, rows[0].id);
      return rows[0].id;
    }

    // Títulos já existentes — o import é idempotente.
    const jaR = await client.query(
      `SELECT lower(titulo) AS t FROM cards WHERE quadro_id = $1 AND arquivado_em IS NULL`,
      [quadroId],
    );
    const existentes = new Set(jaR.rows.map((r) => r.t));

    // Pessoas, para casar a coluna "Responsável" por nome.
    const pessoasR = await client.query(
      'SELECT id, nome FROM pessoas_acesso WHERE ativo = TRUE',
    );
    const pessoaPorNome = new Map(pessoasR.rows.map((p) => [semAcento(p.nome), p.id]));

    const ordemPorColuna = {};
    for (const c of colunas) {
      const r = await client.query(
        `SELECT COALESCE(MAX(ordem), 0) AS m FROM cards
          WHERE coluna_id = $1 AND arquivado_em IS NULL`,
        [c.id],
      );
      ordemPorColuna[c.id] = Number(r.rows[0].m);
    }

    let criados = 0;
    let pulados = 0;
    let comResponsavel = 0;
    let camposPreenchidos = 0;
    let etiquetasCriadas = 0;
    const etiquetasAntes = etiquetaPorNome.size;

    for (const item of itens) {
      if (existentes.has(item.titulo.toLowerCase())) { pulados += 1; continue; }
      existentes.add(item.titulo.toLowerCase());

      const { id: colunaId, casou } = acharColuna(colunas, item.coluna, fallbackId);
      ordemPorColuna[colunaId] = (ordemPorColuna[colunaId] || 0) + 1000;

      // Não casou com coluna nenhuma do quadro: o card cai na coluna padrão
      // mesmo assim, mas o valor original (ex.: "Em prospecção") não pode
      // só desaparecer — vira mais uma linha na descrição.
      if (!casou && item.coluna && rotuloColuna) {
        item.descricao = ((item.descricao ? item.descricao + '\n\n' : '')
          + rotuloColuna + ': ' + item.coluna).slice(0, 20000);
      }

      const { rows } = await client.query(
        `INSERT INTO cards (coluna_id, quadro_id, titulo, descricao, data_prazo,
                            ordem, prioridade, estimativa_horas, coluna_desde, criado_por_id)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, NOW(), $9) RETURNING id`,
        [
          colunaId, quadroId, item.titulo, item.descricao, item.data_prazo,
          ordemPorColuna[colunaId], item.prioridade, item.estimativa_horas, req.pessoa.id,
        ],
      );
      const cardId = rows[0].id;
      criados += 1;

      for (const nomeEtq of item.etiquetas) {
        const eid = await idDaEtiqueta(nomeEtq);
        await client.query(
          `INSERT INTO cards_etiquetas (card_id, etiqueta_id) VALUES ($1, $2)
           ON CONFLICT DO NOTHING`,
          [cardId, eid],
        );
      }

      if (item.responsavel) {
        const pid = pessoaPorNome.get(semAcento(item.responsavel));
        if (pid) {
          // Grava na N:N (fonte de verdade); um gatilho espelha em
          // cards.responsavel_id.
          await client.query(
            `INSERT INTO cards_responsaveis (card_id, pessoa_id, ordem, adicionado_por_id)
             VALUES ($1, $2, 0, $3) ON CONFLICT (card_id, pessoa_id) DO NOTHING`,
            [cardId, pid, req.pessoa.id],
          );
          comResponsavel += 1;
        }
      }

      for (const [campoId, valor] of Object.entries(item.campos_valores)) {
        await client.query(
          `INSERT INTO cards_campos_valores (card_id, campo_id, valor, atualizado_em)
           VALUES ($1, $2, $3::jsonb, NOW())
           ON CONFLICT (card_id, campo_id) DO UPDATE SET valor = EXCLUDED.valor, atualizado_em = NOW()`,
          [cardId, campoId, JSON.stringify(valor)],
        );
        camposPreenchidos += 1;
      }
    }

    etiquetasCriadas = etiquetaPorNome.size - etiquetasAntes;

    await client.query('COMMIT');

    const contagem = {
      cards_criados: criados,
      cards_pulados: pulados,
      etiquetas_criadas: etiquetasCriadas,
      responsaveis: comResponsavel,
      campos_preenchidos: camposPreenchidos,
      campos_personalizados_criados: camposCriados,
      colunas_criadas: colunasCriadas,
    };

    registrarAcao({
      acao: 'quadro.importou_csv',
      pessoa_acesso_id: req.pessoa.id,
      detalhes: { quadro_id: quadroId, quadro_novo: destino.novo, ...contagem },
      req,
    });

    if (!destino.novo) publicarMudanca(quadroId, 'csv_importado');

    res.status(201).json({ quadro_id: quadroId, quadro_novo: destino.novo, ...contagem });
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    next(err);
  } finally {
    client.release();
    if (req.file) { try { await fs.unlink(req.file.path); } catch { /* já foi */ } }
  }
}
