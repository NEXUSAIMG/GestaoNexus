-- ===========================================================================
-- Sprint 40 -- Custos Cloud: moeda por LANCAMENTO (nao por servico).
--
-- Cada valor mensal pode ser informado em US$ ou R$, independente da moeda
-- "padrao" do servico. Guardamos a moeda do proprio lancamento. USD e
-- convertido pela cotacao do mes; BRL entra direto.
-- ===========================================================================

BEGIN;

ALTER TABLE custos_mensais
  ADD COLUMN IF NOT EXISTS moeda text NOT NULL DEFAULT 'BRL'
    CHECK (moeda IN ('BRL', 'USD'));

-- Backfill: o que ja foi lancado seguiu a moeda padrao do servico.
UPDATE custos_mensais m
   SET moeda = s.moeda
  FROM custos_servicos s
 WHERE m.servico_id = s.id;

COMMIT;
