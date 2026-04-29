# Sprint 5 — Sócios & Lucros

Painel dedicado a tudo que é financeiro entre a empresa e os sócios:
**pró-labore**, **distribuições de lucros** e **aportes**. Inclui
extrato individual por sócio (pensado para anexar ao IR).

## 1. O problema que essa sprint resolve

Até agora a ferramenta sabia:
- O que entrou (Sprint 2 — cobranças ASAAS)
- O que saiu para terceiros (Sprint 3 — contas a pagar)
- Como foi cada mês fechado (Sprint 4 — mês a mês)

Mas faltava a pergunta mais sensível para os sócios: **quem recebeu
o quê, e quando?** Pró-labore, distribuição de lucros e aportes
são movimentos financeiros específicos por sócio que não cabem em
"contas a pagar genéricas" porque:

- Precisam ficar **amarrados ao sócio** para extrato anual (IR)
- Distribuição de lucros tem **rateio proporcional à participação**
  e geralmente é decidida em rodada (todos os sócios juntos)
- Aporte é **entrada**, não saída — vai ter sinal contrário no caixa
- Pró-labore é **mensal recorrente** com referência de mês

A Sprint 5 cria a tabela específica e a interface para isso.

## 2. Escopo

### O que entra

- Tabela `movimentos_socios` para os 3 tipos: pró-labore, distribuição, aporte
- Tabela `distribuicoes_lucros` como cabeçalho de uma rodada
- CRUD completo de pró-labore e aportes (cada um amarrado a um sócio)
- Criação de **distribuição em rodada**: admin define o valor total e o
  sistema sugere o split por participação; admin pode editar antes de salvar
- Fluxo "previsto → efetivado / cancelado" igual ao de contas_pagar
  (com motivo obrigatório no cancelamento)
- Efetivar movimento ajusta automaticamente o saldo da conta bancária
  (se informada): aporte soma, pró-labore e distribuição descontam
- Página principal **Sócios & Lucros** com cards de totais do ano,
  tabela "por sócio" (clicável), e seções separadas para distribuições,
  pró-labore e aportes
- Página **Extrato do sócio** (`/socios/:id/extrato?ano=YYYY`) com
  cabeçalho de identificação, totais e timeline completa do ano —
  preparada para impressão como comprovante
- Integração no painel de **Caixa**: aportes previstos entram nas
  entradas, pró-labore e distribuição previstos entram nas saídas
- Integração no **Mês a mês**: aportes contam como entrada do mês;
  pró-labore e distribuição aparecem como categorias virtuais nas
  saídas; lista dos movimentos do mês na tela

### O que NÃO entra (deliberado)

| Ficou fora                                  | Motivo                                                  |
| ------------------------------------------- | ------------------------------------------------------- |
| Aprovação multi-sócios (pode_aprovar_distribuicoes) | Hoje só admin cria/efetiva. Volta na Sprint 6 com governança |
| Cálculo do lucro distribuível automático     | Decisão é dos sócios em ata; o app só registra       |
| Geração de DARFs / informes IR oficiais     | Fora de escopo — extrato é interno                   |
| Histórico de alterações dos splits          | Audit log já registra, mas sem UI dedicada           |
| Pagamento via integração bancária real      | Sempre manual: registra aqui, paga fora              |
| Pró-labore como folha (FGTS, INSS, IRRF)    | É contabilidade, fica no escritório                  |

## 3. Modelo de dados

### `distribuicoes_lucros` (cabeçalho de rodada)

```
id                         uuid PK
descricao                  text NOT NULL
referencia_periodo         text         -- texto livre ("3T 2025", "Outubro 2025")
valor_total                numeric(14,2) NOT NULL
data_prevista              date NOT NULL
data_efetivada             date
status                     text NOT NULL DEFAULT 'prevista'
                                   CHECK IN ('prevista','efetivada','cancelada')
motivo_cancelamento        text         -- obrigatório se status='cancelada'
observacao                 text
criado_por_id              uuid → pessoas_acesso(id)
criado_em                  timestamptz
efetivado_por_id           uuid → pessoas_acesso(id)
efetivado_em               timestamptz
```

### `movimentos_socios`

```
id                         uuid PK
socio_id                   uuid NOT NULL → socios(id)
tipo                       text NOT NULL CHECK IN ('pro_labore','distribuicao','aporte')
distribuicao_id            uuid → distribuicoes_lucros(id)  -- só quando tipo='distribuicao'
descricao                  text NOT NULL
valor                      numeric(14,2) NOT NULL CHECK > 0
data_prevista              date NOT NULL
data_efetivada             date
referencia_mes             date         -- só preenchido quando tipo='pro_labore' (1º dia do mês)
conta_bancaria_id          uuid → contas_bancarias(id)
forma_pagamento            text
status                     text NOT NULL DEFAULT 'previsto'
                                   CHECK IN ('previsto','efetivado','cancelado')
motivo_cancelamento        text         -- obrigatório se cancelado
observacao                 text
comprovante_url            text
criado_por_id              uuid → pessoas_acesso(id)
criado_em                  timestamptz
efetivado_por_id           uuid → pessoas_acesso(id)
efetivado_em               timestamptz
```

CHECKs importantes:
- `efetivado` → `data_efetivada` obrigatória
- `cancelado` → `motivo_cancelamento` obrigatório
- `distribuicao_id` só pode existir se `tipo='distribuicao'`
- `referencia_mes` só pode existir se `tipo='pro_labore'`
- Unique parcial em (`socio_id`, `referencia_mes`) WHERE
  `tipo='pro_labore'` AND `status<>'cancelado'` — evita duplicar
  pró-labore do mesmo mês para o mesmo sócio

### Por que separado de `contas_pagar`?

Discutimos colocar tudo numa única tabela com uma flag, mas:
- `contas_pagar` não tem `socio_id` — adicionar como nullable confunde
- Distribuição precisa de cabeçalho (`distribuicoes_lucros`) para
  representar a rodada inteira, não cabe no modelo de uma conta
- Extrato anual por sócio fica trivial com tabela própria
- Aporte é **entrada**, conceitualmente errado em "contas a pagar"

## 4. Novas rotas da API

### Movimentos individuais

| Método | Caminho                                  | Acesso        | O que faz                                          |
| ------ | ---------------------------------------- | ------------- | -------------------------------------------------- |
| GET    | `/api/movimentos-socios`                 | Autenticado   | Lista (filtros: socio_id, tipo, status, ano)       |
| GET    | `/api/movimentos-socios/:id`             | Autenticado   | Obtém um                                           |
| GET    | `/api/movimentos-socios/resumo?ano=YYYY` | Autenticado   | Totais globais por tipo + tabela "por sócio"       |
| POST   | `/api/movimentos-socios`                 | Admin         | Cria pró-labore ou aporte (distribuição é via /distribuicoes) |
| PUT    | `/api/movimentos-socios/:id`             | Admin         | Edita previsto                                     |
| POST   | `/api/movimentos-socios/:id/efetivar`    | Admin         | Marca como efetivado e ajusta saldo bancário       |
| POST   | `/api/movimentos-socios/:id/cancelar`    | Admin         | Cancela com motivo                                 |

### Distribuições (rodadas)

| Método | Caminho                            | Acesso      | O que faz                                     |
| ------ | ---------------------------------- | ----------- | --------------------------------------------- |
| GET    | `/api/distribuicoes`               | Autenticado | Lista cabeçalhos (filtros: status, ano)       |
| GET    | `/api/distribuicoes/:id`           | Autenticado | Cabeçalho + movimentos individuais            |
| POST   | `/api/distribuicoes`               | Admin       | Cria rodada com splits por sócio              |
| PUT    | `/api/distribuicoes/:id`           | Admin       | Edita rodada prevista (e seus splits)         |
| POST   | `/api/distribuicoes/:id/efetivar`  | Admin       | Efetiva o cabeçalho + todos os movimentos     |
| POST   | `/api/distribuicoes/:id/cancelar`  | Admin       | Cancela o cabeçalho + todos os movimentos previstos |

### Extrato por sócio

| Método | Caminho                              | Acesso      | O que faz                                         |
| ------ | ------------------------------------ | ----------- | ------------------------------------------------- |
| GET    | `/api/socios/:id/extrato?ano=YYYY`   | Autenticado | Identificação + totais + timeline de movimentos   |

Todos os GETs são abertos para qualquer sócio autenticado
(transparência interna). Apenas admin escreve.

## 5. Cálculo do split por participação

Quando o admin cria uma distribuição, o sistema sugere a divisão entre
os sócios ativos:

1. Soma os `percentual_participacao` dos sócios ativos
2. Para cada sócio, calcula `valor = floor(total × pct / soma_pct × 100) / 100`
   (truncado em 2 casas)
3. O **último sócio** absorve o residual, garantindo que a soma feche
   exatamente no `valor_total`
4. Se nenhum sócio tem participação definida (todas nulas), divide
   igualitário com o mesmo critério de residual

O admin pode editar qualquer valor manualmente antes de salvar — o
botão "Recalcular por participação" volta para a sugestão automática.
A validação no backend exige que a soma dos splits = `valor_total`.

## 6. O que o usuário vê

### Página Sócios & Lucros (`/lucros`)

- Cabeçalho com seletor de ano (setas + ano)
- 4 cards de totais do ano: Pró-labore pago, Lucros distribuídos,
  Aportes recebidos, Total para sócios. Cada um mostra também o
  valor previsto (não efetivado) em destaque âmbar
- Tabela "Por sócio" com participação, totais por tipo no ano e total
  recebido (pró-labore + distribuição). Cada linha leva ao extrato
  individual
- Seção **Distribuições** com cards expansíveis por rodada — clicando
  no card revela a divisão por sócio. Botão "Nova distribuição" (admin)
- Seção **Pró-labore** com tabela. Botão "Registrar pró-labore" (admin)
- Seção **Aportes** com tabela. Botão "Registrar aporte" (admin)
- Botão **Imprimir / PDF**

### Página Extrato do sócio (`/socios/:id/extrato?ano=YYYY`)

- Cabeçalho com nome, tipo (PF/PJ), documento formatado, e-mail,
  participação e data de entrada
- 4 cards: Pró-labore, Distribuições, Aportes, Total recebido
- Timeline (tabela) com todos os movimentos do ano: tipo, descrição,
  referência de mês (para pró-labore), data, status, valor
- Setas de navegação entre anos
- Botão Imprimir / PDF gera comprovante em uma página

### Modais

- **Registrar pró-labore**: sócio, descrição, valor, data prevista,
  mês de referência
- **Registrar aporte**: sócio, descrição, valor, data prevista
- **Nova distribuição**: descrição, período (livre), valor total,
  data prevista, tabela editável de splits por sócio com cálculo
  automático e indicador de soma vs total
- **Efetivar**: data efetivada, conta bancária (opcional — se
  informada, ajusta saldo), forma de pagamento, observação
- **Cancelar**: motivo (mínimo 3 caracteres)

## 7. Integração com o resto do app

### Caixa (Sprint 3)
- `/api/caixa/resumo` agora soma aportes previstos nas entradas
  e pró-labore + distribuição previstos nas saídas (em 30/60/90 dias)
- Movimentos previstos vencidos entram nas atrasadas
- `/api/caixa/fluxo` (gráfico dia a dia) também considera os movimentos
  de sócios

### Mês a mês (Sprint 4)
- `/api/mensal/resumo` agora inclui:
  - Aportes efetivados nas entradas do mês
  - Pró-labore e distribuição efetivados nas saídas
  - Categorias virtuais "Pró-labore" (cor indigo) e "Distribuição de
    lucros" (cor emerald) na visão "Para onde foi o dinheiro"
  - Lista de movimentos de sócios efetivados no mês (`movimentos_socios`)
- `/api/mensal/historico` (gráfico 6 meses) também combina via UNION ALL

### Contas bancárias (Sprint 2)
- Efetivar um movimento com `conta_bancaria_id` informado:
  - aporte: soma `valor` no `saldo_atual`
  - pró-labore / distribuição: subtrai `valor` do `saldo_atual`
- Acontece dentro de transação com `FOR UPDATE` para evitar race condition

## 8. Como rodar

```bash
cd backend
npm run migrate    # aplica a 005_socios_lucros.sql
npm run dev
```

Frontend recarrega sozinho com Vite.

## 9. Roteiro de testes (aceite da sprint)

### Pró-labore

- [ ] Admin registra pró-labore para um sócio: aparece como "Previsto" na tabela
- [ ] Tentar registrar pró-labore duplicado para o mesmo sócio + mês = erro 409 (unique parcial)
- [ ] Editar pró-labore previsto funciona; editar efetivado retorna erro
- [ ] Efetivar pró-labore com conta bancária diminui o saldo da conta
- [ ] Efetivar pró-labore sem conta bancária só atualiza o status
- [ ] Cancelar pró-labore previsto exige motivo
- [ ] Cancelar pró-labore efetivado é bloqueado (estorno seria operação separada)

### Aporte

- [ ] Aporte segue o mesmo fluxo do pró-labore
- [ ] Efetivar aporte com conta bancária **soma** ao saldo (não subtrai)
- [ ] Aparece no painel de Caixa como entrada prevista (em 30/60/90)
- [ ] Aparece no Mês a mês como entrada do mês quando efetivado

### Distribuição

- [ ] Criar distribuição: split sugerido respeita o `percentual_participacao` dos sócios ativos
- [ ] Soma dos splits = valor_total (último absorve o residual de centavos)
- [ ] Editar valores individuais funciona e a soma é validada antes de salvar
- [ ] Sem participação definida: divisão igualitária
- [ ] Efetivar distribuição efetiva todos os movimentos previstos da rodada em lote
- [ ] Soma efetivada é descontada da conta bancária escolhida (uma só)
- [ ] Cancelar distribuição cancela todos os movimentos previstos vinculados

### Por sócio (tabela na página)

- [ ] Total recebido por sócio = pró-labore efetivado + distribuição efetivada (não inclui aportes)
- [ ] Aportes aparecem em coluna separada
- [ ] Click leva ao extrato individual com `?ano=` na URL

### Extrato individual

- [ ] Cabeçalho mostra dados corretos (nome, documento formatado por PF/PJ, %, data de entrada)
- [ ] Cards de totais batem com a tabela do ano
- [ ] Timeline lista todos os movimentos não-cancelados em ordem decrescente
- [ ] Aporte aparece com sinal `+` na coluna valor
- [ ] Navegação entre anos atualiza a URL
- [ ] Imprimir gera PDF sem o menu lateral, sem botões, com cabeçalho "Extrato do sócio — YYYY"
- [ ] Rodapé impresso traz o aviso "caráter informativo interno"

### Integrações

- [ ] Painel de Caixa mostra aporte previsto nas entradas
- [ ] Painel de Caixa mostra pró-labore/distribuição previstos nas saídas
- [ ] Movimentos vencidos previstos contam como atrasados
- [ ] Mês a mês inclui pró-labore e distribuição como categorias virtuais (indigo e emerald)
- [ ] Histórico de 6 meses considera os novos movimentos no cálculo das barras

### Permissões

- [ ] Sócio comum vê tudo (transparência) mas não consegue criar/editar/efetivar/cancelar
- [ ] Backend retorna 403 nas escritas para não-admin
- [ ] Frontend esconde botões de admin para usuários não-admin

## 10. O que NÃO está pronto (de propósito)

- **Aprovação por sócios para distribuição** — `pode_aprovar_distribuicoes`
  da Sprint 1.5 ainda é placeholder. Sai na Sprint 6 junto com o fluxo
  de atas/decisões
- **Estorno de movimento efetivado** — para corrigir um erro depois de
  efetivar, hoje precisa cancelar e criar um movimento "ajuste" manual.
  Funcionalidade de estorno entra se for pedida
- **Anexar comprovante real** (upload de arquivo) — campo `comprovante_url`
  existe no banco mas a UI ainda não tem upload. Entra na Sprint 6 com
  o resto do upload de arquivos
- **DARF e cálculos fiscais** — fora de escopo
- **Notificação ao sócio** quando há novo movimento — emails ficam para Sprint 7

## 11. Próxima sprint

**Sprint 6 — Governança.**

- Atas de reunião (upload + assinatura digital ou checkbox de aprovação por sócio)
- Decisões formais (aprovação ou recusa por sócio com poder)
- Contrato social vigente e histórico
- Calendário societário (datas de reunião, vencimentos legais)
- O `pode_aprovar_distribuicoes` finalmente vira fluxo: distribuição
  pode exigir aprovação dos sócios antes da efetivação
