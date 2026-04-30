-- ===========================================================================
-- Sprint 17 — Inventário (Patrimônio)
-- ===========================================================================
--
-- Cadastro de bens físicos da empresa: móveis, eletrônicos, TI, etc.
-- Cada item tem responsável, status, valor, histórico de movimentações
-- e anexos (NF, foto, manual).
--
-- Tabelas:
--   1. inventario_categorias  → categorias cadastráveis pelo admin
--   2. inventario_itens       → cada item físico
--   3. inventario_movimentos  → histórico (cadastro, transferência, descarte...)
--   4. inventario_anexos      → arquivos (NF, foto)
--
-- Visibilidade: todos sócios veem (transparência). Edição: só admin.
-- ===========================================================================

BEGIN;

-- ===========================================================================
-- Sequence pra gerar codigo automatico INV-0001, INV-0002...
-- ===========================================================================

CREATE SEQUENCE IF NOT EXISTS inventario_codigo_seq START 1;

-- ===========================================================================
-- 1. Categorias (cadastráveis)
-- ===========================================================================

CREATE TABLE IF NOT EXISTS inventario_categorias (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  nome            text NOT NULL,
  slug            text NOT NULL,
  cor             text NOT NULL DEFAULT 'slate'
                    CHECK (cor IN (
                      'slate', 'red', 'orange', 'amber', 'yellow',
                      'lime', 'emerald', 'teal', 'cyan', 'blue',
                      'indigo', 'violet', 'fuchsia', 'pink', 'rose'
                    )),
  icone           text,                       -- nome do ícone lucide-react (ex: 'monitor', 'sofa')
  ordem           integer NOT NULL DEFAULT 0,
  arquivada_em    timestamptz,                -- soft-archive (não deleta, só esconde)
  criado_em       timestamptz NOT NULL DEFAULT now(),
  atualizado_em   timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS uniq_inventario_categorias_slug
  ON inventario_categorias (lower(slug))
  WHERE arquivada_em IS NULL;

CREATE UNIQUE INDEX IF NOT EXISTS uniq_inventario_categorias_nome
  ON inventario_categorias (lower(nome))
  WHERE arquivada_em IS NULL;

-- Seed: categorias padrão pra ter algo logo de cara
INSERT INTO inventario_categorias (nome, slug, cor, icone, ordem) VALUES
  ('Mobília',      'mobilia',     'amber',   'sofa',     1),
  ('TI',           'ti',          'blue',    'monitor',  2),
  ('Eletrônicos',  'eletronicos', 'violet',  'tv',       3),
  ('Veículos',     'veiculos',    'red',     'car',      4),
  ('Suprimentos',  'suprimentos', 'emerald', 'package',  5),
  ('Outros',       'outros',      'slate',   'box',      6)
ON CONFLICT DO NOTHING;

-- ===========================================================================
-- 2. Itens
-- ===========================================================================

CREATE TABLE IF NOT EXISTS inventario_itens (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Código sequencial automático (INV-0001, INV-0002...)
  codigo                text NOT NULL UNIQUE
                          DEFAULT 'INV-' || LPAD(nextval('inventario_codigo_seq')::text, 4, '0'),

  nome                  text NOT NULL,
  descricao             text,
  categoria_id          uuid NOT NULL REFERENCES inventario_categorias(id) ON DELETE RESTRICT,

  -- Quantidade flexível: 1 pra item único, N pra homogêneos (10 cadeiras iguais)
  qtd                   integer NOT NULL DEFAULT 1 CHECK (qtd > 0),
  valor_unitario        numeric(12, 2) NOT NULL DEFAULT 0 CHECK (valor_unitario >= 0),
  valor_total           numeric(12, 2) GENERATED ALWAYS AS (qtd * valor_unitario) STORED,

  -- Aquisição (campos soltos pra simplicidade — sem link com contas-pagar nessa sprint)
  nf_numero             text,
  nf_serie              text,
  nf_data               date,
  nf_valor              numeric(12, 2),
  fornecedor            text,
  data_aquisicao        date,
  forma_pagamento       text  CHECK (forma_pagamento IS NULL OR forma_pagamento IN (
                          'cartao_credito', 'cartao_debito', 'pix',
                          'boleto', 'transferencia', 'dinheiro', 'outro'
                        )),

  -- Localização e responsável
  localizacao           text,                 -- texto livre: "Sala 3, mesa João"
  responsavel_id        uuid REFERENCES pessoas_acesso(id) ON DELETE SET NULL,

  -- Status do ciclo de vida
  status                text NOT NULL DEFAULT 'em_uso'
                          CHECK (status IN (
                            'em_uso',
                            'em_estoque',
                            'manutencao',
                            'descartado',
                            'vendido',
                            'perdido'
                          )),
  data_descarte         date,                 -- preenche quando vai pra descartado/vendido/perdido
  motivo_descarte       text,

  -- Garantia
  garantia_meses        integer CHECK (garantia_meses IS NULL OR garantia_meses >= 0),
  garantia_fim          date,                 -- calculado pelo controller na criacao/edicao

  -- Identificação física
  numero_serie          text,
  patrimonio_etiqueta   text,                 -- número da etiqueta colada no item

  -- Auditoria
  registrado_por_id     uuid REFERENCES pessoas_acesso(id) ON DELETE SET NULL,
  criado_em             timestamptz NOT NULL DEFAULT now(),
  atualizado_em         timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_inventario_itens_categoria
  ON inventario_itens (categoria_id);
CREATE INDEX IF NOT EXISTS idx_inventario_itens_responsavel
  ON inventario_itens (responsavel_id) WHERE responsavel_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_inventario_itens_status
  ON inventario_itens (status);
CREATE INDEX IF NOT EXISTS idx_inventario_itens_codigo
  ON inventario_itens (codigo);

-- ===========================================================================
-- 3. Movimentos (histórico)
-- ===========================================================================
-- Cada mudança relevante vira uma linha. Campos `de_*` e `para_*` capturam
-- o estado antes/depois pra renderização rica do histórico.

CREATE TABLE IF NOT EXISTS inventario_movimentos (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  item_id               uuid NOT NULL REFERENCES inventario_itens(id) ON DELETE CASCADE,

  tipo                  text NOT NULL
                          CHECK (tipo IN (
                            'cadastro',
                            'edicao',
                            'transferencia',
                            'troca_status',
                            'manutencao',
                            'descarte',
                            'anexo_adicionado',
                            'anexo_removido'
                          )),

  -- Campos antes/depois (preenchidos só nos tipos relevantes)
  de_responsavel_id     uuid REFERENCES pessoas_acesso(id) ON DELETE SET NULL,
  para_responsavel_id   uuid REFERENCES pessoas_acesso(id) ON DELETE SET NULL,
  de_localizacao        text,
  para_localizacao      text,
  de_status             text,
  para_status           text,

  observacao            text,
  -- Campos arbitrários (ex: campos editados num 'edicao'). JSON pra
  -- não criar coluna nova a cada novo tipo de movimento.
  detalhes              jsonb,

  feito_por_id          uuid REFERENCES pessoas_acesso(id) ON DELETE SET NULL,
  criado_em             timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_inventario_movimentos_item
  ON inventario_movimentos (item_id, criado_em DESC);

-- ===========================================================================
-- 4. Anexos (arquivos)
-- ===========================================================================
-- Cada item pode ter vários anexos: a NF é o principal, mas o admin pode
-- subir foto, manual, etc. O arquivo físico fica no filesystem (UPLOADS_DIR/inventario)
-- e aqui guardamos só metadados.

CREATE TABLE IF NOT EXISTS inventario_anexos (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  item_id               uuid NOT NULL REFERENCES inventario_itens(id) ON DELETE CASCADE,

  tipo                  text NOT NULL DEFAULT 'outro'
                          CHECK (tipo IN ('nf', 'foto', 'manual', 'outro')),

  arquivo_nome          text NOT NULL,        -- nome original (pra exibir no download)
  arquivo_caminho       text NOT NULL,        -- relativo a UPLOADS_DIR
  arquivo_tamanho       integer NOT NULL,     -- bytes
  arquivo_mime          text NOT NULL,

  descricao             text,                 -- opcional: "NF da compra", "manual em pdf"

  enviado_por_id        uuid REFERENCES pessoas_acesso(id) ON DELETE SET NULL,
  criado_em             timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_inventario_anexos_item
  ON inventario_anexos (item_id, tipo, criado_em DESC);

COMMIT;
