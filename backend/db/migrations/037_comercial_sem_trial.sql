-- ===========================================================================
-- Sprint 42E — Comercial sem trial e com os nomes do quadro da equipe
-- ===========================================================================
-- Decisão da empresa (out/2026): não há trial. Funil, com os mesmos nomes
-- do quadro "Atividade Comercial":
--   Em prospecção → Em contatos → Reunião de apresentação → Aguardando
--   retorno → [Aguardando a Corregedoria, só para interino] → Ganho
--   (implantação: onboarding, treinamento e ativação, desenvolvimento,
--   pós-venda) | Perdido (Fora do funil, Desistência...).
-- 'trial' e 'qualificado' continuam aceitos pela constraint (histórico), mas
-- deixam de ser usados.
-- ===========================================================================

BEGIN;

ALTER TABLE comercial_leads DROP CONSTRAINT IF EXISTS comercial_leads_etapa_valida;
ALTER TABLE comercial_leads ADD CONSTRAINT comercial_leads_etapa_valida CHECK (etapa IN (
  'prospect','cadencia','diagnostico','qualificado','trial','proposta','corregedoria','ganho','perdido'));

ALTER TABLE comercial_leads ADD COLUMN IF NOT EXISTS implantacao_inicio date;

-- Ganhos já registrados começam a implantação na data do ganho.
UPDATE comercial_leads
   SET implantacao_inicio = (marcos->>'ganho')::date
 WHERE etapa = 'ganho' AND implantacao_inicio IS NULL AND marcos ? 'ganho';

-- Etapas que deixaram de existir
UPDATE comercial_leads SET etapa = 'proposta'    WHERE etapa = 'trial';
UPDATE comercial_leads SET etapa = 'diagnostico' WHERE etapa = 'qualificado';

COMMIT;
