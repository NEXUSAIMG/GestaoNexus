# Sprint 15 — Execução de processos (instâncias)

A Sprint 14 deu o **construtor** visual de processos. Esta sprint dá a
**execução**: você inicia uma instância e o sistema gera cards no
Kanban, avançando o fluxo automaticamente conforme você conclui cada
etapa.

## 1. O que essa sprint resolve

Antes: processos eram só documentação visual. Útil pra alinhar a
equipe, mas não tinha "ação". Agora: cada processo vira uma máquina de
execução. Inicia uma instância → vira um quadro Kanban com cards
nascendo no ritmo certo, prazos calculados, decisões registradas.

Casos típicos:
- "Onboarding do cliente João" — 8 etapas, distribuídas entre
  Comercial, Jurídico e Financeiro
- "Fechamento contábil de novembro" — etapas com prazos cumulativos
- "Aprovação de compra > R$ 10mil" — decisão (aprovado/rejeitado)
  bifurca o fluxo

## 2. Modelo

```
processos                       (Sprint 14)
processos_nos                   (Sprint 14)
processos_arestas               (Sprint 14)
processos_papeis                (Sprint 14)
processos_equipes               (Sprint 14)

processos_instancias            ← NOVO: cabeçalho de uma execução
  ├── quadro_id                   ↓ aponta pra um quadro Sprint 10
  ├── coluna_concluida_id         ↓ qual coluna dispara o avanço
  └── coluna_andamento_id

processos_instancias_nos        ← NOVO: estado de cada nó na execução
  ├── status (pendente|ativo|concluido|pulado)
  ├── card_id                     ↓ card gerado (se for tarefa/decisão)
  └── saida_escolhida_aresta_id   ↓ pra decisões
```

E uma coluna nova:
```
cards.instancia_no_id           ← NOVO: liga card → nó da instância
```

## 3. Fluxo de execução

### Iniciar
1. Editor de processo (status `publicado`) → botão **Iniciar instância**
2. Modal pede nome (ex: "Cliente João Silva") e data de início
3. Backend (`criarInstancia` no service):
   - Cria **um quadro novo** com nome `{Processo} — {Instância}`
   - Cria **3 colunas padrão**: A fazer / Em andamento / Concluído
   - Cria 1 linha em `processos_instancias_nos` por nó (status `pendente`)
   - Marca nós `inicio` como `concluido` imediatamente
   - Ativa nós conectados ao Início → cria cards na coluna "A fazer"
4. Redireciona pro quadro

### Card progride
- Usuário move card pra coluna **"Concluído"**
- `cards.controller#mover` detecta hook (card tem `instancia_no_id` E
  coluna destino == `coluna_concluida_id`)
- Chama `avancarApos`:
  - Marca o nó como `concluido`
  - **Se for tarefa**: pega arestas saindo → ativa cada destino → cria card
  - **Se for decisão**: NÃO avança automático — espera escolha
  - Verifica se todos os nós-fim foram alcançados → marca instância
    como `concluida`

### Decisão
- Card de decisão movido pra "Concluído" → backend marca como
  `concluido` mas `saida_escolhida_aresta_id` fica `NULL`
- Frontend (Quadro.jsx) recarrega instância → vê decisão pendente →
  abre modal **"Escolher saída"** com botões pelos rótulos das arestas
- Usuário escolhe → `POST /api/instancias/:nodeId/escolher-saida` →
  ativa só o destino daquela aresta específica

### Cancelar
- Admin (ou quem iniciou) cancela com motivo
- Cards pendentes (status `ativo`) são arquivados em batch
- Cards já concluídos ficam intactos (histórico)

## 4. Endpoints

```
POST   /api/processos/:id/instancias                   # criar (gera quadro)
GET    /api/processos/:id/instancias                   # listar do processo
GET    /api/instancias/:id                             # detalhes + decisões pendentes
GET    /api/instancias/por-quadro/:quadroId            # 204 se quadro != instância
POST   /api/instancias/:nodeId/escolher-saida          # pra decisões
POST   /api/instancias/:id/cancelar
```

## 5. Visibilidade & permissões

| Quem | Ver | Iniciar | Cancelar |
|---|---|---|---|
| Admin | tudo | qualquer processo publicado | qualquer |
| Membro de equipe associada | sim | sim | só se iniciou |
| Outros (com processo publicado) | sim (transparência) | não | não |

## 6. Frontend

**Editor de processo** (`/processos/:id`):
- Botão **"Iniciar instância"** (só aparece se status=publicado)
- Botão **"Instâncias"** sempre disponível, leva pra lista
- Modal `ModalIniciarInstancia` pede nome + descrição + data início

**Lista de instâncias** (`/processos/:id/instancias`):
- Filtros por status (em andamento / concluídas / canceladas / todas)
- Cards com barra de progresso `nos_concluidos / total_nos`
- Botão **"Abrir quadro"** vai pro Kanban da instância
- Botão cancelar (admin) com motivo

**Quadro de instância** (`/tarefas/{quadro_da_instancia}`):
- Header dedicado no topo: nome do processo + nome da instância +
  progresso + atalho pra "Todas as instâncias"
- Banner amarelo quando há **decisão pendente** ("Escolher saída")
- Modal `ModalEscolherSaida` abre automaticamente quando detecta
  decisão pendente, com botões pelos rótulos das arestas
- Drag & drop normal funciona — só que mover pra "Concluído"
  dispara avanço automático no servidor

## 7. Como rodar

```bash
cd backend
npm run migrate          # aplica 013
# (se já tinha backend rodando, mate processos zumbis e suba de novo)
npm run dev:backend

cd ../frontend
npm run dev:frontend
```

Sem deps novas (reactflow já estava da Sprint 14).

## 8. Roteiro de testes

Pré-requisito: ter um processo publicado com pelo menos
Início → Tarefa → Decisão → 2 ramos → Fim, e equipes/papéis associados.

- [ ] **Iniciar**: editor do processo → "Iniciar instância" → preenche nome
      "Cliente Teste 1" → submete → redireciona pro quadro novo
- [ ] **Quadro novo** existe com 3 colunas e cards iniciais na "A fazer"
- [ ] **Header de instância** aparece no topo com nome + progresso
- [ ] **Mover** card pra "Concluído" → próximo card aparece automaticamente
      em "A fazer" (refresh acontece)
- [ ] **Mover** card de decisão pra "Concluído" → banner amarelo aparece
      no header + modal "Escolher saída" abre automaticamente
- [ ] **Escolher saída** → modal fecha → cards do ramo escolhido nascem
- [ ] **Mover** todos até o Fim → instância vira "concluída", barra fica
      verde, sem mais cards ativos
- [ ] **Lista de instâncias**: aparece a "Cliente Teste 1" com 100% verde
- [ ] **Iniciar segunda instância** "Cliente Teste 2" — quadro NOVO
      separado, sem interferir na primeira
- [ ] **Cancelar** uma instância em andamento → cards ativos arquivados,
      status muda
- [ ] **Não-admin**: pode iniciar se for membro da equipe associada,
      pode ver progresso, NÃO pode cancelar (a menos que tenha iniciado)

## 9. Limitações conhecidas

- **Sem paralelismo real**: se 2+ arestas saem de um nó, ambos
  destinos viram ativos e geram cards. Mas não há gateway "join"
  esperando todos voltarem. Pra processos com paralelo + sincronização,
  precisa de uma sprint futura.
- **Edição do processo afeta instâncias futuras**: a instância guarda
  `versao_processo` mas não snapshot dos nós. Se o admin alterar
  drasticamente a estrutura, instâncias antigas em andamento podem
  ficar inconsistentes (ex: nó foi removido do processo). Mitigação
  atual: as FKs são `ON DELETE RESTRICT`, então o admin não consegue
  apagar nós que estão sendo usados em instâncias ativas.
- **Sem reabrir nó concluído**: se o usuário concluiu por engano,
  precisa cancelar a instância e iniciar de novo. (Em uma futura
  sprint dá pra adicionar "voltar etapa".)
- **Decisões só múltipla escolha (não condições)**: o usuário escolhe
  manualmente — não há "se X > 100, vai pelo ramo A". Suficiente pra
  esta versão.
- **Sem notificações específicas**: o card avisa o responsável (Sprint
  10), mas não há e-mail "instância concluída" ou "decisão te espera".
- **Cards arquivados de instância cancelada**: ficam arquivados, não
  são apagados. Histórico completo preservado.

## 10. Arquivos da sprint

**Backend:**
- `db/migrations/013_processos_instancias.sql` (novo)
- `src/services/instancias.service.js` (novo, ~300 linhas)
- `src/controllers/instancias.controller.js` (novo)
- `src/routes/instancias.routes.js` (novo)
- Edits: `controllers/cards.controller.js` (hook em `mover`),
  `routes/processos.routes.js` (rotas de listar/criar instâncias),
  `routes/index.js` (plug `/api/instancias`)

**Frontend:**
- `src/pages/InstanciasProcesso.jsx` (novo, lista + modal cancelar)
- Edits: `pages/EditorProcesso.jsx` (botões "Iniciar"/"Instâncias" +
  ModalIniciarInstancia), `pages/Quadro.jsx` (HeaderInstancia +
  ModalEscolherSaida + hook após mover), `App.jsx` (rota nova)

**Doc:**
- `docs/sprint-15-execucao-processos.md`

**Total**: 5 arquivos novos, 5 editados.
