import { z } from 'zod';
import { promises as fs } from 'node:fs';
import { query, pool } from '../config/database.js';
import { NaoEncontradoError, AppError } from '../utils/errors.js';
import { registrarAcao } from '../utils/audit.js';
import {
  resolverCaminhoAbsoluto,
  apagarArquivo,
  caminhoRelativo,
} from '../utils/uploads.js';
import { enviarAvisosContratosVencendo } from '../services/notificacoes.service.js';

/**
 * Contratos com terceiros — Sprint 21 (item 6.2 da spec).
 *
 * Cadastra contratos com clientes/fornecedores/parceiros. Cada um pode ter
 * arquivo anexado (PDF do contrato).
 *
 * Aviso de vencimento (Sprint 26): cron diário (8h) verifica contratos
 * vigentes com data_fim na janela `alerta_antes_dias` ou já vencidos,
 * e dispara notificação in-app + e-mail aos admins. Cada contrato re-alerta
 * a cada 7 dias enquanto continuar na janela (idempotente).
 * O cálculo de "vencendo" e "vencido" exposto no GET continua sob demanda,
 * comparando data_fim com hoje + alerta_antes_dias.
 *
 * Permissão (decisão do projeto, mesmo padrão dos demais):
 *   - ler/baixar arquivo: qualquer pessoa logada
 *   - criar/editar/arquivar/excluir: admin (definido nas rotas)
 *   - disparar alertas agora: admin (endpoint manual pra teste/redisparo)
 */

// =============================================================================
// Schemas Zod
// =============================================================================

const statusValidos = ['vigente', 'encerrado', 'em_negociacao', 'cancelado'];
const periodicidadesValidas = ['mensal', 'anual', 'unico', 'outro'];
const tiposContraparte = ['pf', 'pj'];

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Data deve estar em YYYY-MM-DD');

const criarSchema = z.object({
  titulo: z.string().min(1).max(255),
  descricao: z.string().max(10000).optional().nullable(),
  contraparte_nome: z.string().min(1).max(255),
  contraparte_documento: z.string().max(40).optional().nullable(),
  contraparte_tipo: z.enum(tiposContraparte).optional().nullable(),
  // Multer envia campos como string mesmo em multipart. Usar coerce pra
  // converter os numéricos.
  valor: z.coerce.number().nonnegative().optional().nullable(),
  moeda: z.string().length(3).optional().default('BRL'),
  periodicidade: z.enum(periodicidadesValidas).optional().nullable(),
  data_inicio: isoDate,
  data_fim: isoDate.optional().nullable(),
  status: z.enum(statusValidos).optional().default('vigente'),
  alerta_antes_dias: z.coerce.number().int().min(0).max(365).optional().default(30),
});

const atualizarSchema = criarSchema.partial();

// =============================================================================
// SELECT_BASE + serialização
// =============================================================================

const SELECT_BASE = `
  SELECT c.*, p.nome AS criado_por_nome
    FROM contratos c
    LEFT JOIN pessoas_acesso p ON p.id = c.criado_por_id
`;

/**
 * Calcula flags de vencimento. Retorna {dias_pra_vencer, vencendo, vencido}.
 *   - dias_pra_vencer: null se não há data_fim; senão inteiro (negativo = passado)
 *   - vencendo: true se 0 <= dias <= alerta_antes_dias (e status vigente)
 *   - vencido:  true se dias < 0 (e status vigente)
 */
function calcularVencimento(c) {
  if (!c.data_fim) return { dias_pra_vencer: null, vencendo: false, vencido: false };
  const hoje = new Date();
  hoje.setHours(0, 0, 0, 0);
  const fim = new Date(c.data_fim);
  fim.setHours(0, 0, 0, 0);
  const dias = Math.round((fim - hoje) / (1000 * 60 * 60 * 24));
  const ativo = c.status === 'vigente';
  return {
    dias_pra_vencer: dias,
    vencendo: ativo && dias >= 0 && dias <= (c.alerta_antes_dias ?? 30),
    vencido: ativo && dias < 0,
  };
}

function formatar(c) {
  const venc = calcularVencimento(c);
  return {
    id: c.id,
    titulo: c.titulo,
    descricao: c.descricao,
    contraparte_nome: c.contraparte_nome,
    contraparte_documento: c.contraparte_documento,
    contraparte_tipo: c.contraparte_tipo,
    valor: c.valor !== null ? Number(c.valor) : null,
    moeda: c.moeda,
    periodicidade: c.periodicidade,
    data_inicio: c.data_inicio,
    data_fim: c.data_fim,
    status: c.status,
    alerta_antes_dias: c.alerta_antes_dias,
    tem_arquivo: !!c.arquivo_path,
    arquivo_nome: c.arquivo_nome,
    arquivo_mime: c.arquivo_mime,
    arquivo_tamanho: c.arquivo_tamanho,
    criado_por_nome: c.criado_por_nome,
    criado_em: c.criado_em,
    atualizado_em: c.atualizado_em,
    arquivado: !!c.arquivado_em,
    arquivado_em: c.arquivado_em,
    // Flags calculadas
    dias_pra_vencer: venc.dias_pra_vencer,
    vencendo: venc.vencendo,
    vencido: venc.vencido,
  };
}

// =============================================================================
// Endpoints
// =============================================================================

/**
 * GET /api/contratos
 * Filtros: ?status=, ?busca=, ?incluir_arquivados=true
 * Ordem: vencidos primeiro → vencendo → demais por data_fim ascendente.
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
    if (req.query.busca) {
      params.push(`%${req.query.busca}%`);
      const i = params.length;
      partes.push(`(c.titulo ILIKE $` + i + ` OR c.contraparte_nome ILIKE $` + i + `)`);
    }

    const where = partes.length > 0 ? 'WHERE ' + partes.join(' AND ') : '';

    // Ordem: vigentes primeiro, dentro deles os com data_fim mais próxima.
    // Sem data_fim vai pro fim (NULLS LAST).
    const orderBy = `
      ORDER BY (c.status = 'vigente') DESC,
               c.data_fim ASC NULLS LAST,
               c.titulo ASC
    `;

    const { rows } = await query(SELECT_BASE + ' ' + where + ' ' + orderBy + ' LIMIT 500', params);
    res.json(rows.map(formatar));
  } catch (err) { next(err); }
}

/**
 * GET /api/contratos/:id
 */
export async function obter(req, res, next) {
  try {
    const { rows } = await query(SELECT_BASE + ' WHERE c.id = $1', [req.params.id]);
    if (!rows[0]) throw new NaoEncontradoError('Contrato não encontrado');
    res.json(formatar(rows[0]));
  } catch (err) { next(err); }
}

/**
 * POST /api/contratos
 * Multipart com campos + arquivo opcional.
 */
export async function criar(req, res, next) {
  try {
    const d = criarSchema.parse({
      ...req.body,
      // Normaliza strings vazias pra null nos opcionais
      descricao: req.body.descricao || null,
      contraparte_documento: req.body.contraparte_documento || null,
      contraparte_tipo: req.body.contraparte_tipo || null,
      valor: req.body.valor || null,
      periodicidade: req.body.periodicidade || null,
      data_fim: req.body.data_fim || null,
    });

    if (d.data_fim && d.data_fim < d.data_inicio) {
      throw new AppError('Data fim deve ser posterior à data início.', 400);
    }

    const dadosArquivo = req.file ? {
      path: caminhoRelativo(req.file),
      nome: req.file.originalname,
      mime: req.file.mimetype,
      tamanho: req.file.size,
    } : null;

    const { rows } = await query(
      `INSERT INTO contratos (
         titulo, descricao,
         contraparte_nome, contraparte_documento, contraparte_tipo,
         valor, moeda, periodicidade,
         data_inicio, data_fim, status, alerta_antes_dias,
         arquivo_path, arquivo_nome, arquivo_mime, arquivo_tamanho,
         criado_por_id
       ) VALUES (
         $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17
       ) RETURNING id`,
      [
        d.titulo.trim(),
        d.descricao?.trim() || null,
        d.contraparte_nome.trim(),
        d.contraparte_documento?.trim() || null,
        d.contraparte_tipo || null,
        d.valor ?? null,
        d.moeda || 'BRL',
        d.periodicidade || null,
        d.data_inicio,
        d.data_fim || null,
        d.status || 'vigente',
        d.alerta_antes_dias ?? 30,
        dadosArquivo?.path || null,
        dadosArquivo?.nome || null,
        dadosArquivo?.mime || null,
        dadosArquivo?.tamanho || null,
        req.pessoa.id,
      ],
    );
    const novoId = rows[0].id;

    registrarAcao({
      acao: 'contrato.criou',
      pessoa_acesso_id: req.pessoa.id,
      detalhes: { contrato_id: novoId, titulo: d.titulo, status: d.status },
      req,
    });

    const final = await query(SELECT_BASE + ' WHERE c.id = $1', [novoId]);
    res.status(201).json(formatar(final.rows[0]));
  } catch (err) {
    if (req.file) await apagarArquivo(caminhoRelativo(req.file));
    next(err);
  }
}

/**
 * PUT /api/contratos/:id
 * Atualiza campos textuais. Pra trocar arquivo, usar /:id/arquivo.
 */
export async function atualizar(req, res, next) {
  const client = await pool.connect();
  try {
    const cR = await query(
      `SELECT id, data_inicio FROM contratos WHERE id = $1 AND arquivado_em IS NULL`,
      [req.params.id],
    );
    if (!cR.rows[0]) throw new NaoEncontradoError('Contrato não encontrado');

    const d = atualizarSchema.parse(req.body);

    // Validação cruzada de datas
    const dataInicioFinal = d.data_inicio ?? cR.rows[0].data_inicio?.toISOString().slice(0, 10);
    if (d.data_fim && dataInicioFinal && d.data_fim < dataInicioFinal) {
      throw new AppError('Data fim deve ser posterior à data início.', 400);
    }

    // UPDATE dinâmico — concatenação (evita "$$" issue)
    const updates = [];
    const params = [];
    for (const [k, v] of Object.entries(d)) {
      if (v === undefined) continue;
      const valor = (typeof v === 'string') ? v.trim() : v;
      params.push(valor === '' ? null : valor);
      updates.push(k + ' = $' + params.length);
    }
    if (updates.length === 0) {
      return res.json(formatar((await query(SELECT_BASE + ' WHERE c.id = $1', [req.params.id])).rows[0]));
    }
    updates.push('atualizado_em = now()');
    params.push(req.params.id);

    await client.query(
      'UPDATE contratos SET ' + updates.join(', ') + ' WHERE id = $' + params.length,
      params,
    );

    registrarAcao({
      acao: 'contrato.editou',
      pessoa_acesso_id: req.pessoa.id,
      detalhes: { contrato_id: req.params.id, campos: Object.keys(d) },
      req,
    });

    const final = await query(SELECT_BASE + ' WHERE c.id = $1', [req.params.id]);
    res.json(formatar(final.rows[0]));
  } catch (err) {
    next(err);
  } finally {
    client.release();
  }
}

/**
 * POST /api/contratos/:id/arquivo
 * Substitui o arquivo do contrato.
 */
export async function substituirArquivo(req, res, next) {
  try {
    if (!req.file) throw new AppError('Nenhum arquivo enviado.', 400);

    const cR = await query(
      `SELECT arquivo_path FROM contratos WHERE id = $1 AND arquivado_em IS NULL`,
      [req.params.id],
    );
    if (!cR.rows[0]) {
      await apagarArquivo(caminhoRelativo(req.file));
      throw new NaoEncontradoError('Contrato não encontrado');
    }
    const pathAntigo = cR.rows[0].arquivo_path;

    await query(
      `UPDATE contratos
          SET arquivo_path = $1, arquivo_nome = $2,
              arquivo_mime = $3, arquivo_tamanho = $4,
              atualizado_em = now()
        WHERE id = $5`,
      [
        caminhoRelativo(req.file),
        req.file.originalname,
        req.file.mimetype,
        req.file.size,
        req.params.id,
      ],
    );

    if (pathAntigo) await apagarArquivo(pathAntigo);

    registrarAcao({
      acao: 'contrato.substituiu_arquivo',
      pessoa_acesso_id: req.pessoa.id,
      detalhes: { contrato_id: req.params.id },
      req,
    });

    const final = await query(SELECT_BASE + ' WHERE c.id = $1', [req.params.id]);
    res.json(formatar(final.rows[0]));
  } catch (err) {
    if (req.file) await apagarArquivo(caminhoRelativo(req.file));
    next(err);
  }
}

/**
 * GET /api/contratos/:id/arquivo
 */
export async function baixarArquivo(req, res, next) {
  try {
    const { rows } = await query(
      `SELECT arquivo_path, arquivo_nome, arquivo_mime
         FROM contratos WHERE id = $1`,
      [req.params.id],
    );
    if (!rows[0] || !rows[0].arquivo_path) {
      throw new NaoEncontradoError('Arquivo não disponível');
    }
    const abs = resolverCaminhoAbsoluto(rows[0].arquivo_path);
    try { await fs.access(abs); }
    catch { throw new NaoEncontradoError('Arquivo físico não encontrado no servidor'); }

    res.setHeader('Content-Type', rows[0].arquivo_mime || 'application/octet-stream');
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="${encodeURIComponent(rows[0].arquivo_nome || 'contrato')}"`,
    );
    res.sendFile(abs);
  } catch (err) { next(err); }
}

/**
 * POST /api/contratos/:id/arquivar
 */
export async function arquivar(req, res, next) {
  try {
    const { rowCount } = await query(
      `UPDATE contratos SET arquivado_em = now()
        WHERE id = $1 AND arquivado_em IS NULL`,
      [req.params.id],
    );
    if (rowCount === 0) throw new AppError('Contrato não encontrado ou já arquivado.', 400);

    registrarAcao({
      acao: 'contrato.arquivou',
      pessoa_acesso_id: req.pessoa.id,
      detalhes: { contrato_id: req.params.id },
      req,
    });

    res.status(204).send();
  } catch (err) { next(err); }
}

/**
 * DELETE /api/contratos/:id
 * Exclusão permanente + apaga arquivo físico.
 */
export async function excluir(req, res, next) {
  try {
    const { rows } = await query(
      `SELECT arquivo_path FROM contratos WHERE id = $1`,
      [req.params.id],
    );
    if (!rows[0]) throw new NaoEncontradoError('Contrato não encontrado');

    await query(`DELETE FROM contratos WHERE id = $1`, [req.params.id]);
    if (rows[0].arquivo_path) await apagarArquivo(rows[0].arquivo_path);

    registrarAcao({
      acao: 'contrato.excluiu',
      pessoa_acesso_id: req.pessoa.id,
      detalhes: { contrato_id: req.params.id },
      req,
    });

    res.status(204).send();
  } catch (err) { next(err); }
}

/**
 * POST /api/contratos/disparar-alertas (admin)
 *
 * Sprint 26 — dispara manualmente o aviso de contratos vencendo / vencidos,
 * fora do cron. Útil pra teste imediato ou re-disparo após mudar configurações.
 *
 * Respeita a mesma regra de idempotência do cron: contratos alertados nos
 * últimos 7 dias NÃO serão re-alertados — a menos que admin tenha resetado
 * o campo `ultimo_alerta_em` manualmente.
 *
 * Retorna o relatório do disparo: { enviados, contratos }.
 */
export async function dispararAlertas(req, res, next) {
  try {
    const r = await enviarAvisosContratosVencendo();

    registrarAcao({
      acao: 'contrato.disparar_alertas',
      pessoa_acesso_id: req.pessoa.id,
      detalhes: r,
      req,
    });

    res.json(r);
  } catch (err) { next(err); }
}
