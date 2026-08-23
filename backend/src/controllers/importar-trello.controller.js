import crypto from 'node:crypto';
import { z } from 'zod';
import { pool, query } from '../config/database.js';
import { hashSenha } from '../utils/password.js';
import { NaoEncontradoError, AppError, NaoAutorizadoError } from '../utils/errors.js';
import { registrarAcao } from '../utils/audit.js';
import { ehMembroDaEquipe } from './equipes.controller.js';

/**
 * Sprint 38 — Importador do Trello.
 *
 * Recebe o JSON de export de um board do Trello (Menu → … → Print, export
 * and share → Export as JSON) e cria um quadro equivalente no Nexus:
 * listas → colunas, cards → cards, labels → etiquetas, checklists → checklists,
 * comentários → comentários.
 *
 * Isto mata a objeção de migração — o motivo nº1 de alguém não largar o
 * Trello é "já tenho tudo lá". Agora traz tudo em 1 upload.
 *
 * Robustez: o Trello exporta MUITO campo que não usamos. A gente só lê o que
 * conhece e ignora o resto com tolerância — um export de board gigante não
 * pode derrubar o import por causa de um campo inesperado.
 */

// Mapa das 10 cores do Trello para a nossa paleta de 15.
const COR_TRELLO = {
  green: 'emerald', yellow: 'yellow', orange: 'orange', red: 'red',
  purple: 'violet', blue: 'blue', sky: 'cyan', lime: 'lime',
  pink: 'pink', black: 'slate', null: 'slate',
};

// Validação leve: só exigimos que pareça um board do Trello.
const payloadSchema = z.object({
  equipe_id: z.string().uuid(),
  aberto_a_socios: z.boolean().optional().default(true),
  criar_membros_ausentes: z.boolean().optional().default(false),
  board: z.object({
    name: z.string().optional(),
    lists: z.array(z.any()).optional().default([]),
    cards: z.array(z.any()).optional().default([]),
    labels: z.array(z.any()).optional().default([]),
    checklists: z.array(z.any()).optional().default([]),
    actions: z.array(z.any()).optional().default([]),
    members: z.array(z.any()).optional().default([]),
  }),
});

function corDe(trelloColor) {
  return COR_TRELLO[trelloColor] || 'slate';
}

function classificarTipo(nome) {
  const n = String(nome || '').toLowerCase();
  if (/(a fazer|backlog|to ?do|ideias|entrada)/.test(n)) return 'backlog';
  if (/(conclu|feito|done|entregue|finaliz|pronto)/.test(n)) return 'concluida';
  return 'em_andamento';
}

export async function importarTrello(req, res, next) {
  const client = await pool.connect();
  try {
    const d = payloadSchema.parse(req.body);
    const isAdmin = !!req.pessoa?.administrador;

    const ehMembro = await ehMembroDaEquipe(req.pessoa.id, isAdmin, d.equipe_id);
    if (!ehMembro) {
      throw new NaoAutorizadoError('Você precisa ser membro da equipe pra importar quadros nela.');
    }

    const eR = await query('SELECT id, arquivada_em FROM equipes WHERE id = $1', [d.equipe_id]);
    if (!eR.rows[0]) throw new NaoEncontradoError('Equipe não encontrada');
    if (eR.rows[0].arquivada_em) throw new AppError('Equipe está arquivada', 400);

    const board = d.board;
    const nomeQuadro = (board.name || 'Importado do Trello').slice(0, 100);

    // Só listas não arquivadas, na ordem do Trello (campo `pos`).
    const listas = (board.lists || [])
      .filter((l) => !l.closed)
      .sort((a, b) => (a.pos || 0) - (b.pos || 0));

    if (listas.length === 0) {
      throw new AppError('O board do Trello não tem nenhuma lista ativa para importar.', 400);
    }

    await client.query('BEGIN');

    const { rows: qr } = await client.query(
      `INSERT INTO quadros (equipe_id, nome, descricao, aberto_a_socios, criado_por_id)
       VALUES ($1, $2, $3, $4, $5) RETURNING id`,
      [d.equipe_id, nomeQuadro, 'Importado do Trello.', d.aberto_a_socios, req.pessoa.id],
    );
    const quadroId = qr[0].id;

    const contagem = await importarConteudo(client, quadroId, board, listas, req.pessoa.id,
      { equipeId: d.equipe_id, criarMembrosAusentes: d.criar_membros_ausentes });

    await client.query('COMMIT');

    registrarAcao({
      acao: 'quadro.importou_trello',
      pessoa_acesso_id: req.pessoa.id,
      detalhes: { quadro_id: quadroId, ...contagem },
      req,
    });

    res.status(201).json({ quadro_id: quadroId, nome: nomeQuadro, ...contagem });
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    if (err instanceof z.ZodError) {
      return next(new AppError('Arquivo não parece um export de board do Trello.', 400));
    }
    next(err);
  } finally {
    client.release();
  }
}

/**
 * Faz o trabalho pesado dentro da transação já aberta.
 * Devolve as contagens para o log e a resposta.
 *
 * Exportado (alias `importarConteudoParaTeste`) para o teste ponta a ponta
 * exercitar o parser sem simular req/res.
 */
export { importarConteudo as importarConteudoParaTeste };

async function importarConteudo(client, quadroId, board, listas, pessoaId, opcoes = {}) {
  const { equipeId = null, criarMembrosAusentes = false } = opcoes;
  // ---- Etiquetas (labels do board) --------------------------------------
  // Trello permite label sem nome (só cor). Damos um nome pela cor pra não
  // criar etiqueta em branco.
  // O Trello aceita duas etiquetas de mesmo nome (cores diferentes), e uma
  // etiqueta sem nome vira "(cor)" — duas sem nome e da mesma cor colidem.
  // Aqui isso bate no índice único idx_quadros_etiquetas_nome.
  //
  // A versão anterior tentava se recuperar com try/catch, o que NÃO funciona
  // dentro de uma transação: o erro 23505 aborta a transação inteira e a
  // consulta do catch já falha com 25P02. Resolvemos de duas formas: as
  // homônimas são fundidas antes de gravar, e o INSERT usa ON CONFLICT para
  // nunca chegar a lançar erro.
  const mapaEtiqueta = {}; // trelloLabelId -> nossoId
  const idsPorNome = new Map(); // nome normalizado -> nossoId (funde homônimas)
  let ordemEtq = 0;
  for (const lb of (board.labels || [])) {
    const nome = ((lb.name && lb.name.trim()) || ('(' + (lb.color || 'sem cor') + ')')).slice(0, 50);
    const chave = nome.toLowerCase();

    if (idsPorNome.has(chave)) {
      mapaEtiqueta[lb.id] = idsPorNome.get(chave);
      continue;
    }

    ordemEtq += 1;
    const { rows } = await client.query(
      `INSERT INTO quadros_etiquetas (quadro_id, nome, cor, ordem)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (quadro_id, lower(nome)) DO UPDATE SET nome = EXCLUDED.nome
       RETURNING id`,
      [quadroId, nome, corDe(lb.color), ordemEtq],
    );
    mapaEtiqueta[lb.id] = rows[0].id;
    idsPorNome.set(chave, rows[0].id);
  }

  // ---- Membros do board -> pessoas do sistema ---------------------------
  // Casa por nome. Se nao existir e criarMembrosAusentes=true, cria conta
  // INATIVA (nao loga ate um admin ativar) e vincula a equipe como membro.
  const mapaMembroPessoa = {}; // trelloMemberId -> pessoas_acesso.id
  const nomeMembro = {};       // trelloMemberId -> fullName
  let nMembrosCriados = 0;
  for (const m of (board.members || [])) {
    const nome = String(m.fullName || m.username || '').trim();
    if (!nome) continue;
    nomeMembro[m.id] = nome;

    const porNome = await client.query(
      'SELECT id FROM pessoas_acesso WHERE lower(nome) = lower($1) LIMIT 1',
      [nome],
    );
    if (porNome.rows[0]) { mapaMembroPessoa[m.id] = porNome.rows[0].id; continue; }

    if (!criarMembrosAusentes || !equipeId) continue;

    const email = (String(m.username || nome.replace(/\s+/g, '.')).toLowerCase() + '@trello.import').slice(0, 255);
    const jaTem = await client.query(
      'SELECT id FROM pessoas_acesso WHERE lower(email) = lower($1) LIMIT 1',
      [email],
    );
    let pid;
    if (jaTem.rows[0]) {
      pid = jaTem.rows[0].id;
    } else {
      const senha = await hashSenha(crypto.randomBytes(24).toString('hex'));
      const ins = await client.query(
        `INSERT INTO pessoas_acesso (nome, email, senha_hash, administrador, ativo)
         VALUES ($1, $2, $3, FALSE, FALSE) RETURNING id`,
        [nome.slice(0, 255), email, senha],
      );
      pid = ins.rows[0].id;
      nMembrosCriados += 1;
    }
    await client.query(
      `INSERT INTO equipes_membros (equipe_id, pessoa_id, papel, adicionado_por_id)
       VALUES ($1, $2, 'membro', $3) ON CONFLICT (equipe_id, pessoa_id) DO NOTHING`,
      [equipeId, pid, pessoaId],
    );
    mapaMembroPessoa[m.id] = pid;
  }

  // ---- Colunas (lists) ---------------------------------------------------
  const mapaColuna = {}; // trelloListId -> nossoId
  let ordemCol = 0;
  for (const l of listas) {
    ordemCol += 1000;
    const { rows } = await client.query(
      `INSERT INTO colunas (quadro_id, nome, ordem, tipo) VALUES ($1, $2, $3, $4) RETURNING id`,
      [quadroId, String(l.name || 'Lista').slice(0, 80), ordemCol, classificarTipo(l.name)],
    );
    mapaColuna[l.id] = rows[0].id;
  }

  // ---- Checklists indexados por card ------------------------------------
  const checklistsPorCard = {};
  for (const ch of (board.checklists || [])) {
    if (!ch.idCard) continue;
    (checklistsPorCard[ch.idCard] ||= []).push(ch);
  }

  // ---- Comentários indexados por card (vêm em actions) ------------------
  const comentariosPorCard = {};
  for (const a of (board.actions || [])) {
    if (a.type !== 'commentCard') continue;
    const cid = a.data?.card?.id;
    const texto = a.data?.text;
    // Guardamos quem escreveu e quando: o comentário importado sem autor
    // aparecia como "Alguém" no card, perdendo justamente a informação que
    // faz um comentário antigo valer alguma coisa.
    if (cid && texto) {
      (comentariosPorCard[cid] ||= []).push({
        texto,
        autorTrelloId: a.idMemberCreator || null,
        em: a.date || null,
      });
    }
  }

  // ---- Cards -------------------------------------------------------------
  let nCards = 0; let nChecklists = 0; let nComentarios = 0;
  let nResp = 0; let nLinksAnexos = 0;
  const ordemPorColuna = {};

  const cards = (board.cards || [])
    .filter((c) => !c.closed && mapaColuna[c.idList])
    .sort((a, b) => (a.pos || 0) - (b.pos || 0));

  for (const c of cards) {
    const colunaId = mapaColuna[c.idList];
    ordemPorColuna[colunaId] = (ordemPorColuna[colunaId] || 0) + 1000;
    const tipoCol = classificarTipo(listaNome(listas, c.idList));

    const prazo = c.due ? String(c.due).slice(0, 10) : null;
    const concluido = tipoCol === 'concluida' || c.dueComplete === true;
    const iniciado = tipoCol !== 'backlog' || concluido;

    // Responsaveis = todos os membros (idMembers) que existem no sistema.
    //
    // A fonte de verdade e a tabela N:N cards_responsaveis (migracao 018) —
    // e o board le SO dela. Gravar apenas cards.responsavel_id, como a versao
    // anterior fazia, deixava o quadro abrir com todos os cards sem dono
    // enquanto o relatorio do import dizia que trouxe N responsaveis.
    // Um gatilho espelha o primeiro da N:N de volta em responsavel_id.
    const idMembros = c.idMembers || [];
    const responsaveisDoCard = [];
    for (const mid of idMembros) {
      const pid = mapaMembroPessoa[mid];
      if (pid && !responsaveisDoCard.includes(pid)) responsaveisDoCard.push(pid);
    }

    // Rodape com o que nao cabe em campo estruturado (nomes + anexos).
    const extras = [];
    const nomesResp = idMembros.map((mid) => nomeMembro[mid]).filter(Boolean);
    if (nomesResp.length) extras.push('Responsaveis (Trello): ' + nomesResp.join(', '));
    const anexos = (c.attachments || []).filter((a) => a && a.url);
    if (anexos.length) {
      extras.push('Anexos (Trello):');
      for (const a of anexos) extras.push('- ' + (String(a.name || '').trim() || a.url) + ': ' + a.url);
      nLinksAnexos += anexos.length;
    }
    let descricao = c.desc ? String(c.desc) : '';
    if (extras.length) descricao = (descricao ? descricao + '\n\n' : '') + '---\n' + extras.join('\n');
    descricao = descricao ? descricao.slice(0, 20000) : null;

    const { rows } = await client.query(
      `INSERT INTO cards (coluna_id, quadro_id, titulo, descricao, data_prazo, ordem,
                          coluna_desde, iniciado_em, concluido_em, criado_por_id)
       VALUES ($1, $2, $3, $4, $5, $6, NOW(), $7, $8, $9) RETURNING id`,
      [
        colunaId, quadroId,
        String(c.name || 'Card').slice(0, 255),
        descricao,
        prazo, ordemPorColuna[colunaId],
        iniciado ? new Date().toISOString() : null,
        concluido ? new Date().toISOString() : null,
        pessoaId,
      ],
    );
    const cardId = rows[0].id;
    nCards += 1;

    // Responsaveis na N:N (o gatilho espelha o primeiro em responsavel_id).
    let ordemResp = 0;
    for (const pid of responsaveisDoCard) {
      await client.query(
        `INSERT INTO cards_responsaveis (card_id, pessoa_id, ordem, adicionado_por_id)
         VALUES ($1, $2, $3, $4) ON CONFLICT (card_id, pessoa_id) DO NOTHING`,
        [cardId, pid, ordemResp, pessoaId],
      );
      ordemResp += 1;
      nResp += 1;
    }

    // etiquetas do card
    for (const lid of (c.idLabels || [])) {
      const eid = mapaEtiqueta[lid];
      if (eid) {
        await client.query(
          `INSERT INTO cards_etiquetas (card_id, etiqueta_id) VALUES ($1, $2)
           ON CONFLICT DO NOTHING`,
          [cardId, eid],
        );
      }
    }

    // checklists do card
    for (const ch of (checklistsPorCard[c.id] || [])) {
      const { rows: chkRows } = await client.query(
        `INSERT INTO card_checklists (card_id, titulo, criado_por_id)
         VALUES ($1, $2, $3) RETURNING id`,
        [cardId, String(ch.name || 'Checklist').slice(0, 120), pessoaId],
      );
      nChecklists += 1;
      const checklistId = chkRows[0].id;
      const itens = (ch.checkItems || []).sort((a, b) => (a.pos || 0) - (b.pos || 0));
      let oi = 0;
      for (const it of itens) {
        oi += 1;
        await client.query(
          `INSERT INTO card_checklist_itens (checklist_id, card_id, texto, concluido, ordem)
           VALUES ($1, $2, $3, $4, $5)`,
          [checklistId, cardId, String(it.name || '').slice(0, 500),
            it.state === 'complete', oi],
        );
      }
    }

    // comentários do card — preservando autor e data de origem
    for (const cm of (comentariosPorCard[c.id] || [])) {
      const autorId = cm.autorTrelloId ? (mapaMembroPessoa[cm.autorTrelloId] || null) : null;
      // Quando o autor não existe por aqui, o nome dele vai como assinatura no
      // texto — melhor do que um comentário órfão.
      const assinatura = (!autorId && cm.autorTrelloId && nomeMembro[cm.autorTrelloId])
        ? `\n\n— ${nomeMembro[cm.autorTrelloId]} (importado do Trello)`
        : '';
      const dataOriginal = cm.em && !Number.isNaN(Date.parse(cm.em)) ? cm.em : null;

      await client.query(
        `INSERT INTO card_comentarios (card_id, pessoa_id, texto, criado_em)
         VALUES ($1, $2, $3, COALESCE($4::timestamptz, NOW()))`,
        [cardId, autorId, (String(cm.texto) + assinatura).slice(0, 5000), dataOriginal],
      );
      nComentarios += 1;
    }
  }

  return {
    colunas: Object.keys(mapaColuna).length,
    etiquetas: Object.keys(mapaEtiqueta).length,
    cards: nCards,
    checklists: nChecklists,
    comentarios: nComentarios,
    responsaveis: nResp,
    links_anexos: nLinksAnexos,
    membros_criados: nMembrosCriados,
  };
}

function listaNome(listas, id) {
  return listas.find((l) => l.id === id)?.name || '';
}
