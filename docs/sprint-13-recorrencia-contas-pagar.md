# Sprint 13 — Recorrência em contas a pagar

Permite cadastrar contas que se repetem (mensal, trimestral, semestral,
anual), com 3 modos de fim: por quantidade, por data limite, ou
infinito (estendido automaticamente pelo cron).

## 1. O que essa sprint resolve

Antes, cada mês de aluguel ou folha era um cadastro manual. Esquecimento
ou cadastro duplicado eram comuns. Agora um único formulário gera a
série inteira — cada ocorrência é uma `conta_pagar` real e independente.

## 2. Modelo (B): materialização

Cada ocorrência é uma linha em `contas_pagar` com mesmo
`grupo_recorrencia_id`. Independência total:

- Pagar uma não afeta as outras
- Cancelar uma não afeta as outras
- Cada uma tem seu próprio comprovante
- Cada uma aparece individualmente no fluxo de caixa, no dashboard, etc.

A "série" só existe como ligação lógica via `grupo_recorrencia_id` —
não há tabela `grupos_recorrencia` separada. Os campos da regra
(`recorrencia_tipo`, `recorrencia_qtd`, `recorrencia_ate`) ficam
replicados em cada ocorrência. Trade-off escolhido: simplicidade > DRY.

## 3. Modos de fim

| Modo | `qtd` | `ate` | Resultado |
|---|---|---|---|
| Por N vezes | preenchido | NULL | Gera exatamente N ocorrências |
| Até a data | NULL | preenchido | Gera até atingir a data |
| Infinito | NULL | NULL | Gera 24 meses + cron mensal estende |

O cron `iniciarAgendadorRecorrencias` roda dia 1 às 03:00 (timezone
NOTIFICACOES_TIMEZONE — São Paulo por padrão). Para cada série
infinita, se o último vencimento gerado está a < 12 meses no futuro,
estende mais 12 meses. Idempotente.

## 4. Cancelar série

Endpoint `POST /api/contas-pagar/grupo/:grupoId/cancelar-serie` muda
**apenas as pendentes** para `status='cancelada'`. Pagas e já canceladas
ficam intactas. Retorna `{ canceladas: N }`.

Botão "Cancelar série" (ícone Layers) aparece nas linhas recorrentes da
tabela, ao lado do botão "Cancelar esta".

## 5. Endpoints

```
POST   /api/contas-pagar                     # body.recorrencia opcional
POST   /api/contas-pagar/grupo/:grupoId/cancelar-serie
```

Body de criação com recorrência:

```jsonc
{
  "descricao": "Aluguel",
  "valor": 3000,
  "data_vencimento": "2026-05-10",
  "categoria_id": "...",
  "recorrencia": {
    "tipo": "mensal",
    "qtd": 12        // OU "ate": "2027-05-10" OU nenhum (= infinito)
  }
}
```

Resposta inclui `qtd_geradas` no topo (quantas contas foram criadas).

## 6. Frontend

- **Modal "Nova conta"**: toggle "Esta conta se repete" abre bloco com:
  - Frequência (select)
  - Modo de fim (3 radios)
- **Tabela**: ícone ↻ (Repeat) à esquerda da descrição, com label
  "Mensal · 3/12" ou "Mensal · até DD/MM" ou "Mensal · sem término"
- **Ações**: botão Layers (vermelho) "Cancelar série" só em contas
  recorrentes pendentes
- **Modal "Cancelar série"**: aviso forte vermelho, mostra dados da
  série, exige motivo, confirma com alert mostrando quantidade cancelada

## 7. Como rodar

```bash
cd backend
npm run migrate     # aplica 011
npm run dev:backend

# em outro terminal
cd frontend
npm run dev:frontend
```

Sem deps novas.

## 8. Roteiro de testes

- [ ] Criar conta "Aluguel R$ 3000 mensal por 6 vezes" → 6 contas
      aparecem com ícone ↻ e label "1/6", "2/6", ...
- [ ] Filtro "Pendentes" mostra todas as 6
- [ ] Pagar a primeira → 5 pendentes restantes; a paga não some, vai
      pro filtro "Pagas"
- [ ] Editar a 3ª (mudar valor) → só ela muda; outras intactas
- [ ] Cancelar a 4ª individualmente → só ela cancela
- [ ] Clicar "Cancelar série" na 5ª → confirmação, e: 4 pendentes
      (5, 6 e... pera, 5 e 6) viram canceladas; a paga (1ª) intacta;
      a já cancelada individual (4ª) intacta
- [ ] Criar série "infinito" → 24 contas geradas. Sem cron rodando, isso
      é o teste suficiente
- [ ] Criar com data limite "até 31/12/2026" → gera até esse limite
- [ ] Tentar criar com qtd=0 → rejeitado (Zod min(1))
- [ ] Tentar enviar `qtd` E `ate` no mesmo payload → rejeitado pelo refine

## 9. O que NÃO entrou

- Editar a regra de uma série (precisa cancelar e criar nova)
- Pular uma ocorrência específica (cancela individual e cria solta)
- Recorrência semanal / quinzenal (só múltiplos de mês por enquanto)
- Recorrência em outras tabelas (movimentos de sócios, distribuições)

## 10. Arquivos da sprint

**Backend:**
- `db/migrations/011_contas_pagar_recorrencia.sql` (novo)
- `src/services/recorrencia-contas.service.js` (novo)
- Edits: `controllers/contas-pagar.controller.js`,
  `routes/contas-pagar.routes.js`, `services/scheduler.js`,
  `server.js`

**Frontend:**
- Edits: `pages/ContasPagar.jsx` (toggle + ícone + ModalCancelarSerie)

**Total**: 2 arquivos novos, 5 editados.
