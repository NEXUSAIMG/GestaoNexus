-- ===========================================================================
-- Sprint 42 — Módulo Comercial (funil de vendas do Seu Cartório)
-- ===========================================================================
--
-- Porta para o Nexus a "Mesa Comercial" da metodologia de vendas:
--   Prospect → Em cadência → Diagnóstico → Qualificado → Trial guiado →
--   Proposta → Ganho | Perdido
--
-- Por que tabelas próprias (e não cards + campos personalizados)?
--   A apuração precisa de resultado tipado (ganho/perdido com motivo),
--   valor, datas do trial, toques da cadência e origem estruturada. Em
--   campos personalizados (jsonb livre) isso não agrega com segurança.
--   O quadro "Atividade Comercial" continua existindo; os cards dele são
--   trazidos para cá pelo importador (POST /comercial/importar-quadro),
--   que é idempotente via `origem_card_id`.
--
-- Tudo aditivo. Nenhuma tabela existente é alterada.
-- ===========================================================================

BEGIN;

-- ---------------------------------------------------------------------------
-- 1. Leads (um cartório em negociação)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS comercial_leads (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  protocolo           varchar(30) NOT NULL,

  nome                varchar(255) NOT NULL,
  segmento            varchar(60),
  cidade              varchar(100),
  uf                  varchar(2),
  contato             varchar(255),            -- titular / responsável
  telefone            varchar(60),
  email               varchar(255),

  -- Vínculos opcionais com o resto do Nexus
  cartorio_id         uuid REFERENCES cartorios(id) ON DELETE SET NULL,
  produto_cliente_id  uuid REFERENCES produtos_clientes(id) ON DELETE SET NULL,

  dono_id             uuid REFERENCES pessoas_acesso(id) ON DELETE SET NULL,

  -- prospect|cadencia|diagnostico|qualificado|trial|proposta|ganho|perdido
  etapa               varchar(20) NOT NULL DEFAULT 'prospect',
  etapa_desde         date NOT NULL DEFAULT CURRENT_DATE,
  -- Primeira data em que cada etapa foi alcançada: {"cadencia":"2026-10-12",...}
  -- Base das taxas de conversão (um lead que pulou etapa conta nas anteriores).
  marcos              jsonb NOT NULL DEFAULT '{}'::jsonb,

  -- Origem obrigatória (apuração por canal) + campanha/onda livre
  origem              varchar(30) NOT NULL,
  campanha            varchar(120),

  cadencia_inicio     date,
  trial_inicio        date,
  -- Sinais de ativação do trial: {"wa":true,"bot":false,...}
  sinais              jsonb NOT NULL DEFAULT '{}'::jsonb,

  valor_mensal        numeric(12, 2),
  motivo_perda        varchar(60),
  motivo_perda_obs    text,

  proximo_passo       text,
  proxima_data        date,
  notas               text,

  -- Rastreio do importador do quadro Kanban (idempotência)
  origem_card_id      uuid,

  criado_por_id       uuid REFERENCES pessoas_acesso(id) ON DELETE SET NULL,
  criado_em           timestamptz NOT NULL DEFAULT now(),
  atualizado_em       timestamptz NOT NULL DEFAULT now(),
  arquivado_em        timestamptz,

  CONSTRAINT comercial_leads_etapa_valida CHECK (etapa IN (
    'prospect','cadencia','diagnostico','qualificado','trial','proposta','ganho','perdido'
  )),
  CONSTRAINT comercial_leads_perdido_com_motivo CHECK (
    etapa <> 'perdido' OR motivo_perda IS NOT NULL
  )
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_comercial_leads_protocolo
  ON comercial_leads (protocolo);
CREATE UNIQUE INDEX IF NOT EXISTS uq_comercial_leads_origem_card
  ON comercial_leads (origem_card_id) WHERE origem_card_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_comercial_leads_etapa
  ON comercial_leads (etapa) WHERE arquivado_em IS NULL;
CREATE INDEX IF NOT EXISTS idx_comercial_leads_dono
  ON comercial_leads (dono_id) WHERE arquivado_em IS NULL;
CREATE INDEX IF NOT EXISTS idx_comercial_leads_proxima
  ON comercial_leads (proxima_data) WHERE arquivado_em IS NULL;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'trg_comercial_leads_atualizar_em') THEN
    CREATE TRIGGER trg_comercial_leads_atualizar_em
      BEFORE UPDATE ON comercial_leads
      FOR EACH ROW EXECUTE FUNCTION trigger_atualizar_em();
  END IF;
END $$;

-- ---------------------------------------------------------------------------
-- 2. Toques (atividade): cadência, marcos do trial e contatos avulsos
-- ---------------------------------------------------------------------------
-- Uma linha por atividade feita. `dia` = dia da cadência (1..12) quando
-- tipo='cadencia', ou dia do roteiro do trial (0..14) quando tipo='marco'.
-- `data` é o dia (fuso de Brasília) em que foi feita — base da supervisão.
CREATE TABLE IF NOT EXISTS comercial_toques (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id     uuid NOT NULL REFERENCES comercial_leads(id) ON DELETE CASCADE,
  tipo        varchar(20) NOT NULL,                 -- cadencia|marco|avulso
  dia         int,
  canal       varchar(40),
  nota        text,
  data        date NOT NULL,
  pessoa_id   uuid REFERENCES pessoas_acesso(id) ON DELETE SET NULL,
  criado_em   timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT comercial_toques_tipo_valido CHECK (tipo IN ('cadencia','marco','avulso'))
);

-- Um toque de cadência / marco por dia do roteiro
CREATE UNIQUE INDEX IF NOT EXISTS uq_comercial_toques_roteiro
  ON comercial_toques (lead_id, tipo, dia) WHERE tipo IN ('cadencia','marco');
CREATE INDEX IF NOT EXISTS idx_comercial_toques_data
  ON comercial_toques (data);
CREATE INDEX IF NOT EXISTS idx_comercial_toques_lead
  ON comercial_toques (lead_id);

-- ---------------------------------------------------------------------------
-- 3. Movimentos de etapa (histórico de-para, base da apuração por período)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS comercial_movimentos (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id     uuid NOT NULL REFERENCES comercial_leads(id) ON DELETE CASCADE,
  de_etapa    varchar(20),
  para_etapa  varchar(20) NOT NULL,
  pessoa_id   uuid REFERENCES pessoas_acesso(id) ON DELETE SET NULL,
  em          timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_comercial_movimentos_lead
  ON comercial_movimentos (lead_id, em);
CREATE INDEX IF NOT EXISTS idx_comercial_movimentos_em
  ON comercial_movimentos (em);

-- ---------------------------------------------------------------------------
-- 4. Metas por mês ('YYYY-MM'). Mês sem registro herda o último anterior.
-- ---------------------------------------------------------------------------
-- valores: {metaClientes, ticket, diasUteis, taxaContatoDiag, taxaDiagTrial,
--           taxaTrialPago, metaNovosDia, metaToquesDia,
--           novosPorPessoa: {"<pessoa_id>": 15, ...}}
CREATE TABLE IF NOT EXISTS comercial_metas (
  mes              varchar(7) PRIMARY KEY,
  valores          jsonb NOT NULL,
  atualizado_por_id uuid REFERENCES pessoas_acesso(id) ON DELETE SET NULL,
  atualizado_em    timestamptz NOT NULL DEFAULT now()
);

COMMIT;
