-- ===========================================================================
-- Sprint 31 — Acesso restrito por pessoa
-- ===========================================================================
--
-- Adiciona uma flag booleana em pessoas_acesso. Quando TRUE (e a pessoa
-- não for administradora), a pessoa só vê 4 módulos operacionais:
--   - /tarefas
--   - /processos
--   - /instancias  (Em andamento)
--   - /cartorios
--
-- Tudo o mais (Caixa, Contas a Pagar, Governança, Sócios & Lucros,
-- Configurações, Cadastros etc.) fica invisível no menu e devolve 403
-- se acessado direto via URL.
--
-- Admin sempre vê tudo — a flag não afeta administradores.
-- Reversível: desmarcar a flag devolve acesso completo.
-- ===========================================================================

BEGIN;

ALTER TABLE pessoas_acesso
  ADD COLUMN IF NOT EXISTS acesso_restrito BOOLEAN NOT NULL DEFAULT FALSE;

COMMENT ON COLUMN pessoas_acesso.acesso_restrito IS
  'Se TRUE e não-admin, restringe acesso aos módulos operacionais '
  '(Tarefas, Processos, Em andamento, Cartórios). Sprint 31.';

COMMIT;
