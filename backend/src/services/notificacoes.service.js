/**
 * Notificações — Sprint 7.
 *
 * Camada de orquestração que centraliza:
 *   - Criar notificação in-app pra uma ou mais pessoas
 *   - Disparar e-mail correspondente (se config permitir)
 *   - Resolver "quem precisa ser notificado" pra cada cenário (sócios com
 *     poder X, admins, etc)
 *
 * Princípios:
 *   - Falha de e-mail NUNCA derruba a operação principal (criar ata,
 *     votar, etc). Tudo aqui é fire-and-forget — se quem chama quiser
 *     `await`, o método retorna a Promise mas o catch já está dentro.
 *   - Sempre chama via `disparar(...)` em segundo plano. Os controllers
 *     não precisam tratar erro de e-mail.
 */

import { query } from '../config/database.js';
import { enviarEmail } from './email.service.js';
import { tplResumoDiarioAdmin, tplCardsPrazoHoje, tplContratoVencendo } from './email-templates.js';

/**
 * Cria uma notificação in-app para uma pessoa.
 * @param {object} args
 * @param {string} args.pessoaId
 * @param {string} args.tipo
 * @param {string} args.titulo
 * @param {string} [args.descricao]
 * @param {string} [args.link]
 * @param {object} [args.contexto]
 */
export async function criarNotificacao({ pessoaId, tipo, titulo, descricao = null, link = null, contexto = null }) {
  if (!pessoaId || !titulo) return;
  try {
    await query(
      `INSERT INTO notificacoes (pessoa_id, tipo, titulo, descricao, link, contexto)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [pessoaId, tipo, titulo, descricao, link, contexto],
    );
  } catch (err) {
    console.warn(`[notificacoes] falha ao gravar notificação para ${pessoaId}: ${err.message}`);
  }
}

/**
 * Lê as configurações de notificações (singleton id=1). Cacheia por
 * 30 segundos pra não bater no banco a cada notificação disparada.
 */
let cacheConfig = null;
let cacheConfigEm = 0;

export async function lerConfig() {
  const agora = Date.now();
  if (cacheConfig && agora - cacheConfigEm < 30_000) return cacheConfig;
  try {
    const { rows } = await query(`SELECT * FROM configuracoes_notificacoes WHERE id = 1`);
    cacheConfig = rows[0] || configPadrao();
    cacheConfigEm = agora;
    return cacheConfig;
  } catch {
    return configPadrao();
  }
}

export function invalidarCacheConfig() {
  cacheConfig = null;
  cacheConfigEm = 0;
}

function configPadrao() {
  return {
    email_voto_pendente: true,
    email_documento_finalizado: true,
    email_movimento_socio_criado: true,
    email_distribuicao_criada: true,
    email_resumo_diario_admin: true,
    email_card_atribuido: true,
    email_card_prazo_amanha: true,
    email_contrato_vencendo: true,
    dias_aviso_conta_vencendo: 3,
    dias_aviso_movimento_socio_vencendo: 1,
  };
}

/**
 * Resolve as PESSOAS que devem ser notificadas baseado no tipo de aprovação.
 *
 * Para atas: pessoas com representação ativa que tem `pode_aprovar_atas=true`
 *            (e o sócio está ativo).
 * Para decisões/outros docs: pessoas com `pode_votar=true`.
 *
 * Cada pessoa retorna 1 vez mesmo que represente múltiplos sócios.
 * @param {'pode_aprovar_atas' | 'pode_votar'} poder
 */
export async function pessoasComPoder(poder) {
  if (!['pode_aprovar_atas', 'pode_votar'].includes(poder)) {
    throw new Error(`Poder inválido: ${poder}`);
  }
  const { rows } = await query(
    `SELECT DISTINCT p.id, p.nome, p.email
       FROM pessoas_acesso p
       JOIN representacoes r ON r.pessoa_acesso_id = p.id
       JOIN socios s ON s.id = r.socio_id
      WHERE p.ativo = TRUE
        AND p.email IS NOT NULL
        AND r.ativo = TRUE
        AND s.ativo = TRUE
        AND r.${poder} = TRUE
        AND r.data_inicio <= CURRENT_DATE
        AND (r.data_fim IS NULL OR r.data_fim >= CURRENT_DATE)`,
  );
  return rows;
}

/**
 * Resolve as pessoas titulares de UM sócio (papel='titular').
 * Útil quando cria-se um movimento e quer notificar o próprio sócio.
 */
export async function pessoasDoSocio(socioId) {
  const { rows } = await query(
    `SELECT DISTINCT p.id, p.nome, p.email
       FROM pessoas_acesso p
       JOIN representacoes r ON r.pessoa_acesso_id = p.id
      WHERE p.ativo = TRUE
        AND p.email IS NOT NULL
        AND r.ativo = TRUE
        AND r.socio_id = $1
        AND r.papel = 'titular'
        AND r.data_inicio <= CURRENT_DATE
        AND (r.data_fim IS NULL OR r.data_fim >= CURRENT_DATE)`,
    [socioId],
  );
  return rows;
}

/**
 * Lista os admins ativos (para resumo diário, contas vencendo, etc).
 */
export async function admins() {
  const { rows } = await query(
    `SELECT id, nome, email FROM pessoas_acesso
      WHERE administrador = TRUE AND ativo = TRUE AND email IS NOT NULL`,
  );
  return rows;
}

/**
 * Helper: dispara em segundo plano (não bloqueia o response da rota).
 * Captura qualquer erro pra não estourar Promise rejeitada não tratada.
 */
export function disparar(promiseFn) {
  Promise.resolve()
    .then(promiseFn)
    .catch((err) => {
      console.warn(`[notificacoes] erro em fluxo async: ${err.message || err}`);
    });
}

/**
 * Atalho: notifica uma lista de pessoas (in-app + opcionalmente e-mail).
 * @param {object} args
 * @param {Array<{id, nome, email}>} args.pessoas
 * @param {string} args.tipo
 * @param {string} args.titulo
 * @param {string} [args.descricao]
 * @param {string} [args.link]
 * @param {object} [args.contexto]
 * @param {object} [args.email] - { assunto, html, template } quando quiser enviar e-mail
 */
export async function notificarPessoas({ pessoas, tipo, titulo, descricao, link, contexto, email = null }) {
  if (!pessoas || pessoas.length === 0) return;

  await Promise.allSettled(pessoas.map((p) =>
    criarNotificacao({ pessoaId: p.id, tipo, titulo, descricao, link, contexto }),
  ));

  if (email) {
    await Promise.allSettled(pessoas.map((p) =>
      enviarEmail({
        pessoaId: p.id,
        destinatario: p.email,
        assunto: email.assunto,
        html: email.html,
        template: email.template || tipo,
        contexto,
      }),
    ));
  }
}

// =============================================================================
// Resumo diário do admin (cron).
// =============================================================================

/**
 * Busca os dados que entram no resumo diário do admin.
 * Reusa as mesmas regras de "contas vencendo" e "movimentos previstos"
 * que o painel de Caixa usa.
 */
async function levantarDadosResumo(config) {
  const diasContas = config.dias_aviso_conta_vencendo ?? 3;
  const diasMovs = config.dias_aviso_movimento_socio_vencendo ?? 1;

  // 1a. Contas a pagar JÁ ATRASADAS (vencimento no passado, ainda pendentes).
  //     Sai num bloco em vermelho no e-mail — esse é o sinal mais alto de
  //     atenção do dia.
  const { rows: contasAtrasadas } = await query(
    `SELECT id, descricao, valor, data_vencimento
       FROM contas_pagar
      WHERE status = 'pendente'
        AND data_vencimento < CURRENT_DATE
      ORDER BY data_vencimento ASC, valor DESC
      LIMIT 50`,
  );

  // 1b. Contas a pagar VENCENDO nos próximos N dias (futuro até o limite).
  const { rows: contasVencendo } = await query(
    `SELECT id, descricao, valor, data_vencimento
       FROM contas_pagar
      WHERE status = 'pendente'
        AND data_vencimento >= CURRENT_DATE
        AND data_vencimento <= CURRENT_DATE + ($1 || ' days')::interval
      ORDER BY data_vencimento ASC, valor DESC
      LIMIT 50`,
    [String(diasContas)],
  );

  // 2a. Movimentos VENCIDOS sem efetivação (Sprint 8 — alerta novo).
  //     Pró-labore/aporte/distribuição prevista cuja data já passou e
  //     ninguém efetivou. Limita aos últimos 90 dias pra não trazer
  //     ruído antigo (acima disso provavelmente foi cancelado ou
  //     esquecido permanentemente — caso pra arquivar manualmente).
  const { rows: movimentosVencidos } = await query(
    `SELECT m.id, m.descricao, m.valor, m.data_prevista, m.tipo,
            s.nome AS socio_nome
       FROM movimentos_socios m
       JOIN socios s ON s.id = m.socio_id
      WHERE m.status = 'previsto'
        AND m.data_prevista < CURRENT_DATE
        AND m.data_prevista >= CURRENT_DATE - INTERVAL '90 days'
      ORDER BY m.data_prevista ASC, m.valor DESC
      LIMIT 50`,
  );

  // 2b. Movimentos VENCENDO nos próximos M dias.
  const { rows: movimentosVencendo } = await query(
    `SELECT m.id, m.descricao, m.valor, m.data_prevista, m.tipo,
            s.nome AS socio_nome
       FROM movimentos_socios m
       JOIN socios s ON s.id = m.socio_id
      WHERE m.status = 'previsto'
        AND m.data_prevista >= CURRENT_DATE
        AND m.data_prevista <= CURRENT_DATE + ($1 || ' days')::interval
      ORDER BY m.data_prevista ASC, m.valor DESC
      LIMIT 50`,
    [String(diasMovs)],
  );

  // 3. Quantos documentos de governança + decisões aguardam voto.
  const { rows: pendentes } = await query(
    `SELECT
       (SELECT COUNT(*)::int FROM documentos_governanca WHERE status = 'em_aprovacao')
       +
       (SELECT COUNT(*)::int FROM decisoes WHERE status = 'em_aprovacao') AS total`,
  );
  const aprovacoesAbertas = pendentes[0]?.total || 0;

  return {
    contasAtrasadas,
    contasVencendo,
    movimentosVencidos,
    movimentosVencendo,
    aprovacoesAbertas,
  };
}

/**
 * Dispara o resumo diário para todos os admins ativos com e-mail.
 *
 * Regras:
 *  - Se a config `email_resumo_diario_admin` estiver false, nem busca nada.
 *  - Se não tem nada relevante (sem contas, sem movimentos, sem aprovações)
 *    pula o envio do dia (não enche a caixa de "nada hoje").
 *  - Sempre cria a notificação in-app pro admin (mesmo quando o e-mail é
 *    pulado) pra ele ter o registro de que o cron rodou.
 */
export async function enviarResumoDiarioParaAdmins() {
  const config = await lerConfig();

  const dados = await levantarDadosResumo(config);
  const temAlgo = dados.contasAtrasadas.length > 0
    || dados.contasVencendo.length > 0
    || dados.movimentosVencidos.length > 0
    || dados.movimentosVencendo.length > 0
    || dados.aprovacoesAbertas > 0;

  if (!temAlgo) {
    console.log('[notificacoes] Resumo diário: nada a reportar, pulando envio.');
    return { enviados: 0, motivo: 'sem_novidades' };
  }

  const adminsAtivos = await admins();
  if (adminsAtivos.length === 0) {
    console.log('[notificacoes] Resumo diário: nenhum admin com e-mail.');
    return { enviados: 0, motivo: 'sem_admin' };
  }

  const deveEnviarEmail = !!config.email_resumo_diario_admin;
  const tpl = tplResumoDiarioAdmin({
    contasAtrasadas: dados.contasAtrasadas,
    contasVencendo: dados.contasVencendo,
    movimentosVencidos: dados.movimentosVencidos,
    movimentosVencendo: dados.movimentosVencendo,
    aprovacoesAbertas: dados.aprovacoesAbertas,
  });

  // Título prioriza atrasos/vencidos, depois aprovações pendentes.
  let titulo = 'Resumo do dia';
  const totalAtrasos = dados.contasAtrasadas.length + dados.movimentosVencidos.length;
  if (totalAtrasos > 0) {
    titulo += ` — ${totalAtrasos} item${totalAtrasos === 1 ? '' : 's'} com atraso`;
  } else if (dados.aprovacoesAbertas > 0) {
    titulo += ` — ${dados.aprovacoesAbertas} voto${dados.aprovacoesAbertas === 1 ? '' : 's'} pendente${dados.aprovacoesAbertas === 1 ? '' : 's'}`;
  }

  const partesDescricao = [
    dados.contasAtrasadas.length
      ? `${dados.contasAtrasadas.length} conta${dados.contasAtrasadas.length === 1 ? '' : 's'} atrasada${dados.contasAtrasadas.length === 1 ? '' : 's'}`
      : null,
    dados.movimentosVencidos.length
      ? `${dados.movimentosVencidos.length} movimento${dados.movimentosVencidos.length === 1 ? '' : 's'} sem efetivação`
      : null,
    dados.contasVencendo.length
      ? `${dados.contasVencendo.length} conta${dados.contasVencendo.length === 1 ? '' : 's'} vencendo`
      : null,
    dados.movimentosVencendo.length
      ? `${dados.movimentosVencendo.length} movimento${dados.movimentosVencendo.length === 1 ? '' : 's'} previsto${dados.movimentosVencendo.length === 1 ? '' : 's'}`
      : null,
    dados.aprovacoesAbertas > 0
      ? `${dados.aprovacoesAbertas} aprovação${dados.aprovacoesAbertas === 1 ? '' : 'es'} aguardando voto`
      : null,
  ].filter(Boolean);

  await notificarPessoas({
    pessoas: adminsAtivos,
    tipo: 'resumo_diario_admin',
    titulo,
    descricao: partesDescricao.join(' · ') || 'Confira o painel.',
    link: '/',
    contexto: {
      qtd_contas_atrasadas: dados.contasAtrasadas.length,
      qtd_contas_vencendo: dados.contasVencendo.length,
      qtd_movimentos_vencidos: dados.movimentosVencidos.length,
      qtd_movimentos_vencendo: dados.movimentosVencendo.length,
      aprovacoes_abertas: dados.aprovacoesAbertas,
    },
    email: deveEnviarEmail ? { assunto: tpl.assunto, html: tpl.html, template: 'resumo_diario_admin' } : null,
  });

  return { enviados: adminsAtivos.length };
}

// =============================================================================
// Sprint 10 — Avisos de cards com prazo hoje (cron diário).
// =============================================================================

/**
 * Para cada pessoa que tem cards com prazo HOJE, envia uma notificação
 * in-app + e-mail (se a flag email_card_prazo_amanha estiver ligada).
 *
 * Apesar do nome do flag ser "prazo_amanha", a semântica real é "prazo
 * que vence hoje" — quando o cron roda às 8h. Mantemos o nome do flag
 * pra não quebrar migrations existentes; o usuário lê como "avisar
 * cards vencendo no dia".
 */
export async function enviarAvisosCardsPrazoHoje() {
  const config = await lerConfig();

  // Pega cards com prazo HOJE, agrupados por responsável
  const { rows: cards } = await query(
    `SELECT c.id, c.titulo, c.data_prazo, c.responsavel_id, c.quadro_id,
            q.nome AS quadro_nome,
            p.nome AS responsavel_nome, p.email AS responsavel_email
       FROM cards c
       JOIN quadros q ON q.id = c.quadro_id
       JOIN pessoas_acesso p ON p.id = c.responsavel_id
      WHERE c.arquivado_em IS NULL
        AND q.arquivado_em IS NULL
        AND c.data_prazo = CURRENT_DATE
        AND p.ativo = TRUE
      ORDER BY c.responsavel_id, c.titulo`,
  );

  if (cards.length === 0) {
    console.log('[notificacoes] Nenhum card com prazo hoje.');
    return { enviados: 0 };
  }

  // Agrupa por responsável
  const porPessoa = new Map();
  for (const c of cards) {
    if (!porPessoa.has(c.responsavel_id)) {
      porPessoa.set(c.responsavel_id, {
        pessoa: { id: c.responsavel_id, nome: c.responsavel_nome, email: c.responsavel_email },
        cards: [],
      });
    }
    porPessoa.get(c.responsavel_id).cards.push(c);
  }

  let enviados = 0;
  for (const { pessoa, cards: meusCards } of porPessoa.values()) {
    const tpl = tplCardsPrazoHoje({ pessoaNome: pessoa.nome, cards: meusCards });
    await notificarPessoas({
      pessoas: [pessoa],
      tipo: 'tarefa.prazo_hoje',
      titulo: `Você tem ${meusCards.length} tarefa${meusCards.length === 1 ? '' : 's'} com prazo hoje`,
      descricao: meusCards.slice(0, 3).map((c) => c.titulo).join(' · ')
        + (meusCards.length > 3 ? ` · +${meusCards.length - 3}` : ''),
      link: '/tarefas',
      contexto: { qtd: meusCards.length, ids: meusCards.map((c) => c.id) },
      email: (config.email_card_prazo_amanha && pessoa.email)
        ? { assunto: tpl.assunto, html: tpl.html, template: 'card_prazo_hoje' }
        : null,
    });
    enviados += 1;
  }

  return { enviados };
}

// =============================================================================
// Sprint 26 — Aviso de contratos vencendo / vencidos (cron diário).
// =============================================================================

/**
 * Verifica contratos vigentes que estão:
 *   - dentro da janela `alerta_antes_dias` (vencendo)
 *   - OU já vencidos (data_fim < hoje)
 * e ainda não foram alertados nos últimos 7 dias.
 *
 * Notifica TODOS os admins ativos via in-app + e-mail (se flag
 * `email_contrato_vencendo` estiver ligada). Depois marca
 * `ultimo_alerta_em = NOW()` em cada contrato pra não re-alertar
 * antes de 7 dias.
 *
 * Idempotência: rodar várias vezes no mesmo dia é inofensivo — a partir
 * do 2º disparo no mesmo dia nenhum contrato passa pelo filtro de
 * `ultimo_alerta_em < CURRENT_TIMESTAMP - INTERVAL '7 days'`.
 */
export async function enviarAvisosContratosVencendo() {
  const config = await lerConfig();

  // Query: contratos vigentes com data_fim que entra na janela de alerta
  // OU já venceu. "Em janela" = data_fim <= hoje + alerta_antes_dias.
  // (Como hoje <= hoje + alerta_antes_dias, isso pega tanto próximos quanto vencidos.)
  const { rows: contratos } = await query(
    `SELECT c.id, c.titulo, c.contraparte_nome, c.data_fim, c.valor,
            (c.data_fim - CURRENT_DATE)::int AS dias_para_vencer
       FROM contratos c
      WHERE c.status = 'vigente'
        AND c.data_fim IS NOT NULL
        AND c.data_fim <= CURRENT_DATE + (c.alerta_antes_dias || ' days')::interval
        AND (
          c.ultimo_alerta_em IS NULL
          OR c.ultimo_alerta_em < CURRENT_TIMESTAMP - INTERVAL '7 days'
        )
      ORDER BY c.data_fim ASC`,
  );

  if (contratos.length === 0) {
    console.log('[notificacoes] Nenhum contrato em janela de alerta.');
    return { enviados: 0, contratos: 0 };
  }

  const adminsAtivos = await admins();
  if (adminsAtivos.length === 0) {
    console.log('[notificacoes] Contratos vencendo: nenhum admin com e-mail.');
    return { enviados: 0, contratos: contratos.length, motivo: 'sem_admin' };
  }

  const tpl = tplContratoVencendo({ contratos });
  const vencidos = contratos.filter((c) => c.dias_para_vencer < 0).length;
  const vencendo = contratos.length - vencidos;

  const titulo = vencidos > 0
    ? `${vencidos} contrato${vencidos === 1 ? '' : 's'} vencido${vencidos === 1 ? '' : 's'}`
      + (vencendo > 0 ? ` (+ ${vencendo} próximo${vencendo === 1 ? '' : 's'})` : '')
    : `${vencendo} contrato${vencendo === 1 ? '' : 's'} próximo${vencendo === 1 ? '' : 's'} do vencimento`;

  await notificarPessoas({
    pessoas: adminsAtivos,
    tipo: 'governanca.contrato_vencendo',
    titulo,
    descricao: contratos.slice(0, 3).map((c) => c.titulo).join(' · ')
      + (contratos.length > 3 ? ` · +${contratos.length - 3}` : ''),
    link: '/governanca/contratos',
    contexto: {
      qtd_vencidos: vencidos,
      qtd_vencendo: vencendo,
      ids: contratos.map((c) => c.id),
    },
    email: config.email_contrato_vencendo
      ? { assunto: tpl.assunto, html: tpl.html, template: 'contrato_vencendo' }
      : null,
  });

  // Marca como alertado pra não repetir antes de 7 dias.
  // Única query com ANY pra evitar N updates seriais.
  await query(
    `UPDATE contratos SET ultimo_alerta_em = NOW()
      WHERE id = ANY($1::uuid[])`,
    [contratos.map((c) => c.id)],
  );

  return { enviados: adminsAtivos.length, contratos: contratos.length };
}
