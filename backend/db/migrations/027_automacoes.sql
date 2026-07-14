-- ===========================================================================
-- Sprint 36 — Automacoes (o "Butler", melhor que o Butler)
-- ===========================================================================
--
-- Modelo: GATILHO -> CONDICOES -> ACOES.
--
-- O Butler do Trello move card, atribui pessoa e cria checklist. So.
-- O nosso faz tudo isso E atravessa modulos: fecha um card e a conta a
-- pagar daquele trabalho nasce sozinha, ja categorizada.
--
-- Tres decisoes que definem o desenho:
--
-- 1. gatilho/condicoes/acoes sao JSONB, nao colunas.
--    Um schema rigido exigiria migration a cada acao nova. Como isso e
--    configuracao (nao dado de negocio consultavel), jsonb e o lugar certo.
--    A validacao de forma acontece no Zod, no controller.
--
-- 2. TODA execucao vira linha em automacoes_execucoes — inclusive a que
--    falhou e a que foi ignorada por condicao.
--    Automacao invisivel e automacao em que ninguem confia. O Butler nao
--    mostra por que nao rodou; o nosso mostra.
--
-- 3. Guarda de recursao (profundidade) fica no service, nao no banco.
--    Uma automacao que move o card dispara "card_movido", que pode acionar
--    outra automacao. Sem limite, isso e um loop infinito no primeiro dia.
-- ===========================================================================

BEGIN;

CREATE TABLE IF NOT EXISTS automacoes (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  quadro_id     uuid NOT NULL REFERENCES quadros(id) ON DELETE CASCADE,

  nome          text NOT NULL,
  ativa         boolean NOT NULL DEFAULT TRUE,

  -- { "tipo": "card_movido", "coluna_id": "..." }
  -- tipos: card_criado | card_movido | etiqueta_adicionada |
  --        checklist_completo | prazo_proximo | agendada
  gatilho       jsonb NOT NULL,

  -- [ { "campo": "prioridade", "op": "<=", "valor": 1 } ]  (AND entre todas)
  condicoes     jsonb NOT NULL DEFAULT '[]'::jsonb,

  -- [ { "tipo": "atribuir", "pessoa_ids": [...] }, ... ]  (em ordem)
  acoes         jsonb NOT NULL DEFAULT '[]'::jsonb,

  -- Expressao cron, so para gatilho.tipo = 'agendada'
  agendamento   text,

  criado_por_id uuid REFERENCES pessoas_acesso(id) ON DELETE SET NULL,
  criado_em     timestamptz NOT NULL DEFAULT now(),
  atualizado_em timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_automacoes_quadro
  ON automacoes (quadro_id) WHERE ativa = TRUE;

-- Busca rapida por tipo de gatilho na hora do dispatch.
CREATE INDEX IF NOT EXISTS idx_automacoes_gatilho_tipo
  ON automacoes ((gatilho ->> 'tipo')) WHERE ativa = TRUE;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'trg_automacoes_atualizado') THEN
    CREATE TRIGGER trg_automacoes_atualizado
      BEFORE UPDATE ON automacoes
      FOR EACH ROW EXECUTE FUNCTION trigger_atualizar_em();
  END IF;
END $$;

-- ---------------------------------------------------------------------------
-- Log de execucoes
-- ---------------------------------------------------------------------------
-- 'ok'       = rodou e as acoes foram aplicadas
-- 'ignorada' = gatilho bateu, mas alguma condicao reprovou (NAO e erro)
-- 'erro'     = tentou executar e falhou (detalhe traz a mensagem)
--
-- Guardamos as ignoradas de proposito: a pergunta mais comum sobre
-- automacao nao e "o que ela fez", e "por que ela NAO fez".
CREATE TABLE IF NOT EXISTS automacoes_execucoes (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  automacao_id  uuid NOT NULL REFERENCES automacoes(id) ON DELETE CASCADE,
  card_id       uuid REFERENCES cards(id) ON DELETE SET NULL,

  status        text NOT NULL CHECK (status IN ('ok', 'ignorada', 'erro')),
  detalhe       jsonb,

  executado_em  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_automacoes_exec_automacao
  ON automacoes_execucoes (automacao_id, executado_em DESC);

CREATE INDEX IF NOT EXISTS idx_automacoes_exec_card
  ON automacoes_execucoes (card_id, executado_em DESC);

COMMIT;
