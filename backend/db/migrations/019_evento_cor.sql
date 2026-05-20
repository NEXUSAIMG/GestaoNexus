-- ===========================================================================
-- Sprint 24 — Cor opcional em eventos
-- ===========================================================================
-- Permite que cada evento tenha uma cor personalizada (slate, blue, etc).
-- Se NULL, a UI usa a cor padrão por tipo (mantém comportamento atual).
--
-- Decisão: armazenar como string curta (token da paleta tailwind), não como
-- hex. Permite trocar a paleta inteira mudando só CSS, e mantém consistência
-- com o esquema de etiquetas (que já usa tokens igualzinhos).
-- ===========================================================================

BEGIN;

ALTER TABLE eventos_quadro
  ADD COLUMN IF NOT EXISTS cor varchar(20);

ALTER TABLE eventos_calendario
  ADD COLUMN IF NOT EXISTS cor varchar(20);

COMMENT ON COLUMN eventos_quadro.cor IS
  'Cor opcional (token da paleta: slate, blue, red, etc). Se NULL, UI usa cor por tipo.';
COMMENT ON COLUMN eventos_calendario.cor IS
  'Cor opcional (token da paleta: slate, blue, red, etc). Se NULL, UI usa cor por tipo.';

COMMIT;
