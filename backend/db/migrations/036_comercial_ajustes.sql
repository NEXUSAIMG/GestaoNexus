-- ===========================================================================
-- Sprint 42D — Comercial: ajustes da varredura antes do primeiro deploy
-- ===========================================================================
--   1. Gestão comercial explícita (lista definida pelo admin), no lugar de
--      "líder de equipe com 'comercial' no nome" — nome de equipe é texto
--      livre e qualquer líder podia renomear a própria equipe.
--   2. Chaves normalizadas (nome+cidade+UF, telefone) como funções IMMUTABLE
--      com índice: a checagem de duplicidade fica igual no JS e no SQL e não
--      faz varredura da tabela inteira a cada linha importada.
--   3. CNPJ único entre leads ativos (fecha a corrida de dois cadastros
--      simultâneos do mesmo cartório).
--   4. Índices para placar e conferência do ASAAS.
-- ===========================================================================

BEGIN;

-- 1. Gestão comercial -------------------------------------------------------
CREATE TABLE IF NOT EXISTS comercial_gestores (
  pessoa_id      uuid PRIMARY KEY REFERENCES pessoas_acesso(id) ON DELETE CASCADE,
  definido_por_id uuid REFERENCES pessoas_acesso(id) ON DELETE SET NULL,
  definido_em    timestamptz NOT NULL DEFAULT now()
);

-- 2. Normalização -------------------------------------------------------------
-- Nomes qualificados com public.: CREATE INDEX roda com search_path restrito.
-- Tira acento ANTES do lower() (com collation C, lower('Ã') não muda nada);
-- minúsculas, tudo que não é [a-z0-9] vira espaço, sem bordas.
CREATE OR REPLACE FUNCTION comercial_norm(t text) RETURNS text
LANGUAGE sql IMMUTABLE PARALLEL SAFE AS $$
  SELECT btrim(regexp_replace(
           lower(translate(COALESCE(t, ''),
                     'àáâãäåèéêëìíîïòóôõöùúûüçñýÿÀÁÂÃÄÅÈÉÊËÌÍÎÏÒÓÔÕÖÙÚÛÜÇÑÝ',
                     'aaaaaaeeeeiiiiooooouuuucnyyaaaaaaeeeeiiiiooooouuuucny')),
           '[^a-z0-9]+', ' ', 'g'))
$$;

-- Telefone só com dígitos e sem DDI 55 (mesma regra de normTelefone()).
CREATE OR REPLACE FUNCTION comercial_tel(t text) RETURNS text
LANGUAGE sql IMMUTABLE PARALLEL SAFE AS $$
  SELECT regexp_replace(regexp_replace(COALESCE(t, ''), '\D', '', 'g'), '^55(\d{10,11})$', '\1')
$$;

CREATE OR REPLACE FUNCTION comercial_chave(nome text, cidade text, uf text) RETURNS text
LANGUAGE sql IMMUTABLE PARALLEL SAFE AS $$
  SELECT public.comercial_norm(nome) || '|' || public.comercial_norm(cidade) || '|' || upper(COALESCE(btrim(uf), ''))
$$;

CREATE INDEX IF NOT EXISTS idx_comercial_leads_chave
  ON comercial_leads (comercial_chave(nome, cidade, uf)) WHERE arquivado_em IS NULL;
CREATE INDEX IF NOT EXISTS idx_comercial_leads_email
  ON comercial_leads (lower(email)) WHERE arquivado_em IS NULL AND email IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_comercial_leads_tel
  ON comercial_leads (comercial_tel(telefone)) WHERE arquivado_em IS NULL AND telefone IS NOT NULL;

-- 3. CNPJ único entre ativos ---------------------------------------------------
CREATE UNIQUE INDEX IF NOT EXISTS uq_comercial_leads_cnpj_ativo
  ON comercial_leads (cnpj) WHERE cnpj IS NOT NULL AND arquivado_em IS NULL;

-- 4. Índices de apoio ------------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_comercial_leads_dono_todos ON comercial_leads (dono_id);
CREATE INDEX IF NOT EXISTS idx_cobrancas_asaas_documento ON cobrancas_asaas (cliente_documento);

COMMIT;
