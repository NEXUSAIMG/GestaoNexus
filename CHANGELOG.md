# Changelog — Gestão Nexus

Histórico de mudanças por sprint. Sprints 1-17 estão documentadas
individualmente em `docs/sprint-*.md`. A partir da Sprint 18 (multi-resp em
cards), o ritmo virou diário e consolidamos aqui pra evitar fragmentação.

> Convenção: cada sprint lista (1) o que entregou, (2) arquivos novos ou
> modificados relevantes, (3) como testar rapidamente.
> Migrations rodam com `npm run migrate` (no diretório `backend`).
> Tudo é idempotente — rodar de novo é seguro.

---

## Sprint 30 — Debounce isolado + gate de versão total

Duas frentes em paralelo:

### Parte A — Debounce isolado em 3 listagens

Replica o padrão da Sprint 29 (debounce isolado + gate de versão) em 3
listagens que tinham `setTimeout(carregar, 250)` aplicado a TODOS os
filtros — isso atrasava selects sem necessidade.

**Páginas refatoradas:**
- `frontend/src/pages/Contratos.jsx`
- `frontend/src/pages/Cartorios.jsx`
- `frontend/src/pages/DocumentosEmpresa.jsx`

**Padrão final:** 2 useEffects separados — um pra debounce isolado do
campo busca (350ms), outro pro trigger principal que reage a
`buscaDebounced` + selects (imediato). **Aplicado em 5 listagens:**
`Instancias.jsx`, `Cartorios.jsx`, `Contratos.jsx`, `DocumentosEmpresa.jsx`,
`Inventario.jsx` (este último migrou de 400ms acoplado pra 350ms isolado).

### Parte B — Gate de versão em todas as páginas restantes

Defesa em profundidade: aplica gate de versão (`useRef` contador) em
todas as páginas que ainda usavam o padrão de `carregar()` direto. Resolve
race condition em cenários de operações rápidas em sequência (criar +
excluir + refresh, ou mudar ano + efetivar movimento).

**Páginas blindadas (7):**
- `Equipes.jsx`, `Pessoas.jsx`, `Socios.jsx` — 1 `carregar()` simples cada
- `Tarefas.jsx` — Promise.all com quadros + equipes
- `Lucros.jsx` — `carregarTudo()` com 6 requests em Promise.all, depende de `ano`
- `Inventario.jsx` — 1 `carregar()` com filtros + debounce de busca pré-existente
- `Caixa.jsx` — caso especial com **3 funções separadas** (`carregarResumo`,
  `carregarFluxo`, `carregarLista`) e portanto **3 refs distintos**
  (`carregaResumoIdRef`, `carregaFluxoIdRef`, `carregaListaIdRef`).
  Cobre race entre `sincronizarAgora()` (dispara as 3 em paralelo) e mudança
  de filtro disparando `carregarLista()`.

**Cobertura total agora:** TODAS as páginas do app que fazem busca por
dados ou tem refresh após operações têm gate ativo.

**Páginas com busca livre — status final:**

| Página | Estratégia |
|---|---|
| `Instancias.jsx`, `Cartorios.jsx`, `Contratos.jsx`, `DocumentosEmpresa.jsx`, `Inventario.jsx` | Debounce isolado 350ms + gate |
| `ContasPagar.jsx` | Padrão `busca/buscaAtiva` separados (submit manual) + gate (Sprint 28) |
| `Caixa.jsx` | Padrão `busca/buscaAtiva` separados + 3 gates distintos |
| `Quadro.jsx` | Filtros por select, sem busca livre + gate (Sprint 25) |

**Como testar:** digite uma palavra inteira no campo busca de qualquer
listagem refatorada — antes disparava N requests; agora dispara 1 só
(350ms após parar). Mude um select: dispara imediato. Crie/exclua/edite
vários itens em sequência rápida — o estado final é sempre o mais recente.

---

## Sprint 29 — Documentação atualizada + debounce em Instancias

Documentação posta em dia e refactor pequeno de UX.

**Documentação:**
- `CHANGELOG.md` novo na raiz consolidando Sprints 18-28 (~270 linhas)
- `README.md` atualizado: status v1.2, lista de features expandida,
  estrutura de pastas, tabela de docs estendida com sprints 11-17.1 +
  linha consolidada "18-28 → CHANGELOG.md"
- Decisão: NÃO criar 11 docs separados em `docs/sprint-XX.md`. CHANGELOG
  consolidado é mais fácil de buscar (Ctrl+F) e manter. Os 18 docs
  antigos ficam preservados pra história

**Refactor (`Instancias.jsx`):**
- Debounce de 200ms genérico (aplicado a TODOS os filtros) substituído
  por padrão isolado: 350ms só pro campo busca; selects disparam imediato
- Antes: digitar "contrato social" = 16 requests; agora = 1
- Antes: trocar um select tinha 200ms de atraso desnecessário; agora
  é instantâneo

---

## Sprint 28 — Defesa em profundidade: gate de versão (frontend)

Padroniza o gate de versão (`useRef` contador) em todas as páginas que
fazem múltiplas chamadas paralelas a `carregar()`. Resolve a classe inteira
de bugs "voltou ao estado antigo" onde o response de um request mais
ANTIGO chega depois e sobrescreve o estado mais recente.

**Páginas blindadas:**
- `frontend/src/pages/Cartorio.jsx` — race entre salvar modal e
  desvincular quadro em sequência
- `frontend/src/pages/Instancias.jsx` — race quando usuário digita rápido
  no campo busca (não tem debounce)
- `frontend/src/pages/ContasPagar.jsx` — race entre salvar conta e mudança
  de filtro

**Como testar:** abrir cada página, fazer 3 ações que disparam carregar()
em sequência muito rápida (< 200ms entre elas). O estado final é sempre o
mais recente, nunca o intermediário.

---

## Sprint 27 — UI de configurações de notificações

Página `/configuracoes` (admin-only) que controla cada toggle de e-mail
sem precisar mexer no banco. A página já existia desde a Sprint 7;
adicionado só o toggle novo da Sprint 26.

**Arquivos:**
- `backend/src/controllers/configuracoes-notificacoes.controller.js`:
  campo `email_contrato_vencendo` no schema Zod + serializer
- `frontend/src/pages/Configuracoes.jsx`: toggle novo abaixo dos
  outros e-mails

**Como testar:** login admin → sidebar → Cadastros → Notificações.
Toggle desligado = só notificação in-app, sem e-mail.

---

## Sprint 26 — Cron de aviso de vencimento de contratos

Fecha o módulo de Contratos com disparo automático. Antes, o cálculo de
"vencendo" / "vencido" era feito sob demanda no GET; agora um cron
diário às 8h notifica admins por in-app + e-mail.

**Backend:**
- Migration **022**: `contratos.ultimo_alerta_em` (idempotência) +
  `configuracoes_notificacoes.email_contrato_vencendo` + índice parcial
- `backend/src/services/email-templates.js`: template `tplContratoVencendo`
  com 2 seções (vencidos em vermelho, vencendo em amarelo)
- `backend/src/services/notificacoes.service.js`:
  `enviarAvisosContratosVencendo()` — query idempotente, re-alerta a cada
  7 dias enquanto contrato continuar na janela
- `backend/src/services/scheduler.js`: chamada integrada ao
  `iniciarAgendadorNotificacoes()` (mesma janela das 8h)
- `backend/src/controllers/contratos.controller.js`: endpoint manual
  `POST /api/contratos/disparar-alertas` (admin) pra teste imediato
- Rota registrada **antes** de `/:id` pra não ser interpretada como UUID

**Frontend:**
- `frontend/src/pages/Contratos.jsx`: botão **"Disparar alertas"** no
  header (admin-only), ao lado de "Novo contrato"

**Como testar:** cadastra contrato com data_fim daqui a 5 dias → clica
"Disparar alertas" → admins recebem notificação e e-mail. Clica de
novo: "Nenhum contrato precisa de aviso agora" (idempotência).

---

## Sprint 25 — Bug "card volta ao estado antigo" (gate de versão)

Resolve o bug histórico do item 11 da spec. A causa era **race condition
no frontend** entre múltiplas chamadas paralelas de `carregar()`:
drag dispara um, save de modal dispara outro — o response mais antigo
chegava depois e sobrescrevia o estado.

**Correção:** gate de versão via `useRef` contador. Cada `carregar()`
captura um ID único; só atualiza o state se o ID atual = o ID do response.

**Arquivos:**
- `frontend/src/pages/Quadro.jsx`: ref `carregaIdRef`, gate no
  `carregar()`, defesa em profundidade em `setErro`/`setCarregando` do
  `catch`/`finally`
- Log diagnóstico `[DIAG-card] ⚠ carregar() #X descartado` quando
  descarta response

**Cleanup futuro:** remover logs `[DIAG-card]` quando confirmado.

**Como testar:** mover card no kanban + imediatamente abrir o card +
editar prazo + salvar. Estado salvo permanece, não "volta".

---

## Sprint 24 — Cartórios em fases do kanban (item 1.5 da spec)

Mostra cartórios vinculados a um quadro agrupados na coluna onde estão
posicionados. Backend já suportava desde Sprint 20A; faltava a UI.

**Backend:**
- `backend/src/controllers/cartorios.controller.js`: função
  `listarPorQuadro` (SELECT em `cartorios_quadros JOIN cartorios`)
- `backend/src/routes/quadros.routes.js`: rota
  `GET /api/quadros/:id/cartorios`

**Frontend (`Quadro.jsx`):**
- State `cartoriosDoQuadro` + função `carregarCartorios()` (falha
  silenciosa se módulo de cartórios não disponível)
- Faixa amber no topo de cada coluna (`border-amber-200 / bg-amber-50/60`)
  com chips clicáveis (ícone `Building2` + nome truncado a 140px)
- Click no chip → `/cartorios/:id`

**Decisão de design:** cartórios sem `coluna_id` ficam invisíveis no
kanban — visíveis apenas na listagem `/cartorios` e na página de
detalhe. Pode evoluir pra uma barra "Sem fase" no topo se virar dor.

**Como testar:** cadastra cartório → abre detalhe → "Vincular a quadro"
→ escolhe quadro e coluna → entra no quadro: chip aparece na faixa
amber da coluna escolhida.

---

## Sprint 23 — Item 7 da spec (Contas a pagar — múltiplos sub-itens)

**Já estava 100% implementado** em sprints anteriores. Revisão confirmou:

| Sub-item | Sprint | Status |
|---|---|---|
| (a) Múltiplos anexos por conta | 17.1 | ✅ tabela `contas_pagar_anexos`, componente `MultiplosAnexos.jsx` |
| (b) Editar conta em qualquer status | 17.1 | ✅ trava removida + auditoria preserva histórico |
| (c) Fix de visualização da data | 17.1 | ✅ função `dataParaIso` + frontend `'T12:00:00'` |
| (d) Recorrência mensal | 13 | ✅ migration 011 + service `recorrencia-contas.service.js` |

**Como testar:** cria conta recorrente mensal por 12x com 3 anexos →
edita uma conta paga (com aviso amarelo no modal) → verifica que datas
aparecem corretas.

---

## Sprint 22 — Processos em andamento (item 3 da spec)

Dashboard cross-processo `/instancias` com:
- Toggle "Minhas" (default) vs "Todas que vejo"
- 3 cards de stat: Em andamento, Paradas há 7+ dias (clicável → filtro),
  Total
- Filtros: busca, status, processo, responsável, "Só paradas há 7+ dias"
- Cards com badge vermelho "Parada há X dias" + barra de progresso
  vermelha quando parada

**Backend:**
- `backend/src/controllers/instancias.controller.js`: função `listarGeral`
  com filtros dinâmicos (helper `PH = (n) => String.fromCharCode(36) + n`
  pra evitar bug de `'$' + N` em ferramentas de edição)
- Cálculo de `ultima_movimentacao` via `MAX(cards.atualizado_em)` na query
- Flag `parada = em_andamento + dias_sem_movimentacao >= 7` calculada em JS
- Permissão: admin vê tudo; outros só processos publicados ou de equipes
  que é membro

**Frontend:**
- `frontend/src/pages/Instancias.jsx` (novo)
- Sidebar: item "Em andamento" com ícone `Activity` entre Processos e
  Cartórios

**Como testar:** abre `/instancias` → toggle Minhas/Todas funciona →
clica card de "Paradas" → filtro ativa.

---

## Sprint 21 — Governança: Documentos da empresa + Contratos (item 6)

### 21A — Documentos da empresa

Repositório versionado de documentos institucionais (estatuto, regimento,
certidões, alvarás, etc).

**Backend:**
- Migration **021**: tabela `documentos_empresa` (categoria varchar livre,
  upload via `uploaderGovernanca()`)
- `controllers/documentos-empresa.controller.js`: CRUD + substituirArquivo
  + baixarArquivo (sendFile) + arquivar + excluir
- Rotas: leitura autenticado, escrita admin

**Frontend:**
- `pages/DocumentosEmpresa.jsx`: lista agrupada por categoria, filtros,
  modal Novo/Editar com upload via FormData multipart
- Categorias sugeridas: estatuto, regimento, certidao, alvara, politica,
  procuracao, outro

### 21B — Contratos com terceiros

Cadastro de contratos com clientes/fornecedores/parceiros, com cálculo
de "vencendo" / "vencido" sob demanda (no GET).

**Backend:**
- Migration **021** (mesma): tabela `contratos` com contraparte_*, valor
  numeric(14,2), periodicidade (mensal/anual/unico/outro), status
  (vigente/encerrado/em_negociacao/cancelado), alerta_antes_dias (default 30)
- `controllers/contratos.controller.js`: função `calcularVencimento(c)`
  retorna `{dias_pra_vencer, vencendo, vencido}`
- Ordenação: status vigente DESC, data_fim ASC NULLS LAST

**Frontend:**
- `pages/Contratos.jsx`: 3 cards de stat (Vigentes / Vencendo /
  Vencidos), filtros, badge de vencimento amarelo/vermelho
- `pages/Governanca.jsx`: 2 abas novas (Documentos + Contratos)
- Rotas: `/governanca/documentos`, `/governanca/contratos`

**Como testar:** cadastra documento (estatuto.pdf) → cadastra contrato
com data_fim daqui a 10 dias e alerta=30 → confere badge amarelo
"Vence em 10 dias".

---

## Sprint 20 — Cartórios (item 4 da spec)

Módulo novo pra cadastrar cartórios e vincular a quadros do kanban.

### 20A — Backend + lista

- Migration **020**: 4 tabelas
  - `cartorios` (nome, tipo, status, endereço, contatos, observações)
  - `cartorios_responsaveis` (N:N com pessoas_acesso)
  - `cartorios_quadros` (N:N com quadros + `coluna_id` opcional)
  - `cartorios_historico` (timeline: nota / contato / mudanca_status /
    mudanca_fase / vinculo_quadro / desvinculo_quadro)
- `controllers/cartorios.controller.js`: 10 endpoints + histórico
  automático em cada mudança
- `pages/Cartorios.jsx`: lista com filtros (busca, tipo, status, UF)
- Sidebar: item "Cartórios" com ícone `Building2`

### 20B — Página de detalhe

- `pages/Cartorio.jsx` (novo): 4 seções verticais
  1. Informações básicas (botão editar abre ModalCartorio)
  2. Responsáveis (MultiSelectPessoas)
  3. Vínculos com quadros (vincular, mudar fase, desvincular)
  4. Histórico (timeline com 6 tipos de evento)
- 5 modais: editar / responsáveis / vincular / mudar fase / adicionar nota
- Componente `components/ModalCartorio.jsx` extraído pra reuso

**Como testar:** cadastra cartório (1º RTD São Paulo, tipo: rtd, status:
ativo, cidade: SP, UF: SP) → abre detalhe → adiciona responsável →
vincula a um quadro → vê a timeline preencher.

---

## Sprint 19 — Cor + multi-responsável em eventos do quadro

Eventos do calendário do quadro ganham cor (mesma paleta de 15 cores das
etiquetas) e múltiplos responsáveis.

- Migration **019**: `eventos_quadro.cor` (default 'slate') + tabela
  N:N `eventos_quadro_responsaveis`
- Schema Zod aceita `responsavel_id` (singular, back-compat) ou
  `responsavel_ids` (array). Precedência: array > singular
- Frontend: seletor de cor inline + `MultiSelectPessoas` no modal de evento
- Calendário visual usa cor do evento no chip

---

## Sprint 18 — Múltiplos responsáveis em cards do kanban

Card vira N:N com pessoas (antes era 1:1).

- Migration **018**: tabela `cards_responsaveis` + trigger
  `sync_card_responsavel_principal` que mantém `cards.responsavel_id`
  sincronizado com o **primeiro** da N:N (back-compat com queries antigas)
- Schema Zod aceita `responsavel_id` (singular) ou `responsavel_ids`
  (array). Precedência: array > singular
- Frontend: `MultiSelectPessoas.jsx` (novo componente reutilizável) +
  avatares empilhados nos cards do board
- Notificação: dispara só pro responsável principal (primeiro da lista)
  pra evitar fan-out. Pode evoluir pra notificar todos no futuro

---

## Outras decisões transversais

### Helper `PH = (n) => String.fromCharCode(36) + n`

Em controllers que montam UPDATE dinâmico (`controllers/instancias.controller.js`,
`controllers/cards.controller.js`), evitamos template literal `\`$${var}\``
ou concatenação `'$' + var` literal porque o `Filesystem:edit_file` ocasionalmente
corrompe esses padrões trocando `$` por quebra de linha.

A solução é `const PH = (n) => String.fromCharCode(36) + n;` no topo do
arquivo, e usar `PH(params.length)` em vez de `'$' + params.length`.

### Estratégia de back-compat em campos que viraram N:N

Toda vez que um campo singular vira N:N (responsavel_id em cards e
eventos), seguimos o mesmo padrão:
- Trigger PostgreSQL mantém o campo legado sincronizado com o **primeiro**
  da N:N
- Schema Zod aceita ambos formatos; array tem precedência se ambos vierem
- Helper `resolverResponsaveis(d)` no controller centraliza a regra
- Frontend usa o array (`responsaveis` ou `responsavel_ids`)

### Strategy de uploads

Reusar `uploaderGovernanca()` ou `uploaderComprovantes()` de
`backend/src/utils/uploads.js`. Frontend usa FormData + axios
`Content-Type: multipart/form-data`. Download via `responseType: 'blob'`
+ Blob URL + click programático em `<a>`.

### Permissão padrão pra módulos novos

- **Leitura**: autenticado (qualquer pessoa logada)
- **Escrita**: admin

Exceções explícitas: Cartórios (tudo = autenticado por decisão do
projeto — qualquer membro da equipe pode atualizar contatos).
