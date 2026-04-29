# Sprint 2 — ASAAS + Caixa (entradas)

Conecta a ferramenta ao ASAAS, cacheia as cobranças localmente e entrega
o **painel de Caixa** com saldo das contas + previsão de entradas em 30/60/90 dias.

## 1. O que fica pronto nesta sprint

- Integração ASAAS via REST (sandbox e produção)
- Rotina diária que roda às 5h (configurável) e puxa as cobranças
- Cache local em `cobrancas_asaas` (com upsert — dá pra rodar várias vezes)
- Log de cada execução em `sincronizacoes_asaas` (origem manual/automática, contadores, erro)
- Cadastro de **contas bancárias** com saldo registrado manualmente
- Painel **Caixa** com:
  - Saldo consolidado das contas ativas
  - Previsão de entradas em 30/60/90 dias (cards + barra proporcional)
  - Recebimentos nos últimos 30 dias
  - Tabela de cobranças com busca, filtros (previstas/recebidas/todas) e link pra fatura
  - Indicador do estado da integração + botão "Sincronizar agora"

## 2. O que essa sprint **não** resolve

Contas a pagar, conciliação automática, fluxo de caixa dia a dia e alertas
de saldo mínimo ficam pra Sprint 3. A Sprint 2 é só o lado das entradas.

## 3. Modelo de dados

### Três tabelas novas (`003_caixa_entradas.sql`)

| Tabela                    | Para quê                                                     |
| ------------------------- | ------------------------------------------------------------ |
| `contas_bancarias`        | Cadastro + saldo manual. Carimba quem/quando atualizou.      |
| `cobrancas_asaas`         | Cache das cobranças. PK = `asaas_id` → upsert idempotente.   |
| `sincronizacoes_asaas`    | Log de cada execução (manual ou automática), com contadores. |

**Decisão importante:** a PK de `cobrancas_asaas` é o próprio `id` do ASAAS.
Isso torna a rotina de sync trivial — o `ON CONFLICT ... DO UPDATE` cuida
de duplicatas automaticamente. Guardamos também o payload bruto em JSONB
para debug futuro sem precisar voltar na API.

### Status do ASAAS que nos interessam

```
PREVISTOS:   PENDING, CONFIRMED, OVERDUE, AWAITING_RISK_ANALYSIS, DUNNING_REQUESTED
RECEBIDOS:   RECEIVED, RECEIVED_IN_CASH, CONFIRMED
PERDIDOS:    REFUNDED, REFUND_REQUESTED, CHARGEBACK_REQUESTED,
             CHARGEBACK_DISPUTE, AWAITING_CHARGEBACK_REVERSAL
```

`CONFIRMED` aparece nas duas primeiras listas de propósito: antes do
`creditDate` ela conta como prevista; depois, como recebida.

## 4. Integração ASAAS

### Client (`src/services/asaas.client.js`)

Fino. Só abstrai:
- Header `access_token`
- Construção da URL com query params
- Paginação como async iterator (`for await (item of listarCobrancas(...))`)
- Padronização de erro (`AsaasError` com `status`, `payloadAsaas`)

### Sync (`src/services/asaas.sync.js`)

1. Cria registro em `sincronizacoes_asaas` com status `rodando`
2. Itera cobranças na janela `[hoje - 7d, hoje + 90d]` (configurável)
3. Dentro de uma transação, faz upsert em `cobrancas_asaas`
4. Finaliza o log com `sucesso` ou `erro`

Retorna `{ ok, logId, inseridas, atualizadas, erro? }` — nunca joga exceção
pra cima, pra não derrubar o cron nem o endpoint manual.

### Agendador (`src/services/scheduler.js`)

`node-cron` dentro do processo do Express. Configurações:

| Variável            | Default              | Descrição                              |
| ------------------- | -------------------- | -------------------------------------- |
| `SYNC_ASAAS_ATIVO`  | `true`               | Liga/desliga o job                     |
| `SYNC_ASAAS_CRON`   | `0 5 * * *`          | Expressão cron (todo dia às 5h)        |
| `SYNC_ASAAS_TIMEZONE` | `America/Sao_Paulo`| Timezone usado pelo agendador          |

Proteções:
- Desligado automaticamente se `ASAAS_API_KEY` estiver vazia
- Guarda contra sobreposição: se a execução anterior ainda está rodando,
  a próxima é ignorada com warning
- Validação da expressão cron no boot — se for inválida, avisa e segue sem job

## 5. API — novas rotas

| Método | Caminho                                  | Acesso    | O que faz                                    |
| ------ | ---------------------------------------- | --------- | -------------------------------------------- |
| GET    | `/api/caixa/resumo`                      | Autenticado | Saldos + previsão 30/60/90 + última sync    |
| GET    | `/api/caixa/entradas?status=&q=&dias=`   | Autenticado | Lista de cobranças com filtros               |
| GET    | `/api/caixa/integracao/status`           | Autenticado | Ping no ASAAS pra validar a chave            |
| POST   | `/api/caixa/sincronizar`                 | Admin     | Dispara sync manual                          |
| GET    | `/api/contas-bancarias`                  | Autenticado | Lista contas + saldos                        |
| GET    | `/api/contas-bancarias/:id`              | Autenticado | Detalhe de uma conta                         |
| POST   | `/api/contas-bancarias`                  | Admin     | Cria conta                                   |
| PUT    | `/api/contas-bancarias/:id`              | Admin     | Edita cadastro (não mexe em `saldo_atual`)   |
| POST   | `/api/contas-bancarias/:id/saldo`        | Admin     | Registra saldo (com carimbo de quem/quando)  |

## 6. Frontend

### Página **Caixa** (`/caixa`)

- Botão "Sincronizar agora" (só admin) que dispara o endpoint manual e
  recarrega o resumo + lista ao terminar
- Cards de saldo e previsão 30/60/90 com animação de loading
- Barra proporcional 0–30 / 31–60 / 61–90 com legenda e tooltip por faixa
- Faixa verde com recebimentos dos últimos 30 dias
- Tabela com busca por cliente/descrição/referência, filtros de status,
  badge colorido por estado e link pra fatura/boleto
- Banner especial se `ASAAS_API_KEY` não estiver configurada
- Banner de erro se a última sync falhou (com a mensagem do ASAAS)

### Página **Contas bancárias** (`/contas-bancarias`)

- Cards em grid mostrando apelido, tipo (ícone), agência/conta, saldo e
  "atualizado há Xh por fulano"
- Aviso em âmbar quando o saldo está com mais de 3 dias
- Modal separado pra "Registrar saldo" — campo destacado, confirmação,
  histórico do último registro na própria tela
- Modal de cadastro com seletor visual de tipo (corrente/poupança/investimento/caixa)
- Qualquer autenticado vê; só admin edita/registra (validação no backend)

### Navegação

- `Contas bancárias` entra no grupo **Cadastros** do menu lateral
- Marcador "Sprint 2/3" sai do Caixa (agora está pronto)
- Dashboard ganha card de Contas bancárias e atualiza o texto de abertura

## 7. Como rodar

### Instalação (ambiente Sprint 1.5 já rodando)

```bash
cd backend
npm install            # traz node-cron novo
npm run migrate        # aplica 003_caixa_entradas.sql
# npm run seed — opcional, não cria nada novo nesta sprint
```

### Variáveis de ambiente

```env
# Obrigatórias para a integração funcionar
ASAAS_API_KEY=$aact_... (pegue em Minha Conta > Integrações)
ASAAS_BASE_URL=https://sandbox.asaas.com/api/v3    # troque p/ prod quando for a hora

# Opcionais — defaults boas
ASAAS_JANELA_DIAS_FUTURO=90
ASAAS_JANELA_DIAS_PASSADO=7
SYNC_ASAAS_ATIVO=true
SYNC_ASAAS_CRON=0 5 * * *
SYNC_ASAAS_TIMEZONE=America/Sao_Paulo
```

### Primeira carga

Depois de subir com a chave configurada, entre em `/caixa` como admin e
clique em **Sincronizar agora**. Isso puxa tudo que está na janela.

A partir daí, o cron de 5h roda sozinho todo dia. Você pode acompanhar no
próprio painel — a caixinha "Integração ASAAS ativa" mostra quando foi a
última execução e quantas cobranças vieram.

## 8. Roteiro de teste (aceite da sprint)

### Setup

- [ ] `npm run migrate` aplica `003_caixa_entradas.sql` sem erro
- [ ] Com `ASAAS_API_KEY` vazia, o servidor sobe e o log diz que o cron está desligado
- [ ] Com `ASAAS_API_KEY` válida, o log mostra `[cron] Sync ASAAS agendada (...)`

### Integração

- [ ] `GET /api/caixa/integracao/status` retorna `{ configurada: true, ok: true }` com chave válida
- [ ] Com chave inválida, retorna `{ configurada: true, ok: false, erro: "..." }`
- [ ] Primeira execução manual via botão: `cobrancas_inseridas` > 0 se a conta sandbox tiver cobranças
- [ ] Segunda execução (sem mudanças): `cobrancas_inseridas = 0`, `cobrancas_atualizadas` = total atual
- [ ] `sincronizacoes_asaas` tem registros com `origem='manual'` (botão) e `'automatica'` (cron)

### Contas bancárias

- [ ] Admin cria conta com saldo 0; registra saldo depois; carimbo de "por fulano" aparece
- [ ] Não-admin vê as contas mas os botões de editar/registrar não aparecem
- [ ] `PUT /api/contas-bancarias/:id` não altera o `saldo_atual` (campo é ignorado)
- [ ] `POST /api/contas-bancarias/:id/saldo` atualiza saldo + carimbo
- [ ] Conta marcada como inativa fica cinza no painel e não entra no somatório

### Painel de Caixa

- [ ] Cards mostram valores coerentes: `em_60 >= em_30`, `em_90 >= em_60`
- [ ] Barra proporcional com 3 fatias tem total igual ao card "em 90 dias"
- [ ] Busca na tabela filtra por nome/descrição/ref
- [ ] Filtros Previstas/Recebidas/Todas alteram a listagem
- [ ] Link "abrir fatura" abre em nova aba
- [ ] Sem cobranças no sandbox → cards zerados mas sem quebrar a tela

### Segurança / poderes

- [ ] Usuário não-admin tentando `POST /api/caixa/sincronizar` → 401/403
- [ ] Usuário não-admin tentando `POST /api/contas-bancarias` → 401/403
- [ ] Com `ASAAS_API_KEY` vazia: `POST /caixa/sincronizar` retorna 503 com código `asaas_nao_configurado`

## 9. Próxima sprint

**Sprint 3 — Contas a pagar + fluxo de caixa completo**

- Tabela `contas_a_pagar` com cadastro manual (nome, valor, vencimento, categoria)
- Cadastro recorrente (parcelado / mensal fixo)
- Visão dia a dia do próximo mês com saldo projetado (entradas − saídas)
- Alerta quando a projeção passa abaixo do mínimo combinado
- Marcação de contas como pagas, com confirmação de qual conta bancária pagou
