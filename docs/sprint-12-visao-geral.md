# Sprint 12 — Visão Geral (dashboard agregado)

Painel único com tudo o que está acontecendo na empresa: tarefas,
agenda, financeiro, governança e atividade recente. Substitui a
necessidade de pular entre 7 telas pra ter o panorama do dia.

## 1. O que essa sprint resolve

O Dashboard original (`/`) era basicamente um menu visual — links pras
áreas com descrição. Útil pra primeiro acesso, mas você precisava abrir
6 telas pra responder "o que está acontecendo agora?".

A Visão Geral (`/visao-geral`) responde isso numa página só, com:

- **KPIs no topo**: saldo em conta, contas a pagar, tarefas atrasadas, distribuído no ano
- **Gráfico**: fluxo de caixa dos últimos 6 meses (entradas vs saídas)
- **Pendências**: contas atrasadas, votos pendentes, tarefas vencendo hoje
- **Minhas tarefas**: cards atribuídos a você, ordenados por prazo
- **Agenda**: próximos 14 dias (governança + eventos de quadros)
- **Tarefas por equipe**: barras horizontais com totais e atrasados
- **Distribuição de lucros**: donut por sócio (ano vigente)
- **Saldos por conta**: lista detalhada de contas bancárias
- **Atividade recente**: últimas 15 ações registradas em `log_acoes`

## 2. Visibilidade (regra "III")

- **Admin**: vê tudo, em todos os quadros
- **Sócio normal**: vê
  - Cards e eventos só dos quadros que tem acesso (membro da equipe OU
    quadro com `aberto_a_socios=true`)
  - Números financeiros agregados completos (transparência)
  - Eventos de governança completos (são societários por natureza)
  - Distribuição de lucros: completa
  - Atividade recente: completa (já é alto-nível, sem dados sensíveis)

A condição SQL `condicaoVisibilidadeQuadros` no controller respeita isso
— admin recebe `TRUE`, não-admin recebe filtro com EXISTS em
`equipes_membros` OR `aberto_a_socios = TRUE`.

## 3. Mudança no padrão de quadros

A partir desta sprint, **quadros novos vêm marcados como "aberto a todos
os sócios" por padrão**. Alinha com a filosofia de transparência da
ferramenta. Pra criar quadro privado, é preciso desmarcar explicitamente.

Aplicado em:
- `backend/src/controllers/quadros.controller.js` — schema Zod (`default(true)`)
- `frontend/src/pages/Tarefas.jsx` — `useState(true)` no modal de criar

## 4. Endpoint

```
GET /api/dashboard
```

Retorna **um único blob JSON** com tudo. ~10 queries SQL no servidor,
respeitando a visibilidade do usuário logado.

Estrutura da resposta:

```jsonc
{
  "gerados_em": "2026-04-29T14:00:00Z",
  "pessoa": { "id": "...", "nome": "...", "administrador": true },
  "gerais": {
    "qtd_socios_ativos": 3,
    "qtd_equipes": 2,
    "qtd_quadros_visiveis": 5
  },
  "tarefas": {
    "resumo": {
      "atrasados": 4, "hoje": 2, "proximos_7": 8, "proximos_30": 15,
      "sem_prazo": 12, "total": 41
    },
    "meus": [{ "id": "...", "titulo": "...", "data_prazo": "...", "quadro_nome": "...", "equipe_nome": "...", "equipe_cor": "blue" }],
    "por_equipe": [{ "id": "...", "nome": "...", "cor": "...", "total": 10, "atrasados": 2 }]
  },
  "agenda": {
    "governanca": [...],
    "quadros":   [...]
  },
  "financeiro": {
    "saldo_total": 12500.50,
    "contas":     [{ "id": "...", "nome": "...", "saldo": ... }],
    "entradas_mes": ..., "qtd_entradas": ...,
    "pagamentos_mes": ..., "qtd_pagamentos": ...,
    "contas_a_pagar": {
      "atrasadas": 2, "total_atrasadas": 350.00,
      "vencendo_7": 4, "total_vencendo_7": 1800.00,
      "pendentes_total": 9, "total_pendentes": 4500.00
    },
    "fluxo_serie": [{ "mes": "2026-01", "entradas": ..., "saidas": ..., "saldo": ... }]
  },
  "socios": {
    "distribuicoes_ano": { "distribuido": ..., "previsto": ..., "qtd_efetivadas": ..., "qtd_previstas": ... },
    "por_socio":         [{ "id": "...", "nome": "...", "valor": ... }]
  },
  "governanca": {
    "docs_aprovacao": 1, "decisoes_aprovacao": 0, "docs_vigentes": 5
  },
  "atividade": [{ "acao": "...", "detalhes": {}, "criado_em": "...", "pessoa_nome": "..." }]
}
```

## 5. Gráficos

Sem nova dependência. Mantém o padrão das Sprints 3-4 (`GraficoFluxo.jsx`,
`GraficoMensal.jsx`): **SVG puro**.

3 gráficos no `VisaoGeral.jsx`:
- `GraficoFluxoCaixa` — barras emparelhadas (entradas verdes, saídas vermelhas) por mês
- `GraficoTarefasPorEquipe` — barras horizontais (com sobreposição vermelha pra atrasados)
- `GraficoDistribuicaoSocios` — donut com legenda lateral

Todos responsivos via `viewBox`.

## 6. Como rodar

```bash
cd backend
# Sem migration nova
npm run dev:backend

cd ../frontend
npm run dev:frontend
```

Acessa `/visao-geral` ou clica em "Visão geral" no topo do sidebar.

## 7. Roteiro de testes

- [ ] Login como admin → "Visão geral" no menu, KPIs preenchidos
- [ ] Sem dados, KPIs mostram 0 / R$ 0,00 sem quebrar
- [ ] Cria 1 conta a pagar atrasada → aparece em "Pendências"
- [ ] Cria 1 card atribuído a você com prazo hoje → aparece em "Minhas tarefas"
- [ ] Cria evento de quadro → aparece na "Agenda" (próximos 14 dias)
- [ ] Cria distribuição efetivada → donut do sócio aparece
- [ ] Sócio não-admin (que não é membro de equipe) não vê tarefas de quadros privados
- [ ] Mesmo sócio vê quadros com `aberto_a_socios=true`
- [ ] Botão "Atualizar" recarrega a página

## 8. Performance

10 queries em paralelo seria ideal, mas escolhi sequencial pra simplificar
o código e porque o sistema é pequeno. Se algum dia ficar lento (>500ms
total), a refatoração é trivial: envolver com `Promise.all`.

Nenhuma query faz JOIN N+1. Todas as agregações são feitas no SQL.

## 9. Arquivos da sprint

**Backend:**
- `src/controllers/dashboard.controller.js` (novo)
- `src/routes/dashboard.routes.js` (novo)
- Edits: `routes/index.js`, `controllers/quadros.controller.js` (default flag)

**Frontend:**
- `src/pages/VisaoGeral.jsx` (novo, ~600 linhas)
- Edits: `App.jsx`, `components/Sidebar.jsx`, `pages/Tarefas.jsx`,
  `pages/Login.jsx`, `pages/Dashboard.jsx`

**Total**: 3 arquivos novos, 6 editados.

## 10. O que NÃO entrou (futuro)

- Filtros temporais (3 meses / 6 meses / ano)
- Exportar visão geral em PDF
- Comparativo com período anterior ("este mês vs mês passado")
- Drill-down nos KPIs (clicar e abrir detalhe)
- Notificação push quando algo crítico mudar
