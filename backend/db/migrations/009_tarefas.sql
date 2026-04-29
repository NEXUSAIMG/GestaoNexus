-- ===========================================================================
-- Sprint 10 — Tarefas (Trello interno)
-- ===========================================================================
--
-- Modelo: equipes → quadros → colunas → cards.
--
-- Decisões importantes:
--   - "Equipes" é uma entidade formal (NÃO é vinculada a sócios). Equipes
--     agrupam pessoas_acesso. Uma pessoa pode estar em várias equipes.
--   - Cada quadro pertence a UMA equipe. Membros da equipe têm acesso
--     ao quadro automaticamente — não duplicamos vínculo.
--   - Quadro tem flag `aberto_a_socios`: se TRUE, qualquer pessoa
--     autenticada lê o quadro (transparência), mas só membros editam.
--   - "Arquivar" é soft-delete (campo `arquivado_em`). Cards e colunas
--     arquivados somem da UI mas ficam no histórico.
--   - Reordenação usa `ordem` numérico (passos de 1000 pra ter espaço
--     entre vizinhos sem reescrever todo mundo a cada drag).
--   - Etiquetas são por quadro (não globais) — cada quadro escolhe
--     suas próprias categorias coloridas.
-- ===========================================================================

BEGIN;

-- ---------------------------------------------------------------------------
-- 1. Equipes
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS equipes (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  nome            text NOT NULL,
  descricao       text,

  -- Cor pra distinguir equipes na UI (mesma paleta usada em categorias)
  cor             text NOT NULL DEFAULT 'slate'
                    CHECK (cor IN (
                      'slate', 'red', 'orange', 'amber', 'yellow',
                      'lime', 'emerald', 'teal', 'cyan', 'blue',
                      'indigo', 'violet', 'fuchsia', 'pink', 'rose'
                    )),

  arquivada_em    timestamptz,
  criado_por_id   uuid REFERENCES pessoas_acesso(id) ON DELETE SET NULL,
  criada_em       timestamptz NOT NULL DEFAULT now(),
  atualizada_em   timestamptz NOT NULL DEFAULT now()
);

-- Nome único entre equipes não arquivadas (permite reciclar nome após arquivar)
CREATE UNIQUE INDEX IF NOT EXISTS idx_equipes_nome_ativa
  ON equipes (lower(nome))
  WHERE arquivada_em IS NULL;

-- ---------------------------------------------------------------------------
-- 2. Membros da equipe
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS equipes_membros (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  equipe_id       uuid NOT NULL REFERENCES equipes(id) ON DELETE CASCADE,
  pessoa_id       uuid NOT NULL REFERENCES pessoas_acesso(id) ON DELETE CASCADE,

  -- 'lider' pode editar a equipe (renomear, adicionar/remover membros).
  -- 'membro' pode usar os quadros normalmente.
  -- Admin do sistema sempre tem todos os poderes, independente de papel aqui.
  papel           text NOT NULL DEFAULT 'membro'
                    CHECK (papel IN ('lider', 'membro')),

  adicionado_em   timestamptz NOT NULL DEFAULT now(),
  adicionado_por_id uuid REFERENCES pessoas_acesso(id) ON DELETE SET NULL,

  UNIQUE (equipe_id, pessoa_id)
);

CREATE INDEX IF NOT EXISTS idx_equipes_membros_pessoa
  ON equipes_membros (pessoa_id);

-- ---------------------------------------------------------------------------
-- 3. Quadros (boards)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS quadros (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  equipe_id       uuid NOT NULL REFERENCES equipes(id) ON DELETE CASCADE,

  nome            text NOT NULL,
  descricao       text,

  -- Se TRUE, qualquer pessoa autenticada visualiza (mas só membros da
  -- equipe editam). Pra "Roadmap aberto aos sócios".
  aberto_a_socios boolean NOT NULL DEFAULT FALSE,

  arquivado_em    timestamptz,
  criado_por_id   uuid REFERENCES pessoas_acesso(id) ON DELETE SET NULL,
  criado_em       timestamptz NOT NULL DEFAULT now(),
  atualizado_em   timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_quadros_equipe
  ON quadros (equipe_id) WHERE arquivado_em IS NULL;

-- ---------------------------------------------------------------------------
-- 4. Etiquetas do quadro
-- ---------------------------------------------------------------------------
-- Cada quadro tem suas próprias etiquetas (cor + nome curto). Pensadas
-- pra classificação rápida — "Bug", "Urgente", "Cliente X", etc.
CREATE TABLE IF NOT EXISTS quadros_etiquetas (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  quadro_id       uuid NOT NULL REFERENCES quadros(id) ON DELETE CASCADE,
  nome            text NOT NULL,
  cor             text NOT NULL DEFAULT 'slate'
                    CHECK (cor IN (
                      'slate', 'red', 'orange', 'amber', 'yellow',
                      'lime', 'emerald', 'teal', 'cyan', 'blue',
                      'indigo', 'violet', 'fuchsia', 'pink', 'rose'
                    )),
  ordem           int NOT NULL DEFAULT 0,
  criado_em       timestamptz NOT NULL DEFAULT now()
);

-- Unicidade case-insensitive de nome dentro do quadro.
-- (UNIQUE em CREATE TABLE só aceita colunas simples; expressões como
--  lower(nome) precisam ser índice à parte.)
CREATE UNIQUE INDEX IF NOT EXISTS idx_quadros_etiquetas_nome
  ON quadros_etiquetas (quadro_id, lower(nome));

CREATE INDEX IF NOT EXISTS idx_quadros_etiquetas_quadro
  ON quadros_etiquetas (quadro_id, ordem);

-- ---------------------------------------------------------------------------
-- 5. Colunas
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS colunas (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  quadro_id       uuid NOT NULL REFERENCES quadros(id) ON DELETE CASCADE,

  nome            text NOT NULL,
  -- "ordem" usa passos de 1000 pra ter folga entre vizinhos sem reescrever
  -- toda a coluna no drag. Se o gap chegar a < 2 entre dois vizinhos,
  -- o controller faz uma renormalização (raro).
  ordem           int NOT NULL DEFAULT 0,

  -- Quando arquivada, some da UI mas os cards continuam acessíveis
  -- pelo histórico.
  arquivada_em    timestamptz,

  criado_em       timestamptz NOT NULL DEFAULT now(),
  atualizado_em   timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_colunas_quadro_ordem
  ON colunas (quadro_id, ordem) WHERE arquivada_em IS NULL;

-- ---------------------------------------------------------------------------
-- 6. Cards
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS cards (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  coluna_id       uuid NOT NULL REFERENCES colunas(id) ON DELETE CASCADE,

  -- quadro_id denormalizado pra evitar JOIN em filtros de listagem.
  -- Mantido em sincronia: se o card for movido pra outra coluna, este
  -- campo é atualizado pelo controller (mover entre quadros não é
  -- permitido por enquanto).
  quadro_id       uuid NOT NULL REFERENCES quadros(id) ON DELETE CASCADE,

  titulo          text NOT NULL,
  -- Markdown bruto. Render é client-side.
  descricao       text,

  -- Responsável (1 pessoa por card na v1; futuro: tabela N:N)
  responsavel_id  uuid REFERENCES pessoas_acesso(id) ON DELETE SET NULL,

  -- Prazo (data simples, sem hora — alinha com o resto do app que
  -- usa data quando hora não é essencial).
  data_prazo      date,

  -- Ordem dentro da coluna (mesmo esquema de passos de 1000)
  ordem           int NOT NULL DEFAULT 0,

  arquivado_em    timestamptz,
  criado_por_id   uuid REFERENCES pessoas_acesso(id) ON DELETE SET NULL,
  criado_em       timestamptz NOT NULL DEFAULT now(),
  atualizado_em   timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_cards_coluna_ordem
  ON cards (coluna_id, ordem) WHERE arquivado_em IS NULL;

CREATE INDEX IF NOT EXISTS idx_cards_quadro
  ON cards (quadro_id) WHERE arquivado_em IS NULL;

CREATE INDEX IF NOT EXISTS idx_cards_responsavel
  ON cards (responsavel_id, data_prazo) WHERE arquivado_em IS NULL;

-- ---------------------------------------------------------------------------
-- 7. Vínculo card ↔ etiquetas (N:N)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS cards_etiquetas (
  card_id         uuid NOT NULL REFERENCES cards(id) ON DELETE CASCADE,
  etiqueta_id     uuid NOT NULL REFERENCES quadros_etiquetas(id) ON DELETE CASCADE,
  PRIMARY KEY (card_id, etiqueta_id)
);

CREATE INDEX IF NOT EXISTS idx_cards_etiquetas_etiqueta
  ON cards_etiquetas (etiqueta_id);

-- ---------------------------------------------------------------------------
-- 8. Triggers de "atualizado_em"
-- ---------------------------------------------------------------------------
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'trg_equipes_atualizada') THEN
    CREATE TRIGGER trg_equipes_atualizada
      BEFORE UPDATE ON equipes
      FOR EACH ROW EXECUTE FUNCTION trigger_atualizar_em();
  END IF;
END $$;

-- A função trigger_atualizar_em foi criada na 006 e atualiza um campo
-- chamado "atualizado_em". Funciona pra equipes diretamente. Quadros,
-- colunas e cards usam o mesmo nome de campo.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'trg_quadros_atualizado') THEN
    CREATE TRIGGER trg_quadros_atualizado
      BEFORE UPDATE ON quadros
      FOR EACH ROW EXECUTE FUNCTION trigger_atualizar_em();
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'trg_colunas_atualizada') THEN
    CREATE TRIGGER trg_colunas_atualizada
      BEFORE UPDATE ON colunas
      FOR EACH ROW EXECUTE FUNCTION trigger_atualizar_em();
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'trg_cards_atualizado') THEN
    CREATE TRIGGER trg_cards_atualizado
      BEFORE UPDATE ON cards
      FOR EACH ROW EXECUTE FUNCTION trigger_atualizar_em();
  END IF;
END $$;

-- Equipes usa "atualizada_em" (feminino) — adapta a função genérica.
-- Como a função usa NEW.atualizado_em fixo, criamos uma específica.
CREATE OR REPLACE FUNCTION trigger_atualizada_em()
RETURNS TRIGGER AS $$
BEGIN
  NEW.atualizada_em = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_equipes_atualizada ON equipes;
CREATE TRIGGER trg_equipes_atualizada
  BEFORE UPDATE ON equipes
  FOR EACH ROW EXECUTE FUNCTION trigger_atualizada_em();

-- ---------------------------------------------------------------------------
-- 9. Configurações de notificações — flags pra Sprint 10
-- ---------------------------------------------------------------------------
ALTER TABLE configuracoes_notificacoes
  ADD COLUMN IF NOT EXISTS email_card_atribuido boolean NOT NULL DEFAULT TRUE;

ALTER TABLE configuracoes_notificacoes
  ADD COLUMN IF NOT EXISTS email_card_prazo_amanha boolean NOT NULL DEFAULT TRUE;

COMMIT;
