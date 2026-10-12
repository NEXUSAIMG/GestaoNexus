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
GET    /api/comercial/config
GET    /api/comercial/painel
GET    /api/comercial/metas?mes=AAAA-MM
PUT    /api/comercial/metas/:mes
GET    /api/comercial/leads?etapa=&origem=&dono_id=(uuid|sem)&campanha=&busca=
POST   /api/comercial/leads
POST   /api/comercial/leads/importar-lista
GET    /api/comercial/leads/:id
PUT    /api/comercial/leads/:id
POST   /api/comercial/leads/:id/arquivar
POST   /api/comercial/leads/:id/toques          {tipo: cadencia|marco|avulso, dia?, canal?, nota?}
DELETE /api/comercial/leads/:id/toques?tipo=&dia=
DELETE /api/comercial/toques/:id
GET    /api/comercial/importar-quadro/previa[?quadro_id=]   (admin)
POST   /api/comercial/importar-quadro                       (admin)
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
2. Completar o valor dos ganhos importados (aparecem com "sem valor").
3. Metas e indicadores → conferir as metas do mês e preencher **novos por
   pessoa** (Alexia 15, Rodrigo 10, pelo plano).
4. Avisar a equipe que a Mesa Comercial foi aposentada.

## Próximas entregas

- **Entrega 2 — Apuração:** previsão do mês pelo funil, custo por cliente
  por canal, orçamento previsto × realizado (categoria Marketing de Contas a
  pagar), placar individual e taxas por período.
- **Entrega 3 — Saúde e ritmo:** risco de cancelamento pelo uso vindo do Seu
  Cartório (exige estender o endpoint de integração de lá), relatório
  automático toda segunda às 8h e auditoria da qualidade do registro.
