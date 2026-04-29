# Sprint 6 — Governança

Tudo o que torna a empresa "uma sociedade de fato" e não só uma planilha
de finanças: atas das reuniões, decisões formais com voto dos sócios,
contrato social vigente versionado, e um calendário societário com as
datas que ninguém pode esquecer.

## 1. O problema que essa sprint resolve

Até a Sprint 5 a ferramenta cuidava de **dinheiro**. A partir da Sprint 6,
cuida também das **decisões** que mexem com esse dinheiro:

- "Quando foi aprovada aquela distribuição extraordinária? Onde está a ata?"
- "Qual versão do contrato social está em vigor agora? Quando trocou?"
- "A reunião do trimestre é dia 15 ou dia 22?"
- "Já votei naquela proposta? Quantos sócios faltam votar?"

Esses são todos problemas que tipicamente vivem em e-mail, WhatsApp e
Drive de alguém. A Sprint 6 traz tudo pra dentro do app, com
rastreabilidade (quem votou o quê e quando) e modelo simples (1 sócio
= 1 voto).

## 2. Escopo

### O que entra

- **Atas de reunião** com upload de PDF/imagem, votação por sócio,
  status calculado automaticamente (em aprovação → aprovada/rejeitada
  → arquivada)
- **Decisões formais** (sem arquivo): textos descritivos com fluxo
  de aprovação igual ao das atas
- **Contrato social** versionado: um único contrato vigente por vez,
  histórico completo das versões anteriores, fluxo de aprovação antes
  de virar vigente
- **Calendário societário** em grid mensal estilo Google Calendar com
  4 tipos: reunião, vencimento legal, pagamento importante, outro
- **Modelo de quorum** com 2 modalidades: maioria simples (mais de 50%
  dos sócios ativos) e unanimidade (todos)
- **Permissões finas**: votar em decisões usa `pode_votar`; votar em
  atas usa `pode_aprovar_atas`; criar/editar/excluir é admin-only
- **Audit log** em todas as ações (criou, votou, arquivou, marcou
  vigente, etc.)
- **Storage de arquivos local** com hash no nome + validação MIME +
  limite de tamanho configurável

### O que NÃO entra (deliberado)

| Ficou fora                                       | Motivo                                                    |
| ------------------------------------------------ | --------------------------------------------------------- |
| Assinatura digital com valor jurídico            | Clicksign/D4Sign custa e exige integração; checkbox interno é suficiente para uso interno |
| Storage S3/R2                                    | Time pequeno, deploy único Railway com Volume é mais simples; migrar depois é trivial |
| Notificação por e-mail de novo voto/ata          | Sai na Sprint 7 com o resto dos e-mails automáticos       |
| Drag & drop no calendário                        | Calendário só de leitura/edição via modal, sem manipulação direta |
| Recorrência de eventos (reunião mensal etc.)     | Cada evento é único; recorrência é Sprint 7               |
| OCR / busca dentro de PDFs                       | Fora de escopo                                            |
| Aprovação obrigatória pra distribuição (Sprint 5) | `pode_aprovar_distribuicoes` permanece placeholder. Quem quiser usar, cria uma "Decisão" pra cada distribuição |
| Versão do contrato com diff                      | Versionamento simples (incrementa número); diff visual seria nice-to-have |

### O que mudou em código já existente

Nada. Toda a Sprint 6 é aditiva — nem migration nova quebra dados, nem
controller existente foi alterado. Sócios e lucros continuam funcionando
exatamente como na Sprint 5.

## 3. Modelo de dados

### `documentos_governanca`

Tabela genérica que serve atas, contratos sociais e "outros".

```
id                         uuid PK
tipo                       text NOT NULL CHECK IN ('ata','contrato_social','outro')
titulo                     text NOT NULL
descricao                  text         -- resumo / decisões tomadas
data_referencia            date NOT NULL  -- data da reunião / vigência
arquivo_nome               text         -- nome original
arquivo_caminho            text         -- caminho relativo no UPLOADS_DIR
arquivo_tamanho            bigint
arquivo_mime               text
versao                     int          -- só preenchido para contrato_social
vigente                    boolean DEFAULT FALSE  -- só pode ser TRUE em contrato
requer_aprovacao           boolean DEFAULT TRUE
quorum                     text NOT NULL CHECK IN ('maioria_simples','unanimidade')
status                     text NOT NULL CHECK IN
                             ('rascunho','em_aprovacao','aprovado','rejeitado','arquivado')
criado_por_id              uuid → pessoas_acesso(id)
criado_em                  timestamptz
atualizado_em              timestamptz
```

CHECKs / UNIQUEs:
- UNIQUE parcial: só pode existir UM contrato_social vigente por vez
  (`WHERE tipo='contrato_social' AND vigente=TRUE`)
- `vigente=TRUE` só em `tipo='contrato_social'`
- `versao` só preenchido em `tipo='contrato_social'`

### `aprovacoes_documento`

Voto de cada sócio em cada documento.

```
id                         uuid PK
documento_id               uuid NOT NULL → documentos_governanca(id) ON DELETE CASCADE
socio_id                   uuid NOT NULL → socios(id)
pessoa_acesso_id           uuid → pessoas_acesso(id)  -- quem registrou (titular ou representante)
voto                       text NOT NULL CHECK IN ('aprovado','rejeitado','abstencao')
comentario                 text
registrado_em              timestamptz NOT NULL DEFAULT NOW()
atualizado_em              timestamptz
```

UNIQUE: `(documento_id, socio_id)` — 1 voto por sócio por documento.
Re-votar é `UPDATE` via `INSERT … ON CONFLICT DO UPDATE`.

### `decisoes`

Decisões formais sem arquivo (texto puro).

```
id                         uuid PK
titulo                     text NOT NULL
descricao                  text NOT NULL  -- texto formal da decisão
tipo                       text         -- livre: 'distribuicao', 'mudanca_capital', 'geral', etc.
referencia_externa         text         -- ex: id de uma distribuicao_lucros
data_proposta              date NOT NULL
prazo_aprovacao            date
quorum                     text NOT NULL CHECK IN ('maioria_simples','unanimidade')
status                     text NOT NULL CHECK IN
                             ('em_aprovacao','aprovada','rejeitada','cancelada')
motivo_cancelamento        text         -- obrigatório se cancelada
finalizada_em              timestamptz  -- quando virou aprovada/rejeitada/cancelada
criado_por_id              uuid → pessoas_acesso(id)
criado_em                  timestamptz
atualizado_em              timestamptz
```

CHECK: `cancelada` exige `motivo_cancelamento`.

### `aprovacoes_decisao`

Análoga a `aprovacoes_documento`. UNIQUE em `(decisao_id, socio_id)`.

### `eventos_calendario`

Cada item do calendário societário.

```
id                         uuid PK
titulo                     text NOT NULL
descricao                  text
tipo                       text NOT NULL CHECK IN
                             ('reuniao','vencimento_legal','pagamento_importante','outro')
data_inicio                timestamptz NOT NULL
data_fim                   timestamptz
dia_inteiro                boolean DEFAULT FALSE
local                      text
link                       text         -- meet, notion, etc.
observacao                 text
criado_por_id              uuid → pessoas_acesso(id)
criado_em                  timestamptz
atualizado_em              timestamptz
```

CHECK: `data_fim >= data_inicio` (quando preenchida).

## 4. Modelo de aprovação

### Quorum

| Modalidade        | Aprovado quando…                      | Rejeitado quando…                          |
| ----------------- | ------------------------------------- | ------------------------------------------ |
| `maioria_simples` | aprovações ≥ floor(N/2)+1             | rejeições ≥ floor(N/2)+1                   |
| `unanimidade`     | TODOS os N sócios votaram `aprovado`  | qualquer rejeição já rejeita imediatamente |

N = sócios ativos na hora do voto. A função `avaliarAprovacao()` é
chamada após cada voto e atualiza o status do documento/decisão dentro
da mesma transação. Se ainda não atingiu o quorum, fica `em_aprovacao`.

### Quem pode votar

| Tipo de item                  | Poder exigido        | Bypass admin |
| ----------------------------- | -------------------- | ------------ |
| Documento `tipo='ata'`        | `pode_aprovar_atas`  | sim          |
| Documento `tipo='contrato_social'` ou `'outro'` | `pode_votar`         | sim          |
| Decisão                       | `pode_votar`         | sim          |

Admin sempre pode votar (bypass), mas precisa estar em **um contexto
de sócio** (porque o voto pertence a um sócio, não a uma pessoa). Se o
admin não tem nenhuma representação ativa, o backend devolve 400.

### Re-votar

Permitido — é um UPSERT. O voto novo substitui o anterior, mantém a
mesma linha (e portanto o mesmo `id`), atualiza `comentario` e
`pessoa_acesso_id`. O frontend mostra qual é o "voto atual" do sócio
do contexto ativo destacado no painel.

## 5. Storage de arquivos

### Decisão: filesystem local

Sem S3, sem R2, sem bytea no banco. Os arquivos vão pro disco do
servidor. O caminho base vem de `UPLOADS_DIR` (env, default
`uploads`), com subpasta `governanca/`. Nome do arquivo é um hash
hexadecimal de 16 bytes + extensão original (limitada a 8 chars):
`f3a8c1...d2.pdf`.

### Validação no upload (multer)

- MIME aceito: `application/pdf`, `image/png`, `image/jpeg`,
  `image/webp`, `application/msword`,
  `application/vnd.openxmlformats-officedocument.wordprocessingml.document`
- Tamanho máximo: `UPLOADS_MAX_MB` (env, default 10 MB)
- Anti path-traversal: `resolverCaminhoAbsoluto()` verifica que o
  caminho final está dentro de `UPLOADS_DIR`

### Aviso crítico para deploy Railway

Sem **Volume montado**, o filesystem do container Railway **se perde
em todo redeploy**. Quando isso acontecer, os documentos no banco
ficam órfãos (registros existem, arquivos não). O endpoint de
download detecta e devolve 410 com código `arquivo_perdido`.

Para evitar:
1. Criar Volume no Railway (ex: `nexus-uploads`, 1 GB inicial)
2. Apontar `UPLOADS_DIR` para o caminho montado (ex: `/data/uploads`)
3. Documentar internamente: nunca fazer "Reset volume" sem backup

`backend/.env.example` tem essas instruções. `backend/uploads/` está
no `.gitignore`.

## 6. Novas rotas da API

Todas em `/api/governanca/*`.

### Documentos (atas, contratos, outros)

| Método | Caminho                                              | Acesso        | O que faz                                           |
| ------ | ---------------------------------------------------- | ------------- | --------------------------------------------------- |
| GET    | `/contrato-vigente`                                  | Autenticado   | Atalho — retorna o contrato com `vigente=TRUE`     |
| GET    | `/documentos`                                        | Autenticado   | Lista (filtros: tipo, status, ano)                  |
| GET    | `/documentos/:id`                                    | Autenticado   | Detalhes + lista de aprovações + total elegíveis    |
| GET    | `/documentos/:id/arquivo`                            | Autenticado   | Stream do arquivo (Content-Disposition inline)      |
| POST   | `/documentos`                                        | Admin         | Cria (multipart, arquivo opcional no mesmo request) |
| PUT    | `/documentos/:id`                                    | Admin         | Edita metadados (só rascunho/em_aprovacao sem votos)|
| POST   | `/documentos/:id/arquivo`                            | Admin         | Substitui o arquivo                                 |
| POST   | `/documentos/:id/votar`                              | Sócio com poder + admin | Registra/atualiza voto (UPSERT)            |
| POST   | `/documentos/:id/marcar-vigente`                     | Admin         | Só contrato_social aprovado vira vigente            |
| POST   | `/documentos/:id/arquivar`                           | Admin         | Move pra arquivado (não funciona se vigente)        |
| DELETE | `/documentos/:id`                                    | Admin         | Só rascunhos (apaga arquivo + registro)             |

### Decisões

| Método | Caminho                              | Acesso                  | O que faz                                |
| ------ | ------------------------------------ | ----------------------- | ---------------------------------------- |
| GET    | `/decisoes`                          | Autenticado             | Lista (filtros: status, ano)             |
| GET    | `/decisoes/:id`                      | Autenticado             | Detalhes + aprovações + total elegíveis  |
| POST   | `/decisoes`                          | Admin                   | Cria nova decisão                        |
| PUT    | `/decisoes/:id`                      | Admin                   | Edita (só `em_aprovacao` sem votos)      |
| POST   | `/decisoes/:id/votar`                | Sócio com `pode_votar` + admin | Voto (UPSERT)                     |
| POST   | `/decisoes/:id/cancelar`             | Admin                   | Cancela com motivo obrigatório           |

### Eventos do calendário

| Método | Caminho                              | Acesso        | O que faz                                                    |
| ------ | ------------------------------------ | ------------- | ------------------------------------------------------------ |
| GET    | `/eventos?inicio=&fim=`              | Autenticado   | Lista eventos no range (default: mês atual)                  |
| GET    | `/eventos/:id`                       | Autenticado   | Detalhes do evento                                           |
| POST   | `/eventos`                           | Admin         | Cria evento                                                  |
| PUT    | `/eventos/:id`                       | Admin         | Edita evento                                                 |
| DELETE | `/eventos/:id`                       | Admin         | Exclui evento                                                |

## 7. O que o usuário vê

`/governanca` é um hub com 4 abas (NavLink + `<Outlet />`):

### `/governanca/atas` (default)

- Filtros por status: Todas / Em aprovação / Aprovadas / Rejeitadas / Arquivadas
- Lista de cards expansíveis. Cabeçalho mostra título, data da reunião,
  status (com cor), arquivo (nome + tamanho), contadores de votos
- Expandido revela descrição, painel de votação (se em aprovação) e
  lista de votos com barra de proporção e comentários
- Admin tem botões: Nova ata (com upload de arquivo), Arquivar (não-rascunho não-vigente), Excluir (só rascunho)
- Ata "unanimidade" mostra badge roxo

### `/governanca/decisoes`

- Igual à página de Atas, mas sem upload — texto formal direto
- Filtros: Em aprovação / Aprovadas / Rejeitadas / Canceladas
- Decisão pode ter prazo de aprovação (alerta âmbar)
- Admin pode cancelar decisão `em_aprovacao` com motivo
- Tipo é texto livre (admin escolhe — "distribuicao", "mudanca_capital", etc.)

### `/governanca/contrato`

- Card grande em destaque no topo: contrato vigente (versão, data, baixar)
- Histórico embaixo: todas as versões (aprovado, em aprovação, rejeitado, arquivado)
- Admin tem ação "Tornar vigente" em contratos aprovados não-vigentes
- Modal de nova versão sugere `versao` automática (último + 1) e
  default de quorum = unanimidade (recomendação)

### `/governanca/calendario`

- Grid mensal 7×6 (dom-sáb), com hoje destacado em círculo nexus
- Setas pra navegar entre meses + botão "Hoje"
- Cores por tipo: sky (reunião), red (vencimento legal), amber
  (pagamento importante), slate (outro)
- Admin pode clicar em qualquer dia → abre modal de criar com data
  pré-preenchida (09:00). Modal tem checkbox "dia inteiro", local,
  link, descrição, observação interna
- Click em evento existente → modal de editar (admin) ou só
  visualizar (sócio comum)
- Legenda no rodapé

### Cabeçalho compartilhado

Hub mostra título "Governança" e parágrafo explicativo, mais a barra
de abas com ícone (ScrollText, Vote, FileText, Calendar). Tudo dentro
de `<Layout>` normal (mantém menu lateral, contexto atual, etc.).

## 8. Como rodar

```bash
cd backend
npm install               # instala multer (novo na Sprint 6)
npm run migrate           # aplica a 006_governanca.sql
npm run dev
```

`UPLOADS_DIR` em desenvolvimento pode ser apenas `uploads` (relativo
ao backend). Em produção Railway, configurar Volume e apontar pro
caminho do volume.

Frontend recarrega sozinho com Vite, sem novos pacotes.

## 9. Roteiro de testes (aceite da sprint)

### Atas

- [ ] Admin cria ata sem arquivo → status = `rascunho`, sem painel de votação
- [ ] Admin sobe arquivo na ata rascunho → status vira `em_aprovacao`
- [ ] Admin cria ata já com arquivo + `requer_aprovacao=false` → status = `aprovado` direto
- [ ] Admin cria ata já com arquivo + `requer_aprovacao=true` → status = `em_aprovacao`
- [ ] Sócio com `pode_aprovar_atas` vota "Aprovo" → contagem incrementa, painel mostra "atual"
- [ ] Sócio sem `pode_aprovar_atas` vê painel desabilitado com mensagem explicativa
- [ ] Sem contexto de sócio escolhido, painel mostra "Escolha um contexto"
- [ ] Re-votar substitui o voto anterior na mesma linha (não duplica)
- [ ] Maioria simples com 4 sócios precisa de 3 aprovações → vira `aprovado`
- [ ] Unanimidade com 4 sócios + 1 rejeição → vira `rejeitado` imediatamente
- [ ] Atingido quorum, painel de votação some
- [ ] Baixar arquivo abre PDF inline no navegador
- [ ] Admin arquiva ata aprovada → some das listas (vai pra "Arquivadas")
- [ ] Admin tenta arquivar ata vigente (caso contrato_social) → erro 400
- [ ] Admin exclui rascunho → some + arquivo deletado do disco
- [ ] Admin tenta excluir ata aprovada → erro 400 ("arquive")
- [ ] Tentar editar ata com voto registrado → erro 400

### Decisões

- [ ] Admin cria decisão sem arquivo → status = `em_aprovacao` direto
- [ ] Sócio com `pode_votar` vota → contagem atualiza
- [ ] Sócio sem `pode_votar` vê painel desabilitado
- [ ] Cancelar exige motivo de no mínimo 3 chars
- [ ] Decisão cancelada exibe motivo em destaque
- [ ] Decisão com prazo mostra alerta âmbar com data

### Contrato Social

- [ ] Admin sobe versão 1 → fica `em_aprovacao`
- [ ] Sócios aprovam por unanimidade → status `aprovado`
- [ ] Admin clica "Tornar vigente" → vira destaque no topo
- [ ] Admin sobe versão 2 → fluxo se repete
- [ ] Após v2 virar vigente, v1 perde a flag (UNIQUE parcial respeitada)
- [ ] Histórico mostra v1 sem flag vigente
- [ ] Não há contrato vigente → card amarelo "Nenhum contrato vigente"

### Calendário

- [ ] Mês corrente abre por padrão
- [ ] Setas navegam pra mês anterior/próximo (cruzando virada de ano)
- [ ] "Hoje" volta pro mês corrente
- [ ] Click em dia vazio (admin) → modal "Novo evento" com data preenchida
- [ ] Click em dia vazio (sócio comum) → não abre nada
- [ ] Click em evento existente (admin) → modal de editar
- [ ] Click em evento existente (sócio) → modal só de leitura
- [ ] Dia inteiro alterna entre `date` e `datetime-local`
- [ ] 4 cores por tipo aparecem corretamente
- [ ] Mais de 3 eventos em um dia → "+N mais"
- [ ] Admin exclui evento → some imediatamente

### Permissões e segurança

- [ ] Sócio comum não vê botões de admin
- [ ] Backend retorna 403 nas escritas para não-admin
- [ ] Voto sem contexto retorna 400 com `sem_contexto`
- [ ] Voto sem poder retorna 403 com `sem_poder`
- [ ] Upload com MIME inválido (ex: .exe) é rejeitado
- [ ] Upload acima de `UPLOADS_MAX_MB` é rejeitado
- [ ] Tentar baixar arquivo de outro doc com path-traversal não funciona

### Storage

- [ ] Em dev, arquivos aparecem em `backend/uploads/governanca/` com nome hex
- [ ] Apagar registro também apaga arquivo
- [ ] Apagar arquivo manualmente do disco e tentar baixar → 410 `arquivo_perdido`

## 10. Bugs conhecidos corrigidos durante a sprint

Durante a auditoria final, encontramos e corrigimos dois bugs no
frontend que afetavam diretamente a UX:

1. **Poderes lidos do lugar errado** — `Atas.jsx`, `Decisoes.jsx` e
   `ContratoSocial.jsx` liam `representacaoAtual.pode_aprovar_atas` e
   `representacaoAtual.pode_votar` direto. Mas o backend serializa
   poderes aninhados em `representacaoAtual.poderes.aprovar_atas` (sem
   o prefixo `pode_`). Resultado: sócios não-admin nunca conseguiam
   votar pela UI mesmo tendo o poder. Corrigido usando a função
   `temPoder()` exposta pelo `AuthContext`, que já encapsula a regra
   de admin bypassa.
2. **Voto atual não destacado** — `Atas.jsx` calculava `votoAtual` por
   `detalhes._pessoaId`, propriedade que nunca era populada. Corrigido
   para comparar `aprovacao.socio_id === representacaoAtual.socio_id`.
   `Decisoes.jsx` e `ContratoSocial.jsx` ganharam a mesma lógica
   (antes não tinham).

## 11. Próxima sprint

**Sprint 7 — Polimento.**

- E-mails automáticos: nova ata pra aprovar, voto pendente passou do
  prazo, distribuição efetivada, decisão aprovada
- Relatórios em PDF gerados no servidor (puppeteer ou pdfkit) —
  substitui o `window.print()` em alguns casos
- Mobile: melhorar tabelas largas, sidebar offcanvas, calendário
  responsivo
- Recorrência de eventos no calendário (semanal, mensal)
- Drag & drop de eventos pra mover de dia
- Upload de comprovante real nos movimentos de sócios (campo já
  existe no banco desde a Sprint 5)
- Treinamento dos sócios + onboarding em vídeo curto
