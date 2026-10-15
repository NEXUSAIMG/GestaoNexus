/**
 * Módulo Comercial — acesso a dados compartilhado pelos controllers
 * (comercial.controller.js e comercial-gestao.controller.js) e, na
 * entrega 3, pelo relatório semanal.
 */
import { query } from '../config/database.js';
import { AppError, ConflitoError, NaoEncontradoError } from '../utils/errors.js';
import {
  ETAPAS_ATIVAS, METAS_PADRAO, RESULTADOS_CONECTAM,
  hojeBR, mesDe, definirFeriados, diasUteisDoMes, montarPainel, situacaoPrazo, pontuacao, aplicarEtapa, situacaoTrial,
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
// Gestão comercial: admin OU pessoa marcada pelo admin (comercial_gestores)
// ---------------------------------------------------------------------------
/**
 * Quem faz a gestão do dia (checagens, 1:1, metas) nem sempre é admin do
 * Nexus — e admin enxerga o financeiro inteiro. Por isso o admin marca, em
 * Comercial → Controles, quem faz a gestão comercial. É uma lista explícita:
 * antes valia "líder de equipe com 'comercial' no nome", e qualquer líder
 * podia renomear a própria equipe e virar gestor. Pagamento manual continua só admin.
 */
export async function marcarGestorComercial(req, _res, next) {
  try {
    if (req.pessoa?.administrador) { req.gestorComercial = true; return next(); }
    const { rows } = await query(
      `SELECT 1 FROM comercial_gestores g JOIN pessoas_acesso p ON p.id = g.pessoa_id
        WHERE g.pessoa_id = $1 AND p.ativo = TRUE`,
      [req.pessoa.id],
    );
    req.gestorComercial = rows.length > 0;
    next();
  } catch (err) { next(err); }
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
         l.cadencia_inicio::text AS cadencia_inicio, l.trial_inicio::text AS trial_inicio, l.trial_fim::text AS trial_fim, l.trial_prorrogado, l.implantacao_inicio::text AS implantacao_inicio,
         l.sinais, l.diagnostico, l.meta_sucesso,
         l.valor_mensal::float AS valor_mensal, l.motivo_perda, l.motivo_perda_obs,
         l.proximo_passo, l.proxima_data::text AS proxima_data, l.notas,
         l.indicado_por_id, li.nome AS indicado_por_nome, l.recompensa_indicacao_em::text AS recompensa_indicacao_em,
         l.pago_em::text AS pago_em, l.pago_valor::float AS pago_valor, l.pago_fonte, l.pago_referencia,
         l.origem_card_id, l.criado_por_id, l.criado_em, l.atualizado_em,
         (SELECT json_build_object('card_id', cq.id, 'quadro_id', cq.quadro_id, 'quadro', qq.nome, 'coluna', cc.nome,
                                   'espelho', EXISTS (SELECT 1 FROM comercial_espelhos e WHERE e.quadro_id = cq.quadro_id AND e.ativo))
            FROM cards cq JOIN quadros qq ON qq.id = cq.quadro_id JOIN colunas cc ON cc.id = cq.coluna_id
           WHERE cq.id = l.origem_card_id AND cq.arquivado_em IS NULL) AS quadro,
         to_char(l.atualizado_em AT TIME ZONE 'America/Sao_Paulo', 'YYYY-MM-DD') AS atualizado_dia,
         COALESCE((SELECT jsonb_object_agg(t.dia::text, t.data::text)
                     FROM comercial_toques t
                    WHERE t.lead_id = l.id AND t.tipo = 'cadencia' AND t.estornado_em IS NULL), '{}'::jsonb) AS toques_cadencia,
         COALESCE((SELECT jsonb_object_agg(t.dia::text, t.data::text)
                     FROM comercial_toques t
                    WHERE t.lead_id = l.id AND t.tipo = 'marco' AND t.estornado_em IS NULL), '{}'::jsonb) AS toques_marco,
         -- Sprint 42L — marcos do trial guiado
         COALESCE((SELECT jsonb_object_agg(t.dia::text, t.data::text)
                     FROM comercial_toques t
                    WHERE t.lead_id = l.id AND t.tipo = 'trial' AND t.estornado_em IS NULL), '{}'::jsonb) AS toques_trial,
         -- Sprint 42G — insistência: proposta vigente e contatos desde o envio / na etapa
         (SELECT max(x.enviada_em)::text FROM comercial_propostas x WHERE x.lead_id = l.id AND x.status = 'enviada') AS proposta_enviada_em,
         (SELECT count(*)::int FROM comercial_toques t
           WHERE t.lead_id = l.id AND t.estornado_em IS NULL AND t.tipo IN ('cadencia','avulso')
             AND t.data > COALESCE((SELECT max(x.enviada_em) FROM comercial_propostas x WHERE x.lead_id = l.id AND x.status = 'enviada'),
                                   CASE WHEN l.etapa = 'proposta' THEN l.etapa_desde - 1 END)) AS toques_pos_proposta,
         (SELECT count(*)::int FROM comercial_toques t
           WHERE t.lead_id = l.id AND t.estornado_em IS NULL AND t.tipo IN ('cadencia','avulso') AND t.data >= l.etapa_desde) AS toques_na_etapa,
         -- Sprint 42K — contatos que tiveram resposta nesta etapa (para "3 sem resposta")
         (SELECT count(*)::int FROM comercial_toques t
           WHERE t.lead_id = l.id AND t.estornado_em IS NULL AND t.tipo IN ('cadencia','avulso') AND t.data >= l.etapa_desde
             AND t.resultado IN ('atendeu','agendou','pediu_retorno','recusou','respondeu')) AS conexoes_na_etapa,
         EXISTS (
           SELECT 1 FROM comercial_nao_contatar nc
            WHERE nc.removido_em IS NULL AND (
                 (nc.tipo = 'email'    AND nc.valor = lower(l.email))
              OR (nc.tipo = 'dominio'  AND nc.valor = split_part(lower(l.email), '@', 2))
              OR (nc.tipo = 'cns'      AND nc.valor = l.cns)
              OR (nc.tipo = 'cnpj'     AND nc.valor = l.cnpj)
              OR (nc.tipo = 'telefone' AND nc.valor = comercial_tel(l.telefone))
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
    pontos: ['ganho', 'trial'].includes(l.etapa) ? pontuacao(l) : null,
    trial: situacaoTrial(l, hoje), // 42L
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
const STATUS_CLIENTE = ['ativo', 'trial', 'pausado', 'inadimplente'];

/** Chaves de identificação de um cadastro (já normalizadas em JS; nome+cidade+UF vai pelo SQL). */
function chavesDe(d) {
  const cns = soDigitos(d.cns); const cnpj = soDigitos(d.cnpj);
  const email = normEmail(d.email); const tel = normTelefone(d.telefone);
  return { cns, cnpj, email, dominio: dominioDe(email), tel: tel && tel.length >= 10 ? tel : null, telNc: tel };
}

/**
 * Lança 409 se o cartório já está no funil (CNS, CNPJ, e-mail, telefone ou
 * nome+cidade+UF), já é cliente ativo ou está na lista de não contatar.
 * `ignorarId` = o próprio lead (na edição): aí "já é cliente" não se aplica
 * — um lead ganho vira cliente e precisa continuar editável.
 * Devolve null se está livre; com `soVerificar` devolve o motivo em vez de lançar.
 *
 * nome+cidade+UF é comparado por comercial_chave() dos DOIS lados (função
 * IMMUTABLE com índice, migração 036): JS e SQL nunca divergem por acento.
 */
export async function verificarBloqueios(d, { ignorarId = null, soVerificar = false, client = { query } } = {}) {
  const k = chavesDe(d);
  const falhar = (codigo, msg, detalhes) => {
    if (soVerificar) return { codigo, msg, detalhes };
    const e = new ConflitoError(msg); e.codigo = codigo; e.detalhes = detalhes; throw e;
  };

  // 1) Não contatar
  const chaves = [];
  if (k.email) chaves.push(['email', k.email]);
  if (k.dominio) chaves.push(['dominio', k.dominio]);
  if (k.telNc) chaves.push(['telefone', k.telNc]);
  if (k.cns) chaves.push(['cns', k.cns]);
  if (k.cnpj) chaves.push(['cnpj', k.cnpj]);
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

  // 2) Já é cliente (portfólio sincronizado do Seu Cartório). Ex-cliente
  //    (cancelado) não aparece aqui; cliente ATIVO não entra no funil mesmo
  //    que alguém marque a origem como "ex-cliente".
  if (!ignorarId && (k.cnpj || k.email)) {
    const { rows } = await client.query(
      `SELECT pc.nome, pc.status FROM produtos_clientes pc
        WHERE pc.status = ANY($3)
          AND (($1::text IS NOT NULL AND regexp_replace(COALESCE(pc.documento,''), '\\D', '', 'g') = $1)
            OR ($2::text IS NOT NULL AND lower(pc.email) = $2))
        LIMIT 1`,
      [k.cnpj, k.email, STATUS_CLIENTE],
    );
    if (rows.length) {
      return falhar('ja_cliente', `Este cartório já é cliente (${rows[0].nome}, status ${rows[0].status}).`, rows[0]);
    }
  }

  // 3) Duplicado no funil
  const conds = []; const params = [];
  const add = (sql, ...v) => {
    let t = sql;
    v.forEach((x) => { params.push(x); t = t.replace('$?', '$' + params.length); });
    conds.push(t);
  };
  if (k.cns) add('l.cns = $?', k.cns);
  if (k.cnpj) add('l.cnpj = $?', k.cnpj);
  if (k.email) add('lower(l.email) = $?', k.email);
  if (k.tel) add('comercial_tel(l.telefone) = $?', k.tel);
  if (d.nome && d.cidade) {
    add('comercial_chave(l.nome, l.cidade, l.uf) = comercial_chave($?, $?, $?)', d.nome, d.cidade, d.uf || '');
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

/**
 * Versão em lote para a importação: 4 consultas para a planilha inteira em
 * vez de 3 por linha (11 mil leads × 2.000 linhas ficava em minutos).
 * Devolve `checar(d, i)` → null | {codigo, msg}; cada linha aceita entra nos
 * conjuntos, então duplicata DENTRO da própria planilha também é recusada.
 */
export async function prepararBloqueiosLote(linhas, { client = { query } } = {}) {
  const ks = linhas.map(chavesDe);
  const arr = (f) => [...new Set(ks.map(f).filter(Boolean))];
  const nomes = linhas.map((d) => (d.nome && d.cidade ? d.nome : null));
  const { rows: chavesNome } = await client.query(
    `SELECT CASE WHEN n IS NULL THEN NULL ELSE comercial_chave(n, c, u) END AS k
       FROM unnest($1::text[], $2::text[], $3::text[]) WITH ORDINALITY AS t(n, c, u, i) ORDER BY i`,
    [nomes, linhas.map((d) => d.cidade || ''), linhas.map((d) => d.uf || '')],
  );
  const chaveNome = chavesNome.map((r) => r.k);

  const [{ rows: nc }, { rows: cli }, { rows: dup }] = await Promise.all([
    client.query(`SELECT tipo, valor FROM comercial_nao_contatar WHERE removido_em IS NULL`),
    client.query(
      `SELECT regexp_replace(COALESCE(documento,''), '\\D', '', 'g') AS doc, lower(email) AS email, nome, status
         FROM produtos_clientes WHERE status = ANY($1)`, [STATUS_CLIENTE]),
    client.query(
      `SELECT l.nome, l.cns, l.cnpj, lower(l.email) AS email, comercial_tel(l.telefone) AS tel,
              comercial_chave(l.nome, l.cidade, l.uf) AS chave
         FROM comercial_leads l
        WHERE l.arquivado_em IS NULL
          AND (l.cns = ANY($1) OR l.cnpj = ANY($2) OR lower(l.email) = ANY($3)
            OR comercial_tel(l.telefone) = ANY($4) OR comercial_chave(l.nome, l.cidade, l.uf) = ANY($5))`,
      [arr((k) => k.cns), arr((k) => k.cnpj), arr((k) => k.email), arr((k) => k.tel), [...new Set(chaveNome.filter(Boolean))]],
    ),
  ]);
  const ncSet = new Set(nc.map((r) => r.tipo + ':' + r.valor));
  const cliDoc = new Map(cli.filter((r) => r.doc).map((r) => [r.doc, r]));
  const cliEmail = new Map(cli.filter((r) => r.email).map((r) => [r.email, r]));
  const vistos = { cns: new Map(), cnpj: new Map(), email: new Map(), tel: new Map(), chave: new Map() };
  const marcar = (r, nome) => {
    if (r.cns) vistos.cns.set(r.cns, nome);
    if (r.cnpj) vistos.cnpj.set(r.cnpj, nome);
    if (r.email) vistos.email.set(r.email, nome);
    if (r.tel) vistos.tel.set(r.tel, nome);
    if (r.chave) vistos.chave.set(r.chave, nome);
  };
  dup.forEach((r) => marcar(r, r.nome + ' (já no funil)'));

  return function checar(d, i) {
    const k = ks[i];
    for (const [t, v] of [['email', k.email], ['dominio', k.dominio], ['telefone', k.telNc], ['cns', k.cns], ['cnpj', k.cnpj]]) {
      if (v && ncSet.has(t + ':' + v)) return { codigo: 'nao_contatar', msg: `Na lista de não contatar (${t}: ${v}).` };
    }
    const c = (k.cnpj && cliDoc.get(k.cnpj)) || (k.email && cliEmail.get(k.email));
    if (c) return { codigo: 'ja_cliente', msg: `Já é cliente (${c.nome}, status ${c.status}).` };
    const ch = chaveNome[i];
    const hit = (k.cns && vistos.cns.get(k.cns)) || (k.cnpj && vistos.cnpj.get(k.cnpj))
      || (k.email && vistos.email.get(k.email)) || (k.tel && vistos.tel.get(k.tel)) || (ch && vistos.chave.get(ch));
    if (hit) return { codigo: 'duplicado', msg: `Duplicado: ${hit}.` };
    marcar({ ...k, chave: ch }, d.nome + ' (linha ' + (i + 1) + ' da planilha)');
    return null;
  };
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
const ASAAS_PAGO = ['RECEIVED', 'CONFIRMED', 'RECEIVED_IN_CASH'];
const ASAAS_DESFEITO = ['REFUNDED', 'REFUND_REQUESTED', 'CHARGEBACK_REQUESTED', 'CHARGEBACK_DISPUTE', 'AWAITING_CHARGEBACK_REVERSAL', 'DELETED'];
let asaasEm = 0;

/**
 * Cobrança paga com o CNPJ do lead, a partir de 7 dias antes do ganho (uma
 * cobrança antiga de outro serviço não conta como pagamento da venda nova).
 * Estorno/chargeback de uma cobrança já casada desfaz o "pago".
 * Roda no máximo a cada 10 min (o painel é aberto o dia todo).
 */
export async function conferirPagamentosAsaas({ forcar = false } = {}) {
  if (!forcar && Date.now() - asaasEm < 600_000) return 0;
  asaasEm = Date.now();
  try {
    const { rowCount } = await query(
      `WITH achados AS (
         SELECT DISTINCT ON (l.id) l.id, ca.asaas_id, ca.data_pagamento, ca.valor
           FROM comercial_leads l
           JOIN cobrancas_asaas ca
             ON ca.cliente_documento = l.cnpj
            AND ca.status = ANY($1)
            AND ca.data_pagamento IS NOT NULL
            AND ca.data_pagamento >= ((l.marcos->>'ganho')::date - 7)
          WHERE l.etapa = 'ganho' AND l.pago_em IS NULL AND l.cnpj IS NOT NULL
            AND l.arquivado_em IS NULL AND l.marcos ? 'ganho'
          ORDER BY l.id, ca.data_pagamento ASC
       )
       UPDATE comercial_leads l
          SET pago_em = a.data_pagamento, pago_valor = a.valor, pago_fonte = 'asaas', pago_referencia = a.asaas_id
         FROM achados a WHERE a.id = l.id`,
      [ASAAS_PAGO],
    );
    const { rows: desfeitos } = await query(
      `UPDATE comercial_leads l
          SET pago_em = NULL, pago_valor = NULL, pago_fonte = NULL, pago_referencia = NULL
         FROM cobrancas_asaas ca
        WHERE l.pago_fonte = 'asaas' AND ca.asaas_id = l.pago_referencia AND ca.status = ANY($1)
        RETURNING l.id, ca.asaas_id, ca.status`,
      [ASAAS_DESFEITO],
    );
    for (const r of desfeitos) {
      await query(
        `INSERT INTO comercial_alteracoes (lead_id, campo, de, para, pessoa_id) VALUES ($1, 'pagamento', $2, $3, NULL)`,
        [r.id, 'pago (ASAAS ' + r.asaas_id + ')', 'desfeito: cobrança ' + r.status],
      );
    }
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
  const inicioMes = mesDe(hoje) + '-01';
  await carregarFeriados();
  await conferirPagamentosAsaas();
  const totais = await totaisFunil();
  const [{ rows: leads }, { rows: toquesHoje }, metas, pessoas, { rows: reunioes }, { rows: propostas }, { rows: checagensHoje }, { rows: acoes }] = await Promise.all([
    // Fila de prospects sem dono (listas importadas) e fechamentos antigos
    // ficam fora: só contam nos agregados abaixo.
    query(SELECT_LEAD + ` WHERE l.arquivado_em IS NULL AND (
        (l.etapa IN ('cadencia','diagnostico','trial','proposta','corregedoria'))
     OR (l.etapa = 'prospect' AND l.dono_id IS NOT NULL)
     OR (l.etapa = 'ganho' AND (l.pago_em IS NULL OR l.pago_em >= $1 OR l.marcos->>'ganho' >= $2
                               OR l.implantacao_inicio >= ($1::date - 45)))
     OR (l.etapa = 'perdido' AND l.marcos->>'perdido' >= $2)
     OR (l.etapa = 'perdido' AND l.motivo_perda IN ('Sumiu','Sem tempo para implantar') AND l.proxima_data <= $3))`, [inicioMes, inicioMes, hoje]),
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
  // Sprint 42G — insistência por pessoa: perdidos do mês e média de contatos antes de perder
  const { rows: ins } = await query(
    `SELECT l.dono_id,
            count(*)::int AS perdidos,
            count(*) FILTER (WHERE l.motivo_perda = 'Sumiu')::int AS sumiu,
            round(avg((SELECT count(*) FROM comercial_toques t
                        WHERE t.lead_id = l.id AND t.estornado_em IS NULL AND t.tipo IN ('cadencia','avulso'))), 1)::float AS media_contatos
       FROM comercial_leads l
      WHERE l.etapa = 'perdido' AND l.arquivado_em IS NULL AND l.dono_id IS NOT NULL AND l.marcos->>'perdido' >= $1
      GROUP BY l.dono_id`,
    [inicioMes],
  );
  const insistencia = Object.fromEntries(ins.map((r) => [r.dono_id, r]));
  const comLead = new Set(leads.filter((l) => ETAPAS_ATIVAS.includes(l.etapa)).map((l) => l.dono_id));
  const comMeta = new Set([
    ...Object.keys(metas.novosPorPessoa || {}).filter((k) => Number(metas.novosPorPessoa[k]) > 0),
    ...Object.keys(metas.porPessoa || {}).filter((k) => Object.values(metas.porPessoa[k] || {}).some((v) => Number(v) > 0)),
  ]);
  const sup = pessoas.filter((p) => comLead.has(p.id) || comMeta.has(p.id));
  return montarPainel({ leads, toquesHoje, metas, pessoas: sup, hoje, reunioes, propostas, checagensHoje, acoes, totais, insistencia });
}

/** Agregados do funil inteiro (não arquivado), calculados no banco. */
export async function totaisFunil() {
  const { rows: [t] } = await query(
    `SELECT
       COALESCE((SELECT jsonb_object_agg(etapa, n) FROM (SELECT etapa, count(*)::int n FROM comercial_leads
                  WHERE arquivado_em IS NULL GROUP BY etapa) x), '{}'::jsonb) AS por_etapa,
       jsonb_build_object(
         'cadencia',    count(*) FILTER (WHERE marcos ? 'cadencia'),
         'diagnostico', count(*) FILTER (WHERE marcos ? 'diagnostico'),
         'trial',       count(*) FILTER (WHERE marcos ? 'trial'),
         'corregedoria', count(*) FILTER (WHERE marcos ? 'corregedoria'),
         'proposta',    count(*) FILTER (WHERE marcos ? 'proposta'),
         'ganho',       count(*) FILTER (WHERE marcos ? 'ganho')) AS alcancou,
       count(*) FILTER (WHERE pago_em IS NOT NULL)::int AS pagos,
       count(*) FILTER (WHERE etapa = 'perdido')::int AS perdidos,
       count(*) FILTER (WHERE dono_id IS NULL AND etapa IN ('cadencia','diagnostico','trial','proposta','corregedoria'))::int AS sem_dono,
       count(*) FILTER (WHERE dono_id IS NULL AND etapa = 'prospect')::int AS fila,
       COALESCE((SELECT jsonb_object_agg(m, n) FROM (SELECT COALESCE(motivo_perda, 'Sem motivo') m, count(*)::int n
                  FROM comercial_leads WHERE arquivado_em IS NULL AND etapa = 'perdido' GROUP BY 1) y), '{}'::jsonb) AS motivos
     FROM comercial_leads WHERE arquivado_em IS NULL`,
  );
  return t;
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
       (SELECT count(*) FROM comercial_propostas x JOIN comercial_leads l ON l.id = x.lead_id
           WHERE l.arquivado_em IS NULL AND l.dono_id = p.id AND x.enviada_em BETWEEN $1 AND $2)::int AS propostas,
       (SELECT count(*) FROM comercial_leads l WHERE l.arquivado_em IS NULL AND l.dono_id = p.id AND l.etapa = 'ganho'
           AND (l.marcos->>'ganho')::date BETWEEN $1 AND $2)::int AS assinados,
       (SELECT count(*) FROM comercial_leads l WHERE l.arquivado_em IS NULL AND l.dono_id = p.id AND l.pago_em BETWEEN $1 AND $2)::int AS pagos,
       (SELECT COALESCE(sum(COALESCE(l.pago_valor, l.valor_mensal)), 0) FROM comercial_leads l
           WHERE l.arquivado_em IS NULL AND l.dono_id = p.id AND l.pago_em BETWEEN $1 AND $2)::float AS receita,
       (SELECT count(*) FROM comercial_leads l WHERE l.arquivado_em IS NULL AND l.dono_id = p.id AND l.etapa = 'perdido'
           AND (l.marcos->>'perdido')::date BETWEEN $1 AND $2)::int AS perdidos
       FROM p ORDER BY p.nome`,
    [de, ate, RESULTADOS_CONECTAM],
  );
  return rows
    .filter((r) => r.toques || r.reunioes_agendadas || r.propostas || r.assinados || r.pagos || r.perdidos || r.estornos)
    .map((r) => ({
      ...r,
      taxa_conexao: r.toques ? Math.round((r.conexoes / r.toques) * 1000) / 10 : null,
      taxa_comparecimento: (r.reunioes_realizadas + r.reunioes_faltou)
        ? Math.round((r.reunioes_realizadas / (r.reunioes_realizadas + r.reunioes_faltou)) * 1000) / 10 : null,
    }));
}

// ---------------------------------------------------------------------------
// Criação de lead (cadastro, importações e espelho do quadro)
// ---------------------------------------------------------------------------
export function novoProtocolo(hoje = hojeBR()) {
  return 'SC-' + hoje.replace(/-/g, '') + '-' + Math.random().toString(36).slice(2, 7).toUpperCase();
}


// Tamanho máximo de cada campo de texto do lead (colunas varchar do banco).
export const LIMITES_LEAD = {
  nome: 255, segmento: 60, cidade: 100, uf: 2, contato: 255, telefone: 60, email: 255, campanha: 120,
};
const ROTULO_LIMITE = { segmento: 'Segmento', cidade: 'Cidade', contato: 'Contato', telefone: 'Telefone', email: 'E-mail', campanha: 'Campanha', nome: 'Nome' };

/**
 * Corta o que não cabe nas colunas e guarda o texto inteiro nas anotações
 * (ex.: card com três telefones e observações no campo Telefone). Assim a
 * importação nunca quebra por um campo longo e nada se perde.
 */
export function ajustarTamanhos(dados) {
  const d = { ...dados };
  const sobras = [];
  for (const [k, max] of Object.entries(LIMITES_LEAD)) {
    if (d[k] == null) continue;
    const v = String(d[k]).trim();
    if (v.length <= max) { d[k] = v; continue; }
    d[k] = k === 'uf' ? v.slice(0, 2).toUpperCase() : v.slice(0, max).trim();
    if (k !== 'uf') sobras.push(`${ROTULO_LIMITE[k] || k} completo: ${v}`);
  }
  if (sobras.length) d.notas = [d.notas, sobras.join('\n')].filter(Boolean).join('\n\n');
  return d;
}

export async function inserirLead(client, dadosBrutos, pessoaId, extras = {}) {
  const dados = ajustarTamanhos(dadosBrutos);
  const hoje = hojeBR();
  const etapa = dados.etapa || 'prospect';
  const base = { etapa: null, marcos: {}, cadencia_inicio: null, implantacao_inicio: null };
  // Importação: etapas anteriores datadas na criação do card e a etapa atual
  // na entrada da coluna — senão um "Concluído" antigo contaria como ganho do mês.
  const mud = aplicarEtapa(base, etapa, extras.data_marcos || hoje);
  if (extras.etapa_desde) {
    if (mud.marcos[etapa]) mud.marcos[etapa] = extras.etapa_desde;
    if (etapa === 'cadencia') mud.cadencia_inicio = extras.etapa_desde;
    if (etapa === 'ganho') mud.implantacao_inicio = extras.etapa_desde;
  }
  const { rows } = await client.query(
    `INSERT INTO comercial_leads
       (protocolo, nome, segmento, cidade, uf, contato, telefone, email, cns, cnpj, dono_id,
        cartorio_id, etapa, etapa_desde, marcos, origem, campanha, cadencia_inicio,
        implantacao_inicio, sinais, diagnostico, meta_sucesso, valor_mensal, motivo_perda, motivo_perda_obs,
        proximo_passo, proxima_data, notas, indicado_por_id, origem_card_id, criado_por_id)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15::jsonb,$16,$17,$18,$19,$20::jsonb,$21::jsonb,
             $22,$23,$24,$25,$26,$27,$28,$29,$30,$31)
     RETURNING id`,
    [
      novoProtocolo(hoje), dados.nome, dados.segmento ?? null, dados.cidade ?? null,
      dados.uf ?? null, dados.contato ?? null, dados.telefone ?? null, dados.email ?? null,
      soDigitos(dados.cns), soDigitos(dados.cnpj),
      dados.dono_id ?? null, dados.cartorio_id ?? null, etapa, extras.etapa_desde || hoje,
      JSON.stringify(mud.marcos), dados.origem, dados.campanha ?? null,
      mud.cadencia_inicio ?? null, mud.implantacao_inicio ?? null, JSON.stringify(dados.sinais || {}),
      JSON.stringify(dados.diagnostico || {}), dados.meta_sucesso ?? null,
      dados.valor_mensal ?? null, etapa === 'perdido' ? dados.motivo_perda : null,
      dados.motivo_perda_obs ?? null, dados.proximo_passo ?? null, dados.proxima_data ?? null,
      dados.notas ?? null, dados.indicado_por_id ?? null, extras.origem_card_id ?? null, pessoaId,
    ],
  );
  await client.query(
    `INSERT INTO comercial_movimentos (lead_id, de_etapa, para_etapa, pessoa_id, justificativa) VALUES ($1, NULL, $2, $3, $4)`,
    [rows[0].id, etapa, pessoaId, extras.justificativa ?? null],
  );
  return rows[0].id;
}

