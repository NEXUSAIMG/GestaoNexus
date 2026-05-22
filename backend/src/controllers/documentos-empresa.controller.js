import { z } from 'zod';
import path from 'node:path';
import { promises as fs } from 'node:fs';
import { query, pool } from '../config/database.js';
import { NaoEncontradoError, AppError } from '../utils/errors.js';
import { registrarAcao } from '../utils/audit.js';
import {
  resolverCaminhoAbsoluto,
  apagarArquivo,
  caminhoRelativo,
} from '../utils/uploads.js';

/**
 * Documentos institucionais da empresa — Sprint 21 (item 6.1 da spec).
 *
 * Diferente dos documentos de governança (atas, decisões, contrato social),
 * esses são docs institucionais gerais: estatuto consolidado, regimento,
 * certidões, alvarás, políticas internas, procurações etc.
 *
 * Permissão (decisão do projeto):
 *   - listar/obter/baixar: qualquer pessoa logada (todos os funcionários
 *     precisam acessar política interna, regimento etc).
 *   - criar/editar/arquivar/excluir: admin (definido nas rotas).
 *
 * Arquivos: usa o `uploaderGovernanca` do utils/uploads.js (mesma pasta
 * e validações de MIME que atas).
 */

// =============================================================================
// Schemas Zod
// =============================================================================

const criarSchema = z.object({
  titulo: z.string().min(1).max(255),
  descricao: z.string().max(10000).optional().nullable(),
  // Categoria livre (varchar 50). UI sugere: estatuto, regimento, certidao,
  // alvara, politica, procuracao, outro. Não enforço enum no banco/Zod pra
  // permitir evolução natural.
  categoria: z.string().min(1).max(50),
});

const atualizarSchema = criarSchema.partial();

// =============================================================================
// SELECT_BASE + serialização
// =============================================================================

const SELECT_BASE = `
  SELECT d.*, p.nome AS criado_por_nome
    FROM documentos_empresa d
    LEFT JOIN pessoas_acesso p ON p.id = d.criado_por_id
`;

function formatar(d) {
  return {
    id: d.id,
    titulo: d.titulo,
    descricao: d.descricao,
    categoria: d.categoria,
    tem_arquivo: !!d.arquivo_path,
    arquivo_nome: d.arquivo_nome,
    arquivo_mime: d.arquivo_mime,
    arquivo_tamanho: d.arquivo_tamanho,
    criado_por_nome: d.criado_por_nome,
    criado_em: d.criado_em,
    atualizado_em: d.atualizado_em,
    arquivado: !!d.arquivado_em,
    arquivado_em: d.arquivado_em,
  };
}

// =============================================================================
// Endpoints
// =============================================================================

/**
 * GET /api/documentos-empresa
 * Filtros: ?categoria=, ?busca=, ?incluir_arquivados=true (default false)
 */
export async function listar(req, res, next) {
  try {
    const partes = [];
    const params = [];

    if (req.query.incluir_arquivados !== 'true') {
      partes.push(`d.arquivado_em IS NULL`);
    }
    if (req.query.categoria) {
      params.push(req.query.categoria);
      partes.push(`d.categoria = $` + params.length);
    }
    if (req.query.busca) {
      params.push(`%${req.query.busca}%`);
      const i = params.length;
      partes.push(`(d.titulo ILIKE $` + i + ` OR d.descricao ILIKE $` + i + `)`);
    }

    const where = partes.length > 0 ? 'WHERE ' + partes.join(' AND ') : '';

    const { rows } = await query(
      SELECT_BASE + ' ' + where + ' ORDER BY d.categoria, d.titulo LIMIT 500',
      params,
    );
    res.json(rows.map(formatar));
  } catch (err) { next(err); }
}

/**
 * GET /api/documentos-empresa/:id
 */
export async function obter(req, res, next) {
  try {
    const { rows } = await query(SELECT_BASE + ' WHERE d.id = $1', [req.params.id]);
    if (!rows[0]) throw new NaoEncontradoError('Documento não encontrado');
    res.json(formatar(rows[0]));
  } catch (err) { next(err); }
}

/**
 * POST /api/documentos-empresa
 *
 * Recebe multipart/form-data com os campos do schema + arquivo opcional.
 * Se vier arquivo, o multer já processou (req.file).
 */
export async function criar(req, res, next) {
  try {
    const d = criarSchema.parse({
      titulo: req.body.titulo,
      descricao: req.body.descricao || null,
      categoria: req.body.categoria,
    });

    const dadosArquivo = req.file ? {
      path: caminhoRelativo(req.file),
      nome: req.file.originalname,
      mime: req.file.mimetype,
      tamanho: req.file.size,
    } : null;

    const { rows } = await query(
      `INSERT INTO documentos_empresa (
         titulo, descricao, categoria,
         arquivo_path, arquivo_nome, arquivo_mime, arquivo_tamanho,
         criado_por_id
       ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       RETURNING id`,
      [
        d.titulo.trim(),
        d.descricao?.trim() || null,
        d.categoria.trim(),
        dadosArquivo?.path || null,
        dadosArquivo?.nome || null,
        dadosArquivo?.mime || null,
        dadosArquivo?.tamanho || null,
        req.pessoa.id,
      ],
    );
    const novoId = rows[0].id;

    registrarAcao({
      acao: 'documento_empresa.criou',
      pessoa_acesso_id: req.pessoa.id,
      detalhes: { documento_id: novoId, titulo: d.titulo, tem_arquivo: !!dadosArquivo },
      req,
    });

    const final = await query(SELECT_BASE + ' WHERE d.id = $1', [novoId]);
    res.status(201).json(formatar(final.rows[0]));
  } catch (err) {
    // Se subiu arquivo e deu erro depois, limpa
    if (req.file) await apagarArquivo(caminhoRelativo(req.file));
    next(err);
  }
}

/**
 * PUT /api/documentos-empresa/:id
 * Apenas campos textuais. Pra trocar o arquivo, usar /:id/arquivo.
 */
export async function atualizar(req, res, next) {
  const client = await pool.connect();
  try {
    const cR = await query(
      `SELECT id FROM documentos_empresa WHERE id = $1 AND arquivado_em IS NULL`,
      [req.params.id],
    );
    if (!cR.rows[0]) throw new NaoEncontradoError('Documento não encontrado');

    const d = atualizarSchema.parse(req.body);

    // UPDATE dinâmico — concatenação pra evitar bug do "$$"
    const updates = [];
    const params = [];
    for (const [k, v] of Object.entries(d)) {
      if (v === undefined) continue;
      const valor = typeof v === 'string' ? v.trim() : v;
      params.push(valor === '' ? null : valor);
      updates.push(k + ' = $' + params.length);
    }
    if (updates.length === 0) {
      return res.json(formatar((await query(SELECT_BASE + ' WHERE d.id = $1', [req.params.id])).rows[0]));
    }
    updates.push('atualizado_em = now()');
    params.push(req.params.id);

    await client.query(
      'UPDATE documentos_empresa SET ' + updates.join(', ') + ' WHERE id = $' + params.length,
      params,
    );

    registrarAcao({
      acao: 'documento_empresa.editou',
      pessoa_acesso_id: req.pessoa.id,
      detalhes: { documento_id: req.params.id, campos: Object.keys(d) },
      req,
    });

    const final = await query(SELECT_BASE + ' WHERE d.id = $1', [req.params.id]);
    res.json(formatar(final.rows[0]));
  } catch (err) {
    next(err);
  } finally {
    client.release();
  }
}

/**
 * POST /api/documentos-empresa/:id/arquivo
 * Substitui o arquivo. Multer já processou em req.file.
 * Apaga o arquivo antigo do filesystem.
 */
export async function substituirArquivo(req, res, next) {
  try {
    if (!req.file) throw new AppError('Nenhum arquivo enviado.', 400);

    // Pega caminho antigo pra apagar depois (best-effort)
    const cR = await query(
      `SELECT arquivo_path FROM documentos_empresa WHERE id = $1 AND arquivado_em IS NULL`,
      [req.params.id],
    );
    if (!cR.rows[0]) {
      await apagarArquivo(caminhoRelativo(req.file));
      throw new NaoEncontradoError('Documento não encontrado');
    }
    const pathAntigo = cR.rows[0].arquivo_path;

    await query(
      `UPDATE documentos_empresa
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
      acao: 'documento_empresa.substituiu_arquivo',
      pessoa_acesso_id: req.pessoa.id,
      detalhes: { documento_id: req.params.id },
      req,
    });

    const final = await query(SELECT_BASE + ' WHERE d.id = $1', [req.params.id]);
    res.json(formatar(final.rows[0]));
  } catch (err) {
    if (req.file) await apagarArquivo(caminhoRelativo(req.file));
    next(err);
  }
}

/**
 * GET /api/documentos-empresa/:id/arquivo
 * Stream do arquivo com o nome original (download bonito).
 */
export async function baixarArquivo(req, res, next) {
  try {
    const { rows } = await query(
      `SELECT arquivo_path, arquivo_nome, arquivo_mime
         FROM documentos_empresa WHERE id = $1`,
      [req.params.id],
    );
    if (!rows[0] || !rows[0].arquivo_path) {
      throw new NaoEncontradoError('Arquivo não disponível');
    }
    const abs = resolverCaminhoAbsoluto(rows[0].arquivo_path);
    // Confere que existe (se sumiu, registra mas dá 404)
    try { await fs.access(abs); }
    catch { throw new NaoEncontradoError('Arquivo físico não encontrado no servidor'); }

    res.setHeader('Content-Type', rows[0].arquivo_mime || 'application/octet-stream');
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="${encodeURIComponent(rows[0].arquivo_nome || 'documento')}"`,
    );
    res.sendFile(abs);
  } catch (err) { next(err); }
}

/**
 * POST /api/documentos-empresa/:id/arquivar
 */
export async function arquivar(req, res, next) {
  try {
    const { rowCount } = await query(
      `UPDATE documentos_empresa SET arquivado_em = now()
        WHERE id = $1 AND arquivado_em IS NULL`,
      [req.params.id],
    );
    if (rowCount === 0) throw new AppError('Documento não encontrado ou já arquivado.', 400);

    registrarAcao({
      acao: 'documento_empresa.arquivou',
      pessoa_acesso_id: req.pessoa.id,
      detalhes: { documento_id: req.params.id },
      req,
    });

    res.status(204).send();
  } catch (err) { next(err); }
}

/**
 * DELETE /api/documentos-empresa/:id
 * Apaga registro + arquivo físico. Use arquivar() pra soft-delete.
 */
export async function excluir(req, res, next) {
  try {
    const { rows } = await query(
      `SELECT arquivo_path FROM documentos_empresa WHERE id = $1`,
      [req.params.id],
    );
    if (!rows[0]) throw new NaoEncontradoError('Documento não encontrado');

    await query(`DELETE FROM documentos_empresa WHERE id = $1`, [req.params.id]);
    if (rows[0].arquivo_path) await apagarArquivo(rows[0].arquivo_path);

    registrarAcao({
      acao: 'documento_empresa.excluiu',
      pessoa_acesso_id: req.pessoa.id,
      detalhes: { documento_id: req.params.id },
      req,
    });

    res.status(204).send();
  } catch (err) { next(err); }
}
