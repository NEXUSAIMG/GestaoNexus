-- ===========================================================================
-- Sprint 15 — Execução de processos (instâncias)
-- ===========================================================================
--
-- "Instância" = uma execução real de um processo definido na Sprint 14.
-- Quando você "inicia uma instância", o sistema cria automaticamente:
--   1. Um QUADRO novo (Sprint 10) só pra essa instância
--   2. Três COLUNAS padrão: "A fazer", "Em andamento", "Concluído"
--   3. Uma linha em processos_instancias (o "header" da execução)
--   4. Uma linha em processos_instancias_nos pra CADA nó do processo
--      (status='pendente'). Os nós conectados ao Início viram 'ativo' e
--      um card é gerado.
--
-- Conforme o usuário move cards pra coluna "Concluído", o backend:
--   - Marca o nó como 'concluido'
--   - Olha as arestas saindo dele
--   - Pra cada nó destino: muda pra 'ativo' e gera card
--   - Em decisões: NÃO avança automático — espera o usuário escolher
--     qual aresta seguir (POST /escolher-saida)
--
-- Decisões importantes:
--   - Snapshot da `versao_processo` na instância: se o admin editar o
--     processo depois, instâncias antigas não mudam. (A versão antiga
--     dos nós e arestas continua referenciada via FK.)
--   - `coluna_concluida_id` guarda QUAL coluna do quadro dispara o
--     avanço — assim o hook no cards.controller sabe qual coluna olhar.
--   - cards.instancia_no_id é nullable e ON DELETE SET NULL: se algum
--     dia removerem uma instância, os cards viram cards normais.
-- ===========================================================================

BEGIN;

-- ---------------------------------------------------------------------------
-- 1) processos_instancias — cabeçalho da execução
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS processos_instancias (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  processo_id         uuid NOT NULL REFERENCES processos(id) ON DELETE RESTRICT,
  versao_processo     int  NOT NULL,

  nome                text NOT NULL,
  descricao           text,

  -- Quadro auto-criado pra essa instância (Sprint 10)
  quadro_id           uuid NOT NULL REFERENCES quadros(id) ON DELETE RESTRICT,

  -- A coluna "Concluído" do quadro acima — quando card vai pra ela,
  -- o nó associado é marcado como concluído pelo hook em cards.
  coluna_concluida_id uuid NOT NULL REFERENCES colunas(id) ON DELETE RESTRICT,

  -- A coluna "Em andamento" — pra onde os cards iniciais são criados
  coluna_andamento_id uuid REFERENCES colunas(id) ON DELETE SET NULL,

  status              text NOT NULL DEFAULT 'em_andamento'
                        CHECK (status IN ('em_andamento', 'concluida', 'cancelada')),

  data_inicio         date,
  iniciada_em         timestamptz NOT NULL DEFAULT now(),
  concluida_em        timestamptz,

  motivo_cancelamento text,
  cancelada_em        timestamptz,
  cancelada_por_id    uuid REFERENCES pessoas_acesso(id) ON DELETE SET NULL,

  iniciada_por_id     uuid REFERENCES pessoas_acesso(id) ON DELETE SET NULL,
  criada_em           timestamptz NOT NULL DEFAULT now(),
  atualizado_em       timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT cancelada_exige_motivo CHECK (
    status <> 'cancelada' OR (motivo_cancelamento IS NOT NULL AND length(trim(motivo_cancelamento)) >= 3)
  )
);

CREATE INDEX IF NOT EXISTS idx_processos_instancias_processo
  ON processos_instancias (processo_id, status);

CREATE INDEX IF NOT EXISTS idx_processos_instancias_quadro
  ON processos_instancias (quadro_id);

-- ---------------------------------------------------------------------------
-- 2) processos_instancias_nos — estado de cada nó na execução
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS processos_instancias_nos (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  instancia_id    uuid NOT NULL REFERENCES processos_instancias(id) ON DELETE CASCADE,
  no_id           uuid NOT NULL REFERENCES processos_nos(id) ON DELETE RESTRICT,

  status          text NOT NULL DEFAULT 'pendente'
                    CHECK (status IN ('pendente', 'ativo', 'concluido', 'pulado')),

  -- Card gerado pra este nó (quando ativa). Nullable porque inicio/fim
  -- não geram card — eles são marcadores no fluxo.
  card_id         uuid REFERENCES cards(id) ON DELETE SET NULL,

  ativado_em      timestamptz,
  concluido_em    timestamptz,

  -- Pra decisões: qual aresta o usuário escolheu seguir.
  -- NULL enquanto não escolheu (ou nó não é decisão).
  saida_escolhida_aresta_id uuid REFERENCES processos_arestas(id) ON DELETE SET NULL,
  saida_escolhida_em        timestamptz,
  saida_escolhida_por_id    uuid REFERENCES pessoas_acesso(id) ON DELETE SET NULL,

  -- Não pode ter dois "estados" pro mesmo nó na mesma instância
  UNIQUE (instancia_id, no_id)
);

CREATE INDEX IF NOT EXISTS idx_instancias_nos_instancia_status
  ON processos_instancias_nos (instancia_id, status);

CREATE INDEX IF NOT EXISTS idx_instancias_nos_card
  ON processos_instancias_nos (card_id)
  WHERE card_id IS NOT NULL;

-- ---------------------------------------------------------------------------
-- 3) cards.instancia_no_id — liga card → nó da instância
-- ---------------------------------------------------------------------------
ALTER TABLE cards
  ADD COLUMN IF NOT EXISTS instancia_no_id uuid
    REFERENCES processos_instancias_nos(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_cards_instancia_no
  ON cards (instancia_no_id)
  WHERE instancia_no_id IS NOT NULL;

-- ---------------------------------------------------------------------------
-- 4) Trigger pra atualizada_em
-- ---------------------------------------------------------------------------
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'trg_processos_instancias_atualizada') THEN
    CREATE TRIGGER trg_processos_instancias_atualizada
      BEFORE UPDATE ON processos_instancias
      FOR EACH ROW EXECUTE FUNCTION trigger_atualizar_em();
  END IF;
END $$;

COMMIT;
