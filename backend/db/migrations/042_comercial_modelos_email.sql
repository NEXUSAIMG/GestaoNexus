-- ============================================================
-- Sprint 44 — E-mails mais utilizados (biblioteca de modelos)
-- ============================================================
-- 1. comercial_modelos_email: biblioteca de modelos de e-mail mantida pela
--    gestão comercial dentro do Nexus (antes os textos ficavam no código).
--    `chave` identifica os modelos que nasceram da cadência (dia 1 e dia 11)
--    para o registro do toque já sugerir o modelo certo.
-- 2. comercial_toques.modelo_email_id: qual modelo foi usado no toque de
--    e-mail. É a base do ranking "e-mails mais utilizados" (equipe e pessoa).
-- 3. Toques de e-mail já registrados nos dias 1 e 11 da cadência passam a
--    apontar para o modelo correspondente (era o único texto sugerido).
-- ============================================================

CREATE TABLE IF NOT EXISTS comercial_modelos_email (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  chave          varchar(40),
  titulo         varchar(120) NOT NULL,
  assunto        varchar(200) NOT NULL,
  corpo          text NOT NULL,
  uso            varchar(300),
  criado_por_id  uuid REFERENCES pessoas_acesso(id) ON DELETE SET NULL,
  criado_em      timestamptz NOT NULL DEFAULT now(),
  atualizado_em  timestamptz NOT NULL DEFAULT now(),
  arquivado_em   timestamptz,
  arquivado_por_id uuid REFERENCES pessoas_acesso(id) ON DELETE SET NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_comercial_modelos_email_chave
  ON comercial_modelos_email (chave) WHERE chave IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS uq_comercial_modelos_email_titulo
  ON comercial_modelos_email (lower(titulo)) WHERE arquivado_em IS NULL;

ALTER TABLE comercial_toques
  ADD COLUMN IF NOT EXISTS modelo_email_id uuid REFERENCES comercial_modelos_email(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_comercial_toques_modelo_email
  ON comercial_toques (modelo_email_id, data) WHERE modelo_email_id IS NOT NULL;

-- Os dois modelos que já existiam nos Scripts
INSERT INTO comercial_modelos_email (chave, titulo, assunto, corpo, uso)
SELECT 'cadencia_d1', 'Apresentação (dia 1)',
       $a$[cartório]: atendimento por WhatsApp sem ocupar o balcão$a$,
       $c$[Nome], bom dia.

Sou [vendedor], da Ayio, a empresa que desenvolve o Seu Cartório: a plataforma de atendimento por WhatsApp feita para cartórios.

O [cartório de referência] recebia [volume] mensagens por dia e tinha [n] pessoas respondendo no celular. Com o Seu Cartório, [resultado concreto].

Vou ligar para você amanhã para entender como é o atendimento aí no [cartório]. Se preferir, responda este e-mail com o melhor horário para uma conversa de 20 minutos.

[vendedor]
Ayio · Seu Cartório
[telefone / WhatsApp]$c$,
       'Primeiro toque da cadência (dia 1)'
WHERE NOT EXISTS (SELECT 1 FROM comercial_modelos_email WHERE chave = 'cadencia_d1');

INSERT INTO comercial_modelos_email (chave, titulo, assunto, corpo, uso)
SELECT 'cadencia_d11', 'Convite para o webinar (dia 11)',
       $a$Webinar: atendimento por WhatsApp em cartórios, [data]$a$,
       $c$[Nome], bom dia.

A Ayio, empresa do Seu Cartório, vai mostrar em [data], às [hora], como cartórios estão organizando o atendimento por WhatsApp: fila, respostas automáticas, LGPD e relatório para o titular. São 40 minutos, com perguntas no final.

Inscrição: [link]

[vendedor]
Ayio · Seu Cartório$c$,
       'Dia 11 da cadência'
WHERE NOT EXISTS (SELECT 1 FROM comercial_modelos_email WHERE chave = 'cadencia_d11');

-- Toques de e-mail antigos dos dias 1 e 11 → modelo correspondente
UPDATE comercial_toques t
   SET modelo_email_id = m.id
  FROM comercial_modelos_email m
 WHERE t.modelo_email_id IS NULL
   AND t.tipo = 'cadencia'
   AND t.canal ILIKE 'e%mail%'
   AND ((t.dia = 1 AND m.chave = 'cadencia_d1') OR (t.dia = 11 AND m.chave = 'cadencia_d11'));
