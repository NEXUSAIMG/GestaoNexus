-- ===========================================================================
-- Sprint 17 — Inventário (Patrimônio)
-- ===========================================================================
--
-- Quatro tabelas:
--   1. inventario_categorias   → cadastráveis pelo admin
--   2. inventario_itens        → cada item físico (código auto INV-XXXX)
--   3. inventario_movimentos   → histórico de auditoria (transferências, status, etc)
--   4. inventario_anexos       → arquivos vinculados (NF, foto, manual)
--
-- Decisões:
--   1C — quantidade livre: 1 item ou N agrupados, admin escolhe
--   2A — anexo de NF (e outros) já contemplado em inventario_anexos
--   3B — categorias cadastráveis, com seed inicial
--   4B — sem ligação com contas a pagar (campos soltos: nf, fornecedor)
--   5A — histórico completo automático em inventario_movimentos
-- ===========================================================================

BEGIN;

-- ===========================================================================
-- 1. Categorias
-- ===========================================================================

CREATE TABLE IF NOT EXISTS inventario_categorias (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  nome            text NOT NULL,
  slug            text NOT NULL,
  cor             text NOT NULL DEFAULT 'slate'
                    CHECK (cor IN (
                      'slate', 'red', 'orange', 'amber', 'yellow', 'lime',
                      'emerald', 'teal', 'cyan', 'blue', 'indigo', 'violet',
                      'fuchsia', 'pink', 'rose'
                    )),
  icone           text,                          -- nome do ícone lucide-react
  ordem           integer NOT NULL DEFAULT 0,    -- ordem manual (admin arrasta)
  arquivada_em    timestamptz,
  criado_em       timestamptz NOT NULL DEFAULT now(),
  atualizado_em   timestamptz NOT NULL DEFAULT now()
);

-- Únicos entre não-arquivadas
CREATE UNIQUE INDEX IF NOT EXISTS idx_inv_cat_nome_ativa
  ON inventario_categorias (lower(nome))
  WHERE arquivada_em IS NULL;

CREATE UNIQUE INDEX IF NOT EXISTS idx_inv_cat_slug_ativa
  ON inventario_categorias (lower(slug))
  WHERE arquivada_em IS NULL;


-- ===========================================================================
-- 2. Sequence para gerar códigos INV-0001, INV-0002...
-- ===========================================================================

CREATE SEQUENCE IF NOT EXISTS inventario_codigo_seq START 1;


-- ===========================================================================
-- 3. Itens
-- ===========================================================================

CREATE TABLE IF NOT EXISTS inventario_itens (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  codigo                text NOT NULL UNIQUE
                          DEFAULT 'INV-' || LPAD(nextval('inventario_codigo_seq')::text, 4, '0'),

  nome                  text NOT NULL,
  descricao             text,
  categoria_id          uuid NOT NULL REFERENCES inventario_categorias(id) ON DELETE RESTRICT,

  -- Quantidade (1C: livre)
  qtd                   integer NOT NULL DEFAULT 1 CHECK (qtd >= 1),
  valor_unitario        numeric(14, 2) NOT NULL DEFAULT 0 CHECK (valor_unitario >= 0),
  -- Calculado automaticamente. Mantido como coluna pra agregação rápida.
  valor_total           numeric(14, 2) GENERATED ALWAYS AS (qtd * valor_unitario) STORED,

  -- Nota fiscal (campos soltos — Sprint 17 não liga com /contas-pagar)
  nf_numero             text,
  nf_serie              text,
  nf_data               date,
  nf_valor              numeric(14, 2),
  fornecedor            text,
  data_aquisicao        date,
  forma_pagamento       text CHECK (forma_pagamento IN (
                          'cartao_credito', 'cartao_debito', 'pix',
                          'boleto', 'transferencia', 'dinheiro', 'outro'
                        )),

  -- Localização e responsável
  localizacao           text,
  responsavel_id        uuid REFERENCES pessoas_acesso(id) ON DELETE SET NULL,

  -- Status
  status                text NOT NULL DEFAULT 'em_uso'
                          CHECK (status IN (
                            'em_uso', 'em_estoque', 'manutencao',
                            'descartado', 'vendido', 'perdido'
                          )),

  -- Descarte (preenchido só quando dá baixa)
  data_descarte         date,
  motivo_descarte       text,

  -- Garantia
  garantia_meses        integer CHECK (garantia_meses IS NULL OR garantia_meses >= 0),
  garantia_fim          date,

  -- Identificação física
  numero_serie          text,                       -- serial do fabricante
  patrimonio_etiqueta   text,                       -- etiqueta colada no item

  -- Auditoria
  registrado_por_id     uuid REFERENCES pessoas_acesso(id) ON DELETE SET NULL,
  criado_em             timestamptz NOT NULL DEFAULT now(),
  atualizado_em         timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_inv_itens_categoria
  ON inventario_itens (categoria_id);

CREATE INDEX IF NOT EXISTS idx_inv_itens_responsavel
  ON inventario_itens (responsavel_id) WHERE responsavel_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_inv_itens_status
  ON inventario_itens (status);

CREATE INDEX IF NOT EXISTS idx_inv_itens_garantia_fim
  ON inventario_itens (garantia_fim) WHERE garantia_fim IS NOT NULL;

-- Etiqueta de patrimônio é única quando preenchida
CREATE UNIQUE INDEX IF NOT EXISTS idx_inv_itens_etiqueta
  ON inventario_itens (lower(patrimonio_etiqueta))
  WHERE patrimonio_etiqueta IS NOT NULL;


-- ===========================================================================
-- 4. Movimentos (histórico)
-- ===========================================================================

CREATE TABLE IF NOT EXISTS inventario_movimentos (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  item_id               uuid NOT NULL REFERENCES inventario_itens(id) ON DELETE CASCADE,

  tipo                  text NOT NULL CHECK (tipo IN (
                          'cadastro',         -- item criado
                          'edicao',           -- campos genéricos editados
                          'transferencia',    -- mudou responsável e/ou localização
                          'troca_status',     -- mudou status (não-descarte)
                          'descarte',         -- baixou (descartado/vendido/perdido)
                          'manutencao',       -- entrou ou voltou de manutenção
                          'anexo'             -- anexo adicionado/removido
                        )),

  -- "De" (estado anterior) e "Para" (estado novo) pra cada eixo
  de_responsavel_id     uuid REFERENCES pessoas_acesso(id) ON DELETE SET NULL,
  para_responsavel_id   uuid REFERENCES pessoas_acesso(id) ON DELETE SET NULL,
  de_localizacao        text,
  para_localizacao      text,
  de_status             text,
  para_status           text,

  observacao            text,
  detalhes              jsonb,    -- pra outros campos (ex: edição genérica)

  feito_por_id          uuid REFERENCES pessoas_acesso(id) ON DELETE SET NULL,
  criado_em             timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_inv_mov_item
  ON inventario_movimentos (item_id, criado_em DESC);


-- ===========================================================================
-- 5. Anexos
-- ===========================================================================

CREATE TABLE IF NOT EXISTS inventario_anexos (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  item_id         uuid NOT NULL REFERENCES inventario_itens(id) ON DELETE CASCADE,

  tipo            text NOT NULL DEFAULT 'outro'
                    CHECK (tipo IN ('nf', 'foto', 'manual', 'outro')),
  nome_original   text NOT NULL,                 -- nome do arquivo enviado
  arquivo_path    text NOT NULL,                 -- caminho relativo no UPLOADS_DIR
  mime_type       text,
  tamanho_bytes   bigint,
  descricao       text,

  enviado_por_id  uuid REFERENCES pessoas_acesso(id) ON DELETE SET NULL,
  criado_em       timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_inv_anexos_item
  ON inventario_anexos (item_id, tipo);


-- ===========================================================================
-- 6. Trigger: atualizado_em automático
-- ===========================================================================

CREATE OR REPLACE FUNCTION inventario_set_atualizado_em()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  NEW.atualizado_em := now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_inv_cat_updated ON inventario_categorias;
CREATE TRIGGER trg_inv_cat_updated
  BEFORE UPDATE ON inventario_categorias
  FOR EACH ROW EXECUTE FUNCTION inventario_set_atualizado_em();

DROP TRIGGER IF EXISTS trg_inv_itens_updated ON inventario_itens;
CREATE TRIGGER trg_inv_itens_updated
  BEFORE UPDATE ON inventario_itens
  FOR EACH ROW EXECUTE FUNCTION inventario_set_atualizado_em();


-- ===========================================================================
-- 7. Seed inicial de categorias (idempotente)
-- ===========================================================================
-- Cria categorias padrão se ainda não existem. Admin pode arquivar/editar
-- depois.

INSERT INTO inventario_categorias (nome, slug, cor, icone, ordem)
SELECT * FROM (VALUES
  ('Mobília',     'mobilia',     'amber',   'Armchair',     1),
  ('TI',          'ti',          'blue',    'Monitor',      2),
  ('Eletrônicos', 'eletronicos', 'violet',  'Tv',           3),
  ('Veículos',    'veiculos',    'slate',   'Car',          4),
  ('Suprimentos', 'suprimentos', 'emerald', 'Package',      5),
  ('Outros',      'outros',      'slate',   'Box',          99)
) AS novas(nome, slug, cor, icone, ordem)
WHERE NOT EXISTS (
  SELECT 1 FROM inventario_categorias c WHERE lower(c.slug) = lower(novas.slug)
);

COMMIT;
