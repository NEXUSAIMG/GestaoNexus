-- Sprint 43 — Frente AdaptAI no Comercial (venda B2B para escolas, foco em TEA).
--
-- Funil próprio, separado do Seu Cartório: escolas (particulares, filantrópicas,
-- públicas), redes públicas (SEMEC/SEDUC/CAEE) e canais indicadores (clínicas,
-- terapeutas, associações). Método: diagnóstico → oficina/demo → piloto de
-- 30 dias → proposta. Nada aqui guarda dado de aluno (LGPD): só dados
-- profissionais da escola e de quem decide.

-- ---------------------------------------------------------------------------
-- 1. Escolas / contas
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS adapt_escolas (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  protocolo          varchar(30) NOT NULL,
  nome               varchar(255) NOT NULL,
  -- particular_grande | particular_pequena | filantropica | publica_municipal
  -- | publica_estadual | rede_publica | canal_indicador
  tipo               varchar(30) NOT NULL,
  -- escola | rede | parceiro (define o funil usado)
  trilha             varchar(20) NOT NULL DEFAULT 'escola',
  etapas_ensino      varchar(160),
  bairro             varchar(80),
  rota               varchar(1),            -- A | B | C (ou nulo = sob demanda)
  endereco           varchar(255),
  cidade             varchar(100) NOT NULL DEFAULT 'Belém',
  uf                 varchar(2) NOT NULL DEFAULT 'PA',
  telefone           varchar(120),
  email              varchar(255),
  site               varchar(255),
  fonte_dados        varchar(255),
  dados_confirmados  boolean NOT NULL DEFAULT FALSE,

  -- Pontuação (0 a 10): etapas 0-3 + porte 0-3 + acesso 0-2 + rota 0-2.
  -- `pontos` guarda a nota; quando os 4 componentes estão preenchidos,
  -- ela é a soma deles. Sem componentes = nota preliminar do plano.
  pts_etapas         smallint CHECK (pts_etapas BETWEEN 0 AND 3),
  pts_porte          smallint CHECK (pts_porte BETWEEN 0 AND 3),
  pts_acesso         smallint CHECK (pts_acesso BETWEEN 0 AND 2),
  pts_rota           smallint CHECK (pts_rota BETWEEN 0 AND 2),
  pontos             smallint CHECK (pontos BETWEEN 0 AND 10),

  -- Perfil (números agregados, nunca dado de aluno)
  aee_ativo          boolean,
  alunos_tea         integer CHECK (alunos_tea >= 0),
  professores        integer CHECK (professores >= 0),

  -- Quem decide e quem abre a porta
  decisor_nome       varchar(160),
  decisor_cargo      varchar(120),
  decisor_contato    varchar(160),
  aliado_nome        varchar(160),
  aliado_cargo       varchar(120),
  aliado_contato     varchar(160),

  dono_id            uuid REFERENCES pessoas_acesso(id) ON DELETE SET NULL,

  etapa              varchar(20) NOT NULL DEFAULT 'lista',
  etapa_desde        date NOT NULL DEFAULT CURRENT_DATE,
  marcos             jsonb NOT NULL DEFAULT '{}'::jsonb,
  cadencia_inicio    date,

  -- Qualificação (BANT simplificado) e diagnóstico consultivo
  bant               jsonb NOT NULL DEFAULT '{}'::jsonb,
  diagnostico        jsonb NOT NULL DEFAULT '{}'::jsonb,

  -- Piloto de 30 dias
  piloto_inicio      date,
  piloto_fim         date,
  piloto             jsonb NOT NULL DEFAULT '{}'::jsonb,

  -- Proposta
  proposta           jsonb NOT NULL DEFAULT '{}'::jsonb,
  valor_mensal       numeric(12, 2),

  origem             varchar(30) NOT NULL DEFAULT 'lista',
  indicado_por       varchar(160),
  motivo_perda       varchar(60),
  motivo_perda_obs   text,
  nutricao_ate       date,

  proximo_passo      varchar(255),
  proxima_data       date,
  notas              text,

  criado_por_id      uuid REFERENCES pessoas_acesso(id) ON DELETE SET NULL,
  criado_em          timestamptz NOT NULL DEFAULT NOW(),
  atualizado_em      timestamptz NOT NULL DEFAULT NOW(),
  arquivado_em       timestamptz,
  arquivado_motivo   text
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_adapt_escolas_protocolo ON adapt_escolas (protocolo);
CREATE INDEX IF NOT EXISTS idx_adapt_escolas_etapa ON adapt_escolas (etapa) WHERE arquivado_em IS NULL;
CREATE INDEX IF NOT EXISTS idx_adapt_escolas_dono ON adapt_escolas (dono_id) WHERE arquivado_em IS NULL;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'trg_adapt_escolas_atualizar_em') THEN
    CREATE TRIGGER trg_adapt_escolas_atualizar_em
      BEFORE UPDATE ON adapt_escolas
      FOR EACH ROW EXECUTE FUNCTION trigger_atualizar_em();
  END IF;
END $$;

-- ---------------------------------------------------------------------------
-- 2. Atividades: contatos, visitas, reuniões (feitas ou agendadas)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS adapt_atividades (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  escola_id     uuid NOT NULL REFERENCES adapt_escolas(id) ON DELETE CASCADE,
  -- visita | ligacao | whatsapp | email | diagnostico | oficina | demo
  -- | reuniao_direcao | reuniao_tecnica | piloto_inicio | piloto_acomp
  -- | piloto_fim | outro
  tipo          varchar(30) NOT NULL,
  dia_cadencia  smallint,               -- 1, 3, 6, 9, 14, 20 (passo da cadência)
  passo         varchar(30),            -- chave do passo da cadência
  -- sem_resposta | recepcao | falou_aliado | falou_decisor | agendou | sem_interesse
  resultado     varchar(30),
  status        varchar(12) NOT NULL DEFAULT 'feito' CHECK (status IN ('feito', 'agendado', 'cancelado')),
  quando        timestamptz NOT NULL DEFAULT NOW(),
  data          date NOT NULL DEFAULT CURRENT_DATE,  -- dia em que foi feita / está marcada
  com_quem      varchar(160),
  nota          text,
  pessoa_id     uuid REFERENCES pessoas_acesso(id) ON DELETE SET NULL,
  criado_em     timestamptz NOT NULL DEFAULT NOW(),
  estornado_em  timestamptz,
  estorno_motivo text
);
CREATE INDEX IF NOT EXISTS idx_adapt_ativ_escola ON adapt_atividades (escola_id, data);
CREATE INDEX IF NOT EXISTS idx_adapt_ativ_data ON adapt_atividades (data) WHERE estornado_em IS NULL;

-- ---------------------------------------------------------------------------
-- 3. Movimentos de etapa (histórico e conversão)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS adapt_movimentos (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  escola_id     uuid NOT NULL REFERENCES adapt_escolas(id) ON DELETE CASCADE,
  de_etapa      varchar(20),
  para_etapa    varchar(20) NOT NULL,
  pessoa_id     uuid REFERENCES pessoas_acesso(id) ON DELETE SET NULL,
  justificativa text,
  em            timestamptz NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_adapt_mov_escola ON adapt_movimentos (escola_id, em);

-- ---------------------------------------------------------------------------
-- 4. Metas semanais (chave → valor) e plano/kit (checklists)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS adapt_metas (
  chave         varchar(40) PRIMARY KEY,
  valor         integer NOT NULL CHECK (valor >= 0),
  atualizado_por uuid REFERENCES pessoas_acesso(id) ON DELETE SET NULL,
  atualizado_em timestamptz NOT NULL DEFAULT NOW()
);

-- tipo: plano (semanas 1 a 4) | kit (materiais) | decisao (diretoria)
CREATE TABLE IF NOT EXISTS adapt_checklist (
  chave         varchar(60) PRIMARY KEY,
  tipo          varchar(20) NOT NULL,
  feito         boolean NOT NULL DEFAULT FALSE,
  obs           text,
  responsavel_id uuid REFERENCES pessoas_acesso(id) ON DELETE SET NULL,
  atualizado_por uuid REFERENCES pessoas_acesso(id) ON DELETE SET NULL,
  atualizado_em timestamptz NOT NULL DEFAULT NOW()
);

-- Configurações simples da frente (ex.: data de início da semana 1)
CREATE TABLE IF NOT EXISTS adapt_config (
  chave         varchar(40) PRIMARY KEY,
  valor         text,
  atualizado_em timestamptz NOT NULL DEFAULT NOW()
);
