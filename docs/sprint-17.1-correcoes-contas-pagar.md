# Sprint 17.1 — Correções pontuais e múltiplos anexos

**Status:** ✅ Entregue. Rodar migration 017, fazer push e testar os 4 bugs.

## Os 4 bugs reportados

| # | Bug | Status | Correção |
|---|-----|--------|----------|
| 1 | Criar conta corrente falha | ✅ Corrigido + telemetria melhor | Schema mais tolerante (string vs número) + frontend mostra qual campo falhou |
| 2 | Só 1 anexo em contas a pagar | ✅ Implementado | Nova tabela `contas_pagar_anexos` + componente `MultiplosAnexos.jsx` |
| 3 | Data de vencimento não aparece | ✅ Corrigido | Backend serializa DATE como `YYYY-MM-DD` puro |
| 4 | Não dá pra editar conta paga/cancelada | ✅ Corrigido | Removida a trava no controller, log detalhado preserva auditoria |

## Diagnósticos detalhados

### Bug 1 — Criar conta bancária falha

**Causa real:** Não tinha **mensagem útil de erro**. O middleware tratava erros Zod retornando apenas `{erro: 'Dados inválidos'}` sem os detalhes dos campos. O usuário via "Dados inválidos" sem saber o quê.

**Causa secundária possível:** O schema usava `z.number()` estrito, que falha se vier string. Como o frontend usa `<input type="number">` e converte com `Number()`, se o usuário deixava o campo vazio podia mandar `null`, ou se algum caractere fosse inválido, mandava `NaN` → falha do Zod.

**Correções:**

1. `frontend/src/api/client.js` — `mensagemDeErro` agora extrai os detalhes do erro Zod e mostra: *"Dados inválidos — apelido: String must contain at least 2 character(s); saldo_atual: Expected number, received nan"*

2. `backend/src/controllers/contas-bancarias.controller.js` — schema usa `z.coerce.number()` em vez de `z.number()`. Aceita string, número, ou null/undefined (cai no default 0).

Agora, qualquer erro futuro mostra exatamente em qual campo está o problema.

### Bug 2 — Múltiplos anexos

Nova tabela `contas_pagar_anexos` (1:N). Mesma estrutura usada no inventário (Sprint 17): tipo, nome_original, arquivo_path, mime_type, tamanho_bytes, descricao, enviado_por_id, criado_em.

**Endpoints:**
```
GET    /api/contas-pagar/:id/anexos
POST   /api/contas-pagar/:id/anexos          (multipart: arquivo, tipo, descricao)
GET    /api/contas-pagar/:id/anexos/:anexoId/baixar
DELETE /api/contas-pagar/:id/anexos/:anexoId
```

**UI:** botão de clipe (📎) com badge mostrando a contagem em cada linha. Abre um modal dedicado onde admin pode adicionar quantos arquivos quiser, organizando por tipo (Boleto / Comprovante / Nota Fiscal / Outro).

**Sistema antigo preservado:** os campos `comprovante_*` da tabela contas_pagar (Sprint 7) ficam intactos. Não removi nada pra não quebrar contas já com comprovante. O frontend novo usa só `/anexos`.

**Componente reutilizável:** `frontend/src/components/MultiplosAnexos.jsx` aceita parametrizar o recurso (`recurso="contas-pagar"`, no futuro podemos usar pra outros). 80 linhas, simples e robusto.

### Bug 3 — Data de vencimento não aparece

**Causa:** O frontend tem `formatarData(d)` que faz `new Date(d + 'T12:00:00')`. Funciona quando `d` é `'2026-05-15'` mas falha quando o backend retorna `'2026-05-15T00:00:00.000Z'` (resulta em `Invalid Date` ao concatenar).

O node-pg às vezes converte colunas `DATE` em objetos `Date`, e o `JSON.stringify` deles vira ISO completo com Z.

**Correção:** No backend, o `serializar` agora passa `data_vencimento`, `data_pagamento` e `recorrencia_ate` por uma função `dataParaIso` que sempre retorna `'YYYY-MM-DD'` ou `null`, independente da forma que veio do pg.

```js
function dataParaIso(v) {
  if (v == null) return null;
  if (typeof v === 'string') return v.length >= 10 ? v.slice(0, 10) : null;
  if (v instanceof Date) {
    const y = v.getUTCFullYear();
    const m = String(v.getUTCMonth() + 1).padStart(2, '0');
    const d = String(v.getUTCDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  }
  return null;
}
```

Usa componentes UTC (`getUTC...`) pra evitar mudança de dia em timezone negativo.

### Bug 4 — Editar conta paga/cancelada

**Antes:** O endpoint `PUT /api/contas-pagar/:id` jogava 400 se a conta já estava paga ou cancelada:
```js
if (atuais[0].status !== 'pendente') {
  throw new AppError('Contas pagas ou canceladas não podem ser editadas.', 400);
}
```

A intenção era proteger o "fato histórico", mas isso impedia o caso real de "marquei como paga com valor errado".

**Agora:** A trava foi removida. Qualquer admin pode editar qualquer campo (descrição, fornecedor, categoria, valor, vencimento, observações, link) em qualquer status.

**O que continua protegido:**
- `status`, `data_pagamento`, `valor_pago`, `forma_pagamento` e `motivo_cancelamento` **não** podem ser alterados pelo `PUT` — esses campos só mudam via `/pagar` e `/cancelar` (que têm regras próprias).
- O `criarSchema.partial()` que o `atualizar` usa não inclui esses campos, então eles ficam imutáveis por design.

**Auditoria preservada:** cada edição em conta não-pendente gera log com:
- ação: `conta_pagar.atualizar_apos_paga` ou `conta_pagar.atualizar_apos_cancelada`
- detalhes: `{ campos: [...], mudancas: { campo: { de, para } } }`

Assim, depois é possível rastrear no `log_acoes`: "fulano alterou valor de R$ 100 pra R$ 1.000 em conta JÁ paga, em tal data". Histórico não some.

**UI:**
- Botão "Editar" agora aparece em **todos** os status (não só pendente).
- Modal mostra banner âmbar quando a conta já está paga/cancelada: *"Esta conta já está paga. Edite somente pra corrigir erros cadastrais..."*
- Título do modal vira *"Corrigir conta paga"* / *"Corrigir conta cancelada"* pra deixar claro o contexto.

## Arquivos novos

```
backend/db/migrations/017_contas_pagar_anexos.sql
backend/src/controllers/contas-pagar-anexos.controller.js
frontend/src/components/MultiplosAnexos.jsx
docs/sprint-17.1-correcoes-contas-pagar.md   (este arquivo)
```

## Arquivos editados

```
backend/src/controllers/contas-pagar.controller.js
  - dataParaIso helper
  - serializar usa dataParaIso em data_vencimento/data_pagamento/recorrencia_ate
  - serializar inclui qtd_anexos (agregada via subquery)
  - atualizar removeu trava de status='pendente'
  - atualizar agora loga mudanças campo a campo (de/para)
  - SELECT_COMPLETO inclui contagem de anexos

backend/src/controllers/contas-bancarias.controller.js
  - schema usa z.coerce.number() em saldo_atual e ordem
  - tolera null/string vazia

backend/src/routes/contas-pagar.routes.js
  - plug das 4 rotas de /anexos

frontend/src/api/client.js
  - mensagemDeErro extrai detalhes do erro Zod

frontend/src/pages/ContasPagar.jsx
  - importa MultiplosAnexos
  - Acoes reescrito: botão Anexos com badge, edit em qualquer status
  - novo ModalAnexos
  - ModalConta mostra aviso quando edita conta paga/cancelada
```

## Como testar depois do deploy

### Bug 1 — Criar conta corrente
1. Sidebar → Contas bancárias → "Nova conta"
2. Preenche apelido, banco, etc.
3. **Antes:** se desse erro, só dizia "Dados inválidos"
4. **Agora:** se der erro, mostra qual campo: *"saldo_atual: Expected number..."* — aí dá pra corrigir
5. Tenta criar com valores válidos — deve criar sem erro

Se ainda assim falhar criar uma conta, **manda print da mensagem de erro completa**. Agora ela vai mostrar o campo problemático.

### Bug 2 — Múltiplos anexos
1. Sidebar → Contas a pagar
2. Em qualquer conta da tabela, clica no botão de clipe (📎)
3. Modal abre. Como admin: escolhe tipo (Boleto / Comprovante / Nota Fiscal / Outro), seleciona arquivo, sobe
4. Repete pra subir mais arquivos
5. Cada arquivo pode ser baixado ou excluído individualmente
6. Volta pra tabela — o badge do clipe mostra a contagem

### Bug 3 — Data de vencimento
1. Sidebar → Contas a pagar
2. As datas de vencimento devem aparecer na coluna "Vencimento" com formato `DD/MM/AAAA`
3. Se ainda aparecer "—" ou nada, manda print

### Bug 4 — Editar conta paga/cancelada
1. Pega uma conta paga (status = "Paga" verde)
2. **Antes:** botão de editar não aparecia. **Agora:** aparece o ícone de lápis junto com o clipe
3. Clica em editar
4. Modal abre com banner âmbar: *"Esta conta já está paga..."*
5. Corrige (ex.: muda descrição) e salva
6. Funciona normalmente. Log de auditoria registra a mudança.

## ⚠️ Volume de uploads no Railway

Os anexos vão pra `UPLOADS_DIR/comprovantes/HASH.ext` (mesma pasta do comprovante único da Sprint 7). Em produção precisa de Volume montado, senão arquivos somem em cada redeploy. Provavelmente já está montado pra a Sprint 6/7 funcionar; senão, **configure antes de subir múltiplos anexos importantes**.
