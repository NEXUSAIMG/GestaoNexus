-- ===========================================================================
-- Sprint 16 — Portfólio de produtos da Nexus
-- ===========================================================================
--
-- Cada produto da Nexus (atualmente: Seu Cartório; depois: outros) tem:
--   1. produtos                    → cabeçalho (nome, descrição, links)
--   2. produtos_metricas_mensais   → snapshot mensal (MRR, clientes, churn...)
--   3. produtos_clientes           → lista nominal de clientes
--   4. produtos_roadmap            → features previstas/lançadas
--
-- Visibilidade: todos os autenticados veem (transparência pros sócios).
-- Edição: só admin.
--
-- Modelo "fonte_dados" no produto: 'manual' (admin cadastra) ou um
-- identificador de integração (ex: 'seu_cartorio') pra Fase B onde um
-- cron sincroniza periodicamente. Nesta sprint, tudo é 'manual'.
-- ===========================================================================

BEGIN;

-- ===========================================================================
-- 1. Produtos
-- ===========================================================================

CREATE TABLE IF NOT EXISTS produtos (
  id                      uuid PRIMARY KEY DEFAULT gen_random_uuid(),

  nome                    text NOT NULL,
  slug                    text NOT NULL,                    -- pra URLs amigáveis (futuro)
  descricao_curta         text,                              -- uma linha pro card
  descricao_longa         text,                              -- markdown na página de detalhe

  status                  text NOT NULL DEFAULT 'ativo'
                            CHECK (status IN (
                              'em_desenvolvimento',
                              'beta',
                              'ativo',
                              'descontinuado'
                            )),

  -- Visual
  cor                     text NOT NULL DEFAULT 'blue'
                            CHECK (cor IN (
                              'slate', 'red', 'orange', 'amber', 'yellow',
                              'lime', 'emerald', 'teal', 'cyan', 'blue',
                              'indigo', 'violet', 'fuchsia', 'pink', 'rose'
                            )),
  logo_url                text,

  -- Links externos
  link_site               text,                              -- site institucional
  link_app                text,                              -- onde clientes logam
  link_landing            text,                              -- landing de vendas

  -- Dados negócio
  data_lancamento         date,
  equipe_responsavel_id   uuid REFERENCES equipes(id) ON DELETE SET NULL,

  -- Fonte de dados das métricas
  -- 'manual' = admin atualiza pela UI
  -- 'seu_cartorio' (e outros futuros) = sync automático (Fase B)
  fonte_dados             text NOT NULL DEFAULT 'manual',

  -- Quando o sync foi rodado pela última vez (pra Fase B)
  sincronizado_em         timestamptz,

  arquivado_em            timestamptz,

  criado_por_id           uuid REFERENCES pessoas_acesso(id) ON DELETE SET NULL,
  criado_em               timestamptz NOT NULL DEFAULT now(),
  atualizado_em           timestamptz NOT NULL DEFAULT now()
);

-- Slug único entre não-arquivados (permite reciclar slug se arquivar)
CREATE UNIQUE INDEX IF NOT EXISTS idx_produtos_slug_ativo
  ON produtos (lower(slug))
  WHERE arquivado_em IS NULL;

-- Nome único entre não-arquivados (mesma lógica)
CREATE UNIQUE INDEX IF NOT EXISTS idx_produtos_nome_ativo
  ON produtos (lower(nome))
  WHERE arquivado_em IS NULL;

CREATE INDEX IF NOT EXISTS idx_produtos_status
  ON produtos (status) WHERE arquivado_em IS NULL;


-- ===========================================================================
-- 2. Métricas mensais
-- ===========================================================================
-- Uma linha por produto x mês. UPSERT no save.

CREATE TABLE IF NOT EXISTS produtos_metricas_mensais (
  id                      uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  produto_id              uuid NOT NULL REFERENCES produtos(id) ON DELETE CASCADE,
  mes                     date NOT NULL,                    -- sempre dia 1 do mês

  -- Receita
  mrr                     numeric(12, 2) NOT NULL DEFAULT 0,    -- receita recorrente fim do mês
  receita_total           numeric(12, 2) NOT NULL DEFAULT 0,    -- total faturado no mês (recorrente + setup + extras)

  -- Clientes
  clientes_ativos         integer NOT NULL DEFAULT 0,           -- contagem fim do mês
  novos_clientes          integer NOT NULL DEFAULT 0,           -- entraram no mês
  churn_clientes          integer NOT NULL DEFAULT 0,           -- saíram no mês
  churn_mrr               numeric(12, 2) NOT NULL DEFAULT 0,    -- MRR perdido por churn no mês

  -- Suporte
  tickets_abertos         integer NOT NULL DEFAULT 0,           -- chamados criados no mês
  tickets_resolvidos      integer NOT NULL DEFAULT 0,

  -- Conversão (funil de vendas)
  visitantes_landing      integer NOT NULL DEFAULT 0,
  trials_iniciados        integer NOT NULL DEFAULT 0,
  conversoes              integer NOT NULL DEFAULT 0,           -- trials → pagantes

  observacao              text,

  criado_em               timestamptz NOT NULL DEFAULT now(),
  atualizado_em           timestamptz NOT NULL DEFAULT now(),

  -- Trava: o "mes" sempre é o primeiro dia (pra alinhar comparações)
  CONSTRAINT mes_eh_primeiro_dia CHECK (EXTRACT(DAY FROM mes) = 1),

  UNIQUE (produto_id, mes)
);

CREATE INDEX IF NOT EXISTS idx_produtos_metricas_produto_mes
  ON produtos_metricas_mensais (produto_id, mes DESC);


-- ===========================================================================
-- 3. Clientes nominais
-- ===========================================================================
-- Lista de clientes individuais com plano, valor, status. Útil pra ter
-- a "tabela nominal" do produto na tela de detalhe.

CREATE TABLE IF NOT EXISTS produtos_clientes (
  id                      uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  produto_id              uuid NOT NULL REFERENCES produtos(id) ON DELETE CASCADE,

  -- Identificação
  nome                    text NOT NULL,
  documento               text,                              -- CNPJ ou CPF
  email                   text,
  telefone                text,

  -- Plano e cobrança
  plano                   text,                              -- texto livre: "Básico", "Pro Anual" etc
  valor_mensal            numeric(12, 2),

  -- Ciclo
  data_inicio             date,
  data_fim                date,                              -- null = ativo
  status                  text NOT NULL DEFAULT 'ativo'
                            CHECK (status IN (
                              'trial',
                              'ativo',
                              'pausado',
                              'cancelado',
                              'inadimplente'
                            )),

  -- Origem (de onde veio): vendedor, marketing, indicação, etc
  origem                  text,

  observacao              text,

  -- Identificador externo (id do cliente no SeuCartorio etc) — pra sync da Fase B
  externo_id              text,

  criado_em               timestamptz NOT NULL DEFAULT now(),
  atualizado_em           timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_produtos_clientes_produto
  ON produtos_clientes (produto_id, status);

CREATE INDEX IF NOT EXISTS idx_produtos_clientes_externo
  ON produtos_clientes (produto_id, externo_id)
  WHERE externo_id IS NOT NULL;


-- ===========================================================================
-- 4. Roadmap
-- ===========================================================================

CREATE TABLE IF NOT EXISTS produtos_roadmap (
  id                      uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  produto_id              uuid NOT NULL REFERENCES produtos(id) ON DELETE CASCADE,

  titulo                  text NOT NULL,
  descricao               text,

  status                  text NOT NULL DEFAULT 'planejado'
                            CHECK (status IN (
                              'planejado',
                              'em_desenvolvimento',
                              'em_teste',
                              'lancado',
                              'cancelado'
                            )),

  prioridade              text NOT NULL DEFAULT 'media'
                            CHECK (prioridade IN ('baixa', 'media', 'alta')),

  data_prevista           date,                              -- estimativa
  data_lancamento         date,                              -- preenche ao lançar

  -- Link opcional pra um card no /tarefas (pra fechar o ciclo)
  card_id                 uuid REFERENCES cards(id) ON DELETE SET NULL,

  ordem                   integer NOT NULL DEFAULT 0,

  criado_por_id           uuid REFERENCES pessoas_acesso(id) ON DELETE SET NULL,
  criado_em               timestamptz NOT NULL DEFAULT now(),
  atualizado_em           timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_produtos_roadmap_produto
  ON produtos_roadmap (produto_id, status, ordem);


-- ===========================================================================
-- 5. Seed: cria o produto "Seu Cartório" se ainda não existir
-- ===========================================================================
-- Idempotente.

INSERT INTO produtos (
  nome, slug, descricao_curta, descricao_longa,
  status, cor, link_site, fonte_dados
)
SELECT
  'Seu Cartório', 'seu-cartorio',
  'SaaS multi-tenant para automação de atendimento em cartórios via WhatsApp.',
  E'Plataforma SaaS para cartórios brasileiros. Automatiza atendimento via WhatsApp com chatbots inteligentes (Botpress).\n\n**Stack:** Node.js + Prisma + Next.js + MySQL.\n\n**Status atual:** produção, integrações ASAAS, Botpress Cloud e WhatsApp Business em operação.',
  'ativo', 'blue',
  'https://www.seucartorio.com.br',
  'manual'  -- vira 'seu_cartorio' quando ligarmos a Fase B
WHERE NOT EXISTS (
  SELECT 1 FROM produtos WHERE lower(slug) = 'seu-cartorio'
);

COMMIT;
