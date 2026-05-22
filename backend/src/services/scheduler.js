import cron from 'node-cron';
import { env, asaasConfigurado, seuCartorioConfigurado } from '../config/env.js';
import { pool } from '../config/database.js';
import { sincronizar } from './asaas.sync.js';
import {
  enviarResumoDiarioParaAdmins,
  enviarAvisosCardsPrazoHoje,
  enviarAvisosContratosVencendo,
} from './notificacoes.service.js';
import { estenderSeriesInfinitas } from './recorrencia-contas.service.js';
import { sincronizarTodos as sincronizarTodosProdutos } from './portfolio-sync.service.js';

/**
 * Agenda a sincronização automática do ASAAS no processo do Express.
 *
 * Só liga se:
 *  - ASAAS_API_KEY está definida
 *  - SYNC_ASAAS_ATIVO=true
 *
 * O agendador é seguro em relação a sobreposição de execuções:
 * se a rotina anterior ainda está rodando quando dispara a próxima,
 * a nova é ignorada (o node-cron não faz isso sozinho).
 */

let rodando = false;
let tarefa = null;

export function iniciarAgendadorAsaas() {
  if (!env.SYNC_ASAAS_ATIVO) {
    console.log('[cron] Sincronização ASAAS desligada (SYNC_ASAAS_ATIVO=false).');
    return;
  }
  if (!asaasConfigurado) {
    console.log('[cron] Sincronização ASAAS desligada (ASAAS_API_KEY vazia).');
    return;
  }

  if (!cron.validate(env.SYNC_ASAAS_CRON)) {
    console.warn(
      `[cron] Expressão SYNC_ASAAS_CRON inválida: "${env.SYNC_ASAAS_CRON}". ` +
      'Agendador não vai rodar.',
    );
    return;
  }

  tarefa = cron.schedule(
    env.SYNC_ASAAS_CRON,
    async () => {
      if (rodando) {
        console.warn('[cron] Sync ASAAS já em execução — pulando este tick.');
        return;
      }
      rodando = true;
      try {
        await sincronizar({ origem: 'automatica' });
      } catch (err) {
        // sincronizar() já captura erros internamente; este catch é só defesa.
        console.error('[cron] Erro inesperado fora da sync:', err?.message || err);
      } finally {
        rodando = false;
      }
    },
    { timezone: env.SYNC_ASAAS_TIMEZONE },
  );

  console.log(
    `[cron] Sync ASAAS agendada (${env.SYNC_ASAAS_CRON} · ${env.SYNC_ASAAS_TIMEZONE}).`,
  );
}

export function pararAgendadorAsaas() {
  if (tarefa) {
    tarefa.stop();
    tarefa = null;
  }
}

// =============================================================================
// Sprint 7 — Agendador de notificações (resumo diário do admin etc).
// =============================================================================

let rodandoNotif = false;
let tarefaNotif = null;

/**
 * Liga o cron diário que dispara o resumo do admin (e, no futuro, outros
 * lembretes baseados em data). Não depende do Resend estar configurado:
 * mesmo sem e-mail, o cron registra a notificação in-app.
 */
export function iniciarAgendadorNotificacoes() {
  if (!env.NOTIFICACOES_ATIVO) {
    console.log('[cron] Notificações desligadas (NOTIFICACOES_ATIVO=false).');
    return;
  }

  if (!cron.validate(env.NOTIFICACOES_CRON)) {
    console.warn(
      `[cron] Expressão NOTIFICACOES_CRON inválida: "${env.NOTIFICACOES_CRON}". ` +
      'Agendador não vai rodar.',
    );
    return;
  }

  tarefaNotif = cron.schedule(
    env.NOTIFICACOES_CRON,
    async () => {
      if (rodandoNotif) {
        console.warn('[cron] Resumo diário já em execução — pulando este tick.');
        return;
      }
      rodandoNotif = true;
      try {
        const r = await enviarResumoDiarioParaAdmins();
        console.log(`[cron] Resumo diário: ${JSON.stringify(r)}`);
        // Sprint 10 — avisos de cards com prazo hoje
        const r2 = await enviarAvisosCardsPrazoHoje();
        console.log(`[cron] Cards com prazo hoje: ${JSON.stringify(r2)}`);
        // Sprint 26 — avisos de contratos vencendo / vencidos
        const r3 = await enviarAvisosContratosVencendo();
        console.log(`[cron] Contratos vencendo: ${JSON.stringify(r3)}`);
      } catch (err) {
        console.error('[cron] Erro ao enviar resumo diário:', err?.message || err);
      } finally {
        rodandoNotif = false;
      }
    },
    { timezone: env.NOTIFICACOES_TIMEZONE },
  );

  console.log(
    `[cron] Notificações agendadas (${env.NOTIFICACOES_CRON} · ${env.NOTIFICACOES_TIMEZONE}).`,
  );
}

export function pararAgendadorNotificacoes() {
  if (tarefaNotif) {
    tarefaNotif.stop();
    tarefaNotif = null;
  }
}

// =============================================================================
// Sprint 13 — Cron mensal pra estender séries de contas a pagar "infinitas".
// =============================================================================
//
// Roda dia 1º de cada mês às 3h. Para cada série sem qtd nem data limite,
// se o último vencimento gerado está a menos de 12 meses no futuro,
// estende em mais 12 ocorrências. Idempotente — rodar várias vezes
// no mesmo mês não duplica nada (a checagem é "se faltam < 12 meses").

let rodandoExtensor = false;
let tarefaExtensor = null;

export function iniciarAgendadorRecorrencias() {
  // Cron fixo: dia 1 às 03:00 — horario tranquilo, baixo tráfego.
  // Reusa o timezone das notificações (America/Sao_Paulo por padrão).
  const expr = '0 3 1 * *';
  const tz = env.NOTIFICACOES_TIMEZONE;

  tarefaExtensor = cron.schedule(
    expr,
    async () => {
      if (rodandoExtensor) {
        console.warn('[cron] Extensão de séries já em execução — pulando.');
        return;
      }
      rodandoExtensor = true;
      try {
        const r = await estenderSeriesInfinitas(pool);
        console.log(`[cron] Extensão de séries: ${JSON.stringify(r)}`);
      } catch (err) {
        console.error('[cron] Erro ao estender séries:', err?.message || err);
      } finally {
        rodandoExtensor = false;
      }
    },
    { timezone: tz },
  );

  console.log(`[cron] Extensão de séries agendada (${expr} · ${tz}).`);
}

export function pararAgendadorRecorrencias() {
  if (tarefaExtensor) {
    tarefaExtensor.stop();
    tarefaExtensor = null;
  }
}

// =============================================================================
// Sprint 16 — Cron diário pra sincronizar métricas dos produtos.
// =============================================================================
//
// Roda todo dia às 4h da manhã (horário mais tranquilo, após o sync ASAAS
// das 5h pra não concorrer). Sincroniza todos os produtos com integração
// 'api_rest' ativa. Erros num produto não afetam os outros.

let rodandoPortfolio = false;
let tarefaPortfolio = null;

export function iniciarAgendadorPortfolio() {
  if (!env.PORTFOLIO_SYNC_ATIVO) {
    console.log('[cron] Sync portfólio desligado (PORTFOLIO_SYNC_ATIVO=false).');
    return;
  }
  // Se nenhuma fonte está configurada, não liga o cron pra não ficar
  // logando "falhou" toda manhã. Quando configurarem env vars, redeploy.
  if (!seuCartorioConfigurado) {
    console.log('[cron] Sync portfólio desligado (nenhuma fonte configurada — SEU_CARTORIO_URL/KEY vazios).');
    return;
  }

  const expr = env.PORTFOLIO_SYNC_CRON;
  const tz = env.NOTIFICACOES_TIMEZONE;

  if (!cron.validate(expr)) {
    console.warn(`[cron] PORTFOLIO_SYNC_CRON inválido: "${expr}". Não vai rodar.`);
    return;
  }

  tarefaPortfolio = cron.schedule(
    expr,
    async () => {
      if (rodandoPortfolio) {
        console.warn('[cron] Sync portfólio já em execução — pulando.');
        return;
      }
      rodandoPortfolio = true;
      try {
        const r = await sincronizarTodosProdutos({ origem: 'cron' });
        console.log(`[cron] Sync portfólio: ${JSON.stringify(r)}`);
      } catch (err) {
        console.error('[cron] Erro ao sincronizar portfólio:', err?.message || err);
      } finally {
        rodandoPortfolio = false;
      }
    },
    { timezone: tz },
  );

  console.log(`[cron] Sync portfólio agendado (${expr} · ${tz}).`);
}

export function pararAgendadorPortfolio() {
  if (tarefaPortfolio) {
    tarefaPortfolio.stop();
    tarefaPortfolio = null;
  }
}
