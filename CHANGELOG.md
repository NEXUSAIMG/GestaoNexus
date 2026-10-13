# Changelog — Gestão Nexus

Histórico de mudanças por sprint. Sprints 1-17 estão documentadas
individualmente em `docs/sprint-*.md`. A partir da Sprint 18 (multi-resp em
cards), o ritmo virou diário e consolidamos aqui pra evitar fragmentação.

> Convenção: cada sprint lista (1) o que entregou, (2) arquivos novos ou
> modificados relevantes, (3) como testar rapidamente.
> Migrations rodam com `npm run migrate` (no diretório `backend`).
> Tudo é idempotente — rodar de novo é seguro.

---

## Sprint 42J — E-mail primeiro e Ayio nos textos (versão 1.17)

- **Cadência começa pelo e-mail de apresentação** (dia 1). A ligação e o
  WhatsApp passam para o dia 2 e citam o e-mail. Os outros dias continuam
  iguais (4, 6, 8, 10, 11 e 12).
- **Textos falam da Ayio**: quem se apresenta é "da Ayio, a empresa que
  desenvolve o Seu Cartório". Mudaram os roteiros de e-mail, ligação,
  WhatsApp, retornos, retomada e onboarding, além do tour e do guia.
- **Roteiros novos**: um por dia da cadência (e-mail do dia 1, ligação do
  dia 2, ligação do dia 4, vídeo do dia 6, depoimento do dia 10, webinar do
  dia 11). "O que falar agora" passa a seguir o dia certo, o retorno da
  proposta (1/4 a 4/4) e a Corregedoria.
- **Registrar o toque de e-mail** mostra o texto já preenchido com o
  cartório e o vendedor, com os botões "Abrir no meu e-mail" (mailto, sai
  do e-mail da própria pessoa) e "Copiar texto". Nada é enviado pelo
  servidor.

---

## Sprint 42I — Marketing no Comercial (versão 1.16)

Aba **Marketing** no Comercial: o calendário das ações de marketing e o
resultado de cada uma no funil.

- **Ações** (`comercial_mkt_acoes`). Cada ação tem título, canal (LinkedIn,
  Instagram, congresso, webinar...), data, status, responsável (pessoa do
  Nexus ou texto, como "Sócio"), custo, horas, notas e o que aconteceu.
  - Quem é do Comercial cria e atualiza as ações.
  - Remover a ação: a gestão ou quem a criou.
- **Ligação com o funil pela campanha**:
  - toda ação tem uma campanha única, que é gerada do título se ficar em
    branco;
  - o cartório cadastrado com aquela campanha conta para a ação:
    cartórios, reuniões, propostas, clientes pagos, receita, custo por
    cartório;
  - no cadastro do cartório, o campo Campanha lista as ações e sugere a
    origem pelo canal;
  - campanhas digitadas que não batem com nenhuma ação aparecem num aviso.
- **Tela**:
  - calendário do mês, com as ações coloridas por status e as atrasadas em
    vermelho;
  - lista "Para fazer" com as atrasadas e os próximos 7 dias, e os botões
    Feita e Adiar;
  - KPIs do mês;
  - resultado por ação;
  - de onde vêm os cartórios (origem, últimos 90 dias);
  - datas importantes (`comercial_mkt_datas`), em amarelo no calendário.
- **Plano out–dez** (47 ações e 4 datas da Agenda de Marketing): a gestão
  lança com um botão (`POST /comercial/marketing/lote`). Rodar de novo não
  duplica.
- **Ajuda**: "como funciona" da aba, glossário da campanha e 2 perguntas no
  FAQ.

Arquivos: migration `039_comercial_marketing.sql`,
`controllers/comercial.marketing.controller.js`, `CANAIS_MKT` em
`comercial.regras.js`, `components/comercial/Marketing.jsx` e
`planoMarketing.js`, `LeadDrawer.jsx` (campanha), `pages/Comercial.jsx`.
Testes: `t-comercial-marketing.mjs` (14 checagens).

---

## Sprint 42H — Tudo explicado na tela (versão 1.15)

A equipe precisa entender cada tela sem treinamento. O foco é o quadro
"Atividade Comercial", onde a explicação ainda faltava:

- **Destacar os meus** (todos os quadros): os cards da pessoa ficam em
  evidência e os dos outros, apagados (nada some). Cada coluna mostra quantos
  são seus, e a escolha fica guardada por pessoa.
- **Faixa "Este quadro anda junto com o Comercial"**, que pode ser recolhida:
  como avançar, o que é a seta do card, o (?) das colunas e onde registrar o
  contato.
- **O que é cada coluna**: um chip embaixo do nome com (?) que mostra a etapa
  no Comercial, o objetivo, quando avança e o prazo, o marco da implantação
  ou que a coluna "fica só no quadro". O backend devolve
  `quadro.espelho_comercial.colunas`.
- **Próximo passo no card**: aparece a linha com a seta e a data, em vermelho
  quando está atrasado e em laranja quando é hoje. Em Em contatos, o card
  lembra de seguir a cadência. O selo de etapa só aparece quando a coluna
  não diz a mesma coisa.
- **Card aberto**: a caixa "Ligado ao Comercial" traz o objetivo da etapa e o
  próximo passo, e avisa quando ainda não há próximo passo combinado.
- **Dicas** (title) nos filtros, nas vistas e nos botões do quadro.
- **Comercial**:
  - o tour tem dois passos novos (insistência e quadro em espelho) e aparece
    de novo uma vez para todos;
  - "Como funciona" de Hoje e a etapa Aguardando retorno citam os 4 retornos;
  - duas perguntas novas no FAQ.

Arquivos: `components/quadro/comercialQuadro.jsx` (novo), `Card.jsx`,
`Coluna.jsx`, `FiltroBar.jsx`, `ModalCard.jsx`, `pages/Quadro.jsx`,
`comercial/guia.js`, `comercial/Ajuda.jsx`, `quadros.controller.js`,
`cards.controller.js`. Testes: 2 checagens novas em `t-comercial-espelho.mjs`.

---

## Sprint 42G — Insistência com método (versão 1.14)

O ponto fraco apontado pela gestão é a insistência com os clientes. Em vez
de depender de coragem, a insistência vira processo:

- **Roteiro de retorno da proposta** (`RETORNO`): dia 2 WhatsApp com um caso,
  dia 4 ligação, dia 6 o titular, dia 7 encerramento educado. Aparece em Hoje
  ("Retornos de proposta") e na ficha; registrar o proposta já marca o 1º
  retorno, e registrar cada contato marca o próximo sozinho.
- **Portão de "Sumiu"** (`pendenciasPerda`): só depois da cadência completa
  (Em contatos), do roteiro de retorno completo (Aguardando retorno) ou de 3
  tentativas (Reunião/Corregedoria). Motivos que são resposta do cartório
  (preço, sem interesse...) não têm trava. Gestão pode forçar com justificativa.
- **Retomada em 90 dias**: perdido por "Sumiu" ou "Sem tempo para implantar"
  já sai com o retorno marcado; no dia, aparece em Hoje ("Voltam a ser
  contatados hoje") com o botão "Voltar a contatar".
- **Supervisão**: alerta de retorno de proposta atrasado e a linha
  "Insistência no mês" (perdidos e média de contatos antes de perder).
- Scripts novos (combinar a data da decisão, retornos 1 a 4, corregedoria,
  retomada), glossário e FAQ.

**Arquivos:** `comercial.regras.js`, `comercial.dados.js`, `comercial.controller.js`,
`Vistas.jsx`, `Orientacao.jsx`, `scripts.js`, `guia.js`, `Ajuda.jsx`.
Sem migração.

**Testar:** `node testes/t-comercial-insistencia.mjs` (13 verificações).

---

## 1.13 — Importação do quadro não quebra com campo longo

Produção: importar o quadro "Atividade Comercial" dava "Erro interno do
servidor" (log: `value too long for type character varying(60)`) — um card
tinha no campo Telefone/WhatsApp mais de 60 caracteres (vários números e
observações).

- `ajustarTamanhos()` em `comercial.dados.js`: todo lead novo (cadastro,
  listas, quadro, espelho) corta o que não cabe e guarda o texto inteiro nas
  anotações ("Telefone completo: ...").
- Importar quadro: cada card numa savepoint — card com problema é recusado
  sozinho e listado na mensagem final, sem derrubar a importação.
- Espelho: card → lead também corta; lead → card não encurta o campo do card.
- Teste: `t-comercial-espelho.mjs` com telefone longo (28 verificações).

---

## Sprint 42F — Quadro e Comercial em espelho (versão 1.12)

O quadro "Atividade Comercial" e o módulo Comercial passam a andar juntos,
nos dois sentidos. A equipe pode continuar no quadro que conhece; a gestão
continua com os controles do Comercial.

**Quadro → Comercial**
- Mover o card muda a etapa do lead, na mesma transação. Se o Comercial não
  deixa (portão pendente, voltar etapa, desfazer venda), o movimento é
  recusado com 409 e o quadro mostra o que falta + "Abrir no Comercial".
- Colunas da implantação viram marcos: entrar em "Em Desenvolvimento" marca
  onboarding e treinamento como feitos; "Pós venda" marca até a checagem D15.
- Perdido pela coluna recebe o motivo pelo nome (Fora do funil, Desistência).
- Card novo numa coluna do funil vira lead (respeitando a etiqueta de venda,
  em quadro misto). Card criado em Ganho/Perdido não vira lead (comentário no
  card explica). Card criado além de "Reunião de apresentação" entra nela.
- Título, responsável e campos Telefone/WhatsApp, Representante/Oficial,
  E-mail e Cidade/UF vão para o lead (com histórico "pelo quadro").

**Comercial → quadro**
- Toda escrita no Comercial é espelhada antes da resposta: etapa mudou → o
  card vai para a coluna da etapa; marco feito → o card anda na implantação
  (só para a frente); perdido → coluna do motivo.
- Lead cadastrado no Comercial ganha card (opção "Lead novo ganha card").
- Nome, responsável e contatos do lead vão para o card.

**Telas**
- Selo "Comercial · etapa" no card; faixa "Ligado ao Comercial" no card aberto.
- Ficha do lead mostra a coluna atual no quadro e "Ver o card".
- Importar quadro: "Manter o quadro e o Comercial em espelho" (liga e grava o
  mapa coluna → etapa; rodar de novo ajusta o mapa).
- Controles: painel "Quadro e Comercial em espelho" (mapa, liga/desliga).

**Arquivos:** `038_comercial_espelho_quadro.sql`, `services/comercial.espelho.js`
(novo), `cards.controller.js`, `projetos.controller.js`, `quadros.controller.js`,
`comercial.controller.js`, `comercial.dados.js` (inserirLead foi para cá),
`Quadro.jsx`, `ModalComercial.jsx` (novo), `Card.jsx`, `ModalCard.jsx`,
`LeadDrawer.jsx`, `Importar.jsx`, `Vistas.jsx`, `Comercial.jsx`, `guia.js`.

**Testar:** `node testes/t-comercial-espelho.mjs` (26 verificações).

---

## Sprint 42E — Comercial sem trial, com os nomes do quadro da equipe

Decisão da empresa: não há trial. A prova é a reunião de apresentação (com
demonstração no WhatsApp do cartório) e a implantação assistida depois da
assinatura. As etapas usam os mesmos nomes do quadro "Atividade Comercial".

- Funil: Em prospecção → Em contatos → Reunião de apresentação → Aguardando
  retorno → Aguardando a Corregedoria (interino) → Ganho | Perdido.
- Portão de "Aguardando retorno": reunião realizada + diagnóstico + proposta.
- Ganho começa a **implantação** (`implantacao_inicio`), com marcos: enviar
  onboarding (D0), reunião de treinamento e ativação (D2), em desenvolvimento:
  bot no ar (D7), checagem de uso (D15), pós-venda (D30). Aba Trials virou
  Implantação; pontos de uso valem na implantação.
- Motivos de perda novos: "Fora do funil (sem interesse)" e "Desistência
  (usou e desistiu)", aplicados pelo nome da coluna na importação.
- Importar do quadro: "Em prospecção" entra **sem responsável, na fila**;
  palpites de etapa pelos nomes das colunas da equipe.
- Metas: taxas renomeadas (contato → reunião → proposta → pago); chaves
  antigas mantidas para não perder metas salvas.
- Migração `037_comercial_sem_trial.sql`: etapa `corregedoria`, coluna
  `implantacao_inicio`; leads em `trial`/`qualificado` são remapeados.

**Testar**: `npm run migrate` e `cd testes && npm run api` (193 checagens).

---

## Sprint 42D — Comercial: varredura antes de ir ao ar

Revisão completa do módulo (backend e telas) com correção de tudo que
furava o controle ou travaria a equipe no primeiro dia.

**Controle**
- Gestão comercial agora é uma lista explícita definida pelo admin
  (Comercial → Controles → Gestão comercial), tabela `comercial_gestores`.
  Antes valia "líder de equipe com 'comercial' no nome", e qualquer líder
  podia renomear a equipe e virar gestor.
- Reabrir Perdido também cobra os portões (só a etapa já alcançada antes
  fica dispensada); Ganho → Perdido exige justificativa; não se cadastra
  direto como Perdido/Ganho.
- Reunião com data no passado (registro retroativo) só pela gestão.
- Responsável: quem não é gestão só pega lead sem dono ou repassa o
  próprio. Origem só muda pela gestão (ou por quem cadastrou, em 24h).
- Mês grátis de ex-cliente confere se o CNPJ/e-mail está cancelado no
  portfólio; sem isso, só a gestão concede. Origem "ex-cliente" não fura
  mais o bloqueio de cliente ativo.
- ASAAS: só conta pagamento de até 7 dias antes do ganho; estorno ou
  chargeback desfaz o "pago" (com registro no histórico); roda no máximo
  a cada 10 min.
- 1:1 e checagens: quem não é gestão vê só os próprios; a observação da
  checagem de outra pessoa não aparece no painel.

**Para a equipe não travar**
- Fila: prospect sem responsável (lista importada) não conta como
  "parado"; em Hoje, "Pegar para mim" entrega um lote, os mais antigos
  primeiro, e o prazo começa aí. Quem registra contato ou move um lead sem
  dono vira o responsável.
- Ficha salva só os campos alterados (um CNPJ importado errado não trava
  mais a troca de etapa), fica aberta depois de salvar, avisa antes de
  descartar o que não foi salvo e não perde o rascunho quando um toque
  recarrega a ficha. Contato avulso pode ser estornado pelo histórico.
- Importação: linha inválida (CNS, CNPJ, UF, e-mail) ou repetida dentro da
  própria planilha é recusada sozinha; a tela mostra todas as recusas com
  a linha e baixa um CSV para corrigir. Checagem em lote (4 consultas para
  a planilha inteira) em vez de 3 por linha.
- Duplicidade nome+cidade+UF ignora acento e maiúscula dos dois lados
  (função `comercial_chave` com índice, igual no JS e no SQL).
- Toque repetido do roteiro (clique duplo) não repete efeitos; o toque,
  a reunião e a mudança para Diagnóstico ficam numa transação só.
- Painel carrega só o que está em andamento e calcula os totais no banco;
  Funil mostra a contagem real por etapa.
- Correções: aba Ajuda presa em "Carregando…", rótulo com dica roubando o
  clique, Esc nos modais, desfecho de reunião futura, metas com campo vazio,
  confirmação ao remover da lista de não contatar.

**Arquivos**: `036_comercial_ajustes.sql`, `comercial.dados.js`,
`comercial.regras.js`, `comercial.controller.js`,
`comercial-gestao.controller.js`, `comercial.routes.js`, telas em
`components/comercial/*` e `pages/Comercial.jsx`.

**Testar**: `npm run migrate` e `cd testes && npm run api` (189 checagens;
a seção "Varredura 42D" cobre cada furo acima).

---

## Sprint 42B — Comercial: controle minucioso

Resultado obrigatório em todo contato, reuniões com desfecho, portões de
etapa, propostas com política de desconto travada, assinado × pago (ASAAS
confere pelo CNPJ), duplicidade por CNS/CNPJ/e-mail/telefone, lista de não
contatar, estorno no lugar de apagar, histórico campo a campo, checagens
diárias, 1:1 com plano de ação, placar por pessoa, metas individuais e
feriados. Migration `035_comercial_controle.sql`. Detalhes em
`docs/sprint-42-comercial.md`. Testes: `node testes/t-comercial.mjs` (67).

---

## Sprint 42 — Módulo Comercial (funil de vendas do Seu Cartório)

Menu **Comercial** com Hoje, Funil, Trials, Supervisão, Metas e Scripts —
a metodologia de venda SaaS (cadência de 12 dias, trial guiado de 14 dias,
semáforo diário por pessoa). Origem obrigatória, perdido exige motivo,
ganho exige valor. Importa os cards do quadro "Atividade Comercial" sem
alterá-lo. Detalhes em `docs/sprint-42-comercial.md`.

**Arquivos:** migration `034_comercial.sql`; `services/comercial.regras.js`;
`controllers/comercial.controller.js`; `routes/comercial.routes.js`;
`pages/Comercial.jsx`; `components/comercial/*`; `testes/t-comercial.mjs`.

**Testar:** `node testes/t-comercial.mjs` (43 verificações).

---

## Sprint 31 — Acesso restrito por pessoa

Feature de controle granular: permite marcar pessoas como **"acesso restrito"**
que só vêem 4 módulos operacionais (Tarefas, Processos, Em andamento e
Cartórios). Todo o resto (Caixa, Contas a Pagar, Governança, Sócios &
Lucros, Cadastros, Configurações) fica invisível no menu e retorna 403 se
acessado via URL direta.

**Caso de uso:** atendentes / assistentes operacionais que precisam tocar
tarefas e cartórios mas não deveriam ver financeiro / governança societária.

**Defesa em 3 camadas:**
1. **Backend:** middleware `exigirAcessoCompleto` aplicado nas rotas
   bloqueadas. Retorna 403. Segurança real.
2. **Frontend menu:** Sidebar filtra os itens, mostrando só os 4 liberados.
3. **Frontend rotas:** wrapper `AcessoCompletoRoute` redireciona pra
   `/tarefas` se pessoa restrita tentar acessar URL bloqueada.

**Admin sempre passa**, independente da flag — marcar admin como restrito
seria contraditório. Pra restringir um admin, primeiro desmarque admin.

### Backend (5 arquivos)

- **Migration 023**: `pessoas_acesso.acesso_restrito BOOLEAN DEFAULT FALSE`
- `backend/src/middleware/auth.middleware.js`:
  - SELECT inclui `acesso_restrito`
  - Novo middleware `exigirAcessoCompleto(req, res, next)`
- `backend/src/controllers/auth.controller.js`: SELECT do login + retorno
  do `/auth/eu` incluem `acesso_restrito`
- `backend/src/controllers/pessoas.controller.js`: schema Zod (criar e
  atualizar) + serializer + INSERT com campo novo
- `backend/src/routes/index.js`: **reescrito** — separa rotas
  liberadas (pessoas, tarefas, processos, instancias, cartorios,
  notificacoes) das bloqueadas (resto), aplicando
  `[autenticar, exigirAcessoCompleto]` antes das bloqueadas

### Frontend (4 arquivos)

- `frontend/src/components/AcessoCompletoRoute.jsx` (NOVO): redireciona
  pessoa restrita pra `/tarefas` em rotas bloqueadas
- `frontend/src/components/Sidebar.jsx`: itens com flag
  `liberadoRestrito: true` aparecem mesmo pra restritos; cadastros
  inteiros somem
- `frontend/src/App.jsx`: reescrito, envolve rotas bloqueadas com
  helper local `<Bloqueado>` (que aplica `AcessoCompletoRoute`).
  Liberadas (tarefas/processos/instancias/cartorios) ficam sem o wrapper.
- `frontend/src/pages/Pessoas.jsx`:
  - Modal de criar/editar: checkbox amber **"Acesso restrito"** com
    descrição do que muda (só visível se a pessoa não for admin)
  - Marcar admin desliga automaticamente acesso restrito
  - Tabela de listagem: badge amber com cadeado pra pessoas restritas

### Scripts CLI (2 arquivos + 1 atualização)

- `backend/db/scripts/definir-acesso-restrito.js` (NOVO): marca/desmarca
  a flag interativamente. Recusa rodar em admins. Mostra preview com
  estado antes/depois e pede confirmação.
- `backend/db/scripts/listar-pessoas.js`: coluna nova **"Restr"** com
  cadeado pra restritos + resumo conta quantas são
- `backend/package.json`: novo comando `acesso-restrito`

### Como usar

```bash
cd backend
npm run migrate                                              # aplica 023
npm run pessoas nestor                                       # confere e-mail
npm run acesso-restrito -- nestor@email.com.br --restringir  # restringe

# Pra desfazer depois:
npm run acesso-restrito -- nestor@email.com.br --liberar
```

Ou via UI: login admin → Cadastros → Pessoas de acesso → editar pessoa →
checkbox **"Acesso restrito"**.

### Decisões

- **/pessoas continua liberada pra leitura** porque é necessária pra
  autocomplete de responsáveis em cards e cartórios. Escrita já era admin.
- **/notificacoes continua liberada** — sininho funciona pra todos os
  autenticados (só mostra notificações relevantes à pessoa).
- **Comando manual no CLI** garante que vai funcionar mesmo se a UI
  estiver indisponível. Útil pra resetar acesso em emergência.

---

## Sprint 30 — Debounce isolado + gate de versão total

Duas frentes em paralelo:

### Parte A — Debounce isolado em 3 listagens

Replica o padrão da Sprint 29 (debounce isolado + gate de versão) em 3
listagens que tinham `setTimeout(carregar, 250)` aplicado a TODOS os
filtros — isso atrasava selects sem necessidade.

**Páginas refatoradas:**
- `frontend/src/pages/Contratos.jsx`
- `frontend/src/pages/Cartorios.jsx`
- `frontend/src/pages/DocumentosEmpresa.jsx`

**Padrão final:** 2 useEffects separados — um pra debounce isolado do
campo busca (350ms), outro pro trigger principal que reage a
`buscaDebounced` + selects (imediato). **Aplicado em 5 listagens:**
`Instancias.jsx`, `Cartorios.jsx`, `Contratos.jsx`, `DocumentosEmpresa.jsx`,
`Inventario.jsx` (este último migrou de 400ms acoplado pra 350ms isolado).

### Parte B — Gate de versão em todas as páginas restantes

Defesa em profundidade: aplica gate de versão (`useRef` contador) em
todas as páginas que ainda usavam o padrão de `carregar()` direto. Resolve
race condition em cenários de operações rápidas em sequência (criar +
excluir + refresh, ou mudar ano + efetivar movimento).

**Páginas blindadas (7):**
- `Equipes.jsx`, `Pessoas.jsx`, `Socios.jsx` — 1 `carregar()` simples cada
- `Tarefas.jsx` — Promise.all com quadros + equipes
- `Lucros.jsx` — `carregarTudo()` com 6 requests em Promise.all, depende de `ano`
- `Inventario.jsx` — 1 `carregar()` com filtros + debounce de busca pré-existente
- `Caixa.jsx` — caso especial com **3 funções separadas** (`carregarResumo`,
  `carregarFluxo`, `carregarLista`) e portanto **3 refs distintos**
  (`carregaResumoIdRef`, `carregaFluxoIdRef`, `carregaListaIdRef`).
  Cobre race entre `sincronizarAgora()` (dispara as 3 em paralelo) e mudança
  de filtro disparando `carregarLista()`.

**Cobertura total agora:** TODAS as páginas do app que fazem busca por
dados ou tem refresh após operações têm gate ativo.

**Páginas com busca livre — status final:**

| Página | Estratégia |
|---|---|
| `Instancias.jsx`, `Cartorios.jsx`, `Contratos.jsx`, `DocumentosEmpresa.jsx`, `Inventario.jsx` | Debounce isolado 350ms + gate |
| `ContasPagar.jsx` | Padrão `busca/buscaAtiva` separados (submit manual) + gate (Sprint 28) |
| `Caixa.jsx` | Padrão `busca/buscaAtiva` separados + 3 gates distintos |
| `Quadro.jsx` | Filtros por select, sem busca livre + gate (Sprint 25) |

**Como testar:** digite uma palavra inteira no campo busca de qualquer
listagem refatorada — antes disparava N requests; agora dispara 1 só
(350ms após parar). Mude um select: dispara imediato. Crie/exclua/edite
vários itens em sequência rápida — o estado final é sempre o mais recente.

---

## Sprint 29 — Documentação atualizada + debounce em Instancias

Documentação posta em dia e refactor pequeno de UX.

**Documentação:**
- `CHANGELOG.md` novo na raiz consolidando Sprints 18-28 (~270 linhas)
- `README.md` atualizado: status v1.2, lista de features expandida,
  estrutura de pastas, tabela de docs estendida com sprints 11-17.1 +
  linha consolidada "18-28 → CHANGELOG.md"
- Decisão: NÃO criar 11 docs separados em `docs/sprint-XX.md`. CHANGELOG
  consolidado é mais fácil de buscar (Ctrl+F) e manter. Os 18 docs
  antigos ficam preservados pra história

**Refactor (`Instancias.jsx`):**
- Debounce de 200ms genérico (aplicado a TODOS os filtros) substituído
  por padrão isolado: 350ms só pro campo busca; selects disparam imediato
- Antes: digitar "contrato social" = 16 requests; agora = 1
- Antes: trocar um select tinha 200ms de atraso desnecessário; agora
  é instantâneo

---

## Sprint 28 — Defesa em profundidade: gate de versão (frontend)

Padroniza o gate de versão (`useRef` contador) em todas as páginas que
fazem múltiplas chamadas paralelas a `carregar()`. Resolve a classe inteira
de bugs "voltou ao estado antigo" onde o response de um request mais
ANTIGO chega depois e sobrescreve o estado mais recente.

**Páginas blindadas:**
- `frontend/src/pages/Cartorio.jsx` — race entre salvar modal e
  desvincular quadro em sequência
- `frontend/src/pages/Instancias.jsx` — race quando usuário digita rápido
  no campo busca (não tem debounce)
- `frontend/src/pages/ContasPagar.jsx` — race entre salvar conta e mudança
  de filtro

**Como testar:** abrir cada página, fazer 3 ações que disparam carregar()
em sequência muito rápida (< 200ms entre elas). O estado final é sempre o
mais recente, nunca o intermediário.

---

## Sprint 27 — UI de configurações de notificações

Página `/configuracoes` (admin-only) que controla cada toggle de e-mail
sem precisar mexer no banco. A página já existia desde a Sprint 7;
adicionado só o toggle novo da Sprint 26.

**Arquivos:**
- `backend/src/controllers/configuracoes-notificacoes.controller.js`:
  campo `email_contrato_vencendo` no schema Zod + serializer
- `frontend/src/pages/Configuracoes.jsx`: toggle novo abaixo dos
  outros e-mails

**Como testar:** login admin → sidebar → Cadastros → Notificações.
Toggle desligado = só notificação in-app, sem e-mail.

---

## Sprint 26 — Cron de aviso de vencimento de contratos

Fecha o módulo de Contratos com disparo automático. Antes, o cálculo de
"vencendo" / "vencido" era feito sob demanda no GET; agora um cron
diário às 8h notifica admins por in-app + e-mail.

**Backend:**
- Migration **022**: `contratos.ultimo_alerta_em` (idempotência) +
  `configuracoes_notificacoes.email_contrato_vencendo` + índice parcial
- `backend/src/services/email-templates.js`: template `tplContratoVencendo`
  com 2 seções (vencidos em vermelho, vencendo em amarelo)
- `backend/src/services/notificacoes.service.js`:
  `enviarAvisosContratosVencendo()` — query idempotente, re-alerta a cada
  7 dias enquanto contrato continuar na janela
- `backend/src/services/scheduler.js`: chamada integrada ao
  `iniciarAgendadorNotificacoes()` (mesma janela das 8h)
- `backend/src/controllers/contratos.controller.js`: endpoint manual
  `POST /api/contratos/disparar-alertas` (admin) pra teste imediato
- Rota registrada **antes** de `/:id` pra não ser interpretada como UUID

**Frontend:**
- `frontend/src/pages/Contratos.jsx`: botão **"Disparar alertas"** no
  header (admin-only), ao lado de "Novo contrato"

**Como testar:** cadastra contrato com data_fim daqui a 5 dias → clica
"Disparar alertas" → admins recebem notificação e e-mail. Clica de
novo: "Nenhum contrato precisa de aviso agora" (idempotência).

---

## Sprint 25 — Bug "card volta ao estado antigo" (gate de versão)

Resolve o bug histórico do item 11 da spec. A causa era **race condition
no frontend** entre múltiplas chamadas paralelas de `carregar()`:
drag dispara um, save de modal dispara outro — o response mais antigo
chegava depois e sobrescrevia o estado.

**Correção:** gate de versão via `useRef` contador. Cada `carregar()`
captura um ID único; só atualiza o state se o ID atual = o ID do response.

**Arquivos:**
- `frontend/src/pages/Quadro.jsx`: ref `carregaIdRef`, gate no
  `carregar()`, defesa em profundidade em `setErro`/`setCarregando` do
  `catch`/`finally`
- Log diagnóstico `[DIAG-card] ⚠ carregar() #X descartado` quando
  descarta response

**Cleanup futuro:** remover logs `[DIAG-card]` quando confirmado.

**Como testar:** mover card no kanban + imediatamente abrir o card +
editar prazo + salvar. Estado salvo permanece, não "volta".

---

## Sprint 24 — Cartórios em fases do kanban (item 1.5 da spec)

Mostra cartórios vinculados a um quadro agrupados na coluna onde estão
posicionados. Backend já suportava desde Sprint 20A; faltava a UI.

**Backend:**
- `backend/src/controllers/cartorios.controller.js`: função
  `listarPorQuadro` (SELECT em `cartorios_quadros JOIN cartorios`)
- `backend/src/routes/quadros.routes.js`: rota
  `GET /api/quadros/:id/cartorios`

**Frontend (`Quadro.jsx`):**
- State `cartoriosDoQuadro` + função `carregarCartorios()` (falha
  silenciosa se módulo de cartórios não disponível)
- Faixa amber no topo de cada coluna (`border-amber-200 / bg-amber-50/60`)
  com chips clicáveis (ícone `Building2` + nome truncado a 140px)
- Click no chip → `/cartorios/:id`

**Decisão de design:** cartórios sem `coluna_id` ficam invisíveis no
kanban — visíveis apenas na listagem `/cartorios` e na página de
detalhe. Pode evoluir pra uma barra "Sem fase" no topo se virar dor.

**Como testar:** cadastra cartório → abre detalhe → "Vincular a quadro"
→ escolhe quadro e coluna → entra no quadro: chip aparece na faixa
amber da coluna escolhida.

---

## Sprint 23 — Item 7 da spec (Contas a pagar — múltiplos sub-itens)

**Já estava 100% implementado** em sprints anteriores. Revisão confirmou:

| Sub-item | Sprint | Status |
|---|---|---|
| (a) Múltiplos anexos por conta | 17.1 | ✅ tabela `contas_pagar_anexos`, componente `MultiplosAnexos.jsx` |
| (b) Editar conta em qualquer status | 17.1 | ✅ trava removida + auditoria preserva histórico |
| (c) Fix de visualização da data | 17.1 | ✅ função `dataParaIso` + frontend `'T12:00:00'` |
| (d) Recorrência mensal | 13 | ✅ migration 011 + service `recorrencia-contas.service.js` |

**Como testar:** cria conta recorrente mensal por 12x com 3 anexos →
edita uma conta paga (com aviso amarelo no modal) → verifica que datas
aparecem corretas.

---

## Sprint 22 — Processos em andamento (item 3 da spec)

Dashboard cross-processo `/instancias` com:
- Toggle "Minhas" (default) vs "Todas que vejo"
- 3 cards de stat: Em andamento, Paradas há 7+ dias (clicável → filtro),
  Total
- Filtros: busca, status, processo, responsável, "Só paradas há 7+ dias"
- Cards com badge vermelho "Parada há X dias" + barra de progresso
  vermelha quando parada

**Backend:**
- `backend/src/controllers/instancias.controller.js`: função `listarGeral`
  com filtros dinâmicos (helper `PH = (n) => String.fromCharCode(36) + n`
  pra evitar bug de `'$' + N` em ferramentas de edição)
- Cálculo de `ultima_movimentacao` via `MAX(cards.atualizado_em)` na query
- Flag `parada = em_andamento + dias_sem_movimentacao >= 7` calculada em JS
- Permissão: admin vê tudo; outros só processos publicados ou de equipes
  que é membro

**Frontend:**
- `frontend/src/pages/Instancias.jsx` (novo)
- Sidebar: item "Em andamento" com ícone `Activity` entre Processos e
  Cartórios

**Como testar:** abre `/instancias` → toggle Minhas/Todas funciona →
clica card de "Paradas" → filtro ativa.

---

## Sprint 21 — Governança: Documentos da empresa + Contratos (item 6)

### 21A — Documentos da empresa

Repositório versionado de documentos institucionais (estatuto, regimento,
certidões, alvarás, etc).

**Backend:**
- Migration **021**: tabela `documentos_empresa` (categoria varchar livre,
  upload via `uploaderGovernanca()`)
- `controllers/documentos-empresa.controller.js`: CRUD + substituirArquivo
  + baixarArquivo (sendFile) + arquivar + excluir
- Rotas: leitura autenticado, escrita admin

**Frontend:**
- `pages/DocumentosEmpresa.jsx`: lista agrupada por categoria, filtros,
  modal Novo/Editar com upload via FormData multipart
- Categorias sugeridas: estatuto, regimento, certidao, alvara, politica,
  procuracao, outro

### 21B — Contratos com terceiros

Cadastro de contratos com clientes/fornecedores/parceiros, com cálculo
de "vencendo" / "vencido" sob demanda (no GET).

**Backend:**
- Migration **021** (mesma): tabela `contratos` com contraparte_*, valor
  numeric(14,2), periodicidade (mensal/anual/unico/outro), status
  (vigente/encerrado/em_negociacao/cancelado), alerta_antes_dias (default 30)
- `controllers/contratos.controller.js`: função `calcularVencimento(c)`
  retorna `{dias_pra_vencer, vencendo, vencido}`
- Ordenação: status vigente DESC, data_fim ASC NULLS LAST

**Frontend:**
- `pages/Contratos.jsx`: 3 cards de stat (Vigentes / Vencendo /
  Vencidos), filtros, badge de vencimento amarelo/vermelho
- `pages/Governanca.jsx`: 2 abas novas (Documentos + Contratos)
- Rotas: `/governanca/documentos`, `/governanca/contratos`

**Como testar:** cadastra documento (estatuto.pdf) → cadastra contrato
com data_fim daqui a 10 dias e alerta=30 → confere badge amarelo
"Vence em 10 dias".

---

## Sprint 20 — Cartórios (item 4 da spec)

Módulo novo pra cadastrar cartórios e vincular a quadros do kanban.

### 20A — Backend + lista

- Migration **020**: 4 tabelas
  - `cartorios` (nome, tipo, status, endereço, contatos, observações)
  - `cartorios_responsaveis` (N:N com pessoas_acesso)
  - `cartorios_quadros` (N:N com quadros + `coluna_id` opcional)
  - `cartorios_historico` (timeline: nota / contato / mudanca_status /
    mudanca_fase / vinculo_quadro / desvinculo_quadro)
- `controllers/cartorios.controller.js`: 10 endpoints + histórico
  automático em cada mudança
- `pages/Cartorios.jsx`: lista com filtros (busca, tipo, status, UF)
- Sidebar: item "Cartórios" com ícone `Building2`

### 20B — Página de detalhe

- `pages/Cartorio.jsx` (novo): 4 seções verticais
  1. Informações básicas (botão editar abre ModalCartorio)
  2. Responsáveis (MultiSelectPessoas)
  3. Vínculos com quadros (vincular, mudar fase, desvincular)
  4. Histórico (timeline com 6 tipos de evento)
- 5 modais: editar / responsáveis / vincular / mudar fase / adicionar nota
- Componente `components/ModalCartorio.jsx` extraído pra reuso

**Como testar:** cadastra cartório (1º RTD São Paulo, tipo: rtd, status:
ativo, cidade: SP, UF: SP) → abre detalhe → adiciona responsável →
vincula a um quadro → vê a timeline preencher.

---

## Sprint 19 — Cor + multi-responsável em eventos do quadro

Eventos do calendário do quadro ganham cor (mesma paleta de 15 cores das
etiquetas) e múltiplos responsáveis.

- Migration **019**: `eventos_quadro.cor` (default 'slate') + tabela
  N:N `eventos_quadro_responsaveis`
- Schema Zod aceita `responsavel_id` (singular, back-compat) ou
  `responsavel_ids` (array). Precedência: array > singular
- Frontend: seletor de cor inline + `MultiSelectPessoas` no modal de evento
- Calendário visual usa cor do evento no chip

---

## Sprint 18 — Múltiplos responsáveis em cards do kanban

Card vira N:N com pessoas (antes era 1:1).

- Migration **018**: tabela `cards_responsaveis` + trigger
  `sync_card_responsavel_principal` que mantém `cards.responsavel_id`
  sincronizado com o **primeiro** da N:N (back-compat com queries antigas)
- Schema Zod aceita `responsavel_id` (singular) ou `responsavel_ids`
  (array). Precedência: array > singular
- Frontend: `MultiSelectPessoas.jsx` (novo componente reutilizável) +
  avatares empilhados nos cards do board
- Notificação: dispara só pro responsável principal (primeiro da lista)
  pra evitar fan-out. Pode evoluir pra notificar todos no futuro

---

## Outras decisões transversais

### Helper `PH = (n) => String.fromCharCode(36) + n`

Em controllers que montam UPDATE dinâmico (`controllers/instancias.controller.js`,
`controllers/cards.controller.js`), evitamos template literal `\`$${var}\``
ou concatenação `'$' + var` literal porque o `Filesystem:edit_file` ocasionalmente
corrompe esses padrões trocando `$` por quebra de linha.

A solução é `const PH = (n) => String.fromCharCode(36) + n;` no topo do
arquivo, e usar `PH(params.length)` em vez de `'$' + params.length`.

### Estratégia de back-compat em campos que viraram N:N

Toda vez que um campo singular vira N:N (responsavel_id em cards e
eventos), seguimos o mesmo padrão:
- Trigger PostgreSQL mantém o campo legado sincronizado com o **primeiro**
  da N:N
- Schema Zod aceita ambos formatos; array tem precedência se ambos vierem
- Helper `resolverResponsaveis(d)` no controller centraliza a regra
- Frontend usa o array (`responsaveis` ou `responsavel_ids`)

### Strategy de uploads

Reusar `uploaderGovernanca()` ou `uploaderComprovantes()` de
`backend/src/utils/uploads.js`. Frontend usa FormData + axios
`Content-Type: multipart/form-data`. Download via `responseType: 'blob'`
+ Blob URL + click programático em `<a>`.

### Permissão padrão pra módulos novos

- **Leitura**: autenticado (qualquer pessoa logada)
- **Escrita**: admin

Exceções explícitas: Cartórios (tudo = autenticado por decisão do
projeto — qualquer membro da equipe pode atualizar contatos).
