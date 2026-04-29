-- ===========================================================================
-- Sprint 8 — Recorrência de eventos no calendário
-- ===========================================================================
--
-- Adiciona suporte a eventos recorrentes (mensal, trimestral, semestral,
-- anual). A recorrência é virtual: o banco guarda UMA linha com o padrão,
-- e o backend expande as ocorrências dentro de uma janela de tempo na
-- hora de listar.
--
-- Decisões:
--   - Recorrência apenas em períodos múltiplos de mês (mensal, trimestral,
--     semestral, anual). Recorrência semanal não foi pedida e adiciona
--     complexidade pra dias de semana, etc.
--   - `recorrencia_ate` opcional. Se NULL, a expansão é limitada a 2 anos
--     a partir da data de início (configurável no controller).
--   - Editar / excluir afeta toda a série. Não há suporte a exceções
--     individuais — fica pra futura iteração se for pedido.
-- ===========================================================================

BEGIN;

ALTER TABLE eventos_calendario
  ADD COLUMN IF NOT EXISTS recorrencia_tipo TEXT
    CHECK (recorrencia_tipo IS NULL OR recorrencia_tipo IN
           ('mensal', 'trimestral', 'semestral', 'anual'));

ALTER TABLE eventos_calendario
  ADD COLUMN IF NOT EXISTS recorrencia_ate DATE;

-- recorrencia_ate só faz sentido com recorrencia_tipo definido.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conname = 'eventos_calendario_recorrencia_consistente'
  ) THEN
    ALTER TABLE eventos_calendario
      ADD CONSTRAINT eventos_calendario_recorrencia_consistente
      CHECK (recorrencia_ate IS NULL OR recorrencia_tipo IS NOT NULL);
  END IF;
END $$;

COMMIT;
