-- ===========================================================================
-- Sprint 18 — Múltiplos responsáveis em cards e eventos
-- ===========================================================================
--
-- Cards e eventos passam a aceitar 1+ responsáveis (eram 1 só).
--
-- Estratégia: mantemos `cards.responsavel_id` por compatibilidade (apps
-- antigas, dashboards que consultam direto), mas a fonte da verdade
-- passa a ser a tabela N:N `cards_responsaveis`. Um trigger sincroniza:
-- sempre que mexe na N:N, o `responsavel_id` reflete o "principal"
-- (primeiro adicionado). Isso evita migration de UI/queries antigas.
--
-- Cards existentes que já têm `responsavel_id` ganham automaticamente
-- uma linha na N:N (backfill no fim do script).
--
-- Decisão de produto (Sprint 18): pessoas de equipes DIFERENTES podem
-- ser responsáveis pelo mesmo card. Não há validação de equipe — só
-- exigimos que a pessoa esteja ativa em pessoas_acesso.
-- ===========================================================================

BEGIN;

-- ---------------------------------------------------------------------------
-- 1. Cards N:N pessoa
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS cards_responsaveis (
  card_id           uuid NOT NULL REFERENCES cards(id) ON DELETE CASCADE,
  pessoa_id         uuid NOT NULL REFERENCES pessoas_acesso(id) ON DELETE CASCADE,
  -- Ordem de exibição. O primeiro (menor) é considerado "principal" e
  -- espelhado em cards.responsavel_id pelo trigger abaixo.
  ordem             int NOT NULL DEFAULT 0,
  adicionado_em     timestamptz NOT NULL DEFAULT now(),
  adicionado_por_id uuid REFERENCES pessoas_acesso(id) ON DELETE SET NULL,
  PRIMARY KEY (card_id, pessoa_id)
);

CREATE INDEX IF NOT EXISTS idx_cards_responsaveis_pessoa
  ON cards_responsaveis (pessoa_id);

CREATE INDEX IF NOT EXISTS idx_cards_responsaveis_card_ordem
  ON cards_responsaveis (card_id, ordem);

-- ---------------------------------------------------------------------------
-- 2. Eventos do quadro N:N pessoa
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS eventos_quadro_responsaveis (
  evento_id      uuid NOT NULL REFERENCES eventos_quadro(id) ON DELETE CASCADE,
  pessoa_id      uuid NOT NULL REFERENCES pessoas_acesso(id) ON DELETE CASCADE,
  ordem          int NOT NULL DEFAULT 0,
  adicionado_em  timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (evento_id, pessoa_id)
);

CREATE INDEX IF NOT EXISTS idx_eventos_quadro_responsaveis_pessoa
  ON eventos_quadro_responsaveis (pessoa_id);

-- ---------------------------------------------------------------------------
-- 3. Eventos societários N:N pessoa
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS eventos_calendario_responsaveis (
  evento_id      uuid NOT NULL REFERENCES eventos_calendario(id) ON DELETE CASCADE,
  pessoa_id      uuid NOT NULL REFERENCES pessoas_acesso(id) ON DELETE CASCADE,
  ordem          int NOT NULL DEFAULT 0,
  adicionado_em  timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (evento_id, pessoa_id)
);

CREATE INDEX IF NOT EXISTS idx_eventos_calendario_responsaveis_pessoa
  ON eventos_calendario_responsaveis (pessoa_id);

-- ---------------------------------------------------------------------------
-- 4. Sincronização cards.responsavel_id ↔ cards_responsaveis (primeiro)
-- ---------------------------------------------------------------------------
-- Mantém a coluna legada apontando pra primeira pessoa na N:N. Isso permite
-- que código antigo (notificações, dashboards, filtro "meus cards")
-- continue funcionando sem mudança imediata.
CREATE OR REPLACE FUNCTION sync_card_responsavel_principal()
RETURNS TRIGGER AS $$
DECLARE
  card_alvo uuid;
  prim      uuid;
BEGIN
  card_alvo := COALESCE(NEW.card_id, OLD.card_id);

  SELECT pessoa_id INTO prim
    FROM cards_responsaveis
   WHERE card_id = card_alvo
   ORDER BY ordem, adicionado_em
   LIMIT 1;

  -- prim pode ser NULL (todos foram removidos) — espelhamos isso também
  UPDATE cards SET responsavel_id = prim
    WHERE id = card_alvo;

  RETURN NULL;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_cards_responsaveis_sync ON cards_responsaveis;
CREATE TRIGGER trg_cards_responsaveis_sync
  AFTER INSERT OR UPDATE OR DELETE ON cards_responsaveis
  FOR EACH ROW EXECUTE FUNCTION sync_card_responsavel_principal();

-- ---------------------------------------------------------------------------
-- 5. Backfill: cards existentes com responsavel_id viram linha na N:N
-- ---------------------------------------------------------------------------
-- Atenção: o trigger acima vai disparar a cada INSERT, mas o UPDATE que
-- ele faz no `cards.responsavel_id` é idempotente (escreve o mesmo valor
-- que já está lá), então não há overhead funcional.
INSERT INTO cards_responsaveis (card_id, pessoa_id, ordem)
SELECT id, responsavel_id, 0
  FROM cards
 WHERE responsavel_id IS NOT NULL
ON CONFLICT (card_id, pessoa_id) DO NOTHING;

COMMIT;
