-- ===========================================================================
-- Sprint 42L — O trial volta: ciclo guiado de 14 dias
-- ===========================================================================
-- Decisão da empresa (13/10/2026, à tarde): o trial volta para todos, como
-- etapa entre a Reunião de apresentação e Aguardando retorno.
--   - marcos do trial (D0 ativação ... D14 decisão) ficam em comercial_toques
--     com tipo 'trial' (separados dos marcos da implantação, tipo 'marco');
--   - trial_fim = fim do ciclo (início + 14 dias); a gestão pode prorrogar
--     uma vez, até 7 dias.
-- Tudo aditivo.
-- ===========================================================================

BEGIN;

ALTER TABLE comercial_toques DROP CONSTRAINT IF EXISTS comercial_toques_tipo_valido;
ALTER TABLE comercial_toques ADD CONSTRAINT comercial_toques_tipo_valido
  CHECK (tipo IN ('cadencia','marco','avulso','trial'));

DROP INDEX IF EXISTS uq_comercial_toques_roteiro_vivo;
CREATE UNIQUE INDEX IF NOT EXISTS uq_comercial_toques_roteiro_vivo
  ON comercial_toques (lead_id, tipo, dia)
  WHERE tipo IN ('cadencia','marco','trial') AND estornado_em IS NULL;

ALTER TABLE comercial_leads ADD COLUMN IF NOT EXISTS trial_fim date;
ALTER TABLE comercial_leads ADD COLUMN IF NOT EXISTS trial_prorrogado boolean NOT NULL DEFAULT false;

COMMIT;
