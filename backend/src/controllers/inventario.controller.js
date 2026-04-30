import { z } from 'zod';
import { pool, query } from '../config/database.js';
import { NaoEncontradoError, AppError } from '../utils/errors.js';
import { registrarAcao } from '../utils/audit.js';

/**
 * Inventário (Patrimônio) — Sprint 17.
 *
 * CRUD de itens físicos da empresa. Cada mudança relevante dispara um
 * registro em `inventario_movimentos` (histórico de auditoria).
 *
 * Visibilidade:
 *   - Todos autenticados leem (transparência)
 *   - Edita: só admin
 */

const dataIso = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Data deve estar em YYYY-MM-DD');

const STATUSES = [
  'em_uso', 'em_estoque', 'manutencao',
  'descartado', 'vendido', 'perdido',
];
const FORMAS_PAGAMENTO = [
  'cartao_credito', 'cartao_debito', 'pix',
  'boleto', 'transferencia', 'dinheiro', 'outro',
];

const criarSchema = z.object({
  nome: z.string().min(1).max(200),
  descricao: z.string().max(2000).optional().nullable(),
  categoria_id: z.string().uuid(),

  qtd: z.coerce.number().int().min(1).default(1),
  valor_unitario: z.coerce.number().min(0).default(0),

  // NF e aquisição
  nf_numero: z.string().max(50).optional().nullable(),
  nf_serie: z.string().max(20).optional().nullable(),
  nf_data: dataIso.optional().nullable(),
  nf_valor: z.coerce.number().min(0).optional().nullable(),
  fornecedor: z.string().max(200).optional().nullable(),
  data_aquisicao: dataIso.optional().nullable(),
  forma_pagamento: z.enum(FORMAS_PAGAMENTO).optional().nullable(),

  // Local e responsável
  localizacao: z.string().max(200).optional().nullable(),
  responsavel_id: z.string().uuid().optional().nullable(),

  // Status
  status: z.enum(STATUSES).default('em_uso'),

  // Garantia
  garantia_meses: z.coerce.number().int().min(0).max(600).optional().nullable(),

  // Identificação
  numero_serie: z.string().max(100).optional().nullable(),
  patrimonio_etiqueta: z.string().max(50).optional().nullable(),
});

const atualizarSchema = criarSchema.partial();

const transferirSchema = z.object({
  responsavel_id: z.string().uuid().optional().nullable(),
  localizacao: z.string().max(200).optional().nullable(),
  observacao: z.string().max(500).optional().nullable(),
});

const descartarSchema = z.object({
  status: z.enum(['descartado', 'vendido', 'perdido']),
  data_descarte: dataIso,
  motivo_descarte: z.string().min(3).max(1000),
});

// =============================================================================
// Helpers
// =============================================================================

/**
 * Calcula garantia_fim a partir de data_aquisicao + garantia_meses.
 * Retorna null se faltar algum dos dois.
 */
function calcularGarantiaFim(dataAquisicao, garantiaMeses) {
  if (!dataAquisicao || !garantiaMeses) return null;
  const d = new Date(`${String(dataAquisicao).slice(0, 10)}T12:00:00`);
  d.setMonth(d.getMonth() + Number(garantiaMeses));
  return d.toISOString().slice(0, 10);
}

function tratarVazios(d) {
  // Strings vazias viram null pra não persistir "" no banco
  const r = { ...d };
  for (const k of Object.keys(r)) {
    if (r[k] === '') r[k] = null;
  }
  return r;
}

// =============================================================================
// Endpoints — Listar
// =============================================================================

/**
 * GET /api/inventario
 *
 * Filtros opcionais via query:
 *   ?categoria_id=...  ?status=...  ?responsavel_id=...
 *   ?busca=texto  (busca em nome, descricao, codigo, numero_serie, patrimonio_etiqueta)
 *
 * Retorna agregações úteis pro card no topo da página:
 *   total_itens, valor_total, qtd_em_uso, qtd_manutencao, etc.
 *   (em endpoint separado /resumo).
 */
export async function listar(req, res, next) {
  try {
    const partes = [];
    const params = [];

    if (req.query.categoria_id) {
      params.push(req.query.categoria_id);
      partes.push(`i.categoria_id = $${params.length}`);
    }
    if (req.query.status && STATUSES.includes(req.query.status)) {
      params.push(req.query.status);
      partes.push(`i.status = $${params.length}`);
    }
    if (req.query.responsavel_id) {
      params.push(req.query.responsavel_id);
      partes.push(`i.responsavel_id = $${params.length}`);
    }
    if (req.query.busca) {
      params.push(`%${req.query.busca}%`);
      const idx = params.length;
      partes.push(`(
        i.nome ILIKE $${idx}
        OR i.descricao ILIKE $${idx}
        OR i.codigo ILIKE $${idx}
        OR i.numero_serie ILIKE $${idx}
        OR i.patrimonio_etiqueta ILIKE $${idx}
        OR i.fornecedor ILIKE $${idx}
        OR i.nf_numero ILIKE $${idx}
      )`);
    }

    const where = partes.length > 0 ? `WHERE ${partes.join(' AND ')}` : '';

    const { rows } = await query(
      `SELECT i.*,
              c.nome AS categoria_nome,
              c.cor AS categoria_cor,
              c.icone AS categoria_icone,
              p.nome AS responsavel_nome,
              (SELECT COUNT(*)::int FROM inventario_anexos a
                WHERE a.item_id = i.id) AS qtd_anexos
         FROM inventario_itens i
         JOIN inventario_categorias c ON c.id = i.categoria_id
         LEFT JOIN pessoas_acesso p ON p.id = i.responsavel_id
         ${where}
         ORDER BY i.criado_em DESC
         LIMIT 1000`,
      params,
    );

    res.json(rows);
  } catch (err) { next(err); }
}

/**
 * GET /api/inventario/resumo
 *
 * Agregações pra mostrar nos KPIs do topo.
 */
export async function resumo(_req, res, next) {
  try {
    const { rows } = await query(`
      SELECT
        COUNT(*)::int AS total_itens,
        COALESCE(SUM(valor_total), 0) AS valor_total,
        COUNT(*) FILTER (WHERE status = 'em_uso')::int AS qtd_em_uso,
        COUNT(*) FILTER (WHERE status = 'em_estoque')::int AS qtd_em_estoque,
        COUNT(*) FILTER (WHERE status = 'manutencao')::int AS qtd_manutencao,
        COUNT(*) FILTER (WHERE status IN ('descartado', 'vendido', 'perdido'))::int AS qtd_baixados,
        COUNT(DISTINCT responsavel_id) FILTER (WHERE responsavel_id IS NOT NULL)::int AS qtd_responsaveis,
        COUNT(*) FILTER (WHERE garantia_fim IS NOT NULL AND garantia_fim < CURRENT_DATE)::int AS qtd_garantia_vencida,
        COUNT(*) FILTER (WHERE garantia_fim IS NOT NULL AND garantia_fim >= CURRENT_DATE
                          AND garantia_fim < CURRENT_DATE + INTERVAL '60 days')::int AS qtd_garantia_vencendo
      FROM inventario_itens
    `);

    res.json(rows[0]);
  } catch (err) { next(err); }
}

/**
 * GET /api/inventario/:id
 */
export async function obter(req, res, next) {
  try {
    const { rows } = await query(
      `SELECT i.*,
              c.nome AS categoria_nome,
              c.cor AS categoria_cor,
              c.icone AS categoria_icone,
              p.nome AS responsavel_nome,
              p.email AS responsavel_email,
              reg.nome AS registrado_por_nome
         FROM inventario_itens i
         JOIN inventario_categorias c ON c.id = i.categoria_id
         LEFT JOIN pessoas_acesso p ON p.id = i.responsavel_id
         LEFT JOIN pessoas_acesso reg ON reg.id = i.registrado_por_id
        WHERE i.id = $1`,
      [req.params.id],
    );
    if (!rows[0]) throw new NaoEncontradoError('Item não encontrado');
    res.json(rows[0]);
  } catch (err) { next(err); }
}

// =============================================================================
// Endpoints — Mutações
// =============================================================================

/**
 * POST /api/inventario (admin)
 *
 * Cria item e dispara movimento de cadastro automaticamente.
 */
export async function criar(req, res, next) {
  const client = await pool.connect();
  try {
    const d = tratarVazios(criarSchema.parse(req.body));

    // Confere que categoria existe e não está arquivada
    const cat = await client.query(
      `SELECT id, nome FROM inventario_categorias WHERE id = $1 AND arquivada_em IS NULL`,
      [d.categoria_id],
    );
    if (!cat.rows[0]) {
      throw new AppError('Categoria não encontrada ou arquivada.', 400);
    }

    // Calcula fim da garantia se aplicável
    const garantiaFim = calcularGarantiaFim(d.data_aquisicao, d.garantia_meses);

    await client.query('BEGIN');

    const { rows } = await client.query(
      `INSERT INTO inventario_itens (
         nome, descricao, categoria_id,
         qtd, valor_unitario,
         nf_numero, nf_serie, nf_data, nf_valor,
         fornecedor, data_aquisicao, forma_pagamento,
         localizacao, responsavel_id,
         status,
         garantia_meses, garantia_fim,
         numero_serie, patrimonio_etiqueta,
         registrado_por_id
       ) VALUES (
         $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20
       )
       RETURNING *`,
      [
        d.nome.trim(), d.descricao,
        d.categoria_id,
        d.qtd, d.valor_unitario,
        d.nf_numero, d.nf_serie, d.nf_data, d.nf_valor,
        d.fornecedor, d.data_aquisicao, d.forma_pagamento,
        d.localizacao, d.responsavel_id,
        d.status,
        d.garantia_meses, garantiaFim,
        d.numero_serie, d.patrimonio_etiqueta,
        req.pessoa.id,
      ],
    );

    const item = rows[0];

    // Movimento inicial de cadastro
    await client.query(
      `INSERT INTO inventario_movimentos (
         item_id, tipo, para_responsavel_id, para_localizacao, para_status,
         observacao, feito_por_id
       ) VALUES ($1, 'cadastro', $2, $3, $4, $5, $6)`,
      [
        item.id,
        d.responsavel_id,
        d.localizacao,
        d.status,
        `Item cadastrado: ${item.codigo}`,
        req.pessoa.id,
      ],
    );

    await client.query('COMMIT');

    registrarAcao({
      acao: 'inventario.criou',
      pessoa_acesso_id: req.pessoa.id,
      detalhes: { item_id: item.id, codigo: item.codigo, nome: item.nome },
      req,
    });

    res.status(201).json(item);
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    next(err);
  } finally {
    client.release();
  }
}

/**
 * PUT /api/inventario/:id (admin)
 *
 * Edição genérica. Detecta mudanças relevantes (responsável, status,
 * localização) e cria movimentos do tipo apropriado.
 */
export async function atualizar(req, res, next) {
  const client = await pool.connect();
  try {
    const d = tratarVazios(atualizarSchema.parse(req.body));

    // Estado atual
    const { rows: atuais } = await client.query(
      `SELECT * FROM inventario_itens WHERE id = $1`,
      [req.params.id],
    );
    const atual = atuais[0];
    if (!atual) throw new NaoEncontradoError('Item não encontrado');

    // Recalcula garantia_fim se um dos dois mudou
    let garantiaFimNova = atual.garantia_fim;
    const dataAquisicao = d.data_aquisicao !== undefined ? d.data_aquisicao : atual.data_aquisicao;
    const garantiaMeses = d.garantia_meses !== undefined ? d.garantia_meses : atual.garantia_meses;
    if (d.data_aquisicao !== undefined || d.garantia_meses !== undefined) {
      garantiaFimNova = calcularGarantiaFim(dataAquisicao, garantiaMeses);
    }

    const sets = [];
    const params = [];
    for (const [k, v] of Object.entries(d)) {
      if (v === undefined) continue;
      params.push(typeof v === 'string' ? v.trim() || null : v);
      sets.push(`${k} = $${params.length}`);
    }

    // Adiciona garantia_fim recalculada se mudou
    if (garantiaFimNova !== atual.garantia_fim) {
      params.push(garantiaFimNova);
      sets.push(`garantia_fim = $${params.length}`);
    }

    if (sets.length === 0) {
      return res.json(atual);
    }

    sets.push('atualizado_em = NOW()');
    params.push(req.params.id);

    await client.query('BEGIN');

    const { rows: atualizados } = await client.query(
      `UPDATE inventario_itens SET ${sets.join(', ')}
        WHERE id = $${params.length}
      RETURNING *`,
      params,
    );
    const atualizado = atualizados[0];

    // Detecta mudanças relevantes e cria movimentos
    const mudancas = [];
    if (d.responsavel_id !== undefined && d.responsavel_id !== atual.responsavel_id) {
      mudancas.push({
        tipo: 'transferencia',
        de_responsavel_id: atual.responsavel_id,
        para_responsavel_id: d.responsavel_id,
        de_localizacao: atual.localizacao,
        para_localizacao: d.localizacao !== undefined ? d.localizacao : atual.localizacao,
      });
    } else if (d.localizacao !== undefined && d.localizacao !== atual.localizacao) {
      mudancas.push({
        tipo: 'transferencia',
        de_localizacao: atual.localizacao,
        para_localizacao: d.localizacao,
      });
    }
    if (d.status !== undefined && d.status !== atual.status) {
      mudancas.push({
        tipo: 'troca_status',
        de_status: atual.status,
        para_status: d.status,
      });
    }

    // Movimento genérico de edição se houve outras mudanças
    const camposEditados = Object.keys(d).filter((k) =>
      !['responsavel_id', 'localizacao', 'status'].includes(k));
    if (camposEditados.length > 0 && mudancas.length === 0) {
      mudancas.push({
        tipo: 'edicao',
        detalhes: { campos: camposEditados },
      });
    }

    for (const m of mudancas) {
      await client.query(
        `INSERT INTO inventario_movimentos (
           item_id, tipo,
           de_responsavel_id, para_responsavel_id,
           de_localizacao, para_localizacao,
           de_status, para_status,
           detalhes, feito_por_id
         ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
        [
          req.params.id, m.tipo,
          m.de_responsavel_id || null, m.para_responsavel_id || null,
          m.de_localizacao || null, m.para_localizacao || null,
          m.de_status || null, m.para_status || null,
          m.detalhes ? JSON.stringify(m.detalhes) : null,
          req.pessoa.id,
        ],
      );
    }

    await client.query('COMMIT');

    registrarAcao({
      acao: 'inventario.editou',
      pessoa_acesso_id: req.pessoa.id,
      detalhes: { item_id: req.params.id, codigo: atual.codigo, campos: Object.keys(d) },
      req,
    });

    res.json(atualizado);
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    next(err);
  } finally {
    client.release();
  }
}

/**
 * POST /api/inventario/:id/transferir (admin)
 *
 * Atalho pra mudar responsável e/ou localização sem editar tudo.
 * Cria movimento do tipo 'transferencia' com observação opcional.
 */
export async function transferir(req, res, next) {
  const client = await pool.connect();
  try {
    const d = transferirSchema.parse(req.body);

    if (d.responsavel_id === undefined && d.localizacao === undefined) {
      throw new AppError('Informe novo responsável ou localização.', 400);
    }

    const { rows: atuais } = await client.query(
      `SELECT * FROM inventario_itens WHERE id = $1`,
      [req.params.id],
    );
    const atual = atuais[0];
    if (!atual) throw new NaoEncontradoError('Item não encontrado');

    await client.query('BEGIN');

    const sets = [];
    const params = [];
    if (d.responsavel_id !== undefined) {
      params.push(d.responsavel_id);
      sets.push(`responsavel_id = $${params.length}`);
    }
    if (d.localizacao !== undefined) {
      params.push(d.localizacao?.trim() || null);
      sets.push(`localizacao = $${params.length}`);
    }
    sets.push('atualizado_em = NOW()');
    params.push(req.params.id);

    const { rows: atualizados } = await client.query(
      `UPDATE inventario_itens SET ${sets.join(', ')}
        WHERE id = $${params.length}
      RETURNING *`,
      params,
    );

    await client.query(
      `INSERT INTO inventario_movimentos (
         item_id, tipo,
         de_responsavel_id, para_responsavel_id,
         de_localizacao, para_localizacao,
         observacao, feito_por_id
       ) VALUES ($1, 'transferencia', $2, $3, $4, $5, $6, $7)`,
      [
        req.params.id,
        atual.responsavel_id, d.responsavel_id ?? atual.responsavel_id,
        atual.localizacao, d.localizacao ?? atual.localizacao,
        d.observacao || null,
        req.pessoa.id,
      ],
    );

    await client.query('COMMIT');

    registrarAcao({
      acao: 'inventario.transferiu',
      pessoa_acesso_id: req.pessoa.id,
      detalhes: {
        item_id: req.params.id, codigo: atual.codigo,
        de_responsavel: atual.responsavel_id,
        para_responsavel: d.responsavel_id ?? atual.responsavel_id,
      },
      req,
    });

    res.json(atualizados[0]);
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    next(err);
  } finally {
    client.release();
  }
}

/**
 * POST /api/inventario/:id/descartar (admin)
 *
 * Marca item como descartado/vendido/perdido. Pede motivo obrigatório.
 */
export async function descartar(req, res, next) {
  const client = await pool.connect();
  try {
    const d = descartarSchema.parse(req.body);

    const { rows: atuais } = await client.query(
      `SELECT * FROM inventario_itens WHERE id = $1`,
      [req.params.id],
    );
    const atual = atuais[0];
    if (!atual) throw new NaoEncontradoError('Item não encontrado');

    if (['descartado', 'vendido', 'perdido'].includes(atual.status)) {
      throw new AppError(`Item já está com status "${atual.status}".`, 400);
    }

    await client.query('BEGIN');

    const { rows: atualizados } = await client.query(
      `UPDATE inventario_itens
          SET status = $1, data_descarte = $2, motivo_descarte = $3,
              atualizado_em = NOW()
        WHERE id = $4
        RETURNING *`,
      [d.status, d.data_descarte, d.motivo_descarte.trim(), req.params.id],
    );

    await client.query(
      `INSERT INTO inventario_movimentos (
         item_id, tipo,
         de_status, para_status,
         observacao, detalhes, feito_por_id
       ) VALUES ($1, 'descarte', $2, $3, $4, $5, $6)`,
      [
        req.params.id, atual.status, d.status,
        d.motivo_descarte.trim(),
        JSON.stringify({ data_descarte: d.data_descarte }),
        req.pessoa.id,
      ],
    );

    await client.query('COMMIT');

    registrarAcao({
      acao: 'inventario.descartou',
      pessoa_acesso_id: req.pessoa.id,
      detalhes: {
        item_id: req.params.id, codigo: atual.codigo,
        novo_status: d.status, motivo: d.motivo_descarte,
      },
      req,
    });

    res.json(atualizados[0]);
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    next(err);
  } finally {
    client.release();
  }
}

/**
 * GET /api/inventario/:id/movimentos
 *
 * Histórico completo do item (todos os movimentos).
 */
export async function movimentos(req, res, next) {
  try {
    const { rows } = await query(
      `SELECT m.*,
              p_de.nome AS de_responsavel_nome,
              p_para.nome AS para_responsavel_nome,
              feito.nome AS feito_por_nome
         FROM inventario_movimentos m
         LEFT JOIN pessoas_acesso p_de   ON p_de.id   = m.de_responsavel_id
         LEFT JOIN pessoas_acesso p_para ON p_para.id = m.para_responsavel_id
         LEFT JOIN pessoas_acesso feito  ON feito.id  = m.feito_por_id
        WHERE m.item_id = $1
        ORDER BY m.criado_em DESC`,
      [req.params.id],
    );
    res.json(rows);
  } catch (err) { next(err); }
}
