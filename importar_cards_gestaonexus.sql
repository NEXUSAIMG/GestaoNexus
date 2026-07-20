-- =====================================================================
-- GestaoNexus — Importação do backlog "cards_gestaonexus" (27 cards)
-- Alvo: quadro "Atividades Estagiários", coluna "A fazer" (backlog)
-- Idempotente: rodar mais de uma vez NÃO duplica (checa por título no quadro).
-- Mapeamento de prioridade: Urgente=0(Crítica) Alta=1 Média=2(Normal) Baixa=3
-- Etiquetas por tipo (cria se faltar): Bug=orange, Melhoria=emerald, Roadmap=violet, Urgente=red
-- Gerado automaticamente. Revise antes de rodar em produção.
-- =====================================================================
DO $$
DECLARE
  v_nome_quadro text := 'Atividades Estagiários';
  v_quadro  uuid;
  v_coluna  uuid;
  v_criador uuid;
  v_base    int;
  r         record;
  v_card    uuid;
  v_etq     uuid;
  v_ins     int := 0;
  v_skip    int := 0;
BEGIN
  -- 1) Resolver o quadro pelo nome (não arquivado)
  SELECT id, criado_por_id INTO v_quadro, v_criador
  FROM quadros
  WHERE nome = v_nome_quadro AND arquivado_em IS NULL
  ORDER BY criado_em LIMIT 1;
  IF v_quadro IS NULL THEN
    RAISE EXCEPTION 'Quadro "%" não encontrado (verifique o nome exato).', v_nome_quadro;
  END IF;

  -- 2) Resolver a coluna "A fazer" (tipo backlog); fallback por nome
  SELECT id INTO v_coluna FROM colunas
  WHERE quadro_id = v_quadro AND arquivada_em IS NULL AND tipo = 'backlog'
  ORDER BY ordem LIMIT 1;
  IF v_coluna IS NULL THEN
    SELECT id INTO v_coluna FROM colunas
    WHERE quadro_id = v_quadro AND arquivada_em IS NULL AND nome ILIKE 'A fazer'
    ORDER BY ordem LIMIT 1;
  END IF;
  IF v_coluna IS NULL THEN
    RAISE EXCEPTION 'Coluna "A fazer"/backlog não encontrada no quadro "%".', v_nome_quadro;
  END IF;

  -- 3) Garantir etiquetas por tipo (cria as que faltarem)
  FOR r IN SELECT * FROM (VALUES
    ('Bug', 'orange'),
    ('Melhoria', 'emerald'),
    ('Roadmap', 'violet'),
    ('Urgente', 'red')
  ) AS e(nome, cor) LOOP
    IF NOT EXISTS (SELECT 1 FROM quadros_etiquetas WHERE quadro_id = v_quadro AND nome = r.nome) THEN
      INSERT INTO quadros_etiquetas (quadro_id, nome, cor, ordem)
      VALUES (v_quadro, r.nome, r.cor,
              COALESCE((SELECT MAX(ordem) FROM quadros_etiquetas WHERE quadro_id = v_quadro),0)+1);
    END IF;
  END LOOP;

  -- base de ordenação: depois do que já existe na coluna
  SELECT COALESCE(MAX(ordem),0) INTO v_base FROM cards WHERE coluna_id = v_coluna;

  -- 4) Inserir os 27 cards (idempotente por título dentro do quadro)
  FOR r IN SELECT * FROM (VALUES
    (1, 1, 'Ajustar formatação do app no celular', 'Categoria: Plataforma · Cliente: Plataforma\n(importado do backlog GestaoNexus — card #1)', 0, 5, 'Urgente'),
    (2, 2, 'Remover última mensagem de avaliação', 'Categoria: Bot · Cliente: 1º Tab. Jaraguá\n(importado do backlog GestaoNexus — card #2)', 0, 1, 'Urgente'),
    (3, 5, 'Conversa de escritura na fila errada (privacidade)', 'Categoria: Correção · Cliente: Correção\n(importado do backlog GestaoNexus — card #5)', 1, 8, 'Bug'),
    (4, 3, 'Transbordo não respeita etiqueta', 'Categoria: Bot · Cliente: 1º Tab. Jaraguá\n(importado do backlog GestaoNexus — card #3)', 1, 6, 'Bug'),
    (5, 4, 'Mídia sem texto está transbordando', 'Categoria: Bot · Cliente: 1º Tab. Jaraguá\n(importado do backlog GestaoNexus — card #4)', 1, 5, 'Bug'),
    (6, 6, 'Checklist incompleto', 'Categoria: Bot · Cliente: 5º Tab. Belém\n(importado do backlog GestaoNexus — card #6)', 1, 4, 'Bug'),
    (7, 7, 'Ligação duplicada no registro', 'Categoria: Plataforma · Cliente: 5º Tab. Belém\n(importado do backlog GestaoNexus — card #7)', 1, 5, 'Bug'),
    (8, 8, 'Importação de contatos rejeita acentos', 'Categoria: Correção · Cliente: Correção\n(importado do backlog GestaoNexus — card #8)', 1, 3, 'Bug'),
    (9, 9, 'Atrito na transferência entre atendentes', 'Categoria: Plataforma · Cliente: Plataforma\n(importado do backlog GestaoNexus — card #9)', 1, 8, 'Bug'),
    (10, 10, 'Mensagem automática de documento divergente', 'Categoria: Bot · Cliente: Plataforma\n(importado do backlog GestaoNexus — card #10)', 2, 1, 'Melhoria'),
    (11, 11, 'Direcionar ao atendente solicitado', 'Categoria: Bot · Cliente: 1º Tab. Jaraguá\n(importado do backlog GestaoNexus — card #11)', 2, 6, 'Melhoria'),
    (12, 12, 'Etiquetas para contatos especiais', 'Categoria: Plataforma · Cliente: 1º Tab. Jaraguá\n(importado do backlog GestaoNexus — card #12)', 2, 8, 'Melhoria'),
    (13, 13, 'Melhorar visualização do histórico', 'Categoria: Plataforma · Cliente: 1º Tab. Jaraguá\n(importado do backlog GestaoNexus — card #13)', 2, 6, 'Melhoria'),
    (14, 14, 'Reabrir atendimento encerrado', 'Categoria: Plataforma · Cliente: 1º Tab. Jaraguá\n(importado do backlog GestaoNexus — card #14)', 2, 6, 'Melhoria'),
    (15, 15, 'Formatação da pesquisa de satisfação (Forms)', 'Categoria: Plataforma · Cliente: 5º Tab. Belém\n(importado do backlog GestaoNexus — card #15)', 2, 3, 'Melhoria'),
    (16, 16, 'Sinalizar áudio na transcrição', 'Categoria: Plataforma · Cliente: Plataforma\n(importado do backlog GestaoNexus — card #16)', 2, 3, 'Melhoria'),
    (17, 17, 'Enviar checklist em PDF automaticamente', 'Categoria: Bot · Cliente: Plataforma\n(importado do backlog GestaoNexus — card #17)', 2, 8, 'Melhoria'),
    (18, 18, 'Alertas de novas mensagens', 'Categoria: Plataforma · Cliente: Plataforma\n(importado do backlog GestaoNexus — card #18)', 2, 6, 'Melhoria'),
    (19, 19, 'Ações rápidas na ficha do contato', 'Categoria: Plataforma · Cliente: Plataforma\n(importado do backlog GestaoNexus — card #19)', 2, 3, 'Melhoria'),
    (20, 20, 'Validar e-mails dos operadores', 'Categoria: Segurança · Cliente: Plataforma\n(importado do backlog GestaoNexus — card #20)', 2, 4, 'Melhoria'),
    (21, 21, 'Player de áudio + transcrição', 'Categoria: Plataforma · Cliente: Plataforma\n(importado do backlog GestaoNexus — card #21)', 3, 12, 'Roadmap'),
    (22, 22, 'Respostas em grupos do WhatsApp', 'Categoria: Plataforma · Cliente: Plataforma\n(importado do backlog GestaoNexus — card #22)', 3, 20, 'Roadmap'),
    (23, 23, 'Transferência silenciosa entre atendentes', 'Categoria: Plataforma · Cliente: Plataforma\n(importado do backlog GestaoNexus — card #23)', 3, 10, 'Roadmap'),
    (24, 24, 'Chat interno entre operadores', 'Categoria: Plataforma · Cliente: Plataforma\n(importado do backlog GestaoNexus — card #24)', 3, 24, 'Roadmap'),
    (25, 25, 'Agenda estilo Google Agenda', 'Categoria: Agenda · Cliente: Plataforma\n(importado do backlog GestaoNexus — card #25)', 3, 40, 'Roadmap'),
    (26, 26, 'Vincular atendente ao agendamento', 'Categoria: Agenda · Cliente: Plataforma\n(importado do backlog GestaoNexus — card #26)', 3, 8, 'Roadmap'),
    (27, 27, 'Lembretes personalizados na agenda', 'Categoria: Agenda · Cliente: Plataforma\n(importado do backlog GestaoNexus — card #27)', 3, 10, 'Roadmap')
  ) AS c(seq, num, titulo, descricao, prioridade, estimativa, tipo) LOOP
    IF EXISTS (SELECT 1 FROM cards
               WHERE quadro_id = v_quadro AND arquivado_em IS NULL AND titulo = r.titulo) THEN
      v_skip := v_skip + 1;
      CONTINUE;
    END IF;
    INSERT INTO cards (coluna_id, quadro_id, titulo, descricao, ordem,
                       prioridade, estimativa_horas, criado_por_id)
    VALUES (v_coluna, v_quadro, r.titulo, r.descricao, v_base + r.seq*10,
            r.prioridade, r.estimativa, v_criador)
    RETURNING id INTO v_card;
    v_ins := v_ins + 1;

    -- vincular etiqueta do tipo
    SELECT id INTO v_etq FROM quadros_etiquetas WHERE quadro_id = v_quadro AND nome = r.tipo LIMIT 1;
    IF v_etq IS NOT NULL THEN
      INSERT INTO cards_etiquetas (card_id, etiqueta_id)
      VALUES (v_card, v_etq) ON CONFLICT DO NOTHING;
    END IF;
  END LOOP;

  RAISE NOTICE 'Importação concluída: % inseridos, % já existentes (pulados).', v_ins, v_skip;
END $$;
