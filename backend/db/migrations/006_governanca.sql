-- Sprint 6 — Governança
--
-- Cinco tabelas novas:
--   1. documentos_governanca   → atas e contratos (com upload de arquivo)
--   2. aprovacoes_documento    → voto de cada sócio em uma ata/contrato
--   3. decisoes                → propostas formais a serem aprovadas
--   4. aprovacoes_decisao      → voto de cada sócio em uma decisão
--   5. eventos_calendario      → calendário societário (estilo Google Calendar)
--
-- Decisões importantes do design:
--   - Voto é POR SÓCIO (não por pessoa). Uma pessoa que representa 2
--     sócios vota duas vezes (uma para cada sócio).
--   - Quorum é configurável por documento/decisão: 'maioria_simples'
--     (>50% dos sócios elegíveis) ou 'unanimidade' (100%).
--   - Atas exigem poder `pode_aprovar_atas` na representação;
--     decisões exigem `pode_votar`. O backend valida antes de gravar.
--   - Status muda automaticamente quando se atinge o quorum.

BEGIN;

-- ===========================================================
-- 1. documentos_governanca
-- ===========================================================

CREATE TABLE IF NOT EXISTS documentos_governanca (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  tipo                TEXT NOT NULL CHECK (tipo IN ('ata', 'contrato_social', 'outro')),
  titulo              TEXT NOT NULL,
  descricao           TEXT,

  -- Para ata: data da reunião. Para contrato: data de vigência.
  data_referencia     DATE NOT NULL,

  -- Arquivo (upload). Pode ficar nulo enquanto rascunho.
  arquivo_nome        TEXT,        -- nome original que o usuário enviou
  arquivo_caminho     TEXT,        -- caminho relativo dentro de UPLOADS_DIR
  arquivo_tamanho     BIGINT,
  arquivo_mime        TEXT,

  -- Específico de contrato_social: qual versão e se está vigente
  versao              INT,
  vigente             BOOLEAN NOT NULL DEFAULT FALSE,

  -- Aprovação
  requer_aprovacao    BOOLEAN NOT NULL DEFAULT TRUE,
  quorum              TEXT NOT NULL DEFAULT 'maioria_simples'
                            CHECK (quorum IN ('maioria_simples', 'unanimidade')),

  status              TEXT NOT NULL DEFAULT 'rascunho'
                            CHECK (status IN ('rascunho', 'em_aprovacao', 'aprovado', 'rejeitado', 'arquivado')),

  -- Auditoria
  criado_por_id       UUID REFERENCES pessoas_acesso(id) ON DELETE SET NULL,
  criado_em           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  atualizado_em       TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  -- Regras:
  -- contrato vigente exige tipo='contrato_social'
  CONSTRAINT vigente_so_contrato CHECK (NOT vigente OR tipo = 'contrato_social'),
  -- só faz sentido ter versão pra contrato
  CONSTRAINT versao_so_contrato CHECK (versao IS NULL OR tipo = 'contrato_social')
);

-- Apenas UM contrato pode estar vigente
CREATE UNIQUE INDEX IF NOT EXISTS idx_doc_contrato_vigente_unico
  ON documentos_governanca (vigente)
  WHERE vigente = TRUE AND tipo = 'contrato_social';

CREATE INDEX IF NOT EXISTS idx_doc_tipo_status
  ON documentos_governanca (tipo, status);
CREATE INDEX IF NOT EXISTS idx_doc_data_ref
  ON documentos_governanca (data_referencia DESC);

-- ===========================================================
-- 2. aprovacoes_documento
-- ===========================================================

CREATE TABLE IF NOT EXISTS aprovacoes_documento (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  documento_id        UUID NOT NULL REFERENCES documentos_governanca(id) ON DELETE CASCADE,
  socio_id            UUID NOT NULL REFERENCES socios(id) ON DELETE CASCADE,

  -- Quem efetivamente registrou o voto (a pessoa logada).
  -- Pode ser diferente do "titular" do sócio se for representante.
  pessoa_acesso_id    UUID NOT NULL REFERENCES pessoas_acesso(id) ON DELETE SET NULL,

  voto                TEXT NOT NULL CHECK (voto IN ('aprovado', 'rejeitado', 'abstencao')),
  comentario          TEXT,

  registrado_em       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  -- Se voto for trocado, atualiza o registro existente (ON CONFLICT)
  atualizado_em       TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  -- Um sócio só vota UMA vez por documento (pode trocar o voto)
  UNIQUE (documento_id, socio_id)
);

CREATE INDEX IF NOT EXISTS idx_aprov_doc_socio
  ON aprovacoes_documento (socio_id);

-- ===========================================================
-- 3. decisoes
-- ===========================================================

CREATE TABLE IF NOT EXISTS decisoes (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  titulo              TEXT NOT NULL,
  descricao           TEXT NOT NULL,

  -- Tipo é texto livre pra não engessar (ex: "Distribuição extraordinária",
  -- "Aumento de capital", "Mudança de administrador"). Pode ser usado
  -- pra agrupar/filtrar no futuro.
  tipo                TEXT NOT NULL DEFAULT 'geral',

  -- Se a decisão está conectada a outro objeto do sistema
  -- (ex: aprovação de uma distribuicoes_lucros). Texto livre por ora.
  referencia_externa  TEXT,

  data_proposta       DATE NOT NULL DEFAULT CURRENT_DATE,
  prazo_aprovacao     DATE,         -- opcional: data limite

  quorum              TEXT NOT NULL DEFAULT 'maioria_simples'
                            CHECK (quorum IN ('maioria_simples', 'unanimidade')),

  status              TEXT NOT NULL DEFAULT 'em_aprovacao'
                            CHECK (status IN ('em_aprovacao', 'aprovada', 'rejeitada', 'cancelada')),

  motivo_cancelamento TEXT,         -- obrigatório se status='cancelada'

  criado_por_id       UUID REFERENCES pessoas_acesso(id) ON DELETE SET NULL,
  criado_em           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  finalizada_em       TIMESTAMPTZ,  -- preenchida quando atinge o quorum (aprovada/rejeitada)

  CONSTRAINT cancelada_exige_motivo CHECK (
    status <> 'cancelada' OR (motivo_cancelamento IS NOT NULL AND length(trim(motivo_cancelamento)) >= 3)
  )
);

CREATE INDEX IF NOT EXISTS idx_decisoes_status
  ON decisoes (status, data_proposta DESC);

-- ===========================================================
-- 4. aprovacoes_decisao
-- ===========================================================

CREATE TABLE IF NOT EXISTS aprovacoes_decisao (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  decisao_id          UUID NOT NULL REFERENCES decisoes(id) ON DELETE CASCADE,
  socio_id            UUID NOT NULL REFERENCES socios(id) ON DELETE CASCADE,
  pessoa_acesso_id    UUID NOT NULL REFERENCES pessoas_acesso(id) ON DELETE SET NULL,

  voto                TEXT NOT NULL CHECK (voto IN ('aprovado', 'rejeitado', 'abstencao')),
  comentario          TEXT,

  registrado_em       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  atualizado_em       TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  UNIQUE (decisao_id, socio_id)
);

CREATE INDEX IF NOT EXISTS idx_aprov_decisao_socio
  ON aprovacoes_decisao (socio_id);

-- ===========================================================
-- 5. eventos_calendario
-- ===========================================================

CREATE TABLE IF NOT EXISTS eventos_calendario (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  titulo              TEXT NOT NULL,
  descricao           TEXT,

  -- Tipo livre pra estilo visual. Defaults:
  --   'reuniao'                → reunião societária (azul)
  --   'vencimento_legal'       → DARF, declaração, etc (vermelho)
  --   'pagamento_importante'   → pagamento de destaque (âmbar)
  --   'outro'                  → genérico (cinza)
  tipo                TEXT NOT NULL DEFAULT 'outro'
                            CHECK (tipo IN ('reuniao', 'vencimento_legal', 'pagamento_importante', 'outro')),

  -- Datas
  data_inicio         TIMESTAMPTZ NOT NULL,
  data_fim            TIMESTAMPTZ,        -- opcional; quando nulo, evento de instante
  dia_inteiro         BOOLEAN NOT NULL DEFAULT FALSE,

  local               TEXT,
  link                TEXT,                -- ex: link Google Meet
  observacao          TEXT,

  -- Auditoria
  criado_por_id       UUID REFERENCES pessoas_acesso(id) ON DELETE SET NULL,
  criado_em           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  atualizado_em       TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT data_fim_apos_inicio CHECK (data_fim IS NULL OR data_fim >= data_inicio)
);

CREATE INDEX IF NOT EXISTS idx_eventos_calendario_data
  ON eventos_calendario (data_inicio);

-- Triggers para atualizar `atualizado_em` automaticamente.
-- Reusamos a função genérica que (presumimos) já existe das migrations
-- anteriores. Se não existir, criamos.
CREATE OR REPLACE FUNCTION trigger_atualizar_em()
RETURNS TRIGGER AS $$
BEGIN
  NEW.atualizado_em = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_doc_gov_atualizado ON documentos_governanca;
CREATE TRIGGER trg_doc_gov_atualizado
  BEFORE UPDATE ON documentos_governanca
  FOR EACH ROW EXECUTE FUNCTION trigger_atualizar_em();

DROP TRIGGER IF EXISTS trg_aprov_doc_atualizado ON aprovacoes_documento;
CREATE TRIGGER trg_aprov_doc_atualizado
  BEFORE UPDATE ON aprovacoes_documento
  FOR EACH ROW EXECUTE FUNCTION trigger_atualizar_em();

DROP TRIGGER IF EXISTS trg_aprov_dec_atualizado ON aprovacoes_decisao;
CREATE TRIGGER trg_aprov_dec_atualizado
  BEFORE UPDATE ON aprovacoes_decisao
  FOR EACH ROW EXECUTE FUNCTION trigger_atualizar_em();

DROP TRIGGER IF EXISTS trg_eventos_atualizado ON eventos_calendario;
CREATE TRIGGER trg_eventos_atualizado
  BEFORE UPDATE ON eventos_calendario
  FOR EACH ROW EXECUTE FUNCTION trigger_atualizar_em();

COMMIT;
