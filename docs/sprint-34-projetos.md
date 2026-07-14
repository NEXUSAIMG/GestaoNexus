# Sprint 34 — Projetos: fundação (além do Trello)

Primeira fatia do plano de gestão de projetos. **Backend + frontend completos.**

## Frontend (34.1) — refactor + features

`pages/Quadro.jsx` foi de **1747 → 485 linhas**. Os 9 componentes que moravam
dentro dele viraram `components/quadro/`:

```
components/quadro/ui.js                 paleta, prioridades, tipos, formatação, moverCardLocal
components/quadro/ModalFrame.jsx
components/quadro/Card.jsx              + selos: P0/P1, bloqueado, subtarefas, vínculos, horas
components/quadro/Coluna.jsx            + tipo da coluna e limite de WIP no menu
components/quadro/FiltroBar.jsx         + filtro por prioridade e "só bloqueados"
components/quadro/Instancia.jsx         (Sprint 15, extraído sem mudança)
components/quadro/ModalCard.jsx         abas: detalhes / subtarefas / dependências / vínculos / horas / atividade
components/quadro/ModalConfigQuadro.jsx + gestor de campos personalizados
components/quadro/ModalBloqueadores.jsx diálogo do 409 no drag
components/quadro/CardSubtarefas.jsx
components/quadro/CardDependencias.jsx
components/quadro/CardVinculos.jsx
components/quadro/CardTimer.jsx
components/quadro/CardCampos.jsx
```

A página agora só orquestra: estado, drag & drop, filtros e modais.
`vite build` passa (1879 módulos).

## Por que esta sprint existe

O Kanban das Sprints 10/11/18/32 já era um "Trello Free bem-feito".
O que faltava não era campo no card — era **estrutura de trabalho**.
Esta sprint entrega as três coisas que o Trello não tem nem no plano pago:

1. **Subtarefas reais** — o filho é um card de verdade (prazo, responsável,
   comentário, anexo), não um item de checklist.
2. **Dependências entre cards** — com detecção de ciclo e gate no `/mover`.
3. **Vínculos de negócio** — o card aponta pro cartório, contrato, instância
   de processo, produto ou conta a pagar que ele representa.

Mais a base silenciosa das métricas da Sprint 37: **tipo de coluna** e o
carimbo `concluido_em`.

## Migration `025_projetos_core.sql`

| Objeto | O que faz |
|---|---|
| `cards.card_pai_id` | hierarquia; CHECK contra self-pai, ciclo profundo barrado no controller |
| `cards.prioridade` | 0=P0 crítico … 3=baixa (default 2) |
| `cards.estimativa_horas`, `cards.pontos` | planejamento |
| `cards.concluido_em` | carimbo de entrada em coluna `concluida` → base de cycle time |
| `cards_dependencias` | grafo dirigido (`card_id` bloqueado por `depende_de_id`) |
| `colunas.tipo` | `backlog` / `em_andamento` / `concluida` |
| `colunas.wip_limite` | limite de WIP (avisa, não bloqueia) |
| `quadros_campos` + `cards_campos_valores` | campos personalizados por quadro |
| `cards_vinculos` | polimórfico controlado (whitelist de 5 tipos) |
| `cards_apontamentos` | timer (índice único parcial: 1 timer por pessoa) |

**Backfill incluído:** colunas chamadas "A fazer"/"Concluído" (e variantes)
são classificadas automaticamente, e cards que já estão em coluna concluída
recebem `concluido_em = atualizado_em`. Assim as métricas da Sprint 37 nascem
com histórico em vez de zeradas.

## Regras de negócio implementadas

- **Gate de dependência**: mover card com bloqueador aberto para coluna que
  não é `backlog` devolve **409** com `detalhes.bloqueadores` e
  `pode_forcar: true`. A UI mostra os bloqueadores e reenvia com
  `forcar: true` se a pessoa insistir. Kanban saudável orienta, não impede.
- **WIP limit**: nunca bloqueia. O `/mover` devolve `wip_estourado` no payload
  para a UI dar um toast.
- **Ciclos**: barrados por CTE recursiva antes do INSERT/UPDATE — tanto em
  dependência quanto em hierarquia.
- **`concluido_em`**: setado ao entrar em coluna `concluida`, limpo ao sair.
  Também é reconciliado quando a coluna muda de tipo.
- **Acesso restrito (Sprint 31)**: vínculos de tipo `contrato`, `conta_pagar`
  e `produto` não podem ser criados nem têm rótulo exposto para pessoas com
  `acesso_restrito` — coerente com o bloqueio das rotas correspondentes.
- **Dependência entre quadros**: permitida, desde que a pessoa enxergue os
  dois quadros ("entrega do time A trava o time B").

## API nova

```
GET    /api/quadros/:id/campos
POST   /api/quadros/:id/campos
PUT    /api/quadros/:id/campos/:campoId
DELETE /api/quadros/:id/campos/:campoId
PUT    /api/cards/:id/campos/:campoId          upsert do valor

GET    /api/cards/:id/dependencias             { bloqueado_por, bloqueia }
POST   /api/cards/:id/dependencias
DELETE /api/cards/:id/dependencias/:alvoId

GET    /api/cards/:id/subtarefas
POST   /api/cards/:id/subtarefas

GET    /api/cards/:id/vinculos
POST   /api/cards/:id/vinculos
DELETE /api/cards/:id/vinculos/:vinculoId
GET    /api/cards/por-vinculo?tipo=&alvo_id=   busca reversa

GET    /api/cards/timer/ativo
POST   /api/cards/:id/timer/iniciar            fecha o timer anterior
POST   /api/cards/:id/timer/parar
GET    /api/cards/:id/apontamentos             lista + totais + estimativa
POST   /api/cards/:id/apontamentos             lançamento manual
DELETE /api/cards/:id/apontamentos/:apontamentoId
```

`POST /api/cards/:id/mover` ganhou `forcar` no body e devolve
`wip_estourado` + `concluido`.

`GET /api/quadros/:id` agora traz `campos` (definições), e cada card traz
`prioridade`, `n_subtarefas`, `n_subtarefas_ok`, `n_bloqueadores`,
`n_bloqueia`, `n_vinculos`, `minutos_apontados`, `campos`, `bloqueado`.

## Arquivos tocados

```
backend/db/migrations/025_projetos_core.sql        (novo)
backend/src/controllers/projetos.controller.js     (novo)
backend/src/controllers/cards.controller.js        (schemas, criar, atualizar, mover)
backend/src/controllers/colunas.controller.js      (tipo + wip_limite)
backend/src/controllers/quadros.controller.js      (payload do board, colunas padrão tipadas)
backend/src/middleware/error.middleware.js         (repassa err.detalhes no 409)
backend/src/routes/cards.routes.js
backend/src/routes/quadros.routes.js
backend/src/routes/index.js                        (/saude → 1.8)
```

## Como subir

```bash
cd backend
npm run migrate          # roda 025 (local primeiro!)
node --check src/controllers/projetos.controller.js   # já validado
npm run dev
```

Nada no frontend foi alterado — o board continua funcionando igual, os campos
novos são aditivos e ignorados pela UI atual.

## Próximo (Sprint 34.1 — frontend)

`Quadro.jsx` precisa ser quebrado em `components/quadro/` **antes** de
receber essas features. Ordem sugerida:

1. `CardModal.jsx` extraído (hoje está dentro do `Quadro.jsx`)
2. `CardSubtarefas.jsx`, `CardDependencias.jsx` (com o diálogo do 409)
3. `CardCamposCustom.jsx`, `CardTimer.jsx`
4. `ColunaHeader.jsx` com contador de WIP e seletor de tipo
5. Selos novos no card: prioridade (P0 vermelho), 🔗 bloqueado, n/N subtarefas

Manter o padrão de version gate (`useRef`) em todo `carregar()`.
