# Sprint 7 — Polimento (notificações, e-mails, comprovantes)

Sprint focada em comunicação e auditoria. Três frentes:

1. **Notificações in-app** (sino no menu)
2. **E-mails automáticos** via Resend
3. **Comprovantes** anexados a movimentos e contas a pagar (filesystem, igual Sprint 6)

## 1. O problema que essa sprint resolve

Até a Sprint 6 a ferramenta sabia o que precisava ser feito (atas em
aprovação, contas vencendo, distribuições propostas), mas ninguém
ficava sabendo a não ser que abrisse o app. O sócio que recebia uma
distribuição não tinha aviso; o admin com conta vencendo amanhã, idem.

Sprint 7 fecha esse buraco com sino in-app, e-mail automático fora do
app, resumo diário pro admin, e página de configurações pra ligar/desligar
cada tipo de aviso. Aproveita pra fechar o tema de comprovantes
(filesystem em movimentos e contas a pagar).

## 2. Escopo

### O que entra

- Tabelas `notificacoes`, `emails_enviados`, `configuracoes_notificacoes`
- Service `email.service.js` (wrapper Resend tolerante a falha)
- Service `notificacoes.service.js` (orquestrador in-app + e-mail)
- 5 templates HTML responsivos (em-aprovação ata, em-aprovação decisão,
  finalizado, movimento criado, resumo diário admin)
- Cron diário (default 8h SP) com resumo do administrador
- Componente `<Sino>` no Layout (desktop e mobile) com polling 60s
- Página `/configuracoes` (admin-only) com 5 toggles + 2 inputs
- Endpoints REST de comprovantes em `movimentos-socios` e `contas-pagar`

### O que NÃO entra (deliberado)

| Ficou fora | Motivo |
|---|---|
| Notificação em tempo real (websocket/SSE) | Polling resolve com 1% da complexidade |
| Modais de upload na UI de Lucros/ContasPagar | Backend pronto; UI fica pra Sprint 8 |
| PDF gerado no servidor (anexo de e-mail) | Puppeteer pesado; PDFKit é trabalho manual |
| Push notifications mobile | App é web, PWA seria escopo separado |
| Templates customizáveis pelo admin | Os 5 fixos cobrem tudo hoje |
| Recorrência de eventos no calendário | Sprint 8 |

## 3. Modelo de dados (migration 007)

### `notificacoes`

Lista por pessoa. Cada pessoa só vê o que é dela.

- `pessoa_id` → `pessoas_acesso(id)` ON DELETE CASCADE
- `tipo` (livre, ex: `governanca.documento_em_aprovacao`)
- `titulo`, `descricao`, `link` (caminho do frontend), `contexto` (jsonb)
- `lida` boolean DEFAULT FALSE, `criada_em`, `lida_em`
- Índice `(pessoa_id, lida, criada_em DESC)`

### `emails_enviados`

Auditoria. Toda tentativa fica registrada — sucesso, falha ou pulado.

- `pessoa_id` (nullable), `destinatario`, `assunto`, `template`
- `status` ∈ `pendente | enviado | falhou | pulado_sem_config`
- `erro` (mensagem se falhou), `provedor_id` (id retornado pelo Resend)
- `criado_em`, `enviado_em`

### `configuracoes_notificacoes` (singleton id=1)

5 booleanos (1 por tipo de aviso) + 2 ints (janela de antecedência em
dias para contas a pagar e movimentos de sócios).

### Comprovante (campos adicionados)

Em `movimentos_socios` e `contas_pagar`:
- `comprovante_nome`, `comprovante_caminho`, `comprovante_tamanho`, `comprovante_mime`

O campo `comprovante_url` (link externo) que já existia foi preservado;
podem coexistir.

## 4. Fluxo dos avisos

| Quando | Helper | Quem recebe | Template |
|---|---|---|---|
| Ata/contrato em aprovação | `notificarDocumentoEmAprovacao` | Sócios com `pode_aprovar_atas` (ata) ou `pode_votar` (outros) | `tplDocumentoEmAprovacao` |
| Decisão proposta | `notificarDecisaoEmAprovacao` | Sócios com `pode_votar` | `tplDecisaoEmAprovacao` |
| Documento finalizado (aprovado/rejeitado) | `notificarDocumentoFinalizado` | Criador | `tplFinalizado` |
| Decisão finalizada | `notificarDecisaoFinalizada` | Criador | `tplFinalizado` |
| Pró-labore/aporte criado | `notificarMovimentoCriado` | Pessoas titulares do sócio | `tplMovimentoSocioCriado` |
| Distribuição criada (rodada) | `notificarSociosNovaRodada` | Cada sócio com seu valor | `tplMovimentoSocioCriado` |
| Cron diário 8h SP | `enviarResumoDiarioParaAdmins` | Admins | `tplResumoDiarioAdmin` |

Tudo é fire-and-forget via `disparar()` — falha de e-mail nunca derruba
a operação principal (criar, votar, etc).

## 5. Provedor de e-mail

Escolhido **Resend** (https://resend.com) — tier free 3.000/mês, API
simples. Sem `RESEND_API_KEY` o app não derruba: registra como
`pulado_sem_config` e a notificação in-app continua.

Em sandbox usa `onboarding@resend.dev` (só envia pro dono da conta).
Em produção, verificar domínio próprio antes.

## 6. Novas rotas da API

```
GET    /api/notificacoes                       Lista
GET    /api/notificacoes/contagem              { nao_lidas, total_30d }
POST   /api/notificacoes/:id/marcar-lida
POST   /api/notificacoes/marcar-todas-lidas
DELETE /api/notificacoes/:id

GET    /api/configuracoes-notificacoes
PUT    /api/configuracoes-notificacoes         (admin)

GET    /api/movimentos-socios/:id/comprovante
POST   /api/movimentos-socios/:id/comprovante  (admin, multipart 'arquivo')
DELETE /api/movimentos-socios/:id/comprovante  (admin)

GET    /api/contas-pagar/:id/comprovante
POST   /api/contas-pagar/:id/comprovante       (admin, multipart 'arquivo')
DELETE /api/contas-pagar/:id/comprovante       (admin)
```

Upload aceita PDF, PNG, JPEG, WebP. Limite via `UPLOADS_MAX_MB` (default 10).

## 7. Configuração

Novas variáveis em `.env`:

```bash
# E-mail (opcional)
RESEND_API_KEY=
EMAIL_FROM=Gestão Nexus <onboarding@resend.dev>
APP_URL=https://gestao-nexus.up.railway.app

# Cron de notificações
NOTIFICACOES_ATIVO=true
NOTIFICACOES_CRON=0 8 * * *
NOTIFICACOES_TIMEZONE=America/Sao_Paulo
```

⚠ **Em produção no Railway**: `UPLOADS_DIR` precisa apontar pra Volume
montado, senão arquivos somem em redeploy. Verificar domínio remetente
no Resend antes de sair do `onboarding@resend.dev`. Setar `APP_URL` pro
domínio real (vai dentro dos links nos e-mails).

## 8. Como rodar

```bash
cd backend
npm install            # garante resend@4
npm run migrate        # aplica 007_polimento.sql (idempotente)
npm run dev
```

Frontend recarrega sozinho com Vite.

## 9. Roteiro de testes

### Notificações in-app

- [ ] Login → sino aparece no rodapé do menu (desktop) e no header (mobile)
- [ ] Click no sino abre popover com "Nada por aqui ainda"
- [ ] Admin cria ata em aprovação → sócio com poder vê notificação
- [ ] Click na notificação marca como lida e navega
- [ ] Botão "Tudo lido" zera o badge
- [ ] Excluir remove da lista e do banco

### E-mails (com Resend configurado)

- [ ] Criar ata → sócios com poder recebem `tplDocumentoEmAprovacao`
- [ ] Atingir quórum → criador recebe `tplFinalizado`
- [ ] Criar pró-labore → titulares do sócio recebem `tplMovimentoSocioCriado`
- [ ] Criar distribuição → cada sócio recebe e-mail com seu valor
- [ ] Cron 8h dispara `tplResumoDiarioAdmin` (ou pula se nada)

### E-mails sem Resend

- [ ] Operações funcionam normalmente (200)
- [ ] `emails_enviados` tem registros com `status='pulado_sem_config'`
- [ ] Notificações in-app continuam aparecendo

### Configurações

- [ ] Admin acessa `/configuracoes` → 5 toggles + 2 campos numéricos
- [ ] Não-admin → 403 (AdminRoute)
- [ ] Toggle desligado → cria notificação in-app mas pula e-mail

### Comprovantes (backend, sem UI ainda)

```bash
curl -X POST http://localhost:3001/api/contas-pagar/<uuid>/comprovante \
  -H "Authorization: Bearer <token>" -F "arquivo=@/caminho/comprovante.pdf"

curl http://localhost:3001/api/contas-pagar/<uuid>/comprovante \
  -H "Authorization: Bearer <token>" -O
```

- [ ] Subir PDF → 200 com tamanho e mime
- [ ] Baixar → arquivo correto
- [ ] Subir segundo → primeiro é apagado do disco
- [ ] DELETE → arquivo apagado, campos zerados
- [ ] Subir `.exe` → 400 `tipo_arquivo_nao_permitido`
- [ ] Subir > limite → 413

## 10. O que NÃO está pronto (de propósito)

- **UI de upload de comprovante** nos modais de Pagar/Efetivar. Endpoints
  prontos e testáveis via curl. Falta `<CampoComprovante>` reusável e
  encaixe nos modais.
- **Anexar PDF nos e-mails.** Hoje PDF é só `window.print()` no cliente.
  Pra anexar precisaria gerar no servidor (Puppeteer ~300MB ou PDFKit
  manual).
- **Recorrência no calendário, polimento mobile mais profundo, drag&drop.**

## 11. Próximos candidatos (Sprint 8)

- `<CampoComprovante>` + integração nos modais (item 14 da Sprint 7)
- PDFs no servidor com PDFKit
- Recorrência de eventos
- Mobile (tabelas → cards, modais full-screen)
- Aviso quando admin esquece de efetivar movimento já vencido
