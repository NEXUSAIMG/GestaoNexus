-- =====================================================================
-- Migration 005 — Sócios & Lucros (Sprint 5)
-- =====================================================================
-- Contexto:
--   Até aqui, "saídas" sempre foram contas a pagar com fornecedor em
--   texto livre. Pagamentos que vão PARA sócios (pró-labore, distribuição
--   de lucros) têm particularidades:
--     - Precisam ser amarrados ao socio_id específico (não é texto)
--     - Precisam ser agrupados em extrato anual por sócio (IR)
--     - Pró-labore tem referência a um mês específico
--     - Distribuição é em "rodada": um evento único que afeta N sócios
--
--   Por isso, movimentos para/de sócios vão em tabelas próprias:
--
--     - distribuicoes_lucros → cabeçalho de uma rodada de distribuição
--     - movimentos_socios    → cada linha que afeta um sócio
--                              (pró-labore, distribuição, aporte)
--
--   Aportes são o caminho inverso: dinheiro do sócio entrando na empresa.
--   Ficam aqui porque também amarram socio_id ↔ valor ↔ data e entram
--   no extrato do sócio.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1) distribuicoes_lucros
-- ---------------------------------------------------------------------
-- Uma rodada de distribuição: "Distribuição do 3º trimestre 2025 — R$ 60k
-- a distribuir entre os sócios". O efetivo pagamento a cada sócio vai em
-- movimentos_socios com o vínculo distribuicao_id.
CREATE TABLE IF NOT EXISTS distribuicoes_lucros (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  descricao           VARCHAR(255) NOT NULL,
  referencia_periodo  VARCHAR(50),   -- ex: "3T 2025", "2025", "out/2025"
  valor_total         NUMERIC(14,2) NOT NULL CHECK (valor_total >= 0),

  data_prevista       DATE NOT NULL,
  data_efetivada      DATE,

  status              VARCHAR(20) NOT NULL DEFAULT 'prevista'
                        CHECK (status IN ('prevista', 'efetivada', 'cancelada')),

  motivo_cancelamento TEXT,
  observacao          TEXT,

  criado_por_id       UUID REFERENCES pessoas_acesso(id) ON DELETE SET NULL,
  efetivado_por_id    UUID REFERENCES pessoas_acesso(id) ON DELETE SET NULL,
  cancelado_por_id    UUID REFERENCES pessoas_acesso(id) ON DELETE SET NULL,

  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CHECK (status <> 'efetivada' OR data_efetivada IS NOT NULL),
  CHECK (status <> 'cancelada' OR motivo_cancelamento IS NOT NULL)
);

CREATE INDEX IF NOT EXISTS idx_distribuicoes_lucros_status_data
  ON distribuicoes_lucros (status, data_prevista DESC);

-- ---------------------------------------------------------------------
-- 2) movimentos_socios
-- ---------------------------------------------------------------------
-- Unidade atômica: "a empresa pagou R$ X ao sócio Y em Z" ou vice-versa
-- (aporte). Três tipos possíveis:
--
--   'pro_labore'   → saída da empresa → sócio (mensal recorrente)
--   'distribuicao' → saída da empresa → sócio (vinculada a uma rodada)
--   'aporte'       → entrada no caixa vinda do sócio
--
-- Direção do valor é DERIVADA do tipo. O campo `valor` é sempre positivo;
-- o controller/consultas sabem interpretar.
CREATE TABLE IF NOT EXISTS movimentos_socios (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  socio_id            UUID NOT NULL REFERENCES socios(id) ON DELETE RESTRICT,

  tipo                VARCHAR(20) NOT NULL
                        CHECK (tipo IN ('pro_labore', 'distribuicao', 'aporte')),

  -- Só preenchido quando tipo = 'distribuicao'. Amarra à rodada.
  distribuicao_id     UUID REFERENCES distribuicoes_lucros(id) ON DELETE CASCADE,

  descricao           VARCHAR(255) NOT NULL,
  valor               NUMERIC(14,2) NOT NULL CHECK (valor >= 0),

  -- Fluxo de datas:
  --   data_prevista  → quando está previsto
  --   data_efetivada → preenchido quando for efetivado
  data_prevista       DATE NOT NULL,
  data_efetivada      DATE,

  status              VARCHAR(20) NOT NULL DEFAULT 'previsto'
                        CHECK (status IN ('previsto', 'efetivado', 'cancelado')),

  -- Só faz sentido em pró-labore: a competência do valor.
  -- Ex: pró-labore de outubro pago dia 05/nov → referencia_mes = '2025-10-01'.
  referencia_mes      DATE,

  -- Conta bancária que moveu o dinheiro.
  -- Saída (pro_labore/distribuicao): saldo desce.
  -- Entrada (aporte): saldo sobe.
  conta_bancaria_id   UUID REFERENCES contas_bancarias(id) ON DELETE SET NULL,
  forma_pagamento     VARCHAR(30),

  motivo_cancelamento TEXT,
  observacao          TEXT,
  comprovante_url     TEXT,

  criado_por_id       UUID REFERENCES pessoas_acesso(id) ON DELETE SET NULL,
  efetivado_por_id    UUID REFERENCES pessoas_acesso(id) ON DELETE SET NULL,
  cancelado_por_id    UUID REFERENCES pessoas_acesso(id) ON DELETE SET NULL,

  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  -- Coerência: efetivado precisa ter data_efetivada; cancelado, motivo.
  CHECK (status <> 'efetivado' OR data_efetivada IS NOT NULL),
  CHECK (status <> 'cancelado' OR motivo_cancelamento IS NOT NULL),

  -- distribuicao_id só em tipo = 'distribuicao'
  CHECK (tipo = 'distribuicao' OR distribuicao_id IS NULL),

  -- referencia_mes só faz sentido em pró-labore
  CHECK (tipo = 'pro_labore' OR referencia_mes IS NULL)
);

CREATE INDEX IF NOT EXISTS idx_movimentos_socios_socio_status
  ON movimentos_socios (socio_id, status, data_prevista DESC);

CREATE INDEX IF NOT EXISTS idx_movimentos_socios_tipo_data
  ON movimentos_socios (tipo, data_efetivada DESC)
  WHERE status = 'efetivado';

CREATE INDEX IF NOT EXISTS idx_movimentos_socios_distribuicao
  ON movimentos_socios (distribuicao_id)
  WHERE distribuicao_id IS NOT NULL;

-- Só pode existir UM pró-labore ativo por sócio e referência de mês.
-- Se precisar corrigir, cancela e cria outro.
CREATE UNIQUE INDEX IF NOT EXISTS idx_movimentos_socios_prolabore_unico
  ON movimentos_socios (socio_id, referencia_mes)
  WHERE tipo = 'pro_labore' AND status <> 'cancelado';
