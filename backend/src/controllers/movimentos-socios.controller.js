import { z } from 'zod';
import { query, pool } from '../config/database.js';
import { NaoEncontradoError, AppError } from '../utils/errors.js';
import { registrarAcao } from '../utils/audit.js';
import {
  disparar,
  notificarPessoas,
  pessoasDoSocio,
  lerConfig,
} from '../services/notificacoes.service.js';
import { tplMovimentoSocioCriado } from '../services/email-templates.js';

/**
 * Movimentos de sócios — Sprint 5.
 *
 * Três tipos:
 *   'pro_labore'   → SAÍDA. Recorrente mensal. Tem referencia_mes.
 *   'distribuicao' → SAÍDA. Vinculada a uma rodada (distribuicao_id).
 *   'aporte'       → ENTRADA. Sócio colocando dinheiro na empresa.
 *
 * Fluxo de estados:
 *   previsto → efetivado  (ajusta saldo da conta bancária, se informada)
 *            → cancelado  (motivo obrigatório)
 *
 * "Efetivado" é o estado que afeta caixa — é o equivalente a "pagar" do
 * contas_pagar. Distribuições geralmente são efetivadas em lote (via
 * /distribuicoes/:id/efetivar), mas aqui lidamos com a efetivação
 * individual também.
 */

const dataIso = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Data deve estar no formato YYYY-MM-DD');
const mesIso = z.string().regex(/^\d{4}-\d{2}$/, 'Mês deve estar no formato YYYY-MM');

// Pró-labore e aporte são criados manualmente. Distribuição só através
// do endpoint de distribuições (agrupa um cabeçalho para N sócios).
const criarSchema = z.object({
  socio_id: z.string().uuid(),
  tipo: z.enum(['pro_labore', 'aporte']),
  descricao: z.string().min(2).max(255),
  valor: z.number().positive(),
  data_prevista: dataIso,
  // Apenas para pro_labore:
  referencia_mes: mesIso.optional().nullable(),
  observacao: z.string().max(2000).optional().nullable(),
  comprovante_url: z.string().url().max(2048).optional().nullable(),
});

const atualizarSchema = criarSchema.partial().omit({ tipo: true, socio_id: true });

const efetivarSchema = z.object({
  data_efetivada: dataIso,
  conta_bancaria_id: z.string().uuid().optional().nullable(),
  forma_pagamento: z.enum([
    'pix', 'boleto', 'ted', 'cartao', 'dinheiro', 'debito_automatico', 'outro',
  ]).optional().nullable(),
  comprovante_url: z.string().url().max(2048).optional().nullable(),
  observacao: z.string().max(2000).optional().nullable(),
});

const cancelarSchema = z.object({
  motivo_cancelamento: z.string().min(3).max(500),
});

const listarSchema = z.object({
  socio_id: z.string().uuid().optional(),
  tipo: z.enum(['pro_labore', 'distribuicao', 'aporte']).optional(),
  status: z.enum(['previsto', 'efetivado', 'cancelado', 'todos']).optional(),
  ano: z.coerce.number().int().min(2000).max(2100).optional(),
});

const SELECT_COMPLETO = `
  SELECT m.*,
         s.nome       AS socio_nome,
         s.tipo_pessoa AS socio_tipo_pessoa,
         s.percentual_participacao AS socio_percentual,
         cb.apelido   AS conta_bancaria_apelido,
         d.descricao  AS distribuicao_descricao,
         d.referencia_periodo AS distribuicao_referencia
    FROM movimentos_socios m
    JOIN socios s ON s.id = m.socio_id
    LEFT JOIN contas_bancarias cb ON cb.id = m.conta_bancaria_id
    LEFT JOIN distribuicoes_lucros d ON d.id = m.distribuicao_id
`;

// =============================================================================
// Helpers de notificação (Sprint 7) — disparado via `disparar()` após criar.
// =============================================================================

/**
 * Avisa as pessoas titulares do sócio (in-app + e-mail) sobre o registro.
 */
async function notificarMovimentoCriado(movRow) {
  const config = await lerConfig();
  if (!config.email_movimento_socio_criado) {
    // Mesmo com e-mail desligado, mantemos a notificação in-app.
  }

  const pessoas = await pessoasDoSocio(movRow.socio_id);
  if (!pessoas.length) return;

  const tpl = tplMovimentoSocioCriado({
    movimento: movRow,
    socioNome: movRow.socio_nome,
  });

  await notificarPessoas({
    pessoas,
    tipo: 'movimento_socio.criado',
    titulo: tpl.assunto.replace(/^\[Gestão Ayio\]\s*/, ''),
    descricao: `${movRow.descricao} · R$ ${Number(movRow.valor).toFixed(2).replace('.', ',')}`,
    link: `/socios/${movRow.socio_id}/extrato`,
    contexto: { movimento_id: movRow.id, tipo: movRow.tipo },
    email: config.email_movimento_socio_criado
      ? { assunto: tpl.assunto, html: tpl.html, template: 'movimento_socio_criado' }
      : null,
  });
}

function serializar(m) {
  return {
    id: m.id,
    socio_id: m.socio_id,
    socio_nome: m.socio_nome,
    socio_tipo_pessoa: m.socio_tipo_pessoa,
    socio_percentual: m.socio_percentual != null ? Number(m.socio_percentual) : null,

    tipo: m.tipo,
    distribuicao_id: m.distribuicao_id,
    distribuicao_descricao: m.distribuicao_descricao,
    distribuicao_referencia: m.distribuicao_referencia,

    descricao: m.descricao,
    valor: Number(m.valor),

    data_prevista: m.data_prevista,
    data_efetivada: m.data_efetivada,
    referencia_mes: m.referencia_mes,

    status: m.status,

    conta_bancaria_id: m.conta_bancaria_id,
    conta_bancaria_apelido: m.conta_bancaria_apelido,
    forma_pagamento: m.forma_pagamento,

    motivo_cancelamento: m.motivo_cancelamento,
    observacao: m.observacao,
    comprovante_url: m.comprovante_url,

    // Sprint 7 — comprovante anexado no servidor (filesystem). Pode
    // coexistir com `comprovante_url` (link externo).
    comprovante_nome: m.comprovante_nome ?? null,
    comprovante_tamanho: m.comprovante_tamanho != null ? Number(m.comprovante_tamanho) : null,
    comprovante_mime: m.comprovante_mime ?? null,
    tem_comprovante: !!m.comprovante_caminho,

    created_at: m.created_at,
    updated_at: m.updated_at,
  };
}

/**
 * GET /api/movimentos-socios
 *
 * Filtros:
 *   ?socio_id=<uuid>
 *   ?tipo=pro_labore|distribuicao|aporte
 *   ?status=previsto|efetivado|cancelado|todos  (default: não-cancelados)
 *   ?ano=YYYY
 */
export async function listar(req, res, next) {
  try {
    const { socio_id, tipo, status, ano } = listarSchema.parse(req.query);

    const partes = [];
    const params = [];

    if (socio_id) {
      params.push(socio_id);
      partes.push(`m.socio_id = $${params.length}`);
    }
    if (tipo) {
      params.push(tipo);
      partes.push(`m.tipo = $${params.length}`);
    }
    if (status && status !== 'todos') {
      params.push(status);
      partes.push(`m.status = $${params.length}`);
    } else if (!status) {
      partes.push(`m.status <> 'cancelado'`);
    }
    if (ano) {
      params.push(`${ano}-01-01`);
      params.push(`${ano}-12-31`);
      const idxIni = params.length - 1;
      const idxFim = params.length;
      // Filtra pelo ano da efetivação (ou da previsão se ainda não efetivou)
      partes.push(`COALESCE(m.data_efetivada, m.data_prevista) BETWEEN $${idxIni}::date AND $${idxFim}::date`);
    }

    const where = partes.length ? `WHERE ${partes.join(' AND ')}` : '';
    const sql = `${SELECT_COMPLETO} ${where}
      ORDER BY COALESCE(m.data_efetivada, m.data_prevista) DESC, m.created_at DESC
      LIMIT 1000`;

    const { rows } = await query(sql, params);
    res.json(rows.map(serializar));
  } catch (err) { next(err); }
}

export async function obter(req, res, next) {
  try {
    const { rows } = await query(`${SELECT_COMPLETO} WHERE m.id = $1`, [req.params.id]);
    if (!rows[0]) throw new NaoEncontradoError('Movimento não encontrado');
    res.json(serializar(rows[0]));
  } catch (err) { next(err); }
}

/**
 * POST /api/movimentos-socios  (admin)
 * Cria um pró-labore ou aporte. Distribuição vem só via /distribuicoes.
 */
export async function criar(req, res, next) {
  try {
    const d = criarSchema.parse(req.body);

    // Pró-labore exige referencia_mes; aporte proíbe.
    if (d.tipo === 'pro_labore' && !d.referencia_mes) {
      throw new AppError('Pró-labore precisa de referência de mês (YYYY-MM)', 400);
    }
    if (d.tipo === 'aporte' && d.referencia_mes) {
      throw new AppError('Aporte não tem referência de mês', 400);
    }

    // Confere que o sócio existe e está ativo.
    const { rows: socios } = await query(
      `SELECT id, ativo, nome FROM socios WHERE id = $1`,
      [d.socio_id],
    );
    if (!socios[0]) throw new NaoEncontradoError('Sócio não encontrado');
    if (!socios[0].ativo) throw new AppError('Sócio está inativo', 400);

    // referencia_mes armazenamos como primeiro dia do mês.
    const referenciaMes = d.referencia_mes ? `${d.referencia_mes}-01` : null;

    const { rows } = await query(
      `INSERT INTO movimentos_socios
         (socio_id, tipo, descricao, valor,
          data_prevista, referencia_mes,
          observacao, comprovante_url, criado_por_id)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
       RETURNING id`,
      [
        d.socio_id, d.tipo, d.descricao.trim(), d.valor,
        d.data_prevista, referenciaMes,
        d.observacao?.trim() || null, d.comprovante_url?.trim() || null,
        req.pessoa.id,
      ],
    );

    const { rows: completas } = await query(
      `${SELECT_COMPLETO} WHERE m.id = $1`, [rows[0].id],
    );

    await registrarAcao({
      pessoa_acesso_id: req.pessoa.id,
      socio_id: d.socio_id,
      acao: `movimento_socio.criar.${d.tipo}`,
      detalhes: { movimento_id: rows[0].id, valor: d.valor, tipo: d.tipo },
      req,
    });

    // Sprint 7 — avisa o(s) titular(es) do sócio que há movimento novo.
    disparar(() => notificarMovimentoCriado(completas[0]));

    res.status(201).json(serializar(completas[0]));
  } catch (err) { next(err); }
}

/**
 * PUT /api/movimentos-socios/:id  (admin)
 * Só enquanto previsto.
 */
export async function atualizar(req, res, next) {
  try {
    const d = atualizarSchema.parse(req.body);
    const campos = Object.keys(d);
    if (campos.length === 0) throw new AppError('Nenhum campo para atualizar', 400);

    const { rows: atuais } = await query(
      `SELECT status, tipo FROM movimentos_socios WHERE id = $1`,
      [req.params.id],
    );
    if (!atuais[0]) throw new NaoEncontradoError('Movimento não encontrado');
    if (atuais[0].status !== 'previsto') {
      throw new AppError(
        'Só é possível editar movimentos previstos. Cancele e crie outro se precisar corrigir.',
        400,
      );
    }

    // Movimento vindo de distribuição não deve ser editado individualmente
    // — a edição passa pelo cabeçalho da distribuição.
    if (atuais[0].tipo === 'distribuicao') {
      throw new AppError(
        'Movimento de distribuição é gerenciado pela rodada. Edite a distribuição.',
        400,
      );
    }

    // Converte referencia_mes YYYY-MM → YYYY-MM-01 se veio.
    const dataSalvar = { ...d };
    if (d.referencia_mes !== undefined) {
      dataSalvar.referencia_mes = d.referencia_mes ? `${d.referencia_mes}-01` : null;
    }
    const dados = Object.entries(dataSalvar);
    const sets = dados.map(([c], i) => `${c} = $${i + 1}`).join(', ');
    const valores = dados.map(([, v]) => (typeof v === 'string' ? v.trim() : v));
    valores.push(req.params.id);

    await query(
      `UPDATE movimentos_socios SET ${sets}, updated_at = NOW()
        WHERE id = $${valores.length}`,
      valores,
    );

    const { rows: completas } = await query(
      `${SELECT_COMPLETO} WHERE m.id = $1`, [req.params.id],
    );

    await registrarAcao({
      pessoa_acesso_id: req.pessoa.id,
      socio_id: completas[0].socio_id,
      acao: 'movimento_socio.atualizar',
      detalhes: { movimento_id: req.params.id, campos },
      req,
    });

    res.json(serializar(completas[0]));
  } catch (err) { next(err); }
}

/**
 * POST /api/movimentos-socios/:id/efetivar  (admin)
 *
 * Transição para status='efetivado'. Se houver conta_bancaria_id, ajusta
 * o saldo: saída (pro_labore/distribuicao) desce, entrada (aporte) sobe.
 *
 * Internamente usa transação + FOR UPDATE.
 */
export async function efetivar(req, res, next) {
  const client = await pool.connect();
  try {
    const d = efetivarSchema.parse(req.body);

    await client.query('BEGIN');

    const { rows: atuais } = await client.query(
      `SELECT id, socio_id, tipo, valor, status
         FROM movimentos_socios WHERE id = $1 FOR UPDATE`,
      [req.params.id],
    );
    if (!atuais[0]) throw new NaoEncontradoError('Movimento não encontrado');
    if (atuais[0].status !== 'previsto') {
      throw new AppError('Só é possível efetivar movimentos previstos', 400);
    }

    await client.query(
      `UPDATE movimentos_socios
          SET status = 'efetivado',
              data_efetivada = $1,
              conta_bancaria_id = $2,
              forma_pagamento = $3,
              comprovante_url = COALESCE($4, comprovante_url),
              observacao = COALESCE($5, observacao),
              efetivado_por_id = $6,
              updated_at = NOW()
        WHERE id = $7`,
      [
        d.data_efetivada,
        d.conta_bancaria_id ?? null,
        d.forma_pagamento ?? null,
        d.comprovante_url?.trim() || null,
        d.observacao?.trim() || null,
        req.pessoa.id,
        req.params.id,
      ],
    );

    // Ajuste de saldo da conta bancária (se informada).
    if (d.conta_bancaria_id) {
      const sinal = atuais[0].tipo === 'aporte' ? '+' : '-';
      await client.query(
        `UPDATE contas_bancarias
            SET saldo_atual = saldo_atual ${sinal} $1,
                saldo_atualizado_em = NOW(),
                saldo_atualizado_por = $2,
                updated_at = NOW()
          WHERE id = $3 AND ativo = TRUE`,
        [Number(atuais[0].valor), req.pessoa.id, d.conta_bancaria_id],
      );
    }

    const { rows: completas } = await client.query(
      `${SELECT_COMPLETO} WHERE m.id = $1`, [req.params.id],
    );

    await client.query('COMMIT');

    await registrarAcao({
      pessoa_acesso_id: req.pessoa.id,
      socio_id: atuais[0].socio_id,
      acao: `movimento_socio.efetivar.${atuais[0].tipo}`,
      detalhes: {
        movimento_id: req.params.id,
        valor: Number(atuais[0].valor),
        data_efetivada: d.data_efetivada,
        conta_bancaria_id: d.conta_bancaria_id ?? null,
      },
      req,
    });

    res.json(serializar(completas[0]));
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    next(err);
  } finally {
    client.release();
  }
}

/**
 * POST /api/movimentos-socios/:id/cancelar  (admin)
 */
export async function cancelar(req, res, next) {
  try {
    const { motivo_cancelamento } = cancelarSchema.parse(req.body);

    const { rows: atuais } = await query(
      `SELECT status, tipo, socio_id FROM movimentos_socios WHERE id = $1`,
      [req.params.id],
    );
    if (!atuais[0]) throw new NaoEncontradoError('Movimento não encontrado');
    if (atuais[0].status === 'cancelado') {
      throw new AppError('Movimento já está cancelado', 400);
    }
    if (atuais[0].status === 'efetivado') {
      throw new AppError(
        'Movimentos efetivados não podem ser cancelados (afetaria o saldo já registrado). ' +
        'Se precisar estornar, crie um movimento inverso manualmente.',
        400,
      );
    }

    await query(
      `UPDATE movimentos_socios
          SET status = 'cancelado',
              motivo_cancelamento = $1,
              cancelado_por_id = $2,
              updated_at = NOW()
        WHERE id = $3`,
      [motivo_cancelamento, req.pessoa.id, req.params.id],
    );

    const { rows: completas } = await query(
      `${SELECT_COMPLETO} WHERE m.id = $1`, [req.params.id],
    );

    await registrarAcao({
      pessoa_acesso_id: req.pessoa.id,
      socio_id: atuais[0].socio_id,
      acao: 'movimento_socio.cancelar',
      detalhes: { movimento_id: req.params.id, motivo: motivo_cancelamento },
      req,
    });

    res.json(serializar(completas[0]));
  } catch (err) { next(err); }
}

/**
 * GET /api/movimentos-socios/resumo
 *
 * Totais globais por tipo + resumo por sócio. Usado no painel de
 * Sócios & Lucros. Aceita ?ano=YYYY (default: ano corrente).
 */
export async function resumo(req, res, next) {
  try {
    const ano = req.query.ano
      ? Number(req.query.ano)
      : new Date().getFullYear();

    const inicio = `${ano}-01-01`;
    const fim = `${ano}-12-31`;

    const [totaisR, porSocioR] = await Promise.all([
      query(
        `SELECT
            tipo,
            COALESCE(SUM(CASE WHEN status = 'efetivado' THEN valor ELSE 0 END), 0) AS total_efetivado,
            COUNT(*) FILTER (WHERE status = 'efetivado')::int AS qtd_efetivado,
            COALESCE(SUM(CASE WHEN status = 'previsto'  THEN valor ELSE 0 END), 0) AS total_previsto,
            COUNT(*) FILTER (WHERE status = 'previsto')::int AS qtd_previsto
           FROM movimentos_socios
          WHERE COALESCE(data_efetivada, data_prevista) BETWEEN $1::date AND $2::date
         GROUP BY tipo`,
        [inicio, fim],
      ),
      query(
        `SELECT
            s.id AS socio_id,
            s.nome AS socio_nome,
            s.percentual_participacao,
            COALESCE(SUM(CASE WHEN m.tipo = 'pro_labore'   AND m.status = 'efetivado' THEN m.valor ELSE 0 END), 0) AS pro_labore_efetivado,
            COALESCE(SUM(CASE WHEN m.tipo = 'distribuicao' AND m.status = 'efetivado' THEN m.valor ELSE 0 END), 0) AS distribuicao_efetivado,
            COALESCE(SUM(CASE WHEN m.tipo = 'aporte'       AND m.status = 'efetivado' THEN m.valor ELSE 0 END), 0) AS aporte_efetivado
           FROM socios s
      LEFT JOIN movimentos_socios m
             ON m.socio_id = s.id
            AND COALESCE(m.data_efetivada, m.data_prevista) BETWEEN $1::date AND $2::date
          WHERE s.ativo = TRUE
       GROUP BY s.id, s.nome, s.percentual_participacao
       ORDER BY s.percentual_participacao DESC NULLS LAST, s.nome`,
        [inicio, fim],
      ),
    ]);

    const tipoInicial = { total_efetivado: 0, qtd_efetivado: 0, total_previsto: 0, qtd_previsto: 0 };
    const totais = {
      pro_labore: { ...tipoInicial },
      distribuicao: { ...tipoInicial },
      aporte: { ...tipoInicial },
    };
    for (const row of totaisR.rows) {
      totais[row.tipo] = {
        total_efetivado: Number(row.total_efetivado),
        qtd_efetivado: row.qtd_efetivado,
        total_previsto: Number(row.total_previsto),
        qtd_previsto: row.qtd_previsto,
      };
    }

    const por_socio = porSocioR.rows.map((s) => ({
      socio_id: s.socio_id,
      socio_nome: s.socio_nome,
      percentual_participacao: s.percentual_participacao != null ? Number(s.percentual_participacao) : null,
      pro_labore:   Number(s.pro_labore_efetivado),
      distribuicao: Number(s.distribuicao_efetivado),
      aporte:       Number(s.aporte_efetivado),
      total_recebido: Number(s.pro_labore_efetivado) + Number(s.distribuicao_efetivado),
    }));

    res.json({ ano, totais, por_socio });
  } catch (err) { next(err); }
}

/**
 * GET /api/socios/:id/extrato?ano=YYYY
 *
 * Extrato consolidado de UM sócio (todos os movimentos do ano + totais).
 * Usado para a tela de extrato individual e para gerar o PDF de IR.
 */
export async function extratoSocio(req, res, next) {
  try {
    const ano = req.query.ano ? Number(req.query.ano) : new Date().getFullYear();
    const inicio = `${ano}-01-01`;
    const fim = `${ano}-12-31`;

    const [socioR, movR, totaisR] = await Promise.all([
      query(
        `SELECT id, nome, tipo_pessoa, documento, email,
                percentual_participacao, data_entrada, ativo
           FROM socios WHERE id = $1`,
        [req.params.id],
      ),
      query(
        `${SELECT_COMPLETO}
           WHERE m.socio_id = $1
             AND COALESCE(m.data_efetivada, m.data_prevista) BETWEEN $2::date AND $3::date
             AND m.status <> 'cancelado'
           ORDER BY COALESCE(m.data_efetivada, m.data_prevista) DESC`,
        [req.params.id, inicio, fim],
      ),
      query(
        `SELECT
            tipo, status,
            COALESCE(SUM(valor), 0) AS total,
            COUNT(*)::int AS qtd
           FROM movimentos_socios
          WHERE socio_id = $1
            AND COALESCE(data_efetivada, data_prevista) BETWEEN $2::date AND $3::date
            AND status <> 'cancelado'
       GROUP BY tipo, status`,
        [req.params.id, inicio, fim],
      ),
    ]);

    if (!socioR.rows[0]) throw new NaoEncontradoError('Sócio não encontrado');

    const socio = {
      id: socioR.rows[0].id,
      nome: socioR.rows[0].nome,
      tipo_pessoa: socioR.rows[0].tipo_pessoa,
      documento: socioR.rows[0].documento,
      email: socioR.rows[0].email,
      percentual_participacao: socioR.rows[0].percentual_participacao != null
        ? Number(socioR.rows[0].percentual_participacao) : null,
      data_entrada: socioR.rows[0].data_entrada,
      ativo: socioR.rows[0].ativo,
    };

    // Agrupa os totais por tipo/status pra facilitar consumo no frontend.
    const vazio = { efetivado: 0, previsto: 0 };
    const totais = {
      pro_labore:   { ...vazio },
      distribuicao: { ...vazio },
      aporte:       { ...vazio },
    };
    for (const row of totaisR.rows) {
      totais[row.tipo][row.status] = Number(row.total);
    }

    res.json({
      socio,
      ano,
      movimentos: movR.rows.map(serializar),
      totais,
    });
  } catch (err) { next(err); }
}
