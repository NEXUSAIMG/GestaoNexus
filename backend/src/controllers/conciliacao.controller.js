import multer from 'multer';
import { AppError } from '../utils/errors.js';
import { registrarAcao } from '../utils/audit.js';
import { parsearExtrato, conciliar } from '../services/conciliacao.service.js';

/**
 * Controller de conciliação bancária — Sprint 9.
 *
 * Endpoint único: POST /api/conciliacao/upload
 * Recebe um arquivo OFX ou CSV (multipart/form-data, campo `arquivo`),
 * processa em memória e devolve o relatório. Não persiste nada.
 */

// Memória, não disco — o arquivo não precisa ficar guardado.
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 5 * 1024 * 1024, // 5MB é mais que suficiente pra extratos
    files: 1,
  },
  fileFilter: (_req, file, cb) => {
    // Bancos exportam com vários MIMEs ("text/plain", "application/x-ofx",
    // "application/vnd.ms-excel" pra CSV...). Aceita por extensão e bloqueia
    // só executáveis óbvios.
    const nome = (file.originalname || '').toLowerCase();
    const ext = nome.slice(nome.lastIndexOf('.'));
    const ok = ['.ofx', '.qfx', '.csv', '.txt'].includes(ext);
    if (!ok) {
      return cb(new AppError(
        `Formato não suportado (${ext || 'sem extensão'}). Aceite: OFX, QFX, CSV.`,
        400,
        'formato_nao_suportado',
      ));
    }
    cb(null, true);
  },
});

export const middlewareUpload = upload.single('arquivo');

/**
 * POST /api/conciliacao/upload (admin)
 *
 * Resposta:
 * {
 *   total_transacoes: 42,
 *   conciliadas: 35,
 *   ambiguas: 2,
 *   nao_conciliadas: 5,
 *   transacoes: [{ data, valor, descricao, status, matches: [...] }]
 * }
 */
export async function uploadExtrato(req, res, next) {
  try {
    if (!req.file) {
      throw new AppError('Nenhum arquivo enviado.', 400, 'arquivo_obrigatorio');
    }

    const conteudo = req.file.buffer.toString('utf-8');
    const transacoes = parsearExtrato(conteudo, req.file.originalname);

    if (transacoes.length === 0) {
      throw new AppError('Nenhuma transação válida encontrada no arquivo.', 400, 'arquivo_vazio');
    }

    const resultado = await conciliar(transacoes);

    const conciliadas = resultado.filter((r) => r.status === 'conciliada').length;
    const ambiguas = resultado.filter((r) => r.status === 'ambigua').length;
    const naoConciliadas = resultado.filter((r) => r.status === 'nao_conciliada').length;

    registrarAcao({
      acao: 'conciliacao.upload',
      pessoaId: req.pessoa?.id,
      socioId: req.representacaoAtual?.socio_id,
      detalhes: {
        arquivo: req.file.originalname,
        total: resultado.length,
        conciliadas,
        ambiguas,
        nao_conciliadas: naoConciliadas,
      },
    });

    res.json({
      arquivo: req.file.originalname,
      total_transacoes: resultado.length,
      conciliadas,
      ambiguas,
      nao_conciliadas: naoConciliadas,
      transacoes: resultado,
    });
  } catch (err) { next(err); }
}
