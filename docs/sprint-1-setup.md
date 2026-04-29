# Sprint 1 — Fundação

Passo a passo para rodar o projeto localmente e subir no Railway.

## 1. O que fica pronto nesta sprint

- Estrutura do projeto (backend Node/Express + frontend React/Vite + Postgres)
- Tela de login com e-mail e senha
- Cadastro, edição, inativação e troca de senha de sócios
- Painel inicial com o mapa de todas as áreas (disponíveis e em construção)
- Esqueletos das áreas que vêm nas próximas sprints
- Deploy pronto para o Railway (um serviço só: backend serve o frontend buildado)

## 2. Pré-requisitos

- **Node.js 20+** — verifique com `node -v`
- **Git**
- **Postgres rodando** (local ou Railway). Local: instale o Postgres 15+ ou use Docker:
  ```bash
  docker run --name nexus-pg -e POSTGRES_PASSWORD=postgres \
    -e POSTGRES_DB=gestao_nexus -p 5432:5432 -d postgres:16
  ```

## 3. Rodando localmente

### 3.1 Clonar e instalar

```bash
cd GestaoNexus
npm run install:all
```

Esse comando instala as dependências em três lugares: raiz, `backend/` e `frontend/`.

### 3.2 Configurar o backend

```bash
cd backend
cp .env.example .env
```

Abra o `.env` e ajuste:

- `DATABASE_URL` — aponte para seu Postgres local
- `JWT_SECRET` — gere um valor aleatório longo, por exemplo:
  ```bash
  node -e "console.log(require('crypto').randomBytes(48).toString('base64'))"
  ```
- `SEED_ADMIN_*` — defina nome/e-mail/senha do primeiro administrador

### 3.3 Criar as tabelas e o primeiro sócio

Ainda dentro de `backend/`:

```bash
npm run migrate
npm run seed
```

- `migrate` cria as tabelas do banco
- `seed` cria o primeiro sócio administrador usando as variáveis `SEED_ADMIN_*`

### 3.4 Rodar backend e frontend

Em dois terminais separados, a partir da raiz:

```bash
# terminal 1
npm run dev:backend
# → http://localhost:3001
```

```bash
# terminal 2
npm run dev:frontend
# → http://localhost:5173
```

Abra http://localhost:5173 e entre com o e-mail e senha do seed.

> **Dica:** o Vite já faz proxy de `/api/*` para o backend em `localhost:3001`.
> Você não precisa mexer no CORS nem em variáveis de ambiente do frontend em dev.

## 4. Subindo no Railway

A estratégia é **um serviço só** — o backend serve o build do frontend.
Mais simples, mais barato, menos coisa para manter.

### 4.1 Criar o projeto

1. Crie uma conta em https://railway.com e um novo projeto.
2. Dentro do projeto, clique em **Add Service → Database → PostgreSQL**.
   O Railway vai criar automaticamente a variável `DATABASE_URL`.
3. Clique em **Add Service → GitHub Repo** e conecte o repositório do GestaoNexus.
   (Ou use **Empty Service** + `railway up` pelo CLI se preferir.)

### 4.2 Variáveis de ambiente

No serviço do app, adicione em **Variables**:

| Variável              | Valor                                                             |
| --------------------- | ----------------------------------------------------------------- |
| `NODE_ENV`            | `production`                                                      |
| `JWT_SECRET`          | (gere um valor aleatório — use o comando do node acima)           |
| `JWT_EXPIRES_IN`      | `7d`                                                              |
| `SEED_ADMIN_NOME`     | Nome do primeiro admin                                            |
| `SEED_ADMIN_EMAIL`    | E-mail do primeiro admin                                          |
| `SEED_ADMIN_SENHA`    | Senha inicial (troque no primeiro acesso)                         |
| `SEED_ADMIN_PERCENTUAL` | `0` (ou o percentual de participação)                           |
| `CORS_ORIGIN`         | (deixe vazio — o backend serve o frontend no mesmo host)          |

A `DATABASE_URL` **não precisa** ser preenchida manualmente: clique em
**Add Reference → Postgres.DATABASE_URL** para o Railway injetar automaticamente.

### 4.3 Build e start

O `railway.json` na raiz já define:

- **Build:** `npm run build` (instala dependências e builda o frontend)
- **Start:** `npm run start` (inicia o backend Express)

No primeiro deploy, a porta é gerenciada pelo próprio Railway via `PORT`.

### 4.4 Rodar migrations e seed em produção

Depois do primeiro deploy bem-sucedido, abra o shell do serviço no Railway
(aba **"Deployments" → "..." → "Open Shell"** ou via `railway run`) e execute:

```bash
npm run migrate
npm run seed
```

Pronto. Abra o domínio gerado pelo Railway (algo como
`gestao-nexus.up.railway.app`) e entre com as credenciais do `SEED_ADMIN_*`.

> **Próximo passo:** em **Settings → Domains** você pode adicionar um domínio
> próprio (ex: `gestao.nexus.com.br`) quando quiser.

## 5. Estrutura dos diretórios

```
GestaoNexus/
├── package.json              # scripts orquestradores (build/start/migrate/seed)
├── railway.json              # configuração de deploy
├── backend/
│   ├── package.json
│   ├── .env.example
│   ├── db/
│   │   ├── migrations/       # SQL versionado
│   │   └── scripts/          # migrate.js e seed.js
│   └── src/
│       ├── server.js         # Express + serve do frontend buildado
│       ├── config/           # env, banco
│       ├── routes/           # /api/auth, /api/socios, /api/saude
│       ├── controllers/
│       ├── middleware/       # autenticar, exigirAdmin, tratador de erros
│       └── utils/            # jwt, password, errors
├── frontend/
│   ├── package.json
│   ├── vite.config.js        # proxy /api → backend em dev
│   ├── tailwind.config.js
│   ├── index.html
│   └── src/
│       ├── main.jsx
│       ├── App.jsx           # rotas (pública /login e protegidas)
│       ├── api/client.js     # axios com interceptor de JWT
│       ├── context/          # AuthContext
│       ├── components/       # Layout, Sidebar, ProtectedRoute, EmConstrucao
│       └── pages/            # Login, Dashboard, Socios, Caixa, Mensal, Lucros, Governanca
└── docs/
    └── sprint-1-setup.md     # este arquivo
```

## 6. O que testar antes de declarar a sprint concluída

- [ ] Login com o usuário do seed funciona
- [ ] Login com senha errada mostra mensagem clara (e não derruba o app)
- [ ] Depois de 10 tentativas erradas, o rate-limit bloqueia por 15 min (esperado)
- [ ] Painel inicial mostra os cards das 5 áreas com os marcadores de sprint
- [ ] Menu lateral navega entre todas as páginas, inclusive os esqueletos
- [ ] Em **Sócios**, um administrador consegue:
  - [ ] Criar um novo sócio (com senha mínima de 8 caracteres)
  - [ ] Editar nome, percentual, admin/ativo de outro sócio
  - [ ] Ver o cartão "Participação total" alertando quando não fecha em 100%
- [ ] Qualquer sócio consegue trocar a própria senha (exige a senha atual)
- [ ] Administrador consegue trocar a senha de outro sócio (sem exigir a atual)
- [ ] Sair (logout) redireciona para /login e protege as rotas novamente
- [ ] A aplicação é navegável no celular (menu lateral vira drawer)

## 7. O que NÃO está pronto (de propósito)

As áreas de **Caixa**, **Mês a mês**, **Sócios & Lucros** e **Governança**
mostram uma tela "em construção" com a lista do que virá. Isso é intencional
para manter o escopo da Sprint 1 pequeno e entregue.

## 8. Próxima sprint

**Sprint 2 — Integração ASAAS + Caixa parte 1 (entradas)**

Escopo previsto:
- Rotina diária que roda às 5h e puxa cobranças do ASAAS
- Cadastro manual das contas bancárias com saldo diário
- Tela de Caixa mostrando: saldo atual + previsão de entradas 30/60/90 dias
- Botão "Atualizar agora" para forçar uma sincronização manual
- Log de execução da rotina (deu certo? deu erro? o que puxou?)
