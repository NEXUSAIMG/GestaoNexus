# 📣 Novidades na Gestão Nexus

Olá, equipe! Saíram melhorias importantes no sistema. Abaixo o resumo do que mudou na sua rotina — sem complicação técnica, só o que vocês vão sentir no dia a dia.

---

## 🏛️ Cartórios agora aparecem direto no quadro de tarefas

**O que mudou:** quando você abre um quadro (Kanban) que tem cartórios vinculados, agora eles aparecem **agrupados na fase em que estão**, logo no topo de cada coluna.

**Por que isso é bom:**
- Você vê de uma olhada quais cartórios estão em qual etapa do processo
- Um clique no nome do cartório leva direto pra ficha completa dele
- Não precisa mais ir até a lista de cartórios pra saber onde cada um está

**Onde encontrar:** abra qualquer quadro em **Tarefas** — se houver cartórios vinculados, eles aparecem em destaque amarelo nas colunas correspondentes.

---

## 📄 Aviso automático de contratos vencendo

**O que mudou:** o sistema agora **monitora seus contratos sozinho** e avisa quando algum está próximo do vencimento ou já venceu.

**Como funciona:**
- Todo dia de manhã (8h), o sistema confere os contratos vigentes
- Se algum estiver dentro do prazo de aviso que você configurou (padrão: 30 dias antes do fim), **os administradores recebem um e-mail + notificação no sininho** do sistema
- Para evitar caixa de e-mail entupida, cada contrato só dispara aviso 1x por semana enquanto continuar na janela
- Quando você renovar ou encerrar o contrato, ele para de avisar automaticamente

**Disparo manual:** se quiser conferir agora sem esperar até amanhã, tem um botão **"Disparar alertas"** no canto superior direito em **Governança → Contratos** (só pra administradores).

**Onde configurar prazo de aviso:** ao cadastrar ou editar um contrato, há o campo *"Avisar quantos dias antes do vencimento?"*

---

## 🔔 Você controla quais e-mails recebe (sem chamar o TI)

**O que mudou:** antes, ligar ou desligar avisos por e-mail dependia de pedir pra alguém mexer no sistema por trás. Agora **tem uma tela dedicada**.

**Onde encontrar:** menu lateral → **Cadastros → Notificações** (só administradores).

**O que dá pra ligar/desligar:**
- Avisos de voto pendente em ata, contrato social ou decisão
- Avisos quando documento de governança é aprovado/rejeitado
- Avisos de pró-labore ou aporte registrados em nome do sócio
- Avisos de distribuição de lucros proposta
- Resumo diário pra administradores (contas vencendo, votações pendentes etc.)
- Aviso quando alguém é atribuído a uma tarefa
- Aviso de tarefas com prazo no dia
- **Aviso de contrato vencendo** (novo)

Você também pode ajustar **quantos dias antes** o sistema começa a avisar de contas a pagar e movimentos de sócios.

**Importante:** as notificações no sininho do sistema continuam ligadas sempre — o que se controla aqui é só o e-mail.

---

## ✅ Correção importante no quadro de tarefas

**O problema:** alguns usuários relataram que, ao mover um card no Kanban e logo em seguida editar (mudar prazo, etiqueta ou responsável), o card parecia "voltar ao estado antigo" depois de 1-2 segundos. Era frustrante e dava medo de salvar errado.

**O que foi feito:** identificamos a causa (uma condição rara de "corrida" entre ações muito rápidas) e corrigimos. Agora qualquer sequência rápida de ações no quadro mantém o estado final correto, sem voltar atrás.

**O que você sente:** confiança total nas mudanças. O que você salvou está salvo.

---

## ⚡ Sistema mais rápido e estável

Fizemos várias melhorias internas que vocês não veem diretamente mas vão sentir:

### Buscas mais leves
Antes, ao digitar no campo de busca de listas (Contratos, Cartórios, Documentos, Inventário, Processos em Andamento), o sistema fazia uma consulta a cada tecla. Agora ele espera você terminar de digitar (350 milésimos de segundo) antes de buscar. Resultado: **menos espera, sistema mais leve**.

### Filtros instantâneos
Os filtros por tipo, status, categoria etc. agora respondem na hora — antes tinham um pequeno atraso desnecessário.

### Estado sempre correto
Em todas as telas, quando você cria/edita/exclui algo várias vezes em sequência rápida, o resultado final na tela é sempre o mais atualizado. Antes, em casos raros, uma resposta mais antiga do servidor podia chegar depois e mostrar dados desatualizados.

**Áreas beneficiadas:** Caixa, Sócios & Lucros, Tarefas, Inventário, Equipes, Pessoas de Acesso, Sócios, Cartórios, Contratos, Documentos da Empresa, Processos em Andamento, Contas a Pagar.

---

## 📋 Como aproveitar tudo isso

1. **Acesse o sistema normalmente** — não precisa instalar nada nem trocar nada do seu lado
2. **Confira seus contratos**: aproveite pra revisar quais têm data fim cadastrada — o sistema agora vai avisar quando se aproximarem do vencimento
3. **Vincule seus cartórios aos quadros** correspondentes — assim você vê tudo agrupado no Kanban
4. **Personalize seus e-mails** em Cadastros → Notificações (admins)

---

## 🤝 Dúvidas?

Se algo parecer estranho ou diferente do esperado, fala com a equipe técnica. Em particular, se aquele bug do "card voltando ao antigo" no Kanban reaparecer, avisa imediatamente — ainda estamos monitorando pra ter certeza de que ficou resolvido.

Boas tarefas! 🚀
