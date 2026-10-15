/**
 * Sprint 43 — AdaptAI: consultas, enriquecimento e painéis (tela e TV).
 */
import { query } from '../config/database.js';
import {
  hojeBR, addDias, diffDias, ETAPAS, FINAIS_TRILHA, NOME_ETAPA, ehAberta, etapaInfo,
  CADENCIA, PASSO, MARCOS_PILOTO, METAS, TIPO, TIPO_ATIV, RESPONDEU, DECISOR, ROTAS,
  somaPontos, prioridade, situacaoPrazo, passoDevido, marcoPilotoDevido, situacaoPiloto,
  inicioSemana, diaDaSemana,
} from './adaptai.regras.js';

export const SELECT_ESCOLA = `
  SELECT e.*, e.etapa_desde::text AS etapa_desde, e.cadencia_inicio::text AS cadencia_inicio,
         e.piloto_inicio::text AS piloto_inicio, e.piloto_fim::text AS piloto_fim,
         e.nutricao_ate::text AS nutricao_ate, e.proxima_data::text AS proxima_data,
         pd.nome AS dono_nome
    FROM adapt_escolas e
    LEFT JOIN pessoas_acesso pd ON pd.id = e.dono_id`;

export function novoProtocolo(hoje = hojeBR()) {
  return 'AD-' + hoje.replace(/-/g, '') + '-' + Math.random().toString(36).slice(2, 7).toUpperCase();
}

/** Atividades (não estornadas) das escolas indicadas, agrupadas por escola. */
export async function atividadesPorEscola(ids) {
  if (!ids.length) return new Map();
  const { rows } = await query(
    `SELECT a.id, a.escola_id, a.tipo, a.passo, a.resultado, a.status, a.data::text AS data, a.quando,
            a.com_quem, a.nota, a.pessoa_id, a.estornado_em
       FROM adapt_atividades a
      WHERE a.escola_id = ANY($1::uuid[]) AND a.estornado_em IS NULL`,
    [ids],
  );
  const m = new Map();
  for (const r of rows) {
    if (!m.has(r.escola_id)) m.set(r.escola_id, []);
    m.get(r.escola_id).push(r);
  }
  return m;
}

/** Acrescenta campos calculados (prioridade, prazo, passo devido, piloto). */
export function enriquecer(e, atividades = [], hoje = hojeBR()) {
  const soma = somaPontos(e);
  const pontos = soma ?? e.pontos;
  const feitas = atividades.filter((a) => a.status === 'feito');
  const passos = new Set(feitas.filter((a) => a.passo).map((a) => a.passo));
  const tiposFeitos = new Set(feitas.map((a) => a.tipo));
  const agendadas = atividades.filter((a) => a.status === 'agendado').sort((a, b) => String(a.quando).localeCompare(String(b.quando)));
  return {
    ...e,
    valor_mensal: e.valor_mensal == null ? null : Number(e.valor_mensal),
    pontos_calc: pontos,
    pontos_preliminar: soma == null && e.pontos != null,
    prioridade: e.trilha === 'escola' ? prioridade(pontos) : null,
    prazo: situacaoPrazo(e, hoje),
    passo: passoDevido(e, passos, hoje),
    passos_feitos: [...passos],
    piloto_marco: marcoPilotoDevido(e, tiposFeitos, hoje),
    piloto_sit: situacaoPiloto(e, hoje),
    proxima_reuniao: agendadas[0] || null,
    n_contatos: feitas.filter((a) => TIPO_ATIV[a.tipo]?.contato).length,
    ultima_atividade: feitas.map((a) => a.data).sort().pop() || null,
  };
}

export async function carregarEscola(id, client = { query }) {
  const { rows } = await client.query(`${SELECT_ESCOLA} WHERE e.id = $1`, [id]);
  return rows[0] || null;
}

export async function listarEscolas({ incluirArquivadas = false } = {}) {
  const { rows } = await query(`${SELECT_ESCOLA} ${incluirArquivadas ? '' : 'WHERE e.arquivado_em IS NULL'} ORDER BY e.nome`);
  const ativ = await atividadesPorEscola(rows.map((r) => r.id));
  const hoje = hojeBR();
  return rows.map((r) => enriquecer(r, ativ.get(r.id) || [], hoje));
}

// ---------------------------------------------------------------------------
// Metas
// ---------------------------------------------------------------------------
export async function lerMetas() {
  const { rows } = await query(`SELECT chave, valor FROM adapt_metas`);
  const salvo = Object.fromEntries(rows.map((r) => [r.chave, r.valor]));
  return Object.fromEntries(METAS.map((m) => [m.k, salvo[m.k] ?? m.padrao]));
}

// ---------------------------------------------------------------------------
// Números de uma semana (segunda a domingo)
// ---------------------------------------------------------------------------
export async function numerosSemana(ini, fim) {
  const { rows } = await query(
    `SELECT a.escola_id, a.tipo, a.resultado, a.status, a.data::text AS data, a.pessoa_id
       FROM adapt_atividades a
      WHERE a.estornado_em IS NULL AND a.data BETWEEN $1 AND $2`,
    [ini, fim],
  );
  const feitas = rows.filter((r) => r.status === 'feito');
  const contatos = feitas.filter((r) => r.tipo === 'visita' || r.tipo === 'ligacao'
    || (['whatsapp', 'email'].includes(r.tipo) && RESPONDEU.includes(r.resultado))).length;
  const { rows: chegou } = await query(
    `SELECT id FROM adapt_escolas WHERE arquivado_em IS NULL
        AND ((marcos->>'decisor') BETWEEN $1 AND $2 OR (marcos->>'apresentacao') BETWEEN $1 AND $2)`,
    [ini, fim],
  );
  const decisores = new Set([
    ...feitas.filter((r) => DECISOR.includes(r.resultado)
      || ['reuniao_direcao', 'demo', 'reuniao_tecnica'].includes(r.tipo)).map((r) => r.escola_id),
    ...chegou.map((r) => r.id),
  ]).size;
  const visitas = feitas.filter((r) => r.tipo === 'visita').length;
  const diagnosticos = feitas.filter((r) => r.tipo === 'diagnostico').length;
  const demos = feitas.filter((r) => ['demo', 'oficina'].includes(r.tipo)).length;
  const demosAgendadas = rows.filter((r) => r.status === 'agendado' && ['demo', 'oficina'].includes(r.tipo)).length;
  const { rows: prop } = await query(
    `SELECT count(*)::int AS n FROM adapt_escolas
      WHERE arquivado_em IS NULL
        AND ((marcos->>'proposta') BETWEEN $1 AND $2 OR (marcos->>'piloto_rede') BETWEEN $1 AND $2)`,
    [ini, fim],
  );
  const porPessoa = {};
  for (const r of feitas) {
    if (!r.pessoa_id) continue;
    porPessoa[r.pessoa_id] ??= { contatos: 0, visitas: 0, reunioes: 0 };
    if (TIPO_ATIV[r.tipo]?.contato) porPessoa[r.pessoa_id].contatos += 1;
    if (r.tipo === 'visita') porPessoa[r.pessoa_id].visitas += 1;
    if (TIPO_ATIV[r.tipo]?.reuniao) porPessoa[r.pessoa_id].reunioes += 1;
  }
  return { contatos, decisores, visitas, diagnosticos, demos, demos_agendadas: demosAgendadas, propostas: prop[0].n, por_pessoa: porPessoa };
}

// ---------------------------------------------------------------------------
// Painel da tela (Hoje, Semana, Pilotos, Funil)
// ---------------------------------------------------------------------------
export async function calcularPainel({ semana } = {}) {
  const hoje = hojeBR();
  const escolas = await listarEscolas();
  const abertas = escolas.filter((e) => ehAberta(e.etapa));
  const ini = semana ? inicioSemana(semana) : inicioSemana(hoje);
  const fim = addDias(ini, 6);
  const [numeros, metas] = await Promise.all([numerosSemana(ini, fim), lerMetas()]);

  const resumo = (e) => ({
    id: e.id, nome: e.nome, tipo: e.tipo, trilha: e.trilha, etapa: e.etapa, bairro: e.bairro, rota: e.rota,
    prioridade: e.prioridade, pontos: e.pontos_calc, dono_id: e.dono_id, dono_nome: e.dono_nome,
    telefone: e.telefone, endereco: e.endereco, proximo_passo: e.proximo_passo, proxima_data: e.proxima_data,
  });

  // Agenda (reuniões e visitas marcadas)
  const { rows: agenda } = await query(
    `SELECT a.id, a.escola_id, a.tipo, a.quando, a.data::text AS data, a.com_quem, a.nota, a.pessoa_id,
            p.nome AS pessoa_nome, e.nome AS escola_nome, e.bairro, e.endereco
       FROM adapt_atividades a
       JOIN adapt_escolas e ON e.id = a.escola_id AND e.arquivado_em IS NULL
       LEFT JOIN pessoas_acesso p ON p.id = a.pessoa_id
      WHERE a.status = 'agendado' AND a.estornado_em IS NULL AND a.data <= $1::date + 14
      ORDER BY a.quando`,
    [hoje],
  );

  const dia = diaDaSemana(hoje);
  const rotaHoje = ROTAS.find((r) => r.dia === dia)?.k || null;
  const ordemPrio = { A: 0, B: 1, C: 2 };
  const porPrioridade = (a, b) => (ordemPrio[a.prioridade] ?? 3) - (ordemPrio[b.prioridade] ?? 3) || (b.pontos_calc ?? 0) - (a.pontos_calc ?? 0);

  const hojeListas = {
    agenda_hoje: agenda.filter((a) => a.data === hoje),
    agenda_atrasada: agenda.filter((a) => a.data < hoje),
    cadencia: abertas.filter((e) => e.passo?.devido).sort(porPrioridade).map((e) => ({ ...resumo(e), passo: e.passo })),
    pilotos: abertas.filter((e) => e.piloto_marco?.devido).map((e) => ({ ...resumo(e), marco: e.piloto_marco, piloto_sit: e.piloto_sit })),
    passos_hoje: abertas.filter((e) => e.proxima_data && e.proxima_data <= hoje && !e.passo?.devido && !e.piloto_marco?.devido).map(resumo),
    parados: abertas.filter((e) => e.prazo?.nivel === 'estourado').map((e) => ({ ...resumo(e), prazo: e.prazo })),
    nutricao: escolas.filter((e) => e.etapa === 'nutricao' && e.nutricao_ate && e.nutricao_ate <= hoje).map(resumo),
    rota: rotaHoje
      ? abertas.filter((e) => e.rota === rotaHoje && ['lista', 'contato', 'decisor', 'mapeamento'].includes(e.etapa)).sort(porPrioridade).map(resumo)
      : [],
    sem_passo: abertas.filter((e) => !e.proxima_data && !e.passo && !e.proxima_reuniao && !e.piloto_marco).map(resumo),
  };

  // Funil por trilha
  const funil = {};
  for (const t of Object.keys(ETAPAS)) {
    const etapas = [...ETAPAS[t].map((e) => e.k), ...FINAIS_TRILHA[t]];
    funil[t] = etapas.map((k) => ({ k, n: NOME_ETAPA[k], qtd: escolas.filter((e) => e.trilha === t && e.etapa === k).length }));
  }

  // Conversão por etapa (escolas): quem alcançou X / quem alcançou a anterior
  const etapasEscola = ETAPAS.escola.map((e) => e.k).concat('ganho');
  const doEscola = escolas.filter((e) => e.trilha === 'escola');
  const alcancou = (e, k) => !!e.marcos?.[k] || e.etapa === k;
  const conversao = etapasEscola.slice(1).map((k, i) => {
    const de = etapasEscola[i];
    const base = doEscola.filter((e) => alcancou(e, de)).length;
    const foram = doEscola.filter((e) => alcancou(e, k)).length;
    return { de, para: k, de_n: NOME_ETAPA[de], para_n: NOME_ETAPA[k], base, foram, pct: base ? Math.round((foram / base) * 100) : null };
  });

  // Ciclo médio (contato → ganho) e motivos de perda
  const ganhos = escolas.filter((e) => e.etapa === 'ganho' && e.marcos?.ganho);
  const ciclos = ganhos.map((e) => diffDias(e.marcos.contato || e.marcos.lista || e.marcos.mapeamento || e.marcos.ganho, e.marcos.ganho));
  const motivos = {};
  for (const e of escolas.filter((x) => x.etapa === 'perdido')) motivos[e.motivo_perda || 'Sem motivo'] = (motivos[e.motivo_perda || 'Sem motivo'] || 0) + 1;

  // Prioridades
  const prio = { A: { total: 0, tocadas: 0 }, B: { total: 0, tocadas: 0 }, C: { total: 0, tocadas: 0 } };
  for (const e of escolas.filter((x) => x.trilha === 'escola' && x.prioridade)) {
    prio[e.prioridade].total += 1;
    if (e.n_contatos > 0 || e.etapa !== 'lista') prio[e.prioridade].tocadas += 1;
  }

  // Últimas 8 semanas
  const serie = [];
  for (let i = 7; i >= 0; i--) {
    const si = addDias(inicioSemana(hoje), -7 * i);
    const n = await numerosSemana(si, addDias(si, 6));
    serie.push({ inicio: si, contatos: n.contatos, decisores: n.decisores, diagnosticos: n.diagnosticos, demos: n.demos, propostas: n.propostas, visitas: n.visitas });
  }

  const pilotos = escolas.filter((e) => e.piloto_inicio).map((e) => ({ ...resumo(e), piloto: e.piloto, piloto_inicio: e.piloto_inicio, piloto_fim: e.piloto_fim, piloto_sit: e.piloto_sit, marco: e.piloto_marco }));

  return {
    hoje, rota_hoje: rotaHoje,
    semana: { inicio: ini, fim, numeros, metas },
    hoje_listas: hojeListas,
    agenda,
    funil, conversao, motivos,
    ciclo_medio: ciclos.length ? Math.round(ciclos.reduce((a, b) => a + b, 0) / ciclos.length) : null,
    prioridades: prio,
    serie,
    pilotos,
    totais: {
      escolas: escolas.filter((e) => e.trilha === 'escola').length,
      redes: escolas.filter((e) => e.trilha === 'rede').length,
      parceiros: escolas.filter((e) => e.trilha === 'parceiro').length,
      a_confirmar: escolas.filter((e) => !e.dados_confirmados).length,
      sem_telefone: escolas.filter((e) => !e.telefone).length,
      ganhos: ganhos.length,
    },
  };
}

// ---------------------------------------------------------------------------
// Modo TV
// ---------------------------------------------------------------------------
export async function calcularAdaptTv() {
  const { rows: existe } = await query(`SELECT count(*)::int AS n FROM adapt_escolas WHERE arquivado_em IS NULL`);
  if (!existe[0].n) return null;
  const p = await calcularPainel();
  const hoje = p.hoje;
  const proximas = p.agenda.filter((a) => a.data >= hoje).slice(0, 8).map((a) => ({
    tipo: a.tipo, tipo_n: TIPO_ATIV[a.tipo]?.n || a.tipo, quando: a.quando, data: a.data,
    escola: a.escola_nome, bairro: a.bairro, pessoa: a.pessoa_nome,
  }));
  const { rows: feed } = await query(
    `SELECT a.tipo, a.resultado, a.quando, e.nome AS escola, p.nome AS pessoa
       FROM adapt_atividades a JOIN adapt_escolas e ON e.id = a.escola_id
       LEFT JOIN pessoas_acesso p ON p.id = a.pessoa_id
      WHERE a.status = 'feito' AND a.estornado_em IS NULL
      ORDER BY a.quando DESC LIMIT 8`,
  );
  return {
    hoje,
    semana: p.semana,
    funil: p.funil.escola,
    rede: p.funil.rede,
    prioridades: p.prioridades,
    agenda: proximas,
    pilotos: p.pilotos.filter((x) => !x.piloto?.encerrado).map((x) => ({ nome: x.nome, dia: x.piloto_sit?.dia, de: x.piloto_sit?.de, marco: x.marco?.n || null, marco_data: x.marco?.data || null, vencido: x.piloto_sit?.vencido })),
    rota_hoje: p.rota_hoje ? { rota: p.rota_hoje, n: p.hoje_listas.rota.length } : null,
    feed: feed.map((f) => ({ ...f, tipo_n: TIPO_ATIV[f.tipo]?.n || f.tipo })),
    totais: p.totais,
    serie: p.serie,
  };
}

export { TIPO, PASSO, CADENCIA, MARCOS_PILOTO, etapaInfo };
