-- ===========================================================================
-- Sprint 39 -- Customizacao visual do kanban (estilo Trello).
--
-- Fundo do quadro (cor solida OU preset de gradiente), capa do card
-- (cor OU preset) e cor da coluna. Tudo opcional: NULL = padrao (sem cor).
--
-- Sem CHECK aqui: a validacao dos valores permitidos fica no app (zod +
-- utils/kanban-visual.js), pra facilitar adicionar cores/presets novos sem
-- migration. ADD COLUMN IF NOT EXISTS = idempotente.
-- ===========================================================================

BEGIN;

ALTER TABLE quadros
  ADD COLUMN IF NOT EXISTS fundo_cor    text,
  ADD COLUMN IF NOT EXISTS fundo_preset text;

ALTER TABLE colunas
  ADD COLUMN IF NOT EXISTS cor text;

ALTER TABLE cards
  ADD COLUMN IF NOT EXISTS capa_cor    text,
  ADD COLUMN IF NOT EXISTS capa_preset text;

COMMIT;
