-- ===========================================================================
-- Sprint 14 — Processos / Workflows (estilo BPMN simplificado)
-- ===========================================================================
--
-- Permite documentar processos da empresa de forma visual: nós (início,
-- tarefa, decisão, fim), arestas (conexões entre nós) e papéis das
-- pessoas envolvidas. Cada processo pode estar associado a uma ou mais
-- equipes (N:N).
--
-- Decisões:
--   - Cinco tabelas:
--       processos              → cabeçalho (nome, descrição, status)
--       processos_equipes      → N:N entre processo e equipe (Sprint 10)
--       processos_papeis       → papéis DENTRO do processo, mapeados
--                                opcionalmente para uma equipe OU pessoa
--       processos_nos          → nós do diagrama (com posição x/y)
--       processos_arestas      → conexões entre nós (com label opcional)
--   - Papéis são POR processo, não globais — diferentes processos podem
--     ter papéis com nomes diferentes ("Vendedor" no Onboarding,
--     "Atendente" no Suporte).
--   - Mapear papel é opcional. Pode-se desenhar o fluxo primeiro e
--     definir responsáveis depois.
--   - Status: 'rascunho' (em construção) | 'publicado' (estável) |
--             'arquivado' (não usar mais)
--   - Posição (x,y) gravada pra reabrir o canvas exatamente onde estava.
--   - Sem cascata FK em processos_nos → processos_arestas: a UI faz
--     replace-all (deleta todas + insere todas) ao salvar, então o
--     ON DELETE CASCADE entre processo→nó e nó→aresta resolve.
-- ===========================================================================

BEGIN;

-- ---------------------------------------------------------------------------
-- 1) processos — cabeçalho
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS processos (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  nome            text NOT NULL,
  descricao       text,

  -- Cor pra distinguir processos na UI
  cor             text NOT NULL DEFAULT 'slate'
                    CHECK (cor IN (
                      'slate', 'red', 'orange', 'amber', 'yellow',
                      'lime', 'emerald', 'teal', 'cyan', 'blue',
                      'indigo', 'violet', 'fuchsia', 'pink', 'rose'
                    )),

  status          text NOT NULL DEFAULT 'rascunho'
                    CHECK (status IN ('rascunho', 'publicado', 'arquivado')),

  -- Versão semântica simples — incrementa toda vez que salva uma alteração
  -- estrutural depois de publicado. Útil pra Sprint 15 (instâncias guardam
  -- a versão usada).
  versao          int NOT NULL DEFAULT 1,

  criado_por_id   uuid REFERENCES pessoas_acesso(id) ON DELETE SET NULL,
  criado_em       timestamptz NOT NULL DEFAULT now(),
  atualizado_em   timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_processos_nome_ativo
  ON processos (lower(nome))
  WHERE status <> 'arquivado';

CREATE INDEX IF NOT EXISTS idx_processos_status
  ON processos (status);

-- ---------------------------------------------------------------------------
-- 2) processos_equipes — N:N
-- ---------------------------------------------------------------------------
-- Processo "Onboarding" pode estar associado a Comercial + Jurídico.
-- Quem for membro de qualquer dessas equipes vê o processo.
CREATE TABLE IF NOT EXISTS processos_equipes (
  processo_id     uuid NOT NULL REFERENCES processos(id) ON DELETE CASCADE,
  equipe_id       uuid NOT NULL REFERENCES equipes(id) ON DELETE CASCADE,
  criado_em       timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (processo_id, equipe_id)
);

CREATE INDEX IF NOT EXISTS idx_processos_equipes_equipe
  ON processos_equipes (equipe_id);

-- ---------------------------------------------------------------------------
-- 3) processos_papeis — papéis dentro do processo
-- ---------------------------------------------------------------------------
-- Cada papel pode (opcionalmente) ser mapeado a uma equipe OU uma pessoa.
-- Quando mapeado, ao executar o processo (Sprint 15), a tarefa do nó
-- com este papel será atribuída automaticamente.
CREATE TABLE IF NOT EXISTS processos_papeis (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  processo_id     uuid NOT NULL REFERENCES processos(id) ON DELETE CASCADE,
  nome            text NOT NULL,
  descricao       text,

  -- Cor da raia/swimlane na UI
  cor             text NOT NULL DEFAULT 'blue'
                    CHECK (cor IN (
                      'slate', 'red', 'orange', 'amber', 'yellow',
                      'lime', 'emerald', 'teal', 'cyan', 'blue',
                      'indigo', 'violet', 'fuchsia', 'pink', 'rose'
                    )),

  -- Mapeamento OPCIONAL. Exatamente um deve ser preenchido (ou nenhum):
  equipe_id       uuid REFERENCES equipes(id) ON DELETE SET NULL,
  pessoa_id       uuid REFERENCES pessoas_acesso(id) ON DELETE SET NULL,

  ordem           int NOT NULL DEFAULT 0,

  criado_em       timestamptz NOT NULL DEFAULT now(),
  atualizado_em   timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT papel_mapeamento_exclusivo
    CHECK (NOT (equipe_id IS NOT NULL AND pessoa_id IS NOT NULL))
);

CREATE INDEX IF NOT EXISTS idx_processos_papeis_processo
  ON processos_papeis (processo_id, ordem);

CREATE UNIQUE INDEX IF NOT EXISTS idx_processos_papeis_nome_unico
  ON processos_papeis (processo_id, lower(nome));

-- ---------------------------------------------------------------------------
-- 4) processos_nos — nós do diagrama
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS processos_nos (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  processo_id     uuid NOT NULL REFERENCES processos(id) ON DELETE CASCADE,

  tipo            text NOT NULL
                    CHECK (tipo IN ('inicio', 'tarefa', 'decisao', 'fim')),

  rotulo          text NOT NULL,
  descricao       text,

  -- Papel responsável (opcional pra início/fim, recomendado pra tarefa/decisão)
  papel_id        uuid REFERENCES processos_papeis(id) ON DELETE SET NULL,

  -- Prazo em DIAS após a etapa anterior ser concluída.
  -- Só faz sentido em 'tarefa' e 'decisao'. Usado pela Sprint 15 pra
  -- definir data_prazo do card gerado.
  prazo_dias      int CHECK (prazo_dias IS NULL OR prazo_dias >= 0),

  -- Posição no canvas pra reabrir no mesmo lugar.
  posicao_x       numeric NOT NULL DEFAULT 0,
  posicao_y       numeric NOT NULL DEFAULT 0,

  criado_em       timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_processos_nos_processo
  ON processos_nos (processo_id);

CREATE INDEX IF NOT EXISTS idx_processos_nos_papel
  ON processos_nos (papel_id)
  WHERE papel_id IS NOT NULL;

-- ---------------------------------------------------------------------------
-- 5) processos_arestas — conexões entre nós
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS processos_arestas (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  processo_id     uuid NOT NULL REFERENCES processos(id) ON DELETE CASCADE,

  origem_no_id    uuid NOT NULL REFERENCES processos_nos(id) ON DELETE CASCADE,
  destino_no_id   uuid NOT NULL REFERENCES processos_nos(id) ON DELETE CASCADE,

  -- Rótulo opcional (útil em decisões: "Sim", "Não", "Aprovado" etc)
  rotulo          text,

  criado_em       timestamptz NOT NULL DEFAULT now(),

  -- Não permite aresta de um nó pra ele mesmo
  CONSTRAINT arestas_sem_loop CHECK (origem_no_id <> destino_no_id),

  -- Não pode ter aresta duplicada entre os mesmos nós
  CONSTRAINT arestas_unicas UNIQUE (origem_no_id, destino_no_id)
);

CREATE INDEX IF NOT EXISTS idx_processos_arestas_processo
  ON processos_arestas (processo_id);

CREATE INDEX IF NOT EXISTS idx_processos_arestas_origem
  ON processos_arestas (origem_no_id);

CREATE INDEX IF NOT EXISTS idx_processos_arestas_destino
  ON processos_arestas (destino_no_id);

-- ---------------------------------------------------------------------------
-- Trigger pra atualizar atualizado_em automaticamente
-- ---------------------------------------------------------------------------
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'trg_processos_atualizado') THEN
    CREATE TRIGGER trg_processos_atualizado
      BEFORE UPDATE ON processos
      FOR EACH ROW EXECUTE FUNCTION trigger_atualizar_em();
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'trg_processos_papeis_atualizado') THEN
    CREATE TRIGGER trg_processos_papeis_atualizado
      BEFORE UPDATE ON processos_papeis
      FOR EACH ROW EXECUTE FUNCTION trigger_atualizar_em();
  END IF;
END $$;

COMMIT;
