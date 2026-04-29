import dotenv from 'dotenv';

// Usa `override: true` pra garantir que valores do arquivo .env SEMPRE
// vençam variáveis de ambiente herdadas do sistema. Sem isso, uma
// DATABASE_URL antiga deixada no ambiente do Windows poderia mascarar
// silenciosamente o que está no .env.
dotenv.config({ override: true });

function required(name, fallback) {
  const value = process.env[name] ?? fallback;
  if (value === undefined || value === null || value === '') {
    throw new Error(`Variável de ambiente obrigatória não definida: ${name}`);
  }
  return value;
}

function booleano(value, padrao = false) {
  if (value === undefined || value === null || value === '') return padrao;
  return ['1', 'true', 'yes', 'sim', 'on'].includes(String(value).toLowerCase());
}

export const env = {
  NODE_ENV: process.env.NODE_ENV ?? 'development',
  PORT: parseInt(process.env.PORT ?? '3001', 10),

  DATABASE_URL: required('DATABASE_URL'),

  JWT_SECRET: required('JWT_SECRET'),
  JWT_EXPIRES_IN: process.env.JWT_EXPIRES_IN ?? '7d',

  SEED_ADMIN_NOME: process.env.SEED_ADMIN_NOME ?? 'Administrador',
  SEED_ADMIN_EMAIL: process.env.SEED_ADMIN_EMAIL ?? 'admin@nexus.com.br',
  SEED_ADMIN_SENHA: process.env.SEED_ADMIN_SENHA ?? 'ChangeMe123!',
  SEED_ADMIN_PERCENTUAL: parseFloat(process.env.SEED_ADMIN_PERCENTUAL ?? '0'),

  CORS_ORIGIN: process.env.CORS_ORIGIN ?? '',

  // ------------------------------------------------------------------
  // ASAAS — Sprint 2
  // ------------------------------------------------------------------
  // Em sandbox:  https://sandbox.asaas.com/api/v3
  // Em produção: https://api.asaas.com/v3
  ASAAS_API_KEY: process.env.ASAAS_API_KEY ?? '',
  ASAAS_BASE_URL: process.env.ASAAS_BASE_URL ?? 'https://sandbox.asaas.com/api/v3',

  // Janela de busca pra puxar cobranças. Default: próximos 90 dias + 7 dias
  // pra trás (pra pegar vencidos recentes que podem virar recebidos).
  ASAAS_JANELA_DIAS_FUTURO: parseInt(process.env.ASAAS_JANELA_DIAS_FUTURO ?? '90', 10),
  ASAAS_JANELA_DIAS_PASSADO: parseInt(process.env.ASAAS_JANELA_DIAS_PASSADO ?? '7', 10),

  // Cron de sincronização. Default: todo dia às 5h no horário de São Paulo.
  // Desligado automaticamente quando ASAAS_API_KEY estiver vazio.
  SYNC_ASAAS_ATIVO: booleano(process.env.SYNC_ASAAS_ATIVO, true),
  SYNC_ASAAS_CRON: process.env.SYNC_ASAAS_CRON ?? '0 5 * * *',
  SYNC_ASAAS_TIMEZONE: process.env.SYNC_ASAAS_TIMEZONE ?? 'America/Sao_Paulo',

  // ------------------------------------------------------------------
  // Uploads — Sprint 6
  // ------------------------------------------------------------------
  // Pasta onde os arquivos enviados (atas, contratos) ficam guardados.
  // Em desenvolvimento: pasta local 'uploads/' relativa ao backend.
  // Em produção (Railway): apontar pra um Volume montado, senão os
  // arquivos somem em cada redeploy.
  UPLOADS_DIR: process.env.UPLOADS_DIR ?? 'uploads',

  // Tamanho máximo por arquivo, em MB.
  UPLOADS_MAX_MB: parseInt(process.env.UPLOADS_MAX_MB ?? '10', 10),

  // ------------------------------------------------------------------
  // E-mails / notificações — Sprint 7
  // ------------------------------------------------------------------
  // Chave de API do Resend (https://resend.com/api-keys).
  // Se ficar vazia, o envio de e-mail é PULADO (registra no banco com
  // status='pulado_sem_config' mas a notificação in-app continua
  // funcionando — útil pra dev local sem complicação).
  RESEND_API_KEY: process.env.RESEND_API_KEY ?? '',

  // Remetente. Em produção precisa ser um endereço de domínio verificado
  // no Resend. Em sandbox, pode usar 'onboarding@resend.dev' (Resend
  // libera esse remetente sem verificação, mas só envia pra dono da conta).
  EMAIL_FROM: process.env.EMAIL_FROM ?? 'Gestão Nexus <onboarding@resend.dev>',

  // URL pública do app, usada pra montar links nos e-mails.
  // Ex: https://gestao-nexus.up.railway.app
  APP_URL: process.env.APP_URL ?? 'http://localhost:5173',

  // Cron diário que dispara avisos (contas vencendo, movimentos previstos
  // vencendo, lembretes de voto). Default: 8h da manhã, horário SP.
  NOTIFICACOES_ATIVO: booleano(process.env.NOTIFICACOES_ATIVO, true),
  NOTIFICACOES_CRON: process.env.NOTIFICACOES_CRON ?? '0 8 * * *',
  NOTIFICACOES_TIMEZONE: process.env.NOTIFICACOES_TIMEZONE ?? 'America/Sao_Paulo',
};

export const isProduction = env.NODE_ENV === 'production';
export const isDevelopment = env.NODE_ENV === 'development';

/**
 * Indica se a integração ASAAS está configurada. Usado para decidir se
 * o cron dispara e se o botão "Sincronizar" fica habilitado.
 */
export const asaasConfigurado = !!env.ASAAS_API_KEY;

/**
 * Indica se o envio de e-mail está configurado. Em dev sem RESEND_API_KEY,
 * a notificação in-app continua funcionando, mas o e-mail é pulado.
 */
export const emailConfigurado = !!env.RESEND_API_KEY;
