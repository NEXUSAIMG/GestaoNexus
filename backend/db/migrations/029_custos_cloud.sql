-- ===========================================================================
-- Sprint 40 -- Custos Cloud (Fase 1)
--
-- Traz para dentro do sistema o controle de custos de nuvem do SeuCartorio:
--   custos_servicos  = catalogo (o que pagamos, tipo, teto por servico)
--   custos_mensais   = quanto cada servico custou em cada mes (fechamento)
--
-- Receita e margem sao calculadas no controller a partir de cobrancas_asaas.
-- Fase 2 (depois): coleta semanal, rateio por cartorio, alertas automaticos.
-- ===========================================================================

BEGIN;

CREATE TABLE IF NOT EXISTS custos_servicos (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  nome              text NOT NULL,
  para_que          text,
  tipo              text NOT NULL DEFAULT 'variavel' CHECK (tipo IN ('fixo', 'variavel')),
  plano             text,
  moeda             text NOT NULL DEFAULT 'BRL' CHECK (moeda IN ('BRL', 'USD')),
  custo_base_reais  numeric(12,2) NOT NULL DEFAULT 0,
  dia_cobranca      int,
  o_que_sobe        text,
  teto_reais        numeric(12,2),
  onde_ver          text,
  ativo             boolean NOT NULL DEFAULT TRUE,
  ordem             int NOT NULL DEFAULT 0,
  criado_em         timestamptz NOT NULL DEFAULT now(),
  atualizado_em     timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_custos_servicos_nome
  ON custos_servicos (lower(nome));

CREATE TABLE IF NOT EXISTS custos_mensais (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  mes           char(7) NOT NULL,   -- formato 'YYYY-MM'
  servico_id    uuid NOT NULL REFERENCES custos_servicos(id) ON DELETE CASCADE,
  valor_reais   numeric(12,2) NOT NULL DEFAULT 0,
  criado_em     timestamptz NOT NULL DEFAULT now(),
  atualizado_em timestamptz NOT NULL DEFAULT now(),
  UNIQUE (mes, servico_id)
);

CREATE INDEX IF NOT EXISTS idx_custos_mensais_mes ON custos_mensais (mes);

-- Seed do catalogo (os 10 servicos da planilha). Idempotente.
INSERT INTO custos_servicos (nome, para_que, tipo, plano, moeda, custo_base_reais, dia_cobranca, o_que_sobe, teto_reais, onde_ver, ordem) VALUES
  ('Botpress Cloud', 'Motor do chatbot no WhatsApp (fluxos, HITL/transbordo)', 'variavel', 'Pay-as-you-go', 'USD', 1825.20, 5, 'Numero de mensagens trocadas pelos bots', 2100, 'app.botpress.cloud > Workspace > Billing', 1),
  ('Vercel', 'Hospeda o site (Next.js) e a API serverless', 'fixo', 'Pro', 'USD', 108, 1, 'Invocacoes de funcao e banda acima da cota', 200, 'vercel.com/dashboard > Settings > Billing', 2),
  ('Railway', 'Banco de dados de producao (multitenant)', 'variavel', 'Usage-based', 'USD', 108, 1, 'Horas de execucao, RAM e volume do banco', 250, 'railway.app > Project > Usage', 3),
  ('Claude API (Haiku)', 'IA que classifica a intencao das mensagens', 'variavel', 'Pay-as-you-go', 'USD', 81, 1, 'Tokens processados (volume de mensagens)', 200, 'console.anthropic.com > Usage / Billing', 4),
  ('Z-API', 'Conexao com o WhatsApp (1 instancia por cartorio)', 'variavel', 'Por instancia', 'BRL', 0, 10, 'Quantidade de instancias ativas (1 por cliente)', 800, 'app.z-api.io > Instancias', 5),
  ('Vapi', 'Atendimento por voz (ainda em homologacao)', 'variavel', 'Pay-as-you-go', 'USD', 0, 1, 'Minutos de chamada', 150, 'dashboard.vapi.ai > Billing', 6),
  ('Vercel Blob', 'Armazenamento de arquivos enviados pelos clientes', 'variavel', 'Incluso Pro + excedente', 'USD', 0, 1, 'GB armazenados e GB baixados', 100, 'vercel.com/dashboard > Storage > Blob', 7),
  ('Resend', 'Envio de e-mails transacionais', 'fixo', 'Free / Pro', 'USD', 0, 1, 'E-mails enviados acima da cota gratuita', 120, 'resend.com > Settings > Billing', 8),
  ('Dominio (registro.br)', 'Endereco seucartorio.ia.br', 'fixo', 'Anual', 'BRL', 0, 0, 'Renovacao anual - dividir por 12', 20, 'registro.br > Meus dominios', 9),
  ('Asaas', 'Recebe os pagamentos dos clientes (taxa por transacao)', 'variavel', 'Por transacao', 'BRL', 0, 0, 'Taxa cobrada sobre cada boleto/pix/cartao', 150, 'asaas.com > Financeiro > Extrato', 10)
ON CONFLICT (lower(nome)) DO NOTHING;

COMMIT;
