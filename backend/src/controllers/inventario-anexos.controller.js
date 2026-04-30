import { promises as fs } from 'node:fs';
import { z } from 'zod';
import { query } from '../config/database.js';
import { NaoEncontradoError, AppError } from '../utils/errors.js';
import { registrarAcao } from '../utils/audit.js';
import { resolverCaminhoAbsoluto, apagarArquivo, caminhoRelativo } from '../utils/uploads.js';

/**
 * Anexos de itens do inventário — Sprint 17.
 *
 * Cada item pode ter N anexos (NF, foto, manual, etc). Upload via
 * multipart/form-data com campo `arquivo`. Limite de tamanho e MIME
 * controlados pelo middleware `uploaderInventario()`.
 *
 * Cada upload/delete dispara movimento do tipo 'anexo' no histórico.
 */

const TIPOS = ['nf', 'foto', 'manual', 'outro'];

const criarSchema = z.object({
  tipo: z.enum(TIPOS).default('outro'),
  descricao: z.string().max(500).optional().nullable(),
});

/**
 * GET /api/inventario/:id/anexos
 */
export async function listar(req, res, next) {
  try {
    const { rows } = await query(
      `SELECT a.*, p.nome AS enviado_por_nome
         FROM inventario_anexos a
         LEFT JOIN pessoas_acesso p ON p.id = a.enviado_por_id
        WHERE a.item_id = $1
        ORDER BY a.criado_em DESC`,
      [req.params.id],
    );
    res.json(rows);
  } catch (err) { next(err); }
}

/**
 * POST /api/inventario/:id/anexos (admin)
 *
 * Espera multipart/form-data com:
 *   - arquivo: o arquivo em si
 *   - tipo: nf | foto | manual | outro (default outro)
 *   - descricao: texto opcional
 */
export async function criar(req, res, next) {
  try {
    if (!req.file) throw new AppError('Nenhum arquivo enviado.', 400);

    const corpo = {
      tipo: req.body.tipo || 'outro',
      descricao: req.body.descricao || null,
    };
    const d = criarSchema.parse(corpo);

    // Confere item existe
    const itR = await query(
      `SELECT id, codigo FROM inventario_itens WHERE id = $1`,
      [req.params.id],
    );
    if (!itR.rows[0]) {
      try { await fs.unlink(req.file.path); } catch {}
      throw new NaoEncontradoError('Item não encontrado');
    }

    const { rows } = await query(
      `INSERT INTO inventario_anexos (
         item_id, tipo, nome_original, arquivo_path,
         mime_type, tamanho_bytes, descricao, enviado_por_id
       ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       RETURNING *`,
      [
        req.params.id, d.tipo,
        req.file.originalname,
        caminhoRelativo(req.file),
        req.file.mimetype,
        req.file.size,
        d.descricao,
        req.pessoa.id,
      ],
    );

    // Registra movimento no histórico
    await query(
      `INSERT INTO inventario_movimentos (
         item_id, tipo, observacao, detalhes, feito_por_id
       ) VALUES ($1, 'anexo', $2, $3, $4)`,
      [
        req.params.id,
        `Anexo adicionado: ${req.file.originalname}`,
        JSON.stringify({
          acao: 'adicionou',
          tipo: d.tipo,
          nome: req.file.originalname,
          tamanho: req.file.size,
        }),
        req.pessoa.id,
      ],
    );

    registrarAcao({
      acao: 'inventario.anexo.criou',
      pessoa_acesso_id: req.pessoa.id,
      detalhes: {
        item_id: req.params.id, codigo: itR.rows[0].codigo,
        anexo_id: rows[0].id, tipo: d.tipo, nome: req.file.originalname,
      },
      req,
    });

    res.status(201).json(rows[0]);
  } catch (err) {
    // Limpa arquivo órfão se algo deu errado depois do upload
    if (req.file) {
      try { await fs.unlink(req.file.path); } catch {}
    }
    next(err);
  }
}

/**
 * GET /api/inventario/:id/anexos/:anexoId/baixar
 *
 * Faz stream do arquivo. Auth já no middleware da rota.
 */
export async function baixar(req, res, next) {
  try {
    const { rows } = await query(
      `SELECT a.* FROM inventario_anexos a
        WHERE a.id = $1 AND a.item_id = $2`,
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
 * DELETE /api/inventario/:id/anexos/:anexoId (admin)
 */
export async function excluir(req, res, next) {
  try {
    const { rows } = await query(
      `DELETE FROM inventario_anexos
        WHERE id = $1 AND item_id = $2
        RETURNING arquivo_path, nome_original, tipo`,
      [req.params.anexoId, req.params.id],
    );
    if (!rows[0]) throw new NaoEncontradoError('Anexo não encontrado');

    // Apaga arquivo físico (best-effort)
    if (rows[0].arquivo_path) await apagarArquivo(rows[0].arquivo_path);

    // Movimento no histórico
    await query(
      `INSERT INTO inventario_movimentos (
         item_id, tipo, observacao, detalhes, feito_por_id
       ) VALUES ($1, 'anexo', $2, $3, $4)`,
      [
        req.params.id,
        `Anexo removido: ${rows[0].nome_original}`,
        JSON.stringify({
          acao: 'removeu',
          tipo: rows[0].tipo,
          nome: rows[0].nome_original,
        }),
        req.pessoa.id,
      ],
    );

    registrarAcao({
      acao: 'inventario.anexo.excluiu',
      pessoa_acesso_id: req.pessoa.id,
      detalhes: {
        item_id: req.params.id,
        anexo_id: req.params.anexoId,
        nome: rows[0].nome_original,
      },
      req,
    });

    res.status(204).send();
  } catch (err) { next(err); }
}
