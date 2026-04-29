# Gestão Nexus

Ferramenta de gestão e transparência para os sócios da Nexus.
Cobre comercial, financeiro, contábil, governança societária e gestão
operacional de tarefas.

## Status: v1.0 — 10 sprints entregues

Funcionalidades disponíveis:

- **Login** com e-mail/senha + JWT, com suporte a representantes (Cenário B)
- **Caixa** com integração ASAAS opcional (cobranças, recebimentos)
- **Contas a pagar** com categorias, fluxo de pagamento e comprovantes
- **Mês a mês** consolidado com gráficos de fluxo
- **Sócios & Lucros** com pró-labore, distribuições e aportes
- **Governança** com atas, documentos versionados, decisões com voto,
  contrato social e calendário de eventos
- **Calendário com recorrência** (mensal/trimestral/semestral/anual)
- **Notificações** in-app + e-mail (Resend) com resumo diário
- **Conciliação bancária** via OFX/CSV
- **Tarefas** estilo Trello, organizadas por equipes (Sprint 10)

## Stack

- **Backend**: Node.js 20+ / Express / PostgreSQL 14+
- **Frontend**: React 18 / Vite / Tailwind CSS / @dnd-kit
- **Autenticação**: JWT + bcrypt
- **Hospedagem sugerida**: Railway (backend) + Neon (banco)

## Estrutura

```
GestaoNexus/
├── backend/          API em Node/Express
│   ├── db/migrations/    9 migrations idempotentes
│   └── src/
├── frontend/         App React/Vite
├── docs/             Documentação por sprint
└── railway.json      Configuração de deploy
```

## Como rodar localmente

### Pré-requisitos
- **Node.js 20+** ([nodejs.org](https://nodejs.org), versão LTS)
- **Banco PostgreSQL**: pode ser local ou remoto. Recomendamos
  [Neon](https://neon.tech) (free tier, sem instalação local).

### Setup (uma vez)

1. **Criar banco no Neon**
   - Cria conta em https://neon.tech
   - Novo projeto: `gestao-nexus`, região mais próxima
   - Copia a connection string (formato `postgresql://...?sslmode=require`)

2. **Configurar o `.env`**
   - O arquivo `backend/.env` já vem com placeholders.
   - Edita só **2 valores**:
     - `DATABASE_URL` → cola a URL do Neon
     - `JWT_SECRET` → string longa aleatória (PowerShell:
       `[Convert]::ToBase64String((1..48 | %{ Get-Random -Maximum 256 }))`)

3. **Instalar dependências**
   ```bash
   npm run install:all
   ```

4. **Criar tabelas e usuário admin**
   ```bash
   npm run migrate
   npm run seed
   ```

### Rodar (toda vez)

Em **dois terminais separados**:

```bash
# Terminal 1 — backend
npm run dev:backend

# Terminal 2 — frontend
npm run dev:frontend
```

Acessa **http://localhost:5173** e loga com:
- E-mail: `admin@nexus.com.br`
- Senha: `MudarDepoisDoPrimeiroLogin123!` (ou o que estiver no `.env`)

> ⚠️ **Troque a senha imediatamente após o primeiro login.**

## Documentação por sprint

Cada sprint tem doc própria em `docs/`:

| Sprint | Tópico | Doc |
|---|---|---|
| 1 | Setup, login, sócios | `sprint-1-setup.md` |
| 1.5 | Representantes | `sprint-1.5-representantes.md` |
| 2 | ASAAS + caixa | `sprint-2-asaas-caixa.md` |
| 3 | Contas a pagar | `sprint-3-contas-pagar.md` |
| 4 | Mês a mês | `sprint-4-mensal.md` |
| 5 | Sócios + lucros | `sprint-5-socios-lucros.md` |
| 6 | Governança | `sprint-6-governanca.md` |
| 7 | Notificações + e-mails | `sprint-7-polimento.md` |
| 8 | Recorrência + alertas vencidos | `sprint-8-recorrencia-vencidos.md` |
| 10 | Tarefas (Trello interno) | `sprint-10-tarefas.md` |

## Deploy

Ver `railway.json`. Variáveis de ambiente importantes em produção:
- `DATABASE_URL` (injetada se anexar Postgres no Railway, OU usar Neon)
- `JWT_SECRET` (obrigatória)
- `UPLOADS_DIR=/data/uploads` (Volume montado em `/data`)
- `RESEND_API_KEY` (se for usar e-mail)
- `APP_URL=https://seu-app.up.railway.app`

## Problemas comuns

**"ECONNREFUSED" no backend** → Banco inacessível. Confere a `DATABASE_URL` no `.env`.

**"SSL/TLS required"** → Faltou o `?sslmode=require` no fim da URL do Neon, OU está usando uma versão antiga do `database.js` sem detecção automática de SSL.

**"Cannot find module '@dnd-kit/core'"** → Faltou rodar `npm install` no frontend depois da Sprint 10.

**OneDrive trava o `node_modules`** → Excluir as pastas `node_modules` da sincronização do OneDrive (Explorer → botão direito → "Sempre manter neste dispositivo" desmarcado).

## Licença

Privado.
