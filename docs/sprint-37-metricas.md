# Sprint 37 — Métricas de fluxo

Backend + frontend. Migration `026_metricas.sql` aplicada.

## O problema que isso resolve

O board mostra **onde** os cards estão. Não mostra **há quanto tempo** estão ali.
Card esquecido não grita — só envelhece. Esta sprint dá ao quadro a dimensão
que faltava: tempo.

## O que foi medido no primeiro snapshot (produção)

| Quadro | Entregues | WIP | Aging médio |
|---|---|---|---|
| Atividades do Comercial | 12 | 33 | **35 dias** |
| Processo de Desenvolvimento | 0 | 0 | 75 dias |
| Backlog | 0 | 0 | 55,9 dias |

33 cards em andamento com aging médio de 35 dias no funil comercial. Esse é
exatamente o tipo de número que o board sozinho nunca contaria.

## Schema (`026_metricas.sql`)

| Objeto | Para quê |
|---|---|
| `cards.coluna_desde` | quando o card entrou na coluna atual → **aging** |
| `cards.iniciado_em` | primeira saída do backlog → **cycle time** |
| `cards_movimentos` | log de cada movimentação (de/para coluna + tipo + minutos na origem) |
| `cards_snapshot_diario` | foto diária por coluna → **CFD** |

**Decisões que valem registro:**

- `coluna_desde` **só é reescrito quando o card muda de coluna**. Reordenar
  dentro da mesma coluna não pode zerar o aging — senão bastava arrastar o
  card pra cima pra ele "rejuvenescer" e a métrica viraria ficção.
- `iniciado_em` grava **uma vez só**. Voltar pro backlog e sair de novo não
  reinicia a contagem: o trabalho já tinha começado.
- `cards_movimentos` guarda o **tipo da coluna no momento do movimento**. Se
  alguém reclassificar a coluna depois, o histórico não se reescreve sozinho.
- O backfill usa aproximações **explícitas** (`coluna_desde = atualizado_em`,
  `iniciado_em = criado_em`). Superestima cycle time e subestima aging — os
  dois erros são conservadores. Não há histórico real antes desta migration e
  a UI não finge que há.

## Métricas expostas

`GET /api/quadros/:id/metricas?dias=90` — um request só, cinco consultas:

- **Aging WIP** — cards em andamento, do mais parado pro menos. O número mais
  acionável do conjunto.
- **Cycle time p50 / p85** — percentil, não média. Cycle time tem cauda longa;
  a média é puxada por um card que ficou 90 dias parado e não descreve nada.
- **Lead time p50 / p85** — da criação à entrega.
- **Throughput semanal** — vazão.
- **CFD** — a partir do snapshot diário.

`POST /api/quadros/:id/metricas/snapshot` (admin) — força a foto sem esperar
as 23:50. Serve pra semear o primeiro ponto do CFD.

## Job

`iniciarAgendadorMetricas()` no `scheduler.js` — cron `50 23 * * *`
(America/Sao_Paulo). Idempotente: `ON CONFLICT DO UPDATE`, rodar duas vezes
no mesmo dia sobrescreve em vez de duplicar.

## Frontend

`components/quadro/Metricas.jsx` — nova aba no quadro, ao lado de Kanban e
Calendário. Gráficos em **SVG na mão** (o projeto não tem lib de chart e não
valia puxar uma só por isso — segue o precedente do `GraficoFluxo.jsx`).

Ordenado por utilidade, não por vaidade: aging primeiro, CFD por último.

O CFD avisa honestamente quando ainda não tem histórico, em vez de mostrar um
gráfico vazio fingindo que é um dado.

## Arquivos

```
backend/db/migrations/026_metricas.sql        (novo)
backend/src/services/metricas.service.js      (novo)
backend/src/controllers/metricas.controller.js(novo)
backend/src/services/scheduler.js             (+ agendador de snapshot)
backend/src/server.js                         (liga/desliga o agendador)
backend/src/controllers/cards.controller.js   (instrumenta criar + mover)
backend/src/routes/quadros.routes.js          (+ /metricas)
frontend/src/components/quadro/Metricas.jsx   (novo)
frontend/src/pages/Quadro.jsx                 (+ aba Métricas)
```
