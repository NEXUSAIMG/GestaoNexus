-- ===========================================================================
-- Sprint 16 Fase B — Suporte ao sync automático
-- ===========================================================================
--
-- A migration 014 já criou um índice em (produto_id, externo_id) mas só
-- pra clientes com externo_id NOT NULL. O sync automático precisa de
-- um UNIQUE constraint nesse par pra usar `INSERT ... ON CONFLICT (produto_id, externo_id)`.
--
-- Não dá pra fazer UNIQUE constraint parcial (só PostgreSQL >= 11 com sintaxe
-- específica), e clientes manuais não têm externo_id. A solução é dois
-- caminhos:
--   - Manuais: externo_id = NULL, podem ter duplicatas em nome (não conflito)
--   - Sync: externo_id = id da empresa no SeuCartorio, garantido único
--
-- Removemos o índice antigo (que era partial) e criamos um UNIQUE INDEX
-- partial (UNIQUE só onde externo_id IS NOT NULL).
-- ===========================================================================

BEGIN;

-- Remove índice antigo (era btree comum, não unique)
DROP INDEX IF EXISTS idx_produtos_clientes_externo;

-- Cria UNIQUE INDEX parcial: só vale onde externo_id está preenchido.
-- Clientes manuais (externo_id NULL) não entram nessa restrição.
CREATE UNIQUE INDEX IF NOT EXISTS uniq_produtos_clientes_externo
  ON produtos_clientes (produto_id, externo_id)
  WHERE externo_id IS NOT NULL;

COMMIT;
