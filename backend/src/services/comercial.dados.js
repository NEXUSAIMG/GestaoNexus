/**
 * Módulo Comercial — acesso a dados compartilhado pelos controllers
 * (comercial.controller.js e comercial-gestao.controller.js) e, na
 * entrega 3, pelo relatório semanal.
 */
import { query } from '../config/database.js';
import { AppError, ConflitoError, NaoEncontradoError } from '../utils/errors.js';
import {
  ETAPAS_ATIVAS, METAS_PADRAO, RESULTADOS_CONECTAM,
  hojeBR, mesDe, definirFeriados, diasUteisDoMes, montarPainel, situacaoPrazo, pontuacao,
} from './comercial.regras.js';

// ---------------------------------------------------------------------------
// Normalização
// ---------------------------------------------------------------------------
export const soDigitos = (v) => (v == null ? null : String(v).replace(/\D/g, '') || null);
export const normEmail = (v) => (v ? String(v).trim().toLowerCase() || null : null);
export const dominioDe = (email) => (email && email.includes('@') ? email.split('@')[1] : null);
export const normTexto = (s) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '')
  .toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
/** Telefone sem DDI 55, para comparar (91) 99999-0000 com +55 91 99999 0000. */
export function normTelefone(v) {
  const d = soDigitos(v);
  if (!d) return null;
  return d.length > 11 && d.startsWith('55') ? d.slice(2) : d;
}

// ---------------------------------------------------------------------------
// Feriados (cache de 10 min)
// ---------------------------------------------------------------------------
let feriadosEm = 0;
export async function carregarFeriados(forcar = false) {
  if (!forcar && Date.now() - feriadosEm < 600_000) return;
  const { rows } = await query(`SELECT data::text AS data FROM comercial_feriados`);
  definirFeriados(rows.map((r) => r.data));
  feriadosEm = Date.now();
}

// ---------------------------------------------------------------------------
// Leitura de lead
// ---------------------------------------------------------------------------
export const SELECT_LEAD = `
  SELECT l.id, l.protocolo, l.nome, l.segmento, l.cidade, l.uf, l.contato,
         l.telefone, l.email, l.cns, l.cnpj, l.cartorio_id, l.produto_cliente_id, l.dono_id,
         pd.nome AS dono_nome,
         l.etapa, l.etapa_desde::text AS etapa_desde, l.marcos, l.origem, l.campanha,
         l.cadencia_inicio::text AS cadencia_inicio, l.trial_inicio::text AS trial_inicio,
         l.sinais, l.diagnostico, l.meta_sucesso,
         l.valor_mensal::float AS valor_mensal, l.motivo_perda, l.motivo_perda_obs,
         l.proximo_passo, l.proxima_data::text AS proxima_data, l.notas,
         l.indicado_por_id, li.nome AS indicado_por_nome, l.recompensa_indicacao_em::text AS recompensa_indicacao_em,
         l.pago_em::text AS pago_em, l.pago_valor::float AS pago_valor, l.pago_fonte, l.pago_referencia,
         l.origem_card_id, l.criado_em, l.atualizado_em,
         to_char(l.atualizado_em AT TIME ZONE 'America/Sao_Paulo', 'YYYY-MM-DD') AS atualizado_dia,
         COALESCE((SELECT jsonb_object_agg(t.dia::text, t.data::text)
                     FROM comercial_toques t
                    WHERE t.lead_id = l.id AND t.tipo = 'cadencia' AND t.estornado_em IS NULL), '{}'::jsonb) AS toques_cadencia,
         COALESCE((SELECT jsonb_object_agg(t.dia::text, t.data::text)
                     FROM comercial_toques t
                    WHERE t.lead_id = l.id AND t.tipo = 'marco' AND t.estornado_em IS NULL), '{}'::jsonb) AS toques_marco,
         EXISTS (
           SELECT 1 FROM comercial_nao_contatar nc
            WHERE nc.removido_em IS NULL AND (
                 (nc.tipo = 'email'    AND nc.valor = lower(l.email))
              OR (nc.tipo = 'dominio'  AND nc.valor = split_part(lower(l.email), '@', 2))
              OR (nc.tipo = 'cns'      AND nc.valor = l.cns)
              OR (nc.tipo = 'cnpj'     AND nc.valor = l.cnpj)
              OR (nc.tipo = 'telefone' AND nc.valor = regexp_replace(regexp_replace(COALESCE(l.telefone,''), '\\D', '', 'g'), '^55(\\d{10,11})$', '\\1'))
            )
         ) AS bloqueado_nc
    FROM comercial_leads l
    LEFT JOIN pessoas_acesso pd ON pd.id = l.dono_id
    LEFT JOIN comercial_leads li ON li.id = l.indicado_por_id
`;

export function enriquecer(l, hoje = hojeBR()) {
  return {
    ...l,
    prazo: situacaoPrazo(l, hoje),
    pontos: ['trial', 'proposta', 'ganho'].includes(l.etapa) ? pontuacao(l) : null,
  };
}

export async function carregarLead(id, client = { query }) {
  const { rows } = await client.query(SELECT_LEAD + ' WHERE l.id = $1', [id]);
  if (!rows.length) throw new NaoEncontradoError('Lead não encontrado');
  return rows[0];
}

export async function reunioesDoLead(id, client = { query }) {
  const { rows } = await client.query(
    `SELECT r.id, r.tipo, r.inicio, r.status, r.responsavel_id, pr.nome AS responsavel_nome,
            r.participantes, r.nota, r.desfecho_em, pd.nome AS desfecho_por_nome, r.remarcada_para_id
       FROM comercial_reunioes r
       LEFT JOIN pessoas_acesso pr ON pr.id = r.responsavel_id
       LEFT JOIN pessoas_acesso pd ON pd.id = r.desfecho_por_id
      WHERE r.lead_id = $1 ORDER BY r.inicio DESC`,
    [id],
  );
  return rows;
}

export async function propostasDoLead(id, client = { query }) {
  const { rows } = await client.query(
    `SELECT x.id, x.plano, x.valor_mensal::float AS valor_mensal, x.desconto,
            x.enviada_em::text AS enviada_em, x.validade::text AS validade, x.status,
            x.observacoes, x.criado_em, p.nome AS criado_por_nome
       FROM comercial_propostas x LEFT JOIN pessoas_acesso p ON p.id = x.criado_por_id
      WHERE x.lead_id = $1 ORDER BY x.criado_em DESC`,
    [id],
  );
  return rows;
}

// ---------------------------------------------------------------------------
// Metas e pessoas
// ---------------------------------------------------------------------------
export async function metasDoMes(mes) {
  const { rows } = await query(
    `SELECT mes, valores FROM comercial_metas WHERE mes <= $1 ORDER BY mes DESC LIMIT 1`,
    [mes],
  );
  await carregarFeriados();
  const m = { ...METAS_PADRAO, ...(rows[0]?.valores || {}), _mes_origem: rows[0]?.mes || null };
  // Mês ainda sem meta própria: dias úteis calculados (com feriados).
  if (rows[0]?.mes !== mes) m.diasUteis = diasUteisDoMes(mes);
  m._dias_uteis_calculados = diasUteisDoMes(mes);
  return m;
}

export async function pessoasAtivas() {
  const { rows } = await query(`SELECT id, nome FROM pessoas_acesso WHERE ativo = TRUE ORDER BY nome`);
  return rows;
}

// ---------------------------------------------------------------------------
// Bloqueios: duplicidade, já cliente, não contatar
// ---------------------------------------------------------------------------
/**
 * Lança 409 se o cartório já está no funil (CNS, CNPJ, e-mail, telefone ou
 * nome+cidade+UF), já é cliente ativo ou está na lista de não contatar.
 * `ignorarId` = o próprio lead (na edição).
 * Devolve null se está livre; com `soVerificar` devolve o motivo em vez de lançar.
 */
export async function verificarBloqueios(d, { ignorarId = null, soVerificar = false, client = { query } } = {}) {
  const cns = soDigitos(d.cns); const cnpj = soDigitos(d.cnpj);
  const email = normEmail(d.email); const tel = normTelefone(d.telefone);
  const falhar = (codigo, msg, detalhes) => {
    if (soVerificar) return { codigo, msg, detalhes };
    const e = new ConflitoError(msg); e.codigo = codigo; e.detalhes = detalhes; throw e;
  };

  // 1) Não contatar
  const chaves = [];
  if (email) chaves.push(['email', email]);
  if (dominioDe(email)) chaves.push(['dominio', dominioDe(email)]);
  if (tel) chaves.push(['telefone', tel]);
  if (cns) chaves.push(['cns', cns]);
  if (cnpj) chaves.push(['cnpj', cnpj]);
  if (chaves.length) {
    const { rows } = await client.query(
      `SELECT tipo, valor, motivo FROM comercial_nao_contatar
        WHERE removido_em IS NULL AND (tipo, valor) IN (${chaves.map((_, i) => `($${i * 2 + 1}, $${i * 2 + 2})`).join(',')})
        LIMIT 1`,
      chaves.flat(),
    );
    if (rows.length) {
      return falhar('nao_contatar', `Contato bloqueado: está na lista de não contatar (${rows[0].tipo}: ${rows[0].valor}).`, rows[0]);
    }
  }

  // 2) Já é cliente (portfólio sincronizado do Seu Cartório)
  if (cnpj || email) {
    const { rows } = await client.query(
      `SELECT pc.nome, pc.status FROM produtos_clientes pc
        WHERE pc.status IN ('ativo','trial','pausado','inadimplente')
          AND (($1::text IS NOT NULL AND regexp_replace(COALESCE(pc.documento,''), '\\D', '', 'g') = $1)
            OR ($2::text IS NOT NULL AND lower(pc.email) = $2))
        LIMIT 1`,
      [cnpj, email],
    );
    if (rows.length && d.origem !== 'ex_cliente') {
      return falhar('ja_cliente', `Este cartório já é cliente (${rows[0].nome}, status ${rows[0].status}).`, rows[0]);
    }
  }

  // 3) Duplicado no funil
  const conds = []; const params = [];
  const add = (sql, v) => { params.push(v); conds.push(sql.replaceAll('$?', '$' + params.length)); };
  if (cns) add('l.cns = $?', cns);
  if (cnpj) add('l.cnpj = $?', cnpj);
  if (email) add('lower(l.email) = $?', email);
  if (tel && tel.length >= 10) add(`regexp_replace(regexp_replace(COALESCE(l.telefone,''), '\\D', '', 'g'), '^55(\\d{10,11})$', '\\1') = $?`, tel);
  if (d.nome && d.cidade) {
    add(`btrim(lower(regexp_replace(translate(l.nome, 'áàâãäéèêëíìîïóòôõöúùûüçÁÀÂÃÄÉÈÊËÍÌÎÏÓÒÔÕÖÚÙÛÜÇ', 'aaaaaeeeeiiiiooooouuuucAAAAAEEEEIIIIOOOOOUUUUC'), '[^a-zA-Z0-9]+', ' ', 'g')))
         || '|' || lower(btrim(COALESCE(l.cidade,''))) || '|' || upper(COALESCE(l.uf,'')) = $?`,
      normTexto(d.nome) + '|' + String(d.cidade).trim().toLowerCase() + '|' + String(d.uf || '').toUpperCase());
  }
  if (conds.length) {
    params.push(ignorarId);
    const { rows } = await client.query(
      `SELECT l.id, l.nome, l.etapa, pd.nome AS dono_nome, l.protocolo
         FROM comercial_leads l LEFT JOIN pessoas_acesso pd ON pd.id = l.dono_id
        WHERE l.arquivado_em IS NULL AND (${conds.join(' OR ')})
          AND ($${params.length}::uuid IS NULL OR l.id <> $${params.length}::uuid)
        LIMIT 1`,
      params,
    );
    if (rows.length) {
      const r = rows[0];
      return falhar('duplicado',
        `Este cartório já está no funil: ${r.nome} (${r.protocolo}), etapa ${r.etapa}${r.dono_nome ? ', com ' + r.dono_nome : ', sem responsável'}.`,
        r);
    }
  }
  return null;
}

/** Bloqueia atividade com lead na lista de não contatar. */
export function exigirContatoLiberado(lead) {
  if (lead.bloqueado_nc) {
    throw new AppError('Este cartório está na lista de não contatar. Nenhum contato pode ser registrado.', 409, 'nao_contatar');
  }
}

// ---------------------------------------------------------------------------
// Pagamentos — confere o ASAAS (cobrança paga com o CNPJ do lead)
// ---------------------------------------------------------------------------
export async function conferirPagamentosAsaas() {
  try {
    const { rowCount } = await query(
      `WITH achados AS (
         SELECT DISTINCT ON (l.id) l.id, ca.asaas_id, ca.data_pagamento, ca.valor
           FROM comercial_leads l
           JOIN cobrancas_asaas ca
             ON ca.cliente_documento = l.cnpj
            AND ca.status IN ('RECEIVED','CONFIRMED','RECEIVED_IN_CASH')
            AND ca.data_pagamento IS NOT NULL
            AND ca.data_pagamento >= ((l.marcos->>'ganho')::date - 30)
          WHERE l.etapa = 'ganho' AND l.pago_em IS NULL AND l.cnpj IS NOT NULL
            AND l.arquivado_em IS NULL AND l.marcos ? 'ganho'
          ORDER BY l.id, ca.data_pagamento ASC
       )
       UPDATE comercial_leads l
          SET pago_em = a.data_pagamento, pago_valor = a.valor, pago_fonte = 'asaas', pago_referencia = a.asaas_id
         FROM achados a WHERE a.id = l.id`,
    );
    return rowCount;
  } catch (err) {
    // Base sem a tabela do ASAAS (ou sem sync) não pode derrubar o painel.
    console.error('[comercial] conferência ASAAS falhou:', err.message);
    return 0;
  }
}

// ---------------------------------------------------------------------------
// Painel completo (usado pela tela, pelas checagens e pelo relatório)
// ---------------------------------------------------------------------------
export async function calcularPainel() {
  const hoje = hojeBR();
  await carregarFeriados();
  await conferirPagamentosAsaas();
  const [{ rows: leads }, { rows: toquesHoje }, metas, pessoas, { rows: reunioes }, { rows: propostas }, { rows: checagensHoje }, { rows: acoes }] = await Promise.all([
    query(SELECT_LEAD + ' WHERE l.arquivado_em IS NULL'),
    query(`SELECT t.lead_id, t.pessoa_id, t.resultado FROM comercial_toques t
             JOIN comercial_leads l ON l.id = t.lead_id AND l.arquivado_em IS NULL
            WHERE t.data = $1 AND t.estornado_em IS NULL`, [hoje]),
    metasDoMes(mesDe(hoje)),
    pessoasAtivas(),
    query(`SELECT r.id, r.lead_id, r.tipo, r.inicio, r.status, r.responsavel_id, pr.nome AS responsavel_nome
             FROM comercial_reunioes r
             JOIN comercial_leads l ON l.id = r.lead_id AND l.arquivado_em IS NULL
             LEFT JOIN pessoas_acesso pr ON pr.id = r.responsavel_id
            WHERE r.status = 'agendada'`),
    query(`SELECT x.id, x.lead_id, x.plano, x.valor_mensal::float AS valor_mensal, x.validade::text AS validade, x.status
             FROM comercial_propostas x WHERE x.status = 'enviada'`),
    query(`SELECT c.pessoa_id, c.janela, c.sinal, c.indice, c.observacao, c.criado_em, g.nome AS gestor_nome
             FROM comercial_checagens c LEFT JOIN pessoas_acesso g ON g.id = c.gestor_id
            WHERE c.data = $1`, [hoje]),
    query(`SELECT a.id, a.pessoa_id, a.acao, a.prazo::text AS prazo FROM comercial_acoes a WHERE a.status = 'aberta' ORDER BY a.prazo`),
  ]);
  const comLead = new Set(leads.filter((l) => ETAPAS_ATIVAS.includes(l.etapa)).map((l) => l.dono_id));
  const comMeta = new Set([
    ...Object.keys(metas.novosPorPessoa || {}).filter((k) => Number(metas.novosPorPessoa[k]) > 0),
    ...Object.keys(metas.porPessoa || {}).filter((k) => Object.values(metas.porPessoa[k] || {}).some((v) => Number(v) > 0)),
  ]);
  const sup = pessoas.filter((p) => comLead.has(p.id) || comMeta.has(p.id));
  return montarPainel({ leads, toquesHoje, metas, pessoas: sup, hoje, reunioes, propostas, checagensHoje, acoes });
}

// ---------------------------------------------------------------------------
// Placar do período por pessoa (atividade × resultado)
// ---------------------------------------------------------------------------
export async function placar(de, ate) {
  const { rows } = await query(
    `WITH p AS (SELECT id, nome FROM pessoas_acesso WHERE ativo = TRUE)
     SELECT p.id, p.nome,
       (SELECT count(*) FROM comercial_toques t WHERE t.pessoa_id = p.id AND t.estornado_em IS NULL AND t.data BETWEEN $1 AND $2)::int AS toques,
       (SELECT count(*) FROM comercial_toques t WHERE t.pessoa_id = p.id AND t.estornado_em IS NULL AND t.data BETWEEN $1 AND $2
           AND t.resultado = ANY($3))::int AS conexoes,
       (SELECT count(*) FROM comercial_toques t WHERE t.pessoa_id = p.id AND t.estornado_em IS NOT NULL AND t.data BETWEEN $1 AND $2)::int AS estornos,
       (SELECT count(*) FROM comercial_reunioes r WHERE COALESCE(r.responsavel_id, r.criado_por_id) = p.id
           AND (r.criado_em AT TIME ZONE 'America/Sao_Paulo')::date BETWEEN $1 AND $2)::int AS reunioes_agendadas,
       (SELECT count(*) FROM comercial_reunioes r WHERE COALESCE(r.responsavel_id, r.criado_por_id) = p.id AND r.status = 'realizada'
           AND (r.inicio AT TIME ZONE 'America/Sao_Paulo')::date BETWEEN $1 AND $2)::int AS reunioes_realizadas,
       (SELECT count(*) FROM comercial_reunioes r WHERE COALESCE(r.responsavel_id, r.criado_por_id) = p.id AND r.status = 'faltou'
           AND (r.inicio AT TIME ZONE 'America/Sao_Paulo')::date BETWEEN $1 AND $2)::int AS reunioes_faltou,
       (SELECT count(*) FROM comercial_leads l WHERE l.dono_id = p.id AND l.trial_inicio BETWEEN $1 AND $2)::int AS trials,
       (SELECT count(*) FROM comercial_propostas x JOIN comercial_leads l ON l.id = x.lead_id
           WHERE l.dono_id = p.id AND x.enviada_em BETWEEN $1 AND $2)::int AS propostas,
       (SELECT count(*) FROM comercial_leads l WHERE l.dono_id = p.id AND l.etapa = 'ganho'
           AND (l.marcos->>'ganho')::date BETWEEN $1 AND $2)::int AS assinados,
       (SELECT count(*) FROM comercial_leads l WHERE l.dono_id = p.id AND l.pago_em BETWEEN $1 AND $2)::int AS pagos,
       (SELECT COALESCE(sum(COALESCE(l.pago_valor, l.valor_mensal)), 0) FROM comercial_leads l
           WHERE l.dono_id = p.id AND l.pago_em BETWEEN $1 AND $2)::float AS receita,
       (SELECT count(*) FROM comercial_leads l WHERE l.dono_id = p.id AND l.etapa = 'perdido'
           AND (l.marcos->>'perdido')::date BETWEEN $1 AND $2)::int AS perdidos
       FROM p ORDER BY p.nome`,
    [de, ate, RESULTADOS_CONECTAM],
  );
  return rows
    .filter((r) => r.toques || r.reunioes_agendadas || r.trials || r.assinados || r.pagos || r.perdidos || r.estornos)
    .map((r) => ({
      ...r,
      taxa_conexao: r.toques ? Math.round((r.conexoes / r.toques) * 1000) / 10 : null,
      taxa_comparecimento: (r.reunioes_realizadas + r.reunioes_faltou)
        ? Math.round((r.reunioes_realizadas / (r.reunioes_realizadas + r.reunioes_faltou)) * 1000) / 10 : null,
    }));
}
