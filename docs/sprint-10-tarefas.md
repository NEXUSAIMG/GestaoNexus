# Sprint 10 — Tarefas (Trello interno)

Módulo de gestão de tarefas estilo kanban, organizado por equipes.

## 1. O que essa sprint resolve

A Gestão Nexus já cobria caixa, contas a pagar, sócios, governança,
recorrência de eventos e conciliação. Faltava onde o trabalho operacional
do dia a dia fica registrado: pra que serve "fazer reunião mensal de sócios"
no calendário sem ter onde colocar os 12 itens da pauta? Trello/Asana faziam
esse papel mas em outra ferramenta — agora está dentro.

Casos de uso típicos:

- **Equipe Financeira** com quadro fechado "Conciliações pendentes"
- **Equipe Produto** com quadro aberto a sócios "Roadmap" (transparência)
- **Equipe Comercial** com quadro fechado "Pipeline de clientes"

## 2. Modelo

```
equipes
  ├── equipes_membros (N:N pessoas_acesso, papel='lider'|'membro')
  └── quadros
        ├── quadros_etiquetas
        └── colunas
              └── cards
                    └── cards_etiquetas (N:N quadros_etiquetas)
```

**Decisões importantes:**

- **Equipes ≠ sócios.** Equipes agrupam pessoas_acesso pra organizar
  acesso operacional. Não estão vinculadas a participação societária.
- **Quadro pertence a UMA equipe.** Membros da equipe acessam todos
  os quadros dela automaticamente — sem listar membros por quadro.
- **`aberto_a_socios`** flag por quadro: se TRUE, qualquer pessoa
  autenticada visualiza (mesmo sem ser membro), mas só membros editam.
- **Soft delete** (campo `arquivado_em`/`arquivada_em`) em equipes,
  quadros, colunas e cards. Histórico preservado.
- **Reordenação** com `ordem` numérico (passos de 1000 entre vizinhos),
  com renormalização raríssima quando o gap fica < 2.

## 3. Permissões

| Ação | Quem pode |
|---|---|
| Criar equipe | Admin do sistema |
| Editar equipe / arquivar / mexer em membros | Admin OU líder da equipe |
| Desarquivar equipe | Admin |
| Criar quadro | Admin OU membro da equipe |
| Editar/arquivar quadro | Admin OU membro da equipe |
| Visualizar quadro | Membros da equipe **ou** qualquer autenticado se `aberto_a_socios=true` |
| Criar/mover/editar cards | Admin OU membro da equipe |
| Visualizar cards | Mesma regra do quadro |

Validação dupla: backend (controllers) + frontend (esconde botões).

## 4. Drag & drop

Biblioteca: `@dnd-kit/core` + `@dnd-kit/sortable` + `@dnd-kit/utilities`.

- **Sensor**: PointerSensor com distância mínima de 5px (evita disparar drag
  ao clicar pra abrir card)
- **Estado otimista**: move local, dispara `POST /api/cards/:id/mover`,
  recarrega o quadro no sucesso (pra pegar a ordem real do servidor),
  reverte no erro
- **Mover entre colunas**: payload `{ coluna_id, posicao }` — backend
  calcula a `ordem` correta inserindo entre vizinhos
- **Não suporta** mover card entre quadros (caso raro, complica modelo)

## 5. Notificações

Reusa toda a infra da Sprint 7 (in-app + e-mail via Resend).

**Eventos novos:**

- `tarefa.card_atribuido` — quando alguém atribui você como responsável
  num card (e a pessoa que atribuiu não é você mesma)
- `tarefa.prazo_hoje` — cron diário 8h, lista de cards seus com prazo hoje
  (envio um e-mail por pessoa, não um por card)

**Configuração:** `Configuracoes` → toggles `email_card_atribuido` e
`email_card_prazo_amanha` (ambos ligados por padrão). Notificação
in-app sempre rola.

## 6. Endpoints novos

```
# Equipes
GET    /api/equipes
GET    /api/equipes/:id
POST   /api/equipes                              (admin)
PUT    /api/equipes/:id                          (admin OU líder)
POST   /api/equipes/:id/arquivar                 (admin OU líder)
POST   /api/equipes/:id/desarquivar              (admin)
POST   /api/equipes/:id/membros                  (admin OU líder)
PUT    /api/equipes/:eqId/membros/:mId           (admin OU líder)
DELETE /api/equipes/:eqId/membros/:mId           (admin OU líder)

# Quadros
GET    /api/quadros[?equipe_id=]
GET    /api/quadros/:id
POST   /api/quadros                              (membro da equipe)
PUT    /api/quadros/:id                          (membro da equipe)
POST   /api/quadros/:id/arquivar                 (membro da equipe)
POST   /api/quadros/:id/colunas                  (membro da equipe)
POST   /api/quadros/:id/etiquetas                (membro da equipe)
PUT    /api/quadros/:id/etiquetas/:eId           (membro da equipe)
DELETE /api/quadros/:id/etiquetas/:eId           (membro da equipe)

# Colunas
PUT    /api/colunas/:id                          (membro da equipe)
POST   /api/colunas/:id/mover                    (membro da equipe)
POST   /api/colunas/:id/arquivar                 (membro da equipe)

# Cards
GET    /api/cards/meus                           (autenticado)
GET    /api/cards/:id                            (membro OU quadro aberto)
POST   /api/cards                                (membro da equipe)
PUT    /api/cards/:id                            (membro da equipe)
POST   /api/cards/:id/mover                      (membro da equipe)
POST   /api/cards/:id/arquivar                   (membro da equipe)
```

## 7. Como rodar

```bash
cd backend
npm install              # nada novo
npm run migrate          # aplica 009_tarefas.sql
npm run dev

cd ../frontend
npm install              # NOVO: @dnd-kit/core, @dnd-kit/sortable, @dnd-kit/utilities
npm run dev
```

## 8. Roteiro de testes

### Equipes
- [ ] Admin cria equipe "Financeiro" cor azul
- [ ] Adiciona 2 membros, promove 1 a líder
- [ ] Líder consegue editar nome da equipe; membro comum não consegue
- [ ] Tentar remover último líder → erro claro
- [ ] Arquiva equipe → some da listagem default; aparece com filtro "incluir arquivadas"

### Quadros
- [ ] Membro cria quadro "Conciliações" → 3 colunas padrão + 4 etiquetas padrão aparecem
- [ ] Marca `aberto_a_socios=true` → ícone de globo aparece
- [ ] Sócio sem ser membro vê o quadro; tenta criar card → backend bloqueia
- [ ] Admin sempre vê todos os quadros, mesmo sem ser membro

### Cards e drag & drop
- [ ] Cria card "Bug do extrato" com responsável + prazo amanhã + 2 etiquetas
- [ ] Responsável recebe notificação in-app + e-mail (se Resend configurado)
- [ ] Arrasta o card pra "Em andamento" → ordem persiste após F5
- [ ] Arrasta card dentro da mesma coluna pra reordenar
- [ ] Arrasta card pra coluna vazia
- [ ] Filtro "Atrasados" mostra só os com prazo passado
- [ ] Filtro por responsável + etiqueta combinam (AND)
- [ ] Arquivar card → some do board

### Cron de prazos
- [ ] Cria card com prazo HOJE pra você
- [ ] Roda manualmente o cron das 8h (ou aguarda) → recebe e-mail
- [ ] Notificação in-app aparece com a contagem
- [ ] Cards com prazo amanhã NÃO entram (só os de hoje)

## 9. O que NÃO entrou (pra futuro)

- Comentários nos cards (médio)
- Anexos nos cards (reusa infra de uploads)
- Checklists dentro do card
- Múltiplos responsáveis (precisa tabela N:N)
- Histórico de movimentação ("Ana moveu de X pra Y às 14h")
- Templates de quadro
- Visões alternativas (lista, calendário, swimlanes)
- Reordenar colunas via drag (hoje só por API endpoint, não pela UI)

## 10. Arquivos da sprint

**Backend:**
- `db/migrations/009_tarefas.sql`
- `src/controllers/equipes.controller.js`
- `src/controllers/quadros.controller.js`
- `src/controllers/colunas.controller.js`
- `src/controllers/cards.controller.js`
- `src/routes/equipes.routes.js`
- `src/routes/quadros.routes.js`
- `src/routes/colunas.routes.js`
- `src/routes/cards.routes.js`
- Edits: `routes/index.js`, `services/notificacoes.service.js`,
  `services/email-templates.js`, `services/scheduler.js`,
  `controllers/configuracoes-notificacoes.controller.js`, `utils/audit.js` (fix C1)

**Frontend:**
- `src/pages/Equipes.jsx`
- `src/pages/Tarefas.jsx`
- `src/pages/Quadro.jsx`
- Edits: `App.jsx`, `Sidebar.jsx`, `Configuracoes.jsx`, `Login.jsx`,
  `Dashboard.jsx`, `package.json`

**Total**: 14 arquivos novos, 9 editados.

## 11. Observação sobre o C1

Esta sprint inclui o fix do bug **C1** identificado na auditoria estática:
`utils/audit.js` agora aceita tanto `pessoa_acesso_id`/`socio_id` quanto
`pessoaId`/`socioId`. Isso elimina silenciosamente os logs órfãos que vinham
sendo gerados em governança, eventos, comprovantes, configurações de
notificação e conciliação. Sem esse fix, todos os logs novos da Sprint 10
também sairiam órfãos.
