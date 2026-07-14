# Sprint 36 — Automações

Backend + frontend. Migration `027_automacoes.sql` aplicada.
Teste ponta a ponta: **8/8 casos passando** (`db/scripts/teste-automacao.js`).

## O modelo

**GATILHO → CONDIÇÕES → AÇÕES.**

O Butler do Trello move card, atribui pessoa e cria checklist. Só.
O nosso faz tudo isso **e atravessa módulos**: fecha o card e a conta a pagar
daquele trabalho nasce sozinha, já categorizada e vinculada de volta ao card.

### Gatilhos
`card_criado` · `card_movido` (opcionalmente filtrado por coluna) ·
`etiqueta_adicionada` · `checklist_completo` · `prazo_proximo` (N dias) ·
`agendada` (varredura das 07h)

### Condições (AND entre todas)
prioridade · tem responsável · tem prazo · prazo vencido · está bloqueado ·
título contém · estimativa · checklist completo

### Ações
mover coluna · atribuir · adicionar/remover etiqueta · definir prioridade ·
definir prazo · comentar (com `{{titulo}}`, `{{prazo}}`) · criar checklist ·
criar card · **criar conta a pagar**

## Decisões de design

**1. Automação nunca derruba a ação do usuário.**
O dispatch roda em background, fora da transação do controller, engole os
próprios erros e nunca faz `throw` pra cima. Se a regra falha, quem falhou foi
a regra — não o card que a pessoa acabou de mover.

**2. Guarda de recursão (profundidade 3).**
Uma automação que move um card dispara `card_movido`, que pode acionar outra
que move de volta. Sem limite, é um loop infinito no primeiro dia. Testado.

**3. As execuções "ignoradas" são gravadas.**
A pergunta mais comum sobre automação não é *"o que ela fez"*, é *"por que ela
NÃO fez"*. O log mostra qual condição reprovou. O Butler não faz isso.

**4. `prazo_proximo` dispara em "exatamente N dias", não em "≤ N".**
Se fosse `≤`, a regra dispararia todo dia até o prazo chegar, e o card viraria
uma metralhadora de comentários.

**5. Sem webhook de saída.**
Estava no blueprint e ficou de fora de propósito: uma URL arbitrária
configurável por usuário é SSRF esperando acontecer, e a auditoria da Sprint 33
já apontou problemas de superfície. Entra depois, com allowlist de domínio.

**6. `gatilho`/`condicoes`/`acoes` são jsonb, não colunas.**
Schema rígido exigiria migration a cada ação nova. Como isso é *configuração*
(não dado de negócio consultável), jsonb é o lugar certo — e o Zod no controller
é a única barreira entre uma regra malformada e o motor executando em produção.

## Cron

`iniciarAgendadorAutomacoes()` — `0 7 * * *` (America/Sao_Paulo). Roda antes do
expediente: quem chega já encontra o board arrumado. **Separado** do agendador
de notificações de propósito — se uma regra travar, o resumo diário do admin
continua saindo. Um cron não pode ser refém do outro.

## Teste ponta a ponta

```
✓ P0 → regra executou (status ok)
✓ comentário criado com interpolação
✓ conta a pagar criada e vinculada: "Serviço — Card critico" R$ 250.50
✓ P3 → ignorada, e o log diz por quê: campo "prioridade"
✓ P3 não gerou conta a pagar (correto)
✓ coluna diferente → regra nem foi avaliada
✓ guarda de recursão barrou a corrente (profundidade 3)
```

O script cria um quadro descartável, exercita o motor e remove tudo em CASCADE.

## Arquivos

```
backend/db/migrations/027_automacoes.sql          (novo)
backend/db/scripts/teste-automacao.js             (novo)
backend/src/services/automacoes.service.js        (novo — motor)
backend/src/controllers/automacoes.controller.js  (novo — CRUD + Zod)
backend/src/controllers/cards.controller.js       (gatilhos criar/mover)
backend/src/controllers/card-extras.controller.js (gatilho checklist 100%)
backend/src/services/scheduler.js                 (cron 07h)
backend/src/server.js
backend/src/routes/quadros.routes.js
frontend/src/components/quadro/Automacoes.jsx     (novo — construtor + log)
frontend/src/components/quadro/ModalConfigQuadro.jsx
```
