-- =====================================================================
-- Migration 001 — Esquema inicial da Gestão Nexus (Sprint 1)
-- =====================================================================
-- Cria a tabela de sócios, que também guarda os dados de login.
-- Em sprints futuras, novas migrations vão adicionar:
--   - contas bancárias, fluxo de caixa, integração ASAAS (Sprint 2/3)
--   - pró-labore, distribuições de lucro, aportes (Sprint 5)
--   - atas, documentos e calendário societário (Sprint 6)
-- =====================================================================

-- Extensão para gerar UUIDs (vem com o Postgres do Railway).
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ---------------------------------------------------------------------
-- Tabela: socios
-- Guarda dados cadastrais, percentual societário e credenciais de login.
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS socios (
  id                       UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  nome                     VARCHAR(255) NOT NULL,
  email                    VARCHAR(255) NOT NULL,
  senha_hash               VARCHAR(255) NOT NULL,
  percentual_participacao  NUMERIC(5,2) NOT NULL DEFAULT 0
                              CHECK (percentual_participacao >= 0
                                 AND percentual_participacao <= 100),
  telefone                 VARCHAR(50),
  cpf                      VARCHAR(14),
  data_entrada             DATE,
  administrador            BOOLEAN NOT NULL DEFAULT FALSE,
  ativo                    BOOLEAN NOT NULL DEFAULT TRUE,
  ultimo_login_em          TIMESTAMPTZ,
  created_at               TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at               TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- E-mail é único, ignorando maiúsculas/minúsculas.
CREATE UNIQUE INDEX IF NOT EXISTS idx_socios_email_unico
  ON socios (lower(email));

-- ---------------------------------------------------------------------
-- Tabela: registro_migrations
-- Controla quais migrations já rodaram, para não rodar de novo.
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS registro_migrations (
  nome      VARCHAR(255) PRIMARY KEY,
  rodada_em TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
