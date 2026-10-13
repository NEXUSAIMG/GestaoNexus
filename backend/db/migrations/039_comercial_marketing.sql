-- ===========================================================================
-- Sprint 42I — Marketing no Comercial
-- ===========================================================================
-- Calendário das ações de marketing (post, congresso, webinar, e-mail...)
-- com o resultado no funil. A ligação ação → cartório é a CAMPANHA: o lead
-- que chegou por uma ação leva o código da campanha dela (comercial_leads.
-- campanha), e a aba Marketing conta cartórios, reuniões, propostas e
-- clientes por ação. Também guarda as datas importantes (congressos,
-- fim de condição especial...).
-- Tudo aditivo.
-- ===========================================================================

BEGIN;

CREATE TABLE IF NOT EXISTS comercial_mkt_acoes (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  titulo            varchar(200) NOT NULL,
  canal             varchar(30) NOT NULL,
  data              date NOT NULL,
  status            varchar(15) NOT NULL DEFAULT 'planejada',
  responsavel_id    uuid REFERENCES pessoas_acesso(id) ON DELETE SET NULL,
  -- quem não tem acesso ao Nexus (ex.: "Sócio", agência)
  responsavel_texto varchar(80),
  -- código que liga a ação aos cartórios (comercial_leads.campanha)
  campanha          varchar(120) NOT NULL,
  custo             numeric(12, 2) NOT NULL DEFAULT 0,
  horas             numeric(6, 2),
  notas             text,
  -- o que aconteceu (alcance, inscritos, conversas no estande...)
  resultado         text,
  feita_em          date,
  criado_por_id     uuid REFERENCES pessoas_acesso(id) ON DELETE SET NULL,
  criado_em         timestamptz NOT NULL DEFAULT now(),
  atualizado_em     timestamptz NOT NULL DEFAULT now(),
  arquivado_em      timestamptz,
  CONSTRAINT comercial_mkt_acoes_status CHECK (status IN ('planejada','em_andamento','feita','adiada','cancelada')),
  CONSTRAINT comercial_mkt_acoes_custo CHECK (custo >= 0)
);
CREATE INDEX IF NOT EXISTS idx_comercial_mkt_acoes_data
  ON comercial_mkt_acoes (data) WHERE arquivado_em IS NULL;
CREATE INDEX IF NOT EXISTS idx_comercial_mkt_acoes_campanha
  ON comercial_mkt_acoes (lower(campanha)) WHERE arquivado_em IS NULL;
CREATE INDEX IF NOT EXISTS idx_comercial_leads_campanha
  ON comercial_leads (lower(campanha)) WHERE campanha IS NOT NULL AND arquivado_em IS NULL;

CREATE TABLE IF NOT EXISTS comercial_mkt_datas (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  titulo        varchar(120) NOT NULL,
  data          date NOT NULL,
  nota          varchar(200),
  criado_por_id uuid REFERENCES pessoas_acesso(id) ON DELETE SET NULL,
  criado_em     timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_comercial_mkt_datas_data ON comercial_mkt_datas (data);

COMMIT;
