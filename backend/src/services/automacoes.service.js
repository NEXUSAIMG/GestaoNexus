import { query } from '../config/database.js';

/**
 * Sprint 36 — Motor de automação.
 *
 * GATILHO -> CONDIÇÕES -> AÇÕES.
 *
 * Contrato com o resto do sistema: os controllers chamam `dispatch()` e
 * SEGUEM A VIDA. Automação nunca derruba a ação do usuário — se a regra
 * falha, quem falhou foi a regra, não o card que ele acabou de mover.
 * Por isso o dispatch:
 *   - roda fora da transação do controller (pool próprio)
 *   - engole os próprios erros e registra em automacoes_execucoes
 *   - nunca faz `throw` pra cima
 *
 * A guarda de recursão é a peça mais importante deste arquivo. Uma
 * automação que move um card dispara `card_movido`, que pode acionar outra
 * automação que move de volta. Sem limite, isso é um loop infinito no
 * primeiro dia de uso.
 */

const PROFUNDIDADE_MAXIMA = 3;

// ===========================================================================
// Dispatch
// ===========================================================================

/**
 * Dispara as automações de um evento.
 *
 * @param {string} evento  card_criado | card_movido | etiqueta_adicionada |
 *                         checklist_completo | prazo_proximo
 * @param {object} ctx     { quadroId, cardId, pessoaId, colunaId, etiquetaId, profundidade }
 */
export async function dispatch(evento, ctx) {
  const profundidade = ctx.profundidade || 0;
  if (profundidade >= PROFUNDIDADE_MAXIMA) {
    console.warn('[automacao] profundidade máxima atingida — corrente interrompida em ' + evento);
    return { executadas: 0, motivo: 'profundidade-maxima' };
  }

  let regras;
  try {
    const { rows } = await query(
      `SELECT * FROM automacoes
        WHERE quadro_id = $1
          AND ativa = TRUE
          AND gatilho ->> 'tipo' = $2
        ORDER BY criado_em`,
      [ctx.quadroId, evento],
    );
    regras = rows;
  } catch (err) {
    console.error('[automacao] falha ao carregar regras:', err?.message || err);
    return { executadas: 0, erro: true };
  }

  if (regras.length === 0) return { executadas: 0 };

  let executadas = 0;
  for (const regra of regras) {
    try {
      const rodou = await avaliarERodar(regra, { ...ctx, profundidade });
      if (rodou) executadas += 1;
    } catch (err) {
      // Erro de UMA regra não pode impedir as outras de rodar.
      console.error('[automacao] erro na regra ' + regra.nome + ':', err?.message || err);
      await registrar(regra.id, ctx.cardId, 'erro', { mensagem: String(err?.message || err) });
    }
  }
  return { executadas };
}

/**
 * Versão "dispare e esqueça": o controller não espera. Usada nos hooks para
 * não somar latência ao request do usuário.
 */
export function dispararEmBackground(evento, ctx) {
  dispatch(evento, ctx).catch((err) => {
    console.error('[automacao] erro não tratado no dispatch:', err?.message || err);
  });
}

// ===========================================================================
// Avaliação
// ===========================================================================

async function avaliarERodar(regra, ctx) {
  // O gatilho pode ter um filtro embutido (ex.: só quando move pra ESTA coluna).
  const g = regra.gatilho || {};
  if (g.coluna_id && g.coluna_id !== ctx.colunaId) return false;
  if (g.etiqueta_id && g.etiqueta_id !== ctx.etiquetaId) return false;

  const card = await carregarCardParaRegras(ctx.cardId);
  if (!card) return false;

  const reprovada = avaliarCondicoes(regra.condicoes || [], card);
  if (reprovada) {
    // Ignorada NÃO é erro. E é gravada: a pergunta mais comum sobre
    // automação não é "o que ela fez", é "por que ela NÃO fez".
    await registrar(regra.id, ctx.cardId, 'ignorada', { condicao_reprovada: reprovada });
    return false;
  }

  const aplicadas = [];
  for (const acao of (regra.acoes || [])) {
    const r = await executarAcao(acao, card, ctx);
    aplicadas.push({ tipo: acao.tipo, ...r });
  }

  await registrar(regra.id, ctx.cardId, 'ok', { acoes: aplicadas });
  return true;
}

/** Devolve a primeira condição REPROVADA, ou null se todas passaram (AND). */
export function avaliarCondicoes(condicoes, card) {
  for (const c of condicoes) {
    const atual = valorDoCampo(c.campo, card);
    if (!comparar(atual, c.op, c.valor)) return c;
  }
  return null;
}

function valorDoCampo(campo, card) {
  switch (campo) {
    case 'prioridade': return Number(card.prioridade ?? 2);
    case 'tem_responsavel': return (card.responsavel_ids || []).length > 0;
    case 'tem_prazo': return !!card.data_prazo;
    case 'prazo_vencido':
      return !!card.data_prazo && new Date(String(card.data_prazo).slice(0, 10) + 'T23:59:59') < new Date();
    case 'tem_etiqueta': return (card.etiqueta_ids || []);
    case 'estimativa_horas': return card.estimativa_horas != null ? Number(card.estimativa_horas) : null;
    case 'titulo': return String(card.titulo || '');
    case 'bloqueado': return Number(card.n_bloqueadores || 0) > 0;
    case 'checklist_completo':
      return Number(card.n_chk_total || 0) > 0
        && Number(card.n_chk_total) === Number(card.n_chk_ok);
    default: return null;
  }
}

function comparar(atual, op, esperado) {
  switch (op) {
    case '=': return String(atual) === String(esperado);
    case '!=': return String(atual) !== String(esperado);
    case '<': return Number(atual) < Number(esperado);
    case '<=': return Number(atual) <= Number(esperado);
    case '>': return Number(atual) > Number(esperado);
    case '>=': return Number(atual) >= Number(esperado);
    case 'contem':
      if (Array.isArray(atual)) return atual.includes(esperado);
      return String(atual).toLowerCase().includes(String(esperado).toLowerCase());
    case 'nao_contem':
      if (Array.isArray(atual)) return !atual.includes(esperado);
      return !String(atual).toLowerCase().includes(String(esperado).toLowerCase());
    case 'verdadeiro': return atual === true;
    case 'falso': return atual === false;
    default: return false;
  }
}

async function carregarCardParaRegras(cardId) {
  if (!cardId) return null;
  const { rows } = await query(
    `SELECT c.*,
            COALESCE((SELECT json_agg(ce.etiqueta_id) FROM cards_etiquetas ce
                       WHERE ce.card_id = c.id), '[]'::json) AS etiqueta_ids,
            COALESCE((SELECT json_agg(cr.pessoa_id) FROM cards_responsaveis cr
                       WHERE cr.card_id = c.id), '[]'::json) AS responsavel_ids,
            (SELECT COUNT(*)::int FROM card_checklist_itens i WHERE i.card_id = c.id) AS n_chk_total,
            (SELECT COUNT(*)::int FROM card_checklist_itens i WHERE i.card_id = c.id AND i.concluido) AS n_chk_ok,
            (SELECT COUNT(*)::int FROM cards_dependencias d
               JOIN cards b ON b.id = d.depende_de_id
               JOIN colunas bc ON bc.id = b.coluna_id
              WHERE d.card_id = c.id AND bc.tipo <> 'concluida'
                AND b.arquivado_em IS NULL) AS n_bloqueadores
       FROM cards c
      WHERE c.id = $1 AND c.arquivado_em IS NULL`,
    [cardId],
  );
  return rows[0] || null;
}

async function registrar(automacaoId, cardId, status, detalhe) {
  try {
    await query(
      `INSERT INTO automacoes_execucoes (automacao_id, card_id, status, detalhe)
       VALUES ($1, $2, $3, $4::jsonb)`,
      [automacaoId, cardId || null, status, JSON.stringify(detalhe || {})],
    );
  } catch (err) {
    console.error('[automacao] falha ao registrar execução:', err?.message || err);
  }
}

// ===========================================================================
// Ações
// ===========================================================================

/**
 * Interpola {{titulo}}, {{prazo}}, {{prioridade}} num texto.
 * Deliberadamente burro: nada de eval, nada de acesso arbitrário a campo.
 */
function interpolar(texto, card) {
  return String(texto || '')
    .replaceAll('{{titulo}}', card.titulo || '')
    .replaceAll('{{prazo}}', card.data_prazo ? String(card.data_prazo).slice(0, 10) : 'sem prazo')
    .replaceAll('{{prioridade}}', 'P' + Number(card.prioridade ?? 2));
}

async function executarAcao(acao, card, ctx) {
  switch (acao.tipo) {
    // -----------------------------------------------------------------------
    case 'mover_coluna': {
      // Confere que a coluna é do mesmo quadro — regra mal configurada não
      // pode teleportar card entre quadros.
      const { rows } = await query(
        `SELECT id, tipo FROM colunas
          WHERE id = $1 AND quadro_id = $2 AND arquivada_em IS NULL`,
        [acao.coluna_id, card.quadro_id],
      );
      if (!rows[0]) return { ok: false, motivo: 'coluna-invalida' };

      const { rows: max } = await query(
        `SELECT COALESCE(MAX(ordem), 0) + 1000 AS prox
           FROM cards WHERE coluna_id = $1 AND arquivado_em IS NULL`,
        [acao.coluna_id],
      );

      const concluida = rows[0].tipo === 'concluida';
      const sets = ['coluna_id = $1', 'ordem = $2', 'coluna_desde = NOW()'];
      sets.push(concluida
        ? 'concluido_em = COALESCE(concluido_em, NOW())'
        : 'concluido_em = NULL');
      if (rows[0].tipo !== 'backlog') sets.push('iniciado_em = COALESCE(iniciado_em, NOW())');

      await query(
        'UPDATE cards SET ' + sets.join(', ') + ' WHERE id = $3',
        [acao.coluna_id, max[0].prox, card.id],
      );

      await query(
        `INSERT INTO cards_movimentos
           (card_id, quadro_id, de_coluna_id, para_coluna_id, de_tipo, para_tipo, pessoa_id)
         VALUES ($1, $2, $3, $4,
                 (SELECT tipo FROM colunas WHERE id = $3), $5, NULL)`,
        [card.id, card.quadro_id, card.coluna_id, acao.coluna_id, rows[0].tipo],
      );

      // Encadeia: mover pode acionar outras regras. A profundidade cresce.
      await dispatch('card_movido', {
        quadroId: card.quadro_id,
        cardId: card.id,
        colunaId: acao.coluna_id,
        profundidade: (ctx.profundidade || 0) + 1,
      });

      return { ok: true, coluna_id: acao.coluna_id };
    }

    // -----------------------------------------------------------------------
    case 'atribuir': {
      const ids = [...new Set(acao.pessoa_ids || [])];
      if (ids.length === 0) return { ok: false, motivo: 'sem-pessoas' };
      const { rows: ativas } = await query(
        'SELECT id FROM pessoas_acesso WHERE id = ANY($1::uuid[]) AND ativo = TRUE',
        [ids],
      );
      if (ativas.length === 0) return { ok: false, motivo: 'pessoas-inativas' };

      if (acao.substituir) {
        await query('DELETE FROM cards_responsaveis WHERE card_id = $1', [card.id]);
      }
      for (let i = 0; i < ativas.length; i += 1) {
        await query(
          `INSERT INTO cards_responsaveis (card_id, pessoa_id, ordem)
           VALUES ($1, $2, $3) ON CONFLICT (card_id, pessoa_id) DO NOTHING`,
          [card.id, ativas[i].id, i],
        );
      }
      return { ok: true, pessoas: ativas.length };
    }

    // -----------------------------------------------------------------------
    case 'adicionar_etiqueta':
      await query(
        `INSERT INTO cards_etiquetas (card_id, etiqueta_id)
         SELECT $1, $2
          WHERE EXISTS (SELECT 1 FROM quadros_etiquetas
                         WHERE id = $2 AND quadro_id = $3)
         ON CONFLICT DO NOTHING`,
        [card.id, acao.etiqueta_id, card.quadro_id],
      );
      return { ok: true };

    case 'remover_etiqueta':
      await query(
        'DELETE FROM cards_etiquetas WHERE card_id = $1 AND etiqueta_id = $2',
        [card.id, acao.etiqueta_id],
      );
      return { ok: true };

    // -----------------------------------------------------------------------
    case 'definir_prioridade':
      await query(
        'UPDATE cards SET prioridade = $1 WHERE id = $2',
        [Math.min(3, Math.max(0, Number(acao.prioridade))), card.id],
      );
      return { ok: true, prioridade: acao.prioridade };

    case 'definir_prazo': {
      // Prazo relativo a hoje. Resolvido em JS — nada de aritmética de data
      // condicional no SQL.
      const dias = Number(acao.dias || 0);
      const d = new Date();
      d.setDate(d.getDate() + dias);
      const iso = d.toISOString().slice(0, 10);
      await query('UPDATE cards SET data_prazo = $1 WHERE id = $2', [iso, card.id]);
      return { ok: true, data_prazo: iso };
    }

    // -----------------------------------------------------------------------
    case 'comentar':
      await query(
        `INSERT INTO card_comentarios (card_id, pessoa_id, texto)
         VALUES ($1, NULL, $2)`,
        [card.id, interpolar(acao.texto, card)],
      );
      return { ok: true };

    case 'criar_checklist': {
      const { rows } = await query(
        `INSERT INTO card_checklists (card_id, titulo) VALUES ($1, $2) RETURNING id`,
        [card.id, acao.titulo || 'Checklist'],
      );
      const itens = acao.itens || [];
      for (let i = 0; i < itens.length; i += 1) {
        await query(
          `INSERT INTO card_checklist_itens (checklist_id, card_id, texto, ordem)
           VALUES ($1, $2, $3, $4)`,
          [rows[0].id, card.id, itens[i], i],
        );
      }
      return { ok: true, itens: itens.length };
    }

    // -----------------------------------------------------------------------
    case 'criar_card': {
      const { rows: col } = await query(
        `SELECT id, quadro_id, tipo FROM colunas
          WHERE id = $1 AND arquivada_em IS NULL`,
        [acao.coluna_id],
      );
      if (!col[0]) return { ok: false, motivo: 'coluna-invalida' };

      const { rows: max } = await query(
        `SELECT COALESCE(MAX(ordem), 0) + 1000 AS prox
           FROM cards WHERE coluna_id = $1 AND arquivado_em IS NULL`,
        [acao.coluna_id],
      );
      const { rows: novo } = await query(
        `INSERT INTO cards (coluna_id, quadro_id, titulo, descricao, ordem, coluna_desde)
         VALUES ($1, $2, $3, $4, $5, NOW()) RETURNING id`,
        [
          acao.coluna_id, col[0].quadro_id,
          interpolar(acao.titulo || 'Novo card', card),
          acao.descricao ? interpolar(acao.descricao, card) : null,
          max[0].prox,
        ],
      );
      return { ok: true, card_id: novo[0].id };
    }

    // -----------------------------------------------------------------------
    // A ação cross-módulo. É isso que o Butler nunca vai fazer: fechar o
    // card e a conta a pagar daquele trabalho nascer sozinha, já categorizada.
    case 'criar_conta_pagar': {
      const valor = Number(acao.valor);
      if (!Number.isFinite(valor) || valor <= 0) {
        return { ok: false, motivo: 'valor-invalido' };
      }
      const dias = Number(acao.dias_vencimento ?? 30);
      const venc = new Date();
      venc.setDate(venc.getDate() + dias);

      const { rows } = await query(
        `INSERT INTO contas_pagar
           (descricao, valor, data_vencimento, categoria_id, fornecedor_nome, observacoes)
         VALUES ($1, $2, $3, $4, $5, $6)
         RETURNING id`,
        [
          interpolar(acao.descricao || '{{titulo}}', card),
          valor,
          venc.toISOString().slice(0, 10),
          acao.categoria_id || null,
          acao.fornecedor_nome || null,
          'Gerada automaticamente pelo card "' + card.titulo + '".',
        ],
      );

      // Vincula a conta ao card — o rastro dos dois lados.
      await query(
        `INSERT INTO cards_vinculos (card_id, tipo, alvo_id)
         VALUES ($1, 'conta_pagar', $2)
         ON CONFLICT (card_id, tipo, alvo_id) DO NOTHING`,
        [card.id, rows[0].id],
      );

      return { ok: true, conta_pagar_id: rows[0].id, valor };
    }

    // -----------------------------------------------------------------------
    default:
      return { ok: false, motivo: 'acao-desconhecida: ' + acao.tipo };
  }
}

// ===========================================================================
// Gatilhos temporais (rodam no cron, não em resposta a um clique)
// ===========================================================================

/**
 * Gatilho `prazo_proximo`: para cada regra, varre os cards do quadro cujo
 * prazo cai em exatamente N dias (padrão: 1 = amanhã).
 *
 * "Exatamente N" e não "≤ N" de propósito: se fosse ≤, a regra dispararia
 * de novo todo dia até o prazo chegar, e o card viraria um metralhadora de
 * comentários. Aqui ela dispara uma vez, no dia certo.
 */
export async function rodarGatilhosDePrazo() {
  const { rows: regras } = await query(
    `SELECT * FROM automacoes
      WHERE ativa = TRUE AND gatilho ->> 'tipo' = 'prazo_proximo'`,
  );

  let total = 0;
  for (const regra of regras) {
    const dias = Number(regra.gatilho?.dias ?? 1);
    try {
      const { rows: cards } = await query(
        `SELECT c.id FROM cards c
          WHERE c.quadro_id = $1
            AND c.arquivado_em IS NULL
            AND c.prazo_concluido = FALSE
            AND c.data_prazo = (CURRENT_DATE + ($2 || ' days')::interval)::date`,
        [regra.quadro_id, String(dias)],
      );
      for (const c of cards) {
        await dispatch('prazo_proximo', {
          quadroId: regra.quadro_id,
          cardId: c.id,
          profundidade: 0,
        });
        total += 1;
      }
    } catch (err) {
      console.error('[automacao] erro no gatilho de prazo:', err?.message || err);
    }
  }
  return { regras: regras.length, cards: total };
}

/**
 * Gatilho `agendada`: regras com expressão cron própria.
 *
 * Simplificação consciente: em vez de registrar um cron por regra (que exigiria
 * recarregar o scheduler a cada CRUD), o job diário verifica quais regras
 * "venceram" hoje. Cobre o caso real — "toda segunda", "todo dia 1º" — sem a
 * complexidade de um agendador dinâmico. Granularidade de hora fica pra depois,
 * se alguém pedir.
 */
export async function rodarAutomacoesAgendadas() {
  const { rows: regras } = await query(
    `SELECT * FROM automacoes
      WHERE ativa = TRUE AND gatilho ->> 'tipo' = 'agendada'`,
  );

  let total = 0;
  for (const regra of regras) {
    try {
      // Aplica as ações a TODOS os cards que passam nas condições.
      const { rows: cards } = await query(
        `SELECT c.id FROM cards c
          WHERE c.quadro_id = $1 AND c.arquivado_em IS NULL
          LIMIT 500`,
        [regra.quadro_id],
      );
      for (const c of cards) {
        await dispatch('agendada', {
          quadroId: regra.quadro_id,
          cardId: c.id,
          profundidade: 0,
        });
        total += 1;
      }
    } catch (err) {
      console.error('[automacao] erro em regra agendada:', err?.message || err);
    }
  }
  return { regras: regras.length, cards: total };
}
