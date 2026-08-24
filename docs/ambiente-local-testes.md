# Ambiente local de testes — credenciais e como subir

Referência rápida pra não redescobrir isso a cada sessão de teste. Passo a
passo completo está em `testes/README.md`; aqui só o que muda de sessão pra
sessão (credenciais, portas, comandos do dia a dia).

## Estado do trabalho (atualizado 24/08/2026)

Tudo abaixo está na branch **`fix/importar-csv-campos-personalizados`**
(8 commits sobre `main`, push feito, **PR ainda não aberto** — perguntei
duas vezes, sem resposta ainda). Se a próxima sessão for continuar isso,
primeiro `git log --oneline main..fix/importar-csv-campos-personalizados`
pra ver se algo mudou, e perguntar se já foi mergeado/deployado.

O que já foi construído, nessa ordem:

1. **Import de CSV reconhece campo personalizado do quadro** (não só os
   campos fixos do card) e casa "Status Atual"/"Coluna" com coluna do
   Kanban — sem casar, cai na descrição, nunca é descartado.
2. **Import cria automaticamente** campo personalizado e coluna do Kanban
   que faltam, pra qualquer quadro escolhido na hora — não exige setup
   manual antes.
3. **Termômetro (Quente/Médio/Frio)**: ordena os cards na coluna (quente
   primeiro), vira prioridade padrão quando a planilha não tem coluna de
   Prioridade, ganha selo colorido no card, e agora é campo de **seleção**
   (não texto livre) — import novo já cria assim; quadro com campo antigo
   (texto) tem botão "Tornar Termômetro selecionável" em Configurações.
   Card com Termômetro preenchido esconde Prioridade/Estimativa/Pontos/
   Início (Prazo NÃO esconde mais — pedido explícito, é só informativo).
   Botão "Reordenar cards existentes por Termômetro" pra quem já existia
   antes dessa regra.
4. **6 campos de etapa do funil** (Reunião de apresentação, Data do último
   contato, Enviar Onboarding e Aguardar, Reunião de Apresentação do
   Dashboard, Em Desenvolvimento, Pronto para ativação) saem da tela do
   card — continuam existindo no quadro, só não poluem mais a visão.
5. **Mover card pra outro quadro** (`POST /cards/:id/mover-quadro`):
   recusava antes ("Não é possível mover cards entre quadros"). Agora
   preserva checklist/comentário/anexo; recusa se o card tem subtarefa;
   etiqueta/campo personalizado do quadro de origem ficam órfãos (dado
   não apaga, só some da tela).
6. **Trocar a equipe dona do quadro** (`PUT /quadros/:id` aceita
   `equipe_id`, só admin): o pedido real por trás do item 5 era "comercial
   não consegue editar Atividade Comercial porque tá sob Desenvolvimento"
   — resolvido trocando o dono do quadro, SEM mexer em nenhum dos 223
   cards (mover card por card destruiria campo personalizado/etiqueta à
   toa). Essa é a ferramenta certa pra esse tipo de pedido — se aparecer
   de novo "preciso mover N cards pra outra equipe", provavelmente é isso
   e não o item 5.

O CSV real do usuário (228 linhas, cadastro de cartórios — nome, e-mail,
telefone, faturamento) está em `docs/Pipeline Seu Cartório...csv`,
propositalmente **fora do git** (dado real de cliente). Se sumir do disco,
pedir de novo antes de continuar testando com dado real.

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
