-- ===========================================================================
-- Sprint 41 — Sprints paralelas + Sustentacao em fluxo
-- ===========================================================================
--
-- Duas naturezas de trabalho passam a conviver no MESMO quadro, cada uma no
-- seu paradigma, sobre a mesma base de `cards` (metricas unificadas):
--
--   1. PROJETO  -> planejavel, cabe em SPRINT (time-box). Varias sprints
--      podem estar ATIVAS ao mesmo tempo (correm em paralelo). Cada sprint
--      e uma raia sobre as MESMAS colunas de fluxo do quadro.
--
--   2. SUSTENTACAO -> reativo, continuo. NAO vive em colunas: vive numa fila
--      viva com ciclo proprio (aberto->triado->atendendo->aguardando->
--      resolvido) e SLA. Pode ser "promovido" para uma sprint.
--
-- Estrategia (tudo aditivo, nada quebra o quadro atual):
--   - O card ganha 2 dimensoes ORTOGONAIS a coluna:
--       * sprint_id -> a qual compromisso pertence (NULL = backlog do produto)
--       * fluxo     -> 'projeto' | 'sustentacao'
--   - Sprint e entidade filha do quadro; multiplas ativas = paralelismo.
--   - Sustentacao reaproveita a tabela cards (comentarios, checklist, anexos,
--     apontamentos, pontos), so muda a UI e o ciclo (campos abaixo). Por causa
--     do NOT NULL de cards.coluna_id, os cards de sustentacao moram numa
--     coluna oculta do tipo 'sustentacao' (criada pela app sob demanda) e sao
--     renderizados na fila, nunca no Kanban.
-- ===========================================================================

BEGIN;

-- ---------------------------------------------------------------------------
-- 1. Sprints (filha do quadro). Varias podem estar 'ativa' em paralelo.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS sprints (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  quadro_id         uuid NOT NULL REFERENCES quadros(id) ON DELETE CASCADE,

  nome              text NOT NULL,
  -- Objetivo da sprint (o "por que"). Opcional.
  meta              text,

  data_inicio       date NOT NULL,
  data_fim          date NOT NULL,

  -- planejamento -> ativa -> encerrada
  estado            text NOT NULL DEFAULT 'planejamento',

  -- Capacidade planejada em pontos (alimenta o aviso de over-commit).
  capacidade_pontos int,

  -- Ordem de exibicao das raias no quadro.
  ordem             int NOT NULL DEFAULT 0,

  -- Carimbo de encerramento (base do carry-over e da velocidade historica).
  encerrada_em      timestamptz,

  criado_por_id     uuid REFERENCES pessoas_acesso(id) ON DELETE SET NULL,
  criado_em         timestamptz NOT NULL DEFAULT now(),
  atualizado_em     timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT sprints_estado_valido
    CHECK (estado IN ('planejamento', 'ativa', 'encerrada')),
  CONSTRAINT sprints_capacidade_positiva
    CHECK (capacidade_pontos IS NULL OR capacidade_pontos >= 0),
  CONSTRAINT sprints_periodo_valido
    CHECK (data_fim >= data_inicio)
);

CREATE INDEX IF NOT EXISTS idx_sprints_quadro_estado
  ON sprints (quadro_id, estado);

CREATE INDEX IF NOT EXISTS idx_sprints_quadro_periodo
  ON sprints (quadro_id, data_inicio, data_fim);

-- ---------------------------------------------------------------------------
-- 2. Card: dimensoes ortogonais (compromisso + fluxo)
-- ---------------------------------------------------------------------------
ALTER TABLE cards
  ADD COLUMN IF NOT EXISTS sprint_id uuid REFERENCES sprints(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS fluxo     text NOT NULL DEFAULT 'projeto';

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'cards_fluxo_valido') THEN
    ALTER TABLE cards ADD CONSTRAINT cards_fluxo_valido
      CHECK (fluxo IN ('projeto', 'sustentacao'));
  END IF;
END $$;

-- Cards de uma sprint (parcial: so os vivos importam pro board).
CREATE INDEX IF NOT EXISTS idx_cards_sprint
  ON cards (sprint_id) WHERE arquivado_em IS NULL;

-- Separa projeto x sustentacao por quadro sem varrer a tabela toda.
CREATE INDEX IF NOT EXISTS idx_cards_fluxo
  ON cards (quadro_id, fluxo) WHERE arquivado_em IS NULL;

-- ---------------------------------------------------------------------------
-- 3. Campos de SUSTENTACAO no card (NULL quando fluxo='projeto')
-- ---------------------------------------------------------------------------
ALTER TABLE cards
  ADD COLUMN IF NOT EXISTS sustentacao_status text,
  ADD COLUMN IF NOT EXISTS severidade         text,
  ADD COLUMN IF NOT EXISTS sla_vence_em       timestamptz,
  ADD COLUMN IF NOT EXISTS canal_origem       text;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'cards_sustentacao_status_valido') THEN
    ALTER TABLE cards ADD CONSTRAINT cards_sustentacao_status_valido
      CHECK (sustentacao_status IS NULL OR sustentacao_status IN
        ('aberto', 'triado', 'atendendo', 'aguardando', 'resolvido'));
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'cards_severidade_valida') THEN
    ALTER TABLE cards ADD CONSTRAINT cards_severidade_valida
      CHECK (severidade IS NULL OR severidade IN
        ('baixa', 'media', 'alta', 'critica'));
  END IF;
END $$;

-- Fila viva de sustentacao ordenada por vencimento de SLA.
CREATE INDEX IF NOT EXISTS idx_cards_sustentacao
  ON cards (quadro_id, sla_vence_em)
  WHERE fluxo = 'sustentacao' AND arquivado_em IS NULL;

-- ---------------------------------------------------------------------------
-- 4. Coluna do tipo 'sustentacao' (oculta): abriga os cards de sustentacao
--    por causa do NOT NULL de coluna_id. Estende a constraint existente.
-- ---------------------------------------------------------------------------
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'colunas_tipo_valido') THEN
    ALTER TABLE colunas DROP CONSTRAINT colunas_tipo_valido;
  END IF;
  ALTER TABLE colunas ADD CONSTRAINT colunas_tipo_valido
    CHECK (tipo IN ('backlog', 'em_andamento', 'concluida', 'sustentacao'));
END $$;

COMMIT;
