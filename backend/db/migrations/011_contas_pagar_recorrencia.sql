-- ===========================================================================
-- Sprint 13 — Recorrência em contas a pagar
-- ===========================================================================
--
-- Modelo (B): cada ocorrência é uma conta_pagar real e independente,
-- ligadas por um grupo_recorrencia_id. Pagar uma é independente de pagar
-- outra; cancelar uma é independente; comprovante de cada uma é separado.
--
-- Decisões:
--   - Sem tabela "grupo_recorrencia" separada: as informações da regra
--     (tipo, qtd, data limite) ficam REPLICADAS em cada ocorrência.
--     Trade-off: ao editar a regra futuramente, é preciso atualizar todas
--     as pendentes da série. É barato porque são poucas linhas.
--   - "Infinito" = recorrencia_qtd IS NULL E recorrencia_ate IS NULL.
--     Cron mensal (scheduler.js) estende o horizonte sempre que faltam
--     menos de 12 meses gerados.
--   - "Por N vezes" = recorrencia_qtd preenchido. recorrencia_indice é
--     a posição da ocorrência na série (1..N).
--   - "Até data" = recorrencia_ate preenchido.
-- ===========================================================================

BEGIN;

ALTER TABLE contas_pagar
  ADD COLUMN IF NOT EXISTS grupo_recorrencia_id  uuid,
  ADD COLUMN IF NOT EXISTS recorrencia_tipo      text
    CHECK (recorrencia_tipo IS NULL OR recorrencia_tipo IN
           ('mensal', 'trimestral', 'semestral', 'anual')),
  ADD COLUMN IF NOT EXISTS recorrencia_qtd       int
    CHECK (recorrencia_qtd IS NULL OR recorrencia_qtd > 0),
  ADD COLUMN IF NOT EXISTS recorrencia_ate       date,
  ADD COLUMN IF NOT EXISTS recorrencia_indice    int
    CHECK (recorrencia_indice IS NULL OR recorrencia_indice > 0);

-- Coerência: ou todos os campos de recorrência são nulos, ou tipo precisa
-- estar preenchido (qtd e ate continuam opcionais entre si).
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conname = 'contas_pagar_recorrencia_consistente'
  ) THEN
    ALTER TABLE contas_pagar
      ADD CONSTRAINT contas_pagar_recorrencia_consistente
      CHECK (
        grupo_recorrencia_id IS NULL
        OR (recorrencia_tipo IS NOT NULL AND recorrencia_indice IS NOT NULL)
      );
  END IF;
END $$;

-- Index pra cron de extensão e pra listar contas da mesma série
CREATE INDEX IF NOT EXISTS idx_contas_pagar_grupo_recorrencia
  ON contas_pagar (grupo_recorrencia_id)
  WHERE grupo_recorrencia_id IS NOT NULL;

COMMIT;
