import { z } from 'zod';
import { query } from '../config/database.js';
import { NaoEncontradoError, AppError } from '../utils/errors.js';
import { registrarAcao } from '../utils/audit.js';
import { sincronizarProduto, testarFonte } from '../services/portfolio-sync.service.js';
import { seuCartorioConfigurado } from '../config/env.js';

/**
 * Portfólio de produtos — Sprint 16.
 *
 * Este controller cuida do CABEÇALHO do produto. Métricas mensais,
 * clientes nominais e roadmap ficam em controllers separados pra
 * manter cada arquivo enxuto.
 *
 * Visibilidade:
 *   - Todos autenticados veem (transparência pros sócios)
 *   - Editar: só admin
 */

const cores = [
  'slate', 'red', 'orange', 'amber', 'yellow',
  'lime', 'emerald', 'teal', 'cyan', 'blue',
  'indigo', 'violet', 'fuchsia', 'pink', 'rose',
];

const statuses = ['em_desenvolvimento', 'beta', 'ativo', 'descontinuado'];

const dataIso = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Data deve estar em YYYY-MM-DD');

const criarSchema = z.object({
  nome: z.string().min(2).max(100),
  slug: z.string().min(2).max(80).regex(/^[a-z0-9-]+$/, 'Slug aceita só letras minúsculas, números e hífens'),
  descricao_curta: z.string().max(255).optional().nullable(),
  descricao_longa: z.string().max(20000).optional().nullable(),
  status: z.enum(statuses).default('ativo'),
  cor: z.enum(cores).default('blue'),
  logo_url: z.string().url().max(2048).optional().nullable().or(z.literal('')),
  link_site: z.string().url().max(2048).optional().nullable().or(z.literal('')),
  link_app: z.string().url().max(2048).optional().nullable().or(z.literal('')),
  link_landing: z.string().url().max(2048).optional().nullable().or(z.literal('')),
  data_lancamento: dataIso.optional().nullable(),
  equipe_responsavel_id: z.string().uuid().optional().nullable(),
  fonte_dados: z.string().max(50).default('manual'),
});

const atualizarSchema = criarSchema.partial();

function vaziosComoNull(obj) {
  // URLs e textos vazios viram null pra não persistir "" no banco
  const r = { ...obj };
  for (const k of ['logo_url', 'link_site', 'link_app', 'link_landing',
                   'descricao_curta', 'descricao_longa']) {
    if (r[k] === '') r[k] = null;
  }
  return r;
}

// =============================================================================
// Endpoints
// =============================================================================

/**
 * GET /api/produtos
 *
 * Lista todos os produtos (não arquivados por padrão), com agregações
 * úteis pra mostrar no card: MRR atual, # clientes ativos, mini-série
 * de MRR dos últimos 6 meses pra sparkline.
 *
 * Query params:
 *   ?incluir_arquivados=true — também traz arquivados
 *   ?status=ativo            — filtra por status
 */
export async function listar(req, res, next) {
  try {
    const incluirArquivados = req.query.incluir_arquivados === 'true';
    const filtroStatus = req.query.status;

    const partes = [];
    const params = [];

    if (!incluirArquivados) partes.push('p.arquivado_em IS NULL');
    if (filtroStatus && statuses.includes(filtroStatus)) {
      params.push(filtroStatus);
      partes.push(`p.status = $${params.length}`);
    }

    const where = partes.length > 0 ? `WHERE ${partes.join(' AND ')}` : '';

    // Agregações:
    //   mrr_atual         = MRR do mês mais recente registrado
    //   clientes_atual    = clientes_ativos do mês mais recente
    //   ultima_metrica_em = qual mês foi o último registro
    //   serie_mrr         = array dos últimos 6 meses (mes, mrr) pra sparkline
    //   qtd_clientes_lista = quantos clientes nominais cadastrados
    const { rows } = await query(
      `SELECT p.id, p.nome, p.slug, p.descricao_curta, p.status, p.cor,
              p.logo_url, p.link_site, p.link_app, p.link_landing,
              p.data_lancamento, p.equipe_responsavel_id,
              p.fonte_dados, p.sincronizado_em,
              p.arquivado_em, p.criado_em, p.atualizado_em,
              e.nome AS equipe_nome, e.cor AS equipe_cor,
              ult.mes AS ultima_metrica_em,
              COALESCE(ult.mrr, 0) AS mrr_atual,
              COALESCE(ult.clientes_ativos, 0) AS clientes_atual,
              COALESCE(ult.receita_total, 0) AS receita_mes_atual,
              COALESCE(ult.novos_clientes, 0) AS novos_mes_atual,
              COALESCE(ult.churn_clientes, 0) AS churn_mes_atual,
              COALESCE((
                SELECT json_agg(
                  json_build_object('mes', m.mes, 'mrr', m.mrr)
                  ORDER BY m.mes
                )
                FROM (
                  SELECT mes, mrr FROM produtos_metricas_mensais
                   WHERE produto_id = p.id
                   ORDER BY mes DESC
                   LIMIT 6
                ) m
              ), '[]'::json) AS serie_mrr,
              (SELECT COUNT(*)::int FROM produtos_clientes pc
                WHERE pc.produto_id = p.id AND pc.status = 'ativo') AS qtd_clientes_lista
         FROM produtos p
         LEFT JOIN equipes e ON e.id = p.equipe_responsavel_id
         LEFT JOIN LATERAL (
            SELECT mes, mrr, clientes_ativos, receita_total, novos_clientes, churn_clientes
              FROM produtos_metricas_mensais
             WHERE produto_id = p.id
             ORDER BY mes DESC
             LIMIT 1
         ) ult ON TRUE
         ${where}
         ORDER BY p.arquivado_em IS NOT NULL, p.nome`,
      params,
    );

    res.json(rows);
  } catch (err) { next(err); }
}

/**
 * GET /api/produtos/:id
 *
 * Detalhe completo: cabeçalho + métricas (todas) + clientes (todos)
 * + roadmap (todos). Vai pra tela de detalhe.
 *
 * Aceita id (UUID) ou slug.
 */
export async function obter(req, res, next) {
  try {
    const ehUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(req.params.id);
    const filtro = ehUuid ? 'p.id = $1' : 'lower(p.slug) = lower($1)';

    const { rows: cab } = await query(
      `SELECT p.*, e.nome AS equipe_nome, e.cor AS equipe_cor
         FROM produtos p
         LEFT JOIN equipes e ON e.id = p.equipe_responsavel_id
        WHERE ${filtro}`,
      [req.params.id],
    );
    if (!cab[0]) throw new NaoEncontradoError('Produto não encontrado');
    const produto = cab[0];

    const [metricas, clientes, roadmap] = await Promise.all([
      query(
        `SELECT * FROM produtos_metricas_mensais
          WHERE produto_id = $1
          ORDER BY mes DESC`,
        [produto.id],
      ),
      query(
        `SELECT * FROM produtos_clientes
          WHERE produto_id = $1
          ORDER BY status = 'ativo' DESC, nome`,
        [produto.id],
      ),
      query(
        `SELECT r.*, p.nome AS criado_por_nome
           FROM produtos_roadmap r
           LEFT JOIN pessoas_acesso p ON p.id = r.criado_por_id
          WHERE r.produto_id = $1
          ORDER BY r.status = 'lancado',
                   r.ordem,
                   r.criado_em DESC`,
        [produto.id],
      ),
    ]);

    res.json({
      ...produto,
      metricas: metricas.rows,
      clientes: clientes.rows,
      roadmap: roadmap.rows,
    });
  } catch (err) { next(err); }
}

/**
 * POST /api/produtos (admin)
 */
export async function criar(req, res, next) {
  try {
    const d = vaziosComoNull(criarSchema.parse(req.body));

    try {
      const { rows } = await query(
        `INSERT INTO produtos (
           nome, slug, descricao_curta, descricao_longa,
           status, cor, logo_url, link_site, link_app, link_landing,
           data_lancamento, equipe_responsavel_id,
           fonte_dados, criado_por_id
         ) VALUES (
           $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14
         ) RETURNING *`,
        [
          d.nome.trim(), d.slug.trim(), d.descricao_curta, d.descricao_longa,
          d.status, d.cor, d.logo_url, d.link_site, d.link_app, d.link_landing,
          d.data_lancamento, d.equipe_responsavel_id ?? null,
          d.fonte_dados, req.pessoa.id,
        ],
      );

      registrarAcao({
        acao: 'produto.criou',
        pessoa_acesso_id: req.pessoa.id,
        detalhes: { produto_id: rows[0].id, nome: d.nome },
        req,
      });

      res.status(201).json(rows[0]);
    } catch (err) {
      if (err.code === '23505') {
        throw new AppError('Já existe um produto com este nome ou slug.', 400);
      }
      throw err;
    }
  } catch (err) { next(err); }
}

/**
 * PUT /api/produtos/:id (admin)
 */
export async function atualizar(req, res, next) {
  try {
    const d = vaziosComoNull(atualizarSchema.parse(req.body));

    const sets = [];
    const params = [];

    for (const [k, v] of Object.entries(d)) {
      if (v === undefined) continue;
      params.push(typeof v === 'string' ? v.trim() : v);
      sets.push(`${k} = $${params.length}`);
    }

    if (sets.length === 0) {
      const r = await query(`SELECT * FROM produtos WHERE id = $1`, [req.params.id]);
      if (!r.rows[0]) throw new NaoEncontradoError('Produto não encontrado');
      return res.json(r.rows[0]);
    }

    sets.push(`atualizado_em = NOW()`);
    params.push(req.params.id);

    try {
      const { rows } = await query(
        `UPDATE produtos SET ${sets.join(', ')}
          WHERE id = $${params.length}
        RETURNING *`,
        params,
      );
      if (!rows[0]) throw new NaoEncontradoError('Produto não encontrado');

      registrarAcao({
        acao: 'produto.editou',
        pessoa_acesso_id: req.pessoa.id,
        detalhes: { produto_id: req.params.id, campos: Object.keys(d) },
        req,
      });

      res.json(rows[0]);
    } catch (err) {
      if (err.code === '23505') {
        throw new AppError('Já existe outro produto com este nome ou slug.', 400);
      }
      throw err;
    }
  } catch (err) { next(err); }
}

/**
 * POST /api/produtos/:id/arquivar (admin)
 */
export async function arquivar(req, res, next) {
  try {
    const { rowCount } = await query(
      `UPDATE produtos SET arquivado_em = NOW()
        WHERE id = $1 AND arquivado_em IS NULL`,
      [req.params.id],
    );
    if (rowCount === 0) throw new AppError('Produto não encontrado ou já arquivado', 400);

    registrarAcao({
      acao: 'produto.arquivou',
      pessoa_acesso_id: req.pessoa.id,
      detalhes: { produto_id: req.params.id },
      req,
    });

    res.status(204).send();
  } catch (err) { next(err); }
}

/**
 * POST /api/produtos/:id/desarquivar (admin)
 */
export async function desarquivar(req, res, next) {
  try {
    const { rowCount } = await query(
      `UPDATE produtos SET arquivado_em = NULL
        WHERE id = $1 AND arquivado_em IS NOT NULL`,
      [req.params.id],
    );
    if (rowCount === 0) throw new AppError('Produto não encontrado ou não arquivado', 400);

    registrarAcao({
      acao: 'produto.desarquivou',
      pessoa_acesso_id: req.pessoa.id,
      detalhes: { produto_id: req.params.id },
      req,
    });

    res.status(204).send();
  } catch (err) { next(err); }
}

/**
 * POST /api/produtos/:id/sincronizar (admin)
 *
 * Dispara um sync sob demanda. Aceita ?meses=N pra puxar histórico
 * (default 1, max 24). Útil pra primeira sincronização (com meses=12)
 * e pra forçar atualização sem esperar o cron.
 */
export async function sincronizar(req, res, next) {
  try {
    const meses = Math.min(
      Math.max(parseInt(req.query.meses, 10) || 1, 1),
      24,
    );

    const r = await sincronizarProduto({ produtoId: req.params.id, meses });

    registrarAcao({
      acao: 'produto.sincronizou',
      pessoa_acesso_id: req.pessoa.id,
      detalhes: {
        produto_id: req.params.id,
        meses,
        qtd_metricas: r.qtd_metricas,
        qtd_clientes: r.qtd_clientes,
      },
      req,
    });

    res.json(r);
  } catch (err) {
    // Erros de negócio do sync viram 400 com mensagem amigável
    if (err.message && (
      err.message.includes('manual') ||
      err.message.includes('não configurada') ||
      err.message.includes('Falha de rede') ||
      err.message.includes('HTTP') ||
      err.message.includes('Payload')
    )) {
      return next(new AppError(err.message, 400));
    }
    next(err);
  }
}

/**
 * GET /api/produtos/:id/sincronizar/testar (admin)
 *
 * Testa só a conectividade com a fonte (chama o /health). Não grava nada.
 */
export async function testarSincronizacao(req, res, next) {
  try {
    const { rows } = await query(
      `SELECT fonte_dados FROM produtos WHERE id = $1`,
      [req.params.id],
    );
    const produto = rows[0];
    if (!produto) throw new NaoEncontradoError('Produto não encontrado');
    if (produto.fonte_dados === 'manual') {
      throw new AppError('Produto está em modo manual.', 400);
    }

    const r = await testarFonte(produto.fonte_dados);
    res.json({
      fonte: produto.fonte_dados,
      configurada: seuCartorioConfigurado,
      ...r,
    });
  } catch (err) { next(err); }
}
