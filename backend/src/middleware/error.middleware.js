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
    return res.status(413).json({
      erro: mensagens[err.code] || 'Não consegui receber o arquivo enviado.',
      codigo: 'upload_recusado',
      detalhes: { motivo: err.code, limite_mb: env.UPLOADS_MAX_MB },
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
