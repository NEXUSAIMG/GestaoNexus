# Sprint 16 Fase B — Sync automático com SeuCartorio

**Status:** ✅ Código pronto. Falta o usuário configurar env vars e dar push.

## O que muda

A Fase A deixou o portfólio funcionando com cadastro manual. Esta fase faz o **GestaoNexus puxar dados sozinho** do SeuCartorio todo dia.

## Arquitetura

```
SeuCartorio (Vercel + MySQL)            GestaoNexus (Railway + Postgres)
────────────────────────────            ─────────────────────────────────

GET /api/integracoes/portfolio          [Cron diário às 04h SP]
  ?meses=N&incluir_clientes=true                │
  X-API-Key: ***                                ▼
       │                                  sincronizarTodos()
       │                                        │
       │  ◄──── fetch ────────────────────────  │
       │                                        ▼
   calcula MRR/clientes/                  UPSERT em
   churn/tickets via Prisma               produtos_metricas_mensais
       │                                  produtos_clientes
       ▼                                        │
  retorna JSON                                  ▼
                                          atualiza sincronizado_em
```

**Por que API e não banco compartilhado?**
- Bancos diferentes (MySQL no SeuCartorio, Postgres no GestaoNexus)
- API é desacoplado: cada lado pode evoluir schema sem quebrar o outro
- Snapshot local sobrevive se o SeuCartorio cair

## Endpoint exposto pelo SeuCartorio

`GET /api/integracoes/portfolio` (header `X-API-Key`)

**Query params:**
- `?meses=N` — quantos meses de histórico (1-24, default 1)
- `?incluir_clientes=true|false` — se inclui lista nominal (default true)

**Resposta:**
```json
{
  "produto_slug": "seu-cartorio",
  "gerado_em": "2026-04-29T15:00:00Z",
  "metricas_mensais": [
    {
      "mes": "2026-04-01",
      "mrr": 25000.00,
      "receita_total": 26500.00,
      "clientes_ativos": 42,
      "novos_clientes": 5,
      "churn_clientes": 1,
      "churn_mrr": 600.00,
      "tickets_abertos": 12,
      "tickets_resolvidos": 10,
      "visitantes_landing": 1250,
      "trials_iniciados": 8,
      "conversoes": 5
    }
  ],
  "clientes": [
    {
      "externo_id": "uuid-da-empresa-no-mysql",
      "nome": "Cartório do Centro",
      "documento": "12.345.678/0001-90",
      "email": "...",
      "telefone": "...",
      "plano": "Profissional",
      "valor_mensal": 597.00,
      "data_inicio": "2025-08-15",
      "data_fim": null,
      "status": "ativo",
      "origem": "Vendedor NEX-001"
    }
  ]
}
```

`GET /api/integracoes/portfolio/health` retorna `{ ok: true }` (útil pra teste de conexão sem rodar nada pesado).

## Como cada métrica é calculada (no SeuCartorio, via Prisma)

| Métrica | Fórmula |
|---|---|
| MRR (fim do mês) | Soma `valorMensal` de Assinaturas com status ≠ TRIAL/CANCELADA, criadas até fim do mês, e (`canceladoEm IS NULL` OR `canceladoEm >= fim do mês`) |
| Receita total | Soma `valor` de Faturas com status='PAGA' e `dataPagamento` no mês |
| Clientes ativos | Count de Empresas com Assinatura ativa no fim do mês |
| Novos clientes | Empresas `createdAt` no mês |
| Churn clientes | Assinaturas `canceladoEm` no mês |
| Churn MRR | Soma `valorMensal` das canceladas no mês |
| Tickets abertos | Chamados `createdAt` no mês |
| Tickets resolvidos | Chamados `resolvidoEm` no mês |
| Trials iniciados | Assinaturas TRIAL `createdAt` no mês |
| Conversões | Assinaturas ATIVA com `dataInicio` no mês (proxy — schema não guarda histórico de mudança de status) |
| Visitantes landing | Sessões em `SessaoAnalytics` com `usuarioId IS NULL` no mês |

## Mapeamento de status (Assinatura → produtos_clientes)

| SeuCartorio | GestaoNexus |
|---|---|
| TRIAL | trial |
| ATIVA | ativo |
| SUSPENSA | pausado |
| INADIMPLENTE | inadimplente |
| CANCELADA | cancelado |

Empresas sem Assinatura caem no fallback baseado em `Empresa.statusOnboarding`.

## Segurança

- **API key obrigatória** em `X-API-Key`. Sem ela, 401.
- **Comparação em tempo constante** no middleware (`apiKey.middleware.js`) pra evitar timing attacks.
- **Falha-safe**: se a env var no servidor está vazia ou < 16 chars, o endpoint retorna 503 (recusa todas as requests). Isso evita expor o endpoint por engano.
- A API key não é JWT — é uma string aleatória estática. Pra revogar, basta gerar uma nova e atualizar nos dois lados.

## Arquivos novos (SeuCartorio)

```
backend/src/middlewares/apiKey.middleware.js
backend/src/controllers/integracoes-portfolio.controller.js
backend/src/routes/integracoes.routes.js
backend/src/server.js                              (plug)
backend/.env.example                                (INTEGRACAO_NEXUS_API_KEY)
```

## Arquivos novos (GestaoNexus)

```
backend/db/migrations/015_portfolio_sync.sql       (UNIQUE INDEX em externo_id)
backend/src/services/portfolio-sync.service.js     (reescrito alinhado ao schema 014)
backend/src/controllers/produtos.controller.js     (+ sincronizar, testarSincronizacao)
backend/src/routes/produtos.routes.js              (+ rotas /sincronizar)
backend/src/services/scheduler.js                  (respeita PORTFOLIO_SYNC_ATIVO + checa fonte configurada)
backend/src/config/env.js                          (SEU_CARTORIO_URL, SEU_CARTORIO_API_KEY, PORTFOLIO_SYNC_ATIVO/CRON)
frontend/src/pages/PortfolioProduto.jsx            (botão "Sincronizar", status do sync, campo fonte_dados no editar)
docs/sprint-16b-sync-seucartorio.md                (este arquivo)
```

## Cron schedule

Roda todo dia às **04:00 (America/Sao_Paulo)** — depois do sync ASAAS (05:00) pra não concorrer.

Configurável via env var `PORTFOLIO_SYNC_CRON` (sintaxe cron padrão).

## ⚠️ CHECKLIST de configuração

Você precisa fazer manualmente (não dá pra automatizar):

### 1. Gerar API key

Em qualquer terminal Node:
```powershell
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

Vai sair algo como `f3d8a92c1b...` (64 caracteres hex). **Copia e guarda** — você vai usar nos dois lados.

### 2. Configurar no SeuCartorio (Vercel)

Dashboard Vercel → seu projeto → Settings → Environment Variables → Add:

| Nome | Valor |
|------|-------|
| `INTEGRACAO_NEXUS_API_KEY` | a string gerada acima |

Marca como Production (e Preview/Development se quiser testar antes).

Depois: **Redeploy** o projeto (necessário pra novas env vars terem efeito).

### 3. Configurar no GestaoNexus (Railway)

Dashboard Railway → seu serviço → Variables → New Variable:

| Nome | Valor |
|------|-------|
| `SEU_CARTORIO_URL` | URL do SeuCartorio em produção (ex: `https://seu-cartorio.vercel.app` — **sem barra no fim**) |
| `SEU_CARTORIO_API_KEY` | a MESMA string da etapa 2 |

Railway redeploya automaticamente.

### 4. Push do código nos dois projetos

```powershell
# SeuCartorio
cd C:\Users\marci\OneDrive\Documentos\Projetos\SeuCartorio
git add -A
git commit -m "feat: endpoint /api/integracoes/portfolio para o GestaoNexus puxar metricas"
git push

# GestaoNexus
cd C:\Users\marci\OneDrive\Documentos\Projetos\GestaoNexus
git add -A
git commit -m "feat(sprint-16b): sync automatico com SeuCartorio + botoes manuais"
git push
```

### 5. Mudar fonte_dados do produto Seu Cartório

No GestaoNexus em produção depois do redeploy:
1. Login admin → Portfólio → clica em "Seu Cartório"
2. Botão **Editar** no cabeçalho
3. Campo **"Fonte de dados das métricas"** → escolhe "Seu Cartório (sync automático via API)"
4. Salvar

Vai aparecer no cabeçalho um banner: *"Sync automático de seu_cartorio · nunca sincronizado"* + botão **"Puxar 12 meses de histórico"**.

### 6. Primeira sincronização

Clica em **"Puxar 12 meses de histórico"** no banner. Isso roda o sync com `meses=12`, populando o ano todo de uma vez.

Em seguida, todo dia às 04h o cron vai atualizar o mês atual automaticamente.

## Como debugar se der erro

### "Fonte não está configurada no servidor"
- Você esqueceu de configurar `SEU_CARTORIO_URL` ou `SEU_CARTORIO_API_KEY` no Railway. Confere e redeploya.

### "Endpoint retornou HTTP 401"
- A API key do GestaoNexus (`SEU_CARTORIO_API_KEY`) é diferente da do SeuCartorio (`INTEGRACAO_NEXUS_API_KEY`). Confere se são EXATAMENTE iguais.

### "Endpoint retornou HTTP 503"
- A `INTEGRACAO_NEXUS_API_KEY` não está configurada no SeuCartorio. Vai no Vercel, configura, redeploya.

### "Endpoint retornou HTTP 404"
- A URL `SEU_CARTORIO_URL` está errada. Confere se está com `https://`, sem barra no fim, e se aponta pra produção.

### Botão sumiu / não aparece o banner
- O `fonte_dados` ainda está como "manual". Edita o produto e muda.

### Sync rodou mas não trouxe dados
- O SeuCartorio não tem dados ainda no MySQL pra calcular. Confere se há Empresas/Assinaturas/Faturas em produção.

## O que NÃO foi feito (limitações conhecidas)

1. **Tabela de logs de sync.** Hoje só temos `sincronizado_em` no produto. Sem histórico de falhas. Se for um problema, criamos uma `produtos_sync_logs` numa próxima.
2. **Retry automático em falha.** Se o sync diário falha (rede, SeuCartorio fora), só vai tentar de novo no dia seguinte. Pra crítico, o admin clica em "Sincronizar" manualmente.
3. **Sync incremental de clientes.** O sync atual faz UPSERT por externo_id, então clientes "novos" do SeuCartorio aparecem, mas clientes que sumiram lá ficam aqui. Pra detectar, precisaria de uma flag de "visto neste sync" ou comparação de listas. Por enquanto, a lista de clientes vai crescendo monotonicamente.
4. **Múltiplas fontes por produto.** Se um produto puxar dados de duas APIs (improvável), não é suportado — uma fonte por produto.
