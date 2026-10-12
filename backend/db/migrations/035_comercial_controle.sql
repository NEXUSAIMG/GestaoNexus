-- ===========================================================================
-- Sprint 42B — Comercial: controle minucioso
-- ===========================================================================
--
-- Em cima do 034 (funil), passa a registrar:
--   1. RESULTADO de cada toque (atendeu, não atendeu, agendou...) e duração
--   2. REUNIÕES com data/hora e desfecho (realizada / faltou / remarcada)
--   3. DIAGNÓSTICO estruturado e META DE SUCESSO (portões de etapa)
--   4. PROPOSTAS (plano, valor, validade, desconto controlado)
--   5. ASSINADO × PAGO: ganho só conta para a meta quando o 1º pagamento entra
--   6. CNS/CNPJ para barrar duplicidade e quem já é cliente
--   7. LISTA DE NÃO CONTATAR (LGPD / descadastro)
--   8. ESTORNO no lugar de apagar toque (registro não pode ser maquiado)
--   9. HISTÓRICO CAMPO A CAMPO de cada lead
--  10. ROTINA DA GESTÃO: checagens 8h30/12h30/17h, 1:1 e planos de ação
--  11. FERIADOS no cálculo de dias úteis
--
-- Tudo aditivo.
-- ===========================================================================

BEGIN;

-- ---------------------------------------------------------------------------
-- Leads: identificação, diagnóstico, trial, pagamento
-- ---------------------------------------------------------------------------
ALTER TABLE comercial_leads ADD COLUMN IF NOT EXISTS cns            varchar(10);   -- Código Nacional da Serventia (CNJ)
ALTER TABLE comercial_leads ADD COLUMN IF NOT EXISTS cnpj           varchar(14);   -- só dígitos
-- {msgs_dia, atendentes, dor, decisor, prazo, sistema_atual, observacoes}
ALTER TABLE comercial_leads ADD COLUMN IF NOT EXISTS diagnostico    jsonb NOT NULL DEFAULT '{}'::jsonb;
ALTER TABLE comercial_leads ADD COLUMN IF NOT EXISTS meta_sucesso   text;
-- Indicação: quem indicou (lead/cliente que já é ganho) e se o mês grátis foi dado
ALTER TABLE comercial_leads ADD COLUMN IF NOT EXISTS indicado_por_id uuid REFERENCES comercial_leads(id) ON DELETE SET NULL;
ALTER TABLE comercial_leads ADD COLUMN IF NOT EXISTS recompensa_indicacao_em date;
-- Assinado (= marco 'ganho') × pago
ALTER TABLE comercial_leads ADD COLUMN IF NOT EXISTS pago_em        date;
ALTER TABLE comercial_leads ADD COLUMN IF NOT EXISTS pago_valor     numeric(12,2);
ALTER TABLE comercial_leads ADD COLUMN IF NOT EXISTS pago_fonte     varchar(20);   -- asaas | manual
ALTER TABLE comercial_leads ADD COLUMN IF NOT EXISTS pago_referencia varchar(120);
ALTER TABLE comercial_leads ADD COLUMN IF NOT EXISTS pago_confirmado_por_id uuid REFERENCES pessoas_acesso(id) ON DELETE SET NULL;
-- Arquivamento com motivo (só admin arquiva)
ALTER TABLE comercial_leads ADD COLUMN IF NOT EXISTS arquivado_motivo text;
ALTER TABLE comercial_leads ADD COLUMN IF NOT EXISTS arquivado_por_id uuid REFERENCES pessoas_acesso(id) ON DELETE SET NULL;

-- Um CNS só pode estar em um lead ativo (não arquivado)
CREATE UNIQUE INDEX IF NOT EXISTS uq_comercial_leads_cns_ativo
  ON comercial_leads (cns) WHERE cns IS NOT NULL AND arquivado_em IS NULL;
CREATE INDEX IF NOT EXISTS idx_comercial_leads_cnpj
  ON comercial_leads (cnpj) WHERE cnpj IS NOT NULL;

-- ---------------------------------------------------------------------------
-- Toques: resultado, duração, estorno
-- ---------------------------------------------------------------------------
-- resultado: atendeu | nao_atendeu | caixa_postal | numero_errado |
--            pediu_retorno | recusou | agendou | enviado | respondeu
ALTER TABLE comercial_toques ADD COLUMN IF NOT EXISTS resultado      varchar(20);
ALTER TABLE comercial_toques ADD COLUMN IF NOT EXISTS duracao_min    int;
ALTER TABLE comercial_toques ADD COLUMN IF NOT EXISTS estornado_em   timestamptz;
ALTER TABLE comercial_toques ADD COLUMN IF NOT EXISTS estornado_por_id uuid REFERENCES pessoas_acesso(id) ON DELETE SET NULL;
ALTER TABLE comercial_toques ADD COLUMN IF NOT EXISTS estorno_motivo text;

-- O índice único do roteiro passa a valer só para toques não estornados
-- (estornar e refazer o toque do mesmo dia tem que ser possível).
DROP INDEX IF EXISTS uq_comercial_toques_roteiro;
CREATE UNIQUE INDEX IF NOT EXISTS uq_comercial_toques_roteiro_vivo
  ON comercial_toques (lead_id, tipo, dia)
  WHERE tipo IN ('cadencia','marco') AND estornado_em IS NULL;

-- Movimento de etapa: justificativa quando volta etapa ou reabre perdido
ALTER TABLE comercial_movimentos ADD COLUMN IF NOT EXISTS justificativa text;

-- ---------------------------------------------------------------------------
-- Reuniões
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS comercial_reunioes (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id       uuid NOT NULL REFERENCES comercial_leads(id) ON DELETE CASCADE,
  tipo          varchar(20) NOT NULL,     -- diagnostico | ativacao | resultado | outra
  inicio        timestamptz NOT NULL,
  status        varchar(20) NOT NULL DEFAULT 'agendada', -- agendada|realizada|faltou|remarcada|cancelada
  responsavel_id uuid REFERENCES pessoas_acesso(id) ON DELETE SET NULL,
  participantes text,
  nota          text,
  desfecho_em   timestamptz,
  desfecho_por_id uuid REFERENCES pessoas_acesso(id) ON DELETE SET NULL,
  remarcada_para_id uuid REFERENCES comercial_reunioes(id) ON DELETE SET NULL,
  criado_por_id uuid REFERENCES pessoas_acesso(id) ON DELETE SET NULL,
  criado_em     timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT comercial_reunioes_tipo_valido CHECK (tipo IN ('diagnostico','ativacao','resultado','outra')),
  CONSTRAINT comercial_reunioes_status_valido CHECK (status IN ('agendada','realizada','faltou','remarcada','cancelada'))
);
CREATE INDEX IF NOT EXISTS idx_comercial_reunioes_lead ON comercial_reunioes (lead_id, inicio);
CREATE INDEX IF NOT EXISTS idx_comercial_reunioes_inicio ON comercial_reunioes (inicio);

-- ---------------------------------------------------------------------------
-- Propostas
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS comercial_propostas (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id       uuid NOT NULL REFERENCES comercial_leads(id) ON DELETE CASCADE,
  plano         varchar(120) NOT NULL,
  valor_mensal  numeric(12,2) NOT NULL CHECK (valor_mensal > 0),
  -- Única concessão permitida pela política: 1 mês grátis para ex-cliente, uma vez
  desconto      varchar(30) NOT NULL DEFAULT 'nenhum',  -- nenhum | mes_gratis_ex_cliente
  enviada_em    date NOT NULL,
  validade      date NOT NULL,
  status        varchar(20) NOT NULL DEFAULT 'enviada', -- enviada|aceita|recusada|expirada|substituida
  observacoes   text,
  criado_por_id uuid REFERENCES pessoas_acesso(id) ON DELETE SET NULL,
  criado_em     timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT comercial_propostas_desconto_valido CHECK (desconto IN ('nenhum','mes_gratis_ex_cliente')),
  CONSTRAINT comercial_propostas_status_valido CHECK (status IN ('enviada','aceita','recusada','expirada','substituida')),
  CONSTRAINT comercial_propostas_validade CHECK (validade >= enviada_em)
);
CREATE INDEX IF NOT EXISTS idx_comercial_propostas_lead ON comercial_propostas (lead_id, criado_em);

-- ---------------------------------------------------------------------------
-- Histórico campo a campo
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS comercial_alteracoes (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id    uuid NOT NULL REFERENCES comercial_leads(id) ON DELETE CASCADE,
  campo      varchar(60) NOT NULL,
  de         text,
  para       text,
  pessoa_id  uuid REFERENCES pessoas_acesso(id) ON DELETE SET NULL,
  em         timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_comercial_alteracoes_lead ON comercial_alteracoes (lead_id, em DESC);

-- ---------------------------------------------------------------------------
-- Lista de não contatar
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS comercial_nao_contatar (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tipo        varchar(10) NOT NULL,      -- email | telefone | cns | cnpj | dominio
  valor       varchar(255) NOT NULL,     -- normalizado (minúsculo / só dígitos)
  motivo      varchar(30) NOT NULL,      -- descadastro | pedido_lgpd | pediu_nao_contatar | outro
  observacao  text,
  criado_por_id uuid REFERENCES pessoas_acesso(id) ON DELETE SET NULL,
  criado_em   timestamptz NOT NULL DEFAULT now(),
  removido_em timestamptz,
  removido_por_id uuid REFERENCES pessoas_acesso(id) ON DELETE SET NULL,
  CONSTRAINT comercial_nc_tipo_valido CHECK (tipo IN ('email','telefone','cns','cnpj','dominio'))
);
CREATE UNIQUE INDEX IF NOT EXISTS uq_comercial_nc_vivo
  ON comercial_nao_contatar (tipo, valor) WHERE removido_em IS NULL;

-- ---------------------------------------------------------------------------
-- Rotina da gestão
-- ---------------------------------------------------------------------------
-- Checagem diária: gestor confirma que olhou a pessoa naquela janela.
CREATE TABLE IF NOT EXISTS comercial_checagens (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  data        date NOT NULL,
  janela      varchar(10) NOT NULL,      -- abertura | meio | fechamento
  pessoa_id   uuid NOT NULL REFERENCES pessoas_acesso(id) ON DELETE CASCADE,
  gestor_id   uuid REFERENCES pessoas_acesso(id) ON DELETE SET NULL,
  sinal       varchar(10) NOT NULL,      -- ok | warn | crit (fotografia do momento)
  indice      int,
  feitos      int,
  pendentes   int,
  observacao  text,
  criado_em   timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT comercial_checagens_janela CHECK (janela IN ('abertura','meio','fechamento'))
);
CREATE UNIQUE INDEX IF NOT EXISTS uq_comercial_checagens
  ON comercial_checagens (data, janela, pessoa_id);

CREATE TABLE IF NOT EXISTS comercial_1a1 (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  data        date NOT NULL,
  pessoa_id   uuid NOT NULL REFERENCES pessoas_acesso(id) ON DELETE CASCADE,
  gestor_id   uuid REFERENCES pessoas_acesso(id) ON DELETE SET NULL,
  numeros     jsonb NOT NULL DEFAULT '{}'::jsonb,  -- placar da semana congelado
  bloqueios   text,
  combinados  text,
  criado_em   timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_comercial_1a1_pessoa ON comercial_1a1 (pessoa_id, data DESC);

CREATE TABLE IF NOT EXISTS comercial_acoes (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  pessoa_id    uuid NOT NULL REFERENCES pessoas_acesso(id) ON DELETE CASCADE,
  um_a_um_id   uuid REFERENCES comercial_1a1(id) ON DELETE SET NULL,
  acao         text NOT NULL,
  prazo        date NOT NULL,
  status       varchar(12) NOT NULL DEFAULT 'aberta',  -- aberta | feita | cancelada
  criado_por_id uuid REFERENCES pessoas_acesso(id) ON DELETE SET NULL,
  criado_em    timestamptz NOT NULL DEFAULT now(),
  concluida_em timestamptz,
  CONSTRAINT comercial_acoes_status CHECK (status IN ('aberta','feita','cancelada'))
);
CREATE INDEX IF NOT EXISTS idx_comercial_acoes_pessoa ON comercial_acoes (pessoa_id, status);

-- ---------------------------------------------------------------------------
-- Feriados (dias úteis da cadência e das metas)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS comercial_feriados (
  data  date PRIMARY KEY,
  nome  varchar(120) NOT NULL,
  abrangencia varchar(20) NOT NULL DEFAULT 'nacional'   -- nacional | estadual | municipal | empresa
);

INSERT INTO comercial_feriados (data, nome, abrangencia) VALUES
  ('2026-01-01','Confraternização Universal','nacional'),
  ('2026-02-16','Carnaval','nacional'),
  ('2026-02-17','Carnaval','nacional'),
  ('2026-04-03','Sexta-feira Santa','nacional'),
  ('2026-04-21','Tiradentes','nacional'),
  ('2026-05-01','Dia do Trabalho','nacional'),
  ('2026-06-04','Corpus Christi','nacional'),
  ('2026-08-15','Adesão do Pará','estadual'),
  ('2026-09-07','Independência','nacional'),
  ('2026-10-12','Nossa Senhora Aparecida','nacional'),
  ('2026-11-02','Finados','nacional'),
  ('2026-11-15','Proclamação da República','nacional'),
  ('2026-11-20','Consciência Negra','nacional'),
  ('2026-12-25','Natal','nacional'),
  ('2027-01-01','Confraternização Universal','nacional'),
  ('2027-02-08','Carnaval','nacional'),
  ('2027-02-09','Carnaval','nacional'),
  ('2027-03-26','Sexta-feira Santa','nacional'),
  ('2027-04-21','Tiradentes','nacional'),
  ('2027-05-01','Dia do Trabalho','nacional'),
  ('2027-05-27','Corpus Christi','nacional'),
  ('2027-08-15','Adesão do Pará','estadual'),
  ('2027-09-07','Independência','nacional'),
  ('2027-10-12','Nossa Senhora Aparecida','nacional'),
  ('2027-11-02','Finados','nacional'),
  ('2027-11-15','Proclamação da República','nacional'),
  ('2027-11-20','Consciência Negra','nacional'),
  ('2027-12-25','Natal','nacional')
ON CONFLICT (data) DO NOTHING;

COMMIT;
