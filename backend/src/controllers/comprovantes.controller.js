/**
 * Comprovantes — Sprint 7.
 *
 * Endpoints de upload, download e exclusão de comprovantes financeiros.
 * Trabalha tanto com `movimentos_socios` quanto com `contas_pagar`. Reusa
 * a infra de filesystem da Sprint 6 (utils/uploads.js).
 *
 * Estratégia:
 *   - Os campos comprovante_nome / _caminho / _tamanho / _mime ficam direto
 *     na tabela do registro (movimentos_socios ou contas_pagar)
 *   - Cada registro tem no máximo 1 arquivo. Subir um novo apaga o anterior.
 *   - Qualquer pessoa autenticada pode baixar (transparência).
 *   - Apenas admin pode subir/apagar.
 */

import { promises as fs } from 'node:fs';
import { createReadStream } from 'node:fs';
import { query } from '../config/database.js';
import { NaoEncontradoError, AppError } from '../utils/errors.js';
import { registrarAcao } from '../utils/audit.js';
import { resolverCaminhoAbsoluto, apagarArquivo, caminhoRelativo } from '../utils/uploads.js';

/**
 * Tabelas suportadas. O routing usa o middleware abaixo pra mapear cada
 * endpoint pra uma tabela.
 */
const TABELAS = {
  movimento_socio: {
    tabela: 'movimentos_socios',
    nomeAcao: 'movimento_socio',
  },
  conta_pagar: {
    tabela: 'contas_pagar',
    nomeAcao: 'conta_pagar',
  },
};

/**
 * Middleware factory: define qual tabela este endpoint manipula.
 * Uso: router.post('/:id/comprovante', upload.single('arquivo'), comprovante.criar('movimento_socio'), ...)
 */
function obterConfig(qual) {
  const config = TABELAS[qual];
  if (!config) throw new Error(`Tabela inválida em comprovantes.controller: ${qual}`);
  return config;
}

/**
 * GET /:id/comprovante - faz stream do arquivo
 */
export function baixar(qual) {
  const { tabela } = obterConfig(qual);
  return async function (req, res, next) {
    try {
      const { rows } = await query(
        `SELECT comprovante_nome, comprovante_caminho, comprovante_mime
           FROM ${tabela} WHERE id = $1`,
        [req.params.id],
      );
      if (!rows[0]) throw new NaoEncontradoError('Registro não encontrado');
      const { comprovante_nome, comprovante_caminho, comprovante_mime } = rows[0];
      if (!comprovante_caminho) throw new AppError('Sem comprovante anexado', 404, 'sem_arquivo');

      const abs = resolverCaminhoAbsoluto(comprovante_caminho);
      try {
        await fs.access(abs);
      } catch {
        throw new AppError(
          'Arquivo não encontrado no servidor (possível perda em redeploy sem volume)',
          410,
          'arquivo_perdido',
        );
      }

      res.setHeader('Content-Type', comprovante_mime || 'application/octet-stream');
      res.setHeader(
        'Content-Disposition',
        `inline; filename="${encodeURIComponent(comprovante_nome || 'comprovante')}"`,
      );
      const stream = createReadStream(abs);
      stream.pipe(res);
      stream.on('error', (err) => next(err));
    } catch (err) { next(err); }
  };
}

/**
 * POST /:id/comprovante (multipart, campo 'arquivo')
 * Substitui o anterior se houver.
 */
export function anexar(qual) {
  const { tabela, nomeAcao } = obterConfig(qual);
  return async function (req, res, next) {
    try {
      if (!req.file) throw new AppError('Nenhum arquivo enviado', 400);

      // Lê o anterior pra apagar depois
      const atual = await query(
        `SELECT comprovante_caminho FROM ${tabela} WHERE id = $1`,
        [req.params.id],
      );
      if (!atual.rows[0]) {
        try { await fs.unlink(req.file.path); } catch {}
        throw new NaoEncontradoError('Registro não encontrado');
      }
      const caminhoAnterior = atual.rows[0].comprovante_caminho;

      const { rows } = await query(
        `UPDATE ${tabela}
            SET comprovante_nome     = $1,
                comprovante_caminho  = $2,
                comprovante_tamanho  = $3,
                comprovante_mime     = $4
          WHERE id = $5
          RETURNING id, comprovante_nome, comprovante_tamanho, comprovante_mime`,
        [
          req.file.originalname,
          caminhoRelativo(req.file),
          req.file.size,
          req.file.mimetype,
          req.params.id,
        ],
      );

      if (caminhoAnterior) await apagarArquivo(caminhoAnterior);

      registrarAcao({
        acao: `${nomeAcao}.anexou_comprovante`,
        pessoaId: req.pessoa?.id,
        socioId: req.representacaoAtual?.socio_id,
        detalhes: { id: req.params.id, nome: req.file.originalname },
      });

      res.json({
        id: rows[0].id,
        comprovante_nome: rows[0].comprovante_nome,
        comprovante_tamanho: rows[0].comprovante_tamanho != null ? Number(rows[0].comprovante_tamanho) : null,
        comprovante_mime: rows[0].comprovante_mime,
        tem_comprovante: true,
      });
    } catch (err) {
      // Limpa o arquivo órfão se algo falhou após upload
      if (req.file) {
        try { await fs.unlink(req.file.path); } catch {}
      }
      next(err);
    }
  };
}

/**
 * DELETE /:id/comprovante
 */
export function remover(qual) {
  const { tabela, nomeAcao } = obterConfig(qual);
  return async function (req, res, next) {
    try {
      // Lê o caminho atual antes de zerar, pra apagar o arquivo do disco depois.
      const atual = await query(
        `SELECT comprovante_caminho FROM ${tabela} WHERE id = $1`,
        [req.params.id],
      );
      if (!atual.rows[0]) throw new NaoEncontradoError('Registro não encontrado');
      const caminho = atual.rows[0].comprovante_caminho;
      if (!caminho) {
        // Nada a remover — idempotente.
        return res.json({ id: req.params.id, tem_comprovante: false });
      }

      await query(
        `UPDATE ${tabela}
            SET comprovante_nome    = NULL,
                comprovante_caminho = NULL,
                comprovante_tamanho = NULL,
                comprovante_mime    = NULL
          WHERE id = $1`,
        [req.params.id],
      );

      await apagarArquivo(caminho);

      registrarAcao({
        acao: `${nomeAcao}.removeu_comprovante`,
        pessoaId: req.pessoa?.id,
        socioId: req.representacaoAtual?.socio_id,
        detalhes: { id: req.params.id },
      });

      res.json({ id: req.params.id, tem_comprovante: false });
    } catch (err) { next(err); }
  };
}
