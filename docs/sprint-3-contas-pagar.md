# Sprint 3 — Contas a pagar + fluxo de caixa completo

Fecha o outro lado do caixa (saídas), monta o fluxo projetado dia a dia
e cria o alerta de caixa mínimo.

## 1. O problema que essa sprint resolve

A Sprint 2 deixou o painel torto de propósito: mostrava só as **entradas**
vindas do ASAAS. Quem olhava o saldo projetado em 30 dias tinha uma
leitura otimista demais — bastante dinheiro entrando, nenhum saindo.

Na vida real, uma empresa pequena precisa ver entrada e saída juntas, com:
- Uma lista de **contas a pagar** cadastráveis manualmente
- Alguma noção de **categorização** (para distinguir folha, aluguel, imposto…)
- Um **saldo projetado** que leva em conta as duas pontas
- Um **alerta** quando esse saldo projetado fica abaixo de um mínimo combinado
- Um **gráfico de fluxo** que mostra o saldo ao longo dos próximos 90 dias

É o que essa sprint entrega.

## 2. Escopo deliberadamente enxuto

Algumas coisas ficaram de fora **de propósito**, não por esquecimento:

| Ficou fora             | Motivo                                                          |
| ---------------------- | --------------------------------------------------------------- |
| Fornecedor como tabela | Texto livre resolve 95% dos casos; migra depois se precisar     |
| Pagamento parcial      | Empresa pequena: paga 2x = cadastra 2 contas. Manter simples    |
| Recorrência automática | Cadastro manual + "duplicar" cobrem o caso comum; automatização tem muita regra de borda |
| Upload de comprovante  | Hoje é só URL. Upload real entra junto com atas (Sprint 6)      |
| Integração com OFX/CNAB| Sobra pra muito além — continua sendo digitação manual          |

Essas decisões estão também comentadas na migration e nos controllers.

## 3. Modelo de dados

### Três tabelas novas (migration `004_contas_pagar.sql`)

#### `categorias_despesa`

Simples: nome, cor (entre 15 opções Tailwind), ordem, ativo. Índice
parcial garante unicidade do nome **entre as ativas** — dá pra
"reciclar" um nome depois de inativar a categoria antiga.

A migration popula um conjunto inicial (Folha, Pró-labore, Impostos,
Aluguel, Serviços públicos, Software, Marketing, Fornecedores, Outras),
mas só se a tabela estiver vazia.

#### `contas_pagar`

O registro em si. Campos relevantes:

```
descricao                 → "Aluguel novembro", "Folha 10/2025", etc.
fornecedor_nome           → texto livre
fornecedor_documento      → texto livre (CPF ou CNPJ formatado)
categoria_id              → FK opcional pra categorias_despesa
valor                     → valor previsto (da conta em si)
data_vencimento           → data
status                    → 'pendente' | 'paga' | 'cancelada'
data_pagamento            → preenchido quando paga
valor_pago                → pode diferir do valor original (desconto, juros)
forma_pagamento           → pix, boleto, ted, cartao, dinheiro, debito_automatico, outro
conta_bancaria_id         → opcional: conta que foi usada
motivo_cancelamento       → preenchido quando cancelada
comprovante_url           → link externo
observacoes               → texto livre
criado_por_id / pago_por_id / cancelado_por_id
```

Dois `CHECK`s no banco garantem coerência:
- `status='paga'` exige `data_pagamento`
- `status='cancelada'` exige `motivo_cancelamento`

"Atrasada" **não é um status persistido**. É `pendente` com
`data_vencimento < hoje`. O frontend derive e o filtro da API aceita
como se fosse um status virtual.

#### `configuracoes_financeiras`

Singleton: `id SMALLINT PRIMARY KEY CHECK (id = 1)`. Só existe uma
linha, inserida pela própria migration com `ON CONFLICT DO NOTHING`.
Hoje guarda:
- `caixa_minimo` — valor do alerta (0 desativa)
- `caixa_minimo_observacao` — texto explicativo

No futuro cresce: moeda default, política de distribuição, etc.

## 4. Novas rotas da API

| Método | Caminho                               | Acesso     | O que faz                                              |
| ------ | ------------------------------------- | ---------- | ------------------------------------------------------ |
| GET    | `/api/categorias-despesa`             | Autenticado| Lista categorias + contagem de contas usando cada uma  |
| GET    | `/api/categorias-despesa/:id`         | Autenticado| Detalhe de uma                                         |
| POST   | `/api/categorias-despesa`             | Admin      | Cria                                                   |
| PUT    | `/api/categorias-despesa/:id`         | Admin      | Edita (inclusive ativar/inativar)                      |
| GET    | `/api/contas-pagar`                   | Autenticado| Lista com filtros `?status=&categoria_id=&q=&mes=`     |
| GET    | `/api/contas-pagar/resumo`            | Autenticado| Totais: pendentes, atrasadas, saídas 30/60/90, pago 30 |
| GET    | `/api/contas-pagar/:id`               | Autenticado| Detalhe                                                |
| POST   | `/api/contas-pagar`                   | Admin      | Cria (sempre nasce como pendente)                      |
| PUT    | `/api/contas-pagar/:id`               | Admin      | Edita (**só enquanto pendente**)                       |
| POST   | `/api/contas-pagar/:id/pagar`         | Admin      | Marca como paga; se houver `conta_bancaria_id`, desconta saldo |
| POST   | `/api/contas-pagar/:id/cancelar`      | Admin      | Cancela com motivo obrigatório                         |
| GET    | `/api/configuracoes-financeiras`      | Autenticado| Lê o caixa mínimo                                      |
| PUT    | `/api/configuracoes-financeiras`      | Admin      | Atualiza o caixa mínimo                                |
| GET    | `/api/caixa/fluxo?dias=90`            | Autenticado| Fluxo dia a dia: entrada, saída, saldo projetado       |

O `/api/caixa/resumo` da Sprint 2 foi **ampliado** para também retornar:
- `previsao_saidas` (30/60/90) a partir de contas_pagar pendentes
- `contas_atrasadas` (total e qtd)
- `projecao` — `saldo_projetado_30_dias`, `caixa_minimo`, `abaixo_do_minimo`, `diferenca`

### Detalhe importante: pagar desconta saldo

Quando o admin marca uma conta como paga **informando a conta bancária**, o
backend desconta o `valor_pago` do `saldo_atual` daquela conta (dentro da
mesma transação, com `FOR UPDATE` no registro da conta a pagar).

Se **não** informar conta bancária, o pagamento é registrado sem mexer em
saldo. É a saída para os casos "paguei do meu bolso e depois acerto" ou
"saiu de uma conta não cadastrada aqui".

A Gestão Nexus é a fonte de verdade do saldo manual, então mantemos a
consistência. Quem atualizar manualmente o saldo depois de já ter registrado
o pagamento vai duplicar o desconto — fica uma ressalva a documentar na
operação.

### Detalhe importante: saldo projetado em 30 dias

A fórmula usada no `/resumo` é:

```
saldo_projetado_30 = saldo_atual_contas
                   + entradas_previstas_30
                   - saidas_previstas_30
                   - atrasadas
```

As atrasadas entram como **dinheiro já comprometido que ainda não saiu**.
Se você não quitar, vira dívida; se quitar, sai do saldo. Tratar como
"redutor imediato" dá uma leitura mais conservadora, que é a que importa
pra decidir se dá pra distribuir lucro, por exemplo.

O mesmo cálculo alimenta o gráfico: o saldo inicial do fluxo já vem
descontado das atrasadas.

## 5. O que o usuário vê

### Painel de Caixa (reescrito)

Agora com 4 cartões no topo:
1. **Saldo nas contas** — igual à Sprint 2
2. **Entradas em 30 dias** — ASAAS
3. **Saídas em 30 dias** — contas_pagar pendentes
4. **Saldo projetado (30 dias)** — com texto dinâmico de folga ou déficit

Logo abaixo, um **gráfico SVG** (sem biblioteca de chart) com:
- Linha do saldo projetado dia a dia pelos próximos 90 dias
- Área preenchida sob a linha quando positiva
- Linha tracejada amarela no nível do caixa mínimo
- Barras verdes de entrada e vermelhas de saída por dia
- Ticks no eixo Y e marcos "hoje / +22d / +45d / +67d / +90d" no X

Dois **alertas** acima de tudo, quando aplicáveis:
- Caixa projetado abaixo do mínimo (amarelo)
- Contas atrasadas (vermelho)

Um botão **Configurações** (admin-only) abre um modal pra editar o
caixa mínimo e a observação.

### Página "Contas a pagar"

- Cards de resumo: Pendentes, Atrasadas (destacada em vermelho quando > 0),
  A sair em 30 dias, Pago nos últimos 30 dias
- Abas de filtro: Pendentes / Atrasadas / Pagas / Canceladas / Todas
- Filtros adicionais: categoria e busca por texto
- Tabela com colunas: Descrição/Fornecedor · Categoria · Vencimento (com
  contador "em X dias" ou "X dias atrás") · Valor · Status
- Três ações por linha pendente (admin): marcar como paga, editar, cancelar
- Modais:
  - **Nova/Editar conta** — descrição, fornecedor, categoria, valor, vencimento,
    link externo, observações
  - **Pagar** — data, valor pago (default = valor original, diferenças avisadas),
    forma de pagamento, conta bancária (com saldo exibido), comprovante, observações
  - **Cancelar** — motivo obrigatório

### Página "Categorias de despesa"

CRUD simples. Paleta de 15 cores Tailwind. Duas seções: ativas e inativas.
Ao inativar uma categoria em uso, um aviso mostra quantas contas a usam
(inativar não afeta o histórico, só tira da lista de escolha em cadastros
novos).

## 6. Como rodar

### Em ambiente já existente (Sprints 1, 1.5, 2 rodando)

```bash
cd backend
npm run migrate   # aplica 004_contas_pagar.sql (idempotente)
```

Nenhuma variável de ambiente nova. Nenhum seed a rodar — a própria migration
já popula as categorias padrão.

### Em ambiente novo (do zero)

Igual antes: `npm run migrate && npm run seed`. Agora aplica as 4 migrations.

## 7. Roteiro de testes (aceite da sprint)

### Categorias

- [ ] A primeira carga mostra as 9 categorias padrão
- [ ] Criar categoria nova com cada cor da paleta
- [ ] Inativar categoria usada em contas → continua aparecendo nas contas
      antigas mas somé dos dropdowns de "nova conta"
- [ ] Não-admin consegue listar mas não consegue criar nem editar

### Contas a pagar — CRUD e filtros

- [ ] Criar conta com todos os campos preenchidos
- [ ] Criar conta só com obrigatórios (descrição, valor, vencimento)
- [ ] Lista filtra corretamente entre Pendentes / Atrasadas / Pagas /
      Canceladas / Todas
- [ ] Uma conta pendente com `data_vencimento < hoje` aparece em Atrasadas
      com o contador "X dias atrás" em vermelho
- [ ] Filtro por categoria restringe a lista
- [ ] Busca acha por descrição e por fornecedor
- [ ] Editar conta pendente funciona
- [ ] Editar conta paga ou cancelada → erro 400 com mensagem clara

### Pagamento

- [ ] Marcar como paga sem informar conta bancária: saldo não mexe
- [ ] Marcar como paga informando conta bancária: saldo daquela conta cai
      exatamente em `valor_pago`
- [ ] Valor pago diferente do valor original é aceito e mostrado na listagem
      com o valor original riscado
- [ ] Conta paga não pode ser paga de novo (erro 400)

### Cancelamento

- [ ] Cancelar sem motivo → erro de validação
- [ ] Cancelar com motivo funciona, vira Cancelada, some dos totais do resumo
- [ ] Conta paga não pode ser cancelada (erro 400)

### Caixa (painel ampliado)

- [ ] Os 4 cartões batem com os valores esperados pra um conjunto de
      entradas/saídas conhecidas
- [ ] Gráfico aparece e a linha do saldo passa pelo zero onde o saldo cruza 0
- [ ] Quando não há contas a pagar nem cobranças, o gráfico fica em linha reta
      no saldo atual
- [ ] Ao pagar uma conta vinculada à conta bancária, o saldo do painel é
      atualizado após o recarregamento automático
- [ ] Definir caixa mínimo maior que o saldo projetado faz aparecer o alerta
      amarelo
- [ ] Definir caixa mínimo = 0 desativa o alerta
- [ ] Ter pelo menos 1 conta atrasada faz aparecer o alerta vermelho

### Proteção de rotas

- [ ] Sócio não-admin abre "Contas a pagar" e vê a lista (transparência)
      mas não enxerga os botões de editar/pagar/cancelar
- [ ] Sócio não-admin tentando `POST /api/contas-pagar` direto → 403
- [ ] "Configurações" no painel de Caixa só aparece para admin

### Auditoria

- [ ] Criar, editar, pagar e cancelar registram linhas em `log_acoes`
      com `acao` apropriado (`conta_pagar.criar`, `.pagar`, `.cancelar`, …)

## 8. O que NÃO está pronto (de propósito)

- **Pagamento parcial** — uma conta sempre é paga de uma vez só
- **Recorrência automática** — sem "repetir todo mês"
- **Fornecedor como tabela** — segue como texto livre na própria conta
- **Upload de comprovante** — só URL; upload real entra com atas (Sprint 6)
- **Importação de boletos (OFX / CNAB)** — sem previsão; continua digitando
- **Aprovação de pagamento** — hoje qualquer admin paga; se virar 3+ admins
  e for necessário workflow, sobe como sprint
- **Tela de auditoria** — os dados continuam sendo gravados em `log_acoes`;
  visualização fica em sprint futura

## 9. Próxima sprint

**Sprint 4 — Mês a mês**

Resumo mensal comparando entradas vs saídas por mês, com:
- Total faturado, total gasto, sobra (resultado operacional)
- Gráfico de barras dos últimos 6 meses
- Detalhamento de saídas por categoria (onde a Sprint 3 começa a pagar)
- Exportação em PDF "amigável" para levar à reunião mensal de sócios

As categorias criadas aqui passam a ser a espinha dorsal do comparativo.
