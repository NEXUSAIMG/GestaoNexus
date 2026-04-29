/**
 * Helper de uploads — Sprint 6.
 *
 * Configura o multer para receber upload de arquivos de governança
 * (atas, contratos), salvando em filesystem local com nome aleatório
 * pra evitar colisão e ataques de path traversal.
 *
 * IMPORTANTE: a pasta `UPLOADS_DIR` deve persistir entre deploys. Em
 * Railway, isso exige um Volume montado no caminho da variável.
 */

import { promises as fs } from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import multer from 'multer';
import { env } from '../config/env.js';
import { AppError } from './errors.js';

// Subpastas por categoria pra organizar
const SUBPASTAS = {
  governanca: 'governanca',
  comprovantes: 'comprovantes',
};

/**
 * Resolve o caminho absoluto da pasta de uploads (cria se não existir).
 */
async function garantirPasta(subpasta) {
  const base = path.resolve(env.UPLOADS_DIR);
  const pasta = path.join(base, subpasta);
  await fs.mkdir(pasta, { recursive: true });
  return pasta;
}

/**
 * Tipos MIME permitidos para upload de governança. Lista deliberadamente
 * pequena pra evitar surpresas (ex: HTML executável, scripts).
 */
const MIME_PERMITIDOS_GOVERNANCA = new Set([
  'application/pdf',
  'image/png',
  'image/jpeg',
  'image/webp',
  // Aceita docx pq atas são frequentemente Word — recomendado converter
  // pra PDF antes, mas aceitamos.
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/msword',
]);

/**
 * Tipos MIME permitidos para comprovantes financeiros (pagamentos,
 * pró-labore, distribuições, aportes). Mais restritivo que governança:
 * a maioria dos comprovantes é PDF de banco ou print.
 */
const MIME_PERMITIDOS_COMPROVANTES = new Set([
  'application/pdf',
  'image/png',
  'image/jpeg',
  'image/webp',
]);

/**
 * Fabrica um middleware multer pra uma subpasta + lista de MIMEs.
 * Centraliza a configuração de storage/filename/limits/filter.
 */
function criarUploader({ subpasta, mimesPermitidos, descricaoTipos }) {
  const storage = multer.diskStorage({
    destination: async (_req, _file, cb) => {
      try {
        const pasta = await garantirPasta(subpasta);
        cb(null, pasta);
      } catch (err) {
        cb(err);
      }
    },
    filename: (_req, file, cb) => {
      const aleatorio = crypto.randomBytes(16).toString('hex');
      const ext = path.extname(file.originalname).toLowerCase().slice(0, 8);
      cb(null, `${aleatorio}${ext}`);
    },
  });

  return multer({
    storage,
    limits: {
      fileSize: env.UPLOADS_MAX_MB * 1024 * 1024,
      files: 1,
    },
    fileFilter: (_req, file, cb) => {
      if (!mimesPermitidos.has(file.mimetype)) {
        return cb(new AppError(
          `Tipo de arquivo não permitido (${file.mimetype}). Aceitamos ${descricaoTipos}.`,
          400,
          'tipo_arquivo_nao_permitido',
        ));
      }
      cb(null, true);
    },
  });
}

/**
 * Cria um multer pré-configurado para uploads de governança.
 * Salva o arquivo na pasta UPLOADS_DIR/governanca com nome hash + extensão original.
 */
export function uploaderGovernanca() {
  return criarUploader({
    subpasta: SUBPASTAS.governanca,
    mimesPermitidos: MIME_PERMITIDOS_GOVERNANCA,
    descricaoTipos: 'PDF, imagens (PNG/JPG/WebP) e Word',
  });
}

/**
 * Cria um multer pré-configurado para uploads de comprovantes financeiros
 * (anexados em movimentos de sócios e contas a pagar).
 */
export function uploaderComprovantes() {
  return criarUploader({
    subpasta: SUBPASTAS.comprovantes,
    mimesPermitidos: MIME_PERMITIDOS_COMPROVANTES,
    descricaoTipos: 'PDF e imagens (PNG/JPG/WebP)',
  });
}

/**
 * Resolve o caminho absoluto a partir do caminho relativo guardado no banco.
 * Validação anti-path-traversal: o caminho resolvido tem que estar dentro
 * de UPLOADS_DIR, senão recusamos.
 */
export function resolverCaminhoAbsoluto(caminhoRelativo) {
  if (!caminhoRelativo) return null;
  const base = path.resolve(env.UPLOADS_DIR);
  const abs = path.resolve(base, caminhoRelativo);
  if (!abs.startsWith(base + path.sep) && abs !== base) {
    throw new AppError('Caminho de arquivo inválido', 400, 'caminho_invalido');
  }
  return abs;
}

/**
 * Apaga um arquivo do filesystem (best-effort — não derruba caso já não exista).
 */
export async function apagarArquivo(caminhoRelativo) {
  if (!caminhoRelativo) return;
  try {
    const abs = resolverCaminhoAbsoluto(caminhoRelativo);
    await fs.unlink(abs);
  } catch (err) {
    if (err.code !== 'ENOENT') {
      console.warn(`[uploads] falha ao apagar ${caminhoRelativo}: ${err.message}`);
    }
  }
}

/**
 * Retorna o caminho RELATIVO pra guardar no banco (a partir do absoluto
 * que o multer entregou).
 */
export function caminhoRelativo(arquivoMulter) {
  if (!arquivoMulter?.path) return null;
  const base = path.resolve(env.UPLOADS_DIR);
  return path.relative(base, arquivoMulter.path);
}
