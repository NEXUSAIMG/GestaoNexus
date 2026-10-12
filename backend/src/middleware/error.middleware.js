import { ZodError } from 'zod';
import { MulterError } from 'multer';
import { AppError } from '../utils/errors.js';
import { isDevelopment, env } from '../config/env.js';

/**
 * Middleware final que captura qualquer erro lançado nas rotas
 * e devolve uma resposta JSON consistente.
 */
// eslint-disable-next-line no-unused-vars
export function tratadorDeErros(err, _req, res, _next) {
  if (err instanceof ZodError) {
    return res.status(400).json({
      erro: 'Dados inválidos',
      codigo: 'validacao',
      detalhes: err.issues.map((i) => ({
        campo: i.path.join('.'),
        mensagem: i.message,
      })),
    });
  }

  if (err instanceof AppError) {
    // Sprint 34: erros de negócio podem carregar contexto acionável pra UI
    // (ex.: 409 do /cards/:id/mover devolve a lista de bloqueadores abertos
    // e o flag pode_forcar). Só repassamos quando o controller preencheu.
    return res.status(err.status).json({
      erro: err.message,
      codigo: err.codigo,
      ...(err.detalhes ? { detalhes: err.detalhes } : {}),
    });
  }

  // -------------------------------------------------------------------------
  // Upload recusado pelo multer.
  //
  // Sem este bloco, mandar um vídeo de 40 MB devolvia "Erro interno do
  // servidor": MulterError não é AppError nem ZodError, então caía no 500
  // genérico lá embaixo e o usuário não tinha como saber que o problema era
  // o tamanho do arquivo.
  // -------------------------------------------------------------------------
  if (err instanceof MulterError) {
    const mensagens = {
      LIMIT_FILE_SIZE: `Arquivo maior que o limite de ${env.UPLOADS_MAX_MB} MB.`,
      LIMIT_FILE_COUNT: 'Mais arquivos do que o permitido nesta operação.',
      LIMIT_UNEXPECTED_FILE: 'Campo de arquivo inesperado no envio.',
      LIMIT_PART_COUNT: 'Envio com partes demais.',
      LIMIT_FIELD_KEY: 'Nome de campo longo demais.',
      LIMIT_FIELD_VALUE: 'Valor de campo longo demais.',
      LIMIT_FIELD_COUNT: 'Campos demais no envio.',
    };
    // Card #83: loga o código do multer — é o que faltava para diagnosticar
    // "anexar imagem dá erro" sem precisar reproduzir.
    console.warn('[upload recusado]', {
      codigo: err.code, campo: err.field, limiteMb: env.UPLOADS_MAX_MB, mensagem: err.message,
    });
    const extra = err.code === 'LIMIT_FILE_SIZE'
      ? ' Reduza a imagem (ou envie um print em vez da foto) e tente de novo.'
      : '';
    return res.status(413).json({
      erro: (mensagens[err.code] || 'Não consegui receber o arquivo enviado.') + extra,
      codigo: 'upload_recusado',
      detalhes: { motivo: err.code, limite_mb: env.UPLOADS_MAX_MB },
    });
  }

  // -------------------------------------------------------------------------
  // Card #83 — falha ao GRAVAR o arquivo: pasta de uploads inexistente, sem
  // permissão ou disco cheio (ex.: Volume do Railway não montado; ver o
  // cabeçalho de utils/uploads.js). Sem este bloco, aparecia como "Erro
  // interno do servidor" — idêntico, para quem anexa, a um arquivo grande.
  // -------------------------------------------------------------------------
  if (['EACCES', 'EROFS', 'ENOSPC', 'ENOENT'].includes(err?.code) && err?.syscall) {
    console.error('[upload: falha de filesystem]', {
      codigo: err.code, syscall: err.syscall, caminho: err.path, uploadsDir: env.UPLOADS_DIR,
    });
    return res.status(503).json({
      erro: 'Não foi possível gravar o arquivo no servidor. '
        + 'A área de uploads está indisponível — avise o suporte.',
      codigo: 'uploads_indisponivel',
    });
  }

  // -------------------------------------------------------------------------
  // Corpo da requisição recusado pelo body-parser.
  //
  // Mesma história do bloco acima: o import de um board grande do Trello
  // estourava o limite do express.json e o erro (que já vem com status 413)
  // era traduzido como 500 porque ninguém olhava `err.status`.
  // -------------------------------------------------------------------------
  if (err?.type === 'entity.too.large') {
    return res.status(413).json({
      erro: 'O arquivo enviado é grande demais para uma requisição só.',
      codigo: 'payload_grande_demais',
    });
  }

  if (err?.type === 'entity.parse.failed') {
    return res.status(400).json({
      erro: 'O conteúdo enviado não é um JSON válido.',
      codigo: 'json_invalido',
    });
  }

  // Violação de unicidade do Postgres
  if (err?.code === '23505') {
    return res.status(409).json({
      erro: 'Já existe um registro com esses dados',
      codigo: 'duplicado',
    });
  }

  console.error('[erro não tratado]', err);

  return res.status(500).json({
    erro: 'Erro interno do servidor',
    codigo: 'interno',
    ...(isDevelopment ? { stack: err?.stack } : {}),
  });
}
