-- ===========================================================================
-- Sprint 17.1 — Múltiplos anexos em contas a pagar
-- ===========================================================================
--
-- Hoje (Sprint 7) cada conta a pagar tem campos `comprovante_*` que aguentam
-- só UM arquivo (a NF do boleto, p.ex.). Mas na prática uma conta pode
-- ter VÁRIOS: o boleto original + comprovante do banco + foto do recibo
-- físico + nota fiscal do fornecedor.
--
-- Solução: tabela `contas_pagar_anexos` (1:N) — mesmo padrão que
-- `inventario_anexos` da Sprint 17.
--
-- Os campos `comprovante_*` antigos ficam preservados (não quebra
-- código existente), mas o frontend novo usa só esta tabela.
-- ===========================================================================

BEGIN;

CREATE TABLE IF NOT EXISTS contas_pagar_anexos (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  conta_id        uuid NOT NULL REFERENCES contas_pagar(id) ON DELETE CASCADE,

  -- Tipo livre: 'boleto', 'comprovante', 'nota_fiscal', 'outro'.
  -- Não restringimos (CHECK) pra deixar admin organizar como quiser.
  tipo            text NOT NULL DEFAULT 'outro',

  -- Metadados do arquivo
  nome_original   text NOT NULL,        -- nome do arquivo que o usuário enviou
  arquivo_path    text NOT NULL,        -- caminho relativo em UPLOADS_DIR
  mime_type       text,
  tamanho_bytes   bigint,
  descricao       text,                  -- nota opcional do admin

  -- Auditoria
  enviado_por_id  uuid REFERENCES pessoas_acesso(id) ON DELETE SET NULL,
  criado_em       timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_contas_pagar_anexos_conta
  ON contas_pagar_anexos (conta_id, criado_em DESC);

COMMIT;
