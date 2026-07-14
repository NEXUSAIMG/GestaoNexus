-- ===========================================================================
-- Sprint 37 — Metricas de fluxo
-- ===========================================================================
--
-- O que o Trello so entrega em Power-Up pago (e mal):
--   - Cycle time / lead time com percentil (p50 e p85)
--   - Throughput (entregas por semana)
--   - Aging WIP (card parado ha N dias na mesma coluna)  <- o mais acionavel
--   - CFD (cumulative flow diagram)
--
-- Para isso precisamos de TEMPO, nao so de estado:
--   1. cards.coluna_desde  -> quando o card entrou na coluna atual (aging)
--   2. cards.iniciado_em   -> quando saiu do backlog pela 1a vez (cycle time)
--   3. cards_movimentos    -> log de cada movimentacao (fonte da verdade)
--   4. cards_snapshot_diario -> foto diaria por coluna (CFD sem reconstruir
--      o grafo inteiro toda vez)
--
-- Honestidade sobre o passado: nao existe historico antes desta migration.
-- O backfill usa aproximacoes explicitas (documentadas abaixo) e o frontend
-- avisa que os dados anteriores a hoje sao estimados.
-- ===========================================================================

BEGIN;

-- ---------------------------------------------------------------------------
-- 1. Carimbos de tempo no card
-- ---------------------------------------------------------------------------
ALTER TABLE cards
  -- Quando o card entrou na coluna ATUAL. Base do aging WIP.
  ADD COLUMN IF NOT EXISTS coluna_desde timestamptz,
  -- Quando o card saiu do backlog pela PRIMEIRA vez. Base do cycle time.
  -- (lead time = concluido_em - criado_em; cycle time = concluido_em - iniciado_em)
  ADD COLUMN IF NOT EXISTS iniciado_em  timestamptz;

CREATE INDEX IF NOT EXISTS idx_cards_coluna_desde
  ON cards (quadro_id, coluna_desde) WHERE arquivado_em IS NULL;

-- ---------------------------------------------------------------------------
-- 2. Log de movimentacoes (fonte da verdade daqui pra frente)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS cards_movimentos (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  card_id        uuid NOT NULL REFERENCES cards(id) ON DELETE CASCADE,
  quadro_id      uuid NOT NULL REFERENCES quadros(id) ON DELETE CASCADE,

  de_coluna_id   uuid REFERENCES colunas(id) ON DELETE SET NULL,
  para_coluna_id uuid NOT NULL REFERENCES colunas(id) ON DELETE CASCADE,

  -- Tipo das colunas no momento do movimento. Guardado de proposito: se
  -- alguem mudar o tipo da coluna depois, o historico nao se reescreve.
  de_tipo        text,
  para_tipo      text NOT NULL,

  -- Minutos que o card passou na coluna de origem. NULL na criacao.
  minutos_na_origem int,

  pessoa_id      uuid REFERENCES pessoas_acesso(id) ON DELETE SET NULL,
  em             timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_cards_movimentos_card
  ON cards_movimentos (card_id, em);

CREATE INDEX IF NOT EXISTS idx_cards_movimentos_quadro
  ON cards_movimentos (quadro_id, em);

-- ---------------------------------------------------------------------------
-- 3. Snapshot diario (CFD)
-- ---------------------------------------------------------------------------
-- Uma linha por card por dia. Com ~200 cards ativos isso da ~73k linhas/ano —
-- irrelevante pro Postgres e simplifica MUITO o CFD (basta um GROUP BY).
CREATE TABLE IF NOT EXISTS cards_snapshot_diario (
  data         date NOT NULL,
  card_id      uuid NOT NULL REFERENCES cards(id) ON DELETE CASCADE,
  quadro_id    uuid NOT NULL REFERENCES quadros(id) ON DELETE CASCADE,
  coluna_id    uuid NOT NULL REFERENCES colunas(id) ON DELETE CASCADE,
  coluna_tipo  text NOT NULL,
  -- Dias parado na mesma coluna naquele dia (aging congelado)
  dias_na_coluna int NOT NULL DEFAULT 0,
  PRIMARY KEY (data, card_id)
);

CREATE INDEX IF NOT EXISTS idx_snapshot_quadro_data
  ON cards_snapshot_diario (quadro_id, data);

-- ---------------------------------------------------------------------------
-- 4. Backfill (aproximacoes explicitas)
-- ---------------------------------------------------------------------------
-- coluna_desde: nao sabemos quando o card entrou na coluna atual. A melhor
-- aproximacao disponivel e `atualizado_em` (ultima vez que o card mudou).
-- Superestima cards que so tiveram o titulo editado, mas e conservador:
-- mostra MENOS aging do que o real, nunca mais.
UPDATE cards
   SET coluna_desde = COALESCE(atualizado_em, criado_em)
 WHERE coluna_desde IS NULL;

-- iniciado_em: para cards que ja estao fora do backlog, usamos criado_em.
-- Isso faz o cycle time inicial se aproximar do lead time — e uma
-- superestimativa honesta, que vai se corrigindo conforme os cards novos
-- passam pelo fluxo instrumentado.
UPDATE cards c
   SET iniciado_em = c.criado_em
  FROM colunas col
 WHERE col.id = c.coluna_id
   AND col.tipo <> 'backlog'
   AND c.iniciado_em IS NULL;

COMMIT;
