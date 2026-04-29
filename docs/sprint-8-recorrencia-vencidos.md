# Sprint 8 — Recorrência de eventos + alertas de atraso

Sprint enxuta de 2 itens, ambos plugando em infraestrutura já pronta.

## 1. O que essa sprint resolve

Dois buracos pequenos que apareceram com uso real:

1. **Eventos recorrentes** no calendário (reunião mensal de sócios,
   declaração trimestral, etc). Antes era preciso criar manualmente
   12 entradas iguais — péssimo. Agora cria UMA com `recorrencia_tipo`.

2. **Movimentos previstos esquecidos.** Pró-labore registrado em janeiro
   pra pagar em 05/fev, ninguém efetivou, ninguém lembrou. Sprint 7 já
   alertava sobre o que estava "vencendo nos próximos N dias", mas se
   passou da data sem ser efetivado, sumia do radar. Agora o resumo
   diário tem seção dedicada de "vencidos sem efetivação".

## 2. Escopo

### Item 1 — Recorrência de eventos

- Migration 008: colunas `recorrencia_tipo` e `recorrencia_ate` em
  `eventos_calendario`
- Backend `eventos-calendario.controller.js`:
  - Schemas aceitam os novos campos
  - `listar` busca eventos da janela e **expande virtualmente** as
    ocorrências em JS (sem materializar no banco)
  - `obter` retorna o evento-mestre (não a ocorrência)
- Frontend:
  - `<CalendarioMensal>` mostra ícone `Repeat` discreto nas pílulas de
    eventos recorrentes
  - `pages/CalendarioGov.jsx` ganha bloco "Recorrência" no modal com
    select (4 opções) + data limite opcional
  - Quando admin abre uma **ocorrência** expandida, o modal carrega os
    dados-mestre via GET pra evitar "mover sem querer toda a série"
  - Aviso visual em amarelo no modal de edição quando o evento é recorrente

### Item 2 — Alerta de atraso (movimentos vencidos)

- `notificacoes.service.js` → `levantarDadosResumo` agora separa em 4 listas:
  - `contasAtrasadas` (vencimento passado, ainda pendentes)
  - `contasVencendo` (próximos N dias, futuro)
  - `movimentosVencidos` (data prevista passada, ainda em `previsto`, últimos 90 dias)
  - `movimentosVencendo` (próximos M dias, futuro)
- Bug de Sprint 7 corrigido: antes a query de "vencendo" misturava
  passado e futuro
- `email-templates.js` → `tplResumoDiarioAdmin` reescrito com helper
  `secaoTabela()` que renderiza cada lista como bloco com cabeçalho.
  Atrasos aparecem em vermelho, próximos em âmbar, em ordem de urgência.
- Notificação in-app do resumo agora cita "X itens com atraso" no
  título quando houver

### O que NÃO entra

| Ficou fora | Motivo |
|---|---|
| Recorrência semanal | Adiciona complexidade de dia-da-semana; ninguém pediu |
| Edição de ocorrência isolada | Suporte a "exceções" duplica complexidade do modelo |
| Notificação separada por movimento vencido | Spam — resumo diário cobre |
| Drag & drop de eventos no calendário | Cosmético, fica pra Sprint 9 |
| PDFs no servidor | Pesado, exige Puppeteer ou trabalho manual de PDFKit |

## 3. Modelo de dados (migration 008)

Apenas adições à tabela `eventos_calendario`:

```sql
recorrencia_tipo TEXT CHECK (
  recorrencia_tipo IS NULL OR recorrencia_tipo IN
  ('mensal', 'trimestral', 'semestral', 'anual')
)
recorrencia_ate DATE

CONSTRAINT eventos_calendario_recorrencia_consistente CHECK (
  recorrencia_ate IS NULL OR recorrencia_tipo IS NOT NULL
)
```

`recorrencia_ate IS NULL` significa "indefinida" — o controller limita
a expansão a **24 meses** a partir da data de início (constante
`HORIZONTE_DEFAULT_MESES`). Defesa adicional: `MAX_OCORRENCIAS = 500`
por evento numa única expansão.

## 4. Algoritmo de expansão

No controller, `expandirOcorrencias(evento, inicioJanela, fimJanela)`:

1. Se `recorrencia_tipo IS NULL`: emite 1 ocorrência se sobrepõe a janela
2. Senão: itera somando passo (1/3/6/12 meses), parando quando passa
   do limite efetivo (`MIN(recorrencia_ate, horizonte_default, fim_janela)`)
3. Cada ocorrência herda a duração original (`data_fim - data_inicio`)
4. Adia "31 de janeiro" pro último dia válido do mês destino quando
   o mês não tem o dia (28/29 de fev, 30 de abr, etc)

Helper `adicionarMeses(data, meses)` cuida do edge case do dia.

## 5. Como rodar

```bash
cd backend
npm run migrate    # aplica 008_recorrencia_eventos.sql (idempotente)
npm run dev
```

Frontend recarrega sozinho.

## 6. Roteiro de testes

### Recorrência de eventos

- [ ] Admin cria "Reunião mensal de sócios" com `recorrencia_tipo='mensal'`,
      data início 15/jan
- [ ] Navegando entre meses, vê uma ocorrência por mês até 24 meses
- [ ] Cria evento "Declaração trimestral" com `recorrencia_ate=2026-12-31`
- [ ] Em janeiro/2027, ocorrências param de aparecer
- [ ] Click numa ocorrência expandida abre modal mostrando dados do
      evento-mestre (data original, não da ocorrência)
- [ ] Aviso amarelo aparece: "Este evento se repete… edição afeta toda a série"
- [ ] Editar título → afeta todas as ocorrências (recarregar mês mostra mudança)
- [ ] Excluir → confirma "Excluir TODA a série?" e remove tudo
- [ ] Ícone `Repeat` aparece pequeno após o título nas pílulas do calendário
- [ ] Evento "31 de jan mensal" → fevereiro mostra na ocorrência em 28/fev (último dia válido)
- [ ] Evento sem recorrência continua funcionando (criar/editar/excluir)

### Alerta de atraso

- [ ] Cria conta a pagar com vencimento ontem, deixa pendente
- [ ] Cria pró-labore previsto há 5 dias, deixa em `previsto`
- [ ] Roda manualmente o cron (ou aguarda 8h SP) → admin recebe e-mail
- [ ] E-mail tem seção vermelha "⚠ Contas a pagar atrasadas"
- [ ] E-mail tem seção vermelha "⚠ Movimentos sem efetivação (vencidos)"
- [ ] Notificação in-app do sino mostra "Resumo do dia — 2 itens com atraso"
- [ ] Após pagar a conta e efetivar o pró-labore, próximo resumo
      sai sem essas seções (ou pula envio se nada mais sobrou)
- [ ] Movimentos vencidos > 90 dias **não** aparecem (filtro de ruído)

## 7. O que NÃO está pronto (de propósito)

- **Edição de ocorrência isolada.** Hoje editar/excluir afeta a série toda.
  Não há suporte a "essa ocorrência específica de março muda pra outro dia
  mas as outras ficam".
- **Recorrência semanal/diária.** Só múltiplos de mês.
- **Notificação no momento exato em que o movimento vence** (cron diário
  às 8h é o único disparo).

## 8. Próximos candidatos

- PDFs gerados no servidor com PDFKit (anexar em e-mails)
- Polimento mobile profundo (tabelas → cards, modais full-screen)
- Drag & drop de eventos no calendário
- Suporte a exceções na recorrência
- Recorrência semanal
