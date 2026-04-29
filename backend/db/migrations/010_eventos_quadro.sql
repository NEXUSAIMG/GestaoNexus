-- ===========================================================================
-- Sprint 11 — Calendário por quadro
-- ===========================================================================
--
-- Aba "Calendário" dentro de cada quadro kanban. Estrutura inspirada em
-- eventos_calendario (governança), mas vinculada a quadro_id em vez de
-- ser global.
--
-- Decisões:
--   - Eventos pertencem a um QUADRO específico, não à equipe inteira.
--     Se a equipe tem 3 quadros, cada um tem seu próprio calendário.
--   - Recorrência (mensal/trimestral/semestral/anual) reaproveita
--     exatamente a mesma lógica de eventos_calendario.
--   - Permissão alinha com o quadro: qualquer membro da equipe edita;
--     se o quadro for aberto a sócios, qualquer autenticado lê.
--   - Cards do quadro com data_prazo aparecem no calendário também,
--     mas isso é mesclado na resposta da API — não duplica dado.
-- ===========================================================================

BEGIN;

CREATE TABLE IF NOT EXISTS eventos_quadro (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  quadro_id       uuid NOT NULL REFERENCES quadros(id) ON DELETE CASCADE,

  titulo          text NOT NULL,
  descricao       text,

  -- Tipo do evento (cor/ícone na UI). Mais genérico que governança porque
  -- aqui é trabalho operacional, não jurídico/societário.
  tipo            text NOT NULL DEFAULT 'outro'
                    CHECK (tipo IN ('reuniao', 'deadline', 'marco', 'outro')),

  data_inicio     timestamptz NOT NULL,
  data_fim        timestamptz,
  dia_inteiro     boolean NOT NULL DEFAULT FALSE,

  -- Local/link opcionais — útil pra reuniões com Meet/Zoom
  local           text,
  link            text,
  observacao      text,

  -- Recorrência (mesmo modelo de eventos_calendario)
  recorrencia_tipo  text
                      CHECK (recorrencia_tipo IS NULL OR recorrencia_tipo IN
                             ('mensal', 'trimestral', 'semestral', 'anual')),
  recorrencia_ate   date,

  criado_por_id   uuid REFERENCES pessoas_acesso(id) ON DELETE SET NULL,
  criado_em       timestamptz NOT NULL DEFAULT now(),
  atualizado_em   timestamptz NOT NULL DEFAULT now()
);

-- recorrencia_ate só faz sentido com recorrencia_tipo definido.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conname = 'eventos_quadro_recorrencia_consistente'
  ) THEN
    ALTER TABLE eventos_quadro
      ADD CONSTRAINT eventos_quadro_recorrencia_consistente
      CHECK (recorrencia_ate IS NULL OR recorrencia_tipo IS NOT NULL);
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_eventos_quadro_quadro_data
  ON eventos_quadro (quadro_id, data_inicio);

-- Trigger pra atualizado_em (função já existe da migration 006)
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'trg_eventos_quadro_atualizado') THEN
    CREATE TRIGGER trg_eventos_quadro_atualizado
      BEFORE UPDATE ON eventos_quadro
      FOR EACH ROW EXECUTE FUNCTION trigger_atualizar_em();
  END IF;
END $$;

COMMIT;
