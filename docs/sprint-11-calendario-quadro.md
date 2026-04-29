# Sprint 11 — Calendário por quadro

Aba "Calendário" no topo do board kanban, com eventos avulsos e cards
mesclados na mesma visão.

## 1. O que essa sprint resolve

Antes só havia calendário em Governança (reuniões societárias, eventos
legais). O trabalho operacional do dia a dia ficava sem visão temporal:
prazos de cards aparecem só nas pílulas dos cards, e não havia onde
marcar reunião semanal da equipe sem virar tarefa.

Solução: cada quadro tem seu próprio calendário, mostrando eventos
avulsos do quadro (reuniões, deadlines, marcos) **e** os cards do
quadro com `data_prazo`.

## 2. Modelo

Tabela nova `eventos_quadro`. Estrutura espelhada em `eventos_calendario`
(governança), mas com `quadro_id` em vez de ser global.

```
eventos_quadro
  id, quadro_id, titulo, descricao, tipo,
  data_inicio, data_fim, dia_inteiro,
  local, link, observacao,
  recorrencia_tipo, recorrencia_ate,
  criado_por_id, criado_em, atualizado_em
```

Tipos de evento: `reuniao`, `deadline`, `marco`, `outro`.
Recorrência: `mensal`, `trimestral`, `semestral`, `anual` (ou nulo).

Cards continuam em `cards` (Sprint 10) — não duplica dado. A API de
listar eventos do quadro mescla os dois na resposta.

## 3. Permissões

| Ação | Quem pode |
|---|---|
| Visualizar calendário | Mesma regra do quadro (membro OU sócio se aberto_a_socios) |
| Criar/editar/excluir eventos | Membro da equipe (o que vale pro quadro) |
| Click em card no calendário | Leva pro modal do card no kanban |

## 4. Endpoints

```
GET    /api/quadros/:id/eventos[?inicio=&fim=]
GET    /api/quadros/:id/eventos/:eventoId
POST   /api/quadros/:id/eventos
PUT    /api/quadros/:id/eventos/:eventoId
DELETE /api/quadros/:id/eventos/:eventoId
```

A listagem retorna eventos + cards do mesmo período, com campo `fonte`
diferenciando (`'evento'` ou `'card'`). Cards aparecem como dia inteiro
na sua `data_prazo`.

## 5. Frontend

- **Aba** "Kanban" / "Calendário" no topo do `Quadro.jsx`
- **Componente novo**: `components/QuadroCalendario.jsx`
- **Reusa**: `CalendarioMensal.jsx` (extendido com 3 cores novas:
  `deadline`, `marco`, `card`)
- **Click em evento**: abre modal de edição da série
- **Click em card no calendário**: volta pra aba kanban e abre o modal
  do card

## 6. Como rodar

```bash
cd backend
npm run migrate           # aplica 010_eventos_quadro.sql
npm run dev

# em outro terminal
cd frontend
npm run dev               # nada novo no package.json
```

## 7. Roteiro de testes

- [ ] Abre um quadro existente
- [ ] Aba "Calendário" aparece no topo
- [ ] Clicando em "Calendário", a vista muda pra grid mensal
- [ ] Cards do quadro com `data_prazo` aparecem em verde no dia certo
- [ ] Botão "Novo evento" → cria evento "Reunião semanal" recorrente mensal
- [ ] Evento aparece nos meses futuros (até 24 meses por default)
- [ ] Click no card no calendário → volta pro kanban com modal aberto
- [ ] Click em evento → modal de edição
- [ ] Editar título do evento → mexe na série toda
- [ ] Excluir → confirma "excluir série" e some do calendário
- [ ] Não-membro de equipe aberta a sócios: vê o calendário, sem botão "Novo evento"

## 8. O que NÃO entrou

- Notificação por e-mail de evento próximo (só cards têm hoje)
- Drag de eventos no calendário pra mudar data (kanban tem, calendário não)
- Vista semanal/diária (só mensal)
- Evento como entrada de auditoria estruturada (cair em log_acoes basta)

## 9. Arquivos da sprint

**Backend:**
- `db/migrations/010_eventos_quadro.sql`
- `src/controllers/eventos-quadro.controller.js`
- Edits: `routes/quadros.routes.js`

**Frontend:**
- `src/components/QuadroCalendario.jsx`
- Edits: `pages/Quadro.jsx`, `components/CalendarioMensal.jsx`

**Total**: 3 arquivos novos, 3 editados.
