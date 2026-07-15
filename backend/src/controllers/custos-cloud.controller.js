import { z } from 'zod';
import { query } from '../config/database.js';
import { NaoEncontradoError, AppError } from '../utils/errors.js';
import { registrarAcao } from '../utils/audit.js';

/**
 * Sprint 40 -- Custos Cloud (Fase 1).
 *
 * Catalogo de servicos + fechamento mensal + dashboard (custo por servico,
 * teto, variacao vs mes anterior, receita do Asaas e margem).
 *
 * A receita vem da tabela local `cobrancas_asaas` (mesma fonte do Caixa):
 * soma do que foi RECEBIDO no mes.
 */

const STATUS_RECEBIDO = ['RECEIVED', 'RECEIVED_IN_CASH', 'CONFIRMED'];

const mesRegex = /^\d{4}-\d{2}$/;

const servicoSchema = z.object({
  nome: z.string().min(1).max(120),
  para_que: z.string().max(500).optional().nullable(),
  tipo: z.enum(['fixo', 'variavel']).default('variavel'),
  plano: z.string().max(120).optional().nullable(),
  moeda: z.enum(['BRL', 'USD']).default('BRL'),
  custo_base_reais: z.number().min(0).max(9999999).optional().default(0),
  dia_cobranca: z.number().int().min(0).max(31).optional().nullable(),
  o_que_sobe: z.string().max(500).optional().nullable(),
  teto_reais: z.number().min(0).max(9999999).optional().nullable(),
  onde_ver: z.string().max(300).optional().nullable(),
  ativo: z.boolean().optional().default(true),
  ordem: z.number().int().min(0).max(9999).optional().default(0),
});

const lancamentoSchema = z.object({
  mes: z.string().regex(mesRegex, 'Mes deve estar em YYYY-MM'),
  servico_id: z.string().uuid(),
  valor_reais: z.number().min(0).max(9999999),
});

function mesAtual() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

function mesAnterior(mes) {
  const [a, m] = mes.split('-').map(Number);
  const d = new Date(a, m - 2, 1); // m-2 = mes anterior (0-based)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

function serializarServico(s) {
  return {
    id: s.id,
    nome: s.nome,
    para_que: s.para_que,
    tipo: s.tipo,
    plano: s.plano,
    moeda: s.moeda,
    custo_base_reais: Number(s.custo_base_reais ?? 0),
    dia_cobranca: s.dia_cobranca,
    o_que_sobe: s.o_que_sobe,
    teto_reais: s.teto_reais != null ? Number(s.teto_reais) : null,
    onde_ver: s.onde_ver,
    ativo: !!s.ativo,
    ordem: s.ordem,
  };
}

// ---------------------------------------------------------------------------
// Catalogo de servicos
// ---------------------------------------------------------------------------

export async function listarServicos(req, res, next) {
  try {
    const incluirInativos = req.query.todos === '1';
    const { rows } = await query(
      `SELECT * FROM custos_servicos
        ${incluirInativos ? '' : 'WHERE ativo = TRUE'}
        ORDER BY ordem, nome`,
    );
    res.json(rows.map(serializarServico));
  } catch (err) { next(err); }
}

export async function criarServico(req, res, next) {
  try {
    const d = servicoSchema.parse(req.body);
    const { rows } = await query(
      `INSERT INTO custos_servicos
         (nome, para_que, tipo, plano, moeda, custo_base_reais, dia_cobranca,
          o_que_sobe, teto_reais, onde_ver, ativo, ordem)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12) RETURNING *`,
      [d.nome.trim(), d.para_que ?? null, d.tipo, d.plano ?? null, d.moeda,
        d.custo_base_reais ?? 0, d.dia_cobranca ?? null, d.o_que_sobe ?? null,
        d.teto_reais ?? null, d.onde_ver ?? null, d.ativo ?? true, d.ordem ?? 0],
    );
    registrarAcao({ acao: 'custos.criou_servico', pessoa_acesso_id: req.pessoa.id, detalhes: { nome: d.nome }, req });
    res.status(201).json(serializarServico(rows[0]));
  } catch (err) {
    if (err?.code === '23505') return next(new AppError('Ja existe um servico com esse nome.', 400));
    next(err);
  }
}

export async function atualizarServico(req, res, next) {
  try {
    const d = servicoSchema.partial().parse(req.body);
    const updates = [];
    const params = [];
    for (const [k, v] of Object.entries(d)) {
      if (v === undefined) continue;
      params.push(typeof v === 'string' ? v.trim() : v);
      updates.push(`${k} = $${params.length}`);
    }
    if (updates.length === 0) return res.json({ ok: true });
    updates.push('atualizado_em = NOW()');
    params.push(req.params.id);
    const { rows } = await query(
      `UPDATE custos_servicos SET ${updates.join(', ')} WHERE id = $${params.length} RETURNING *`,
      params,
    );
    if (!rows[0]) throw new NaoEncontradoError('Servico nao encontrado');
    res.json(serializarServico(rows[0]));
  } catch (err) {
    if (err?.code === '23505') return next(new AppError('Ja existe um servico com esse nome.', 400));
    next(err);
  }
}

// ---------------------------------------------------------------------------
// Fechamento mensal (valores por servico)
// ---------------------------------------------------------------------------

export async function fechamento(req, res, next) {
  try {
    const mes = req.query.mes && mesRegex.test(req.query.mes) ? req.query.mes : mesAtual();
    const { rows } = await query(
      `SELECT s.id AS servico_id, s.nome, s.tipo, s.moeda, s.teto_reais, s.ordem,
              COALESCE(m.valor_reais, 0) AS valor_reais
         FROM custos_servicos s
         LEFT JOIN custos_mensais m ON m.servico_id = s.id AND m.mes = $1
        WHERE s.ativo = TRUE
        ORDER BY s.ordem, s.nome`,
      [mes],
    );
    res.json({
      mes,
      itens: rows.map((r) => ({
        servico_id: r.servico_id,
        nome: r.nome,
        tipo: r.tipo,
        moeda: r.moeda,
        teto_reais: r.teto_reais != null ? Number(r.teto_reais) : null,
        valor_reais: Number(r.valor_reais),
      })),
    });
  } catch (err) { next(err); }
}

export async function lancarValor(req, res, next) {
  try {
    const d = lancamentoSchema.parse(req.body);
    const { rows } = await query(
      `INSERT INTO custos_mensais (mes, servico_id, valor_reais)
       VALUES ($1, $2, $3)
       ON CONFLICT (mes, servico_id)
       DO UPDATE SET valor_reais = EXCLUDED.valor_reais, atualizado_em = NOW()
       RETURNING id, mes, servico_id, valor_reais`,
      [d.mes, d.servico_id, d.valor_reais],
    );
    res.json({ ...rows[0], valor_reais: Number(rows[0].valor_reais) });
  } catch (err) {
    if (err?.code === '23503') return next(new AppError('Servico nao encontrado.', 400));
    next(err);
  }
}

// ---------------------------------------------------------------------------
// Dashboard do mes
// ---------------------------------------------------------------------------

export async function dashboard(req, res, next) {
  try {
    const mes = req.query.mes && mesRegex.test(req.query.mes) ? req.query.mes : mesAtual();
    const anterior = mesAnterior(mes);

    const [porServico, totalAnterior, receitaR] = await Promise.all([
      query(
        `SELECT s.id, s.nome, s.tipo, s.teto_reais,
                COALESCE(m.valor_reais, 0) AS valor
           FROM custos_servicos s
           LEFT JOIN custos_mensais m ON m.servico_id = s.id AND m.mes = $1
          WHERE s.ativo = TRUE
          ORDER BY s.ordem, s.nome`,
        [mes],
      ),
      query('SELECT COALESCE(SUM(valor_reais), 0) AS total FROM custos_mensais WHERE mes = $1', [anterior]),
      query(
        `SELECT COALESCE(SUM(COALESCE(valor_liquido, valor)), 0) AS total
           FROM cobrancas_asaas
          WHERE status = ANY($1::text[])
            AND to_char(data_pagamento, 'YYYY-MM') = $2`,
        [STATUS_RECEBIDO, mes],
      ),
    ]);

    const servicos = porServico.rows.map((r) => {
      const valor = Number(r.valor);
      const teto = r.teto_reais != null ? Number(r.teto_reais) : null;
      return {
        id: r.id,
        nome: r.nome,
        tipo: r.tipo,
        valor_reais: valor,
        teto_reais: teto,
        estourou_teto: teto != null && valor > teto,
      };
    });
    const custoTotal = servicos.reduce((s, x) => s + x.valor_reais, 0);
    const custoAnterior = Number(totalAnterior.rows[0].total);
    const receita = Number(receitaR.rows[0].total);
    const margem = receita - custoTotal;

    res.json({
      mes,
      custo_total: custoTotal,
      custo_mes_anterior: custoAnterior,
      variacao_reais: custoTotal - custoAnterior,
      variacao_pct: custoAnterior > 0 ? (custoTotal - custoAnterior) / custoAnterior : null,
      receita_recebida: receita,
      margem,
      margem_pct: receita > 0 ? margem / receita : null,
      por_servico: servicos,
    });
  } catch (err) { next(err); }
}

// ---------------------------------------------------------------------------
// Rateio por cartorio (Fase 2)
// ---------------------------------------------------------------------------

const rateioSchema = z.object({
  mes: z.string().regex(mesRegex, 'Mes deve estar em YYYY-MM'),
  cartorio_id: z.string().uuid(),
  mensalidade_reais: z.number().min(0).max(9999999),
  mensagens_mes: z.number().int().min(0).max(99999999),
});

async function calcularRateio(mes) {
  const [tot, carts] = await Promise.all([
    query(
      `SELECT s.tipo, COALESCE(SUM(m.valor_reais), 0) AS total
         FROM custos_mensais m
         JOIN custos_servicos s ON s.id = m.servico_id
        WHERE m.mes = $1
        GROUP BY s.tipo`,
      [mes],
    ),
    query(
      `SELECT c.id, c.nome,
              COALESCE(r.mensalidade_reais, 0) AS mensalidade,
              COALESCE(r.mensagens_mes, 0) AS mensagens
         FROM cartorios c
         LEFT JOIN custos_rateio r ON r.cartorio_id = c.id AND r.mes = $1
        WHERE c.arquivado_em IS NULL
        ORDER BY c.nome`,
      [mes],
    ),
  ]);

  let variavel = 0; let fixo = 0;
  for (const row of tot.rows) {
    if (row.tipo === 'variavel') variavel = Number(row.total);
    else if (row.tipo === 'fixo') fixo = Number(row.total);
  }
  const empresas = carts.rows.length;
  const totalMsgs = carts.rows.reduce((s, c) => s + Number(c.mensagens), 0);
  const fixoPorEmpresa = empresas > 0 ? fixo / empresas : 0;

  const itens = carts.rows.map((c) => {
    const mensalidade = Number(c.mensalidade);
    const mensagens = Number(c.mensagens);
    const pctMsgs = totalMsgs > 0 ? mensagens / totalMsgs : 0;
    const custoVar = variavel * pctMsgs;
    const custoTotal = custoVar + fixoPorEmpresa;
    const margem = mensalidade - custoTotal;
    return {
      cartorio_id: c.id,
      nome: c.nome,
      mensalidade_reais: mensalidade,
      mensagens_mes: mensagens,
      pct_mensagens: pctMsgs,
      custo_variavel: custoVar,
      custo_fixo: fixoPorEmpresa,
      custo_total: custoTotal,
      margem,
      margem_pct: mensalidade > 0 ? margem / mensalidade : null,
      situacao: margem >= 0 ? 'OK' : 'PREJUIZO',
    };
  });

  return { mes, variavel_total: variavel, fixo_total: fixo, empresas, total_mensagens: totalMsgs, itens };
}

export async function rateio(req, res, next) {
  try {
    const mes = req.query.mes && mesRegex.test(req.query.mes) ? req.query.mes : mesAtual();
    res.json(await calcularRateio(mes));
  } catch (err) { next(err); }
}

export async function salvarRateio(req, res, next) {
  try {
    const d = rateioSchema.parse(req.body);
    await query(
      `INSERT INTO custos_rateio (mes, cartorio_id, mensalidade_reais, mensagens_mes)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (mes, cartorio_id)
       DO UPDATE SET mensalidade_reais = EXCLUDED.mensalidade_reais,
                     mensagens_mes = EXCLUDED.mensagens_mes,
                     atualizado_em = NOW()`,
      [d.mes, d.cartorio_id, d.mensalidade_reais, d.mensagens_mes],
    );
    res.json({ ok: true });
  } catch (err) {
    if (err?.code === '23503') return next(new AppError('Cartorio nao encontrado.', 400));
    next(err);
  }
}

// ---------------------------------------------------------------------------
// Alertas derivados (Fase 2)
// ---------------------------------------------------------------------------

export async function alertas(req, res, next) {
  try {
    const mes = req.query.mes && mesRegex.test(req.query.mes) ? req.query.mes : mesAtual();
    const lista = [];

    // 1) Servicos que estouraram o teto no mes.
    const estouros = await query(
      `SELECT s.nome, s.teto_reais, m.valor_reais
         FROM custos_mensais m
         JOIN custos_servicos s ON s.id = m.servico_id
        WHERE m.mes = $1 AND s.teto_reais IS NOT NULL AND m.valor_reais > s.teto_reais
        ORDER BY (m.valor_reais - s.teto_reais) DESC`,
      [mes],
    );
    for (const e of estouros.rows) {
      lista.push({
        tipo: 'teto',
        severidade: 'alta',
        titulo: `${e.nome} passou do teto`,
        detalhe: `Custou R$ ${Number(e.valor_reais).toFixed(2)} para um teto de R$ ${Number(e.teto_reais).toFixed(2)}.`,
      });
    }

    // 2) Cartorios com margem negativa (prejuizo).
    const r = await calcularRateio(mes);
    for (const it of r.itens) {
      if (it.situacao === 'PREJUIZO' && it.mensalidade_reais > 0) {
        lista.push({
          tipo: 'prejuizo',
          severidade: 'alta',
          titulo: `${it.nome} esta no prejuizo`,
          detalhe: `Custo R$ ${it.custo_total.toFixed(2)} maior que a mensalidade R$ ${it.mensalidade_reais.toFixed(2)} (margem R$ ${it.margem.toFixed(2)}).`,
        });
      }
    }

    // 3) Custo total subiu mais de 20% vs mes anterior.
    const anterior = mesAnterior(mes);
    const [atualR, antR] = await Promise.all([
      query('SELECT COALESCE(SUM(valor_reais),0) AS t FROM custos_mensais WHERE mes = $1', [mes]),
      query('SELECT COALESCE(SUM(valor_reais),0) AS t FROM custos_mensais WHERE mes = $1', [anterior]),
    ]);
    const atual = Number(atualR.rows[0].t);
    const ant = Number(antR.rows[0].t);
    if (ant > 0 && atual > ant * 1.2) {
      lista.push({
        tipo: 'variacao',
        severidade: 'media',
        titulo: 'Custo total subiu mais de 20%',
        detalhe: `De R$ ${ant.toFixed(2)} para R$ ${atual.toFixed(2)}. Compare as faturas antes de pagar.`,
      });
    }

    res.json({ mes, alertas: lista });
  } catch (err) { next(err); }
}
