-- ===========================================================================
-- Sprint 7 — Polimento (notificações, e-mails, comprovantes)
-- ===========================================================================
--
-- Cobre:
--   1. Notificações in-app (sino) — uma linha por (pessoa, evento)
--   2. Auditoria de e-mails enviados (via Resend) — fica útil pra debug
--   3. Configurações da empresa para ligar/desligar avisos por e-mail
--   4. Campos de comprovante (filesystem) em movimentos_socios e contas_pagar
--      Os campos `comprovante_url` (link externo) que já existem ficam
--      preservados — quem quiser pode usar os dois ao mesmo tempo.
-- ===========================================================================

BEGIN;

-- ---------------------------------------------------------------------------
-- 1. Notificações in-app
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS notificacoes (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  pessoa_id       uuid NOT NULL REFERENCES pessoas_acesso(id) ON DELETE CASCADE,

  -- Tipo livre (ex: 'governanca.documento_em_aprovacao'). Só pra log/filtro.
  tipo            text NOT NULL,

  titulo          text NOT NULL,
  descricao       text,

  -- URL relativa do frontend (ex: '/governanca/atas'). null = não clicável.
  link            text,

  -- Bagagem opcional pra debug ou pra UI mostrar mais detalhe.
  -- Ex: { documento_id, voto, etc }
  contexto        jsonb,

  lida            boolean NOT NULL DEFAULT FALSE,
  criada_em       timestamptz NOT NULL DEFAULT now(),
  lida_em         timestamptz
);

CREATE INDEX IF NOT EXISTS idx_notificacoes_pessoa_lida
  ON notificacoes (pessoa_id, lida, criada_em DESC);

CREATE INDEX IF NOT EXISTS idx_notificacoes_tipo
  ON notificacoes (tipo);

-- ---------------------------------------------------------------------------
-- 2. Auditoria de e-mails enviados
-- ---------------------------------------------------------------------------
-- Guarda toda tentativa (sucesso ou falha) de envio. Útil pra debugar
-- "por que o sócio X não recebeu o aviso" sem precisar do dashboard do Resend.
CREATE TABLE IF NOT EXISTS emails_enviados (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),

  -- A quem deveria ir
  pessoa_id        uuid REFERENCES pessoas_acesso(id) ON DELETE SET NULL,
  destinatario     text NOT NULL,

  -- O que foi
  assunto          text NOT NULL,
  template         text,            -- nome do template (ex: 'voto_pendente')

  -- Status do envio
  status           text NOT NULL CHECK (status IN ('pendente', 'enviado', 'falhou', 'pulado_sem_config')),
  erro             text,            -- mensagem do erro (status='falhou')

  -- Bagagem útil pra debug
  contexto         jsonb,

  -- ID retornado pela Resend (pra rastrear depois)
  provedor_id      text,

  criado_em        timestamptz NOT NULL DEFAULT now(),
  enviado_em       timestamptz
);

CREATE INDEX IF NOT EXISTS idx_emails_enviados_pessoa
  ON emails_enviados (pessoa_id, criado_em DESC);

CREATE INDEX IF NOT EXISTS idx_emails_enviados_status
  ON emails_enviados (status, criado_em DESC);

-- ---------------------------------------------------------------------------
-- 3. Configurações de notificações (singleton — sempre id=1)
-- ---------------------------------------------------------------------------
-- Permite ao admin desligar avisos específicos sem mexer no código.
-- Usamos a mesma estratégia de configuracoes_financeiras (Sprint 3).
CREATE TABLE IF NOT EXISTS configuracoes_notificacoes (
  id                                          int PRIMARY KEY DEFAULT 1 CHECK (id = 1),

  -- Avisos por e-mail
  email_voto_pendente                         boolean NOT NULL DEFAULT TRUE,
  email_documento_finalizado                  boolean NOT NULL DEFAULT TRUE,
  email_movimento_socio_criado                boolean NOT NULL DEFAULT TRUE,
  email_distribuicao_criada                   boolean NOT NULL DEFAULT TRUE,
  email_resumo_diario_admin                   boolean NOT NULL DEFAULT TRUE,

  -- Quantos dias antes do vencimento avisar (admin) sobre contas a pagar
  dias_aviso_conta_vencendo                   int NOT NULL DEFAULT 3 CHECK (dias_aviso_conta_vencendo BETWEEN 1 AND 30),

  -- Quantos dias antes do vencimento avisar sobre movimentos de sócios previstos
  dias_aviso_movimento_socio_vencendo         int NOT NULL DEFAULT 1 CHECK (dias_aviso_movimento_socio_vencendo BETWEEN 1 AND 30),

  atualizado_em                               timestamptz NOT NULL DEFAULT now(),
  atualizado_por_id                           uuid REFERENCES pessoas_acesso(id)
);

INSERT INTO configuracoes_notificacoes (id) VALUES (1)
ON CONFLICT (id) DO NOTHING;

-- ---------------------------------------------------------------------------
-- 4. Campos de comprovante em movimentos_socios e contas_pagar
-- ---------------------------------------------------------------------------
-- O campo `comprovante_url` que já existe nessas tabelas era pensado pra
-- link externo (ex: PDF de extrato no banco). Aqui adicionamos os campos
-- pra arquivo guardado no filesystem (com a mesma estratégia da Sprint 6).
ALTER TABLE movimentos_socios
  ADD COLUMN IF NOT EXISTS comprovante_nome     text,
  ADD COLUMN IF NOT EXISTS comprovante_caminho  text,
  ADD COLUMN IF NOT EXISTS comprovante_tamanho  bigint,
  ADD COLUMN IF NOT EXISTS comprovante_mime     text;

ALTER TABLE contas_pagar
  ADD COLUMN IF NOT EXISTS comprovante_nome     text,
  ADD COLUMN IF NOT EXISTS comprovante_caminho  text,
  ADD COLUMN IF NOT EXISTS comprovante_tamanho  bigint,
  ADD COLUMN IF NOT EXISTS comprovante_mime     text;

-- Trigger pra atualizar `atualizado_em` automaticamente em
-- configuracoes_notificacoes. Usa a função padrão do projeto.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger
     WHERE tgname = 'trg_configuracoes_notificacoes_atualizar_em'
  ) THEN
    CREATE TRIGGER trg_configuracoes_notificacoes_atualizar_em
      BEFORE UPDATE ON configuracoes_notificacoes
      FOR EACH ROW EXECUTE FUNCTION trigger_atualizar_em();
  END IF;
END $$;

COMMIT;
