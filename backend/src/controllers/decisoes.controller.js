import { z } from 'zod';
import { query, pool } from '../config/database.js';
import { NaoEncontradoError, AppError } from '../utils/errors.js';
import { registrarAcao } from '../utils/audit.js';
import {
  disparar,
  notificarPessoas,
  pessoasComPoder,
  lerConfig,
} from '../services/notificacoes.service.js';
import {
  tplDecisaoEmAprovacao,
  tplFinalizado,
} from '../services/email-templates.js';

/**
 * Decisões societárias — Sprint 6.
 *
 * Modelo: decisoes + aprovacoes_decisao.
 *
 * Fluxo:
 *   em_aprovacao → aprovada | rejeitada | cancelada
 *
 * Quem pode votar: pessoa logada com poder `pode_votar` no contexto
 * de algum sócio. Admin pode votar mesmo sem o poder, mas precisa
 * estar em algum contexto de sócio.
 *
 * Cada sócio = 1 voto. Pessoa que representa N sócios pode votar N vezes
 * (uma vez para cada — escolhendo o contexto).
 */

const dataIso = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Data deve estar no formato YYYY-MM-DD');

const criarSchema = z.object({
  titulo: z.string().min(2).max(255),
  descricao: z.string().min(2).max(10000),
  tipo: z.string().min(1).max(50).default('geral'),
  referencia_externa: z.string().max(255).optional().nullable(),
  data_proposta: dataIso.optional(),
  prazo_aprovacao: dataIso.optional().nullable(),
  quorum: z.enum(['maioria_simples', 'unanimidade']).default('maioria_simples'),
});

const atualizarSchema = criarSchema.partial();

const votarSchema = z.object({
  voto: z.enum(['aprovado', 'rejeitado', 'abstencao']),
  comentario: z.string().max(2000).optional().nullable(),
});

const cancelarSchema = z.object({
  motivo_cancelamento: z.string().min(3).max(500),
});

async function contarSociosElegiveis(client = null) {
  const q = client ?? { query: (...a) => query(...a) };
  const { rows } = await q.query(`SELECT COUNT(*)::int AS total FROM socios WHERE ativo = TRUE`);
  return rows[0].total;
}

async function avaliarAprovacao(client, decisaoId, quorum) {
  const { rows: votos } = await client.query(
    `SELECT voto, COUNT(*)::int AS qtd
       FROM aprovacoes_decisao WHERE decisao_id = $1 GROUP BY voto`,
    [decisaoId],
  );
  const contagem = { aprovado: 0, rejeitado: 0, abstencao: 0 };
  for (const r of votos) contagem[r.voto] = r.qtd;
  const totalSocios = await contarSociosElegiveis(client);

  if (quorum === 'unanimidade') {
    if (contagem.aprovado === totalSocios) return { status: 'aprovada', contagem, totalSocios };
    if (contagem.rejeitado > 0) return { status: 'rejeitada', contagem, totalSocios };
    return { status: 'em_aprovacao', contagem, totalSocios };
  }
  const limite = Math.floor(totalSocios / 2) + 1;
  if (contagem.aprovado >= limite) return { status: 'aprovada', contagem, totalSocios };
  if (contagem.rejeitado >= limite) return { status: 'rejeitada', contagem, totalSocios };
  return { status: 'em_aprovacao', contagem, totalSocios };
}

const SELECT_BASE = `
  SELECT d.*,
         p.nome AS criado_por_nome,
         (SELECT COUNT(*)::int FROM aprovacoes_decisao WHERE decisao_id = d.id AND voto='aprovado') AS qtd_aprovado,
         (SELECT COUNT(*)::int FROM aprovacoes_decisao WHERE decisao_id = d.id AND voto='rejeitado') AS qtd_rejeitado,
         (SELECT COUNT(*)::int FROM aprovacoes_decisao WHERE decisao_id = d.id AND voto='abstencao') AS qtd_abstencao
    FROM decisoes d
    LEFT JOIN pessoas_acesso p ON p.id = d.criado_por_id
`;

function formatar(d) {
  return {
    id: d.id,
    titulo: d.titulo,
    descricao: d.descricao,
    tipo: d.tipo,
    referencia_externa: d.referencia_externa,
    data_proposta: d.data_proposta,
    prazo_aprovacao: d.prazo_aprovacao,
    quorum: d.quorum,
    status: d.status,
    motivo_cancelamento: d.motivo_cancelamento,
    criado_em: d.criado_em,
    finalizada_em: d.finalizada_em,
    criado_por_nome: d.criado_por_nome,
    qtd_aprovado: Number(d.qtd_aprovado || 0),
    qtd_rejeitado: Number(d.qtd_rejeitado || 0),
    qtd_abstencao: Number(d.qtd_abstencao || 0),
  };
}

// =============================================================================
// Helpers de notificação (Sprint 7) — disparados via `disparar()`.
// =============================================================================

async function notificarDecisaoEmAprovacao(decRow) {
  const config = await lerConfig();
  const pessoas = await pessoasComPoder('pode_votar');
  if (!pessoas.length) return;

  const totalSocios = await contarSociosElegiveis();
  const tpl = tplDecisaoEmAprovacao({
    decisao: decRow,
    criadoPor: decRow.criado_por_nome,
    sociosTotal: totalSocios,
  });

  await notificarPessoas({
    pessoas,
    tipo: 'governanca.decisao_em_aprovacao',
    titulo: `Voto pendente: ${decRow.titulo}`,
    descricao: String(decRow.descricao || '').slice(0, 200) || 'Decisão aguardando voto',
    link: '/governanca/decisoes',
    contexto: { decisao_id: decRow.id },
    email: config.email_voto_pendente
      ? { assunto: tpl.assunto, html: tpl.html, template: 'decisao_em_aprovacao' }
      : null,
  });
}

async function notificarDecisaoFinalizada(decRow, avaliacao) {
  if (!decRow.criado_por_id) return;
  const config = await lerConfig();

  const { rows } = await query(
    `SELECT id, nome, email FROM pessoas_acesso WHERE id = $1 AND ativo = TRUE`,
    [decRow.criado_por_id],
  );
  const pessoa = rows[0];
  if (!pessoa) return;

  const tpl = tplFinalizado({
    titulo: decRow.titulo,
    statusFinal: avaliacao.status, // 'aprovada' | 'rejeitada'
    link: '/governanca/decisoes',
    comentarioContagem: avaliacao.contagem,
  });

  const rotulo = avaliacao.status === 'aprovada' ? 'Aprovada' : 'Rejeitada';
  await notificarPessoas({
    pessoas: [pessoa],
    tipo: 'governanca.decisao_finalizada',
    titulo: `${rotulo}: ${decRow.titulo}`,
    descricao: `${avaliacao.contagem.aprovado} aprovações · ${avaliacao.contagem.rejeitado} rejeições · ${avaliacao.contagem.abstencao} abstenções`,
    link: '/governanca/decisoes',
    contexto: { decisao_id: decRow.id, status: avaliacao.status },
    email: (config.email_documento_finalizado && pessoa.email)
      ? { assunto: tpl.assunto, html: tpl.html, template: 'decisao_finalizada' }
      : null,
  });
}

/**
 * GET /api/governanca/decisoes?status=...&ano=YYYY
 */
export async function listar(req, res, next) {
  try {
    const partes = [];
    const params = [];
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
      partes.push(`d.data_proposta BETWEEN $${params.length - 1}::date AND $${params.length}::date`);
    }
    const where = partes.length ? `WHERE ${partes.join(' AND ')}` : '';
    const { rows } = await query(
      `${SELECT_BASE} ${where}
       ORDER BY
         CASE d.status WHEN 'em_aprovacao' THEN 0 ELSE 1 END,
         d.data_proposta DESC,
         d.criado_em DESC`,
      params,
    );
    res.json(rows.map(formatar));
  } catch (err) { next(err); }
}

/**
 * GET /api/governanca/decisoes/:id
 */
export async function obter(req, res, next) {
  try {
    const dR = await query(`${SELECT_BASE} WHERE d.id = $1`, [req.params.id]);
    if (!dR.rows[0]) throw new NaoEncontradoError('Decisão não encontrada');

    const aprovacoesR = await query(
      `SELECT a.id, a.voto, a.comentario, a.registrado_em, a.atualizado_em,
              s.id AS socio_id, s.nome AS socio_nome,
              p.id AS pessoa_id, p.nome AS pessoa_nome
         FROM aprovacoes_decisao a
         JOIN socios s ON s.id = a.socio_id
    LEFT JOIN pessoas_acesso p ON p.id = a.pessoa_acesso_id
        WHERE a.decisao_id = $1
     ORDER BY a.registrado_em DESC`,
      [req.params.id],
    );

    const totalSocios = await contarSociosElegiveis();

    res.json({
      ...formatar(dR.rows[0]),
      aprovacoes: aprovacoesR.rows,
      total_socios_elegiveis: totalSocios,
    });
  } catch (err) { next(err); }
}

/**
 * POST /api/governanca/decisoes (admin)
 */
export async function criar(req, res, next) {
  try {
    const d = criarSchema.parse(req.body);
    const dataProposta = d.data_proposta || new Date().toISOString().slice(0, 10);

    const { rows } = await query(
      `INSERT INTO decisoes (
         titulo, descricao, tipo, referencia_externa,
         data_proposta, prazo_aprovacao, quorum, criado_por_id
       ) VALUES ($1,$2,$3,$4, $5,$6,$7,$8)
       RETURNING id`,
      [
        d.titulo, d.descricao, d.tipo, d.referencia_externa,
        dataProposta, d.prazo_aprovacao, d.quorum, req.pessoa?.id,
      ],
    );

    registrarAcao({
      acao: 'decisao.criou',
      pessoaId: req.pessoa?.id,
      socioId: req.representacaoAtual?.socio_id,
      detalhes: { id: rows[0].id, titulo: d.titulo },
    });

    const dR = await query(`${SELECT_BASE} WHERE d.id = $1`, [rows[0].id]);
    const decRow = dR.rows[0];

    // Sprint 7 — toda decisão é criada em em_aprovacao por padrão; avisa sócios.
    if (decRow.status === 'em_aprovacao') {
      disparar(() => notificarDecisaoEmAprovacao(decRow));
    }

    res.status(201).json(formatar(decRow));
  } catch (err) { next(err); }
}

/**
 * PUT /api/governanca/decisoes/:id (admin)
 * Só permitido enquanto em_aprovacao e sem votos.
 */
export async function atualizar(req, res, next) {
  try {
    const d = atualizarSchema.parse(req.body);

    const { rows: existentes } = await query(
      `SELECT status,
              (SELECT COUNT(*)::int FROM aprovacoes_decisao WHERE decisao_id = $1) AS qtd_votos
         FROM decisoes WHERE id = $1`,
      [req.params.id],
    );
    if (!existentes[0]) throw new NaoEncontradoError('Decisão não encontrada');
    if (existentes[0].status !== 'em_aprovacao') {
      throw new AppError(`Não dá pra editar decisão com status '${existentes[0].status}'`, 400);
    }
    if (existentes[0].qtd_votos > 0) {
      throw new AppError('Decisão já tem votos. Cancele e crie uma nova para mudar o conteúdo.', 400);
    }

    const updates = [];
    const params = [];
    for (const [k, v] of Object.entries(d)) {
      if (v === undefined) continue;
      params.push(v);
      updates.push(`${k} = $${params.length}`);
    }
    if (updates.length === 0) {
      const dR = await query(`${SELECT_BASE} WHERE d.id = $1`, [req.params.id]);
      return res.json(formatar(dR.rows[0]));
    }
    params.push(req.params.id);
    await query(`UPDATE decisoes SET ${updates.join(', ')} WHERE id = $${params.length}`, params);

    const dR = await query(`${SELECT_BASE} WHERE d.id = $1`, [req.params.id]);
    res.json(formatar(dR.rows[0]));
  } catch (err) { next(err); }
}

/**
 * POST /api/governanca/decisoes/:id/votar
 */
export async function votar(req, res, next) {
  const client = await pool.connect();
  try {
    const { voto, comentario } = votarSchema.parse(req.body);

    if (!req.representacaoAtual?.socio_id) {
      throw new AppError('Você precisa estar em um contexto de sócio para votar.', 400, 'sem_contexto');
    }

    await client.query('BEGIN');

    const dR = await client.query(
      `SELECT id, status, quorum FROM decisoes WHERE id = $1 FOR UPDATE`,
      [req.params.id],
    );
    if (!dR.rows[0]) throw new NaoEncontradoError('Decisão não encontrada');
    const dec = dR.rows[0];
    if (dec.status !== 'em_aprovacao') {
      throw new AppError(`Decisão não está em aprovação (status: ${dec.status}).`, 400);
    }

    if (!req.pessoa?.administrador && !req.representacaoAtual?.pode_votar) {
      throw new AppError('Você não tem o poder de votar neste contexto.', 403, 'sem_poder');
    }

    await client.query(
      `INSERT INTO aprovacoes_decisao (
         decisao_id, socio_id, pessoa_acesso_id, voto, comentario
       ) VALUES ($1,$2,$3,$4,$5)
       ON CONFLICT (decisao_id, socio_id) DO UPDATE
          SET voto = EXCLUDED.voto,
              comentario = EXCLUDED.comentario,
              pessoa_acesso_id = EXCLUDED.pessoa_acesso_id`,
      [req.params.id, req.representacaoAtual.socio_id, req.pessoa.id, voto, comentario || null],
    );

    const avaliacao = await avaliarAprovacao(client, req.params.id, dec.quorum);
    if (avaliacao.status !== 'em_aprovacao') {
      await client.query(
        `UPDATE decisoes SET status = $1, finalizada_em = NOW() WHERE id = $2`,
        [avaliacao.status, req.params.id],
      );
    }

    await client.query('COMMIT');

    registrarAcao({
      acao: 'decisao.votou',
      pessoaId: req.pessoa.id,
      socioId: req.representacaoAtual.socio_id,
      detalhes: { decisao_id: req.params.id, voto, novo_status: avaliacao.status },
    });

    const final = await query(`${SELECT_BASE} WHERE d.id = $1`, [req.params.id]);
    const decRow = final.rows[0];

    // Sprint 7 — se finalizou agora, avisa o criador.
    if (avaliacao.status === 'aprovada' || avaliacao.status === 'rejeitada') {
      disparar(() => notificarDecisaoFinalizada(decRow, avaliacao));
    }

    res.json({ decisao: formatar(decRow), avaliacao });
  } catch (err) {
    try { await client.query('ROLLBACK'); } catch {}
    next(err);
  } finally {
    client.release();
  }
}

/**
 * POST /api/governanca/decisoes/:id/cancelar (admin)
 */
export async function cancelar(req, res, next) {
  try {
    const { motivo_cancelamento } = cancelarSchema.parse(req.body);
    const { rows } = await query(
      `UPDATE decisoes
          SET status = 'cancelada',
              motivo_cancelamento = $1,
              finalizada_em = NOW()
        WHERE id = $2 AND status = 'em_aprovacao'
       RETURNING id`,
      [motivo_cancelamento, req.params.id],
    );
    if (!rows[0]) {
      throw new AppError('Decisão não encontrada ou já finalizada.', 400);
    }

    registrarAcao({
      acao: 'decisao.cancelou',
      pessoaId: req.pessoa?.id,
      socioId: req.representacaoAtual?.socio_id,
      detalhes: { id: req.params.id, motivo: motivo_cancelamento },
    });

    const dR = await query(`${SELECT_BASE} WHERE d.id = $1`, [req.params.id]);
    res.json(formatar(dR.rows[0]));
  } catch (err) { next(err); }
}
