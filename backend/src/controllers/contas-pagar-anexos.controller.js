import { promises as fs } from 'node:fs';
import { z } from 'zod';
import { query } from '../config/database.js';
import { NaoEncontradoError, AppError } from '../utils/errors.js';
import { registrarAcao } from '../utils/audit.js';
import { resolverCaminhoAbsoluto, apagarArquivo, caminhoRelativo } from '../utils/uploads.js';

/**
 * Anexos de contas a pagar — Sprint 17.1.
 *
 * Múltiplos arquivos por conta. Tipos livres (boleto, comprovante,
 * nota_fiscal, outro). Reusa o uploader `uploaderComprovantes()` que
 * limita a PDF e imagens.
 */

const TIPOS_PADRAO = ['boleto', 'comprovante', 'nota_fiscal', 'outro'];

const criarSchema = z.object({
  tipo: z.string().max(30).optional().nullable(),
  descricao: z.string().max(500).optional().nullable(),
});

/**
 * GET /api/contas-pagar/:id/anexos
 */
export async function listar(req, res, next) {
  try {
    const { rows } = await query(
      `SELECT a.*, p.nome AS enviado_por_nome
         FROM contas_pagar_anexos a
         LEFT JOIN pessoas_acesso p ON p.id = a.enviado_por_id
        WHERE a.conta_id = $1
        ORDER BY a.criado_em DESC`,
      [req.params.id],
    );
    res.json(rows);
  } catch (err) { next(err); }
}

/**
 * POST /api/contas-pagar/:id/anexos (admin)
 *
 * multipart/form-data:
 *   - arquivo (obrigatório)
 *   - tipo (opcional, default 'outro')
 *   - descricao (opcional)
 */
export async function criar(req, res, next) {
  try {
    if (!req.file) throw new AppError('Nenhum arquivo enviado.', 400);

    const d = criarSchema.parse({
      tipo: req.body.tipo || 'outro',
      descricao: req.body.descricao || null,
    });

    // Confere conta existe
    const conta = await query(
      `SELECT id, descricao FROM contas_pagar WHERE id = $1`,
      [req.params.id],
    );
    if (!conta.rows[0]) {
      try { await fs.unlink(req.file.path); } catch {}
      throw new NaoEncontradoError('Conta a pagar não encontrada');
    }

    const tipo = TIPOS_PADRAO.includes(d.tipo) ? d.tipo : 'outro';

    const { rows } = await query(
      `INSERT INTO contas_pagar_anexos (
         conta_id, tipo, nome_original, arquivo_path,
         mime_type, tamanho_bytes, descricao, enviado_por_id
       ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       RETURNING *`,
      [
        req.params.id, tipo,
        req.file.originalname,
        caminhoRelativo(req.file),
        req.file.mimetype,
        req.file.size,
        d.descricao,
        req.pessoa.id,
      ],
    );

    await registrarAcao({
      acao: 'conta_pagar.anexo.criou',
      pessoa_acesso_id: req.pessoa.id,
      detalhes: {
        conta_id: req.params.id,
        anexo_id: rows[0].id,
        tipo,
        nome: req.file.originalname,
      },
      req,
    });

    res.status(201).json(rows[0]);
  } catch (err) {
    if (req.file) {
      try { await fs.unlink(req.file.path); } catch {}
    }
    next(err);
  }
}

/**
 * GET /api/contas-pagar/:id/anexos/:anexoId/baixar
 *
 * Stream do arquivo. Inline (não força download) pra dar pra abrir
 * PDF/imagem direto no navegador.
 */
export async function baixar(req, res, next) {
  try {
    const { rows } = await query(
      `SELECT * FROM contas_pagar_anexos
        WHERE id = $1 AND conta_id = $2`,
      [req.params.anexoId, req.params.id],
    );
    if (!rows[0]) throw new NaoEncontradoError('Anexo não encontrado');
    const anexo = rows[0];

    const abs = resolverCaminhoAbsoluto(anexo.arquivo_path);
    try {
      await fs.access(abs);
    } catch {
      throw new AppError(
        'Arquivo não encontrado no servidor (possível perda em redeploy sem volume).',
        410, 'arquivo_perdido',
      );
    }

    res.setHeader('Content-Type', anexo.mime_type || 'application/octet-stream');
    res.setHeader(
      'Content-Disposition',
      `inline; filename="${encodeURIComponent(anexo.nome_original)}"`,
    );
    const stream = (await import('node:fs')).createReadStream(abs);
    stream.pipe(res);
    stream.on('error', (err) => next(err));
  } catch (err) { next(err); }
}

/**
 * DELETE /api/contas-pagar/:id/anexos/:anexoId (admin)
 */
export async function excluir(req, res, next) {
  try {
    const { rows } = await query(
      `DELETE FROM contas_pagar_anexos
        WHERE id = $1 AND conta_id = $2
        RETURNING arquivo_path, nome_original`,
      [req.params.anexoId, req.params.id],
    );
    if (!rows[0]) throw new NaoEncontradoError('Anexo não encontrado');

    if (rows[0].arquivo_path) await apagarArquivo(rows[0].arquivo_path);

    await registrarAcao({
      acao: 'conta_pagar.anexo.excluiu',
      pessoa_acesso_id: req.pessoa.id,
      detalhes: {
        conta_id: req.params.id,
        anexo_id: req.params.anexoId,
        nome: rows[0].nome_original,
      },
      req,
    });

    res.status(204).send();
  } catch (err) { next(err); }
}
