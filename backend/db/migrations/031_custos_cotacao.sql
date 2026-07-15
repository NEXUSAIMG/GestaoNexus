-- ===========================================================================
-- Sprint 40 -- Custos Cloud: cotacao do dolar por mes.
--
-- Servicos em USD sao lancados na moeda de origem (US$); guardamos o valor
-- informado em `valor_origem` e a cotacao do mes em `custos_cotacoes`. O
-- valor em R$ (`valor_reais`) e calculado no controller: valor_origem * cotacao
-- para USD, ou o proprio valor para BRL. Trocar a cotacao recalcula os USD.
-- ===========================================================================

BEGIN;

ALTER TABLE custos_mensais
  ADD COLUMN IF NOT EXISTS valor_origem numeric(12,2);

CREATE TABLE IF NOT EXISTS custos_cotacoes (
  mes            char(7) PRIMARY KEY,   -- 'YYYY-MM'
  usd_brl        numeric(10,4) NOT NULL DEFAULT 0,
  atualizado_em  timestamptz NOT NULL DEFAULT now()
);

COMMIT;
