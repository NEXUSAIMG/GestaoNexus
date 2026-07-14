# Sprint 33 — Auditoria de Segurança e Dívida Técnica

> **Origem:** auditoria do núcleo do sistema (config, banco, auth, erros, uploads, contas-bancárias e auth do frontend) realizada antes desta sprint.
> **Objetivo desta sprint:** fechar as brechas e dívidas encontradas, em ordem de gravidade.
> **Escopo coberto pela auditoria:** núcleo de infra/segurança. Os ~35 controllers de domínio e as páginas do frontend **ainda não** foram varridos um a um (ver seção "Pendências de varredura" no fim).

---

## Como usar este documento com o Cowork

Cada tarefa abaixo é **autônoma e executável**: traz o arquivo exato, o problema, a mudança a fazer e como verificar. Execute uma de cada vez, na ordem sugerida, validando entre elas.

As tarefas estão divididas em dois blocos:

- **Bloco A — Para o Cowork executar:** mudanças de código local, reversíveis. Seguras para um agente tocar.
- **Bloco B — Manual (Márcio):** ações sensíveis ou irreversíveis (senha de produção, histórico do Git, variáveis no Railway). **O Cowork NÃO deve executar essas** — apenas pode preparar o terreno (ex.: deixar o `.env.example` sanitizado), mas a ação final é do Márcio.

### Regras para o agente (ler antes de começar)

1. **Ler antes de escrever, sempre.** O projeto sincroniza por OneDrive e pode haver sessões paralelas. Releia o arquivo imediatamente antes de cada edição.
2. **Arquivos com template literals (`${...}`):** prefira `write_file` (reescrita completa) a `edit_file`. O `edit_file` corrompe `${...}` ao aplicar o diff. Se precisar usar `edit_file` em trecho com placeholder SQL dinâmico, use concatenação de string ou o helper `const PH = (n) => String.fromCharCode(36) + n`.
3. **Não escrever vários arquivos grandes em sequência rápida** — o Filesystem MCP congela. Escreva um arquivo, verifique, então o próximo.
4. **Não rodar `git push`, `git commit --amend`, `git rebase`, `git filter-branch` nem nada que reescreva histórico.** Pare e devolva para o Márcio.
5. **Não rodar comandos contra o banco de produção** nem contra o Railway. Mudanças são apenas no código-fonte local.
6. **Seguir os padrões já existentes no codebase:** middleware `restritoBloqueado`, `exigirPoder(...)`, serializadores `dataParaIso()`, `z.coerce.number()` em campos numéricos, logs com tag `[modulo.acao]`.
7. **Validar ao final:** rodar `npm run build` na raiz (ou ao menos `node --check` nos arquivos backend alterados) e confirmar que não quebrou nada.

---

## Bloco A — Para o Cowork executar

### A1 · Remover checagem de certificado TLS totalmente aberta no banco
**Gravidade:** Alta
**Arquivo:** `backend/src/config/database.js`

**Problema:** quando SSL liga, a config usa `rejectUnauthorized: false` **e** `checkServerIdentity: () => undefined`, aceitando qualquer certificado. O tráfego é criptografado, mas fica vulnerável a MITM no caminho app↔banco.

**Mudança:** manter o afrouxamento apenas para provedores que comprovadamente exigem (certificado gerenciado/auto-assinado), e tentar validação normal nos demais. Uma abordagem segura e incremental:
- Introduzir uma env var opcional `DB_SSL_NO_VERIFY` (default `false`).
- Só aplicar `rejectUnauthorized: false` + `checkServerIdentity` desabilitado quando `DB_SSL_NO_VERIFY` for verdadeira; caso contrário, usar `ssl: { rejectUnauthorized: true }`.
- Documentar a nova var no `backend/.env.example`.

**Cuidado:** isso pode quebrar a conexão em produção se o Railway exigir o afrouxamento. Por isso o default mantém o comportamento atual **somente se o Márcio setar `DB_SSL_NO_VERIFY=true` no Railway**. Deixe a mudança pronta no código e registre na seção B que essa var precisa ser definida antes do próximo deploy.

**Verificar:** `node --check backend/src/config/database.js`; subir local apontando para um Postgres local (sem SSL) e confirmar que conecta.

---

### A2 · Reativar Content-Security-Policy
**Gravidade:** Média
**Arquivo:** `backend/src/server.js`

**Problema:** `helmet({ contentSecurityPolicy: false })` desliga a CSP inteira. Combinado com o token em `localStorage`, amplia o estrago de um eventual XSS.

**Mudança:** ativar uma CSP funcional. Como o frontend é um SPA Vite servido pelo mesmo host, comece por uma política compatível com o build de produção (o Vite de **build** não usa scripts inline como o dev server; o risco de quebra é baixo no `dist`, mas precisa teste). Configurar `directives` permitindo `'self'` para script/style/img/connect e ajustar conforme o que o app realmente carrega.

**Cuidado:** **testar no frontend buildado**, não só no backend. Rodar `npm run build`, servir o `dist` pelo backend e abrir a aplicação verificando o console do navegador por violações de CSP. Se algo quebrar, afrouxar a diretiva específica (ex.: `style-src 'self' 'unsafe-inline'`) em vez de desligar tudo de novo.

**Verificar:** app abre sem erros de CSP no console; login funciona.

---

### A3 · CORS não-reflexivo em produção
**Gravidade:** Média
**Arquivo:** `backend/src/server.js`

**Problema:** quando `CORS_ORIGIN` está vazio, cai em `origin: true` (reflete qualquer origem) com `credentials: true`.

**Mudança:** em produção, se `CORS_ORIGIN` estiver vazio, **não** refletir qualquer origem. Como em produção o frontend é servido pelo mesmo host, o correto é desabilitar CORS (ou restringir ao próprio `APP_URL`). Lógica sugerida: se `isProduction` e `CORS_ORIGIN` vazio → usar `origin: false` (mesma origem apenas). Em dev, manter o comportamento atual liberando o Vite.

**Verificar:** dev continua funcionando com o front no Vite (porta 5173); produção serve o front no mesmo host sem precisar de CORS. Anotar na seção B que `CORS_ORIGIN` pode ser setado explicitamente no Railway se algum dia houver front em outro domínio.

---

### A4 · Eliminar dupla execução do `autenticar`
**Gravidade:** Média (performance)
**Arquivos:** `backend/src/routes/index.js` + arquivos de rota individuais

**Problema:** `restritoBloqueado = [autenticar, exigirAcessoCompleto]` roda `autenticar`, e cada arquivo de rota também tem `router.use(autenticar)`. Resultado: 4 queries de auth por request em vez de 2, nas ~20 rotas bloqueadas. Com `pool max: 10`, pesa sob carga.

**Mudança (escolher UMA estratégia e aplicar consistente):**
- **Opção recomendada:** manter `autenticar` apenas nos arquivos de rota (onde já está) e remover `autenticar` da lista `restritoBloqueado` no `index.js`, deixando lá só `exigirAcessoCompleto`. Como `exigirAcessoCompleto` depende de `req.pessoa`, garantir que ele rode **depois** do `autenticar` interno — então registrá-lo de forma que execute após. **Atenção:** middlewares passados em `router.use('/x', mw, rota)` rodam ANTES dos middlewares internos da rota. Logo, remover o `autenticar` do `index.js` e manter o `exigirAcessoCompleto` no `index.js` quebraria a ordem (ele rodaria antes do `autenticar` interno, com `req.pessoa` indefinido).
- **Portanto, a forma correta:** mover a aplicação de `exigirAcessoCompleto` para **dentro** de cada arquivo de rota bloqueado, logo após o `router.use(autenticar)`. Ou, alternativamente, manter ambos no `index.js` e **remover** o `router.use(autenticar)` dos arquivos de rota bloqueados (deixando-o só nos não-bloqueados). Esta segunda é menos arquivos mexidos e menos risco de ordem — **prefira esta**: manter `[autenticar, exigirAcessoCompleto]` no `index.js` e retirar `router.use(autenticar)` apenas dos arquivos de rota que estão sob `restritoBloqueado`.

**Cuidado:** os arquivos de rota **não** bloqueados (`pessoas`, `notificacoes`, `equipes`, `quadros`, `colunas`, `cards`, `processos`, `instancias`, `cartorios`, `auth`) **devem manter** seu `autenticar` interno, pois não passam pela lista do `index.js`. Mexer só nos bloqueados. Conferir a lista exata no `index.js` (seção "BLOQUEADAS PRA ACESSO RESTRITO").

**Verificar:** login + navegação em uma rota bloqueada (ex.: `/contas-bancarias`) e uma liberada (ex.: `/cards`) continuam funcionando; uma pessoa com `acesso_restrito` continua recebendo 403 nas bloqueadas. Idealmente, contar as queries de auth no log para confirmar que caíram de 4 para 2.

---

### A5 · Guard explícito no `exigirAcessoCompleto`
**Gravidade:** Baixa (robustez)
**Arquivo:** `backend/src/middleware/auth.middleware.js`

**Problema:** o middleware depende de `req.pessoa` já populado. Se a ordem dos middlewares for invertida por engano, ele **libera** acesso em vez de bloquear (fail-open).

**Mudança:** no início de `exigirAcessoCompleto`, adicionar:
```js
if (!req.pessoa) {
  return next(new NaoAutorizadoError('Sessão não autenticada'));
}
```
antes das checagens de `administrador`/`acesso_restrito`. Torna o comportamento fail-safe.

**Verificar:** `node --check`; fluxo normal de acesso restrito continua igual.

---

### A6 · Rate limit global na API
**Gravidade:** Média
**Arquivos:** `backend/src/server.js` (ou `routes/index.js`)

**Problema:** só `/auth/login` tem rate limit. O resto da API não tem teto.

**Mudança:** adicionar um `express-rate-limit` global mais folgado (ex.: 300 req / 15 min por IP) aplicado em `/api`, mantendo o `loginLimiter` específico mais estrito por cima. Como `trust proxy` já está em `1`, o limiter lê o IP real do Railway corretamente.

**Verificar:** uso normal não é bloqueado; rajada acima do teto retorna 429.

---

### A7 · Remover log de diagnóstico temporário
**Gravidade:** Baixa
**Arquivo:** `backend/src/controllers/contas-bancarias.controller.js`

**Problema:** no `catch` de `criar`, o `console.error('[contas-bancarias.criar] falhou:'...)` despeja o `req.body` inteiro no log do Railway. Era temporário (bug do CASE WHEN já resolvido) e ainda registra payload sensível.

**Mudança:** remover esse `console.error` específico, deixando o `next(err)` (o `tratadorDeErros` central já cuida do log). Manter o resto do controller intacto.

**Verificar:** criar uma conta bancária continua funcionando; o log com `body:` não aparece mais.

---

### A8 · Versão dinâmica no endpoint `/saude`
**Gravidade:** Baixa
**Arquivo:** `backend/src/routes/index.js`

**Problema:** `versao: '1.7'` é hardcoded e exige bump manual a cada deploy.

**Mudança:** puxar a versão de `backend/package.json` (importar o `version`) ou de uma env var de build, em vez do literal. Remover também o campo `sprints_ativas` hardcoded ou trocá-lo por algo que não precise de manutenção manual.

**Verificar:** `GET /api/saude` responde com a versão vinda do `package.json`.

---

### A9 · (Confirmar intenção) Checagem de poder financeiro nas leituras
**Gravidade:** Alta — **mas requer decisão de produto antes de aplicar**
**Arquivos:** `backend/src/routes/contas-bancarias.routes.js` (e conferir `caixa`, `mensal`, `distribuicoes`, `movimentos-socios`)

**Problema:** `GET /` e `GET /:id` de contas bancárias liberam saldos para qualquer pessoa autenticada não-restrita, sem checar `pode_ver_financeiro`. O comentário no código admite que a checagem "fica pra sprints futuras".

**Decisão necessária (Márcio responde antes do Cowork aplicar):** é intencional que todo mundo com acesso completo veja saldos, ou as leituras financeiras devem exigir o poder `pode_ver_financeiro`?

**Mudança (se a resposta for "deve exigir poder"):** aplicar `exigirPoder('pode_ver_financeiro')` nas rotas de leitura financeira. **Cuidado:** admin sempre passa (o `exigirPoder` já trata isso), mas pessoas operacionais sem representação ("ehOperacional" do login) **não têm** `representacaoAtual` — elas seriam bloqueadas, o que provavelmente é o desejado para dados financeiros. Validar esse caso.

**Verificar:** após decisão, testar com um usuário que tem o poder, um que não tem, e o admin.

---

## Bloco B — Manual (Márcio) · o Cowork NÃO executa

### B1 · Senha de admin de produção exposta no `.env.example` (CRÍTICO)
- A senha real de produção (`MudarDepoisDoPrimeiroLogin123!`) está no `.env.example`, que é versionado.
- **Ações (manuais):**
  1. Confirmar se o repositório `marciogoes/GestaoNexus` é público ou privado no GitHub.
  2. Trocar a senha de admin em produção: `npm run resetar-senha`.
  3. Decidir se o histórico do Git precisa ser limpo (se a senha já circulou em commits e o repo é/foi público). Reescrita de histórico é decisão do Márcio — não delegar.
- **O que o Cowork PODE preparar (Bloco A-adjacente):** sanitizar o `backend/.env.example` trocando o valor de `SEED_ADMIN_SENHA` por um placeholder tipo `DEFINA_UMA_SENHA_FORTE_AQUI`. Essa edição de arquivo local é segura; a troca da senha real **não**.

### B2 · Variáveis de ambiente no Railway (antes do próximo deploy)
Dependem das tarefas A1 e A3:
- `DB_SSL_NO_VERIFY` — definir conforme A1 (provavelmente `true` se o Railway exigir, até validar).
- `CORS_ORIGIN` — definir explicitamente apenas se houver frontend em outro domínio (ver A3).
- Definir essas no painel do Railway, não no código.

---

## Ordem de execução sugerida

1. **A7** (remover log) e **A8** (versão dinâmica) — rápidas, baixo risco, aquecem.
2. **A5** (guard) e **A6** (rate limit global) — pequenas, isoladas.
3. **A4** (dedup do autenticar) — exige cuidado com ordem de middleware; testar bem.
4. **A2** (CSP) e **A3** (CORS) — exigem teste no frontend buildado.
5. **A1** (TLS do banco) — preparar código; depende de B2 para o deploy.
6. **B1** sanitização do `.env.example` (placeholder) — segura para o agente.
7. **A9** — só depois da decisão do Márcio.
8. **Bloco B restante** — manual, Márcio.

---

## Pendências de varredura (não cobertas pela auditoria inicial)

A primeira passada cobriu apenas o núcleo. Ainda falta varrer, idealmente um padrão por vez:
- **`CASE WHEN $n` com UUID** sobrando em outros controllers além de `contas-bancarias` (mesmo bug de inferência de tipo do Postgres).
- **Queries sem filtro de contexto de sócio** (vazamento de dados entre contextos).
- **Validações Zod** ausentes ou frouxas nos ~35 controllers de domínio.
- **Logs de diagnóstico tagueados** esquecidos em outros módulos (ex.: `[DIAG-card]`).
- **Frontend:** race conditions sem o version-gate (`useRef`), tratamento de erro, e páginas que não aplicam o `<Bloqueado>`/version gate.

Sugestão: abrir uma Sprint 33.1 dedicada a essa varredura ampla depois que o Bloco A estiver fechado.
