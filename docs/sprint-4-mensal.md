# Sprint 4 — Mês a mês

Resumo financeiro mensal pronto para a reunião de sócios, com
comparativo, histórico e exportação em PDF.

## 1. O problema que essa sprint resolve

O painel de Caixa (Sprint 3) responde bem a "como estou agora" e "o que
vem pela frente", mas não responde a "como foi o mês passado". Para a
reunião mensal de sócios, a pergunta muda: **quanto entrou, quanto saiu,
quanto sobrou** — e comparado ao mês anterior, estou melhorando ou
piorando?

A Sprint 4 entrega essa visão "fechada do mês" em uma página só, com
layout pensado também para **impressão/PDF** (via `window.print()` +
`@media print` do CSS). Quem quiser anexar o resumo ao ato da reunião
gera em 3 cliques.

## 2. Escopo

### O que entra

- Cards do mês: **Faturado**, **Gastos**, **Sobra**, **Margem (%)**
- Variação contra o mês anterior em cada card (com setinha verde/vermelha)
- Gráfico dos últimos **6 meses** (barras agrupadas: entradas vs saídas + linha pontilhada da sobra)
- Navegação entre meses (setas + picker)
- Click numa barra do gráfico troca o mês selecionado
- "Para onde foi o dinheiro" — saídas do mês agrupadas por categoria, com %
- "Resumo executivo" — interpretação automática em 2-3 frases
- Lista completa de **contas pagas no mês**
- Botão **Imprimir / PDF** com layout próprio para papel

### O que NÃO entra (deliberado)

| Ficou fora                         | Motivo                                                               |
| ---------------------------------- | -------------------------------------------------------------------- |
| PDF gerado no servidor             | `window.print()` resolve. Servidor entra na Sprint 7 (emails)        |
| Detalhamento de entradas por cliente | ASAAS já tem essa visão; não dá pra melhorar facilmente              |
| Comparativo contra média histórica | Mês anterior já orienta bem; média entraria só na Sprint 7          |
| Projeção futura (próximos N meses) | Já é responsabilidade do painel de Caixa                            |
| Fechamento manual do mês (travar)  | Os dados de pagamento já carimbam a data; não precisa travar         |

## 3. Modelo de dados

**Nada novo.** A sprint só lê das tabelas existentes:

- `cobrancas_asaas` → entradas do mês (onde `data_pagamento` está no mês
  e `status` é terminal: `RECEIVED`, `RECEIVED_IN_CASH`, `CONFIRMED`, `DUNNING_RECEIVED`)
- `contas_pagar` → saídas do mês (onde `status='paga'` e `data_pagamento` no mês)
- `categorias_despesa` → agrupamento na visão "Para onde foi o dinheiro"

Critério consistente: **usamos sempre `data_pagamento`** como âncora do
mês. Uma conta que vence dia 28/nov mas foi paga 02/dez entra no mês de
dezembro. Uma cobrança que venceu 31/out mas o cliente pagou 05/nov entra
em novembro. Essa é a definição que bate com o regime de caixa da
empresa.

## 4. Novas rotas da API

| Método | Caminho                           | Acesso      | O que faz                                                      |
| ------ | --------------------------------- | ----------- | -------------------------------------------------------------- |
| GET    | `/api/mensal/resumo?mes=YYYY-MM`  | Autenticado | Totais do mês + anterior + saídas por categoria + contas pagas |
| GET    | `/api/mensal/historico?meses=6`   | Autenticado | Array dos últimos N meses (entradas, saídas, sobra)            |

Ambas aceitam o parâmetro `mes=YYYY-MM` opcional (default: mês corrente
do servidor). O `historico` aceita `meses=N` de 1 a 24 (default: 6).

O `historico` usa `generate_series` no Postgres para garantir que meses
sem movimentação apareçam zerados no gráfico (em vez de sumirem),
preservando o eixo temporal.

### Estrutura do `resumo`

```jsonc
{
  "mes_referencia": "2025-10-01",
  "mes_anterior":   "2025-09-01",
  "atual": {
    "entradas": 45230.50,
    "entradas_qtd": 28,
    "saidas": 32118.00,
    "saidas_qtd": 19,
    "sobra": 13112.50,
    "margem_pct": 29.0
  },
  "anterior": { /* idem */ },
  "variacao": {
    "entradas_pct": 12.5,        // ou null se o mês anterior era zero
    "saidas_pct": -3.2,
    "sobra_abs": 1700.00         // em R$
  },
  "saidas_por_categoria": [
    { "categoria_id": "...", "categoria_nome": "Folha", "categoria_cor": "blue",
      "total": 15000.00, "qtd": 4, "pct": 46.7 },
    /* ... ordenadas por maior total ... */
  ],
  "contas_pagas": [
    { "id": "...", "descricao": "Aluguel", "fornecedor_nome": "...",
      "categoria_nome": "Aluguel", "categoria_cor": "amber",
      "valor": 3200.00, "valor_pago": 3200.00,
      "data_vencimento": "2025-10-05", "data_pagamento": "2025-10-05",
      "forma_pagamento": "pix" },
    /* ... ordenadas por data de pagamento DESC ... */
  ]
}
```

## 5. Impressão / PDF

A página tem duas camadas de visibilidade:

- **Tela:** cabeçalho com navegador de meses, botão de imprimir, avisos
  ("Clique na barra para ver outro mês"), alertas — tudo marcado com
  classe `.no-print`.
- **PDF:** cabeçalho impresso com o nome "Gestão Nexus", "Resumo de
  outubro de 2025", gerador, data — marcado com classe `.print-only`.
  Rodapé fino na base.

Algumas regras CSS em `@media print`:

- Menu lateral (`aside`) e barra superior mobile somem
- Fundo chapado, sem sombras
- `page-break-inside: avoid` em tabelas e seções para não cortar no meio
- Links perdem o azul sublinhado

Para gerar um PDF:
1. Selecionar o mês
2. Clicar em **Imprimir / PDF**
3. No diálogo do navegador, escolher **Salvar como PDF** como destino
4. Ajustar margem pra "padrão" ou "mínima" se quiser mais denso

## 6. Como rodar

```bash
cd backend
# Sem migrations nesta sprint — nada a aplicar.
# Só reinicia o servidor:
npm run dev
```

Frontend recarrega sozinho se o Vite estiver rodando.

Se a página "Mês a mês" mostrar tudo zerado na primeira abertura, é
porque ainda não há cobranças recebidas nem contas pagas no mês
selecionado. Use o navegador de meses para conferir meses anteriores
com movimentação.

## 7. Roteiro de testes (aceite da sprint)

### Cálculos básicos

- [ ] Em um mês com X entradas e Y saídas conhecidas, os cards mostram
      exatamente esses valores
- [ ] A sobra bate com `entradas − saídas`
- [ ] A margem (%) = `sobra / entradas` × 100, com "—" quando entradas é zero

### Comparativo com mês anterior

- [ ] Variação de entradas/saídas em %, com seta pra cima ou pra baixo
- [ ] Sobra é comparada em R$ absolutos (não em %)
- [ ] Setinha fica verde quando é "bom" (mais entrada, menos saída, mais sobra)
- [ ] Setinha fica vermelha no contrário
- [ ] Quando o mês anterior tem zero em algum indicador, aparece "—"

### Gráfico dos 6 meses

- [ ] 6 barras mesmo que algum mês esteja zerado
- [ ] Barra do mês selecionado fica destacada
- [ ] Click numa barra troca o mês
- [ ] Linha pontilhada da sobra passa por cima das barras
- [ ] Tooltip ao passar o mouse na barra mostra o valor

### Saídas por categoria

- [ ] Ordenado da maior pra menor
- [ ] Contas sem categoria aparecem como "Sem categoria"
- [ ] % por categoria soma exatamente 100% (dentro do erro de arredondamento)
- [ ] Barra visual proporcional ao %

### Impressão / PDF

- [ ] Ctrl+P mostra preview sem o menu lateral e sem os botões da página
- [ ] Cabeçalho de impressão ("Gestão Nexus · Resumo de outubro de 2025")
      aparece só no PDF, não na tela
- [ ] Tabela de contas pagas não corta fornecedor no meio das páginas
- [ ] Gráfico aparece no PDF com as cores corretas (verificar no
      preview com "gráficos em cores" ligado)

### Navegação

- [ ] Setas do navegador de mês andam 1 por vez
- [ ] Não dá pra avançar além do mês atual
- [ ] Dá pra escrever o mês no input tipo YYYY-MM e Enter aplica
- [ ] URL/rota não muda — a seleção do mês é só estado local (ok por ora)

### Proteção

- [ ] Sócio não-admin consegue ver o Mês a mês (é leitura)
- [ ] Qualquer representante autenticado vê os dados

## 8. O que NÃO está pronto (de propósito)

- **PDF gerado no servidor** — hoje é `window.print()`. Entra na Sprint 7
  junto com envio por email
- **Média histórica / tendência** — só comparamos com o mês anterior
- **Quebra por sócio** — quanto entrou pra cada um. Entra na Sprint 5,
  junto com pró-labore e distribuição
- **Categorização de entradas** — hoje só classificamos saídas
- **Filtro por categoria dentro do resumo** — clicar numa categoria não
  filtra as contas pagas abaixo. Pequeno, entra se pedirem
- **Guardar histórico de relatórios gerados** — é só um snapshot ao vivo

## 9. Próxima sprint

**Sprint 5 — Sócios & Lucros.**

É a área mais sensível do app:
- Pró-labore por sócio (histórico de saídas classificadas como folha/pró-labore)
- Distribuições de lucro (data, valor, referência ao mês/ano)
- Aportes feitos por cada sócio
- Cálculo automático da próxima distribuição conforme a participação
  definida em `socios.percentual_participacao`
- Extrato individual por sócio (para imposto de renda, etc.)

É onde o poder `pode_aprovar_distribuicoes` da Sprint 1.5 finalmente
entra em uso.
