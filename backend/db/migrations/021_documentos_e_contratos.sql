-- ===========================================================================
-- Sprint 21 — Governança: Documentos da empresa + Contratos
-- ===========================================================================
--
-- Duas tabelas novas independentes da estrutura de governança existente
-- (atas/decisões/contrato social), pra separar conceitos:
--
--   documentos_empresa: docs institucionais que não são atas nem decisões
--     formais (estatuto consolidado, regimento, alvarás, certidões, políticas
--     internas, procurações etc). Decisão da spec: qualquer logado vê e
--     baixa; escrita só admin (padrão do módulo governança).
--
--   contratos: contratos com terceiros (clientes, fornecedores, parceiros).
--     Tem aviso de vencimento calculado no GET (data_fim vs hoje + alerta_antes_dias).
-- ===========================================================================

BEGIN;

-- ---------------------------------------------------------------------------
-- 1. Documentos institucionais da empresa
-- ---------------------------------------------------------------------------
-- categoria é varchar livre. Sugestões da UI: estatuto, regimento, certidao,
-- alvara, politica, procuracao, outro. Sem enum no banco pra permitir
-- evolução sem migration.
CREATE TABLE IF NOT EXISTS documentos_empresa (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  titulo          varchar(255) NOT NULL,
  descricao       text,
  categoria       varchar(50) NOT NULL,
  -- Arquivo (caminho relativo ao UPLOADS_DIR, mesmo padrão de governança)
  arquivo_path    varchar(500),
  arquivo_nome    varchar(255),   -- nome original do upload (pra download bonito)
  arquivo_mime    varchar(100),
  arquivo_tamanho integer,
  criado_por_id   uuid REFERENCES pessoas_acesso(id) ON DELETE SET NULL,
  criado_em       timestamptz NOT NULL DEFAULT now(),
  atualizado_em   timestamptz NOT NULL DEFAULT now(),
  arquivado_em    timestamptz
);

CREATE INDEX IF NOT EXISTS idx_documentos_empresa_categoria
  ON documentos_empresa (categoria) WHERE arquivado_em IS NULL;

-- ---------------------------------------------------------------------------
-- 2. Contratos com terceiros
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS contratos (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  titulo                varchar(255) NOT NULL,
  descricao             text,
  -- Contraparte
  contraparte_nome      varchar(255) NOT NULL,
  contraparte_documento varchar(40),   -- CPF (11) ou CNPJ (14), formatado livre
  contraparte_tipo      varchar(20),   -- 'pf' | 'pj' (opcional)
  -- Valor financeiro (opcional — alguns contratos não têm valor mensurável)
  valor                 numeric(14, 2),
  moeda                 varchar(3) DEFAULT 'BRL',
  periodicidade         varchar(30),   -- 'mensal' | 'anual' | 'unico' | 'outro'
  -- Vigência
  data_inicio           date NOT NULL,
  data_fim              date,          -- NULL = sem prazo (indeterminado)
  status                varchar(30) NOT NULL DEFAULT 'vigente',
  -- 'vigente' | 'encerrado' | 'em_negociacao' | 'cancelado'
  -- Configuração do aviso de vencimento (calculado no GET, não há cron)
  alerta_antes_dias     int NOT NULL DEFAULT 30,
  -- Arquivo principal (1 arquivo; histórico de versões fica pra futuro)
  arquivo_path          varchar(500),
  arquivo_nome          varchar(255),
  arquivo_mime          varchar(100),
  arquivo_tamanho       integer,
  -- Auditoria
  criado_por_id         uuid REFERENCES pessoas_acesso(id) ON DELETE SET NULL,
  criado_em             timestamptz NOT NULL DEFAULT now(),
  atualizado_em         timestamptz NOT NULL DEFAULT now(),
  arquivado_em          timestamptz
);

-- Filtros mais comuns na listagem
CREATE INDEX IF NOT EXISTS idx_contratos_status
  ON contratos (status) WHERE arquivado_em IS NULL;

-- Ordenação por proximidade do vencimento (vigentes apenas)
CREATE INDEX IF NOT EXISTS idx_contratos_data_fim
  ON contratos (data_fim)
  WHERE arquivado_em IS NULL AND status = 'vigente' AND data_fim IS NOT NULL;

COMMIT;
