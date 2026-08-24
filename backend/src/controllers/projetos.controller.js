import { z } from 'zod';
import { query, pool } from '../config/database.js';
import { NaoEncontradoError, AppError, NaoAutorizadoError } from '../utils/errors.js';
import { registrarAcao } from '../utils/audit.js';
import { podeVerQuadro } from './quadros.controller.js';

/**
 * Sprint 34 — Projetos: fundacao.
 *
 * Concentra as capacidades novas do modulo de projetos:
 *   - Campos personalizados por quadro (CRUD + valor por card)
 *   - Dependencias entre cards (com deteccao de ciclo)
 *   - Subtarefas (hierarquia de cards)
 *   - Vinculos de negocio (cartorio, contrato, processo, produto, conta)
 *   - Apontamento de horas (timer + lancamento manual)
 *
 * Padroes seguidos:
 *   - Permissao sempre via podeVerQuadro (nunca confia no client)
 *   - SQL dinamico montado por CONCATENACAO, nunca por template literal
 *     (bug conhecido de corrupcao em edicao de arquivo)
 *   - Condicionais resolvidos em JS antes da query (nunca CASE WHEN com uuid)
 */

// ===========================================================================
// Helpers compartilhados
// ===========================================================================

/**
 * Carrega o card e confere permissao no quadro dele.
 * `nivel` = 'ver' | 'editar'.
 */
async function carregarCard(pessoa, cardId, nivel = 'ver') {
  const { rows } = await query(
    'SELECT id, quadro_id, coluna_id, titulo, card_pai_id FROM cards WHERE id = $1',
    [cardId],
  );
  if (!rows[0]) throw new NaoEncontradoError('Card nao encontrado');

  const isAdmin = !!pessoa?.administrador;
  const perm = await podeVerQuadro(pessoa.id, isAdmin, rows[0].quadro_id);
  if (!perm.pode) throw new NaoAutorizadoError('Sem acesso a este quadro.');
  if (nivel === 'editar' && !perm.podeEditar) {
    throw new NaoAutorizadoError('Sem permissao para editar este quadro.');
  }
  return rows[0];
}

async function exigirQuadro(pessoa, quadroId, nivel = 'ver') {
  const isAdmin = !!pessoa?.administrador;
  const perm = await podeVerQuadro(pessoa.id, isAdmin, quadroId);
  if (!perm.pode) throw new NaoAutorizadoError('Sem acesso a este quadro.');
  if (nivel === 'editar' && !perm.podeEditar) {
    throw new NaoAutorizadoError('Sem permissao para editar este quadro.');
  }
  return perm;
}

// ===========================================================================
// 1. Campos personalizados do quadro
// ===========================================================================

const TIPOS_CAMPO = [
  'texto', 'numero', 'moeda', 'data', 'selecao', 'checkbox', 'pessoa', 'url',
];

const campoSchema = z.object({
  nome: z.string().min(1).max(60),
  tipo: z.enum(TIPOS_CAMPO),
  opcoes: z.array(z.string().min(1).max(60)).max(30).optional().nullable(),
  mostrar_no_card: z.boolean().optional().default(false),
  ordem: z.number().int().min(0).optional(),
});

const campoAtualizarSchema = campoSchema.partial();

/** GET /api/quadros/:id/campos */
export async function listarCampos(req, res, next) {
  try {
    await exigirQuadro(req.pessoa, req.params.id, 'ver');
    const { rows } = await query(
      `SELECT id, nome, tipo, opcoes, mostrar_no_card, ordem
         FROM quadros_campos
        WHERE quadro_id = $1
        ORDER BY ordem, nome`,
      [req.params.id],
    );
    res.json(rows);
  } catch (err) { next(err); }
}

/** POST /api/quadros/:id/campos */
export async function criarCampo(req, res, next) {
  try {
    await exigirQuadro(req.pessoa, req.params.id, 'editar');
    const d = campoSchema.parse(req.body);

    if (d.tipo === 'selecao' && (!d.opcoes || d.opcoes.length === 0)) {
      throw new AppError('Campo do tipo "selecao" precisa de pelo menos uma opcao.', 400);
    }

    // Ordem: se nao vier, vai pro fim.
    let ordem = d.ordem;
    if (ordem === undefined) {
      const { rows: m } = await query(
        'SELECT COALESCE(MAX(ordem), -1) + 1 AS prox FROM quadros_campos WHERE quadro_id = $1',
        [req.params.id],
      );
      ordem = m[0].prox;
    }

    const opcoes = d.tipo === 'selecao' ? JSON.stringify(d.opcoes) : null;

    const { rows } = await query(
      `INSERT INTO quadros_campos (quadro_id, nome, tipo, opcoes, mostrar_no_card, ordem)
       VALUES ($1, $2, $3, $4::jsonb, $5, $6)
       RETURNING id, nome, tipo, opcoes, mostrar_no_card, ordem`,
      [req.params.id, d.nome.trim(), d.tipo, opcoes, d.mostrar_no_card ?? false, ordem],
    );

    registrarAcao({
      acao: 'quadro.campo_criou',
      pessoa_acesso_id: req.pessoa.id,
      detalhes: { quadro_id: req.params.id, campo_id: rows[0].id, tipo: d.tipo },
      req,
    });

    res.status(201).json(rows[0]);
  } catch (err) {
    if (err?.code === '23505') {
      return next(new AppError('Ja existe um campo com esse nome neste quadro.', 400));
    }
    next(err);
  }
}

/** PUT /api/quadros/:id/campos/:campoId */
export async function atualizarCampo(req, res, next) {
  try {
    await exigirQuadro(req.pessoa, req.params.id, 'editar');
    const d = campoAtualizarSchema.parse(req.body);

    const atual = await query(
      'SELECT id, tipo FROM quadros_campos WHERE id = $1 AND quadro_id = $2',
      [req.params.campoId, req.params.id],
    );
    if (!atual.rows[0]) throw new NaoEncontradoError('Campo nao encontrado');

    // Trocar o TIPO invalidaria os valores ja gravados. Bloqueado de proposito:
    // a UI oferece "excluir e recriar", que deixa a perda de dado explicita.
    if (d.tipo !== undefined && d.tipo !== atual.rows[0].tipo) {
      throw new AppError(
        'Nao e possivel trocar o tipo de um campo existente. Exclua e recrie.', 400,
      );
    }

    // Tirar uma opcao que cards ja usam deixaria o valor gravado orfao: ele
    // continua no banco, some do <select> (que so lista as opcoes atuais) e a
    // primeira edicao do card o apaga em silencio. Preferimos recusar e dizer
    // quantos cards dependem da opcao — mesma logica de nao deixar trocar o
    // tipo de um campo em uso.
    if (d.opcoes !== undefined && atual.rows[0].tipo === 'selecao') {
      const novas = Array.isArray(d.opcoes) ? d.opcoes : [];
      const { rows: emUso } = await query(
        `SELECT v.valor #>> '{}' AS valor, COUNT(*)::int AS n
           FROM cards_campos_valores v
          WHERE v.campo_id = $1 AND v.valor IS NOT NULL
          GROUP BY 1`,
        [req.params.campoId],
      );
      const perdidas = emUso.filter((u) => u.valor != null && !novas.includes(u.valor));
      if (perdidas.length > 0) {
        const err = new AppError(
          'Estas opcoes estao em uso e nao podem ser removidas: '
          + perdidas.map((p) => `"${p.valor}" (${p.n} card${p.n === 1 ? '' : 's'})`).join(', ')
          + '. Troque o valor nesses cards antes.',
          409,
          'opcao_em_uso',
        );
        err.detalhes = { opcoes_em_uso: perdidas };
        throw err;
      }
    }

    const updates = [];
    const params = [];
    if (d.nome !== undefined) {
      params.push(d.nome.trim());
      updates.push('nome = $' + params.length);
    }
    if (d.opcoes !== undefined) {
      params.push(d.opcoes ? JSON.stringify(d.opcoes) : null);
      updates.push('opcoes = $' + params.length + '::jsonb');
    }
    if (d.mostrar_no_card !== undefined) {
      params.push(d.mostrar_no_card);
      updates.push('mostrar_no_card = $' + params.length);
    }
    if (d.ordem !== undefined) {
      params.push(d.ordem);
      updates.push('ordem = $' + params.length);
    }
    if (updates.length === 0) return res.json({ ok: true });

    params.push(req.params.campoId);
    const { rows } = await query(
      'UPDATE quadros_campos SET ' + updates.join(', ')
      + ' WHERE id = $' + params.length
      + ' RETURNING id, nome, tipo, opcoes, mostrar_no_card, ordem',
      params,
    );
    res.json(rows[0]);
  } catch (err) {
    if (err?.code === '23505') {
      return next(new AppError('Ja existe um campo com esse nome neste quadro.', 400));
    }
    next(err);
  }
}

/** DELETE /api/quadros/:id/campos/:campoId — apaga o campo e todos os valores. */
export async function excluirCampo(req, res, next) {
  try {
    await exigirQuadro(req.pessoa, req.params.id, 'editar');
    const { rowCount } = await query(
      'DELETE FROM quadros_campos WHERE id = $1 AND quadro_id = $2',
      [req.params.campoId, req.params.id],
    );
    if (rowCount === 0) throw new NaoEncontradoError('Campo nao encontrado');

    registrarAcao({
      acao: 'quadro.campo_excluiu',
      pessoa_acesso_id: req.pessoa.id,
      detalhes: { quadro_id: req.params.id, campo_id: req.params.campoId },
      req,
    });
    res.status(204).send();
  } catch (err) { next(err); }
}

// ---------------------------------------------------------------------------
// Valor do campo personalizado no card
// ---------------------------------------------------------------------------

/**
 * Valida e normaliza o valor conforme o TIPO do campo. Devolve o valor
 * pronto pra gravar em jsonb (ou null pra limpar).
 */
function normalizarValorCampo(campo, valor) {
  if (valor === null || valor === undefined || valor === '') return null;

  switch (campo.tipo) {
    case 'texto':
      return z.string().max(500).parse(valor);
    case 'url':
      return z.string().url().max(500).parse(valor);
    case 'numero':
    case 'moeda': {
      const n = typeof valor === 'string' ? Number(valor.replace(',', '.')) : valor;
      return z.number().finite().parse(n);
    }
    case 'data':
      return z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Use YYYY-MM-DD').parse(valor);
    case 'checkbox':
      return z.boolean().parse(valor);
    case 'pessoa':
      return z.string().uuid().parse(valor);
    case 'selecao': {
      const v = z.string().parse(valor);
      const opcoes = Array.isArray(campo.opcoes) ? campo.opcoes : [];
      if (!opcoes.includes(v)) {
        throw new AppError('Valor fora das opcoes do campo "' + campo.nome + '".', 400);
      }
      return v;
    }
    default:
      throw new AppError('Tipo de campo desconhecido.', 400);
  }
}

/** PUT /api/cards/:id/campos/:campoId — upsert do valor (body: { valor }) */
export async function definirValorCampo(req, res, next) {
  try {
    const card = await carregarCard(req.pessoa, req.params.id, 'editar');

    const cR = await query(
      'SELECT id, quadro_id, nome, tipo, opcoes FROM quadros_campos WHERE id = $1',
      [req.params.campoId],
    );
    const campo = cR.rows[0];
    if (!campo) throw new NaoEncontradoError('Campo nao encontrado');
    if (campo.quadro_id !== card.quadro_id) {
      throw new AppError('Este campo nao pertence ao quadro do card.', 400);
    }

    const valor = normalizarValorCampo(campo, req.body?.valor);

    // Pessoa referenciada precisa estar ativa
    if (campo.tipo === 'pessoa' && valor) {
      const p = await query(
        'SELECT id FROM pessoas_acesso WHERE id = $1 AND ativo = TRUE', [valor],
      );
      if (!p.rows[0]) throw new AppError('Pessoa inativa ou inexistente.', 400);
    }

    if (valor === null) {
      await query(
        'DELETE FROM cards_campos_valores WHERE card_id = $1 AND campo_id = $2',
        [req.params.id, req.params.campoId],
      );
      return res.json({ ok: true, valor: null });
    }

    await query(
      `INSERT INTO cards_campos_valores (card_id, campo_id, valor, atualizado_em)
       VALUES ($1, $2, $3::jsonb, NOW())
       ON CONFLICT (card_id, campo_id)
       DO UPDATE SET valor = EXCLUDED.valor, atualizado_em = NOW()`,
      [req.params.id, req.params.campoId, JSON.stringify(valor)],
    );

    res.json({ ok: true, valor });
  } catch (err) { next(err); }
}

// ===========================================================================
// 2. Dependencias entre cards
// ===========================================================================
//
// Semantica: card_id esta BLOQUEADO POR depende_de_id.
// "Card A depende de B" => A so deveria andar depois que B concluir.

/**
 * Um card e considerado CONCLUIDO quando esta numa coluna do tipo
 * 'concluida' (ou foi arquivado). Isso e o que libera os dependentes.
 *
 * Devolve a lista de bloqueadores AINDA ABERTOS de um card.
 * Exportado porque cards.controller usa isso no gate do /mover.
 */
export async function bloqueadoresAbertos(exec, cardId) {
  const { rows } = await exec.query(
    `SELECT b.id, b.titulo, col.nome AS coluna_nome
       FROM cards_dependencias d
       JOIN cards b   ON b.id = d.depende_de_id
       JOIN colunas col ON col.id = b.coluna_id
      WHERE d.card_id = $1
        AND b.arquivado_em IS NULL
        AND col.tipo <> 'concluida'
      ORDER BY b.titulo`,
    [cardId],
  );
  return rows;
}

/**
 * Deteccao de ciclo: adicionar "A depende de B" cria ciclo se B ja
 * depende (direta ou transitivamente) de A.
 */
async function criariaCicloDependencia(exec, cardId, dependeDeId) {
  const { rows } = await exec.query(
    `WITH RECURSIVE cadeia AS (
       SELECT depende_de_id AS no
         FROM cards_dependencias
        WHERE card_id = $1
       UNION
       SELECT d.depende_de_id
         FROM cards_dependencias d
         JOIN cadeia c ON d.card_id = c.no
     )
     SELECT 1 FROM cadeia WHERE no = $2 LIMIT 1`,
    [dependeDeId, cardId],
  );
  return rows.length > 0;
}

/**
 * Hierarquia: definir paiId como pai de cardId cria ciclo se cardId ja
 * for ancestral de paiId. Exportado — cards.controller chama no update.
 */
export async function criariaCicloHierarquia(exec, cardId, paiId) {
  if (!paiId) return false;
  if (paiId === cardId) return true;
  const { rows } = await exec.query(
    `WITH RECURSIVE ancestrais AS (
       SELECT card_pai_id AS no FROM cards WHERE id = $1
       UNION
       SELECT c.card_pai_id
         FROM cards c
         JOIN ancestrais a ON c.id = a.no
        WHERE c.card_pai_id IS NOT NULL
     )
     SELECT 1 FROM ancestrais WHERE no = $2 LIMIT 1`,
    [paiId, cardId],
  );
  return rows.length > 0;
}

/** GET /api/cards/:id/dependencias */
export async function listarDependencias(req, res, next) {
  try {
    await carregarCard(req.pessoa, req.params.id, 'ver');

    const [bloq, bloqueia] = await Promise.all([
      // Quem bloqueia ESTE card
      query(
        `SELECT b.id, b.titulo, b.coluna_id, col.nome AS coluna_nome, col.tipo AS coluna_tipo,
                b.data_prazo, (col.tipo = 'concluida') AS concluido
           FROM cards_dependencias d
           JOIN cards b ON b.id = d.depende_de_id
           JOIN colunas col ON col.id = b.coluna_id
          WHERE d.card_id = $1 AND b.arquivado_em IS NULL
          ORDER BY concluido, b.titulo`,
        [req.params.id],
      ),
      // Quem ESTE card bloqueia
      query(
        `SELECT b.id, b.titulo, b.coluna_id, col.nome AS coluna_nome, col.tipo AS coluna_tipo,
                b.data_prazo
           FROM cards_dependencias d
           JOIN cards b ON b.id = d.card_id
           JOIN colunas col ON col.id = b.coluna_id
          WHERE d.depende_de_id = $1 AND b.arquivado_em IS NULL
          ORDER BY b.titulo`,
        [req.params.id],
      ),
    ]);

    res.json({ bloqueado_por: bloq.rows, bloqueia: bloqueia.rows });
  } catch (err) { next(err); }
}

/** POST /api/cards/:id/dependencias  body: { depende_de_id } */
export async function criarDependencia(req, res, next) {
  try {
    const card = await carregarCard(req.pessoa, req.params.id, 'editar');
    const { depende_de_id: dependeDeId } = z.object({
      depende_de_id: z.string().uuid(),
    }).parse(req.body);

    if (dependeDeId === req.params.id) {
      throw new AppError('Um card nao pode depender de si mesmo.', 400);
    }

    const alvo = await query('SELECT id, quadro_id FROM cards WHERE id = $1', [dependeDeId]);
    if (!alvo.rows[0]) throw new NaoEncontradoError('Card bloqueador nao encontrado');

    // Dependencia entre quadros diferentes: permitida so pra quem enxerga
    // os dois quadros. Isso viabiliza "entrega do time A trava o time B".
    if (alvo.rows[0].quadro_id !== card.quadro_id) {
      await exigirQuadro(req.pessoa, alvo.rows[0].quadro_id, 'ver');
    }

    if (await criariaCicloDependencia({ query }, req.params.id, dependeDeId)) {
      throw new AppError(
        'Essa dependencia criaria um ciclo (o outro card ja depende deste).', 400,
      );
    }

    await query(
      `INSERT INTO cards_dependencias (card_id, depende_de_id, criado_por_id)
       VALUES ($1, $2, $3)
       ON CONFLICT (card_id, depende_de_id) DO NOTHING`,
      [req.params.id, dependeDeId, req.pessoa.id],
    );

    registrarAcao({
      acao: 'card.dependencia_criou',
      pessoa_acesso_id: req.pessoa.id,
      detalhes: { card_id: req.params.id, depende_de_id: dependeDeId },
      req,
    });

    res.status(201).json({ ok: true });
  } catch (err) { next(err); }
}

/** DELETE /api/cards/:id/dependencias/:alvoId */
export async function excluirDependencia(req, res, next) {
  try {
    await carregarCard(req.pessoa, req.params.id, 'editar');
    const { rowCount } = await query(
      'DELETE FROM cards_dependencias WHERE card_id = $1 AND depende_de_id = $2',
      [req.params.id, req.params.alvoId],
    );
    if (rowCount === 0) throw new NaoEncontradoError('Dependencia nao encontrada');
    res.status(204).send();
  } catch (err) { next(err); }
}

// ===========================================================================
// 3. Subtarefas (hierarquia de cards)
// ===========================================================================
//
// Diferenca pro checklist: a subtarefa e um CARD de verdade — tem
// responsavel, prazo, comentario, anexo e anda pelas colunas do quadro.
// O checklist continua existindo pro que e trivial demais pra virar card.

/** GET /api/cards/:id/subtarefas */
export async function listarSubtarefas(req, res, next) {
  try {
    await carregarCard(req.pessoa, req.params.id, 'ver');
    const { rows } = await query(
      `SELECT c.id, c.titulo, c.coluna_id, c.data_prazo, c.prioridade,
              col.nome AS coluna_nome, col.tipo AS coluna_tipo,
              (col.tipo = 'concluida') AS concluido,
              COALESCE(
                (SELECT json_agg(json_build_object('id', pa.id, 'nome', pa.nome)
                                 ORDER BY cr.ordem)
                   FROM cards_responsaveis cr
                   JOIN pessoas_acesso pa ON pa.id = cr.pessoa_id
                  WHERE cr.card_id = c.id),
                '[]'::json
              ) AS responsaveis
         FROM cards c
         JOIN colunas col ON col.id = c.coluna_id
        WHERE c.card_pai_id = $1 AND c.arquivado_em IS NULL
        ORDER BY concluido, c.ordem`,
      [req.params.id],
    );
    res.json(rows);
  } catch (err) { next(err); }
}

/**
 * POST /api/cards/:id/subtarefas  body: { titulo, coluna_id?, data_prazo? }
 * Cria um card filho. Por padrao nasce na mesma coluna do pai.
 */
export async function criarSubtarefa(req, res, next) {
  const client = await pool.connect();
  try {
    const pai = await carregarCard(req.pessoa, req.params.id, 'editar');

    const d = z.object({
      titulo: z.string().min(1).max(255),
      coluna_id: z.string().uuid().optional(),
      data_prazo: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().nullable(),
      responsavel_ids: z.array(z.string().uuid()).optional().default([]),
    }).parse(req.body);

    // Subtarefa de subtarefa: permitida, mas so 1 nivel abaixo do pai
    // ja e o suficiente pra 99% dos casos. Nao limitamos a profundidade
    // aqui — o ciclo e barrado, e a UI so renderiza 2 niveis.
    const colunaId = d.coluna_id || pai.coluna_id;

    const colR = await client.query(
      'SELECT quadro_id FROM colunas WHERE id = $1 AND arquivada_em IS NULL',
      [colunaId],
    );
    if (!colR.rows[0]) throw new NaoEncontradoError('Coluna nao encontrada');
    if (colR.rows[0].quadro_id !== pai.quadro_id) {
      throw new AppError('A subtarefa precisa ficar no mesmo quadro do card pai.', 400);
    }

    await client.query('BEGIN');

    const { rows: max } = await client.query(
      `SELECT COALESCE(MAX(ordem), 0) + 1000 AS prox
         FROM cards WHERE coluna_id = $1 AND arquivado_em IS NULL`,
      [colunaId],
    );

    const { rows } = await client.query(
      `INSERT INTO cards (coluna_id, quadro_id, titulo, data_prazo, ordem,
                          card_pai_id, criado_por_id)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       RETURNING id, titulo, coluna_id, data_prazo, prioridade`,
      [colunaId, pai.quadro_id, d.titulo.trim(), d.data_prazo || null,
        max[0].prox, req.params.id, req.pessoa.id],
    );
    const filhoId = rows[0].id;

    for (let i = 0; i < d.responsavel_ids.length; i += 1) {
      await client.query(
        `INSERT INTO cards_responsaveis (card_id, pessoa_id, ordem, adicionado_por_id)
         VALUES ($1, $2, $3, $4)`,
        [filhoId, d.responsavel_ids[i], i, req.pessoa.id],
      );
    }

    await client.query('COMMIT');

    registrarAcao({
      acao: 'card.subtarefa_criou',
      pessoa_acesso_id: req.pessoa.id,
      detalhes: { card_pai_id: req.params.id, card_id: filhoId },
      req,
    });

    res.status(201).json(rows[0]);
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    next(err);
  } finally {
    client.release();
  }
}

// ===========================================================================
// 4. Vinculos de negocio  (card <-> resto do Nexus)
// ===========================================================================
//
// O diferencial da ferramenta. Um card deixa de ser post-it e passa a
// apontar pro objeto real: o cartorio que esta sendo implantado, o
// contrato que vence, a instancia de processo em andamento, o produto
// do portfolio, a conta a pagar que aquele trabalho gerou.
//
// Nao ha FK fisica (alvos em tabelas diferentes). A tabela alvo vem de
// um WHITELIST fechado abaixo — nunca do input do usuario. O rotulo e
// extraido com to_jsonb(t), o que evita depender do nome da coluna de
// titulo de cada tabela.

const TABELA_POR_TIPO = {
  cartorio: 'cartorios',
  contrato: 'contratos',
  processo_instancia: 'processos_instancias',
  produto: 'produtos',
  conta_pagar: 'contas_pagar',
};

// Tipos que expoem dado sensivel/financeiro. Pessoa com acesso_restrito
// (Sprint 31) nao cria nem enxerga o rotulo desses vinculos — coerente
// com o bloqueio das rotas /contratos, /contas-pagar e /produtos.
const TIPOS_SENSIVEIS = new Set(['contrato', 'conta_pagar', 'produto']);

function ehRestrita(pessoa) {
  return !!pessoa?.acesso_restrito && !pessoa?.administrador;
}

/** Extrai um rotulo legivel de uma linha qualquer, sem saber o schema. */
function rotuloDaLinha(linha) {
  if (!linha) return null;
  const campos = ['nome', 'titulo', 'descricao', 'razao_social', 'numero', 'codigo'];
  for (const c of campos) {
    if (typeof linha[c] === 'string' && linha[c].trim()) return linha[c].trim();
  }
  return null;
}

async function buscarAlvo(exec, tipo, alvoId) {
  const tabela = TABELA_POR_TIPO[tipo];
  if (!tabela) throw new AppError('Tipo de vinculo invalido.', 400);
  // `tabela` vem do whitelist acima — nunca do usuario.
  const { rows } = await exec.query(
    'SELECT to_jsonb(t) AS linha FROM ' + tabela + ' t WHERE t.id = $1',
    [alvoId],
  );
  return rows[0]?.linha ?? null;
}

/** GET /api/cards/:id/vinculos */
export async function listarVinculos(req, res, next) {
  try {
    await carregarCard(req.pessoa, req.params.id, 'ver');
    const restrita = ehRestrita(req.pessoa);

    const { rows } = await query(
      `SELECT id, tipo, alvo_id, criado_em
         FROM cards_vinculos
        WHERE card_id = $1
        ORDER BY tipo, criado_em`,
      [req.params.id],
    );

    const saida = [];
    for (const v of rows) {
      if (restrita && TIPOS_SENSIVEIS.has(v.tipo)) {
        saida.push({ ...v, rotulo: null, restrito: true });
        continue;
      }
      const linha = await buscarAlvo({ query }, v.tipo, v.alvo_id);
      saida.push({
        ...v,
        rotulo: rotuloDaLinha(linha),
        existe: !!linha,
        restrito: false,
      });
    }

    res.json(saida);
  } catch (err) { next(err); }
}

/** POST /api/cards/:id/vinculos  body: { tipo, alvo_id } */
export async function criarVinculo(req, res, next) {
  try {
    await carregarCard(req.pessoa, req.params.id, 'editar');

    const d = z.object({
      tipo: z.enum(Object.keys(TABELA_POR_TIPO)),
      alvo_id: z.string().uuid(),
    }).parse(req.body);

    if (ehRestrita(req.pessoa) && TIPOS_SENSIVEIS.has(d.tipo)) {
      throw new NaoAutorizadoError('Voce nao tem acesso a esse tipo de vinculo.');
    }

    const linha = await buscarAlvo({ query }, d.tipo, d.alvo_id);
    if (!linha) throw new NaoEncontradoError('Registro vinculado nao encontrado');

    const { rows } = await query(
      `INSERT INTO cards_vinculos (card_id, tipo, alvo_id, criado_por_id)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (card_id, tipo, alvo_id) DO UPDATE SET tipo = EXCLUDED.tipo
       RETURNING id, tipo, alvo_id, criado_em`,
      [req.params.id, d.tipo, d.alvo_id, req.pessoa.id],
    );

    registrarAcao({
      acao: 'card.vinculo_criou',
      pessoa_acesso_id: req.pessoa.id,
      detalhes: { card_id: req.params.id, tipo: d.tipo, alvo_id: d.alvo_id },
      req,
    });

    res.status(201).json({ ...rows[0], rotulo: rotuloDaLinha(linha), existe: true });
  } catch (err) { next(err); }
}

/** DELETE /api/cards/:id/vinculos/:vinculoId */
export async function excluirVinculo(req, res, next) {
  try {
    await carregarCard(req.pessoa, req.params.id, 'editar');
    const { rowCount } = await query(
      'DELETE FROM cards_vinculos WHERE id = $1 AND card_id = $2',
      [req.params.vinculoId, req.params.id],
    );
    if (rowCount === 0) throw new NaoEncontradoError('Vinculo nao encontrado');
    res.status(204).send();
  } catch (err) { next(err); }
}

/**
 * GET /api/cards/por-vinculo?tipo=cartorio&alvo_id=...
 * Busca reversa: "quais cards estao ligados a este cartorio/contrato?"
 * Usado pelas telas de Cartorio, Contrato, Produto — mostra o trabalho
 * em andamento direto na ficha do objeto.
 */
export async function cardsPorVinculo(req, res, next) {
  try {
    const d = z.object({
      tipo: z.enum(Object.keys(TABELA_POR_TIPO)),
      alvo_id: z.string().uuid(),
    }).parse(req.query);

    if (ehRestrita(req.pessoa) && TIPOS_SENSIVEIS.has(d.tipo)) {
      throw new NaoAutorizadoError('Sem acesso.');
    }

    const isAdmin = !!req.pessoa?.administrador;
    const params = [d.tipo, d.alvo_id];
    let filtroQuadro = '';
    if (!isAdmin) {
      params.push(req.pessoa.id);
      // So devolve cards de quadros que a pessoa enxerga (membro ou aberto).
      filtroQuadro = ' AND ('
        + ' q.aberto_a_socios = TRUE OR EXISTS ('
        + '   SELECT 1 FROM equipes_membros m'
        + '    WHERE m.equipe_id = q.equipe_id AND m.pessoa_id = $' + params.length
        + ' ))';
    }

    const { rows } = await query(
      `SELECT c.id, c.titulo, c.quadro_id, q.nome AS quadro_nome,
              c.coluna_id, col.nome AS coluna_nome, col.tipo AS coluna_tipo,
              c.data_prazo, c.prioridade
         FROM cards_vinculos v
         JOIN cards c   ON c.id = v.card_id
         JOIN quadros q ON q.id = c.quadro_id
         JOIN colunas col ON col.id = c.coluna_id
        WHERE v.tipo = $1 AND v.alvo_id = $2
          AND c.arquivado_em IS NULL
          AND q.arquivado_em IS NULL` + filtroQuadro
      + ' ORDER BY col.ordem, c.ordem LIMIT 100',
      params,
    );

    res.json(rows);
  } catch (err) { next(err); }
}

// ===========================================================================
// 5. Apontamento de horas (timer + lancamento manual)
// ===========================================================================
//
// Regra: no maximo UM timer rodando por pessoa (indice unico parcial na
// tabela). Iniciar um timer com outro rodando fecha o anterior — e o
// comportamento que as pessoas esperam e evita erro 500 por conflito.

/** GET /api/cards/timer/ativo — timer rodando da pessoa logada (ou null). */
export async function timerAtivo(req, res, next) {
  try {
    const { rows } = await query(
      `SELECT a.id, a.card_id, a.inicio, c.titulo AS card_titulo,
              c.quadro_id, q.nome AS quadro_nome
         FROM cards_apontamentos a
         JOIN cards c   ON c.id = a.card_id
         JOIN quadros q ON q.id = c.quadro_id
        WHERE a.pessoa_id = $1 AND a.fim IS NULL
        LIMIT 1`,
      [req.pessoa.id],
    );
    res.json(rows[0] || null);
  } catch (err) { next(err); }
}

/** POST /api/cards/:id/timer/iniciar */
export async function iniciarTimer(req, res, next) {
  const client = await pool.connect();
  try {
    await carregarCard(req.pessoa, req.params.id, 'editar');

    await client.query('BEGIN');

    // Fecha timer anterior (se houver) antes de abrir o novo.
    const anterior = await client.query(
      `UPDATE cards_apontamentos
          SET fim = NOW(),
              minutos = GREATEST(1, ROUND(EXTRACT(EPOCH FROM (NOW() - inicio)) / 60)::int)
        WHERE pessoa_id = $1 AND fim IS NULL
        RETURNING id, card_id, minutos`,
      [req.pessoa.id],
    );

    const { rows } = await client.query(
      `INSERT INTO cards_apontamentos (card_id, pessoa_id, inicio)
       VALUES ($1, $2, NOW())
       RETURNING id, card_id, inicio`,
      [req.params.id, req.pessoa.id],
    );

    await client.query('COMMIT');

    res.status(201).json({
      ...rows[0],
      fechou_anterior: anterior.rows[0] || null,
    });
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    next(err);
  } finally {
    client.release();
  }
}

/** POST /api/cards/:id/timer/parar */
export async function pararTimer(req, res, next) {
  try {
    await carregarCard(req.pessoa, req.params.id, 'editar');
    const { rows } = await query(
      `UPDATE cards_apontamentos
          SET fim = NOW(),
              minutos = GREATEST(1, ROUND(EXTRACT(EPOCH FROM (NOW() - inicio)) / 60)::int)
        WHERE card_id = $1 AND pessoa_id = $2 AND fim IS NULL
        RETURNING id, inicio, fim, minutos`,
      [req.params.id, req.pessoa.id],
    );
    if (!rows[0]) throw new AppError('Nao ha timer rodando neste card.', 400);
    res.json(rows[0]);
  } catch (err) { next(err); }
}

/** GET /api/cards/:id/apontamentos — lancamentos + totais. */
export async function listarApontamentos(req, res, next) {
  try {
    await carregarCard(req.pessoa, req.params.id, 'ver');

    const [lista, tot] = await Promise.all([
      query(
        `SELECT a.id, a.pessoa_id, p.nome AS pessoa_nome, a.inicio, a.fim,
                a.minutos, a.observacao
           FROM cards_apontamentos a
           LEFT JOIN pessoas_acesso p ON p.id = a.pessoa_id
          WHERE a.card_id = $1
          ORDER BY a.inicio DESC
          LIMIT 200`,
        [req.params.id],
      ),
      query(
        `SELECT COALESCE(SUM(minutos), 0)::int AS minutos_total,
                COUNT(*) FILTER (WHERE fim IS NULL)::int AS rodando
           FROM cards_apontamentos WHERE card_id = $1`,
        [req.params.id],
      ),
    ]);

    const est = await query(
      'SELECT estimativa_horas FROM cards WHERE id = $1', [req.params.id],
    );

    res.json({
      apontamentos: lista.rows,
      minutos_total: tot.rows[0].minutos_total,
      horas_total: Number((tot.rows[0].minutos_total / 60).toFixed(2)),
      estimativa_horas: est.rows[0]?.estimativa_horas ?? null,
      rodando: tot.rows[0].rodando > 0,
    });
  } catch (err) { next(err); }
}

/** POST /api/cards/:id/apontamentos — lancamento manual (body: minutos, observacao, inicio?) */
export async function criarApontamento(req, res, next) {
  try {
    await carregarCard(req.pessoa, req.params.id, 'editar');

    const d = z.object({
      minutos: z.number().int().min(1).max(24 * 60),
      observacao: z.string().max(500).optional().nullable(),
      inicio: z.string().datetime().optional(),
    }).parse(req.body);

    // Lancamento manual: inicio informado (ou agora), fim = inicio + minutos.
    // Resolvemos a conta em JS pra nao montar SQL condicional com uuid.
    const inicio = d.inicio ? new Date(d.inicio) : new Date();
    const fim = new Date(inicio.getTime() + d.minutos * 60000);

    const { rows } = await query(
      `INSERT INTO cards_apontamentos
         (card_id, pessoa_id, inicio, fim, minutos, observacao)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING id, inicio, fim, minutos, observacao`,
      [req.params.id, req.pessoa.id, inicio.toISOString(), fim.toISOString(),
        d.minutos, d.observacao?.trim() || null],
    );

    res.status(201).json(rows[0]);
  } catch (err) { next(err); }
}

/** DELETE /api/cards/:id/apontamentos/:apontamentoId — so o dono ou admin. */
export async function excluirApontamento(req, res, next) {
  try {
    await carregarCard(req.pessoa, req.params.id, 'editar');

    const aR = await query(
      'SELECT id, pessoa_id FROM cards_apontamentos WHERE id = $1 AND card_id = $2',
      [req.params.apontamentoId, req.params.id],
    );
    if (!aR.rows[0]) throw new NaoEncontradoError('Apontamento nao encontrado');

    const ehDono = aR.rows[0].pessoa_id === req.pessoa.id;
    if (!ehDono && !req.pessoa?.administrador) {
      throw new NaoAutorizadoError('Voce so pode excluir os seus proprios apontamentos.');
    }

    await query('DELETE FROM cards_apontamentos WHERE id = $1', [req.params.apontamentoId]);
    res.status(204).send();
  } catch (err) { next(err); }
}
