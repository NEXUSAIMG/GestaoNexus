-- ===========================================================================
-- Sprint 40 -- Custos Cloud (Fase 2): rateio por cartorio.
--
-- Guarda, por mes e por cartorio cliente, a mensalidade paga e o volume de
-- mensagens. O rateio do custo (variavel por % de mensagens, fixo dividido
-- igualmente) e a margem sao calculados no controller. Os alertas tambem
-- sao derivados (nao precisam de tabela).
-- ===========================================================================

BEGIN;

CREATE TABLE IF NOT EXISTS custos_rateio (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  mes                char(7) NOT NULL,   -- 'YYYY-MM'
  cartorio_id        uuid NOT NULL REFERENCES cartorios(id) ON DELETE CASCADE,
  mensalidade_reais  numeric(12,2) NOT NULL DEFAULT 0,
  mensagens_mes      int NOT NULL DEFAULT 0,
  criado_em          timestamptz NOT NULL DEFAULT now(),
  atualizado_em      timestamptz NOT NULL DEFAULT now(),
  UNIQUE (mes, cartorio_id)
);

CREATE INDEX IF NOT EXISTS idx_custos_rateio_mes ON custos_rateio (mes);

COMMIT;
