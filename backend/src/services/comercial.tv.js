import { query } from '../config/database.js';
import {
  ETAPAS, ETAPA, RESULTADOS, RESULTADOS_CONECTAM, TIPOS_REUNIAO,
  hojeBR, mesDe, ehDiaUtil, diasUteisDoMes, desdobrarMeta, metaPessoa,
  MARCOS_TRIAL, DIAS_TRIAL, SINAIS, situacaoTrial, pontuacao, addDias,
} from './comercial.regras.js';
import {
  carregarFeriados, conferirPagamentosAsaas, metasDoMes, totaisFunil, placar,
} from './comercial.dados.js';

/**
 * Sprint 42M — Painel de TV do Comercial ("modo TV").
 *
 * Uma leitura só, pensada para ficar aberta o dia todo numa TV da sala:
 *   - números de HOJE × meta do dia (contatos, novos em contato, reuniões)
 *   - acumulado do MÊS × meta (clientes pagos, receita nova, reuniões)
 *   - ranking de quem está vendendo hoje
 *   - feed das últimas atividades do dia
 *   - funil por etapa e agenda de reuniões de hoje
 *
 * Só leitura. Não expõe telefone/e-mail de lead nem anotações da gestão:
 * a TV fica num lugar onde qualquer pessoa passa.
 */

const NOME_RESULTADO = Object.fromEntries(RESULTADOS.map((r) => [r.k, r.n]));
const FUSO = `'America/Sao_Paulo'`;

/** "Fulano de Tal Silva" → "Fulano S." (TV: curto e legível de longe). */
export function nomeCurto(nome) {
  const p = String(nome || '').trim().split(/\s+/).filter(Boolean);
  if (p.length <= 1) return p[0] || '—';
  return `${p[0]} ${p[p.length - 1][0]}.`;
}

/** Posição do dia útil de hoje no mês: {n, de}. Fim de semana/feriado repete o último útil. */
export function diaUtilDoMes(hoje) {
  const mes = mesDe(hoje);
  const de = diasUteisDoMes(mes);
  let n = 0;
  const [y, m, d] = hoje.split('-').map(Number);
  for (let i = 1; i <= d; i++) {
    const s = `${y}-${String(m).padStart(2, '0')}-${String(i).padStart(2, '0')}`;
    if (ehDiaUtil(s)) n++;
  }
  return { n, de, util_hoje: ehDiaUtil(hoje) };
}

export async function calcularTv() {
  const hoje = hojeBR();
  const mes = mesDe(hoje);
  const inicioMes = mes + '-01';
  await carregarFeriados();
  await conferirPagamentosAsaas();

  const [metas, totais, rankHoje, rankMes, { rows: [dia] }, { rows: [acum] }, { rows: novosPorDono }, { rows: feed }, { rows: agenda }] = await Promise.all([
    metasDoMes(mes),
    totaisFunil(),
    placar(hoje, hoje),
    placar(inicioMes, hoje),
    // --- Números de hoje (equipe toda) ---
    query(
      `SELECT
         (SELECT count(*) FROM comercial_toques t JOIN comercial_leads l ON l.id = t.lead_id AND l.arquivado_em IS NULL
           WHERE t.data = $1::date AND t.estornado_em IS NULL)::int AS toques,
         (SELECT count(*) FROM comercial_toques t JOIN comercial_leads l ON l.id = t.lead_id AND l.arquivado_em IS NULL
           WHERE t.data = $1::date AND t.estornado_em IS NULL AND t.resultado = ANY($2))::int AS conexoes,
         (SELECT count(*) FROM comercial_leads l WHERE l.arquivado_em IS NULL AND l.marcos->>'cadencia' = $1::text)::int AS novos,
         (SELECT count(*) FROM comercial_reunioes r JOIN comercial_leads l ON l.id = r.lead_id AND l.arquivado_em IS NULL
           WHERE (r.criado_em AT TIME ZONE ${FUSO})::date = $1)::int AS reunioes_agendadas,
         (SELECT count(*) FROM comercial_reunioes r JOIN comercial_leads l ON l.id = r.lead_id AND l.arquivado_em IS NULL
           WHERE r.status = 'realizada' AND (r.inicio AT TIME ZONE ${FUSO})::date = $1)::int AS reunioes_realizadas,
         (SELECT count(*) FROM comercial_leads l WHERE l.arquivado_em IS NULL AND l.marcos->>'trial' = $1::text)::int AS trials,
         (SELECT count(*) FROM comercial_propostas x JOIN comercial_leads l ON l.id = x.lead_id AND l.arquivado_em IS NULL
           WHERE x.enviada_em = $1::date)::int AS propostas,
         (SELECT count(*) FROM comercial_leads l WHERE l.arquivado_em IS NULL AND l.etapa = 'ganho' AND l.marcos->>'ganho' = $1::text)::int AS ganhos,
         (SELECT count(*) FROM comercial_leads l WHERE l.arquivado_em IS NULL AND l.pago_em = $1::date)::int AS pagos,
         (SELECT COALESCE(sum(COALESCE(l.pago_valor, l.valor_mensal)), 0) FROM comercial_leads l
           WHERE l.arquivado_em IS NULL AND l.pago_em = $1::date)::float AS receita`,
      [hoje, RESULTADOS_CONECTAM],
    ),
    // --- Acumulado do mês ---
    query(
      `SELECT
         (SELECT count(*) FROM comercial_leads l WHERE l.arquivado_em IS NULL AND l.pago_em BETWEEN $1 AND $2)::int AS pagos,
         (SELECT COALESCE(sum(COALESCE(l.pago_valor, l.valor_mensal)), 0) FROM comercial_leads l
           WHERE l.arquivado_em IS NULL AND l.pago_em BETWEEN $1 AND $2)::float AS receita,
         (SELECT count(*) FROM comercial_leads l WHERE l.arquivado_em IS NULL AND l.etapa = 'ganho'
           AND (l.marcos->>'ganho')::date BETWEEN $1 AND $2)::int AS ganhos,
         (SELECT count(*) FROM comercial_reunioes r JOIN comercial_leads l ON l.id = r.lead_id AND l.arquivado_em IS NULL
           WHERE r.status = 'realizada' AND (r.inicio AT TIME ZONE ${FUSO})::date BETWEEN $1 AND $2)::int AS reunioes_realizadas,
         (SELECT count(*) FROM comercial_toques t JOIN comercial_leads l ON l.id = t.lead_id AND l.arquivado_em IS NULL
           WHERE t.data BETWEEN $1 AND $2 AND t.estornado_em IS NULL)::int AS toques`,
      [inicioMes, hoje],
    ),
    query(
      `SELECT dono_id, count(*)::int AS novos FROM comercial_leads
        WHERE arquivado_em IS NULL AND dono_id IS NOT NULL AND marcos->>'cadencia' = $1::text GROUP BY dono_id`,
      [hoje],
    ),
    // --- Feed do dia: o que aconteceu, mais recente primeiro ---
    query(
      `SELECT * FROM (
         SELECT 'toque' AS tipo, t.criado_em AS em, t.pessoa_id, l.nome AS lead, t.resultado AS detalhe, t.canal AS extra
           FROM comercial_toques t JOIN comercial_leads l ON l.id = t.lead_id AND l.arquivado_em IS NULL
          WHERE t.data = $1::date AND t.estornado_em IS NULL
         UNION ALL
         SELECT 'etapa', m.em, m.pessoa_id, l.nome, m.para_etapa, m.de_etapa
           FROM comercial_movimentos m JOIN comercial_leads l ON l.id = m.lead_id AND l.arquivado_em IS NULL
          WHERE (m.em AT TIME ZONE ${FUSO})::date = $1 AND m.de_etapa IS DISTINCT FROM m.para_etapa
         UNION ALL
         SELECT 'reuniao', r.criado_em, COALESCE(r.responsavel_id, r.criado_por_id), l.nome, r.tipo,
                to_char(r.inicio AT TIME ZONE ${FUSO}, 'DD/MM HH24:MI')
           FROM comercial_reunioes r JOIN comercial_leads l ON l.id = r.lead_id AND l.arquivado_em IS NULL
          WHERE (r.criado_em AT TIME ZONE ${FUSO})::date = $1
         UNION ALL
         SELECT 'proposta', x.criado_em, x.criado_por_id, l.nome, x.plano, x.valor_mensal::text
           FROM comercial_propostas x JOIN comercial_leads l ON l.id = x.lead_id AND l.arquivado_em IS NULL
          WHERE (x.criado_em AT TIME ZONE ${FUSO})::date = $1
         UNION ALL
         SELECT 'pagamento', a.em, COALESCE(l.dono_id, a.pessoa_id), l.nome, NULL,
                COALESCE(l.pago_valor, l.valor_mensal)::text
           FROM comercial_alteracoes a JOIN comercial_leads l ON l.id = a.lead_id AND l.arquivado_em IS NULL
          WHERE a.campo = 'pagamento' AND (a.em AT TIME ZONE ${FUSO})::date = $1 AND l.pago_em IS NOT NULL
       ) f
       ORDER BY em DESC
       LIMIT 30`,
      [hoje],
    ),
    // --- Agenda de reuniões de hoje ---
    query(
      `SELECT r.id, r.tipo, r.status, to_char(r.inicio AT TIME ZONE ${FUSO}, 'HH24:MI') AS hora,
              l.nome AS lead, COALESCE(r.responsavel_id, r.criado_por_id) AS pessoa_id
         FROM comercial_reunioes r JOIN comercial_leads l ON l.id = r.lead_id AND l.arquivado_em IS NULL
        WHERE (r.inicio AT TIME ZONE ${FUSO})::date = $1 AND r.status IN ('agendada','realizada','faltou')
        ORDER BY r.inicio`,
      [hoje],
    ),
  ]);

  // Nomes de quem aparece no feed/agenda (uma consulta só).
  const ids = [...new Set([...feed, ...agenda].map((x) => x.pessoa_id).filter(Boolean))];
  const { rows: pessoas } = ids.length
    ? await query(`SELECT id, nome FROM pessoas_acesso WHERE id = ANY($1::uuid[])`, [ids])
    : { rows: [] };
  const nomeDe = new Map(pessoas.map((p) => [p.id, nomeCurto(p.nome)]));

  // --- Metas ---
  const desd = desdobrarMeta(metas);
  const diasUteis = Number(metas.diasUteis) || 21;
  const du = diaUtilDoMes(hoje);
  const metasDia = {
    toques: Number(metas.metaToquesDia) || desd.contatos_dia || 0,
    novos: Number(metas.metaNovosDia) || 0,
    reunioes: desd.diagnosticos_mes ? Math.ceil(desd.diagnosticos_mes / diasUteis) : 0,
  };
  const metasMes = {
    clientes: Number(metas.metaClientes) || 0,
    receita: desd.receita_nova || 0,
    reunioes: desd.diagnosticos_mes || 0,
    toques: Number(metas.metaToquesDia) ? Number(metas.metaToquesDia) * diasUteis : (desd.contatos_mes || 0),
  };

  // --- Ranking de hoje (com metas individuais) ---
  const novosMap = new Map(novosPorDono.map((r) => [r.dono_id, r.novos]));
  const mesMap = new Map(rankMes.map((r) => [r.id, r]));
  const vistos = new Set();
  const ranking = rankHoje.map((r) => {
    vistos.add(r.id);
    const mp = metaPessoa(metas, r.id);
    const m = mesMap.get(r.id) || {};
    return {
      id: r.id, nome: nomeCurto(r.nome),
      toques: r.toques, conexoes: r.conexoes, reunioes: r.reunioes_agendadas,
      propostas: r.propostas, ganhos: r.assinados, pagos: r.pagos, receita: r.receita,
      novos: novosMap.get(r.id) || 0,
      meta_toques: mp.toquesDia, meta_novos: mp.novosDia,
      mes_pagos: m.pagos || 0, mes_receita: m.receita || 0,
    };
  });
  // Quem tem meta individual mas ainda não fez nada hoje também aparece (zerado).
  const comMeta = Object.keys(metas.porPessoa || {}).concat(Object.keys(metas.novosPorPessoa || {}));
  const faltantes = [...new Set(comMeta)].filter((id) => !vistos.has(id));
  if (faltantes.length) {
    const { rows } = await query(`SELECT id, nome FROM pessoas_acesso WHERE ativo AND id = ANY($1::uuid[])`, [faltantes]);
    for (const p of rows) {
      const mp = metaPessoa(metas, p.id);
      if (!mp.toquesDia && !mp.novosDia) continue;
      const m = mesMap.get(p.id) || {};
      ranking.push({
        id: p.id, nome: nomeCurto(p.nome), toques: 0, conexoes: 0, reunioes: 0, propostas: 0,
        ganhos: 0, pagos: 0, receita: 0, novos: novosMap.get(p.id) || 0,
        meta_toques: mp.toquesDia, meta_novos: mp.novosDia, mes_pagos: m.pagos || 0, mes_receita: m.receita || 0,
      });
    }
  }
  // Resultado pesa mais que atividade: pago > fechado > reunião > conexão > contato.
  const pontos = (r) => r.pagos * 1000 + r.ganhos * 500 + r.reunioes * 60 + r.propostas * 40 + r.conexoes * 5 + r.toques;
  ranking.forEach((r) => { r.pontos = pontos(r); });
  ranking.sort((a, b) => b.pontos - a.pontos || b.toques - a.toques || a.nome.localeCompare(b.nome));

  // --- Funil (etapas ativas + fechamentos) ---
  const porEtapa = totais.por_etapa || {};
  const funil = ETAPAS.filter((e) => e.k !== 'perdido')
    .map((e) => ({ k: e.k, nome: e.n, total: Number(porEtapa[e.k] || 0) }))
    .filter((e) => e.total > 0 || ['cadencia', 'diagnostico', 'trial', 'proposta', 'ganho'].includes(e.k));

  return {
    hoje, mes, gerado_em: new Date().toISOString(),
    dia_util: du,
    dia, metas_dia: metasDia,
    mes_acum: acum, metas_mes: metasMes,
    ranking,
    feed: feed.map((f) => ({
      tipo: f.tipo, em: f.em, pessoa: nomeDe.get(f.pessoa_id) || null, lead: f.lead,
      ...descreverEvento(f),
    })),
    agenda: agenda.map((a) => ({
      id: a.id, hora: a.hora, status: a.status, lead: a.lead,
      tipo: TIPOS_REUNIAO[a.tipo] || a.tipo, pessoa: nomeDe.get(a.pessoa_id) || null,
    })),
    funil,
    fila_sem_dono: totais.fila || 0,
    calendario: await calendarioReunioes(hoje),
    trial: await controleTrial(hoje, desd),
    mes_visao: await visaoMes(hoje, { metas, desd, diasUteis, rankMes }),
    ...(await mapaEQuentes(hoje)),
  };
}

/** Texto e "tom" de cada evento do feed (o front só desenha). */
export function descreverEvento(f) {
  switch (f.tipo) {
    case 'toque': {
      const conecta = RESULTADOS_CONECTAM.includes(f.detalhe);
      const txt = f.detalhe ? (NOME_RESULTADO[f.detalhe] || f.detalhe) : 'Contato registrado';
      return { texto: txt + (f.extra ? ` · ${f.extra}` : ''), tom: f.detalhe === 'agendou' ? 'bom' : conecta ? 'info' : 'neutro' };
    }
    case 'etapa': {
      const para = ETAPA[f.detalhe]?.n || f.detalhe;
      if (f.detalhe === 'ganho') return { texto: 'Fechou negócio! 🎉', tom: 'otimo' };
      if (f.detalhe === 'perdido') return { texto: 'Marcado como perdido', tom: 'ruim' };
      return { texto: `Avançou para ${para}`, tom: 'info' };
    }
    case 'reuniao':
      return { texto: `Agendou ${String(TIPOS_REUNIAO[f.detalhe] || 'reunião').split(' (')[0].toLowerCase()}${f.extra ? ` · ${f.extra}` : ''}`, tom: 'bom' };
    case 'proposta':
      return { texto: `Proposta enviada · ${f.detalhe}`, valor: Number(f.extra) || null, tom: 'bom' };
    case 'pagamento':
      return { texto: 'Pagamento confirmado 💰', valor: Number(f.extra) || null, tom: 'otimo' };
    default:
      return { texto: f.tipo, tom: 'neutro' };
  }
}

// ---------------------------------------------------------------------------
// Sprint 42N — Calendário das reuniões (tela que alterna com o painel na TV)
// ---------------------------------------------------------------------------

const TIPO_CURTO = { diagnostico: 'Apresentação', ativacao: 'Ativação', resultado: 'Resultado', outra: 'Outra' };

/** Segunda-feira da semana de `iso` (YYYY-MM-DD). */
export function segundaDaSemana(iso) {
  const [y, m, d] = iso.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  const dow = dt.getUTCDay(); // 0 = domingo
  dt.setUTCDate(dt.getUTCDate() - ((dow + 6) % 7));
  return dt.toISOString().slice(0, 10);
}

function somarDias(iso, n) {
  const [y, m, d] = iso.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d + n));
  return dt.toISOString().slice(0, 10);
}

/**
 * Reuniões desta semana e da próxima (seg → sex), com QUEM MARCOU
 * (criado_por) e quem conduz (responsável). Remarcadas e canceladas
 * ficam de fora: a remarcação já aparece como a reunião nova.
 * Também devolve o placar de "quem marcou" (período e hoje).
 */
export async function calendarioReunioes(hoje) {
  const inicio = segundaDaSemana(hoje);
  const fim = somarDias(inicio, 11); // sexta da semana seguinte
  const { rows } = await query(
    `SELECT r.id, r.tipo, r.status,
            to_char(r.inicio AT TIME ZONE ${FUSO}, 'YYYY-MM-DD') AS dia,
            to_char(r.inicio AT TIME ZONE ${FUSO}, 'HH24:MI') AS hora,
            l.nome AS lead, l.cidade, l.uf,
            r.criado_por_id, pc.nome AS marcou_nome,
            COALESCE(r.responsavel_id, r.criado_por_id) AS conduz_id, pr.nome AS conduz_nome,
            (r.criado_em AT TIME ZONE ${FUSO})::date::text AS marcada_em
       FROM comercial_reunioes r
       JOIN comercial_leads l ON l.id = r.lead_id AND l.arquivado_em IS NULL
       LEFT JOIN pessoas_acesso pc ON pc.id = r.criado_por_id
       LEFT JOIN pessoas_acesso pr ON pr.id = COALESCE(r.responsavel_id, r.criado_por_id)
      WHERE (r.inicio AT TIME ZONE ${FUSO})::date BETWEEN $1::date AND $2::date
        AND r.status IN ('agendada', 'realizada', 'faltou')
      ORDER BY r.inicio`,
    [inicio, fim],
  );

  const reunioes = rows.map((r) => ({
    id: r.id, dia: r.dia, hora: r.hora, status: r.status,
    tipo: TIPO_CURTO[r.tipo] || r.tipo,
    lead: r.lead, local: [r.cidade, r.uf].filter(Boolean).join('/') || null,
    marcou: r.criado_por_id ? nomeCurto(r.marcou_nome) : null,
    marcou_id: r.criado_por_id,
    conduz: r.conduz_id && r.conduz_id !== r.criado_por_id ? nomeCurto(r.conduz_nome) : null,
    marcada_hoje: r.marcada_em === hoje,
  }));

  // Dias úteis do período (seg–sex das duas semanas; feriado vem marcado)
  const dias = [];
  for (let i = 0; i < 12; i++) {
    const d = somarDias(inicio, i);
    const dow = new Date(d + 'T12:00:00Z').getUTCDay();
    if (dow === 0 || dow === 6) continue;
    dias.push({ dia: d, util: ehDiaUtil(d), hoje: d === hoje, passado: d < hoje });
  }

  // Placar de quem marcou (reuniões que caem no período)
  const porPessoa = new Map();
  for (const r of reunioes) {
    if (!r.marcou_id) continue;
    const p = porPessoa.get(r.marcou_id) || { id: r.marcou_id, nome: r.marcou, total: 0, realizadas: 0, hoje: 0 };
    p.total += 1;
    if (r.status === 'realizada') p.realizadas += 1;
    if (r.marcada_hoje) p.hoje += 1;
    porPessoa.set(r.marcou_id, p);
  }
  const marcadores = [...porPessoa.values()].sort((a, b) => b.total - a.total || a.nome.localeCompare(b.nome));

  return { inicio, fim, dias, reunioes, marcadores };
}

// ---------------------------------------------------------------------------
// Sprint 42O — Controle do trial (tela da TV)
// ---------------------------------------------------------------------------

/**
 * Trials em andamento, marco a marco, mais os números do mês:
 * iniciados × meta (desdobrada das metas do Comercial) e o que já decidiu.
 * Mesmas regras da aba Trial (situacaoTrial): uso < 40 pts a partir do D3
 * é crítico; passou da data de decisão sem decidir é crítico.
 */
export async function controleTrial(hoje, desd = {}) {
  const inicioMes = mesDe(hoje) + '-01';
  const [{ rows: leads }, { rows: [mes] }, { rows: decisoes }] = await Promise.all([
    query(
      `SELECT l.id, l.nome, l.cidade, l.uf, l.etapa, l.dono_id, pd.nome AS dono_nome,
              l.trial_inicio::text AS trial_inicio, l.trial_fim::text AS trial_fim, l.trial_prorrogado,
              l.meta_sucesso, l.sinais,
              COALESCE((SELECT jsonb_object_agg(t.dia::text, t.data::text) FROM comercial_toques t
                         WHERE t.lead_id = l.id AND t.tipo = 'trial' AND t.estornado_em IS NULL), '{}'::jsonb) AS toques_trial,
              (SELECT to_char(r.inicio AT TIME ZONE ${FUSO}, 'YYYY-MM-DD HH24:MI') FROM comercial_reunioes r
                WHERE r.lead_id = l.id AND r.tipo = 'resultado' AND r.status = 'agendada' ORDER BY r.inicio LIMIT 1) AS reuniao_resultado,
              EXISTS (SELECT 1 FROM comercial_propostas x WHERE x.lead_id = l.id AND x.status IN ('enviada','aceita')) AS tem_proposta
         FROM comercial_leads l LEFT JOIN pessoas_acesso pd ON pd.id = l.dono_id
        WHERE l.arquivado_em IS NULL AND l.etapa = 'trial' AND l.trial_inicio IS NOT NULL
        ORDER BY l.trial_inicio`,
    ),
    query(
      `SELECT
         count(*) FILTER (WHERE (marcos->>'trial')::date >= $1::date)::int AS iniciados,
         count(*) FILTER (WHERE marcos ? 'trial' AND etapa = 'ganho' AND (marcos->>'ganho')::date >= $1::date)::int AS ganhos,
         count(*) FILTER (WHERE marcos ? 'trial' AND pago_em >= $1::date)::int AS pagos,
         count(*) FILTER (WHERE marcos ? 'trial' AND etapa = 'perdido' AND (marcos->>'perdido')::date >= $1::date)::int AS perdidos,
         count(*) FILTER (WHERE marcos ? 'trial' AND etapa IN ('proposta','corregedoria') AND etapa_desde >= $1::date)::int AS pensando
         FROM comercial_leads WHERE arquivado_em IS NULL`,
      [inicioMes],
    ),
    query(
      `SELECT COALESCE(motivo_perda, 'Sem motivo') AS motivo, count(*)::int AS n
         FROM comercial_leads
        WHERE arquivado_em IS NULL AND marcos ? 'trial' AND etapa = 'perdido' AND (marcos->>'perdido')::date >= $1::date
        GROUP BY 1 ORDER BY 2 DESC`,
      [inicioMes],
    ),
  ]);

  const ativos = leads.map((l) => {
    const sit = situacaoTrial(l, hoje);
    const feitos = l.toques_trial || {};
    const marcos = MARCOS_TRIAL.map((m) => {
      const previsto = m.d === DIAS_TRIAL && l.trial_fim ? l.trial_fim : addDias(l.trial_inicio, m.d);
      const estado = feitos[m.d] ? 'feito' : previsto < hoje ? 'atrasado' : previsto === hoje ? 'hoje' : 'futuro';
      return { d: m.d, n: m.n, previsto, estado };
    });
    return {
      id: l.id, nome: l.nome, local: [l.cidade, l.uf].filter(Boolean).join('/') || null,
      dono: l.dono_id ? nomeCurto(l.dono_nome) : null, dono_id: l.dono_id,
      dia: sit.dia, fim: sit.fim, prorrogado: !!l.trial_prorrogado,
      pontos: pontuacao(l), sinais: SINAIS.map((x) => ({ k: x.k, n: x.n, ok: !!(l.sinais || {})[x.k] })),
      nivel: sit.nivel, texto: sit.texto, vencido: sit.vencido,
      meta_sucesso: l.meta_sucesso || null,
      proximo: sit.proximo_marco ? { d: sit.proximo_marco.d, n: sit.proximo_marco.n, previsto: marcos.find((m) => m.d === sit.proximo_marco.d)?.previsto, atrasado: marcos.find((m) => m.d === sit.proximo_marco.d)?.estado === 'atrasado' } : null,
      marcos, atrasados: marcos.filter((m) => m.estado === 'atrasado').length,
      reuniao_resultado: l.reuniao_resultado, tem_proposta: l.tem_proposta,
    };
  });
  // Quem precisa de atenção primeiro: crítico → atenção → no caminho; depois a decisão mais próxima
  const peso = { crit: 0, warn: 1, ok: 2 };
  ativos.sort((a, b) => peso[a.nivel] - peso[b.nivel] || b.atrasados - a.atrasados || a.fim.localeCompare(b.fim));

  const fimSemana = addDias(hoje, 7);
  const decididos = mes.ganhos + mes.perdidos;
  return {
    ativos,
    resumo: {
      em_andamento: ativos.length,
      criticos: ativos.filter((t) => t.nivel === 'crit').length,
      atencao: ativos.filter((t) => t.nivel === 'warn').length,
      marcos_atrasados: ativos.reduce((s, t) => s + t.atrasados, 0),
      decidem_semana: ativos.filter((t) => t.fim <= fimSemana).length,
      uso_medio: ativos.length ? Math.round(ativos.reduce((s, t) => s + t.pontos, 0) / ativos.length) : null,
    },
    mes: {
      ...mes,
      meta_iniciados: desd.propostas_mes || 0, // desdobrarMeta: nº de trials do mês
      conversao: decididos ? Math.round((mes.ganhos / decididos) * 100) : null,
      motivos_perda: decisoes,
    },
  };
}

// ---------------------------------------------------------------------------
// Sprint 42O — Visão do mês (tela da TV)
// ---------------------------------------------------------------------------

/**
 * O mês inteiro numa tela: meta × realizado com ritmo esperado pelo dia útil,
 * projeção de fechamento, série dia a dia e ranking do mês.
 * Projeção = realizado ÷ dias úteis decorridos × dias úteis do mês.
 */
export async function visaoMes(hoje, { metas, desd, diasUteis, rankMes }) {
  const mes = mesDe(hoje);
  const inicio = mes + '-01';
  const [y, m] = mes.split('-').map(Number);
  const ultimo = new Date(Date.UTC(y, m, 0)).toISOString().slice(0, 10);

  const [{ rows: [tot] }, { rows: porDia }] = await Promise.all([
    query(
      `SELECT
         (SELECT count(*) FROM comercial_toques t JOIN comercial_leads l ON l.id = t.lead_id AND l.arquivado_em IS NULL
           WHERE t.data BETWEEN $1::date AND $2::date AND t.estornado_em IS NULL)::int AS toques,
         (SELECT count(*) FROM comercial_toques t JOIN comercial_leads l ON l.id = t.lead_id AND l.arquivado_em IS NULL
           WHERE t.data BETWEEN $1::date AND $2::date AND t.estornado_em IS NULL AND t.resultado = ANY($3))::int AS conexoes,
         (SELECT count(*) FROM comercial_leads l WHERE l.arquivado_em IS NULL AND (l.marcos->>'cadencia')::date BETWEEN $1::date AND $2::date)::int AS novos,
         (SELECT count(*) FROM comercial_reunioes r JOIN comercial_leads l ON l.id = r.lead_id AND l.arquivado_em IS NULL
           WHERE r.status = 'realizada' AND (r.inicio AT TIME ZONE ${FUSO})::date BETWEEN $1::date AND $2::date)::int AS reunioes,
         (SELECT count(*) FROM comercial_leads l WHERE l.arquivado_em IS NULL AND (l.marcos->>'trial')::date BETWEEN $1::date AND $2::date)::int AS trials,
         (SELECT count(*) FROM comercial_propostas x JOIN comercial_leads l ON l.id = x.lead_id AND l.arquivado_em IS NULL
           WHERE x.enviada_em BETWEEN $1::date AND $2::date)::int AS propostas,
         (SELECT count(*) FROM comercial_leads l WHERE l.arquivado_em IS NULL AND l.etapa = 'ganho' AND (l.marcos->>'ganho')::date BETWEEN $1::date AND $2::date)::int AS ganhos,
         (SELECT count(*) FROM comercial_leads l WHERE l.arquivado_em IS NULL AND l.pago_em BETWEEN $1::date AND $2::date)::int AS pagos,
         (SELECT COALESCE(sum(COALESCE(l.pago_valor, l.valor_mensal)), 0) FROM comercial_leads l
           WHERE l.arquivado_em IS NULL AND l.pago_em BETWEEN $1::date AND $2::date)::float AS receita`,
      [inicio, hoje, RESULTADOS_CONECTAM],
    ),
    query(
      `WITH d AS (SELECT generate_series($1::date, $2::date, interval '1 day')::date AS dia)
       SELECT d.dia::text AS dia,
         (SELECT count(*) FROM comercial_toques t JOIN comercial_leads l ON l.id = t.lead_id AND l.arquivado_em IS NULL
           WHERE t.data = d.dia AND t.estornado_em IS NULL)::int AS toques,
         (SELECT count(*) FROM comercial_reunioes r JOIN comercial_leads l ON l.id = r.lead_id AND l.arquivado_em IS NULL
           WHERE r.status = 'realizada' AND (r.inicio AT TIME ZONE ${FUSO})::date = d.dia)::int AS reunioes,
         (SELECT count(*) FROM comercial_leads l WHERE l.arquivado_em IS NULL AND l.etapa = 'ganho' AND (l.marcos->>'ganho')::date = d.dia)::int AS ganhos,
         (SELECT count(*) FROM comercial_leads l WHERE l.arquivado_em IS NULL AND l.pago_em = d.dia)::int AS pagos
         FROM d ORDER BY d.dia`,
      [inicio, ultimo],
    ),
  ]);

  const du = diaUtilDoMes(hoje);
  // dias úteis já "gastos": hoje conta pela metade do expediente só no front; aqui, os encerrados + hoje
  const decorridos = Math.max(1, du.n);
  const proj = (v) => Math.round((v / decorridos) * du.de);
  const metaDiaToques = Number(metas.metaToquesDia) || desd.contatos_dia || 0;

  const indicadores = [
    { k: 'pagos', nome: 'Clientes pagos', feito: tot.pagos, meta: Number(metas.metaClientes) || 0, moeda: false },
    { k: 'receita', nome: 'Receita nova (mensal)', feito: tot.receita, meta: desd.receita_nova || 0, moeda: true },
    { k: 'trials', nome: 'Trials iniciados', feito: tot.trials, meta: desd.propostas_mes || 0, moeda: false },
    { k: 'reunioes', nome: 'Reuniões realizadas', feito: tot.reunioes, meta: desd.diagnosticos_mes || 0, moeda: false },
    { k: 'toques', nome: 'Contatos', feito: tot.toques, meta: metaDiaToques * diasUteis, moeda: false },
  ].map((x) => ({ ...x, projecao: proj(x.feito) }));

  const dias = porDia.map((d) => ({
    ...d, util: ehDiaUtil(d.dia), futuro: d.dia > hoje, hoje: d.dia === hoje,
  }));

  const taxa = (a, b) => (b ? Math.round((a / b) * 1000) / 10 : null);
  const funil = {
    contato_reuniao: { real: taxa(tot.reunioes, tot.toques), meta: Number(metas.taxaContatoDiag) || null },
    reuniao_trial: { real: taxa(tot.trials, tot.reunioes), meta: Number(metas.taxaDiagTrial) || null },
    trial_pago: { real: taxa(tot.pagos, tot.trials), meta: Number(metas.taxaTrialPago) || null },
    conexao: taxa(tot.conexoes, tot.toques),
  };

  const ranking = rankMes
    .map((r) => ({
      id: r.id, nome: nomeCurto(r.nome), toques: r.toques, reunioes: r.reunioes_realizadas,
      propostas: r.propostas, ganhos: r.assinados, pagos: r.pagos, receita: r.receita,
    }))
    .sort((a, b) => b.pagos - a.pagos || b.receita - a.receita || b.ganhos - a.ganhos || b.reunioes - a.reunioes || b.toques - a.toques);

  return {
    mes, inicio, fim: ultimo, dia_util: du, totais: tot, indicadores,
    meta_dia_toques: metaDiaToques, dias, funil, ranking,
  };
}

// ---------------------------------------------------------------------------
// Sprint 42P — Mapa da presença e funil dos mais quentes (telas da TV)
// ---------------------------------------------------------------------------

export const UFS = ['AC','AL','AM','AP','BA','CE','DF','ES','GO','MA','MG','MS','MT','PA','PB','PE','PI','PR','RJ','RN','RO','RR','RS','SC','SE','SP','TO'];
const NOME_UF = {
  'acre': 'AC', 'alagoas': 'AL', 'amazonas': 'AM', 'amapa': 'AP', 'bahia': 'BA', 'ceara': 'CE', 'distrito federal': 'DF',
  'espirito santo': 'ES', 'goias': 'GO', 'maranhao': 'MA', 'minas gerais': 'MG', 'mato grosso do sul': 'MS', 'mato grosso': 'MT',
  'para': 'PA', 'paraiba': 'PB', 'pernambuco': 'PE', 'piaui': 'PI', 'parana': 'PR', 'rio de janeiro': 'RJ',
  'rio grande do norte': 'RN', 'rondonia': 'RO', 'roraima': 'RR', 'rio grande do sul': 'RS', 'santa catarina': 'SC',
  'sergipe': 'SE', 'sao paulo': 'SP', 'tocantins': 'TO',
};
const semAcento = (s) => String(s || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '');

/**
 * UF do cadastro; se vazia ou inválida, tenta pelo nome (só para exibir,
 * nada é gravado): "TJPE - ...", "... - Rio Verde/GO", "Estado de São Paulo".
 */
export function ufDoLead(l) {
  const u = String(l.uf || '').trim().toUpperCase();
  if (UFS.includes(u)) return { uf: u, inferida: false };
  const nome = semAcento(l.nome);
  let m = nome.match(/\bTJ([A-Z]{2})\b/);
  if (m && UFS.includes(m[1])) return { uf: m[1], inferida: true };
  m = nome.match(/[\/(\-–]\s*([A-Z]{2})\s*\)?\s*$/);
  if (m && UFS.includes(m[1])) return { uf: m[1], inferida: true };
  m = nome.toLowerCase().match(/estado d[eo] ([a-z ]+?)(?:[,.)]|$)/);
  if (m && NOME_UF[m[1].trim()]) return { uf: NOME_UF[m[1].trim()], inferida: true };
  return { uf: null, inferida: false };
}

// Do mais avançado ao mais frio — o mapa pinta cada estado pelo melhor estágio que tem.
export const ESTAGIOS_MAPA = [
  { k: 'cliente', n: 'Cliente', etapas: ['ganho'] },
  { k: 'trial', n: 'Em trial', etapas: ['trial'] },
  { k: 'negociacao', n: 'Proposta / negociação', etapas: ['proposta', 'corregedoria'] },
  { k: 'reuniao', n: 'Reunião de apresentação', etapas: ['diagnostico'] },
  { k: 'contato', n: 'Em contato', etapas: ['cadencia'] },
  { k: 'prospeccao', n: 'Só prospecção', etapas: ['prospect'] },
];
const ESTAGIO_DA_ETAPA = Object.fromEntries(ESTAGIOS_MAPA.flatMap((e) => e.etapas.map((et) => [et, e.k])));

/**
 * Temperatura de 0 a 100 de um cartório em negociação, com os motivos.
 * Estágio dá a base; o que aconteceu nos últimos dias esquenta; parado esfria.
 */
export function temperatura(l, hoje) {
  const motivos = [];
  let t = { cadencia: 15, diagnostico: 35, trial: 50, proposta: 50, corregedoria: 45 }[l.etapa] ?? 0;
  if (l.etapa === 'trial') {
    const pts = pontuacao(l);
    t += Math.round(pts / 5); // até +20
    motivos.push(`trial · ${pts} pts de uso`);
  }
  if (l.proposta_valor) { t += 10; motivos.push(`proposta ${Number(l.proposta_valor).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 })}`); }
  if (l.proxima_reuniao) {
    const dias = Math.round((Date.parse(l.proxima_reuniao.slice(0, 10)) - Date.parse(hoje)) / 864e5);
    if (dias <= 7) { t += dias <= 1 ? 20 : 12; motivos.push(dias === 0 ? `reunião hoje ${l.proxima_reuniao.slice(11)}` : dias === 1 ? `reunião amanhã ${l.proxima_reuniao.slice(11)}` : `reunião em ${dias} dias`); }
  }
  if (l.ultima_conexao) {
    const dias = Math.round((Date.parse(hoje) - Date.parse(l.ultima_conexao)) / 864e5);
    if (dias <= 3) { t += 20; motivos.push(dias === 0 ? 'respondeu hoje' : `respondeu há ${dias} dia${dias === 1 ? '' : 's'}`); }
    else if (dias <= 7) { t += 10; motivos.push(`respondeu há ${dias} dias`); }
  }
  const semContato = l.ultimo_toque ? Math.round((Date.parse(hoje) - Date.parse(l.ultimo_toque)) / 864e5) : null;
  if (semContato == null || semContato > 14) { t -= 15; motivos.push(semContato == null ? 'nenhum contato registrado' : `${semContato} dias sem contato`); }
  return { t: Math.max(0, Math.min(100, t)), motivos };
}

export async function mapaEQuentes(hoje) {
  const { rows } = await query(
    `SELECT l.id, l.nome, l.cidade, l.uf, l.etapa, l.dono_id, pd.nome AS dono_nome, l.sinais,
            l.trial_inicio::text AS trial_inicio, l.etapa_desde::text AS etapa_desde,
            (SELECT max(t.data)::text FROM comercial_toques t WHERE t.lead_id = l.id AND t.estornado_em IS NULL) AS ultimo_toque,
            (SELECT max(t.data)::text FROM comercial_toques t WHERE t.lead_id = l.id AND t.estornado_em IS NULL
               AND t.resultado = ANY($1)) AS ultima_conexao,
            (SELECT to_char(min(r.inicio) AT TIME ZONE ${FUSO}, 'YYYY-MM-DD HH24:MI') FROM comercial_reunioes r
              WHERE r.lead_id = l.id AND r.status = 'agendada' AND r.inicio >= now() - interval '2 hours') AS proxima_reuniao,
            (SELECT x.valor_mensal::float FROM comercial_propostas x WHERE x.lead_id = l.id AND x.status = 'enviada'
              ORDER BY x.enviada_em DESC LIMIT 1) AS proposta_valor
       FROM comercial_leads l LEFT JOIN pessoas_acesso pd ON pd.id = l.dono_id
      WHERE l.arquivado_em IS NULL AND l.etapa <> 'perdido'`,
    [RESULTADOS_CONECTAM],
  );

  // ---- Mapa: contagem por UF e estágio ----
  const porUf = {};
  let semUf = 0; let semUfAtivos = 0; let inferidas = 0;
  for (const l of rows) {
    const est = ESTAGIO_DA_ETAPA[l.etapa];
    if (!est) continue;
    const { uf, inferida } = ufDoLead(l);
    if (!uf) { semUf += 1; if (est !== 'prospeccao') semUfAtivos += 1; continue; }
    if (inferida) inferidas += 1;
    const u = (porUf[uf] ||= { uf, total: 0, ...Object.fromEntries(ESTAGIOS_MAPA.map((e) => [e.k, 0])) });
    u[est] += 1; u.total += 1;
  }
  const ordemEst = ESTAGIOS_MAPA.map((e) => e.k);
  const estados = Object.values(porUf).map((u) => ({
    ...u,
    melhor: ordemEst.find((k) => u[k] > 0),
    ativos: u.total - u.prospeccao,
  })).sort((a, b) => ordemEst.indexOf(a.melhor) - ordemEst.indexOf(b.melhor) || b.cliente - a.cliente || b.ativos - a.ativos || b.total - a.total);
  const totais = Object.fromEntries(ESTAGIOS_MAPA.map((e) => [e.k, estados.reduce((s, u) => s + u[e.k], 0)]));
  const mapa = {
    estagios: ESTAGIOS_MAPA.map(({ k, n }) => ({ k, n })),
    estados, totais,
    estados_com: Object.fromEntries(ordemEst.map((k) => [k, estados.filter((u) => u[k] > 0).length])),
    sem_uf: semUf, sem_uf_ativos: semUfAtivos, uf_inferida: inferidas,
  };

  // ---- Funil quente ----
  const etapasFunil = ['prospect', 'cadencia', 'diagnostico', 'trial', 'proposta', 'corregedoria', 'ganho'];
  const contagem = Object.fromEntries(etapasFunil.map((e) => [e, 0]));
  const quentes = [];
  for (const l of rows) {
    if (contagem[l.etapa] != null) contagem[l.etapa] += 1;
    if (!['cadencia', 'diagnostico', 'trial', 'proposta', 'corregedoria'].includes(l.etapa)) continue;
    const { t, motivos } = temperatura(l, hoje);
    const { uf } = ufDoLead(l);
    quentes.push({
      id: l.id, nome: l.nome, etapa: l.etapa, etapa_nome: ETAPA[l.etapa]?.n || l.etapa,
      local: [l.cidade, uf].filter(Boolean).join('/') || null,
      dono: l.dono_id ? nomeCurto(l.dono_nome) : null, temperatura: t, motivos,
    });
  }
  quentes.sort((a, b) => b.temperatura - a.temperatura || a.nome.localeCompare(b.nome));
  const QUENTE = 60;
  const funil = etapasFunil.map((e) => ({
    k: e, nome: ETAPA[e]?.n || e, total: contagem[e],
    quentes: quentes.filter((q) => q.etapa === e && q.temperatura >= QUENTE).length,
  })).filter((e) => e.total > 0 || ['cadencia', 'diagnostico', 'trial', 'proposta', 'ganho'].includes(e.k));

  return {
    mapa,
    funil_quente: {
      funil, limiar: QUENTE,
      quentes: quentes.slice(0, 10),
      resumo: {
        quentes: quentes.filter((q) => q.temperatura >= QUENTE).length,
        mornos: quentes.filter((q) => q.temperatura >= 35 && q.temperatura < QUENTE).length,
        frios: quentes.filter((q) => q.temperatura < 35).length,
      },
    },
  };
}
