# Sprint 38 — Produtividade e migração (parte A)

Backend + frontend. **Sem migration** — tudo reusa o schema existente.
Importador testado ponta a ponta: **7/7 casos** (`db/scripts/teste-importar-trello.js`).

## O que entrou

### 1. Importador do Trello
`POST /api/quadros/importar-trello` — recebe o JSON de export de um board do
Trello e recria tudo no Nexus numa transação: listas → colunas (com tipo
inferido pelo nome), cards → cards, labels → etiquetas, checklists → checklists
(estado dos itens preservado), comentários → comentários.

Mata a objeção nº1 de quem não larga o Trello: "já tenho tudo lá". Agora traz
tudo em um upload. UI em Tarefas → "Importar do Trello": escolhe a equipe,
envia o arquivo, vê a prévia (listas/cards/etiquetas) e importa.

Robustez testada: lista arquivada ignorada, card fechado ignorado, card em
lista morta ignorado, label sem nome ganha nome pela cor, card em coluna de
conclusão já nasce carimbado (as métricas contam desde o import).

### 2. Ações em massa
Seleção múltipla de cards no kanban (checkbox no hover, Shift+clique para
intervalo, Esc limpa). Barra flutuante aplica em lote: mover de coluna,
etiquetar, definir prioridade, arquivar. Reusa os endpoints existentes em
sequência — sem endpoint de lote no backend, porque o volume é de dezenas e a
transação-por-card mantém trigger de responsável, gate de dependência e log de
movimento intactos.

### 3. Command palette (Ctrl/Cmd+K)
Busca única sobre cards do quadro atual, outros quadros e vistas. Navegação por
teclado (setas + Enter). Os quadros são carregados sob demanda na primeira
abertura.

## Decisões

- **Importador é polimórfico-tolerante.** O Trello exporta dezenas de campos que
  não usamos; lemos só o que conhecemos e ignoramos o resto. Um board gigante
  não pode derrubar o import por um campo inesperado.
- **Ações em massa sem endpoint de lote.** Um `/cards/lote` seria mais rápido,
  mas pularia os hooks (trigger de responsável, movimento, automação). Preferi
  N chamadas que passam por toda a lógica a uma que a contorna.
- **SSE (tempo real) ficou de fora desta parte.** Conexão persistente + auth por
  token na query + reconnect no Railway é a peça mais delicada do blueprint e
  merece sprint própria — não quis misturar com um deploy recém-estabilizado.
  Fica como Sprint 38.1.

## Arquivos

```
backend/src/controllers/importar-trello.controller.js  (novo)
backend/db/scripts/teste-importar-trello.js            (novo)
backend/src/routes/quadros.routes.js                   (+ rota importar)
frontend/src/components/quadro/BarraSelecao.jsx        (novo)
frontend/src/components/quadro/CommandPalette.jsx      (novo)
frontend/src/components/quadro/Card.jsx                (checkbox de seleção)
frontend/src/components/quadro/Coluna.jsx              (repassa seleção)
frontend/src/pages/Quadro.jsx                          (seleção, Ctrl+K, barra)
frontend/src/pages/Tarefas.jsx                         (modal importar Trello)
```

## Validação

- `node --check` em tudo + import de `routes/index.js` (`BACKEND_OK`)
- `vite build` — 1887 módulos
- Teste do importador: 7/7 contra o banco, com limpeza em CASCADE

## Roadmap

- **34 Fundação · 35 Visões · 36 Automação · 37 Métricas · 38A Produtividade** ✅
- Resta: **38.1** (tempo real via SSE) para fechar o blueprint inteiro.
