import { z } from 'zod';
import { query, pool } from '../config/database.js';
import { NaoEncontradoError, AppError, NaoAutorizadoError } from '../utils/errors.js';
import { registrarAcao } from '../utils/audit.js';
import { ehMembroDaEquipe } from './equipes.controller.js';
import { corSchema, presetSchema } from '../utils/kanban-visual.js';

/**
 * Quadros — Sprint 10.
 *
 * Quadro pertence a UMA equipe. Membros da equipe têm acesso de
 * leitura+escrita. Se `aberto_a_socios = true`, qualquer pessoa
 * autenticada lê o quadro (transparência), mas só membros editam.
 *
 * Ao criar quadro, geramos 3 colunas padrão ("A fazer", "Em andamento",
 * "Concluído") e 4 etiquetas básicas ("Urgente", "Bug", "Melhoria",
 * "Cliente"). O usuário pode editar ou apagar tudo depois.
 */

const criarSchema = z.object({
  equipe_id: z.string().uuid(),
  nome: z.string().min(2).max(100),
  descricao: z.string().max(2000).optional().nullable(),
  // Default é TRUE — alinha com a filosofia da ferramenta (transparência
  // pra sócios). Pra criar quadro privado, marca a flag explicitamente
  // como false.
  aberto_a_socios: z.boolean().default(true),
});

const atualizarSchema = z.object({
  nome: z.string().min(2).max(100).optional(),
  descricao: z.string().max(2000).optional().nullable(),
  aberto_a_socios: z.boolean().optional(),
  // Sprint 39 — fundo do quadro (cor solida OU preset de gradiente).
  fundo_cor: corSchema,
  fundo_preset: presetSchema,
  // Trocar a equipe dona do quadro — quem decide quem PODE EDITAR (ver
  // podeVerQuadro). Card nenhum se mexe: título, checklist, campo
  // personalizado, etiqueta, tudo continua exatamente onde estava. É só
  // "quem manda aqui" que muda.
  equipe_id: z.string().uuid().optional(),
});

/**
 * Verifica se a pessoa pode VER o quadro:
 *   - Admin do sistema sempre vê
 *   - Membro da equipe sempre vê
 *   - Qualquer autenticado vê se aberto_a_socios = true
 */
export async function podeVerQuadro(pessoaId, isAdmin, quadroId) {
  if (isAdmin) return { pode: true, podeEditar: true };
  const { rows } = await query(
    `SELECT q.aberto_a_socios,
            EXISTS (SELECT 1 FROM equipes_membros m
                     WHERE m.equipe_id = q.equipe_id AND m.pessoa_id = $1) AS eh_membro
       FROM quadros q
      WHERE q.id = $2 AND q.arquivado_em IS NULL`,
    [pessoaId, quadroId],
  );
  if (!rows[0]) return { pode: false, podeEditar: false };
  const ehMembro = rows[0].eh_membro;
  const aberto = rows[0].aberto_a_socios;
  return { pode: ehMembro || aberto, podeEditar: ehMembro };
}

function serializar(q) {
  return {
    id: q.id,
    equipe_id: q.equipe_id,
    equipe_nome: q.equipe_nome,
    equipe_cor: q.equipe_cor,
    nome: q.nome,
    descricao: q.descricao,
    aberto_a_socios: q.aberto_a_socios,
    fundo_cor: q.fundo_cor ?? null,
    fundo_preset: q.fundo_preset ?? null,
    arquivado: !!q.arquivado_em,
    arquivado_em: q.arquivado_em,
    criado_em: q.criado_em,
    atualizado_em: q.atualizado_em,
    qtd_cards: q.qtd_cards != null ? Number(q.qtd_cards) : undefined,
    qtd_colunas: q.qtd_colunas != null ? Number(q.qtd_colunas) : undefined,
  };
}

const SELECT_BASE = `
  SELECT q.*,
         e.nome AS equipe_nome,
         e.cor  AS equipe_cor,
         (SELECT COUNT(*)::int FROM colunas c WHERE c.quadro_id = q.id AND c.arquivada_em IS NULL) AS qtd_colunas,
         (SELECT COUNT(*)::int FROM cards ca WHERE ca.quadro_id = q.id AND ca.arquivado_em IS NULL) AS qtd_cards
    FROM quadros q
    JOIN equipes e ON e.id = q.equipe_id
`;

// Colunas + selos de um card no formato consumido pelo board. Compartilhado
// entre obter() (lista do quadro inteiro) e montarCardDoQuadro() (um card so),
// usado no retorno de criar/editar pra o front mesclar o card no estado sem
// refazer a query pesada do quadro todo a cada acao.
const CARD_BOARD_SELECT = `
  SELECT c.id, c.coluna_id, c.quadro_id, c.titulo, c.descricao, c.data_prazo,
         c.data_inicio, c.prazo_concluido, c.capa_cor, c.capa_preset,
         c.responsavel_id, c.ordem, c.criado_em, c.atualizado_em,
         c.prioridade, c.estimativa_horas, c.pontos, c.card_pai_id,
         c.concluido_em, c.sprint_id, c.fluxo,
         p.nome AS responsavel_nome,
         p.email AS responsavel_email,
         (SELECT COUNT(*)::int FROM cards f
           WHERE f.card_pai_id = c.id AND f.arquivado_em IS NULL) AS n_subtarefas,
         (SELECT COUNT(*)::int FROM cards f
            JOIN colunas fc ON fc.id = f.coluna_id
           WHERE f.card_pai_id = c.id AND f.arquivado_em IS NULL
             AND fc.tipo = 'concluida') AS n_subtarefas_ok,
         (SELECT COUNT(*)::int
            FROM cards_dependencias d
            JOIN cards b ON b.id = d.depende_de_id
            JOIN colunas bc ON bc.id = b.coluna_id
           WHERE d.card_id = c.id AND b.arquivado_em IS NULL
             AND bc.tipo <> 'concluida') AS n_bloqueadores,
         (SELECT COUNT(*)::int FROM cards_dependencias d
           WHERE d.depende_de_id = c.id) AS n_bloqueia,
         (SELECT COUNT(*)::int FROM cards_vinculos v WHERE v.card_id = c.id) AS n_vinculos,
         (SELECT COALESCE(SUM(a.minutos), 0)::int FROM cards_apontamentos a
           WHERE a.card_id = c.id) AS minutos_apontados,
         COALESCE(
           (SELECT json_object_agg(cv.campo_id, cv.valor)
              FROM cards_campos_valores cv WHERE cv.card_id = c.id),
           '{}'::json
         ) AS campos,
         (SELECT COUNT(*)::int FROM card_checklist_itens ci WHERE ci.card_id = c.id) AS n_checklist_total,
         (SELECT COUNT(*)::int FROM card_checklist_itens ci WHERE ci.card_id = c.id AND ci.concluido) AS n_checklist_concluido,
         (SELECT COUNT(*)::int FROM card_comentarios cm WHERE cm.card_id = c.id) AS n_comentarios,
         (SELECT COUNT(*)::int FROM card_anexos cax WHERE cax.card_id = c.id) AS n_anexos,
         COALESCE(
           (SELECT json_agg(ce.etiqueta_id) FROM cards_etiquetas ce WHERE ce.card_id = c.id),
           '[]'::json
         ) AS etiqueta_ids,
         COALESCE(
           (SELECT json_agg(
                     json_build_object('id', pa.id, 'nome', pa.nome, 'email', pa.email)
                     ORDER BY cr.ordem, cr.adicionado_em
                   )
              FROM cards_responsaveis cr
              JOIN pessoas_acesso pa ON pa.id = cr.pessoa_id
             WHERE cr.card_id = c.id),
           '[]'::json
         ) AS responsaveis
    FROM cards c
    LEFT JOIN pessoas_acesso p ON p.id = c.responsavel_id
`;

// Normaliza o card cru do banco pro shape que o board espera.
function mapearCardBoard(c) {
  return {
    ...c,
    etiqueta_ids: c.etiqueta_ids || [],
    responsaveis: c.responsaveis || [],
    campos: c.campos || {},
    estimativa_horas: c.estimativa_horas != null ? Number(c.estimativa_horas) : null,
    bloqueado: (c.n_bloqueadores || 0) > 0,
  };
}

/**
 * Devolve UM card no mesmo formato do board (com selos). Usado pelo
 * controller de cards no retorno de criar/editar, pra o front mesclar
 * localmente sem refazer GET /quadros/:id.
 */
export async function montarCardDoQuadro(cardId) {
  const r = await query(`${CARD_BOARD_SELECT} WHERE c.id = $1`, [cardId]);
  return r.rows[0] ? mapearCardBoard(r.rows[0]) : null;
}

/**
 * GET /api/quadros
 *
 * Lista quadros visíveis pra pessoa logada:
 *   - Admin: todos
 *   - Outros: equipes onde é membro + quadros abertos a sócios
 *
 * ?equipe_id filtra por equipe específica.
 */
export async function listar(req, res, next) {
  try {
    const isAdmin = !!req.pessoa?.administrador;
    const partes = [`q.arquivado_em IS NULL`];
    const params = [];

    if (!isAdmin) {
      params.push(req.pessoa.id);
      partes.push(`(
        EXISTS (SELECT 1 FROM equipes_membros m
                 WHERE m.equipe_id = q.equipe_id AND m.pessoa_id = $${params.length})
        OR q.aberto_a_socios = TRUE
      )`);
    }

    if (req.query.equipe_id) {
      params.push(req.query.equipe_id);
      partes.push(`q.equipe_id = $${params.length}`);
    }

    const where = `WHERE ${partes.join(' AND ')}`;
    const { rows } = await query(
      `${SELECT_BASE} ${where} ORDER BY e.nome, q.nome`,
      params,
    );
    res.json(rows.map(serializar));
  } catch (err) { next(err); }
}

/**
 * GET /api/quadros/:id
 * Devolve quadro + colunas + cards + etiquetas, tudo num payload só.
 * O frontend monta o board a partir disso.
 */
export async function obter(req, res, next) {
  try {
    const isAdmin = !!req.pessoa?.administrador;
    const { pode, podeEditar } = await podeVerQuadro(req.pessoa.id, isAdmin, req.params.id);
    if (!pode) throw new NaoAutorizadoError('Você não tem acesso a este quadro.');

    const qR = await query(`${SELECT_BASE} WHERE q.id = $1`, [req.params.id]);
    if (!qR.rows[0]) throw new NaoEncontradoError('Quadro não encontrado');

    const [colR, cardsR, etiqR, camposR] = await Promise.all([
      query(
        `SELECT id, nome, ordem, criado_em,
                tipo, wip_limite, cor,
                (SELECT COUNT(*)::int FROM cards ca
                  WHERE ca.coluna_id = colunas.id AND ca.arquivado_em IS NULL) AS n_cards
           FROM colunas
          WHERE quadro_id = $1 AND arquivada_em IS NULL
          ORDER BY ordem, criado_em`,
        [req.params.id],
      ),
      query(
        `${CARD_BOARD_SELECT}
          WHERE c.quadro_id = $1 AND c.arquivado_em IS NULL
          ORDER BY c.ordem, c.criado_em`,
        [req.params.id],
      ),
      query(
        `SELECT id, nome, cor, ordem
           FROM quadros_etiquetas
          WHERE quadro_id = $1
          ORDER BY ordem, nome`,
        [req.params.id],
      ),
      // Sprint 34 — definições dos campos personalizados do quadro
      query(
        `SELECT id, nome, tipo, opcoes, mostrar_no_card, ordem
           FROM quadros_campos
          WHERE quadro_id = $1
          ORDER BY ordem, nome`,
        [req.params.id],
      ),
    ]);

    res.json({
      ...serializar(qR.rows[0]),
      pode_editar: podeEditar,
      colunas: colR.rows,
      cards: cardsR.rows.map(mapearCardBoard),
      etiquetas: etiqR.rows,
      campos: camposR.rows,
    });
  } catch (err) { next(err); }
}

/**
 * POST /api/quadros (membro da equipe ou admin)
 * Cria o quadro e popula colunas/etiquetas padrão.
 */
export async function criar(req, res, next) {
  const client = await pool.connect();
  try {
    const d = criarSchema.parse(req.body);
    const isAdmin = !!req.pessoa?.administrador;

    const ehMembro = await ehMembroDaEquipe(req.pessoa.id, isAdmin, d.equipe_id);
    if (!ehMembro) {
      throw new NaoAutorizadoError('Você precisa ser membro da equipe pra criar quadros nela.');
    }

    await client.query('BEGIN');

    // Confere que a equipe existe e está ativa
    const eR = await client.query(
      `SELECT id, arquivada_em FROM equipes WHERE id = $1`,
      [d.equipe_id],
    );
    if (!eR.rows[0]) throw new NaoEncontradoError('Equipe não encontrada');
    if (eR.rows[0].arquivada_em) throw new AppError('Equipe está arquivada', 400);

    const { rows } = await client.query(
      `INSERT INTO quadros (equipe_id, nome, descricao, aberto_a_socios, criado_por_id)
       VALUES ($1, $2, $3, $4, $5) RETURNING id`,
      [d.equipe_id, d.nome.trim(), d.descricao?.trim() || null, d.aberto_a_socios, req.pessoa.id],
    );
    const quadroId = rows[0].id;

    // Colunas padrão — Sprint 34: já nascem com o TIPO certo, pra que as
    // métricas (cycle time, CFD) e o gate de dependências funcionem sem
    // nenhuma configuração manual.
    const colunasPadrao = [
      { nome: 'A fazer', ordem: 1000, tipo: 'backlog' },
      { nome: 'Em andamento', ordem: 2000, tipo: 'em_andamento' },
      { nome: 'Concluído', ordem: 3000, tipo: 'concluida' },
    ];
    for (const c of colunasPadrao) {
      await client.query(
        `INSERT INTO colunas (quadro_id, nome, ordem, tipo) VALUES ($1, $2, $3, $4)`,
        [quadroId, c.nome, c.ordem, c.tipo],
      );
    }

    // Etiquetas padrão
    const etiquetasPadrao = [
      { nome: 'Urgente', cor: 'red', ordem: 1 },
      { nome: 'Bug', cor: 'orange', ordem: 2 },
      { nome: 'Melhoria', cor: 'emerald', ordem: 3 },
      { nome: 'Cliente', cor: 'blue', ordem: 4 },
    ];
    for (const e of etiquetasPadrao) {
      await client.query(
        `INSERT INTO quadros_etiquetas (quadro_id, nome, cor, ordem)
         VALUES ($1, $2, $3, $4)`,
        [quadroId, e.nome, e.cor, e.ordem],
      );
    }

    await client.query('COMMIT');

    registrarAcao({
      acao: 'quadro.criou',
      pessoa_acesso_id: req.pessoa.id,
      detalhes: { quadro_id: quadroId, equipe_id: d.equipe_id, nome: d.nome },
      req,
    });

    const final = await query(`${SELECT_BASE} WHERE q.id = $1`, [quadroId]);
    res.status(201).json(serializar(final.rows[0]));
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    next(err);
  } finally {
    client.release();
  }
}

/**
 * PUT /api/quadros/:id (membro da equipe)
 */
export async function atualizar(req, res, next) {
  try {
    const isAdmin = !!req.pessoa?.administrador;
    const { podeEditar } = await podeVerQuadro(req.pessoa.id, isAdmin, req.params.id);
    if (!podeEditar) throw new NaoAutorizadoError('Sem permissão pra editar este quadro.');

    const d = atualizarSchema.parse(req.body);

    // Trocar a equipe dona é mudar quem pode editar — mais sensível que
    // renomear ou trocar a cor de fundo. Só admin, e a equipe destino
    // precisa existir e não estar arquivada.
    if (d.equipe_id !== undefined) {
      if (!isAdmin) {
        throw new NaoAutorizadoError('Só administradores podem trocar a equipe dona do quadro.');
      }
      const eq = await query(
        'SELECT id, arquivada_em FROM equipes WHERE id = $1', [d.equipe_id],
      );
      if (!eq.rows[0]) throw new AppError('Equipe de destino não encontrada.', 400);
      if (eq.rows[0].arquivada_em) throw new AppError('Equipe de destino está arquivada.', 400);
    }

    const updates = [];
    const params = [];
    for (const [k, v] of Object.entries(d)) {
      if (v === undefined) continue;
      params.push(typeof v === 'string' ? v.trim() : v);
      updates.push(`${k} = $${params.length}`);
    }
    if (updates.length === 0) {
      const r = await query(`${SELECT_BASE} WHERE q.id = $1`, [req.params.id]);
      if (!r.rows[0]) throw new NaoEncontradoError('Quadro não encontrado');
      return res.json(serializar(r.rows[0]));
    }

    params.push(req.params.id);
    const { rowCount } = await query(
      `UPDATE quadros SET ${updates.join(', ')} WHERE id = $${params.length}`,
      params,
    );
    if (rowCount === 0) throw new NaoEncontradoError('Quadro não encontrado');

    registrarAcao({
      acao: 'quadro.editou',
      pessoa_acesso_id: req.pessoa.id,
      detalhes: { quadro_id: req.params.id, campos: Object.keys(d) },
      req,
    });

    const r = await query(`${SELECT_BASE} WHERE q.id = $1`, [req.params.id]);
    res.json(serializar(r.rows[0]));
  } catch (err) { next(err); }
}

/**
 * POST /api/quadros/:id/arquivar (membro da equipe)
 */
export async function arquivar(req, res, next) {
  try {
    const isAdmin = !!req.pessoa?.administrador;
    const { podeEditar } = await podeVerQuadro(req.pessoa.id, isAdmin, req.params.id);
    if (!podeEditar) throw new NaoAutorizadoError('Sem permissão.');

    const { rowCount } = await query(
      `UPDATE quadros SET arquivado_em = NOW()
        WHERE id = $1 AND arquivado_em IS NULL`,
      [req.params.id],
    );
    if (rowCount === 0) throw new AppError('Quadro não encontrado ou já arquivado.', 400);

    registrarAcao({
      acao: 'quadro.arquivou',
      pessoa_acesso_id: req.pessoa.id,
      detalhes: { quadro_id: req.params.id },
      req,
    });

    res.status(204).send();
  } catch (err) { next(err); }
}

// =============================================================================
// Etiquetas do quadro
// =============================================================================

const etiquetaSchema = z.object({
  nome: z.string().min(1).max(50),
  cor: z.enum([
    'slate', 'red', 'orange', 'amber', 'yellow', 'lime', 'emerald',
    'teal', 'cyan', 'blue', 'indigo', 'violet', 'fuchsia', 'pink', 'rose',
  ]).default('slate'),
});

export async function criarEtiqueta(req, res, next) {
  try {
    const isAdmin = !!req.pessoa?.administrador;
    const { podeEditar } = await podeVerQuadro(req.pessoa.id, isAdmin, req.params.id);
    if (!podeEditar) throw new NaoAutorizadoError('Sem permissão.');

    const d = etiquetaSchema.parse(req.body);

    const { rows: ord } = await query(
      `SELECT COALESCE(MAX(ordem), 0) + 1 AS prox FROM quadros_etiquetas WHERE quadro_id = $1`,
      [req.params.id],
    );

    try {
      const { rows } = await query(
        `INSERT INTO quadros_etiquetas (quadro_id, nome, cor, ordem)
         VALUES ($1, $2, $3, $4) RETURNING id, nome, cor, ordem`,
        [req.params.id, d.nome.trim(), d.cor, ord[0].prox],
      );
      res.status(201).json(rows[0]);
    } catch (err) {
      if (err.code === '23505') {
        throw new AppError('Já existe uma etiqueta com esse nome neste quadro.', 400);
      }
      throw err;
    }
  } catch (err) { next(err); }
}

export async function atualizarEtiqueta(req, res, next) {
  try {
    const isAdmin = !!req.pessoa?.administrador;
    const { podeEditar } = await podeVerQuadro(req.pessoa.id, isAdmin, req.params.id);
    if (!podeEditar) throw new NaoAutorizadoError('Sem permissão.');

    const d = etiquetaSchema.partial().parse(req.body);
    const updates = [];
    const params = [];
    for (const [k, v] of Object.entries(d)) {
      if (v === undefined) continue;
      params.push(typeof v === 'string' ? v.trim() : v);
      updates.push(`${k} = $${params.length}`);
    }
    if (updates.length === 0) {
      return res.json({ ok: true });
    }
    params.push(req.params.etiquetaId, req.params.id);
    const { rowCount } = await query(
      `UPDATE quadros_etiquetas SET ${updates.join(', ')}
        WHERE id = $${params.length - 1} AND quadro_id = $${params.length}`,
      params,
    );
    if (rowCount === 0) throw new NaoEncontradoError('Etiqueta não encontrada');
    res.json({ ok: true });
  } catch (err) { next(err); }
}

export async function excluirEtiqueta(req, res, next) {
  try {
    const isAdmin = !!req.pessoa?.administrador;
    const { podeEditar } = await podeVerQuadro(req.pessoa.id, isAdmin, req.params.id);
    if (!podeEditar) throw new NaoAutorizadoError('Sem permissão.');

    const { rowCount } = await query(
      `DELETE FROM quadros_etiquetas WHERE id = $1 AND quadro_id = $2`,
      [req.params.etiquetaId, req.params.id],
    );
    if (rowCount === 0) throw new NaoEncontradoError('Etiqueta não encontrada');
    res.status(204).send();
  } catch (err) { next(err); }
}
