# Sprint 38.1 — Tempo real (SSE)

Backend + frontend. **Sem migration.** Fecha o blueprint "além do Trello".
Smoke test: **6/6 casos** (`db/scripts/teste-sse.js`).

## O que faz

Quando alguém move/cria/edita/arquiva um card ou mexe numa coluna, todo mundo
que está com aquele quadro aberto vê a mudança **sozinho, em ~1 segundo**, sem
apertar F5. Um badge "ao vivo" no header confirma que o canal está de pé.

Escolhi **SSE** (Server-Sent Events), não WebSocket: o fluxo é só do servidor
para o cliente (o cliente já fala pela API REST), SSE reconecta sozinho, e roda
sobre HTTP comum — sem upgrade de protocolo que o proxy do Railway poderia
atrapalhar.

## Arquitetura

```
controller muda algo → publicarMudanca(quadroId, tipo)
                          → EventEmitter em memória
                          → cada conexão SSE do quadro recebe "mudou"
                          → cliente faz GET /quadros/:id (silencioso) e re-renderiza
```

**O stream não carrega dado.** Ele só avisa "algo mudou neste quadro". O cliente
busca o estado novo pelo endpoint normal (que já checa permissão e tem gate de
versão). Três ganhos: nada sensível trafega por um canal a mais para proteger;
uma única fonte de verdade para o payload; o stream fica trivialmente barato.

## Decisões que evitam dor

- **Token na query (`?token=`).** O `EventSource` do browser não manda header,
  então é o padrão para SSE autenticado. Como o stream não carrega conteúdo, a
  URL vazar em log de proxy não vaza dado. A rota é registrada **fora** do
  `autenticar` global e faz a própria verificação.
- **Heartbeat de 25s** (`: ping`). Proxies matam conexão ociosa em 30–60s; o
  ping mantém viva e detecta socket morto. `X-Accel-Buffering: no` desliga o
  buffer do proxy — sem isso os eventos ficariam presos.
- **Cleanup no `close`.** Cada conexão fechada remove seu listener do
  EventEmitter. Sem isso, cada aba fechada vazaria um listener. O teste verifica
  que o contador volta a zero.
- **Recarregamento silencioso.** O `carregar()` do board ganhou modo sem
  spinner — senão a tela piscaria "Carregando…" a cada mudança de outra pessoa.
- **Debounce de 350ms no cliente.** Uma rajada (alguém arrastando vários cards)
  vira um recarregamento só.

## Limite conhecido (documentado, não escondido)

O EventEmitter é **em memória, processo único**. O Railway roda 1 instância
deste backend, então um emitter local alcança todos os clientes. Se um dia
escalar horizontalmente, `realtime.service.js` é o **único** arquivo a trocar —
por Redis pub/sub, mantendo a interface `publicarMudanca()`/`assinarQuadro()`.

## Arquivos

```
backend/src/services/realtime.service.js       (novo — event bus)
backend/src/controllers/stream.controller.js   (novo — endpoint SSE)
backend/db/scripts/teste-sse.js                (novo — smoke test)
backend/src/routes/index.js                    (+ GET /quadros/:id/stream)
backend/src/controllers/cards.controller.js    (publica em criar/mover/editar/arquivar)
backend/src/controllers/colunas.controller.js  (publica em criar/mover/editar/arquivar)
frontend/src/components/quadro/useTempoReal.js  (novo — hook EventSource)
frontend/src/pages/Quadro.jsx                   (hook + badge "ao vivo" + carregar silencioso)
```

## Validação

- `node --check` em tudo + import de `routes/index.js` (`BACKEND_OK`)
- `vite build` — 1888 módulos
- Smoke test: 6/6 (token inválido → 401, canal abre, evento chega, cleanup sem
  vazamento, isolamento entre quadros)

## Roadmap — COMPLETO

**34 Fundação · 35 Visões · 36 Automação · 37 Métricas · 38A Produtividade ·
38.1 Tempo real** — todas entregues. O blueprint "além do Trello" está fechado.
