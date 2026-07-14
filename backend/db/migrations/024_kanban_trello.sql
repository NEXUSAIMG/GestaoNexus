-- ===========================================================================
-- Sprint 32 — Kanban nível Trello
-- ===========================================================================
--
-- Fecha as lacunas do nosso Kanban (Sprint 10) em relação ao Trello,
-- adicionando ao CARD:
--   1. Checklists (com itens marcáveis e barra de progresso)
--   2. Comentários (thread por card, com edição/exclusão)
--   3. Anexos (arquivos por card — mesmo padrão de contas_pagar_anexos)
--   4. Capa colorida (capa_cor)
--   5. Data de início (data_inicio) + marcar prazo como concluído (prazo_concluido)
--
-- Os "selos" do cartão (progresso de checklist, nº de comentários/anexos,
-- indicador de descrição, prazo concluído) são derivados via subquery na
-- listagem do quadro — sem novas colunas de contagem (evita desnormalização
-- que precisaria de manutenção por trigger).
--
-- Tudo é soft-compatible: nada quebra cards/colunas/quadros existentes.
-- ===========================================================================

BEGIN;

-- ---------------------------------------------------------------------------
-- 1. Novas colunas no card
-- ---------------------------------------------------------------------------

-- Data de início (Trello tem início + prazo). Simples, sem hora — alinha
-- com data_prazo.
ALTER TABLE cards
  ADD COLUMN IF NOT EXISTS data_inicio date;

-- Marca o prazo como concluído (checkbox verde no Trello). Independente de
-- arquivar/mover — um card pode estar "no prazo cumprido" e seguir vivo.
ALTER TABLE cards
  ADD COLUMN IF NOT EXISTS prazo_concluido boolean NOT NULL DEFAULT FALSE;

-- Capa colorida (token da paleta tailwind, mesma de etiquetas). NULL = sem capa.
ALTER TABLE cards
  ADD COLUMN IF NOT EXISTS capa_cor text
    CHECK (capa_cor IS NULL OR capa_cor IN (
      'slate', 'red', 'orange', 'amber', 'yellow', 'lime', 'emerald',
      'teal', 'cyan', 'blue', 'indigo', 'violet', 'fuchsia', 'pink', 'rose'
    ));

-- ---------------------------------------------------------------------------
-- 2. Checklists
-- ---------------------------------------------------------------------------
-- Um card pode ter vários checklists (ex.: "Pré-requisitos", "Critérios de
-- aceite"). Cada checklist tem itens marcáveis.
CREATE TABLE IF NOT EXISTS card_checklists (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  card_id         uuid NOT NULL REFERENCES cards(id) ON DELETE CASCADE,
  titulo          text NOT NULL DEFAULT 'Checklist',
  ordem           int NOT NULL DEFAULT 0,
  criado_por_id   uuid REFERENCES pessoas_acesso(id) ON DELETE SET NULL,
  criado_em       timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_card_checklists_card
  ON card_checklists (card_id, ordem);

CREATE TABLE IF NOT EXISTS card_checklist_itens (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  checklist_id    uuid NOT NULL REFERENCES card_checklists(id) ON DELETE CASCADE,

  -- card_id denormalizado: acelera os selos do card e a checagem de
  -- permissão sem precisar de JOIN até o checklist.
  card_id         uuid NOT NULL REFERENCES cards(id) ON DELETE CASCADE,

  texto           text NOT NULL,
  concluido       boolean NOT NULL DEFAULT FALSE,
  concluido_em    timestamptz,
  concluido_por_id uuid REFERENCES pessoas_acesso(id) ON DELETE SET NULL,
  ordem           int NOT NULL DEFAULT 0,
  criado_em       timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_card_checklist_itens_checklist
  ON card_checklist_itens (checklist_id, ordem);

CREATE INDEX IF NOT EXISTS idx_card_checklist_itens_card
  ON card_checklist_itens (card_id);

-- ---------------------------------------------------------------------------
-- 3. Comentários
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS card_comentarios (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  card_id         uuid NOT NULL REFERENCES cards(id) ON DELETE CASCADE,
  pessoa_id       uuid REFERENCES pessoas_acesso(id) ON DELETE SET NULL,
  texto           text NOT NULL,
  criado_em       timestamptz NOT NULL DEFAULT now(),
  editado_em      timestamptz
);

CREATE INDEX IF NOT EXISTS idx_card_comentarios_card
  ON card_comentarios (card_id, criado_em DESC);

-- ---------------------------------------------------------------------------
-- 4. Anexos (mesmo padrão de contas_pagar_anexos / inventario_anexos)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS card_anexos (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  card_id         uuid NOT NULL REFERENCES cards(id) ON DELETE CASCADE,

  nome_original   text NOT NULL,
  arquivo_path    text NOT NULL,
  mime_type       text,
  tamanho_bytes   bigint,
  descricao       text,

  enviado_por_id  uuid REFERENCES pessoas_acesso(id) ON DELETE SET NULL,
  criado_em       timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_card_anexos_card
  ON card_anexos (card_id, criado_em DESC);

COMMIT;
