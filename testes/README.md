# Ambiente local e bateria de testes

Até aqui não havia onde testar antes da produção: sem banco local, sem
`.env`, sem teste automatizado — os `test-*.js` da raiz são scripts manuais
que rodam contra o banco de verdade. Toda mudança ia direto para uma
ferramenta em uso.

Isto resolve. Sobe um PostgreSQL real (sem Docker e sem root), aplica as
migrações, popula dados parecidos com os reais e roda a bateria contra a API
e contra a interface num Chromium de verdade.

## Montar (uma vez)

```bash
npm install --prefix testes
npx --prefix testes playwright-core install chromium   # só para os testes de tela
npm run db:criar --prefix testes
```

Crie `backend/.env` apontando para o banco local:

```env
NODE_ENV=development
PORT=3001
DATABASE_URL=postgresql://nexus:nexus@localhost:55432/gestao_nexus
JWT_SECRET=qualquer-coisa-longa-para-uso-local
SEED_ADMIN_EMAIL=admin@local.test
SEED_ADMIN_SENHA=SenhaLocal123!
UPLOADS_DIR=/tmp/uploads-ayio
UPLOADS_MAX_MB=10
SYNC_ASAAS_ATIVO=false
NOTIFICACOES_ATIVO=false
PORTFOLIO_SYNC_ATIVO=false
```

> `.env` está no `.gitignore` — não vai para o repositório.

## Rodar

```bash
npm run db:subir --prefix testes      # sobe o Postgres local
npm run migrate                        # aplica as migrações
npm run seed                           # cria o admin
npm run build --prefix frontend        # o backend serve o dist
npm run start --prefix backend         # em outro terminal

npm run semear --prefix testes         # dados de exemplo (quadro Atividade Comercial)
npm run api    --prefix testes         # 86 verificações contra a API
npm run layout --prefix testes         # 20 páginas × 3 larguras, mede rolagem e corte
npm run ui     --prefix testes         # fluxos de tela + capturas em testes/capturas/
```

## O que cada arquivo cobre

| Arquivo | Cobre |
|---|---|
| `t-importar.mjs` | Import do Trello: etiqueta duplicada, arquivo grande, responsável que aparece no board |
| `t-importar-real.mjs` | Board no formato completo: lista/card arquivado, checklist fora de ordem, comentário com e sem autor conhecido |
| `t-erros.mjs` | Anexo acima do limite, payload grande, JSON malformado — todos com código próprio, nenhum 500 |
| `t-historico.mjs` | Histórico do card: de-para com nome de coluna, quem, quando, filtros, sem duplicar movimento |
| `t-arquivados.mjs` | Renomear coluna, arquivar e restaurar card e coluna, coluna de origem arquivada |
| `t-csv.mjs` | Planilha: BOM, `;` vs `,`, aspas, acento, datas BR e ISO, idempotência, mensagens de erro |
| `t-layout.mjs` | Barra de rolagem no documento, barras aninhadas e tabela cortada, em 3 larguras |
| `t-quadro.mjs` | Ficha de cliente no card, aba Histórico, renomear coluna, gaveta de arquivados |
| `t-import-ui.mjs` | Modal de importação: escolher formato, prévia, importar |

## Coisas que confundem na primeira vez

- **`Muitas tentativas de login`** — o rate limit do backend é por processo e
  em memória. Rodar a bateria inteira várias vezes seguidas o dispara.
  Reiniciar o backend zera o contador. Isso é comportamento correto, não bug.
- Os testes de tela **alteram dados** (renomeiam coluna, criam quadro). Use o
  banco local, nunca o de produção.
- Para começar do zero: `npm run db:parar --prefix testes`, apague
  `testes/pgdata/`, e repita o `db:criar`.
