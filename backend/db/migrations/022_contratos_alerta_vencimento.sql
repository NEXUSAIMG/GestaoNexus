-- ===========================================================================
-- Sprint 26 — Alerta automático de vencimento de contrato
-- ===========================================================================
--
-- A Sprint 21 entregou o módulo de Contratos com cálculo "vencendo"/"vencido"
-- feito sob demanda no GET (sem cron, sem disparo proativo). Esta sprint
-- fecha o ciclo: cron diário verifica contratos próximos do vencimento e
-- dispara aviso in-app + e-mail aos admins.
--
-- Mudanças:
--   1. contratos.ultimo_alerta_em — pra evitar spam diário. Após enviar,
--      o cron preenche essa coluna; só re-alerta se passou 7+ dias.
--   2. configuracoes_notificacoes.email_contrato_vencendo — flag pra
--      desligar e-mail (mantém notificação in-app).
-- ===========================================================================

BEGIN;

ALTER TABLE contratos
  ADD COLUMN IF NOT EXISTS ultimo_alerta_em timestamptz;

ALTER TABLE configuracoes_notificacoes
  ADD COLUMN IF NOT EXISTS email_contrato_vencendo boolean NOT NULL DEFAULT TRUE;

-- Index pra o cron: precisa achar rapidamente contratos vigentes com
-- data_fim definida que ainda não foram alertados (ou foram há muito tempo).
CREATE INDEX IF NOT EXISTS idx_contratos_alerta_pendente
  ON contratos (data_fim, ultimo_alerta_em)
  WHERE status = 'vigente' AND data_fim IS NOT NULL;

COMMIT;
