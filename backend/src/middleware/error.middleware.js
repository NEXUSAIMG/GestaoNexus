import { ZodError } from 'zod';
import { AppError } from '../utils/errors.js';
import { isDevelopment } from '../config/env.js';

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
