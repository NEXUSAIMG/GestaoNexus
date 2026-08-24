# Ambiente local de testes — credenciais e como subir

Referência rápida pra não redescobrir isso a cada sessão de teste. Passo a
passo completo está em `testes/README.md`; aqui só o que muda de sessão pra
sessão (credenciais, portas, comandos do dia a dia).

## Credenciais

| | |
|---|---|
| Login do admin | `admin@local.test` / `SenhaLocal123!` |
| Nome da pessoa admin (pra bater com os testes) | `Admin Local` |
| Postgres | `postgresql://nexus:nexus@localhost:55432/gestao_nexus` |
| Backend | `http://localhost:3001` |

`backend/.env` (gitignored, recriar se não existir):

```env
NODE_ENV=development
PORT=3001
DATABASE_URL=postgresql://nexus:nexus@localhost:55432/gestao_nexus
JWT_SECRET=qualquer-coisa-longa-para-uso-local
SEED_ADMIN_NOME=Admin Local
SEED_ADMIN_EMAIL=admin@local.test
SEED_ADMIN_SENHA=SenhaLocal123!
UPLOADS_DIR=/tmp/uploads-ayio
UPLOADS_MAX_MB=10
SYNC_ASAAS_ATIVO=false
NOTIFICACOES_ATIVO=false
PORTFOLIO_SYNC_ATIVO=false
```

O `SEED_ADMIN_NOME=Admin Local` importa: os testes (`t-historico.mjs`,
`t-importar.mjs`, `t-importar-real.mjs`, `t-quadro.mjs`) esperam esse nome
exato pra pessoa autora de movimentos/comentários. Sem ele o seed cria
"Administrador" e uma parte da bateria falha por isso — não é bug de código,
é descompasso com o `.env` de exemplo do README.

## Subir do zero

```bash
npm install --prefix testes
npm install --prefix backend
npm run db:criar --prefix testes      # cria o cluster (uma vez)
npm run migrate --prefix backend
npm run seed --prefix backend
```

## Rodar no dia a dia

O Postgres embarcado (`testes/pg-start.mjs`) sobe e o processo Node sai em
seguida — em terminal normal o `postgres.exe` fica órfão e continua vivo.
Isso **não funciona em ambiente sandboxado** (ex.: agente rodando comando em
background com kill-on-exit da árvore de processos): ali o Postgres morre
junto quando o processo que o lançou termina. Se for esse o caso, precisa de
um script que fique bloqueado (`await new Promise(() => {})`) depois de
`pg.start()`, rodando de dentro de `testes/` (resolução de módulo ESM exige
isso pra achar `node_modules/embedded-postgres`).

Em terminal normal, o fluxo do README funciona direto:

```bash
npm run db:subir --prefix testes
npm run start --prefix backend
```

Parar tudo: `npm run db:parar --prefix testes` (ou `taskkill /F /IM
postgres.exe` e `taskkill /F /IM node.exe` se o processo ficou órfão).

## Correções aplicadas pro Windows funcionar

`testes/pg-start.mjs` tinha dois bugs que impediam qualquer teste local no
Windows (corrigidos em `fix: importação de CSV — campos personalizados e
correções de ambiente local`):

1. `databaseDir` usava `new URL(...).pathname`, que no Windows vira
   `/C:/Users/...` — caminho inválido pro `initdb` nativo. Trocado por
   `fileURLToPath`.
2. Sem flags de locale, o `initdb` herda o locale do Windows
   (`Portuguese_Brazil.1252` em pt-BR) e cria o cluster em **WIN1252** — a
   primeira migração com acento quebra com `character ... has no
   equivalent in encoding WIN1252`. Corrigido forçando `-E UTF8 --locale=C`
   na inicialização.

Se o cluster já foi criado antes dessa correção (`testes/pgdata/` existe e
tem encoding errado), apague `testes/pgdata/` e rode `db:criar` de novo.

## Ver relacionado

- `testes/README.md` — passo a passo completo e o que cada `t-*.mjs` cobre.
- `t-campos-csv.mjs` — self-check do import de CSV com campo personalizado,
  não precisa de banco/servidor rodando.
