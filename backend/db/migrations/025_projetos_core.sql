-- ===========================================================================
-- Sprint 34 — Projetos: fundacao (alem do Trello)
-- ===========================================================================
--
-- Destrava as features que o Trello nao tem (nem no plano pago):
--   1. Hierarquia real de cards (subtarefa = card de verdade, com prazo,
--      responsavel e checklist proprios) via cards.card_pai_id
--   2. Dependencias entre cards (bloqueia / bloqueado por) — grafo dirigido
--   3. Prioridade (P0..P3), estimativa em horas e pontos
--   4. Colunas com TIPO (backlog / em_andamento / concluida) e WIP limit
--      → o tipo 'concluida' e o que habilita cycle time e CFD depois
--   5. Campos personalizados por quadro (texto, numero, moeda, data,
--      selecao, checkbox, pessoa, url)
--   6. Vinculos de negocio: card <-> cartorio / contrato / instancia de
--      processo / produto / conta a pagar  ← nosso diferencial real
--   7. Apontamento de horas (timer start/stop + lancamento manual)
--
-- Tudo aditivo. Nada quebra cards/colunas/quadros existentes.
-- ===========================================================================

BEGIN;

-- ---------------------------------------------------------------------------
-- 1. Card: hierarquia, prioridade, estimativa, carimbo de conclusao
-- ---------------------------------------------------------------------------
ALTER TABLE cards
  ADD COLUMN IF NOT EXISTS card_pai_id      uuid REFERENCES cards(id) ON DELETE SET NULL,
  -- 0 = P0 (critico) ... 3 = baixa. Default 2 = normal.
  ADD COLUMN IF NOT EXISTS prioridade       int NOT NULL DEFAULT 2,
  ADD COLUMN IF NOT EXISTS estimativa_horas numeric(6,2),
  ADD COLUMN IF NOT EXISTS pontos           int,
  -- Carimbo de entrada numa coluna do tipo 'concluida'. E a base de
  -- cycle time / lead time. Zerado se o card voltar pra outra coluna.
  ADD COLUMN IF NOT EXISTS concluido_em     timestamptz;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'cards_prioridade_valida') THEN
    ALTER TABLE cards ADD CONSTRAINT cards_prioridade_valida
      CHECK (prioridade BETWEEN 0 AND 3);
  END IF;

  -- Ciclo raso (card pai de si mesmo). Ciclos profundos sao barrados no
  -- controller com CTE recursiva antes do UPDATE.
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'cards_pai_nao_self') THEN
    ALTER TABLE cards ADD CONSTRAINT cards_pai_nao_self
      CHECK (card_pai_id IS NULL OR card_pai_id <> id);
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_cards_pai
  ON cards (card_pai_id) WHERE arquivado_em IS NULL;

CREATE INDEX IF NOT EXISTS idx_cards_concluido
  ON cards (quadro_id, concluido_em) WHERE arquivado_em IS NULL;

-- ---------------------------------------------------------------------------
-- 2. Dependencias entre cards (grafo dirigido)
-- ---------------------------------------------------------------------------
-- Semantica: card_id esta BLOQUEADO POR depende_de_id.
-- Deteccao de ciclo fica no controller (CTE recursiva antes do INSERT).
CREATE TABLE IF NOT EXISTS cards_dependencias (
  card_id        uuid NOT NULL REFERENCES cards(id) ON DELETE CASCADE,
  depende_de_id  uuid NOT NULL REFERENCES cards(id) ON DELETE CASCADE,
  criado_em      timestamptz NOT NULL DEFAULT now(),
  criado_por_id  uuid REFERENCES pessoas_acesso(id) ON DELETE SET NULL,
  PRIMARY KEY (card_id, depende_de_id),
  CHECK (card_id <> depende_de_id)
);

CREATE INDEX IF NOT EXISTS idx_cards_dep_bloqueador
  ON cards_dependencias (depende_de_id);

-- ---------------------------------------------------------------------------
-- 3. Colunas: tipo + WIP limit
-- ---------------------------------------------------------------------------
ALTER TABLE colunas
  ADD COLUMN IF NOT EXISTS tipo       text NOT NULL DEFAULT 'em_andamento',
  ADD COLUMN IF NOT EXISTS wip_limite int;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'colunas_tipo_valido') THEN
    ALTER TABLE colunas ADD CONSTRAINT colunas_tipo_valido
      CHECK (tipo IN ('backlog', 'em_andamento', 'concluida'));
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'colunas_wip_positivo') THEN
    ALTER TABLE colunas ADD CONSTRAINT colunas_wip_positivo
      CHECK (wip_limite IS NULL OR wip_limite > 0);
  END IF;
END $$;

-- ---------------------------------------------------------------------------
-- 4. Campos personalizados por quadro
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS quadros_campos (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  quadro_id       uuid NOT NULL REFERENCES quadros(id) ON DELETE CASCADE,
  nome            text NOT NULL,
  tipo            text NOT NULL
                    CHECK (tipo IN ('texto', 'numero', 'moeda', 'data',
                                    'selecao', 'checkbox', 'pessoa', 'url')),
  -- Somente para tipo='selecao': ["Alta","Media","Baixa"]
  opcoes          jsonb,
  -- Se TRUE, vira selo no card no board (nao so no modal)
  mostrar_no_card boolean NOT NULL DEFAULT FALSE,
  ordem           int NOT NULL DEFAULT 0,
  criado_em       timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_quadros_campos_nome
  ON quadros_campos (quadro_id, lower(nome));

CREATE INDEX IF NOT EXISTS idx_quadros_campos_quadro
  ON quadros_campos (quadro_id, ordem);

-- Valor por card. jsonb guarda o valor cru; a tipagem e validada no
-- controller a partir de quadros_campos.tipo.
CREATE TABLE IF NOT EXISTS cards_campos_valores (
  card_id     uuid NOT NULL REFERENCES cards(id) ON DELETE CASCADE,
  campo_id    uuid NOT NULL REFERENCES quadros_campos(id) ON DELETE CASCADE,
  valor       jsonb,
  atualizado_em timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (card_id, campo_id)
);

CREATE INDEX IF NOT EXISTS idx_cards_campos_campo
  ON cards_campos_valores (campo_id);

-- ---------------------------------------------------------------------------
-- 5. Vinculos de negocio (polimorfico controlado)
-- ---------------------------------------------------------------------------
-- Sem FK fisica pro alvo (tipos diferentes). A existencia do alvo e
-- validada no controller, que conhece a tabela de cada tipo.
CREATE TABLE IF NOT EXISTS cards_vinculos (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  card_id     uuid NOT NULL REFERENCES cards(id) ON DELETE CASCADE,
  tipo        text NOT NULL
                CHECK (tipo IN ('cartorio', 'contrato', 'processo_instancia',
                                'produto', 'conta_pagar')),
  alvo_id     uuid NOT NULL,
  criado_em   timestamptz NOT NULL DEFAULT now(),
  criado_por_id uuid REFERENCES pessoas_acesso(id) ON DELETE SET NULL,
  UNIQUE (card_id, tipo, alvo_id)
);

-- Busca reversa: "quais cards estao ligados a este cartorio?"
CREATE INDEX IF NOT EXISTS idx_cards_vinculos_alvo
  ON cards_vinculos (tipo, alvo_id);

-- ---------------------------------------------------------------------------
-- 6. Apontamento de horas
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS cards_apontamentos (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  card_id     uuid NOT NULL REFERENCES cards(id) ON DELETE CASCADE,
  pessoa_id   uuid NOT NULL REFERENCES pessoas_acesso(id) ON DELETE CASCADE,
  inicio      timestamptz NOT NULL,
  fim         timestamptz,   -- NULL = timer rodando agora
  minutos     int,           -- preenchido ao parar, ou direto no lancamento manual
  observacao  text,
  criado_em   timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_cards_apont_card
  ON cards_apontamentos (card_id, inicio DESC);

-- No maximo UM timer rodando por pessoa (em qualquer card).
CREATE UNIQUE INDEX IF NOT EXISTS idx_cards_apont_timer_ativo
  ON cards_apontamentos (pessoa_id) WHERE fim IS NULL;

-- ---------------------------------------------------------------------------
-- 7. Backfill inteligente
-- ---------------------------------------------------------------------------
-- Quadros criados pelo padrao da Sprint 10 tem colunas "A fazer",
-- "Em andamento" e "Concluido". Classificamos automaticamente pra que
-- as metricas (Sprint 37) tenham dado historico desde o dia 1.
-- Quem tiver nome custom fica em 'em_andamento' (default) e ajusta na UI.
-- Sem depender da extensao unaccent: translate() cobre os acentos que
-- realmente aparecem nesses nomes.
UPDATE colunas
   SET tipo = 'backlog'
 WHERE tipo = 'em_andamento'
   AND translate(lower(nome), 'áàâãéêíóôõúüç', 'aaaaeeiooouuc')
       IN ('a fazer', 'backlog', 'ideias', 'todo', 'to do', 'nao iniciado');

UPDATE colunas
   SET tipo = 'concluida'
 WHERE tipo = 'em_andamento'
   AND translate(lower(nome), 'áàâãéêíóôõúüç', 'aaaaeeiooouuc')
       IN ('concluido', 'concluida', 'feito', 'done', 'entregue', 'finalizado');

-- Cards que ja estao numa coluna do tipo 'concluida' recebem carimbo
-- retroativo (= ultima atualizacao). Aproximacao honesta: nao temos o
-- historico real de movimentacao antes desta migration.
UPDATE cards c
   SET concluido_em = c.atualizado_em
  FROM colunas col
 WHERE col.id = c.coluna_id
   AND col.tipo = 'concluida'
   AND c.concluido_em IS NULL
   AND c.arquivado_em IS NULL;

COMMIT;
