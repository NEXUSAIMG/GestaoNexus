-- ===========================================================================
-- Sprint 42F — Quadro e Comercial em espelho
-- ===========================================================================
-- O quadro Kanban da equipe ("Atividade Comercial") e o módulo Comercial
-- passam a andar juntos, nos dois sentidos:
--   - mover o card no quadro muda a etapa do lead (respeitando os portões)
--     e, nas colunas da implantação, marca os marcos;
--   - mudar a etapa / registrar marco no Comercial move o card;
--   - nome, responsável e contatos (campos do quadro) ficam iguais nos dois;
--   - card novo no quadro vira lead; lead novo no Comercial vira card.
-- O vínculo card ↔ lead continua sendo comercial_leads.origem_card_id.
-- Esta tabela guarda, por quadro, o mapa coluna → etapa e as opções.
-- Tudo aditivo.
-- ===========================================================================

BEGIN;

CREATE TABLE IF NOT EXISTS comercial_espelhos (
  quadro_id      uuid PRIMARY KEY REFERENCES quadros(id) ON DELETE CASCADE,
  ativo          boolean NOT NULL DEFAULT true,
  -- coluna_id → etapa do funil ('prospect', 'cadencia', ...) ou 'ignorar'
  mapa           jsonb NOT NULL DEFAULT '{}'::jsonb,
  -- lead criado no Comercial ganha um card no quadro
  criar_cards    boolean NOT NULL DEFAULT true,
  -- origem dos leads que nascem de um card criado no quadro
  origem_padrao  varchar(30) NOT NULL DEFAULT 'prospeccao',
  -- quadro misto: só cards com esta etiqueta são de venda (ex.: "Cliente")
  somente_etiqueta varchar(80),
  criado_por_id  uuid REFERENCES pessoas_acesso(id) ON DELETE SET NULL,
  criado_em      timestamptz NOT NULL DEFAULT now(),
  atualizado_em  timestamptz NOT NULL DEFAULT now()
);

COMMIT;
