# Sprint 16 — Portfólio de produtos

**Status:** ✅ Fase A entregue (CRUD manual completo). Fase B (sync automático com SeuCartorio) fica pra próxima sessão.

## Objetivo

Dar visibilidade pra todos os sócios de **como os produtos da Nexus estão indo**: receita, clientes, churn, conversão, roadmap. Por enquanto só temos um produto (Seu Cartório), mas a estrutura aguenta N produtos.

## Decisões de produto

| Pergunta | Decisão |
|----------|---------|
| Quem vê? | **Todos os sócios autenticados** (transparência) |
| Quem edita? | **Só admin** |
| Como os dados entram? | **Fase A:** manual via UI. **Fase B:** sync automático |
| Layout? | Lista de cards (`/portfolio`) + tela detalhada (`/portfolio/:id`) |
| Métricas tracadas? | Identidade · Receita · Clientes · Conversão · Suporte · Roadmap · Equipe |

## Modelo de dados (migration `014_portfolio_produtos.sql`)

Quatro tabelas:

### `produtos` — cabeçalho
- `nome`, `slug` (pra URL futura), `descricao_curta`, `descricao_longa`
- `status`: em_desenvolvimento / beta / ativo / descontinuado
- `cor` (paleta nexus, 15 opções) e `logo_url` pro visual
- `link_site`, `link_app`, `link_landing`
- `data_lancamento`, `equipe_responsavel_id` (FK pra equipes)
- `fonte_dados` (string): `'manual'` por padrão; vira `'seu_cartorio'` quando ativarmos a Fase B
- `sincronizado_em` (timestamp do último sync; null em manual)
- `arquivado_em` (soft-archive)

**Constraints:** slug e nome únicos entre não-arquivados (permite reciclar se arquivar).

### `produtos_metricas_mensais` — snapshot mensal
Uma linha por produto x mês. Salvar o mesmo mês duas vezes faz UPSERT.
- **Receita:** `mrr`, `receita_total`
- **Clientes:** `clientes_ativos`, `novos_clientes`, `churn_clientes`, `churn_mrr`
- **Suporte:** `tickets_abertos`, `tickets_resolvidos`
- **Funil:** `visitantes_landing`, `trials_iniciados`, `conversoes`
- `observacao` (texto livre)

**Trava:** `mes` sempre é dia 1 do mês (CHECK no banco).

### `produtos_clientes` — lista nominal
- `nome`, `documento` (CNPJ/CPF), `email`, `telefone`
- `plano` (texto livre), `valor_mensal`, `data_inicio`, `data_fim`
- `status`: trial / ativo / pausado / cancelado / inadimplente
- `origem` (vendedor, indicação, marketing...)
- `externo_id` — id do cliente no sistema externo (p. ex. id da `Empresa` no SeuCartorio), pra sync da Fase B

### `produtos_roadmap` — features
- `titulo`, `descricao`, `status` (planejado/em_dev/em_teste/lançado/cancelado)
- `prioridade` (baixa/média/alta)
- `data_prevista`, `data_lancamento`
- `card_id` opcional → vincula com um card real do `/tarefas`

## API (todos os endpoints autenticados; escrita exige admin)

```
GET    /api/produtos
GET    /api/produtos/:id          (aceita id ou slug)
POST   /api/produtos              admin
PUT    /api/produtos/:id          admin
POST   /api/produtos/:id/arquivar admin
POST   /api/produtos/:id/desarquivar admin

GET    /api/produtos/:id/metricas   ?desde=YYYY-MM-DD
POST   /api/produtos/:id/metricas   admin (UPSERT por mês)
DELETE /api/produtos/:id/metricas/:metricaId admin

GET    /api/produtos/:id/clientes   ?status=&busca=
POST   /api/produtos/:id/clientes   admin
PUT    /api/produtos/:id/clientes/:clienteId admin
DELETE /api/produtos/:id/clientes/:clienteId admin

GET    /api/produtos/:id/roadmap
POST   /api/produtos/:id/roadmap   admin
PUT    /api/produtos/:id/roadmap/:itemId admin
DELETE /api/produtos/:id/roadmap/:itemId admin
```

A listagem (`GET /api/produtos`) já vem com agregações pra evitar N+1:
- `mrr_atual`, `clientes_atual`, `receita_mes_atual` (do mês mais recente)
- `serie_mrr` (array dos últimos 6 meses) pra sparkline
- `qtd_clientes_lista` (clientes nominais ativos)

## UI

### `/portfolio` (lista)
- 4 KPIs no topo: MRR consolidado, receita do mês, clientes totais, # produtos ativos
- Filtro de status (Todos / Ativos / Beta / Em desenvolvimento / Descontinuados)
- Cards: logo (ou avatar com iniciais coloridas), nome, status, equipe
- MRR atual + delta % vs mês anterior (▲ verde / ▼ vermelho)
- # clientes ativos + novos no mês
- **Mini-sparkline SVG** dos últimos 6 meses
- Links externos (site/app)
- Admin: botão "Novo produto"

### `/portfolio/:id` (detalhe — 4 tabs)
1. **Visão geral**: 4 KPIs do mês mais recente + gráficos SVG de receita e clientes + funil de conversão + descrição longa
2. **Clientes**: busca + filtro de status + tabela nominal com CRUD admin
3. **Roadmap**: items agrupados por status (em desenvolvimento → em teste → planejado → lançados → cancelados) com prioridades coloridas e link opcional pro card no Kanban
4. **Métricas**: tabela mês a mês + modal de UPSERT com fieldsets (Receita / Clientes / Suporte / Funil)

Edição inline pelo botão "Editar" no cabeçalho (modal com nome, slug, descrições, status, cor, datas, todas as URLs).

## Por que dois passos (Fase A → Fase B)?

Bancos diferentes (Postgres vs MySQL), apps diferentes, deploys diferentes. Fazer integração agora obrigaria a:
1. Decifrar onde MRR/churn/clientes ficam de fato no schema do SeuCartorio (`Assinatura`, `Fatura`, etc.)
2. Criar endpoint `/api/integracoes/metricas-portfolio` no SeuCartorio
3. Configurar credenciais entre os dois apps
4. Lidar com mudanças de schema lá

Manual primeiro = portfólio funcionando hoje, integração vem depois sem desperdício de UI.

## O que vem na Fase B (próxima sessão)

1. **No SeuCartorio**: criar endpoint `/api/integracoes/metricas-portfolio` que retorna:
   - Lista de clientes (Empresa, com plano, valor, status)
   - Métricas agregadas do mês: MRR, novos, churn, churn MRR, tickets
2. **No GestaoNexus**: criar serviço `services/sync-portfolio.service.js` + cron noturno que:
   - Lê `produtos` com `fonte_dados != 'manual'`
   - Faz fetch no endpoint do SeuCartorio
   - UPSERT em `produtos_metricas_mensais` (mês atual)
   - UPSERT em `produtos_clientes` por `externo_id`
   - Atualiza `sincronizado_em`
3. **Na Railway**: configurar `INTEGRACAO_SEU_CARTORIO_URL` e `INTEGRACAO_SEU_CARTORIO_KEY` como env vars

Quando tudo estiver pronto, mudar `fonte_dados` do produto Seu Cartório de `'manual'` pra `'seu_cartorio'` e a UI já reflete (mostra o badge "Sync: seu_cartorio" no cabeçalho).

## Arquivos novos

```
backend/db/migrations/014_portfolio_produtos.sql
backend/src/controllers/produtos.controller.js
backend/src/controllers/produtos-metricas.controller.js
backend/src/controllers/produtos-clientes.controller.js
backend/src/controllers/produtos-roadmap.controller.js
backend/src/routes/produtos.routes.js
frontend/src/pages/Portfolio.jsx
frontend/src/pages/PortfolioProduto.jsx
docs/sprint-16-portfolio-produtos.md (este arquivo)
```

Editados:
- `backend/src/routes/index.js` (plug + bump versão pra 1.4)
- `frontend/src/App.jsx` (rotas)
- `frontend/src/components/Sidebar.jsx` (item "Portfólio")

## Como testar em produção depois do deploy

1. Login admin
2. Sidebar → **Portfólio**
3. Ver o card "Seu Cartório" criado pelo seed
4. Clicar no card → tela de detalhe
5. Tab **Métricas** → "Adicionar mês" → preencher MRR, clientes, etc → salvar
6. Voltar pra tab **Visão geral** → conferir gráficos preenchidos
7. Tab **Clientes** → "Novo cliente" → cadastrar 2-3 manualmente
8. Tab **Roadmap** → "Novo item" → cadastrar 2-3 features
9. Voltar pra `/portfolio` → conferir card com MRR e sparkline atualizados
10. Botão "Novo produto" pra testar criação de outro produto (depois pode arquivar)
