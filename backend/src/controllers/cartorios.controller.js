import { z } from 'zod';
import { query, pool } from '../config/database.js';
import { NaoEncontradoError, AppError } from '../utils/errors.js';
import { registrarAcao } from '../utils/audit.js';

/**
 * Cartórios — Sprint 20.
 *
 * Entidade global do sistema, não pertence a equipe específica.
 * Qualquer pessoa logada pode listar, criar, editar (decisão 5 do usuário).
 *
 * Pode estar vinculado a múltiplos quadros simultaneamente, cada um com sua
 * "fase atual" (coluna). Habilita o item 1.5 da spec.
 *
 * Histórico estruturado:
 *   - 'nota' / 'contato' — registros do usuário (endpoint próprio)
 *   - 'mudanca_status' / 'mudanca_fase' — gerados automaticamente pelo
 *     controller, com `metadados` contendo {antes, depois}.
 *
 * Convenção da query UPDATE dinâmica: concatenação de string em vez de
 * template literal pra evitar bug do "$$" em algumas ferramentas (ver
 * cards.controller.js e eventos-quadro.controller.js pra contexto).
 */

const tiposCartorio = ['notas', 'imoveis', 'protesto', 'civil', 'titulos_documentos', 'outro'];
const statusCartorio = ['ativo', 'em_implantacao', 'inativo'];

const criarSchema = z.object({
  nome: z.string().min(1).max(255),
  tipo: z.enum(tiposCartorio),
  cidade: z.string().max(100).optional().nullable(),
  uf: z.string().length(2).optional().nullable(),
  especificidades: z.string().max(10000).optional().nullable(),
  telefone: z.string().max(40).optional().nullable(),
  email: z.string().max(255).optional().nullable(),
  status: z.enum(statusCartorio).optional().default('em_implantacao'),
  responsavel_ids: z.array(z.string().uuid()).optional(),
  // Vínculos iniciais opcionais
  vinculos: z.array(z.object({
    quadro_id: z.string().uuid(),
    coluna_id: z.string().uuid().optional().nullable(),
  })).optional(),
});

// Pra atualizar: todos os campos opcionais. Mas vinculos NÃO pode vir aqui —
// vínculos são gerenciados por endpoints dedicados (vincularQuadro/desvincular).
const atualizarSchema = z.object({
  nome: z.string().min(1).max(255).optional(),
  tipo: z.enum(tiposCartorio).optional(),
  cidade: z.string().max(100).nullable().optional(),
  uf: z.string().length(2).nullable().optional(),
  especificidades: z.string().max(10000).nullable().optional(),
  telefone: z.string().max(40).nullable().optional(),
  email: z.string().max(255).nullable().optional(),
  status: z.enum(statusCartorio).optional(),
  responsavel_ids: z.array(z.string().uuid()).optional(),
});

const vincularQuadroSchema = z.object({
  quadro_id: z.string().uuid(),
  coluna_id: z.string().uuid().nullable().optional(),
});

const mudarFaseSchema = z.object({
  coluna_id: z.string().uuid().nullable(),
});

const criarAtualizacaoSchema = z.object({
  // Apenas 'nota' e 'contato' via API. As mudanças automáticas
  // ('mudanca_status', 'mudanca_fase') só são geradas pelos handlers.
  tipo: z.enum(['nota', 'contato']),
  texto: z.string().min(1).max(5000),
});

// =============================================================================
// SELECT_BASE — traz cartório + responsáveis + vínculos com quadros
// =============================================================================

const SELECT_BASE = `
  SELECT c.*,
         pcr.nome AS criado_por_nome,
         COALESCE(
           (SELECT json_agg(
                     json_build_object('id', pa.id, 'nome', pa.nome, 'email', pa.email)
                     ORDER BY cr.ordem, cr.adicionado_em
                   )
              FROM cartorios_responsaveis cr
              JOIN pessoas_acesso pa ON pa.id = cr.pessoa_id
             WHERE cr.cartorio_id = c.id),
           '[]'::json
         ) AS responsaveis,
         COALESCE(
           (SELECT json_agg(
                     json_build_object(
                       'quadro_id',   q.id,
                       'quadro_nome', q.nome,
                       'coluna_id',   col.id,
                       'coluna_nome', col.nome,
                       'vinculado_em', cq.vinculado_em
                     )
                     ORDER BY q.nome
                   )
              FROM cartorios_quadros cq
              JOIN quadros q ON q.id = cq.quadro_id AND q.arquivado_em IS NULL
              LEFT JOIN colunas col ON col.id = cq.coluna_id
             WHERE cq.cartorio_id = c.id),
           '[]'::json
         ) AS vinculos
    FROM cartorios c
    LEFT JOIN pessoas_acesso pcr ON pcr.id = c.criado_por_id
`;

function formatar(c) {
  return {
    id: c.id,
    nome: c.nome,
    tipo: c.tipo,
    cidade: c.cidade,
    uf: c.uf,
    especificidades: c.especificidades,
    telefone: c.telefone,
    email: c.email,
    status: c.status,
    arquivado: !!c.arquivado_em,
    arquivado_em: c.arquivado_em,
    criado_em: c.criado_em,
    atualizado_em: c.atualizado_em,
    criado_por_nome: c.criado_por_nome,
    responsaveis: c.responsaveis ?? [],
    vinculos: c.vinculos ?? [],
  };
}

// =============================================================================
// Helpers
// =============================================================================

async function validarPessoasAtivas(client, ids) {
  if (!ids?.length) return;
  const { rows } = await client.query(
    `SELECT id FROM pessoas_acesso WHERE id = ANY($1::uuid[]) AND ativo = TRUE`,
    [ids],
  );
  if (rows.length !== ids.length) {
    throw new AppError('Uma ou mais pessoas responsáveis não estão ativas.', 400);
  }
}

async function gravarResponsaveis(client, cartorioId, ids) {
  await client.query(
    `DELETE FROM cartorios_responsaveis WHERE cartorio_id = $1`,
    [cartorioId],
  );
  for (let i = 0; i < ids.length; i += 1) {
    await client.query(
      `INSERT INTO cartorios_responsaveis (cartorio_id, pessoa_id, ordem)
       VALUES ($1, $2, $3)`,
      [cartorioId, ids[i], i],
    );
  }
}

/**
 * Insere uma entrada no histórico. `metadados` é objeto JS (ou null) —
 * convertido pra JSON aqui.
 */
async function gravarAtualizacao(client, cartorioId, pessoaId, tipo, texto, metadados) {
  await client.query(
    `INSERT INTO cartorios_atualizacoes (cartorio_id, pessoa_id, tipo, texto, metadados)
     VALUES ($1, $2, $3, $4, $5)`,
    [cartorioId, pessoaId, tipo, texto, metadados ? JSON.stringify(metadados) : null],
  );
}

async function validarQuadroExiste(client, quadroId) {
  const { rows } = await client.query(
    `SELECT id FROM quadros WHERE id = $1 AND arquivado_em IS NULL`,
    [quadroId],
  );
  if (!rows[0]) throw new AppError('Quadro não encontrado ou arquivado.', 400);
}

async function validarColunaDoQuadro(client, colunaId, quadroId) {
  if (!colunaId) return; // null é válido (vínculo sem fase definida)
  const { rows } = await client.query(
    `SELECT id FROM colunas
      WHERE id = $1 AND quadro_id = $2 AND arquivada_em IS NULL`,
    [colunaId, quadroId],
  );
  if (!rows[0]) throw new AppError('Coluna não pertence ao quadro ou foi arquivada.', 400);
}

// =============================================================================
// CRUD principal
// =============================================================================

/**
 * GET /api/cartorios
 *
 * Filtros (todos opcionais):
 *   ?status=ativo|em_implantacao|inativo
 *   ?tipo=notas|imoveis|...
 *   ?busca=texto      (ILIKE em nome OU cidade)
 *   ?responsavel_id=uuid
 *   ?quadro_id=uuid   (cartórios vinculados a esse quadro)
 *   ?incluir_arquivados=true  (default: false)
 *
 * Ordem: ativos primeiro, depois por nome.
 */
export async function listar(req, res, next) {
  try {
    const partes = [];
    const params = [];

    if (req.query.incluir_arquivados !== 'true') {
      partes.push(`c.arquivado_em IS NULL`);
    }
    if (req.query.status) {
      params.push(req.query.status);
      partes.push(`c.status = $` + params.length);
    }
    if (req.query.tipo) {
      params.push(req.query.tipo);
      partes.push(`c.tipo = $` + params.length);
    }
    if (req.query.busca) {
      params.push(`%${req.query.busca}%`);
      const i = params.length;
      partes.push(`(c.nome ILIKE $` + i + ` OR c.cidade ILIKE $` + i + `)`);
    }
    if (req.query.responsavel_id) {
      params.push(req.query.responsavel_id);
      partes.push(
        `EXISTS (SELECT 1 FROM cartorios_responsaveis cr2
                 WHERE cr2.cartorio_id = c.id AND cr2.pessoa_id = $` + params.length + `)`,
      );
    }
    if (req.query.quadro_id) {
      params.push(req.query.quadro_id);
      partes.push(
        `EXISTS (SELECT 1 FROM cartorios_quadros cq2
                 WHERE cq2.cartorio_id = c.id AND cq2.quadro_id = $` + params.length + `)`,
      );
    }

    const where = partes.length > 0 ? 'WHERE ' + partes.join(' AND ') : '';

    const { rows } = await query(
      SELECT_BASE + ' ' + where
        + ` ORDER BY (c.status = 'ativo') DESC, c.nome ASC LIMIT 500`,
      params,
    );

    res.json(rows.map(formatar));
  } catch (err) { next(err); }
}

/**
 * GET /api/cartorios/:id
 * Retorna cartório completo + últimas 20 atualizações.
 */
export async function obter(req, res, next) {
  try {
    const { rows } = await query(SELECT_BASE + ' WHERE c.id = $1', [req.params.id]);
    if (!rows[0]) throw new NaoEncontradoError('Cartório não encontrado');

    // Últimas atualizações pra timeline da página de detalhe
    const { rows: atualizacoes } = await query(
      `SELECT a.*, p.nome AS pessoa_nome
         FROM cartorios_atualizacoes a
         LEFT JOIN pessoas_acesso p ON p.id = a.pessoa_id
        WHERE a.cartorio_id = $1
        ORDER BY a.criado_em DESC
        LIMIT 20`,
      [req.params.id],
    );

    res.json({
      ...formatar(rows[0]),
      atualizacoes_recentes: atualizacoes,
    });
  } catch (err) { next(err); }
}

/**
 * POST /api/cartorios
 */
export async function criar(req, res, next) {
  const client = await pool.connect();
  try {
    const d = criarSchema.parse(req.body);

    await client.query('BEGIN');

    const { rows } = await client.query(
      `INSERT INTO cartorios (
         nome, tipo, cidade, uf, especificidades, telefone, email,
         status, criado_por_id
       ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
       RETURNING id`,
      [
        d.nome.trim(), d.tipo,
        d.cidade?.trim() || null,
        d.uf?.trim().toUpperCase() || null,
        d.especificidades?.trim() || null,
        d.telefone?.trim() || null,
        d.email?.trim() || null,
        d.status,
        req.pessoa.id,
      ],
    );
    const cartorioId = rows[0].id;

    // Responsáveis (opcional)
    if (d.responsavel_ids?.length) {
      const ids = [...new Set(d.responsavel_ids)];
      await validarPessoasAtivas(client, ids);
      await gravarResponsaveis(client, cartorioId, ids);
    }

    // Vínculos iniciais com quadros (opcional)
    if (d.vinculos?.length) {
      for (const v of d.vinculos) {
        await validarQuadroExiste(client, v.quadro_id);
        await validarColunaDoQuadro(client, v.coluna_id, v.quadro_id);
        await client.query(
          `INSERT INTO cartorios_quadros (cartorio_id, quadro_id, coluna_id)
           VALUES ($1, $2, $3)
           ON CONFLICT (cartorio_id, quadro_id) DO UPDATE SET coluna_id = EXCLUDED.coluna_id`,
          [cartorioId, v.quadro_id, v.coluna_id || null],
        );
      }
    }

    await client.query('COMMIT');

    registrarAcao({
      acao: 'cartorio.criou',
      pessoa_acesso_id: req.pessoa.id,
      detalhes: { cartorio_id: cartorioId, nome: d.nome, tipo: d.tipo, status: d.status },
      req,
    });

    const final = await query(SELECT_BASE + ' WHERE c.id = $1', [cartorioId]);
    res.status(201).json(formatar(final.rows[0]));
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    next(err);
  } finally {
    client.release();
  }
}

/**
 * PUT /api/cartorios/:id
 * Loga automaticamente mudança de status no histórico.
 */
export async function atualizar(req, res, next) {
  const client = await pool.connect();
  try {
    // Pega estado atual (pra detectar mudanças)
    const atual = await query(
      `SELECT id, status FROM cartorios WHERE id = $1 AND arquivado_em IS NULL`,
      [req.params.id],
    );
    if (!atual.rows[0]) throw new NaoEncontradoError('Cartório não encontrado');

    const d = atualizarSchema.parse(req.body);

    await client.query('BEGIN');

    // UPDATE dinâmico — concatenação pra evitar bug do "$$" em ferramentas
    const updates = [];
    const params = [];
    for (const [k, v] of Object.entries(d)) {
      if (v === undefined) continue;
      if (k === 'responsavel_ids') continue; // N:N separado
      const valor = typeof v === 'string'
        ? (k === 'uf' ? v.trim().toUpperCase() : v.trim())
        : v;
      params.push(valor === '' ? null : valor);
      updates.push(k + ' = $' + params.length);
    }

    if (updates.length > 0) {
      updates.push('atualizado_em = now()');
      params.push(req.params.id);
      await client.query(
        'UPDATE cartorios SET ' + updates.join(', ') + ' WHERE id = $' + params.length,
        params,
      );
    }

    // Responsáveis: se veio, substitui o conjunto
    if (d.responsavel_ids !== undefined) {
      const ids = [...new Set(d.responsavel_ids)];
      await validarPessoasAtivas(client, ids);
      await gravarResponsaveis(client, req.params.id, ids);
    }

    // Histórico automático: se mudou status, grava
    if (d.status !== undefined && d.status !== atual.rows[0].status) {
      await gravarAtualizacao(
        client, req.params.id, req.pessoa.id,
        'mudanca_status', null,
        { antes: atual.rows[0].status, depois: d.status },
      );
    }

    await client.query('COMMIT');

    registrarAcao({
      acao: 'cartorio.editou',
      pessoa_acesso_id: req.pessoa.id,
      detalhes: { cartorio_id: req.params.id, campos: Object.keys(d) },
      req,
    });

    const final = await query(SELECT_BASE + ' WHERE c.id = $1', [req.params.id]);
    res.json(formatar(final.rows[0]));
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    next(err);
  } finally {
    client.release();
  }
}

/**
 * POST /api/cartorios/:id/arquivar
 */
export async function arquivar(req, res, next) {
  try {
    const { rowCount } = await query(
      `UPDATE cartorios SET arquivado_em = now()
        WHERE id = $1 AND arquivado_em IS NULL`,
      [req.params.id],
    );
    if (rowCount === 0) throw new AppError('Cartório não encontrado ou já arquivado.', 400);

    registrarAcao({
      acao: 'cartorio.arquivou',
      pessoa_acesso_id: req.pessoa.id,
      detalhes: { cartorio_id: req.params.id },
      req,
    });

    res.status(204).send();
  } catch (err) { next(err); }
}

// =============================================================================
// Vínculos com quadros
// =============================================================================

/**
 * POST /api/cartorios/:id/quadros
 * body: { quadro_id, coluna_id? }
 *
 * Cria vínculo OU atualiza coluna_id se já existe (UPSERT).
 * NÃO loga mudanca_fase aqui — o endpoint dedicado mudarFase faz isso.
 */
export async function vincularQuadro(req, res, next) {
  const client = await pool.connect();
  try {
    const d = vincularQuadroSchema.parse(req.body);

    // Confere que cartório existe
    const cR = await query(
      `SELECT id FROM cartorios WHERE id = $1 AND arquivado_em IS NULL`,
      [req.params.id],
    );
    if (!cR.rows[0]) throw new NaoEncontradoError('Cartório não encontrado');

    await client.query('BEGIN');
    await validarQuadroExiste(client, d.quadro_id);
    await validarColunaDoQuadro(client, d.coluna_id, d.quadro_id);

    await client.query(
      `INSERT INTO cartorios_quadros (cartorio_id, quadro_id, coluna_id)
       VALUES ($1, $2, $3)
       ON CONFLICT (cartorio_id, quadro_id) DO UPDATE SET coluna_id = EXCLUDED.coluna_id`,
      [req.params.id, d.quadro_id, d.coluna_id || null],
    );

    await client.query('COMMIT');

    registrarAcao({
      acao: 'cartorio.vinculou_quadro',
      pessoa_acesso_id: req.pessoa.id,
      detalhes: { cartorio_id: req.params.id, quadro_id: d.quadro_id, coluna_id: d.coluna_id },
      req,
    });

    res.json({ ok: true });
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    next(err);
  } finally {
    client.release();
  }
}

/**
 * DELETE /api/cartorios/:id/quadros/:quadroId
 */
export async function desvincularQuadro(req, res, next) {
  try {
    const { rowCount } = await query(
      `DELETE FROM cartorios_quadros WHERE cartorio_id = $1 AND quadro_id = $2`,
      [req.params.id, req.params.quadroId],
    );
    if (rowCount === 0) {
      throw new AppError('Vínculo não encontrado.', 400);
    }

    registrarAcao({
      acao: 'cartorio.desvinculou_quadro',
      pessoa_acesso_id: req.pessoa.id,
      detalhes: { cartorio_id: req.params.id, quadro_id: req.params.quadroId },
      req,
    });

    res.status(204).send();
  } catch (err) { next(err); }
}

/**
 * POST /api/cartorios/:id/quadros/:quadroId/mudar-fase
 * body: { coluna_id: uuid | null }
 *
 * Loga atualização tipo 'mudanca_fase' com metadados {quadro_id, antes, depois}.
 */
export async function mudarFase(req, res, next) {
  const client = await pool.connect();
  try {
    const d = mudarFaseSchema.parse(req.body);

    // Pega estado atual
    const atual = await query(
      `SELECT cq.coluna_id, col.nome AS coluna_nome
         FROM cartorios_quadros cq
         LEFT JOIN colunas col ON col.id = cq.coluna_id
        WHERE cq.cartorio_id = $1 AND cq.quadro_id = $2`,
      [req.params.id, req.params.quadroId],
    );
    if (!atual.rows[0]) {
      throw new AppError('Cartório não está vinculado a este quadro. Vincule primeiro.', 400);
    }
    const colunaAntes = atual.rows[0].coluna_id;
    const colunaAntesNome = atual.rows[0].coluna_nome;

    await client.query('BEGIN');
    await validarColunaDoQuadro(client, d.coluna_id, req.params.quadroId);

    await client.query(
      `UPDATE cartorios_quadros SET coluna_id = $1
        WHERE cartorio_id = $2 AND quadro_id = $3`,
      [d.coluna_id || null, req.params.id, req.params.quadroId],
    );

    // Pega nome nova coluna pro histórico (se aplicável)
    let colunaDepoisNome = null;
    if (d.coluna_id) {
      const { rows: cn } = await client.query(
        `SELECT nome FROM colunas WHERE id = $1`, [d.coluna_id],
      );
      colunaDepoisNome = cn[0]?.nome || null;
    }

    // Só loga se de fato mudou
    if (colunaAntes !== d.coluna_id) {
      await gravarAtualizacao(
        client, req.params.id, req.pessoa.id,
        'mudanca_fase', null,
        {
          quadro_id: req.params.quadroId,
          coluna_antes: colunaAntes,
          coluna_antes_nome: colunaAntesNome,
          coluna_depois: d.coluna_id || null,
          coluna_depois_nome: colunaDepoisNome,
        },
      );
    }

    await client.query('COMMIT');

    registrarAcao({
      acao: 'cartorio.mudou_fase',
      pessoa_acesso_id: req.pessoa.id,
      detalhes: {
        cartorio_id: req.params.id,
        quadro_id: req.params.quadroId,
        coluna_antes: colunaAntes,
        coluna_depois: d.coluna_id,
      },
      req,
    });

    res.json({ ok: true });
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    next(err);
  } finally {
    client.release();
  }
}

// =============================================================================
// Histórico
// =============================================================================

/**
 * GET /api/cartorios/:id/atualizacoes
 * Paginação simples: ?limite=50&offset=0
 */
export async function listarAtualizacoes(req, res, next) {
  try {
    const limite = Math.min(parseInt(req.query.limite, 10) || 50, 200);
    const offset = parseInt(req.query.offset, 10) || 0;

    const { rows } = await query(
      `SELECT a.*, p.nome AS pessoa_nome
         FROM cartorios_atualizacoes a
         LEFT JOIN pessoas_acesso p ON p.id = a.pessoa_id
        WHERE a.cartorio_id = $1
        ORDER BY a.criado_em DESC
        LIMIT $2 OFFSET $3`,
      [req.params.id, limite, offset],
    );

    res.json(rows);
  } catch (err) { next(err); }
}

// =============================================================================
// Sprint 24 — Item 1.5: listar cartórios de um quadro específico
// =============================================================================

/**
 * GET /api/quadros/:id/cartorios
 *
 * Lista cartórios vinculados a um quadro, com a coluna atual onde
 * cada um está posicionado. Pra renderizar na UI do kanban como uma
 * faixa de chips no topo de cada coluna.
 *
 * Retorna apenas cartórios não arquivados.
 */
export async function listarPorQuadro(req, res, next) {
  try {
    const { rows } = await query(
      `SELECT c.id, c.nome, c.tipo, c.status, c.cidade, c.uf,
              cq.coluna_id, cq.vinculado_em
         FROM cartorios_quadros cq
         JOIN cartorios c ON c.id = cq.cartorio_id
        WHERE cq.quadro_id = $1 AND c.arquivado_em IS NULL
        ORDER BY c.nome`,
      [req.params.id],
    );
    res.json(rows);
  } catch (err) { next(err); }
}

/**
 * POST /api/cartorios/:id/atualizacoes
 * Apenas 'nota' e 'contato' aceitos via API.
 */
export async function criarAtualizacao(req, res, next) {
  try {
    const d = criarAtualizacaoSchema.parse(req.body);

    // Confere que cartório existe
    const cR = await query(`SELECT id FROM cartorios WHERE id = $1`, [req.params.id]);
    if (!cR.rows[0]) throw new NaoEncontradoError('Cartório não encontrado');

    const client = await pool.connect();
    try {
      await gravarAtualizacao(client, req.params.id, req.pessoa.id, d.tipo, d.texto, null);
    } finally {
      client.release();
    }

    registrarAcao({
      acao: 'cartorio.atualizou_historico',
      pessoa_acesso_id: req.pessoa.id,
      detalhes: { cartorio_id: req.params.id, tipo: d.tipo },
      req,
    });

    res.status(201).json({ ok: true });
  } catch (err) { next(err); }
}
