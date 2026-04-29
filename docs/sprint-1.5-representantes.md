# Sprint 1.5 — Representantes

Separação entre **quem loga** e **em nome de quem se age**, com suporte a
representantes e procuradores dos sócios.

## 1. O problema que essa sprint resolve

Na Sprint 1, a tabela `socios` guardava duas coisas em uma só:
- A **participação societária** (nome, percentual, CPF, data de entrada)
- As **credenciais de login** (e-mail, senha, `administrador`, último acesso)

Isso funciona enquanto todo sócio é uma pessoa física que vai logar na
ferramenta pra ver os próprios números. Mas não dá conta de três casos
bem comuns:

1. **Sócio PJ** — uma empresa que é cotista. Empresa não loga; quem loga é
   um diretor dela.
2. **Procurador** — alguém que recebeu procuração específica pra representar
   o sócio em determinadas decisões, mas não é sócio.
3. **Representante legal** — pai/mãe de um cotista menor, curador, etc.

A Sprint 1.5 cria essa separação sem quebrar nada do que já existia: todo
sócio da Sprint 1 continua podendo logar do mesmo jeito, com o mesmo e-mail
e senha, porque a migration faz a conversão automática.

## 2. Modelo conceitual

### Três entidades, três responsabilidades

| Entidade         | Responsabilidade                                           |
| ---------------- | ---------------------------------------------------------- |
| `socios`         | Participação societária: nome, PF/PJ, documento, %         |
| `pessoas_acesso` | Credencial de login: e-mail, senha, flag de administrador  |
| `representacoes` | Vínculo **pessoa ↔ sócio**: papel, poderes, vigência       |

Uma pessoa pode ter várias representações. Um sócio pode ter várias pessoas
o representando. E uma pessoa pode ser administradora do sistema sem
representar nenhum sócio (admin puro — para casos em que a ferramenta é
operada por um gestor externo).

### Papéis possíveis

| Papel          | Quando usar                                                          |
| -------------- | -------------------------------------------------------------------- |
| `titular`      | A pessoa é o próprio sócio PF. Foi o caminho automático da migração. |
| `representante`| A pessoa age por vínculo legal (ex: diretor de uma PJ sócia).        |
| `procurador`   | A pessoa age por procuração específica — guarde a URL do documento.  |

### Poderes

Quatro flags booleanas, aplicadas pelas telas conforme as sprints forem
sendo construídas:

- `pode_ver_financeiro` — ver saldos, caixa, distribuições
- `pode_votar` — votar em decisões formais
- `pode_aprovar_atas` — aprovar atas lavradas
- `pode_aprovar_distribuicoes` — aprovar distribuições de lucro

O default na criação é "só consulta": `ver_financeiro = true` e o resto `false`.

### Contexto da sessão

Uma pessoa que representa vários sócios precisa dizer "em nome de quem"
está agindo antes de fazer algo. O JWT carrega dois campos:

```
sub      → id da pessoa_acesso (quem está logada)
socio_id → id do sócio em nome de quem ela age (pode ser null)
```

Quando o login detecta várias representações, o backend devolve
`precisa_escolher_contexto: true` e o frontend manda pra tela
`/escolher-contexto`. Dali pra frente, todo log de auditoria vai gravar
autoria dupla: `pessoa_acesso_id` + `socio_id`.

## 3. Auditoria (`log_acoes`)

Toda ação importante da ferramenta passa a chamar `registrarAcao()`,
que grava em `log_acoes`:

- `pessoa_acesso_id` — quem clicou
- `socio_id` — em nome de quem (pode ser null quando é ação administrativa pura)
- `acao` — código curto: `login`, `trocar_contexto`, `socio.criar`, `pessoa_acesso.atualizar`, `representacao.revogar`, etc.
- `detalhes` — JSONB com o que variar (ids tocados, campos alterados, motivo…)
- `ip`, `user_agent` — vindo da request

É fire-and-forget: falha de log nunca derruba a ação do usuário. A tabela
fica preparada pra uma tela de auditoria numa sprint futura.

## 4. O que muda em relação à Sprint 1

### Migration 002 (automática)

Ao rodar `npm run migrate`, o script `002_representantes.sql` aplica:

1. Cria `pessoas_acesso` vazia
2. Adiciona `tipo_pessoa` em `socios` (default `fisica`) e renomeia `cpf` → `documento` (VARCHAR 18, cabe CNPJ)
3. **Copia** cada linha de `socios` (com `senha_hash`) para `pessoas_acesso` com o mesmo `id`
4. Cria `representacoes` e, pra cada sócio antigo, insere uma representação `titular` com todos os poderes `true`
5. **Remove** as colunas `senha_hash`, `administrador`, `ultimo_login_em` de `socios`
6. Tira a unicidade de `email` em `socios` (agora o e-mail do sócio é só contato; a unicidade é em `pessoas_acesso`)
7. Cria `log_acoes`

Efeito prático: **todo sócio da Sprint 1 loga igual depois da migração**, porque
o `id`, e-mail e `senha_hash` foram copiados para `pessoas_acesso` e a
representação "titular" foi criada automaticamente.

### Novas rotas da API

| Método | Caminho                              | Acesso    | O que faz                                         |
| ------ | ------------------------------------ | --------- | ------------------------------------------------- |
| POST   | `/api/auth/login`                    | Pública   | Login; devolve token + representações             |
| POST   | `/api/auth/trocar-contexto`          | Autenticado | Gera novo token com outro `socio_id` no contexto |
| GET    | `/api/auth/eu`                       | Autenticado | Pessoa + contexto + representações ativas        |
| GET    | `/api/socios`                        | Autenticado | Lista sócios (sem dados de login)                |
| POST   | `/api/socios`                        | Admin     | Cria sócio (PF ou PJ)                            |
| PUT    | `/api/socios/:id`                    | Admin     | Atualiza sócio                                   |
| GET    | `/api/pessoas`                       | Autenticado | Lista pessoas de acesso com qtd de representações |
| POST   | `/api/pessoas`                       | Admin     | Cria pessoa de acesso                            |
| PUT    | `/api/pessoas/:id`                   | Admin     | Atualiza pessoa                                  |
| POST   | `/api/pessoas/:id/senha`             | Admin ou própria | Troca/reseta senha                         |
| GET    | `/api/representacoes`                | Autenticado | Lista (filtros: `pessoa_id`, `socio_id`, `somente_ativas`) |
| POST   | `/api/representacoes`                | Admin     | Cria vínculo pessoa↔sócio                        |
| PUT    | `/api/representacoes/:id`            | Admin     | Altera papel/poderes/vigência                    |
| POST   | `/api/representacoes/:id/revogar`    | Admin     | Revoga com motivo obrigatório                    |

### Regra de unicidade importante

Só pode existir **uma** representação ativa entre a mesma pessoa e o mesmo
sócio. Está garantido por índice parcial no banco:

```sql
CREATE UNIQUE INDEX idx_representacoes_unica_ativa
  ON representacoes (pessoa_acesso_id, socio_id)
  WHERE ativo = TRUE;
```

Para trocar o papel/poderes de alguém você **edita** a representação ativa.
Para desligar completamente, você **revoga** (fica marcada `ativo=false`
com `revogado_em`, `revogado_por_id` e `motivo_revogacao`). Depois de
revogada, não dá pra reativar — o caminho é criar uma nova.

## 5. O que o usuário vê na prática

### Login

- Uma representação: entra direto no painel
- Várias representações: pára em `/escolher-contexto` e escolhe o sócio
- Zero representações + admin: entra no painel em "modo administração"
- Zero representações + não admin: erro de "Fale com um administrador"

### Seletor de contexto (menu lateral)

Logo abaixo do cabeçalho da sidebar, aparece um dropdown com o sócio
em uso e as demais opções, quando faz sentido. Com uma representação só,
vira um rótulo informativo sem dropdown.

### Duas novas telas (só para administradores)

- **Pessoas de acesso** — CRUD de quem pode logar, reset de senha,
  ativar/inativar. Mostra quantas representações cada uma tem.
- **Representações** — lista com filtros por pessoa, sócio e ativo/revogadas;
  modal de criação com seleção de papel, poderes, vigência e URL da
  procuração; modal de revogação com motivo obrigatório.

Para quem não é admin essas páginas nem aparecem no menu, e a rota é
bloqueada em dois níveis (client-side pelo `AdminRoute` e server-side
pelo middleware `exigirAdmin`).

## 6. Como rodar (mudanças em relação à Sprint 1)

### Variáveis de ambiente novas (opcionais)

Só para o seed inicial. Se quiser que o admin já entre vinculado a um sócio:

```env
# Se SEED_SOCIO_NOME existir, o seed cria o sócio e amarra o admin como "titular"
SEED_SOCIO_NOME=Marcio Nascimento
SEED_SOCIO_TIPO_PESSOA=fisica            # fisica | juridica
SEED_SOCIO_DOCUMENTO=000.000.000-00
SEED_SOCIO_EMAIL=marcio@nexus.com.br
SEED_SOCIO_TELEFONE=(92) 9 9999-9999
SEED_SOCIO_PERCENTUAL=100
```

Se deixar em branco, o seed cria só a pessoa administradora "pura".

### Comando em ambiente já existente (Sprint 1 rodando)

```bash
cd backend
npm run migrate   # aplica 002_representantes.sql, migra dados
npm run seed      # idempotente — só garante o admin
```

Nada de `npm run reset` ou `DROP`. O histórico e o login da Sprint 1 continuam.

### Comando em ambiente novo (do zero)

Idêntico à Sprint 1: `npm run migrate && npm run seed`. Agora aplica as
duas migrations em sequência.

## 7. Roteiro de testes (aceite da sprint)

### Migração e compatibilidade

- [ ] Um sócio criado na Sprint 1 ainda consegue logar com o mesmo e-mail/senha após `npm run migrate`
- [ ] Esse sócio aparece como representação `titular` de si mesmo, com todos os poderes `true`
- [ ] A listagem de `/api/socios` não retorna mais `senha_hash`, `administrador`, `ultimo_login_em`

### Fluxo de login

- [ ] Pessoa com 1 representação → entra direto, sem tela de escolha
- [ ] Pessoa com 2+ representações → cai em `/escolher-contexto`
- [ ] Admin sem representação → entra direto (modo administração)
- [ ] Pessoa comum sem representação → login é rejeitado com mensagem clara
- [ ] Depois de escolher contexto, o dropdown do menu mostra o sócio atual

### Troca de contexto

- [ ] Trocar de sócio no dropdown não força logout
- [ ] Após trocar, o nome no dropdown e o card no painel refletem a escolha
- [ ] `log_acoes` registra `acao = trocar_contexto` com o `socio_id` novo

### Pessoas de acesso (admin)

- [ ] Criar pessoa nova com senha mínima de 8 caracteres
- [ ] Editar nome/e-mail/telefone/cpf sem poder trocar a senha pelo mesmo modal
- [ ] Resetar senha de outra pessoa sem precisar da atual
- [ ] Trocar a própria senha exige a atual
- [ ] Desativar pessoa: ela deixa de conseguir logar

### Representações (admin)

- [ ] Criar representação ligando uma pessoa a um sócio com papel e poderes
- [ ] Tentar criar outra ativa entre a mesma dupla → erro 409 "já existe"
- [ ] Editar papel/poderes/vigência de uma ativa funciona
- [ ] Tentar editar uma revogada → erro
- [ ] Revogar sem motivo → erro de validação
- [ ] Revogar com motivo → vira "Revogada", some dos filtros "só ativas"
- [ ] Depois de revogar, dá pra criar uma nova entre a mesma dupla (histórico fica)
- [ ] Filtros por pessoa, por sócio e toggle "só ativas" funcionam

### Proteção de rotas

- [ ] Usuário não-admin tentando `GET /api/pessoas` via navegação direta → 401/403
- [ ] Menu lateral não mostra "Pessoas" e "Representações" para não-admin
- [ ] `AdminRoute` redireciona pra `/` se pessoa não-admin acessar `/pessoas` digitando na URL

## 8. O que NÃO está pronto (de propósito)

- **Tela de auditoria** de `log_acoes` — os dados já estão sendo gravados;
  a visualização entra em sprint futura.
- **Aplicação dos poderes nas telas financeiras** — os campos existem e são
  expostos pelo `/auth/eu`, mas como Caixa/Mensal/Lucros ainda estão em
  construção, não tem onde barrar ainda. Na Sprint 5 (painel dos sócios)
  `pode_aprovar_distribuicoes` passa a valer.
- **Upload de procuração** — hoje o campo é uma URL. Upload direto de PDF
  entra junto com o módulo de governança (Sprint 6).
- **Convite por e-mail** — hoje admin define a senha inicial e passa pela
  pessoa. Convite com link expira entra numa sprint de polimento.

## 9. Próxima sprint

**Sprint 2 — Integração ASAAS + Caixa parte 1 (entradas)**
(sem mudanças no escopo original — Sprint 1.5 foi uma inclusão, não substituição)
