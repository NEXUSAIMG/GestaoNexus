# Sprint 42 — Módulo Comercial (funil de vendas do Seu Cartório)

Entrega 1 de 3 do plano de gestão comercial. Leva para dentro do Nexus a
"Mesa Comercial" da metodologia de venda SaaS. Depois de migrar, a Mesa
Comercial é aposentada e a equipe registra só aqui.

## O que entrega

Menu **Comercial** (`/comercial`), liberado também para pessoas com acesso
restrito (a equipe comercial). Seis abas:

| Aba | O que mostra |
|---|---|
| **Hoje** | Novos na cadência e toques do dia contra a meta, trials ativos, ganhos do mês. Listas de toques de cadência devidos, marcos de trial devidos, próximos passos vencendo e cartórios parados além do prazo da etapa. Botão "Feito" em cada toque/marco. |
| **Funil** | Kanban das 8 etapas (Prospect → Em cadência → Diagnóstico → Qualificado → Trial guiado → Proposta → Ganho / Perdido), com prazo da etapa, responsável, origem e pontuação do trial. Filtros por origem e responsável; busca. |
| **Trials** | Dia do trial (D0–D14), pontuação de ativação, próximo marco e situação (no caminho / atenção / em risco). |
| **Supervisão** | Semáforo por pessoa para as checagens de 8h30, 12h30 e 17h: feitos × pendentes hoje, novos na cadência × meta, e alertas (trial abaixo de 40 pontos, fora do prazo, sem próximo passo). |
| **Metas e indicadores** | Metas do mês (desdobramento de trás para frente em contatos/dia), meta de novos por pessoa, taxas reais contra a premissa e motivos de perda. |
| **Scripts** | Roteiros, objeções e a cadência de 12 dias úteis. |

### Regras que o sistema passa a garantir

- **Origem obrigatória** em todo lead (prospecção, e-mail frio, inbound,
  site, Instagram, LinkedIn, indicação, ex-cliente, evento, webinar, outro)
  e campo livre de **campanha/onda**. É o que permite apurar custo e
  conversão por canal (entrega 2).
- **Perdido exige motivo** de uma lista fixa (também é `CHECK` no banco).
- **Ganho exige valor mensal** do contrato.
- Mudança de etapa registra o **marco** (primeira data em cada etapa) e o
  **histórico de-para** (`comercial_movimentos`). Pular etapa conta nas
  anteriores, para as taxas não ficarem infladas.
- Toques e marcos são **atividade registrada** (`comercial_toques`, com quem
  fez e quando), base da supervisão e do relatório semanal (entrega 3).

### Importadores

- **Importar lista** (qualquer pessoa): colar da planilha, até 2.000 linhas,
  com origem, campanha, responsável e etapa inicial (Prospect ou já em
  cadência).
- **Importar do quadro** (só admin): traz os cards de um quadro Kanban
  (ex.: "Atividade Comercial") como leads. O admin mapeia cada coluna para
  uma etapa (com sugestão automática) e pode filtrar só os cards com a
  etiqueta "Cliente". Lê Cidade/UF, E-mail, Telefone/WhatsApp,
  Representante/Oficial e Origem dos campos personalizados; Termômetro,
  Faturamento, Competência, Site e a descrição vão para as anotações.
  Datas das etapas vêm do card (criação e entrada na coluna), então um
  "Concluído" antigo não conta como ganho do mês. **Idempotente**: card já
  importado é pulado. **O quadro não é alterado.**

## Arquivos

- `backend/db/migrations/034_comercial.sql`: `comercial_leads`,
  `comercial_toques`, `comercial_movimentos` e `comercial_metas`. Tudo
  aditivo; nenhuma tabela existente muda.
- `backend/src/services/comercial.regras.js`: regras da metodologia
  (funções puras, reaproveitadas pelo relatório semanal).
- `backend/src/controllers/comercial.controller.js` e
  `backend/src/routes/comercial.routes.js`: rotas em `/api/comercial`.
- `frontend/src/pages/Comercial.jsx` e `frontend/src/components/comercial/*`.
- `testes/t-comercial.mjs`: 43 verificações, incluídas em `npm run api`.

## API

```
GET    /api/comercial/config | painel | placar?de=&ate=
GET    /api/comercial/metas?mes=AAAA-MM        PUT /api/comercial/metas/:mes (gestão)
GET    /api/comercial/leads?etapa=&origem=&dono_id=(uuid|sem)&campanha=&busca=
POST   /api/comercial/leads                    POST /api/comercial/leads/verificar
POST   /api/comercial/leads/importar-lista
GET    /api/comercial/leads/:id                PUT  /api/comercial/leads/:id
POST   /api/comercial/leads/:id/arquivar       {motivo} (gestão)
POST   /api/comercial/leads/:id/toques         {tipo, dia?, canal?, resultado, duracao_min?, nota?, proximo_passo?, proxima_data?, reuniao?}
POST   /api/comercial/leads/:id/toques/estornar {tipo, dia, motivo}
POST   /api/comercial/toques/:id/estornar      {motivo}
POST   /api/comercial/leads/:id/reunioes       POST /api/comercial/reunioes/:id/desfecho | /remarcar
POST   /api/comercial/leads/:id/propostas      POST /api/comercial/propostas/:id/status
POST   /api/comercial/leads/:id/pagamento      (gestão)   POST /api/comercial/leads/:id/recompensa-indicacao (gestão)
GET|POST /api/comercial/nao-contatar           DELETE /api/comercial/nao-contatar/:id (gestão)
GET|POST /api/comercial/checagens  (POST gestão)
GET|POST /api/comercial/1a1        (POST gestão)   POST /api/comercial/acoes   PUT /api/comercial/acoes/:id
POST   /api/comercial/feriados  DELETE /api/comercial/feriados/:data (gestão)
GET    /api/comercial/importar-quadro/previa[?quadro_id=]   POST /api/comercial/importar-quadro (admin)
```

## Como testar

```bash
npm run db:subir --prefix testes
npm run migrate --prefix backend
npm run start --prefix backend
npm run semear --prefix testes      # quadro "Atividade Comercial" de exemplo
node testes/t-comercial.mjs
```

## Depois do deploy (passo a passo para o admin)

1. Comercial → Funil → **Importar do quadro** → "Atividade Comercial".
   Conferir o mapa coluna → etapa e escolher "Só os com a etiqueta Cliente"
   se o quadro misturar tarefas internas.
2. Completar o valor e o **CNPJ** dos ganhos importados (aparecem com "sem
   valor" / "aguardando pagamento"); com o CNPJ, o ASAAS confirma o pagamento.
   Preencher o **CNS** dos cartórios em negociação (barra duplicidade).
3. Metas e indicadores → conferir as metas do mês e preencher as **metas por
   pessoa** (Alexia 15 novos/dia, Rodrigo 10, pelo plano; toques, reuniões e
   pagos de cada um).
4. Controles → incluir na lista de não contatar os descadastros que já
   existirem e conferir os feriados municipais de Belém.
5. Avisar a equipe que a Mesa Comercial foi aposentada.

## Próximas entregas

- **Entrega 2 — Apuração:** previsão do mês pelo funil, custo por cliente
  por canal, orçamento previsto × realizado (categoria Marketing de Contas a
  pagar), placar individual e taxas por período.
- **Entrega 3 — Saúde e ritmo:** risco de cancelamento pelo uso vindo do Seu
  Cartório (exige estender o endpoint de integração de lá), relatório
  automático toda segunda às 8h e auditoria da qualidade do registro.

---

# Sprint 42B — Controle minucioso

Feita antes do primeiro deploy, para a equipe já começar no formato definitivo.
Migration `035_comercial_controle.sql` (aditiva). Abas novas: **Placar** e
**Controles**.

## O que o servidor passa a exigir

| Regra | Como funciona |
|---|---|
| **Resultado em todo contato** | Atendeu, agendou, pediu retorno, recusou, respondeu (contam como *conexão*); não atendeu, caixa postal, número errado, mensagem enviada. Ligação tem duração opcional. |
| **"Agendou" cria a reunião** | Exige data e hora; cria a reunião e, se for diagnóstico, move o lead para *Diagnóstico agendado*. |
| **Reuniões com desfecho** | Realizada, faltou, remarcada (gera nova, a antiga fica registrada) ou cancelada. "Realizada"/"faltou" só depois do horário. Reunião passada sem desfecho vira alerta. |
| **Portões de etapa** (cumulativos) | *Qualificado*: diagnóstico realizado + campos do diagnóstico (mensagens/dia, atendentes, dor, decisor, prazo). *Trial*: meta de sucesso escrita + ativação agendada. *Proposta*: proposta registrada. *Ganho*: valor. Lead novo entra no máximo em Diagnóstico. A gestão pode forçar, com justificativa registrada junto com as pendências. |
| **Voltar etapa / reabrir** | Exige justificativa (fica no histórico). |
| **Proposta** | Plano, valor, envio, validade (padrão 7 dias). Nova proposta substitui a anterior. Única concessão aceita: 1 mês grátis para **ex-cliente**, **uma vez por cartório** (exige CNS ou CNPJ). Ganho aceita a proposta e herda o valor. |
| **Assinado × pago** | A meta conta **pagos**. Com o CNPJ preenchido, o Nexus confere sozinho no ASAAS (cobrança RECEIVED/CONFIRMED do mesmo CNPJ). Senão, a gestão confirma com comprovante. Assinado há mais de 7 dias sem pagamento vira alerta. |
| **Duplicidade** | Barra cadastro/importação com mesmo CNS, CNPJ, e-mail, telefone (com ou sem +55) ou nome+cidade+UF, e quem já é cliente ativo no portfólio. A mensagem diz com quem o cartório está. |
| **Lista de não contatar** | E-mail, domínio, telefone, CNS ou CNPJ. Bloqueia cadastro, importação, toque, reunião e proposta. Qualquer um inclui (também em lote); só a gestão remove — e a remoção fica registrada. |
| **Registro não se apaga** | Toque só é registrado com a data de hoje. Desmarcar vira **estorno** com motivo: o autor, no mesmo dia; depois, só a gestão. Estornos aparecem no placar. |
| **Histórico campo a campo** | Toda alteração (de → para, quem, quando), além de etapas, toques, estornos e reuniões. |
| **Só a gestão** | Arquivar (com motivo), confirmar pagamento manual, definir metas, checagens, 1:1, cancelar ação, feriados, importar quadro. |
| **Próximo passo obrigatório** | Lead em negociação (diagnóstico → proposta) não fica sem próximo passo datado depois de um contato. |

## Gestão

- **Supervisão:** semáforo considera também a meta de toques/dia da pessoa;
  mostra conexões; alertas de reunião sem desfecho, proposta vencendo e
  assinado sem pagamento; botões **registrar checagem** (8h30/12h30/17h —
  fotografa o semáforo; fora do verde exige o que foi combinado) e
  **registrar 1:1** (bloqueios, combinados, plano de ação com prazo; congela o
  placar da semana). Ações abertas aparecem no card da pessoa, vencidas em
  vermelho; a pessoa marca como feita.
- **Placar:** por pessoa e período (mês, 7 dias, mês anterior): toques,
  conexões, % conexão, reuniões agendadas/realizadas/faltou, %
  comparecimento, trials, propostas, assinados, pagos, receita, perdidos,
  estornos, checagens recebidas, ações vencidas — contra as metas individuais.
- **Metas por pessoa:** novos/dia, toques/dia, reuniões/mês, pagos/mês.
- **Controles:** lista de não contatar, cumprimento da rotina (3 checagens ×
  dias úteis), últimos 1:1, feriados (2026–2027 nacionais + Adesão do Pará já
  carregados; a cadência e os dias úteis das metas pulam feriados).

## Testes

`testes/t-comercial.mjs` — 67 verificações, com uma vendedora de acesso
restrito criada no teste para conferir as permissões. Bateria `npm run api`:
156 verificações passando. Conferência do ASAAS testada com cobrança
simulada no banco.

---

# Sprint 42C — Autoexplicativo

Objetivo: a equipe se resolver sozinha, sem manual e sem perguntar à gestão.

- **Ficha do cartório diz o próximo passo:** caixa "O que fazer agora" com
  uma ação e o botão que a executa (registrar toque do dia, registrar
  desfecho, agendar ativação, preencher diagnóstico, iniciar trial, mudar
  para Proposta, preencher CNPJ…). Logo abaixo, **"Para avançar para…"**: a
  lista dos critérios da próxima etapa com ✓/○ e um botão em cada item que
  falta. E **"O que falar agora"**: o roteiro do passo atual, com botão Copiar.
  Ações que mudam a etapa mantêm a ficha aberta e mostram a nova orientação.
- **Hoje virou roteiro do dia:** blocos numerados na ordem certa (reuniões,
  desfechos, marcos, toques, próximos passos, propostas, pagamento,
  parados), cada um dizendo por que está ali; blocos vazios viram uma linha
  "Em dia". Filtro **Só os meus / Toda a equipe** (vendedora abre nos seus;
  gestão na equipe), com KPIs pessoais e o próprio semáforo. Tela vazia diz o
  que fazer em seguida.
- **Ajuda em todo lugar:** faixa "como funciona" recolhível no topo de cada
  aba; ícones (?) nos termos (conexão, portão, semáforo, cadência, CNS,
  origem, prazo da etapa, colunas do placar, colunas do funil); aba **Ajuda**
  com o caminho do cartório (8 etapas: objetivo, o que fazer, quando avança,
  prazo), perguntas frequentes com busca e glossário; botão "Dúvidas?" no
  topo.
- **Tour de 1 minuto** na primeira visita de cada pessoa (5 telas), que pode
  ser revisto na aba Ajuda.
- **Funil:** vendedora abre filtrada na própria carteira; colunas vazias
  explicam o que entra nelas.

- **Processo desenhado (aba Processo):** o caminho do cartório como fluxo
  (Prospect → … → Ganho → Cliente pago), com "entra quando" em cada caixa e
  quantos cartórios estão em cada etapa agora; clique na etapa para ver o que
  fazer nela. Abaixo, a linha do tempo da cadência (8 toques em 12 dias
  úteis, com o canal de cada dia), a do trial (D0–D14) e a rotina do dia da
  equipe (8h30, 12h30, 17h e o 1:1 de sexta). Funciona no celular (fluxo
  vertical). Na ficha, uma barra mostra "Etapa 4 de 7 · próxima: Trial".
- **Portões x histórico:** etapa que o cartório já alcançou (marco registrado,
  inclusive vindo da importação do quadro) não é cobrada de novo — os portões
  valem para a primeira passagem e para etapas puladas. Sem isso, os cards
  importados em Trial/Proposta ficariam presos. A orientação da ficha usa a
  mesma regra e, se faltar algo, sugere resolver antes de avançar.

Todo o texto fica em `frontend/src/components/comercial/guia.js` — para
ajustar uma explicação, edite só esse arquivo.

## Gestão comercial sem acesso ao financeiro

A rotina diária (checagens, 1:1, metas, arquivar, forçar etapa, remover da
lista de não contatar, feriados) vale para **admin ou líder de uma equipe cujo
nome contém "Comercial"** (Equipes → membro → papel Líder). Assim quem faz a
gestão do dia não precisa ser admin — admin enxerga o financeiro inteiro.
Confirmar pagamento manual e importar o quadro continuam só admin.

## Plano de execução no próprio Nexus

`docs/plano-comercial-30-dias.csv` tem as 43 ações do lançamento (decisões
pendentes, ferramenta, leads rápidos, e-mail frio, clientes, eventos, gestão)
com responsável, prazo, prioridade e critério de pronto. Importe em Tarefas →
novo quadro → Importar planilha: cada frente vira etiqueta e "Decisão
pendente" vira coluna.

