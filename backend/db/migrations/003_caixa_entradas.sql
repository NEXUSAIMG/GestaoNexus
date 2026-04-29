-- =====================================================================
-- Migration 003 — Caixa (entradas) + ASAAS
-- =====================================================================
-- Contexto:
--   Sprint 2 começa o módulo financeiro pelo lado das ENTRADAS.
--
--   A ferramenta não faz cobrança — quem cobra é o ASAAS. A Gestão Nexus
--   apenas lê as cobranças de lá, guarda um cache local e mostra um
--   resumo do caixa (saldos manuais + entradas previstas em 30/60/90 dias).
--
--   Cria três tabelas:
--     - contas_bancarias    → contas cadastradas manualmente (saldo editado pela equipe)
--     - cobrancas_asaas     → cache local das cobranças trazidas do ASAAS
--     - sincronizacoes_asaas → log de cada execução da rotina de sync
--
--   A rotina diária (job node-cron) é implementada em src/services/asaas.sync.js
--   e também pode ser disparada manualmente por POST /api/caixa/sincronizar.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1) contas_bancarias
-- ---------------------------------------------------------------------
-- Simples. Ninguém na Sprint 2 conecta Open Finance: saldo é digitado.
-- A ideia é a equipe marcar, sempre que for atualizar, qual foi o saldo
-- no final do expediente. Depois evoluímos.
CREATE TABLE IF NOT EXISTS contas_bancarias (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  apelido           VARCHAR(100) NOT NULL,
  banco             VARCHAR(100),
  agencia           VARCHAR(20),
  conta             VARCHAR(30),
  tipo              VARCHAR(20) NOT NULL DEFAULT 'corrente'
                      CHECK (tipo IN ('corrente', 'poupanca', 'investimento', 'caixa')),
  saldo_atual       NUMERIC(14,2) NOT NULL DEFAULT 0,
  saldo_atualizado_em TIMESTAMPTZ,
  saldo_atualizado_por UUID REFERENCES pessoas_acesso(id) ON DELETE SET NULL,
  ativo             BOOLEAN NOT NULL DEFAULT TRUE,
  ordem             SMALLINT NOT NULL DEFAULT 0,
  observacoes       TEXT,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_contas_bancarias_ativo_ordem
  ON contas_bancarias (ativo DESC, ordem, apelido);

-- ---------------------------------------------------------------------
-- 2) cobrancas_asaas
-- ---------------------------------------------------------------------
-- Cache local das cobranças puxadas do ASAAS.
-- A chave primária aqui é "asaas_id" (o id lá deles) — assim a rotina
-- de sync pode fazer upsert sem se preocupar com duplicatas.
CREATE TABLE IF NOT EXISTS cobrancas_asaas (
  asaas_id          VARCHAR(64) PRIMARY KEY,

  -- Dados do cliente no ASAAS
  cliente_asaas_id  VARCHAR(64),
  cliente_nome      VARCHAR(255),
  cliente_documento VARCHAR(20),      -- CPF/CNPJ normalizado (só dígitos)

  -- Valores
  valor             NUMERIC(14,2) NOT NULL,
  valor_liquido     NUMERIC(14,2),     -- o que efetivamente cairá na conta

  -- Datas
  data_vencimento   DATE NOT NULL,
  data_pagamento    DATE,              -- preenchido quando pago
  data_credito_previsto DATE,          -- quando cai na conta (d+1, d+30, etc.)

  -- Status espelhado do ASAAS:
  -- PENDING, RECEIVED, CONFIRMED, OVERDUE, REFUNDED, RECEIVED_IN_CASH,
  -- REFUND_REQUESTED, CHARGEBACK_REQUESTED, CHARGEBACK_DISPUTE,
  -- AWAITING_CHARGEBACK_REVERSAL, DUNNING_REQUESTED, DUNNING_RECEIVED,
  -- AWAITING_RISK_ANALYSIS
  status            VARCHAR(40) NOT NULL,

  -- Meio de pagamento: BOLETO, CREDIT_CARD, PIX, UNDEFINED
  tipo              VARCHAR(20),

  -- Referência externa usada na geração da cobrança (se houver)
  referencia_externa VARCHAR(255),

  descricao         TEXT,
  fatura_url        TEXT,              -- link pra boleto/pix

  -- Metadados de sync
  sincronizado_em   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  payload_bruto     JSONB,             -- guarda o objeto original pra debug

  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Buscas mais frequentes: por vencimento (próximas entradas) e por status.
CREATE INDEX IF NOT EXISTS idx_cobrancas_asaas_vencimento
  ON cobrancas_asaas (data_vencimento);

CREATE INDEX IF NOT EXISTS idx_cobrancas_asaas_status
  ON cobrancas_asaas (status);

CREATE INDEX IF NOT EXISTS idx_cobrancas_asaas_sincronizado
  ON cobrancas_asaas (sincronizado_em DESC);

-- ---------------------------------------------------------------------
-- 3) sincronizacoes_asaas
-- ---------------------------------------------------------------------
-- Log da rotina. Queremos responder rapidamente: "a última sync rodou?",
-- "deu erro?", "quantas cobranças foram inseridas/atualizadas?".
CREATE TABLE IF NOT EXISTS sincronizacoes_asaas (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  iniciado_em       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  finalizado_em     TIMESTAMPTZ,

  -- manual (disparada pelo botão) ou automatica (cron diário)
  origem            VARCHAR(20) NOT NULL DEFAULT 'automatica'
                      CHECK (origem IN ('manual', 'automatica')),

  -- Se manual, quem disparou
  disparado_por_id  UUID REFERENCES pessoas_acesso(id) ON DELETE SET NULL,

  status            VARCHAR(20) NOT NULL DEFAULT 'rodando'
                      CHECK (status IN ('rodando', 'sucesso', 'erro')),

  cobrancas_inseridas      INTEGER NOT NULL DEFAULT 0,
  cobrancas_atualizadas    INTEGER NOT NULL DEFAULT 0,
  paginas_processadas      INTEGER NOT NULL DEFAULT 0,

  mensagem_erro     TEXT,

  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_sincronizacoes_asaas_iniciado
  ON sincronizacoes_asaas (iniciado_em DESC);
