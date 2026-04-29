import { promises as fs } from 'node:fs';
import { z } from 'zod';
import { query, pool } from '../config/database.js';
import { NaoEncontradoError, AppError } from '../utils/errors.js';
import { registrarAcao } from '../utils/audit.js';
import { resolverCaminhoAbsoluto, apagarArquivo, caminhoRelativo } from '../utils/uploads.js';
import {
  disparar,
  notificarPessoas,
  pessoasComPoder,
  lerConfig,
  criarNotificacao,
} from '../services/notificacoes.service.js';
import {
  tplDocumentoEmAprovacao,
  tplFinalizado,
} from '../services/email-templates.js';

/**
 * Documentos de governança — atas, contratos sociais, outros.
 *
 * Modelo: documentos_governanca + aprovacoes_documento.
 *
 * Fluxo da ATA:
 *   rascunho → em_aprovacao → (aprovado | rejeitado) → arquivado
 *
 * Fluxo do CONTRATO SOCIAL:
 *   Igual ao da ata. Apenas UM contrato pode ter `vigente=true`. Para
 *   trocar o contrato vigente, o sistema desmarca o atual antes de
 *   marcar o novo.
 */

const dataIso = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Data deve estar no formato YYYY-MM-DD');

const criarSchema = z.object({
  tipo: z.enum(['ata', 'contrato_social', 'outro']),
  titulo: z.string().min(2).max(255),
  descricao: z.string().max(5000).optional().nullable(),
  data_referencia: dataIso,
  versao: z.number().int().positive().optional().nullable(),
  requer_aprovacao: z.boolean().default(true),
  quorum: z.enum(['maioria_simples', 'unanimidade']).default('maioria_simples'),
});

const atualizarSchema = criarSchema.partial().omit({ tipo: true });

const votarSchema = z.object({
  voto: z.enum(['aprovado', 'rejeitado', 'abstencao']),
  comentario: z.string().max(2000).optional().nullable(),
});

/**
 * Conta quantos sócios ativos existem (denominador do quorum).
 * Não usamos `socios.tipo_pessoa` aqui — qualquer sócio ativo conta.
 */
async function contarSociosElegiveis(client = null) {
  const q = client ?? { query: (...a) => query(...a) };
  const { rows } = await q.query(
    `SELECT COUNT(*)::int AS total FROM socios WHERE ativo = TRUE`,
  );
  return rows[0].total;
}

/**
 * Calcula o status de aprovação de um documento com base nos votos
 * registrados. Retorna { status, contagem }.
 *   - 'em_aprovacao' enquanto não atinge o quorum
 *   - 'aprovado' / 'rejeitado' quando atinge
 */
async function avaliarAprovacao(client, documentoId, quorum) {
  const { rows: votos } = await client.query(
    `SELECT voto, COUNT(*)::int AS qtd
       FROM aprovacoes_documento
      WHERE documento_id = $1
   GROUP BY voto`,
    [documentoId],
  );
  const contagem = { aprovado: 0, rejeitado: 0, abstencao: 0 };
  for (const r of votos) contagem[r.voto] = r.qtd;

  const totalSocios = await contarSociosElegiveis(client);

  // Unanimidade: todos os sócios precisam votar 'aprovado'.
  // Maioria simples: mais de 50% dos elegíveis votaram 'aprovado',
  //                  OU mais de 50% votaram 'rejeitado' (rejeita).
  if (quorum === 'unanimidade') {
    if (contagem.aprovado === totalSocios) return { status: 'aprovado', contagem, totalSocios };
    if (contagem.rejeitado > 0) return { status: 'rejeitado', contagem, totalSocios };
    return { status: 'em_aprovacao', contagem, totalSocios };
  }

  // Maioria simples
  const limite = Math.floor(totalSocios / 2) + 1;
  if (contagem.aprovado >= limite) return { status: 'aprovado', contagem, totalSocios };
  if (contagem.rejeitado >= limite) return { status: 'rejeitado', contagem, totalSocios };
  return { status: 'em_aprovacao', contagem, totalSocios };
}

function formatarDocumento(d) {
  return {
    id: d.id,
    tipo: d.tipo,
    titulo: d.titulo,
    descricao: d.descricao,
    data_referencia: d.data_referencia,
    arquivo_nome: d.arquivo_nome,
    tem_arquivo: !!d.arquivo_caminho,
    arquivo_tamanho: d.arquivo_tamanho != null ? Number(d.arquivo_tamanho) : null,
    arquivo_mime: d.arquivo_mime,
    versao: d.versao,
    vigente: d.vigente,
    requer_aprovacao: d.requer_aprovacao,
    quorum: d.quorum,
    status: d.status,
    criado_em: d.criado_em,
    atualizado_em: d.atualizado_em,
    criado_por_nome: d.criado_por_nome,
    // Contadores de aprovação (preenchidos via JOIN no listar/obter)
    qtd_aprovado: d.qtd_aprovado != null ? Number(d.qtd_aprovado) : 0,
    qtd_rejeitado: d.qtd_rejeitado != null ? Number(d.qtd_rejeitado) : 0,
    qtd_abstencao: d.qtd_abstencao != null ? Number(d.qtd_abstencao) : 0,
  };
}

const SELECT_DOC_BASE = `
  SELECT d.*,
         p.nome AS criado_por_nome,
         (SELECT COUNT(*)::int FROM aprovacoes_documento WHERE documento_id = d.id AND voto='aprovado') AS qtd_aprovado,
         (SELECT COUNT(*)::int FROM aprovacoes_documento WHERE documento_id = d.id AND voto='rejeitado') AS qtd_rejeitado,
         (SELECT COUNT(*)::int FROM aprovacoes_documento WHERE documento_id = d.id AND voto='abstencao') AS qtd_abstencao
    FROM documentos_governanca d
    LEFT JOIN pessoas_acesso p ON p.id = d.criado_por_id
`;

// =============================================================================
// Helpers de notificação (Sprint 7) — disparados via `disparar()` pra não
// bloquear o response. Falhas são capturadas e logadas dentro do helper.
// =============================================================================

function linkDoDocumento(tipo) {
  return tipo === 'contrato_social' ? '/governanca/contrato' : '/governanca/atas';
}

/**
 * Avisa sócios com poder de aprovação que um documento entrou em votação.
 */
async function notificarDocumentoEmAprovacao(docRow) {
  const config = await lerConfig();
  const poder = docRow.tipo === 'ata' ? 'pode_aprovar_atas' : 'pode_votar';
  const pessoas = await pessoasComPoder(poder);
  if (!pessoas.length) return;

  const totalSocios = await contarSociosElegiveis();
  const tpl = tplDocumentoEmAprovacao({
    documento: docRow,
    criadoPor: docRow.criado_por_nome,
    sociosTotal: totalSocios,
  });

  await notificarPessoas({
    pessoas,
    tipo: 'governanca.documento_em_aprovacao',
    titulo: `Voto pendente: ${docRow.titulo}`,
    descricao: docRow.descricao
      ? String(docRow.descricao).slice(0, 200)
      : `Aprovação solicitada (quórum: ${docRow.quorum === 'unanimidade' ? 'unanimidade' : 'maioria simples'})`,
    link: linkDoDocumento(docRow.tipo),
    contexto: { documento_id: docRow.id, tipo: docRow.tipo },
    email: config.email_voto_pendente
      ? { assunto: tpl.assunto, html: tpl.html, template: 'documento_em_aprovacao' }
      : null,
  });
}

/**
 * Avisa o criador de que o documento foi finalizado (aprovado ou rejeitado).
 */
async function notificarDocumentoFinalizado(docRow, avaliacao) {
  if (!docRow.criado_por_id) return;
  const config = await lerConfig();

  const { rows } = await query(
    `SELECT id, nome, email FROM pessoas_acesso WHERE id = $1 AND ativo = TRUE`,
    [docRow.criado_por_id],
  );
  const pessoa = rows[0];
  if (!pessoa) return;

  const tpl = tplFinalizado({
    titulo: docRow.titulo,
    statusFinal: avaliacao.status,
    link: linkDoDocumento(docRow.tipo),
    comentarioContagem: avaliacao.contagem,
  });

  const rotulo = avaliacao.status === 'aprovado' ? 'Aprovado' : 'Rejeitado';
  await notificarPessoas({
    pessoas: [pessoa],
    tipo: 'governanca.documento_finalizado',
    titulo: `${rotulo}: ${docRow.titulo}`,
    descricao: `${avaliacao.contagem.aprovado} aprovações · ${avaliacao.contagem.rejeitado} rejeições · ${avaliacao.contagem.abstencao} abstenções`,
    link: linkDoDocumento(docRow.tipo),
    contexto: { documento_id: docRow.id, status: avaliacao.status },
    email: (config.email_documento_finalizado && pessoa.email)
      ? { assunto: tpl.assunto, html: tpl.html, template: 'documento_finalizado' }
      : null,
  });
}

/**
 * GET /api/governanca/documentos
 *
 * Filtros:
 *   ?tipo=ata|contrato_social|outro
 *   ?status=rascunho|em_aprovacao|aprovado|rejeitado|arquivado
 *   ?ano=YYYY  (filtra por data_referencia)
 */
export async function listar(req, res, next) {
  try {
    const partes = [];
    const params = [];

    if (req.query.tipo) {
      params.push(req.query.tipo);
      partes.push(`d.tipo = $${params.length}`);
    }
    if (req.query.status) {
      params.push(req.query.status);
      partes.push(`d.status = $${params.length}`);
    }
    if (req.query.ano) {
      const ano = Number(req.query.ano);
      if (!Number.isInteger(ano) || ano < 1900 || ano > 2100) {
        throw new AppError('Ano inválido', 400);
      }
      params.push(`${ano}-01-01`, `${ano}-12-31`);
      partes.push(`d.data_referencia BETWEEN $${params.length - 1}::date AND $${params.length}::date`);
    }

    const where = partes.length ? `WHERE ${partes.join(' AND ')}` : '';
    const sql = `${SELECT_DOC_BASE} ${where}
                 ORDER BY d.vigente DESC, d.data_referencia DESC, d.criado_em DESC`;

    const { rows } = await query(sql, params);
    res.json(rows.map(formatarDocumento));
  } catch (err) { next(err); }
}

/**
 * GET /api/governanca/documentos/:id
 * Retorna o documento + lista de aprovações + status calculado.
 */
export async function obter(req, res, next) {
  try {
    const docR = await query(`${SELECT_DOC_BASE} WHERE d.id = $1`, [req.params.id]);
    if (!docR.rows[0]) throw new NaoEncontradoError('Documento não encontrado');

    const aprovacoesR = await query(
      `SELECT a.id, a.voto, a.comentario, a.registrado_em, a.atualizado_em,
              s.id AS socio_id, s.nome AS socio_nome,
              p.id AS pessoa_id, p.nome AS pessoa_nome
         FROM aprovacoes_documento a
         JOIN socios s ON s.id = a.socio_id
    LEFT JOIN pessoas_acesso p ON p.id = a.pessoa_acesso_id
        WHERE a.documento_id = $1
     ORDER BY a.registrado_em DESC`,
      [req.params.id],
    );

    const totalSocios = await contarSociosElegiveis();

    res.json({
      ...formatarDocumento(docR.rows[0]),
      aprovacoes: aprovacoesR.rows,
      total_socios_elegiveis: totalSocios,
    });
  } catch (err) { next(err); }
}

/**
 * GET /api/governanca/documentos/:id/arquivo
 * Faz o stream do arquivo. Exige autenticação (já no middleware).
 */
export async function baixarArquivo(req, res, next) {
  try {
    const { rows } = await query(
      `SELECT arquivo_caminho, arquivo_nome, arquivo_mime
         FROM documentos_governanca WHERE id = $1`,
      [req.params.id],
    );
    if (!rows[0]) throw new NaoEncontradoError('Documento não encontrado');
    const { arquivo_caminho, arquivo_nome, arquivo_mime } = rows[0];
    if (!arquivo_caminho) throw new AppError('Documento não tem arquivo anexado', 404, 'sem_arquivo');

    const abs = resolverCaminhoAbsoluto(arquivo_caminho);
    try {
      await fs.access(abs);
    } catch {
      throw new AppError(
        'Arquivo não encontrado no servidor (possível perda em redeploy sem volume)',
        410,
        'arquivo_perdido',
      );
    }

    res.setHeader('Content-Type', arquivo_mime || 'application/octet-stream');
    res.setHeader(
      'Content-Disposition',
      `inline; filename="${encodeURIComponent(arquivo_nome || 'documento')}"`,
    );
    const stream = (await import('node:fs')).createReadStream(abs);
    stream.pipe(res);
    stream.on('error', (err) => next(err));

    registrarAcao({
      acao: 'documento_governanca.baixou',
      pessoaId: req.pessoa?.id,
      socioId: req.representacaoAtual?.socio_id,
      detalhes: { documento_id: req.params.id },
    });
  } catch (err) { next(err); }
}

/**
 * POST /api/governanca/documentos
 * Cria documento (admin). Pode subir o arquivo no mesmo request via
 * multipart/form-data com campo `arquivo`, ou criar sem arquivo (rascunho).
 *
 * Os campos do JSON do documento vêm como campos do form, não como JSON.
 */
export async function criar(req, res, next) {
  try {
    // Quando vem multipart, os campos chegam em req.body como strings
    const corpo = {
      tipo: req.body.tipo,
      titulo: req.body.titulo,
      descricao: req.body.descricao || null,
      data_referencia: req.body.data_referencia,
      versao: req.body.versao ? Number(req.body.versao) : null,
      requer_aprovacao: req.body.requer_aprovacao !== 'false' && req.body.requer_aprovacao !== false,
      quorum: req.body.quorum || 'maioria_simples',
    };
    const d = criarSchema.parse(corpo);

    // Estado inicial: tem arquivo + requer aprovação → 'em_aprovacao'
    //                 tem arquivo + sem aprovação    → 'aprovado' (já vale)
    //                 sem arquivo                    → 'rascunho'
    let statusInicial = 'rascunho';
    if (req.file) {
      statusInicial = d.requer_aprovacao ? 'em_aprovacao' : 'aprovado';
    }

    const arquivoCampos = req.file
      ? {
          nome: req.file.originalname,
          caminho: caminhoRelativo(req.file),
          tamanho: req.file.size,
          mime: req.file.mimetype,
        }
      : { nome: null, caminho: null, tamanho: null, mime: null };

    const { rows } = await query(
      `INSERT INTO documentos_governanca (
         tipo, titulo, descricao, data_referencia,
         arquivo_nome, arquivo_caminho, arquivo_tamanho, arquivo_mime,
         versao, requer_aprovacao, quorum,
         status, criado_por_id
       ) VALUES ($1,$2,$3,$4, $5,$6,$7,$8, $9,$10,$11, $12,$13)
       RETURNING id`,
      [
        d.tipo, d.titulo, d.descricao, d.data_referencia,
        arquivoCampos.nome, arquivoCampos.caminho, arquivoCampos.tamanho, arquivoCampos.mime,
        d.versao, d.requer_aprovacao, d.quorum,
        statusInicial, req.pessoa?.id,
      ],
    );

    registrarAcao({
      acao: 'documento_governanca.criou',
      pessoaId: req.pessoa?.id,
      socioId: req.representacaoAtual?.socio_id,
      detalhes: { id: rows[0].id, tipo: d.tipo, titulo: d.titulo },
    });

    // Recupera com os contadores
    const docR = await query(`${SELECT_DOC_BASE} WHERE d.id = $1`, [rows[0].id]);
    const docRow = docR.rows[0];

    // Sprint 7 — notificar sócios com poder se entrou em votação.
    if (docRow.status === 'em_aprovacao') {
      disparar(() => notificarDocumentoEmAprovacao(docRow));
    }

    res.status(201).json(formatarDocumento(docRow));
  } catch (err) {
    // Se falhou depois do upload, limpa o arquivo órfão
    if (req.file) {
      try { await fs.unlink(req.file.path); } catch {}
    }
    next(err);
  }
}

/**
 * PUT /api/governanca/documentos/:id
 * Edita metadados (não o arquivo — pra trocar arquivo, usar /substituir-arquivo).
 * Só permitido em rascunho ou em_aprovacao (sem votos ainda).
 */
export async function atualizar(req, res, next) {
  try {
    const d = atualizarSchema.parse(req.body);

    const { rows: existentes } = await query(
      `SELECT status,
              (SELECT COUNT(*)::int FROM aprovacoes_documento WHERE documento_id = $1) AS qtd_votos
         FROM documentos_governanca WHERE id = $1`,
      [req.params.id],
    );
    if (!existentes[0]) throw new NaoEncontradoError('Documento não encontrado');
    if (!['rascunho', 'em_aprovacao'].includes(existentes[0].status)) {
      throw new AppError(`Não dá pra editar documento com status '${existentes[0].status}'`, 400);
    }
    if (existentes[0].qtd_votos > 0) {
      throw new AppError(
        'Documento já tem votos registrados. Para editar, cancele o documento e crie um novo.',
        400,
      );
    }

    const updates = [];
    const params = [];
    for (const [k, v] of Object.entries(d)) {
      if (v === undefined) continue;
      params.push(v);
      updates.push(`${k} = $${params.length}`);
    }
    if (updates.length === 0) {
      const docR = await query(`${SELECT_DOC_BASE} WHERE d.id = $1`, [req.params.id]);
      return res.json(formatarDocumento(docR.rows[0]));
    }
    params.push(req.params.id);
    await query(
      `UPDATE documentos_governanca SET ${updates.join(', ')} WHERE id = $${params.length}`,
      params,
    );

    registrarAcao({
      acao: 'documento_governanca.editou',
      pessoaId: req.pessoa?.id,
      socioId: req.representacaoAtual?.socio_id,
      detalhes: { id: req.params.id },
    });

    const docR = await query(`${SELECT_DOC_BASE} WHERE d.id = $1`, [req.params.id]);
    res.json(formatarDocumento(docR.rows[0]));
  } catch (err) { next(err); }
}

/**
 * POST /api/governanca/documentos/:id/arquivo
 * Substitui (ou anexa pela primeira vez) o arquivo do documento.
 */
export async function substituirArquivo(req, res, next) {
  try {
    if (!req.file) throw new AppError('Nenhum arquivo enviado', 400);

    const { rows } = await query(
      `SELECT arquivo_caminho, status,
              (SELECT COUNT(*)::int FROM aprovacoes_documento WHERE documento_id = $1) AS qtd_votos
         FROM documentos_governanca WHERE id = $1`,
      [req.params.id],
    );
    if (!rows[0]) {
      try { await fs.unlink(req.file.path); } catch {}
      throw new NaoEncontradoError('Documento não encontrado');
    }
    if (!['rascunho', 'em_aprovacao'].includes(rows[0].status) || rows[0].qtd_votos > 0) {
      try { await fs.unlink(req.file.path); } catch {}
      throw new AppError(
        'Não dá pra trocar o arquivo de um documento que já tem votos ou foi finalizado.',
        400,
      );
    }

    const arquivoAnterior = rows[0].arquivo_caminho;

    await query(
      `UPDATE documentos_governanca
          SET arquivo_nome = $1, arquivo_caminho = $2,
              arquivo_tamanho = $3, arquivo_mime = $4,
              status = CASE WHEN status = 'rascunho' AND requer_aprovacao = TRUE
                            THEN 'em_aprovacao'
                            WHEN status = 'rascunho' AND requer_aprovacao = FALSE
                            THEN 'aprovado'
                            ELSE status END
        WHERE id = $5`,
      [
        req.file.originalname,
        caminhoRelativo(req.file),
        req.file.size,
        req.file.mimetype,
        req.params.id,
      ],
    );

    // Apaga o arquivo antigo (best-effort)
    if (arquivoAnterior) await apagarArquivo(arquivoAnterior);

    registrarAcao({
      acao: 'documento_governanca.substituiu_arquivo',
      pessoaId: req.pessoa?.id,
      socioId: req.representacaoAtual?.socio_id,
      detalhes: { id: req.params.id },
    });

    const docR = await query(`${SELECT_DOC_BASE} WHERE d.id = $1`, [req.params.id]);
    const docRow = docR.rows[0];

    // Sprint 7 — se o status virou em_aprovacao agora, avisa sócios.
    if (docRow.status === 'em_aprovacao') {
      disparar(() => notificarDocumentoEmAprovacao(docRow));
    }

    res.json(formatarDocumento(docRow));
  } catch (err) {
    if (req.file) {
      try { await fs.unlink(req.file.path); } catch {}
    }
    next(err);
  }
}

/**
 * POST /api/governanca/documentos/:id/votar
 * Registra o voto do sócio do contexto atual.
 * Exige `pode_aprovar_atas` na representação ativa quando tipo='ata'.
 * Para outros tipos, exige `pode_votar`.
 */
export async function votar(req, res, next) {
  const client = await pool.connect();
  try {
    const { voto, comentario } = votarSchema.parse(req.body);

    if (!req.representacaoAtual?.socio_id) {
      throw new AppError('Você precisa estar em um contexto de sócio para votar.', 400, 'sem_contexto');
    }

    await client.query('BEGIN');

    // Lê o documento + verifica que está em aprovação
    const docR = await client.query(
      `SELECT id, tipo, status, quorum, requer_aprovacao
         FROM documentos_governanca WHERE id = $1 FOR UPDATE`,
      [req.params.id],
    );
    if (!docR.rows[0]) throw new NaoEncontradoError('Documento não encontrado');
    const doc = docR.rows[0];

    if (!doc.requer_aprovacao) {
      throw new AppError('Este documento não requer aprovação.', 400);
    }
    if (doc.status !== 'em_aprovacao') {
      throw new AppError(`Documento não está em aprovação (status: ${doc.status}).`, 400);
    }

    // Confere se a representação ativa tem o poder necessário.
    // Admin pode votar mesmo sem o poder (mas precisa estar em contexto de sócio).
    if (!req.pessoa?.administrador) {
      const podeVotar = doc.tipo === 'ata'
        ? !!req.representacaoAtual?.pode_aprovar_atas
        : !!req.representacaoAtual?.pode_votar;
      if (!podeVotar) {
        throw new AppError(
          doc.tipo === 'ata'
            ? 'Você não tem o poder de aprovar atas neste contexto.'
            : 'Você não tem o poder de votar neste contexto.',
          403,
          'sem_poder',
        );
      }
    }

    // UPSERT: voto único por (documento, sócio).
    await client.query(
      `INSERT INTO aprovacoes_documento (
         documento_id, socio_id, pessoa_acesso_id, voto, comentario
       ) VALUES ($1,$2,$3,$4,$5)
       ON CONFLICT (documento_id, socio_id) DO UPDATE
          SET voto = EXCLUDED.voto,
              comentario = EXCLUDED.comentario,
              pessoa_acesso_id = EXCLUDED.pessoa_acesso_id`,
      [req.params.id, req.representacaoAtual.socio_id, req.pessoa.id, voto, comentario || null],
    );

    // Reavalia o status do documento.
    const avaliacao = await avaliarAprovacao(client, req.params.id, doc.quorum);
    if (avaliacao.status !== 'em_aprovacao') {
      await client.query(
        `UPDATE documentos_governanca SET status = $1 WHERE id = $2`,
        [avaliacao.status, req.params.id],
      );
    }

    await client.query('COMMIT');

    registrarAcao({
      acao: 'documento_governanca.votou',
      pessoaId: req.pessoa.id,
      socioId: req.representacaoAtual.socio_id,
      detalhes: { documento_id: req.params.id, voto, novo_status: avaliacao.status },
    });

    const docFinal = await query(`${SELECT_DOC_BASE} WHERE d.id = $1`, [req.params.id]);
    const docRow = docFinal.rows[0];

    // Sprint 7 — se o documento foi finalizado neste voto, avisa o criador.
    if (avaliacao.status === 'aprovado' || avaliacao.status === 'rejeitado') {
      disparar(() => notificarDocumentoFinalizado(docRow, avaliacao));
    }

    res.json({
      documento: formatarDocumento(docRow),
      avaliacao,
    });
  } catch (err) {
    try { await client.query('ROLLBACK'); } catch {}
    next(err);
  } finally {
    client.release();
  }
}

/**
 * POST /api/governanca/documentos/:id/marcar-vigente
 * Apenas para contrato_social. Desmarca o atual vigente e marca este.
 * Só funciona em documento com status='aprovado'.
 */
export async function marcarVigente(req, res, next) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const { rows } = await client.query(
      `SELECT tipo, status FROM documentos_governanca WHERE id = $1 FOR UPDATE`,
      [req.params.id],
    );
    if (!rows[0]) throw new NaoEncontradoError('Documento não encontrado');
    if (rows[0].tipo !== 'contrato_social') {
      throw new AppError('Apenas contratos sociais podem ser marcados como vigentes.', 400);
    }
    if (rows[0].status !== 'aprovado') {
      throw new AppError('Só contratos aprovados podem virar vigentes.', 400);
    }

    // Desmarca o atual (se houver) e marca o novo. UNIQUE parcial garante.
    await client.query(
      `UPDATE documentos_governanca SET vigente = FALSE
        WHERE tipo = 'contrato_social' AND vigente = TRUE`,
    );
    await client.query(
      `UPDATE documentos_governanca SET vigente = TRUE WHERE id = $1`,
      [req.params.id],
    );

    await client.query('COMMIT');

    registrarAcao({
      acao: 'documento_governanca.marcou_vigente',
      pessoaId: req.pessoa?.id,
      socioId: req.representacaoAtual?.socio_id,
      detalhes: { id: req.params.id },
    });

    const docR = await query(`${SELECT_DOC_BASE} WHERE d.id = $1`, [req.params.id]);
    res.json(formatarDocumento(docR.rows[0]));
  } catch (err) {
    try { await client.query('ROLLBACK'); } catch {}
    next(err);
  } finally {
    client.release();
  }
}

/**
 * POST /api/governanca/documentos/:id/arquivar
 * Move pra status='arquivado'. Só não é permitido se vigente=true.
 */
export async function arquivar(req, res, next) {
  try {
    const { rows } = await query(
      `UPDATE documentos_governanca
          SET status = 'arquivado'
        WHERE id = $1 AND vigente = FALSE
       RETURNING id`,
      [req.params.id],
    );
    if (!rows[0]) {
      throw new AppError('Não é possível arquivar (documento não encontrado ou está vigente).', 400);
    }

    registrarAcao({
      acao: 'documento_governanca.arquivou',
      pessoaId: req.pessoa?.id,
      socioId: req.representacaoAtual?.socio_id,
      detalhes: { id: req.params.id },
    });

    const docR = await query(`${SELECT_DOC_BASE} WHERE d.id = $1`, [req.params.id]);
    res.json(formatarDocumento(docR.rows[0]));
  } catch (err) { next(err); }
}

/**
 * DELETE /api/governanca/documentos/:id
 * Exclui o documento + arquivo. Só rascunhos podem ser excluídos.
 */
export async function excluir(req, res, next) {
  try {
    const { rows } = await query(
      `DELETE FROM documentos_governanca
        WHERE id = $1 AND status = 'rascunho'
        RETURNING arquivo_caminho`,
      [req.params.id],
    );
    if (!rows[0]) {
      throw new AppError('Só é possível excluir rascunhos. Documentos em aprovação ou aprovados devem ser arquivados.', 400);
    }
    if (rows[0].arquivo_caminho) await apagarArquivo(rows[0].arquivo_caminho);

    registrarAcao({
      acao: 'documento_governanca.excluiu',
      pessoaId: req.pessoa?.id,
      socioId: req.representacaoAtual?.socio_id,
      detalhes: { id: req.params.id },
    });

    res.status(204).send();
  } catch (err) { next(err); }
}

/**
 * GET /api/governanca/contrato-vigente
 * Atalho usado no painel pra mostrar qual contrato está em vigor agora.
 */
export async function contratoVigente(_req, res, next) {
  try {
    const { rows } = await query(
      `${SELECT_DOC_BASE}
        WHERE d.tipo = 'contrato_social' AND d.vigente = TRUE
        LIMIT 1`,
    );
    res.json(rows[0] ? formatarDocumento(rows[0]) : null);
  } catch (err) { next(err); }
}
