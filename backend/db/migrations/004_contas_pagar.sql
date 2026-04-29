-- =====================================================================
-- Migration 004 — Contas a pagar + fluxo de caixa (Sprint 3)
-- =====================================================================
-- Contexto:
--   Sprint 2 entregou o lado das ENTRADAS (via ASAAS). Agora fechamos
--   o outro lado: SAÍDAS, para que o painel mostre "fluxo de caixa
--   completo" — entradas menos saídas, com saldo projetado dia a dia
--   e alerta quando o saldo previsto ficar abaixo de um mínimo.
--
--   Três tabelas novas:
--     - categorias_despesa       → tipo de gasto (aluguel, salários, etc.)
--     - contas_pagar             → cada conta que a empresa precisa pagar
--     - configuracoes_financeiras → singleton (1 linha) com caixa_minimo
--
--   Escopo enxuto proposital:
--     - Fornecedor é texto livre (sem tabela separada por ora)
--     - Uma conta = um pagamento (sem parcial)
--     - Recorrência fica para sprint futura; agora é cadastro manual
--     - Anexo é URL (upload de arquivos só na Sprint 6)
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1) categorias_despesa
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS categorias_despesa (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  nome         VARCHAR(100) NOT NULL,
  cor          VARCHAR(20) NOT NULL DEFAULT 'slate'
                CHECK (cor IN (
                  'slate', 'red', 'orange', 'amber', 'yellow',
                  'lime', 'emerald', 'teal', 'cyan', 'blue',
                  'indigo', 'violet', 'fuchsia', 'pink', 'rose'
                )),
  descricao    TEXT,
  ordem        SMALLINT NOT NULL DEFAULT 0,
  ativo        BOOLEAN NOT NULL DEFAULT TRUE,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Nome único (ignorando caixa) dentro das ativas.
-- Permite "reciclar" o nome depois de inativar uma categoria antiga.
CREATE UNIQUE INDEX IF NOT EXISTS idx_categorias_despesa_nome_ativa
  ON categorias_despesa (lower(nome))
  WHERE ativo = TRUE;

CREATE INDEX IF NOT EXISTS idx_categorias_despesa_ordem
  ON categorias_despesa (ativo DESC, ordem, nome);

-- ---------------------------------------------------------------------
-- 2) contas_pagar
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS contas_pagar (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Identificação do que está sendo pago
  descricao           VARCHAR(255) NOT NULL,
  fornecedor_nome     VARCHAR(255),
  fornecedor_documento VARCHAR(20),  -- CPF/CNPJ, só dígitos ou formatado
  categoria_id        UUID REFERENCES categorias_despesa(id) ON DELETE SET NULL,

  -- Valores e datas
  valor               NUMERIC(14,2) NOT NULL CHECK (valor >= 0),
  data_vencimento     DATE NOT NULL,

  -- Status:
  --   'pendente'  → ainda não paga (se data_vencimento < hoje é "atrasada",
  --                 mas esse é um estado derivado — não gravamos no banco)
  --   'paga'      → foi quitada
  --   'cancelada' → descartada sem pagamento (errada, duplicada, etc.)
  status              VARCHAR(20) NOT NULL DEFAULT 'pendente'
                        CHECK (status IN ('pendente', 'paga', 'cancelada')),

  -- Preenchidos quando paga
  data_pagamento      DATE,
  valor_pago          NUMERIC(14,2) CHECK (valor_pago IS NULL OR valor_pago >= 0),
  forma_pagamento     VARCHAR(30),   -- 'pix', 'boleto', 'ted', 'cartao', 'dinheiro', 'debito_automatico'
  conta_bancaria_id   UUID REFERENCES contas_bancarias(id) ON DELETE SET NULL,

  -- Preenchidos quando cancelada
  motivo_cancelamento TEXT,

  comprovante_url     TEXT,
  observacoes         TEXT,

  -- Auditoria
  criado_por_id       UUID REFERENCES pessoas_acesso(id) ON DELETE SET NULL,
  pago_por_id         UUID REFERENCES pessoas_acesso(id) ON DELETE SET NULL,
  cancelado_por_id    UUID REFERENCES pessoas_acesso(id) ON DELETE SET NULL,

  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  -- Coerência: se paga, precisa ter data_pagamento; se cancelada, precisa de motivo.
  CHECK (status <> 'paga'      OR data_pagamento IS NOT NULL),
  CHECK (status <> 'cancelada' OR motivo_cancelamento IS NOT NULL)
);

-- Índices pensando nas queries do fluxo de caixa.
CREATE INDEX IF NOT EXISTS idx_contas_pagar_status_vencimento
  ON contas_pagar (status, data_vencimento);

CREATE INDEX IF NOT EXISTS idx_contas_pagar_data_pagamento
  ON contas_pagar (data_pagamento DESC)
  WHERE status = 'paga';

CREATE INDEX IF NOT EXISTS idx_contas_pagar_categoria
  ON contas_pagar (categoria_id);

CREATE INDEX IF NOT EXISTS idx_contas_pagar_conta_bancaria
  ON contas_pagar (conta_bancaria_id)
  WHERE conta_bancaria_id IS NOT NULL;

-- ---------------------------------------------------------------------
-- 3) configuracoes_financeiras (singleton)
-- ---------------------------------------------------------------------
-- Uma única linha, fixada pelo id 1. Guarda configurações globais do
-- módulo financeiro. Hoje só caixa mínimo; no futuro: moeda, arredondamento,
-- política de distribuição, etc.
CREATE TABLE IF NOT EXISTS configuracoes_financeiras (
  id                      SMALLINT PRIMARY KEY DEFAULT 1
                            CHECK (id = 1),
  caixa_minimo            NUMERIC(14,2) NOT NULL DEFAULT 0
                            CHECK (caixa_minimo >= 0),
  caixa_minimo_observacao TEXT,
  atualizado_por_id       UUID REFERENCES pessoas_acesso(id) ON DELETE SET NULL,
  updated_at              TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Garante a linha singleton — se já existir, nada acontece.
INSERT INTO configuracoes_financeiras (id, caixa_minimo)
VALUES (1, 0)
ON CONFLICT (id) DO NOTHING;

-- ---------------------------------------------------------------------
-- 4) Categorias padrão (sugestões iniciais para facilitar o primeiro uso)
-- ---------------------------------------------------------------------
-- Só cria se a tabela ainda estiver vazia, pra não duplicar em re-execução.
INSERT INTO categorias_despesa (nome, cor, ordem)
SELECT * FROM (VALUES
  ('Folha de pagamento',  'blue',    10),
  ('Pró-labore',          'indigo',  20),
  ('Impostos',            'red',     30),
  ('Aluguel',             'amber',   40),
  ('Serviços públicos',   'yellow',  50),
  ('Software e assinaturas', 'violet', 60),
  ('Marketing',           'pink',    70),
  ('Fornecedores',        'slate',   80),
  ('Outras despesas',     'slate',   99)
) AS v(nome, cor, ordem)
WHERE NOT EXISTS (SELECT 1 FROM categorias_despesa);
