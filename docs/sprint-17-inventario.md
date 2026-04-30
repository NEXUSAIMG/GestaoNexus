# Sprint 17 — Inventário / Patrimônio

**Status:** ✅ Entregue. Rodar migration 016 e testar.

## Objetivo

Cadastrar bens físicos da empresa (computadores, mobília, eletrônicos, veículos, suprimentos) com:
- nota fiscal, fornecedor, valor, data de aquisição
- localização e responsável
- garantia (com alerta de vencimento)
- status (em uso, estoque, manutenção, baixado)
- **histórico completo** de movimentações (transferências, mudanças de status, anexos)
- anexos (PDF da NF, foto do item, manual)

## Decisões travadas

| # | Decisão | O que isso significa |
|---|---------|---------------------|
| 1C | Quantidade livre | Admin escolhe na hora: 10 cadeiras = 1 registro c/ qtd=10, ou 10 registros separados. Cada caso por caso. |
| 2A | Anexo de NF | Upload de PDF/imagem/Word vinculado ao item. Tabela `inventario_anexos`. |
| 3B | Categorias cadastráveis | `inventario_categorias` editável pelo admin, com seed de 6 padrões. |
| 4B | Sem ligação com /contas-pagar | Campos soltos: `nf_numero`, `fornecedor`, `valor`, etc. Pode ligar numa sprint futura. |
| 5A | Histórico completo | Toda mudança gera linha em `inventario_movimentos`. Timeline na tela de detalhe. |

## Modelo de dados (migration `016_inventario.sql`)

### `inventario_categorias`
- nome, slug, cor, icone (lucide-react), ordem
- arquivada_em (soft delete)
- únicos parciais em `nome` e `slug` entre não-arquivadas

**Seed inicial:** Mobília, TI, Eletrônicos, Veículos, Suprimentos, Outros.

### `inventario_itens`
- **codigo:** auto-gerado `INV-XXXX` via sequence
- **nome, descricao, categoria_id**
- **qtd, valor_unitario, valor_total** (calculado: `GENERATED ALWAYS AS (qtd * valor_unitario) STORED`)
- **NF:** `nf_numero, nf_serie, nf_data, nf_valor, fornecedor, data_aquisicao, forma_pagamento`
- **Local:** `localizacao` (texto), `responsavel_id` (FK pessoas_acesso)
- **Status:** em_uso / em_estoque / manutencao / descartado / vendido / perdido
- **Baixa:** `data_descarte, motivo_descarte`
- **Garantia:** `garantia_meses, garantia_fim` (calculada)
- **Identificação física:** `numero_serie` (fabricante), `patrimonio_etiqueta` (etiqueta colada)
- **Auditoria:** `registrado_por_id, criado_em, atualizado_em`

### `inventario_movimentos` (histórico)
Tipos: cadastro / edicao / transferencia / troca_status / descarte / manutencao / anexo

Cada movimento guarda os "de/para" relevantes (responsável, localização, status), observação, jsonb de detalhes, quem fez e quando.

### `inventario_anexos`
- tipo: nf / foto / manual / outro
- nome_original, arquivo_path (relativo ao UPLOADS_DIR), mime_type, tamanho_bytes
- enviado_por_id

### Triggers
`atualizado_em` automático em UPDATE pra categorias e itens.

## API

### Categorias
```
GET    /api/inventario/categorias                  todos
POST   /api/inventario/categorias                  admin
PUT    /api/inventario/categorias/:id              admin
POST   /api/inventario/categorias/:id/arquivar     admin (bloqueia se tem itens)
POST   /api/inventario/categorias/:id/desarquivar  admin
```

### Itens
```
GET    /api/inventario                             ?categoria_id=&status=&busca=&responsavel_id=
GET    /api/inventario/resumo                      KPIs
GET    /api/inventario/:id                         detalhe
POST   /api/inventario                             admin (cria + movimento 'cadastro')
PUT    /api/inventario/:id                         admin (cria movimentos por mudança detectada)
POST   /api/inventario/:id/transferir              admin (responsável e/ou local)
POST   /api/inventario/:id/descartar               admin (status + motivo obrigatório)
GET    /api/inventario/:id/movimentos              histórico cronológico
```

### Anexos
```
GET    /api/inventario/:id/anexos
POST   /api/inventario/:id/anexos                  admin (multipart: arquivo, tipo, descricao)
GET    /api/inventario/:id/anexos/:anexoId/baixar  stream do arquivo
DELETE /api/inventario/:id/anexos/:anexoId         admin
```

## UI

### `/inventario` (lista)
- 4 KPIs no topo: itens cadastrados, valor total, em manutenção, garantias (vencendo/vencidas)
- Busca (debounce 400ms), filtro por categoria e status
- Tabela: código, nome, categoria (com bolinha colorida), qtd, valor total, responsável, status, data aquisição
- Admin: botão "Cadastrar item" abre modal com 5 fieldsets:
  1. **Identificação** — nome, categoria, status, descrição, nº série, etiqueta
  2. **Quantidade e valor** — qtd, valor unitário, total calculado live
  3. **Aquisição** — data, forma pagto, fornecedor, NF (número/série/data/valor)
  4. **Localização e responsável** — local + responsável (dropdown de pessoas)
  5. **Garantia** — meses (data fim calculada automaticamente)

### `/inventario/:id` (detalhe)
- Cabeçalho: código, nome, etiqueta, status, categoria, responsável
- 4 cards de info: qtd, valor total, localização, garantia (com cores: vencida=vermelho, vencendo=âmbar, ok=verde)
- Botões admin: **Transferir**, **Dar baixa**, **Editar**

3 tabs:
1. **Geral** — todos os campos formatados em blocos (Identificação, Aquisição, Localização, Garantia, Auditoria)
2. **Anexos** — upload + lista com download/exclusão. Suporta PDF, imagens, Word. Cada upload/exclusão gera movimento.
3. **Histórico** — timeline com ícones por tipo. Mostra "de → para" pra transferência e troca de status.

### Modais admin
- **Editar:** todos os campos. Detecta mudanças de responsável/localização/status e cria movimentos do tipo correto.
- **Transferir:** atalho rápido pra mudar responsável + local + observação (sem precisar abrir o editor completo).
- **Dar baixa:** seletor visual (Descartado/Vendido/Perdido) + data + motivo obrigatório (mín 3 chars). Confirma com aviso de irreversibilidade.

## Fluxos importantes

### Cadastro
1. Admin clica em "Cadastrar item" → preenche modal → salva
2. Cria registro em `inventario_itens` (com código auto INV-XXXX)
3. Cria movimento `cadastro` automaticamente
4. Gera log de auditoria

### Edição genérica
1. Admin abre item → "Editar" → muda campos → salva
2. Endpoint compara estado atual com payload
3. Se mudou responsável OU localização → movimento `transferencia`
4. Se mudou status → movimento `troca_status`
5. Se só mudaram outros campos → movimento `edicao` com lista de campos no jsonb

### Anexar NF
1. Detalhe do item → tab Anexos
2. Escolhe tipo (NF / Foto / Manual / Outro)
3. Seleciona arquivo (multer + validação MIME + 10MB)
4. Backend salva em `UPLOADS_DIR/inventario/HASH.ext`
5. Cria registro em `inventario_anexos` + movimento `anexo`
6. Tela atualiza com novo anexo no topo

### Garantia
- Backend calcula `garantia_fim = data_aquisicao + garantia_meses`
- Frontend classifica: vencida (cor vermelha), vencendo em ≤60d (âmbar), ok (verde)
- Resumo expõe `qtd_garantia_vencendo` e `qtd_garantia_vencida` pros KPIs

### Baixa
1. Admin clica "Dar baixa" → escolhe tipo + data + motivo
2. Backend grava status, data_descarte, motivo_descarte
3. Cria movimento `descarte` com de_status/para_status
4. Item fica visualmente esmaecido na tela; ações (transferir, editar, dar baixa) ficam bloqueadas

## Arquivos novos

```
backend/db/migrations/016_inventario.sql
backend/src/controllers/inventario.controller.js              (já existia, sessão paralela)
backend/src/controllers/inventario-categorias.controller.js   (já existia, sessão paralela)
backend/src/controllers/inventario-anexos.controller.js       (novo)
backend/src/routes/inventario.routes.js                       (novo)
frontend/src/pages/Inventario.jsx                             (novo)
frontend/src/pages/InventarioItem.jsx                         (novo)
docs/sprint-17-inventario.md                                  (este arquivo)
```

Editados:
- `backend/src/routes/index.js` (plug + bump versão pra 1.5)
- `frontend/src/App.jsx` (rotas)
- `frontend/src/components/Sidebar.jsx` (item Inventário)
- `backend/src/utils/uploads.js` (uploaderInventario já estava lá da sessão paralela)

## Como testar depois do deploy

1. Login admin → sidebar → **Inventário**
2. Página vazia, clica **"Cadastrar item"**
3. Preenche um exemplo: "Notebook Dell", categoria TI, qtd 1, valor R$ 4.500, NF nº 123, fornecedor "Loja XYZ", data hoje, responsável Você, garantia 12 meses
4. Salva → vai pra lista, vê o item INV-0001
5. Clica no código → tela de detalhe
6. Tab **Anexos** → faz upload de um PDF qualquer marcado como NF
7. Tab **Histórico** → vê o cadastro + o anexo
8. Botão **Transferir** → muda pra outro responsável → confere histórico
9. Cadastra mais 2-3 itens em categorias diferentes (Mobília, Eletrônicos)
10. Confere KPIs do topo da lista

## Limitações conhecidas

1. **Volume no Railway:** anexos vão pra `UPLOADS_DIR`. Em produção precisa de Volume montado, senão arquivos somem no redeploy. Igual sprint 6.
2. **Sem importação em massa:** não tem CSV import — pra cadastrar muito, precisa via API.
3. **Sem QR code/etiqueta:** etiqueta é texto livre. Geração de PDF de etiquetas adesivas fica pra futuro.
4. **Sem depreciação contábil:** valor é registrado só no momento da aquisição. Não há cálculo de depreciação anual.
5. **Sem transferência em lote:** transferir 50 itens de uma sala pra outra exige editar 50.

## Possíveis evoluções futuras

- Geração de PDF com etiquetas QR code prontas pra colar nos itens
- Linkagem opcional com `/contas-pagar` (ao cadastrar item, vincular o pagamento já registrado)
- Depreciação anual automática (relevante pro IR)
- Importação CSV
- Notificação automática quando garantia está perto de vencer (Sprint 7 já tem infra)
- Filtro "meus itens" pra cada pessoa ver o que está sob sua responsabilidade
