-- =====================================================================
-- Migration 002 — Representantes e separação pessoa de acesso / sócio
-- =====================================================================
-- Contexto:
--   Na Sprint 1, a tabela "socios" acumulava dois papéis: participação
--   societária e credenciais de login. Agora, para suportar representantes
--   (Cenário B: representantes com poder de ação), separamos em:
--
--     - socios            → participação societária (PF ou PJ, % de quotas)
--     - pessoas_acesso    → quem loga na ferramenta
--     - representacoes    → vínculo N:N entre pessoa e sócio, com papel,
--                           poderes e vigência
--     - log_acoes         → auditoria com autoria dupla (executor + em nome de)
--
--   Sócios existentes (criados na Sprint 1) são migrados automaticamente:
--   cada sócio vira ao mesmo tempo um registro em socios (sem login) e
--   uma pessoa_acesso vinculada a ele como "titular".
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1) Tabela: pessoas_acesso
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS pessoas_acesso (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  nome              VARCHAR(255) NOT NULL,
  email             VARCHAR(255) NOT NULL,
  senha_hash        VARCHAR(255) NOT NULL,
  telefone          VARCHAR(50),
  cpf               VARCHAR(14),
  administrador     BOOLEAN NOT NULL DEFAULT FALSE,
  ativo             BOOLEAN NOT NULL DEFAULT TRUE,
  ultimo_login_em   TIMESTAMPTZ,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_pessoas_acesso_email_unico
  ON pessoas_acesso (lower(email));

-- ---------------------------------------------------------------------
-- 2) Ajuste na tabela socios: PF/PJ + remover colunas de login
-- ---------------------------------------------------------------------
ALTER TABLE socios
  ADD COLUMN IF NOT EXISTS tipo_pessoa VARCHAR(10) NOT NULL DEFAULT 'fisica'
    CHECK (tipo_pessoa IN ('fisica', 'juridica'));

-- Renomeia "cpf" para "documento" (passa a servir para CPF ou CNPJ).
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
     WHERE table_name = 'socios' AND column_name = 'cpf'
  ) AND NOT EXISTS (
    SELECT 1 FROM information_schema.columns
     WHERE table_name = 'socios' AND column_name = 'documento'
  ) THEN
    ALTER TABLE socios RENAME COLUMN cpf TO documento;
    ALTER TABLE socios ALTER COLUMN documento TYPE VARCHAR(18);
  END IF;
END $$;

-- Se por algum motivo "documento" ainda não existir, garante.
ALTER TABLE socios
  ADD COLUMN IF NOT EXISTS documento VARCHAR(18);

-- ---------------------------------------------------------------------
-- 3) Migração dos dados: cada sócio antigo vira uma pessoa_acesso
--    com representação de "titular" sobre ele mesmo.
-- ---------------------------------------------------------------------
DO $$
DECLARE
  tem_senha_hash BOOLEAN;
BEGIN
  SELECT EXISTS (
    SELECT 1 FROM information_schema.columns
     WHERE table_name = 'socios' AND column_name = 'senha_hash'
  ) INTO tem_senha_hash;

  IF tem_senha_hash THEN
    -- Copia credenciais e papel de admin do socio para pessoa_acesso.
    INSERT INTO pessoas_acesso
      (id, nome, email, senha_hash, telefone, cpf, administrador,
       ativo, ultimo_login_em, created_at, updated_at)
    SELECT
      s.id, s.nome, s.email, s.senha_hash, s.telefone,
      CASE WHEN s.tipo_pessoa = 'fisica' THEN s.documento ELSE NULL END,
      s.administrador, s.ativo, s.ultimo_login_em, s.created_at, s.updated_at
      FROM socios s
    ON CONFLICT DO NOTHING;
  END IF;
END $$;

-- ---------------------------------------------------------------------
-- 4) Tabela: representacoes (vínculo pessoa ↔ sócio)
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS representacoes (
  id                            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  pessoa_acesso_id              UUID NOT NULL REFERENCES pessoas_acesso(id) ON DELETE CASCADE,
  socio_id                      UUID NOT NULL REFERENCES socios(id)         ON DELETE CASCADE,

  papel                         VARCHAR(20) NOT NULL
    CHECK (papel IN ('titular', 'representante', 'procurador')),

  -- Poderes. Default: só consulta. Aplicados pelas telas conforme a sprint.
  pode_ver_financeiro           BOOLEAN NOT NULL DEFAULT TRUE,
  pode_votar                    BOOLEAN NOT NULL DEFAULT FALSE,
  pode_aprovar_atas             BOOLEAN NOT NULL DEFAULT FALSE,
  pode_aprovar_distribuicoes    BOOLEAN NOT NULL DEFAULT FALSE,

  data_inicio                   DATE NOT NULL DEFAULT CURRENT_DATE,
  data_fim                      DATE,

  documento_procuracao_url      TEXT,
  observacoes                   TEXT,

  ativo                         BOOLEAN NOT NULL DEFAULT TRUE,

  criado_por_id                 UUID REFERENCES pessoas_acesso(id) ON DELETE SET NULL,
  revogado_em                   TIMESTAMPTZ,
  revogado_por_id               UUID REFERENCES pessoas_acesso(id) ON DELETE SET NULL,
  motivo_revogacao              TEXT,

  created_at                    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at                    TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CHECK (data_fim IS NULL OR data_fim >= data_inicio)
);

CREATE INDEX IF NOT EXISTS idx_representacoes_pessoa ON representacoes (pessoa_acesso_id);
CREATE INDEX IF NOT EXISTS idx_representacoes_socio  ON representacoes (socio_id);

-- Só pode haver UMA representação ativa entre a mesma pessoa e o mesmo sócio.
-- (Histórico fica preservado: quando revoga, marca ativo=false e pode criar nova.)
CREATE UNIQUE INDEX IF NOT EXISTS idx_representacoes_unica_ativa
  ON representacoes (pessoa_acesso_id, socio_id)
  WHERE ativo = TRUE;

-- ---------------------------------------------------------------------
-- 5) Migração: cria representação "titular" para cada sócio antigo
--    que agora tem um pessoa_acesso correspondente.
-- ---------------------------------------------------------------------
INSERT INTO representacoes
  (pessoa_acesso_id, socio_id, papel,
   pode_ver_financeiro, pode_votar, pode_aprovar_atas, pode_aprovar_distribuicoes,
   data_inicio, observacoes)
SELECT
  p.id, s.id, 'titular',
  TRUE, TRUE, TRUE, TRUE,
  COALESCE(s.data_entrada, CURRENT_DATE),
  'Representação "titular" criada automaticamente na migração para a Sprint 1.5.'
  FROM socios s
  JOIN pessoas_acesso p ON p.id = s.id
 WHERE NOT EXISTS (
   SELECT 1 FROM representacoes r
    WHERE r.pessoa_acesso_id = p.id AND r.socio_id = s.id
 );

-- ---------------------------------------------------------------------
-- 6) Agora podemos remover as colunas de login da tabela socios
-- ---------------------------------------------------------------------
ALTER TABLE socios DROP COLUMN IF EXISTS senha_hash;
ALTER TABLE socios DROP COLUMN IF EXISTS administrador;
ALTER TABLE socios DROP COLUMN IF EXISTS ultimo_login_em;

-- O e-mail do sócio deixa de ser único e passa a ser apenas um contato
-- (o login é do representante, não do sócio).
DROP INDEX IF EXISTS idx_socios_email_unico;
ALTER TABLE socios ALTER COLUMN email DROP NOT NULL;

-- ---------------------------------------------------------------------
-- 7) Tabela: log_acoes (auditoria com autoria dupla)
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS log_acoes (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  pessoa_acesso_id    UUID REFERENCES pessoas_acesso(id) ON DELETE SET NULL,
  socio_id            UUID REFERENCES socios(id)         ON DELETE SET NULL,
  acao                VARCHAR(100) NOT NULL,
  detalhes            JSONB NOT NULL DEFAULT '{}'::jsonb,
  ip                  VARCHAR(45),
  user_agent          TEXT,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_log_acoes_pessoa ON log_acoes (pessoa_acesso_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_log_acoes_socio  ON log_acoes (socio_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_log_acoes_acao   ON log_acoes (acao, created_at DESC);
