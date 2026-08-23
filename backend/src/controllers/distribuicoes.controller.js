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
 * Distribuições de lucros — Sprint 5.
 *
 * Uma "rodada" de distribuição é um evento único da empresa (ex: "3T 2025")
 * que, ao ser criado, gera um movimento_socio para cada sócio ativo com
 * o valor proporcional ao percentual de participação (sugerido e
 * ajustável).
 *
 * Fluxo:
 *   1. POST /distribuicoes → cria cabeçalho + splits sugeridos por sócio
 *   2. PUT  /distribuicoes/:id → admin pode ajustar os valores individuais
 *                                antes de efetivar
 *   3. POST /distribuicoes/:id/efetivar → transiciona cabeçalho + todos
 *                                os movimentos vinculados, ajustando saldo
 *                                da conta bancária se informada
 *   4. POST /distribuicoes/:id/cancelar → cabeçalho + movimentos (só se
 *                                ainda previstos)
 */

const dataIso = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Data deve estar no formato YYYY-MM-DD');

const criarSchema = z.object({
  descricao: z.string().min(2).max(255),
  referencia_periodo: z.string().max(50).optional().nullable(),
  valor_total: z.number().positive(),
  data_prevista: dataIso,
  observacao: z.string().max(2000).optional().nullable(),

  // Opcional: se o admin já quer informar os valores por sócio.
  // Se não vier, o backend calcula pelo percentual de participação.
  splits: z.array(z.object({
    socio_id: z.string().uuid(),
    valor: z.number().min(0),
    descricao: z.string().max(255).optional().nullable(),
  })).optional(),
});

const atualizarSchema = z.object({
  descricao: z.string().min(2).max(255).optional(),
  referencia_periodo: z.string().max(50).optional().nullable(),
  data_prevista: dataIso.optional(),
  observacao: z.string().max(2000).optional().nullable(),
  splits: z.array(z.object({
    movimento_id: z.string().uuid(),
    valor: z.number().min(0),
  })).optional(),
});

const efetivarSchema = z.object({
  data_efetivada: dataIso,
  conta_bancaria_id: z.string().uuid().optional().nullable(),
  forma_pagamento: z.enum([
    'pix', 'boleto', 'ted', 'cartao', 'dinheiro', 'debito_automatico', 'outro',
  ]).optional().nullable(),
  observacao: z.string().max(2000).optional().nullable(),
});

const cancelarSchema = z.object({
  motivo_cancelamento: z.string().min(3).max(500),
});

function serializarCabecalho(d) {
  return {
    id: d.id,
    descricao: d.descricao,
    referencia_periodo: d.referencia_periodo,
    valor_total: Number(d.valor_total),
    data_prevista: d.data_prevista,
    data_efetivada: d.data_efetivada,
    status: d.status,
    motivo_cancelamento: d.motivo_cancelamento,
    observacao: d.observacao,
    created_at: d.created_at,
    updated_at: d.updated_at,
  };
}

function serializarMovimento(m) {
  return {
    id: m.id,
    socio_id: m.socio_id,
    socio_nome: m.socio_nome,
    socio_percentual: m.socio_percentual != null ? Number(m.socio_percentual) : null,
    descricao: m.descricao,
    valor: Number(m.valor),
    status: m.status,
    data_prevista: m.data_prevista,
    data_efetivada: m.data_efetivada,
    conta_bancaria_apelido: m.conta_bancaria_apelido,
  };
}

// =============================================================================
// Helpers de notificação (Sprint 7).
// =============================================================================

/**
 * Avisa cada sócio (via suas pessoas titulares) sobre o movimento de
 * distribuição criado em seu nome. Usa o mesmo template de movimento
 * único, mas controlado pela flag específica de distribuição.
 */
async function notificarSociosNovaRodada(distribuicaoId) {
  const config = await lerConfig();

  const { rows: movimentos } = await query(
    `SELECT m.id, m.socio_id, m.tipo, m.descricao, m.valor, m.data_prevista,
            s.nome AS socio_nome
       FROM movimentos_socios m
       JOIN socios s ON s.id = m.socio_id
      WHERE m.distribuicao_id = $1
        AND m.status <> 'cancelado'`,
    [distribuicaoId],
  );

  for (const mov of movimentos) {
    const pessoas = await pessoasDoSocio(mov.socio_id);
    if (!pessoas.length) continue;

    const tpl = tplMovimentoSocioCriado({
      movimento: mov,
      socioNome: mov.socio_nome,
    });

    await notificarPessoas({
      pessoas,
      tipo: 'distribuicao.criada',
      titulo: tpl.assunto.replace(/^\[Gestão Ayio\]\s*/, ''),
      descricao: `${mov.descricao} · R$ ${Number(mov.valor).toFixed(2).replace('.', ',')}`,
      link: `/socios/${mov.socio_id}/extrato`,
      contexto: { distribuicao_id: distribuicaoId, movimento_id: mov.id },
      email: config.email_distribuicao_criada
        ? { assunto: tpl.assunto, html: tpl.html, template: 'distribuicao_criada' }
        : null,
    });
  }
}

/**
 * GET /api/distribuicoes
 * Lista todas as distribuições. Aceita ?status=...&ano=YYYY.
 */
export async function listar(req, res, next) {
  try {
    const partes = [];
    const params = [];

    if (req.query.status && req.query.status !== 'todas') {
      params.push(req.query.status);
      partes.push(`status = $${params.length}`);
    }
    if (req.query.ano) {
      const ano = Number(req.query.ano);
      if (!Number.isInteger(ano) || ano < 2000 || ano > 2100) {
        throw new AppError('Ano inválido', 400);
      }
      params.push(`${ano}-01-01`, `${ano}-12-31`);
      const i1 = params.length - 1;
      const i2 = params.length;
      partes.push(`COALESCE(data_efetivada, data_prevista) BETWEEN $${i1}::date AND $${i2}::date`);
    }

    const where = partes.length ? `WHERE ${partes.join(' AND ')}` : '';
    const sql = `
      SELECT d.*,
             COUNT(m.id)::int AS qtd_socios,
             COALESCE(SUM(m.valor), 0) AS soma_splits
        FROM distribuicoes_lucros d
        LEFT JOIN movimentos_socios m
               ON m.distribuicao_id = d.id
              AND m.status <> 'cancelado'
        ${where}
       GROUP BY d.id
       ORDER BY COALESCE(d.data_efetivada, d.data_prevista) DESC, d.created_at DESC
    `;

    const { rows } = await query(sql, params);
    res.json(rows.map((r) => ({
      ...serializarCabecalho(r),
      qtd_socios: r.qtd_socios,
      soma_splits: Number(r.soma_splits),
    })));
  } catch (err) { next(err); }
}

/**
 * GET /api/distribuicoes/:id
 * Detalhe + movimentos por sócio.
 */
export async function obter(req, res, next) {
  try {
    const { rows: cab } = await query(
      `SELECT * FROM distribuicoes_lucros WHERE id = $1`,
      [req.params.id],
    );
    if (!cab[0]) throw new NaoEncontradoError('Distribuição não encontrada');

    const { rows: mov } = await query(
      `SELECT m.id, m.socio_id, m.descricao, m.valor, m.status,
              m.data_prevista, m.data_efetivada,
              s.nome AS socio_nome,
              s.percentual_participacao AS socio_percentual,
              cb.apelido AS conta_bancaria_apelido
         FROM movimentos_socios m
         JOIN socios s ON s.id = m.socio_id
         LEFT JOIN contas_bancarias cb ON cb.id = m.conta_bancaria_id
        WHERE m.distribuicao_id = $1
        ORDER BY s.percentual_participacao DESC NULLS LAST, s.nome`,
      [req.params.id],
    );

    res.json({
      ...serializarCabecalho(cab[0]),
      movimentos: mov.map(serializarMovimento),
    });
  } catch (err) { next(err); }
}

/**
 * POST /api/distribuicoes  (admin)
 *
 * Cria o cabeçalho + um movimento por sócio ativo, com valor calculado
 * por participação (se splits não vierem). Se splits vierem, eles têm
 * precedência.
 *
 * Valida que a soma dos splits fecha com valor_total (tolerância de 1 centavo).
 */
export async function criar(req, res, next) {
  const client = await pool.connect();
  try {
    const d = criarSchema.parse(req.body);

    await client.query('BEGIN');

    // Lista sócios ativos, travando pra garantir consistência
    // caso alguém tente inativar no meio do processo.
    const { rows: socios } = await client.query(
      `SELECT id, nome, percentual_participacao
         FROM socios
        WHERE ativo = TRUE
        ORDER BY percentual_participacao DESC NULLS LAST, nome
          FOR SHARE`,
    );
    if (socios.length === 0) {
      throw new AppError('Nenhum sócio ativo para distribuir', 400);
    }

    // Resolve os splits: se vierem, valida; se não, calcula por participação.
    let splitsFinais;
    if (d.splits && d.splits.length > 0) {
      // Garante que todos os splits correspondem a sócios ativos e que a
      // soma fecha com valor_total.
      const idsAtivos = new Set(socios.map((s) => s.id));
      for (const sp of d.splits) {
        if (!idsAtivos.has(sp.socio_id)) {
          throw new AppError(`Sócio ${sp.socio_id} não está ativo`, 400);
        }
      }
      const soma = d.splits.reduce((a, s) => a + s.valor, 0);
      if (Math.abs(soma - d.valor_total) > 0.01) {
        throw new AppError(
          `A soma dos splits (${soma.toFixed(2)}) não bate com o valor total (${d.valor_total.toFixed(2)})`,
          400,
        );
      }
      splitsFinais = d.splits;
    } else {
      splitsFinais = calcularSplitPorParticipacao(socios, d.valor_total);
    }

    // Cria o cabeçalho.
    const { rows: cabCriado } = await client.query(
      `INSERT INTO distribuicoes_lucros
         (descricao, referencia_periodo, valor_total, data_prevista,
          observacao, criado_por_id)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING id`,
      [
        d.descricao.trim(),
        d.referencia_periodo?.trim() || null,
        d.valor_total,
        d.data_prevista,
        d.observacao?.trim() || null,
        req.pessoa.id,
      ],
    );
    const distribuicaoId = cabCriado[0].id;

    // Cria um movimento_socio por sócio (inclusive os com valor zero,
    // pra deixar explícito que foram considerados na rodada).
    for (const sp of splitsFinais) {
      await client.query(
        `INSERT INTO movimentos_socios
           (socio_id, tipo, distribuicao_id, descricao, valor,
            data_prevista, criado_por_id)
         VALUES ($1, 'distribuicao', $2, $3, $4, $5, $6)`,
        [
          sp.socio_id,
          distribuicaoId,
          (sp.descricao?.trim() || d.descricao.trim()),
          sp.valor,
          d.data_prevista,
          req.pessoa.id,
        ],
      );
    }

    await client.query('COMMIT');

    await registrarAcao({
      pessoa_acesso_id: req.pessoa.id,
      acao: 'distribuicao.criar',
      detalhes: {
        distribuicao_id: distribuicaoId,
        valor_total: d.valor_total,
        qtd_socios: splitsFinais.length,
      },
      req,
    });

    // Sprint 7 — avisa cada sócio sobre o seu movimento.
    disparar(() => notificarSociosNovaRodada(distribuicaoId));

    // Retorna a distribuição completa (igual ao GET /:id).
    req.params.id = distribuicaoId;
    return obter(req, res, next);
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    next(err);
  } finally {
    client.release();
  }
}

/**
 * PUT /api/distribuicoes/:id  (admin)
 *
 * Altera cabeçalho e/ou valores dos splits — apenas enquanto a rodada
 * estiver como 'prevista'.
 */
export async function atualizar(req, res, next) {
  const client = await pool.connect();
  try {
    const d = atualizarSchema.parse(req.body);

    await client.query('BEGIN');

    const { rows: cab } = await client.query(
      `SELECT id, status, valor_total FROM distribuicoes_lucros WHERE id = $1 FOR UPDATE`,
      [req.params.id],
    );
    if (!cab[0]) throw new NaoEncontradoError('Distribuição não encontrada');
    if (cab[0].status !== 'prevista') {
      throw new AppError(
        'Distribuição só pode ser alterada enquanto prevista. Cancele e crie outra se precisar.',
        400,
      );
    }

    // Atualiza splits, se vierem.
    let novoValorTotal = Number(cab[0].valor_total);
    if (d.splits && d.splits.length > 0) {
      // Confere que todos os movimentos informados pertencem a esta distribuição.
      const { rows: movs } = await client.query(
        `SELECT id FROM movimentos_socios
          WHERE distribuicao_id = $1 AND status <> 'cancelado'`,
        [req.params.id],
      );
      const idsValidos = new Set(movs.map((m) => m.id));
      for (const sp of d.splits) {
        if (!idsValidos.has(sp.movimento_id)) {
          throw new AppError(`Movimento ${sp.movimento_id} não pertence a esta distribuição`, 400);
        }
      }

      for (const sp of d.splits) {
        await client.query(
          `UPDATE movimentos_socios
              SET valor = $1, updated_at = NOW()
            WHERE id = $2`,
          [sp.valor, sp.movimento_id],
        );
      }

      // Recalcula o valor_total a partir dos movimentos não cancelados.
      const { rows: total } = await client.query(
        `SELECT COALESCE(SUM(valor), 0) AS soma
           FROM movimentos_socios
          WHERE distribuicao_id = $1 AND status <> 'cancelado'`,
        [req.params.id],
      );
      novoValorTotal = Number(total[0].soma);
    }

    // Atualiza o cabeçalho.
    const camposCab = {};
    if (d.descricao !== undefined) camposCab.descricao = d.descricao.trim();
    if (d.referencia_periodo !== undefined) camposCab.referencia_periodo = d.referencia_periodo?.trim() || null;
    if (d.data_prevista !== undefined) camposCab.data_prevista = d.data_prevista;
    if (d.observacao !== undefined) camposCab.observacao = d.observacao?.trim() || null;
    if (d.splits && d.splits.length > 0) camposCab.valor_total = novoValorTotal;

    const entradas = Object.entries(camposCab);
    if (entradas.length > 0) {
      const sets = entradas.map(([c], i) => `${c} = $${i + 1}`).join(', ');
      const valores = entradas.map(([, v]) => v);
      valores.push(req.params.id);
      await client.query(
        `UPDATE distribuicoes_lucros SET ${sets}, updated_at = NOW()
          WHERE id = $${valores.length}`,
        valores,
      );

      // Se mudou data_prevista, propaga para os movimentos ainda previstos.
      if (d.data_prevista) {
        await client.query(
          `UPDATE movimentos_socios
              SET data_prevista = $1, updated_at = NOW()
            WHERE distribuicao_id = $2 AND status = 'previsto'`,
          [d.data_prevista, req.params.id],
        );
      }
    }

    await client.query('COMMIT');

    await registrarAcao({
      pessoa_acesso_id: req.pessoa.id,
      acao: 'distribuicao.atualizar',
      detalhes: {
        distribuicao_id: req.params.id,
        campos_cabecalho: Object.keys(camposCab),
        splits_editados: d.splits?.length ?? 0,
      },
      req,
    });

    return obter(req, res, next);
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    next(err);
  } finally {
    client.release();
  }
}

/**
 * POST /api/distribuicoes/:id/efetivar  (admin)
 *
 * Transiciona cabeçalho + todos os movimentos ainda previstos para
 * 'efetivado/efetivada'. Se houver conta_bancaria_id, desconta o
 * valor_total dela de uma vez só (os movimentos ficam todos apontando
 * pra mesma conta).
 */
export async function efetivar(req, res, next) {
  const client = await pool.connect();
  try {
    const d = efetivarSchema.parse(req.body);

    await client.query('BEGIN');

    const { rows: cab } = await client.query(
      `SELECT id, status, valor_total FROM distribuicoes_lucros
        WHERE id = $1 FOR UPDATE`,
      [req.params.id],
    );
    if (!cab[0]) throw new NaoEncontradoError('Distribuição não encontrada');
    if (cab[0].status !== 'prevista') {
      throw new AppError('Só é possível efetivar distribuições previstas', 400);
    }

    // Efetiva os movimentos ainda previstos em lote.
    await client.query(
      `UPDATE movimentos_socios
          SET status = 'efetivado',
              data_efetivada = $1,
              conta_bancaria_id = $2,
              forma_pagamento = $3,
              observacao = COALESCE($4, observacao),
              efetivado_por_id = $5,
              updated_at = NOW()
        WHERE distribuicao_id = $6 AND status = 'previsto'`,
      [
        d.data_efetivada,
        d.conta_bancaria_id ?? null,
        d.forma_pagamento ?? null,
        d.observacao?.trim() || null,
        req.pessoa.id,
        req.params.id,
      ],
    );

    // Atualiza o cabeçalho.
    await client.query(
      `UPDATE distribuicoes_lucros
          SET status = 'efetivada',
              data_efetivada = $1,
              efetivado_por_id = $2,
              observacao = COALESCE($3, observacao),
              updated_at = NOW()
        WHERE id = $4`,
      [d.data_efetivada, req.pessoa.id, d.observacao?.trim() || null, req.params.id],
    );

    // Ajusta o saldo da conta bancária (se informada).
    // Usa a soma dos valores dos movimentos efetivados (nem sempre é igual
    // ao valor_total do cabeçalho, porque podem ter sido canceladas
    // individualmente antes).
    if (d.conta_bancaria_id) {
      const { rows: soma } = await client.query(
        `SELECT COALESCE(SUM(valor), 0) AS total
           FROM movimentos_socios
          WHERE distribuicao_id = $1
            AND status = 'efetivado'
            AND data_efetivada = $2`,
        [req.params.id, d.data_efetivada],
      );
      const totalDescontar = Number(soma[0].total);

      if (totalDescontar > 0) {
        await client.query(
          `UPDATE contas_bancarias
              SET saldo_atual = saldo_atual - $1,
                  saldo_atualizado_em = NOW(),
                  saldo_atualizado_por = $2,
                  updated_at = NOW()
            WHERE id = $3 AND ativo = TRUE`,
          [totalDescontar, req.pessoa.id, d.conta_bancaria_id],
        );
      }
    }

    await client.query('COMMIT');

    await registrarAcao({
      pessoa_acesso_id: req.pessoa.id,
      acao: 'distribuicao.efetivar',
      detalhes: {
        distribuicao_id: req.params.id,
        data_efetivada: d.data_efetivada,
        conta_bancaria_id: d.conta_bancaria_id ?? null,
      },
      req,
    });

    return obter(req, res, next);
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    next(err);
  } finally {
    client.release();
  }
}

/**
 * POST /api/distribuicoes/:id/cancelar  (admin)
 *
 * Só enquanto prevista. Cancela o cabeçalho e todos os movimentos
 * previstos vinculados (com o mesmo motivo).
 */
export async function cancelar(req, res, next) {
  const client = await pool.connect();
  try {
    const { motivo_cancelamento } = cancelarSchema.parse(req.body);

    await client.query('BEGIN');

    const { rows: cab } = await client.query(
      `SELECT status FROM distribuicoes_lucros WHERE id = $1 FOR UPDATE`,
      [req.params.id],
    );
    if (!cab[0]) throw new NaoEncontradoError('Distribuição não encontrada');
    if (cab[0].status !== 'prevista') {
      throw new AppError('Só é possível cancelar distribuições previstas', 400);
    }

    await client.query(
      `UPDATE movimentos_socios
          SET status = 'cancelado',
              motivo_cancelamento = $1,
              cancelado_por_id = $2,
              updated_at = NOW()
        WHERE distribuicao_id = $3 AND status = 'previsto'`,
      [motivo_cancelamento, req.pessoa.id, req.params.id],
    );

    await client.query(
      `UPDATE distribuicoes_lucros
          SET status = 'cancelada',
              motivo_cancelamento = $1,
              cancelado_por_id = $2,
              updated_at = NOW()
        WHERE id = $3`,
      [motivo_cancelamento, req.pessoa.id, req.params.id],
    );

    await client.query('COMMIT');

    await registrarAcao({
      pessoa_acesso_id: req.pessoa.id,
      acao: 'distribuicao.cancelar',
      detalhes: { distribuicao_id: req.params.id, motivo: motivo_cancelamento },
      req,
    });

    return obter(req, res, next);
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    next(err);
  } finally {
    client.release();
  }
}

/**
 * Calcula o split por participação.
 *
 * Soma os percentuais dos sócios ativos (pode não fechar 100 — alguns
 * cenários têm tesouraria/reservas). Cada sócio recebe a proporção do
 * seu % sobre a soma dos %. O último sócio absorve o centavo residual
 * para a soma bater exatamente com valor_total.
 */
function calcularSplitPorParticipacao(socios, valorTotal) {
  const percentuais = socios.map((s) => Number(s.percentual_participacao ?? 0));
  const somaPct = percentuais.reduce((a, b) => a + b, 0);

  if (somaPct <= 0) {
    // Divisão igualitária se ninguém tem percentual.
    const fatia = Math.floor((valorTotal * 100) / socios.length) / 100;
    const splits = socios.map((s) => ({ socio_id: s.id, valor: fatia }));
    const usado = fatia * socios.length;
    splits[splits.length - 1].valor = Number((splits[splits.length - 1].valor + (valorTotal - usado)).toFixed(2));
    return splits;
  }

  let acumulado = 0;
  const splits = socios.map((s, i) => {
    const pct = Number(s.percentual_participacao ?? 0);
    let valor;
    if (i === socios.length - 1) {
      // Último absorve o residual pra fechar exato.
      valor = Number((valorTotal - acumulado).toFixed(2));
    } else {
      valor = Math.floor((valorTotal * pct / somaPct) * 100) / 100;
      acumulado += valor;
    }
    return { socio_id: s.id, valor };
  });

  return splits;
}
