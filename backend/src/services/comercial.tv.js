import { query } from '../config/database.js';
import {
  ETAPAS, ETAPA, RESULTADOS, RESULTADOS_CONECTAM, TIPOS_REUNIAO,
  hojeBR, mesDe, ehDiaUtil, diasUteisDoMes, desdobrarMeta, metaPessoa,
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
