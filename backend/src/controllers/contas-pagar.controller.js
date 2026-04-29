import { z } from 'zod';
import { query, pool } from '../config/database.js';
import { NaoEncontradoError, AppError } from '../utils/errors.js';
import { registrarAcao } from '../utils/audit.js';
import { gerarSerieContas } from '../services/recorrencia-contas.service.js';

/**
 * Contas a pagar — Sprint 3.
 *
 * Estados possíveis:
 *   'pendente'  → ainda não paga
 *   'paga'      → quitada (precisa de data_pagamento e valor_pago)
 *   'cancelada' → invalidada antes de pagar (precisa de motivo)
 *
 * Detalhe importante: uma conta "atrasada" não é um estado persistido;
 * é uma conta com status='pendente' e data_vencimento < hoje. O frontend
 * calcula, e a listagem aceita o filtro como se fosse um status virtual.
 */

const FORMAS_PAGAMENTO = [
  'pix', 'boleto', 'ted', 'cartao', 'dinheiro', 'debito_automatico', 'outro',
];

const dataIso = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Data deve estar em YYYY-MM-DD');

// Sub-objeto opcional pra recorrência. Se vier, vira uma SÉRIE de contas.
const recorrenciaSchema = z.object({
  tipo: z.enum(['mensal', 'trimestral', 'semestral', 'anual']),
  // Modo de fim: ou qtd, ou ate, ou nenhum (= infinito).
  qtd: z.number().int().min(1).max(240).optional().nullable(),
  ate: dataIso.optional().nullable(),
}).refine(
  (r) => !(r.qtd != null && r.ate != null),
  { message: 'Defina recorrência por quantidade OU por data limite, não os dois.' },
);

const criarSchema = z.object({
  descricao: z.string().min(2).max(255),
  fornecedor_nome: z.string().max(255).optional().nullable(),
  fornecedor_documento: z.string().max(20).optional().nullable(),
  categoria_id: z.string().uuid().optional().nullable(),
  valor: z.number().min(0),
  data_vencimento: z.string(), // ISO (YYYY-MM-DD)
  observacoes: z.string().max(2000).optional().nullable(),
  comprovante_url: z.string().url().max(2048).optional().nullable(),
  // Sprint 13 — recorrência opcional
  recorrencia: recorrenciaSchema.optional().nullable(),
});

const atualizarSchema = criarSchema.partial();

const pagarSchema = z.object({
  data_pagamento: z.string(),
  valor_pago: z.number().min(0).optional(),
  forma_pagamento: z.enum(FORMAS_PAGAMENTO).optional().nullable(),
  conta_bancaria_id: z.string().uuid().optional().nullable(),
  comprovante_url: z.string().url().max(2048).optional().nullable(),
  observacoes: z.string().max(2000).optional().nullable(),
});

const cancelarSchema = z.object({
  motivo_cancelamento: z.string().min(3).max(500),
});

const listarSchema = z.object({
  status: z.enum(['todas', 'pendentes', 'atrasadas', 'pagas', 'canceladas']).optional(),
  categoria_id: z.string().uuid().optional(),
  q: z.string().max(100).optional(),
  mes: z.string().regex(/^\d{4}-\d{2}$/).optional(), // YYYY-MM
});

const SELECT_COMPLETO = `
  SELECT cp.*,
         c.nome    AS categoria_nome,
         c.cor     AS categoria_cor,
         cb.apelido AS conta_bancaria_apelido
    FROM contas_pagar cp
    LEFT JOIN categorias_despesa c ON c.id = cp.categoria_id
    LEFT JOIN contas_bancarias cb  ON cb.id = cp.conta_bancaria_id
`;

function serializar(r) {
  return {
    id: r.id,
    descricao: r.descricao,
    fornecedor_nome: r.fornecedor_nome,
    fornecedor_documento: r.fornecedor_documento,

    categoria_id: r.categoria_id,
    categoria_nome: r.categoria_nome,
    categoria_cor: r.categoria_cor,

    valor: Number(r.valor),
    data_vencimento: r.data_vencimento,

    status: r.status,

    data_pagamento: r.data_pagamento,
    valor_pago: r.valor_pago != null ? Number(r.valor_pago) : null,
    forma_pagamento: r.forma_pagamento,
    conta_bancaria_id: r.conta_bancaria_id,
    conta_bancaria_apelido: r.conta_bancaria_apelido,

    motivo_cancelamento: r.motivo_cancelamento,
    comprovante_url: r.comprovante_url,
    observacoes: r.observacoes,

    // Sprint 7 — comprovante anexado no servidor (filesystem).
    comprovante_nome: r.comprovante_nome ?? null,
    comprovante_tamanho: r.comprovante_tamanho != null ? Number(r.comprovante_tamanho) : null,
    comprovante_mime: r.comprovante_mime ?? null,
    tem_comprovante: !!r.comprovante_caminho,

    // Sprint 13 — recorrência
    grupo_recorrencia_id: r.grupo_recorrencia_id ?? null,
    recorrencia_tipo: r.recorrencia_tipo ?? null,
    recorrencia_qtd: r.recorrencia_qtd ?? null,
    recorrencia_ate: r.recorrencia_ate ?? null,
    recorrencia_indice: r.recorrencia_indice ?? null,
    eh_recorrente: !!r.grupo_recorrencia_id,

    created_at: r.created_at,
    updated_at: r.updated_at,
  };
}

/**
 * GET /api/contas-pagar
 *
 * Filtros opcionais:
 *   ?status=pendentes|atrasadas|pagas|canceladas|todas  (default: pendentes)
 *   ?categoria_id=<uuid>
 *   ?q=texto  (busca em descrição e fornecedor)
 *   ?mes=YYYY-MM  (vencimento ou pagamento naquele mês)
 */
export async function listar(req, res, next) {
  try {
    const { status = 'pendentes', categoria_id, q, mes } = listarSchema.parse(req.query);

    const partes = [];
    const params = [];

    if (status === 'pendentes') {
      partes.push(`cp.status = 'pendente'`);
      partes.push(`cp.data_vencimento >= CURRENT_DATE`);
    } else if (status === 'atrasadas') {
      partes.push(`cp.status = 'pendente'`);
      partes.push(`cp.data_vencimento < CURRENT_DATE`);
    } else if (status === 'pagas') {
      partes.push(`cp.status = 'paga'`);
    } else if (status === 'canceladas') {
      partes.push(`cp.status = 'cancelada'`);
    }
    // 'todas' → sem filtro de status

    if (categoria_id) {
      params.push(categoria_id);
      partes.push(`cp.categoria_id = $${params.length}`);
    }

    if (q) {
      const termo = `%${q.replace(/[%_]/g, '\\$&')}%`;
      params.push(termo);
      const idx = params.length;
      partes.push(`(cp.descricao ILIKE $${idx} OR cp.fornecedor_nome ILIKE $${idx})`);
    }

    if (mes) {
      params.push(`${mes}-01`);
      const idx = params.length;
      partes.push(`(
        (cp.status = 'paga' AND date_trunc('month', cp.data_pagamento)  = date_trunc('month', $${idx}::date))
        OR
        (cp.status <> 'paga' AND date_trunc('month', cp.data_vencimento) = date_trunc('month', $${idx}::date))
      )`);
    }

    const where = partes.length ? `WHERE ${partes.join(' AND ')}` : '';
    const sql = `
      ${SELECT_COMPLETO}
      ${where}
      ORDER BY
        CASE cp.status WHEN 'pendente' THEN 0 WHEN 'paga' THEN 1 ELSE 2 END,
        COALESCE(cp.data_pagamento, cp.data_vencimento) DESC
      LIMIT 500
    `;

    const { rows } = await query(sql, params);
    res.json(rows.map(serializar));
  } catch (err) { next(err); }
}

/**
 * GET /api/contas-pagar/resumo
 *
 * Totais rápidos pra exibir no painel.
 */
export async function resumoContas(_req, res, next) {
  try {
    const { rows } = await query(`
      SELECT
        COALESCE(SUM(CASE
          WHEN status = 'pendente' AND data_vencimento >= CURRENT_DATE THEN valor ELSE 0 END), 0) AS valor_pendentes,
        COUNT(*) FILTER (
          WHERE status = 'pendente' AND data_vencimento >= CURRENT_DATE
        )::int AS qtd_pendentes,

        COALESCE(SUM(CASE
          WHEN status = 'pendente' AND data_vencimento < CURRENT_DATE THEN valor ELSE 0 END), 0) AS valor_atrasadas,
        COUNT(*) FILTER (
          WHERE status = 'pendente' AND data_vencimento < CURRENT_DATE
        )::int AS qtd_atrasadas,

        -- Importante: 'A sair em N dias' considera APENAS pendentes ainda não
        -- vencidas. As atrasadas são contadas à parte (acima). Bate com o
        -- subtítulo "Pendentes + atrasadas não incluídas" da UI.
        COALESCE(SUM(CASE
          WHEN status = 'pendente'
           AND data_vencimento >= CURRENT_DATE
           AND data_vencimento <= CURRENT_DATE + INTERVAL '30 days' THEN valor ELSE 0 END), 0) AS sair_em_30,
        COALESCE(SUM(CASE
          WHEN status = 'pendente'
           AND data_vencimento >= CURRENT_DATE
           AND data_vencimento <= CURRENT_DATE + INTERVAL '60 days' THEN valor ELSE 0 END), 0) AS sair_em_60,
        COALESCE(SUM(CASE
          WHEN status = 'pendente'
           AND data_vencimento >= CURRENT_DATE
           AND data_vencimento <= CURRENT_DATE + INTERVAL '90 days' THEN valor ELSE 0 END), 0) AS sair_em_90,

        COALESCE(SUM(CASE
          WHEN status = 'paga'
           AND data_pagamento >= CURRENT_DATE - INTERVAL '30 days' THEN valor_pago ELSE 0 END), 0) AS pago_ult_30
      FROM contas_pagar
    `);

    const r = rows[0];
    res.json({
      pendentes:  { valor: Number(r.valor_pendentes),  qtd: r.qtd_pendentes },
      atrasadas:  { valor: Number(r.valor_atrasadas),  qtd: r.qtd_atrasadas },
      saidas_previstas: {
        em_30: Number(r.sair_em_30),
        em_60: Number(r.sair_em_60),
        em_90: Number(r.sair_em_90),
      },
      pago_ultimos_30_dias: Number(r.pago_ult_30),
    });
  } catch (err) { next(err); }
}

export async function obter(req, res, next) {
  try {
    const { rows } = await query(`${SELECT_COMPLETO} WHERE cp.id = $1`, [req.params.id]);
    if (!rows[0]) throw new NaoEncontradoError('Conta não encontrada');
    res.json(serializar(rows[0]));
  } catch (err) { next(err); }
}

export async function criar(req, res, next) {
  const client = await pool.connect();
  try {
    const d = criarSchema.parse(req.body);

    const template = {
      descricao: d.descricao.trim(),
      fornecedor_nome: d.fornecedor_nome?.trim() || null,
      fornecedor_documento: d.fornecedor_documento?.trim() || null,
      categoria_id: d.categoria_id ?? null,
      valor: d.valor,
      observacoes: d.observacoes?.trim() || null,
      comprovante_url: d.comprovante_url?.trim() || null,
    };

    await client.query('BEGIN');

    let primeiroId;
    let qtdGeradas = 1;
    let grupoId = null;

    if (d.recorrencia) {
      // SÉRIE: gera N contas ligadas pelo mesmo grupo_recorrencia_id
      const r = await gerarSerieContas(client, {
        template,
        primeiraData: d.data_vencimento,
        tipo: d.recorrencia.tipo,
        qtd: d.recorrencia.qtd ?? null,
        ate: d.recorrencia.ate ?? null,
        pessoaId: req.pessoa.id,
      });
      grupoId = r.grupoId;
      qtdGeradas = r.contas.length;
      primeiroId = r.contas[0]?.id;
      if (!primeiroId) {
        throw new AppError('Não foi possível gerar nenhuma ocorrência. Confira a data inicial e o limite.', 400);
      }
    } else {
      // Conta única — caminho original
      const { rows } = await client.query(
        `INSERT INTO contas_pagar
           (descricao, fornecedor_nome, fornecedor_documento,
            categoria_id, valor, data_vencimento,
            observacoes, comprovante_url, criado_por_id)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
         RETURNING id`,
        [
          template.descricao,
          template.fornecedor_nome,
          template.fornecedor_documento,
          template.categoria_id,
          template.valor,
          d.data_vencimento,
          template.observacoes,
          template.comprovante_url,
          req.pessoa.id,
        ],
      );
      primeiroId = rows[0].id;
    }

    await client.query('COMMIT');

    const { rows: completas } = await query(`${SELECT_COMPLETO} WHERE cp.id = $1`, [primeiroId]);

    await registrarAcao({
      pessoa_acesso_id: req.pessoa.id,
      acao: d.recorrencia ? 'conta_pagar.criar_serie' : 'conta_pagar.criar',
      detalhes: {
        conta_id: primeiroId,
        descricao: d.descricao,
        valor: d.valor,
        vencimento: d.data_vencimento,
        ...(d.recorrencia && {
          grupo_id: grupoId,
          tipo: d.recorrencia.tipo,
          qtd_geradas: qtdGeradas,
        }),
      },
      req,
    });

    res.status(201).json({
      ...serializar(completas[0]),
      qtd_geradas: qtdGeradas,
    });
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    next(err);
  } finally {
    client.release();
  }
}

/**
 * POST /api/contas-pagar/grupo/:grupoId/cancelar-serie
 *
 * Cancela TODAS as ocorrências PENDENTES de uma série recorrente.
 * Preserva contas já pagas e já canceladas — histórico intacto.
 * Retorna { canceladas: N }.
 */
export async function cancelarSerie(req, res, next) {
  try {
    const { motivo_cancelamento } = cancelarSchema.parse(req.body);

    const { rows: existe } = await query(
      `SELECT COUNT(*)::int AS qtd FROM contas_pagar WHERE grupo_recorrencia_id = $1`,
      [req.params.grupoId],
    );
    if (existe[0].qtd === 0) {
      throw new NaoEncontradoError('Série não encontrada');
    }

    const { rows } = await query(
      `UPDATE contas_pagar
          SET status = 'cancelada',
              motivo_cancelamento = $1,
              cancelado_por_id = $2,
              updated_at = NOW()
        WHERE grupo_recorrencia_id = $3
          AND status = 'pendente'
        RETURNING id`,
      [`Série cancelada: ${motivo_cancelamento}`, req.pessoa.id, req.params.grupoId],
    );

    await registrarAcao({
      pessoa_acesso_id: req.pessoa.id,
      acao: 'conta_pagar.cancelar_serie',
      detalhes: {
        grupo_id: req.params.grupoId,
        canceladas: rows.length,
        motivo: motivo_cancelamento,
      },
      req,
    });

    res.json({ canceladas: rows.length });
  } catch (err) { next(err); }
}

export async function atualizar(req, res, next) {
  try {
    const d = atualizarSchema.parse(req.body);
    const campos = Object.keys(d);
    if (campos.length === 0) throw new AppError('Nenhum campo para atualizar', 400);

    // Só pode editar dados "cadastrais" enquanto pendente. Depois de paga ou
    // cancelada, trata-se de um fato histórico.
    const { rows: atuais } = await query(
      `SELECT status FROM contas_pagar WHERE id = $1`,
      [req.params.id],
    );
    if (!atuais[0]) throw new NaoEncontradoError('Conta não encontrada');
    if (atuais[0].status !== 'pendente') {
      throw new AppError(
        'Contas pagas ou canceladas não podem ser editadas. Cancele e crie uma nova se precisar corrigir.',
        400,
      );
    }

    const sets = campos.map((c, i) => `${c} = $${i + 1}`).join(', ');
    const valores = campos.map((c) => (typeof d[c] === 'string' ? d[c].trim() : d[c]));
    valores.push(req.params.id);

    await query(
      `UPDATE contas_pagar SET ${sets}, updated_at = NOW() WHERE id = $${valores.length}`,
      valores,
    );

    const { rows: completas } = await query(
      `${SELECT_COMPLETO} WHERE cp.id = $1`, [req.params.id],
    );

    await registrarAcao({
      pessoa_acesso_id: req.pessoa.id,
      acao: 'conta_pagar.atualizar',
      detalhes: { conta_id: req.params.id, campos },
      req,
    });

    res.json(serializar(completas[0]));
  } catch (err) { next(err); }
}

/**
 * POST /api/contas-pagar/:id/pagar
 *
 * Marca como paga. Exige data_pagamento; se valor_pago não for informado,
 * assume o valor cheio da conta. Opcionalmente recebe conta bancária
 * usada e desconta o saldo dela (se a ferramenta for a fonte de verdade
 * do saldo manual).
 */
export async function pagar(req, res, next) {
  const client = await pool.connect();
  try {
    const d = pagarSchema.parse(req.body);

    await client.query('BEGIN');

    const { rows: atuais } = await client.query(
      `SELECT id, valor, status FROM contas_pagar WHERE id = $1 FOR UPDATE`,
      [req.params.id],
    );
    if (!atuais[0]) throw new NaoEncontradoError('Conta não encontrada');
    if (atuais[0].status !== 'pendente') {
      throw new AppError('Só é possível pagar contas pendentes', 400);
    }

    const valorPago = d.valor_pago ?? Number(atuais[0].valor);

    await client.query(
      `UPDATE contas_pagar
          SET status = 'paga',
              data_pagamento = $1,
              valor_pago = $2,
              forma_pagamento = $3,
              conta_bancaria_id = $4,
              comprovante_url = COALESCE($5, comprovante_url),
              observacoes = COALESCE($6, observacoes),
              pago_por_id = $7,
              updated_at = NOW()
        WHERE id = $8`,
      [
        d.data_pagamento,
        valorPago,
        d.forma_pagamento ?? null,
        d.conta_bancaria_id ?? null,
        d.comprovante_url?.trim() || null,
        d.observacoes?.trim() || null,
        req.pessoa.id,
        req.params.id,
      ],
    );

    // Se o pagamento saiu de uma conta bancária cadastrada, desconta o saldo.
    // A ideia: a Gestão Nexus é a fonte de verdade do saldo manual,
    // então ao registrar saída, o saldo acompanha.
    if (d.conta_bancaria_id) {
      await client.query(
        `UPDATE contas_bancarias
            SET saldo_atual = saldo_atual - $1,
                saldo_atualizado_em = NOW(),
                saldo_atualizado_por = $2,
                updated_at = NOW()
          WHERE id = $3 AND ativo = TRUE`,
        [valorPago, req.pessoa.id, d.conta_bancaria_id],
      );
    }

    const { rows: completas } = await client.query(
      `${SELECT_COMPLETO} WHERE cp.id = $1`, [req.params.id],
    );

    await client.query('COMMIT');

    await registrarAcao({
      pessoa_acesso_id: req.pessoa.id,
      acao: 'conta_pagar.pagar',
      detalhes: {
        conta_id: req.params.id,
        valor_pago: valorPago,
        data_pagamento: d.data_pagamento,
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
 * POST /api/contas-pagar/:id/cancelar
 */
export async function cancelar(req, res, next) {
  try {
    const { motivo_cancelamento } = cancelarSchema.parse(req.body);

    const { rows: atuais } = await query(
      `SELECT status FROM contas_pagar WHERE id = $1`,
      [req.params.id],
    );
    if (!atuais[0]) throw new NaoEncontradoError('Conta não encontrada');
    if (atuais[0].status !== 'pendente') {
      throw new AppError('Só é possível cancelar contas pendentes', 400);
    }

    await query(
      `UPDATE contas_pagar
          SET status = 'cancelada',
              motivo_cancelamento = $1,
              cancelado_por_id = $2,
              updated_at = NOW()
        WHERE id = $3`,
      [motivo_cancelamento, req.pessoa.id, req.params.id],
    );

    const { rows: completas } = await query(
      `${SELECT_COMPLETO} WHERE cp.id = $1`, [req.params.id],
    );

    await registrarAcao({
      pessoa_acesso_id: req.pessoa.id,
      acao: 'conta_pagar.cancelar',
      detalhes: { conta_id: req.params.id, motivo: motivo_cancelamento },
      req,
    });

    res.json(serializar(completas[0]));
  } catch (err) { next(err); }
}
