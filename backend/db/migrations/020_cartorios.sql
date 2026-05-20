-- ===========================================================================
-- Sprint 20 — Cartórios + Equipe Extrajudicial (item 4 e 1.5 da spec)
-- ===========================================================================
--
-- Cartório é entidade global do sistema, não pertence a equipe específica.
-- Qualquer pessoa logada pode listar, criar, editar (decisão 5 do usuário).
--
-- Pode estar vinculado a múltiplos quadros simultaneamente, cada um com sua
-- própria "fase atual" (coluna). Isso habilita o item 1.5 da spec (cartórios
-- agrupados por fase no kanban) sem alterar a tabela cards.
--
-- Histórico é estruturado: o tipo distingue notas livres do usuário (nota,
-- contato) das mudanças automáticas logadas pelo controller (mudanca_status,
-- mudanca_fase). O campo metadados (jsonb) guarda contexto das automáticas
-- — ex: {antes: 'em_implantacao', depois: 'ativo'}.
-- ===========================================================================

BEGIN;

-- ---------------------------------------------------------------------------
-- 1. Tabela principal
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS cartorios (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  nome            varchar(255) NOT NULL,
  -- tipo: 'notas'|'imoveis'|'protesto'|'civil'|'titulos_documentos'|'outro'
  tipo            varchar(40) NOT NULL,
  cidade          varchar(100),
  uf              varchar(2),
  -- especificidades operacionais (texto livre — horário, peculiaridades, etc)
  especificidades text,
  telefone        varchar(40),
  email           varchar(255),
  -- status: 'ativo'|'em_implantacao'|'inativo'
  status          varchar(30) NOT NULL DEFAULT 'em_implantacao',
  criado_por_id   uuid REFERENCES pessoas_acesso(id) ON DELETE SET NULL,
  criado_em       timestamptz NOT NULL DEFAULT now(),
  atualizado_em   timestamptz NOT NULL DEFAULT now(),
  arquivado_em    timestamptz
);

-- ---------------------------------------------------------------------------
-- 2. Responsáveis (N:N, mesmo padrão de cards.responsaveis)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS cartorios_responsaveis (
  cartorio_id   uuid NOT NULL REFERENCES cartorios(id) ON DELETE CASCADE,
  pessoa_id     uuid NOT NULL REFERENCES pessoas_acesso(id) ON DELETE CASCADE,
  ordem         int NOT NULL DEFAULT 0,
  adicionado_em timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (cartorio_id, pessoa_id)
);

-- ---------------------------------------------------------------------------
-- 3. Vínculos com quadros (N:N — cartório pode estar em vários kanbans)
-- ---------------------------------------------------------------------------
-- coluna_id é a "fase" do cartório NAQUELE quadro. Pode ser NULL se o
-- cartório está vinculado mas ainda não foi posicionado numa coluna.
-- Se a coluna for arquivada/excluída, vira NULL (ON DELETE SET NULL).
CREATE TABLE IF NOT EXISTS cartorios_quadros (
  cartorio_id  uuid NOT NULL REFERENCES cartorios(id) ON DELETE CASCADE,
  quadro_id    uuid NOT NULL REFERENCES quadros(id) ON DELETE CASCADE,
  coluna_id    uuid REFERENCES colunas(id) ON DELETE SET NULL,
  vinculado_em timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (cartorio_id, quadro_id)
);

-- ---------------------------------------------------------------------------
-- 4. Histórico estruturado
-- ---------------------------------------------------------------------------
-- tipo:
--   'nota'            — texto livre do usuário (observação geral)
--   'contato'         — registro de contato/visita/ligação com o cartório
--   'mudanca_status'  — gerado automaticamente; metadados={antes, depois}
--   'mudanca_fase'    — gerado automaticamente; metadados={quadro_id, coluna_antes, coluna_depois}
CREATE TABLE IF NOT EXISTS cartorios_atualizacoes (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  cartorio_id uuid NOT NULL REFERENCES cartorios(id) ON DELETE CASCADE,
  pessoa_id   uuid REFERENCES pessoas_acesso(id) ON DELETE SET NULL,
  tipo        varchar(30) NOT NULL,
  texto       text,
  metadados   jsonb,
  criado_em   timestamptz NOT NULL DEFAULT now()
);

-- ---------------------------------------------------------------------------
-- Índices
-- ---------------------------------------------------------------------------
-- Listagem mais comum: WHERE arquivado_em IS NULL AND status = 'x'
CREATE INDEX IF NOT EXISTS idx_cartorios_status_ativos
  ON cartorios (status) WHERE arquivado_em IS NULL;

-- Histórico ordenado por data desc (timeline na página de detalhe)
CREATE INDEX IF NOT EXISTS idx_cartorios_atualizacoes_cartorio
  ON cartorios_atualizacoes (cartorio_id, criado_em DESC);

-- "Quais cartórios eu sou responsável" (dashboard pessoal futuro)
CREATE INDEX IF NOT EXISTS idx_cartorios_responsaveis_pessoa
  ON cartorios_responsaveis (pessoa_id);

-- "Quais cartórios aparecem neste quadro" (item 1.5)
CREATE INDEX IF NOT EXISTS idx_cartorios_quadros_quadro
  ON cartorios_quadros (quadro_id);

-- "Quais cartórios estão nesta coluna" (agrupamento no kanban)
CREATE INDEX IF NOT EXISTS idx_cartorios_quadros_coluna
  ON cartorios_quadros (coluna_id) WHERE coluna_id IS NOT NULL;

COMMIT;
