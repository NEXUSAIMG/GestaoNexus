# Sprint 14 — Processos / Workflows (BPMN simplificado)

Construtor visual de processos da empresa, com nós, arestas, papéis e
associação a equipes. Estilo BPMN simplificado.

## 1. O que essa sprint resolve

A empresa tem dezenas de processos não documentados ("como fazer
onboarding de cliente", "como aprovar uma compra", "como fechar o mês").
Antes, só na cabeça das pessoas. Agora, tem uma página onde qualquer
processo é desenhado visualmente, com responsabilidades claras (papéis
mapeados pra equipes ou pessoas).

A Sprint 15 vai usar isso pra **executar** processos: criar instâncias
que viram cards no Kanban automaticamente.

## 2. Modelo

5 tabelas:

```
processos              (cabeçalho: nome, descrição, cor, status, versão)
  ├── processos_equipes      (N:N com equipes da Sprint 10)
  ├── processos_papeis       (papéis dentro DESTE processo)
  ├── processos_nos          (caixinhas do diagrama)
  └── processos_arestas      (setas conectando nós)
```

**Decisões importantes:**

- **Papéis são por processo, não globais**. "Vendedor" no processo
  Onboarding pode ser uma equipe; "Vendedor" no processo Suporte pode
  ser uma pessoa. Mais flexível.
- **Tipos de nó**: `inicio`, `tarefa`, `decisao`, `fim`. Suficiente pra
  90% dos processos. Sem gateways paralelos / inclusivos por enquanto.
- **Posição (x,y) gravada**: ao reabrir, canvas fica idêntico ao salvar.
- **Replace-all ao salvar**: backend deleta nós/arestas/papéis e
  re-insere tudo numa transação. Mais simples e robusto que diff
  incremental, e a UI já manda o estado completo.
- **id_local** no payload: o frontend gera ids locais (`papel-1`,
  `no-3`) pra ligar nós-arestas-papéis sem depender dos UUIDs do banco.
  Backend mapeia local → real durante o INSERT.

## 3. Visibilidade

| Quem | O que vê | O que pode editar |
|---|---|---|
| Admin | Tudo | Tudo |
| Não-admin | Processos publicados + processos das equipes que é membro | Nada (Sprint 14) |

Status `arquivado` esconde da lista, mas histórico fica.

## 4. Endpoints

```
GET    /api/processos                        # lista resumida
GET    /api/processos/:id                    # processo completo (papéis, nós, arestas)
POST   /api/processos                        # cria vazio (com início+fim já)
PUT    /api/processos/:id                    # salva tudo (replace-all)
POST   /api/processos/:id/publicar
POST   /api/processos/:id/arquivar
```

Body do PUT (todos os campos opcionais — só envia o que mudou):

```jsonc
{
  "nome": "Onboarding",
  "descricao": "...",
  "cor": "blue",
  "equipes_ids": ["uuid1", "uuid2"],
  "papeis": [
    { "id_local": "papel-1", "nome": "Vendedor", "cor": "blue", "equipe_id": "uuid", "ordem": 0 }
  ],
  "nos": [
    { "id_local": "no-1", "tipo": "inicio", "rotulo": "Início", "posicao_x": 100, "posicao_y": 200 },
    { "id_local": "no-2", "tipo": "tarefa", "rotulo": "Receber pedido", "papel_id_local": "papel-1", "prazo_dias": 1, "posicao_x": 300, "posicao_y": 200 }
  ],
  "arestas": [
    { "origem_id_local": "no-1", "destino_id_local": "no-2", "rotulo": null }
  ]
}
```

## 5. Frontend

- **Lista** (`/processos`): cards com nome, status, equipes, qtd de nós
- **Editor** (`/processos/:id`):
  - Canvas React Flow no centro
  - Toolbar superior do canvas: botões pra adicionar Início/Tarefa/Decisão/Fim
  - Painel lateral direito com 3 abas:
    - **Papéis**: lista de papéis, adiciona/edita/remove, mapeia pra equipe ou pessoa
    - **Nó**: edita o nó selecionado (rótulo, descrição, papel, prazo)
    - **Geral**: nome, descrição, cor, equipes do processo
- **Indicador "alterado"** no header sempre que tem mudança não salva
- **Botões Salvar / Publicar / Arquivar** no header

## 6. Dependência nova

`reactflow` (v11) — ~70KB gz. Editor de fluxo open source (MIT). É o
padrão da indústria pra esse tipo de UI.

## 7. Como rodar

```bash
cd backend
npm run migrate                    # aplica 012
npm run dev:backend

cd ../frontend
npm install                        # instala reactflow
npm run dev:frontend
```

## 8. Roteiro de testes

- [ ] Acessa `/processos` → vazio, com botão "Criar primeiro processo"
- [ ] Cria "Onboarding de cliente" cor azul, equipe Comercial
- [ ] Editor abre com Início e Fim já no canvas
- [ ] Aba Papéis → adiciona "Vendedor" mapeado pra equipe Comercial
- [ ] Adiciona nó Tarefa "Receber pedido", atribui papel Vendedor, prazo 2 dias
- [ ] Liga Início → Receber pedido → Fim arrastando das bolinhas das laterais
- [ ] Clica Salvar → indicador "alterado" some
- [ ] Recarrega a página → tudo igual (posições, papéis, conexões)
- [ ] Adiciona nó Decisão "Cliente PJ?" com 2 saídas: "Sim" → outra tarefa, "Não" → Fim
- [ ] Clica Publicar → status muda pra "publicado"
- [ ] Edita um nó → versão incrementa pra v2 ao salvar
- [ ] Não-admin acessa `/processos` → só vê o publicado
- [ ] Arquivar → some da lista

## 9. Limitações conhecidas (Sprint 14)

- Não-admin não pode editar nada (Sprint 15 considera abrir pra membros)
- Sem gateways paralelos/inclusivos (BPMN cheio)
- Sem rótulos de aresta editáveis na UI (vai no payload, mas precisa
  via dev tools por enquanto — Sprint 15 deve adicionar)
- Sem swimlanes visuais (raias). Papéis são exibidos como label colorido
  em cima do nó, não como faixas horizontais. Suficiente, e mais limpo
  visualmente. Pode evoluir.
- Não valida coerência do grafo (ex: nó Tarefa sem entrada). Salva como
  está; cabe ao usuário modelar bem.

## 10. Próximos passos (Sprint 15)

- Botão "Iniciar instância" → cria 1 card por nó-tarefa em quadro novo
- Cada card recebe data_prazo baseada em prazo_dias do nó
- Estado da instância é seguido pelos cards: nó "concluído" quando
  o card vai pra coluna final
- Visualização da instância em andamento (qual etapa está ativa, etc.)

## 11. Arquivos da sprint

**Backend:**
- `db/migrations/012_processos.sql` (novo)
- `src/controllers/processos.controller.js` (novo)
- `src/routes/processos.routes.js` (novo)
- Edits: `routes/index.js`

**Frontend:**
- `src/pages/Processos.jsx` (novo, lista)
- `src/pages/EditorProcesso.jsx` (novo, ~700 linhas, canvas)
- Edits: `App.jsx`, `components/Sidebar.jsx`, `package.json`

**Total**: 5 arquivos novos, 4 editados.
