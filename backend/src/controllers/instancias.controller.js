import { z } from 'zod';
import { query, pool } from '../config/database.js';
import { NaoEncontradoError, AppError, NaoAutorizadoError } from '../utils/errors.js';
import { registrarAcao } from '../utils/audit.js';
import {
  criarInstancia, escolherSaida, cancelarInstancia,
} from '../services/instancias.service.js';

/**
 * Controller de instâncias de processos — Sprint 15 + Sprint 22 (item 3 da spec).
 *
 * Visibilidade alinha com o processo (ver processos.controller.js):
 * admin vê tudo; não-admin vê processos publicados ou de equipes que
 * é membro. Aqui, mesma regra — derivada via JOIN.
 *
 * Sprint 22: novo endpoint `listarGeral` cross-processo com filtros
 * (meu, processo, status, responsável, dias parada) + cálculo de
 * `dias_sem_movimentacao` baseado na última atualização dos cards.
 *
 * Iniciar instância: admin ou membro de alguma equipe associada ao
 * processo. Cancelar: só admin (ou quem iniciou).
 */

const criarSchema = z.object({
  nome: z.string().min(2).max(255),
  descricao: z.string().max(2000).optional().nullable(),
  data_inicio: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().nullable(),
});

const escolherSaidaSchema = z.object({
  aresta_id: z.string().uuid(),
});

const cancelarSchema = z.object({
  motivo_cancelamento: z.string().min(3).max(2000),
});

// Helper pra montar placeholders SQL ($1, $2, ...) sem usar o caractere
// "$" literal em concatenação — algumas ferramentas de edição corrompem
// strings tipo "'$' + var". String.fromCharCode(36) é o caractere $.
const CIFRAO = String.fromCharCode(36);
const PH = (n) => CIFRAO + n;

// =============================================================================
// Helpers
// =============================================================================

/**
 * Pode INICIAR ou EDITAR uma instância:
 *   - Admin: sempre
 *   - Membro de alguma equipe associada ao processo: sim
 */
async function podeOperarProcesso(pessoaId, isAdmin, processoId) {
  if (isAdmin) return true;
  const { rows } = await query(
    `SELECT 1
       FROM processos_equipes pe
       JOIN equipes_membros em ON em.equipe_id = pe.equipe_id
      WHERE pe.processo_id = $1 AND em.pessoa_id = $2
      LIMIT 1`,
    [processoId, pessoaId],
  );
  return rows.length > 0;
}

/**
 * Pode VER uma instância (mesma regra que processos.controller.js).
 */
async function podeVerInstancia(pessoaId, isAdmin, instanciaId) {
  if (isAdmin) return { pode: true, instancia: null };
  const { rows } = await query(
    `SELECT i.*, p.status AS processo_status
       FROM processos_instancias i
       JOIN processos p ON p.id = i.processo_id
      WHERE i.id = $1
        AND (
          p.status = 'publicado'
          OR EXISTS (
            SELECT 1 FROM processos_equipes pe
             JOIN equipes_membros em ON em.equipe_id = pe.equipe_id
            WHERE pe.processo_id = p.id AND em.pessoa_id = $2
          )
        )`,
    [instanciaId, pessoaId],
  );
  return { pode: rows.length > 0, instancia: rows[0] };
}

// =============================================================================
// Endpoints
// =============================================================================

/**
 * GET /api/processos/:id/instancias
 * Lista as instâncias do processo.
 */
export async function listarPorProcesso(req, res, next) {
  try {
    const isAdmin = !!req.pessoa?.administrador;
    const processoId = req.params.id;

    const params = [processoId];
    let filtroVisib;
    if (isAdmin) {
      filtroVisib = 'TRUE';
    } else {
      params.push(req.pessoa.id);
      filtroVisib = `(
        p.status = 'publicado'
        OR EXISTS (
          SELECT 1 FROM processos_equipes pe
           JOIN equipes_membros em ON em.equipe_id = pe.equipe_id
          WHERE pe.processo_id = p.id AND em.pessoa_id = $2
        )
      )`;
    }

    const { rows: procs } = await query(
      `SELECT p.id, p.status
         FROM processos p
        WHERE p.id = $1 AND ${filtroVisib}`,
      params,
    );
    if (!procs[0]) throw new NaoEncontradoError('Processo não encontrado');

    const { rows } = await query(
      `SELECT i.id, i.nome, i.descricao, i.status, i.versao_processo,
              i.data_inicio, i.iniciada_em, i.concluida_em,
              i.cancelada_em, i.motivo_cancelamento,
              i.quadro_id,
              p.nome AS iniciada_por_nome,
              (SELECT COUNT(*)::int FROM processos_instancias_nos inn
                 WHERE inn.instancia_id = i.id) AS total_nos,
              (SELECT COUNT(*)::int FROM processos_instancias_nos inn
                 WHERE inn.instancia_id = i.id AND inn.status = 'concluido') AS nos_concluidos,
              (SELECT COUNT(*)::int FROM processos_instancias_nos inn
                 WHERE inn.instancia_id = i.id AND inn.status = 'ativo') AS nos_ativos
         FROM processos_instancias i
         LEFT JOIN pessoas_acesso p ON p.id = i.iniciada_por_id
        WHERE i.processo_id = $1
        ORDER BY i.iniciada_em DESC`,
      [processoId],
    );

    res.json(rows);
  } catch (err) { next(err); }
}

/**
 * POST /api/processos/:id/instancias
 * Cria uma nova execução do processo.
 */
export async function criar(req, res, next) {
  const client = await pool.connect();
  try {
    const isAdmin = !!req.pessoa?.administrador;
    const processoId = req.params.id;

    if (!await podeOperarProcesso(req.pessoa.id, isAdmin, processoId)) {
      throw new NaoAutorizadoError('Sem permissão pra iniciar instâncias deste processo.');
    }

    const d = criarSchema.parse(req.body);

    await client.query('BEGIN');

    const r = await criarInstancia(client, {
      processoId,
      nome: d.nome,
      descricao: d.descricao,
      dataInicio: d.data_inicio,
      pessoaId: req.pessoa.id,
    });

    await client.query('COMMIT');

    registrarAcao({
      acao: 'instancia.criou',
      pessoa_acesso_id: req.pessoa.id,
      detalhes: {
        instancia_id: r.instanciaId,
        processo_id: processoId,
        nome: d.nome,
        quadro_id: r.quadroId,
      },
      req,
    });

    res.status(201).json({ id: r.instanciaId, quadro_id: r.quadroId });
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    if (err.message && !err.statusCode) {
      next(new AppError(err.message, 400));
    } else {
      next(err);
    }
  } finally {
    client.release();
  }
}

/**
 * GET /api/instancias/:id
 * Detalhes da instância: cabeçalho + estado de cada nó + decisões pendentes.
 */
export async function obter(req, res, next) {
  try {
    const isAdmin = !!req.pessoa?.administrador;
    const { pode } = await podeVerInstancia(req.pessoa.id, isAdmin, req.params.id);
    if (!pode) throw new NaoEncontradoError('Instância não encontrada');

    const { rows: ins } = await query(
      `SELECT i.*, p.nome AS processo_nome, p.cor AS processo_cor,
              pa.nome AS iniciada_por_nome
         FROM processos_instancias i
         JOIN processos p ON p.id = i.processo_id
         LEFT JOIN pessoas_acesso pa ON pa.id = i.iniciada_por_id
        WHERE i.id = $1`,
      [req.params.id],
    );
    if (!ins[0]) throw new NaoEncontradoError('Instância não encontrada');

    const { rows: nos } = await query(
      `SELECT inn.*, n.tipo AS no_tipo, n.rotulo AS no_rotulo,
              n.descricao AS no_descricao, n.posicao_x, n.posicao_y,
              pa.nome AS papel_nome, pa.cor AS papel_cor,
              c.id AS card_id, c.titulo AS card_titulo,
              c.coluna_id AS card_coluna_id
         FROM processos_instancias_nos inn
         JOIN processos_nos n ON n.id = inn.no_id
         LEFT JOIN processos_papeis pa ON pa.id = n.papel_id
         LEFT JOIN cards c ON c.id = inn.card_id
        WHERE inn.instancia_id = $1
        ORDER BY n.posicao_y, n.posicao_x`,
      [req.params.id],
    );

    const decisoesPendentes = nos
      .filter((n) => n.no_tipo === 'decisao' && n.status === 'concluido' && !n.saida_escolhida_aresta_id);

    const saidasPorNo = {};
    for (const dec of decisoesPendentes) {
      const { rows: saidas } = await query(
        `SELECT a.id, a.rotulo, a.destino_no_id,
                n2.rotulo AS destino_rotulo
           FROM processos_arestas a
           JOIN processos_nos n2 ON n2.id = a.destino_no_id
          WHERE a.origem_no_id = $1
          ORDER BY a.criado_em`,
        [dec.no_id],
      );
      saidasPorNo[dec.id] = saidas;
    }

    res.json({
      ...ins[0],
      nos,
      decisoes_pendentes: decisoesPendentes.map((d) => ({
        instancia_no_id: d.id,
        no_id: d.no_id,
        rotulo: d.no_rotulo,
        saidas: saidasPorNo[d.id] || [],
      })),
    });
  } catch (err) { next(err); }
}

/**
 * GET /api/quadros/:id/instancia
 * Atalho: dado um quadro, retorna a instância vinculada (se houver).
 */
export async function obterPorQuadro(req, res, next) {
  try {
    const isAdmin = !!req.pessoa?.administrador;

    const params = [req.params.id];
    let filtroVisib;
    if (isAdmin) {
      filtroVisib = 'TRUE';
    } else {
      params.push(req.pessoa.id);
      filtroVisib = `(
        p.status = 'publicado'
        OR EXISTS (
          SELECT 1 FROM processos_equipes pe
           JOIN equipes_membros em ON em.equipe_id = pe.equipe_id
          WHERE pe.processo_id = p.id AND em.pessoa_id = $2
        )
      )`;
    }

    const { rows } = await query(
      `SELECT i.id
         FROM processos_instancias i
         JOIN processos p ON p.id = i.processo_id
        WHERE i.quadro_id = $1 AND ${filtroVisib}
        LIMIT 1`,
      params,
    );

    if (!rows[0]) {
      return res.status(204).send();
    }

    req.params.id = rows[0].id;
    return obter(req, res, next);
  } catch (err) { next(err); }
}

/**
 * POST /api/instancias/:id/escolher-saida
 * Pra decisões: registra qual aresta seguir e ativa o destino.
 */
export async function escolherSaidaDecisao(req, res, next) {
  const client = await pool.connect();
  try {
    const d = escolherSaidaSchema.parse(req.body);

    const { rows: ins } = await query(
      `SELECT i.id, i.processo_id, inn.id AS instancia_no_id
         FROM processos_instancias_nos inn
         JOIN processos_instancias i ON i.id = inn.instancia_id
        WHERE inn.id = $1`,
      [req.params.id],
    );
    if (!ins[0]) throw new NaoEncontradoError('Nó da instância não encontrado');

    const isAdmin = !!req.pessoa?.administrador;
    if (!await podeOperarProcesso(req.pessoa.id, isAdmin, ins[0].processo_id)) {
      throw new NaoAutorizadoError('Sem permissão.');
    }

    await client.query('BEGIN');
    await escolherSaida(client, {
      instanciaNoId: req.params.id,
      arestaId: d.aresta_id,
      pessoaId: req.pessoa.id,
    });
    await client.query('COMMIT');

    registrarAcao({
      acao: 'instancia.escolheu_saida',
      pessoa_acesso_id: req.pessoa.id,
      detalhes: {
        instancia_id: ins[0].id,
        instancia_no_id: req.params.id,
        aresta_id: d.aresta_id,
      },
      req,
    });

    res.status(204).send();
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    if (err.message && !err.statusCode) next(new AppError(err.message, 400));
    else next(err);
  } finally {
    client.release();
  }
}

/**
 * POST /api/instancias/:id/cancelar
 * Cancela e arquiva os cards pendentes.
 */
export async function cancelar(req, res, next) {
  const client = await pool.connect();
  try {
    const d = cancelarSchema.parse(req.body);

    const { rows: ins } = await query(
      `SELECT id, processo_id, iniciada_por_id, status
         FROM processos_instancias WHERE id = $1`,
      [req.params.id],
    );
    if (!ins[0]) throw new NaoEncontradoError('Instância não encontrada');

    const isAdmin = !!req.pessoa?.administrador;
    const ehDono = ins[0].iniciada_por_id === req.pessoa.id;
    if (!isAdmin && !ehDono) {
      throw new NaoAutorizadoError('Só admin ou quem iniciou pode cancelar.');
    }

    await client.query('BEGIN');
    await cancelarInstancia(client, {
      instanciaId: req.params.id,
      motivo: d.motivo_cancelamento,
      pessoaId: req.pessoa.id,
    });
    await client.query('COMMIT');

    registrarAcao({
      acao: 'instancia.cancelou',
      pessoa_acesso_id: req.pessoa.id,
      detalhes: {
        instancia_id: req.params.id,
        motivo: d.motivo_cancelamento,
      },
      req,
    });

    res.status(204).send();
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    if (err.message && !err.statusCode) next(new AppError(err.message, 400));
    else next(err);
  } finally {
    client.release();
  }
}

// =============================================================================
// Sprint 22 — Listagem geral cross-processo com filtros (item 3 da spec)
// =============================================================================

/**
 * GET /api/instancias
 *
 * Lista instâncias de QUALQUER processo (que a pessoa tem visibilidade).
 * Pra dashboards do tipo "em andamento" e "minhas".
 *
 * Query params (todos opcionais):
 *   ?meu=true              — só instâncias onde sou iniciador OU
 *                            responsável por algum card ativo
 *   ?status=em_andamento   — default: 'em_andamento'. 'todas' não filtra
 *   ?processo_id=uuid      — limita a um processo específico
 *   ?responsavel_id=uuid   — instâncias com card ativo dessa pessoa
 *   ?paradas_dias=7        — só instâncias sem movimentação há N dias
 *   ?busca=texto           — ILIKE em nome da instância ou nome do processo
 *
 * Retorna por instância:
 *   - cabeçalho (id, nome, status, processo_nome, etc.)
 *   - progresso (total_nos, nos_concluidos, nos_ativos)
 *   - dias_sem_movimentacao (calculado: hoje - ultima_movimentacao)
 *   - flag `parada` (true se em_andamento E dias_sem_movimentacao >= 7)
 *   - responsaveis_ativos: [{id, nome}] pessoas atribuídas a cards ativos
 */
export async function listarGeral(req, res, next) {
  try {
    const isAdmin = !!req.pessoa?.administrador;
    const pessoaId = req.pessoa.id;

    const filtros = [];
    const params = [];

    // Permissão: admin vê tudo; demais só processos publicados ou de equipes que é membro
    if (!isAdmin) {
      params.push(pessoaId);
      filtros.push(
        '(proc.status = ' + "'publicado'" + ' OR EXISTS (' +
          'SELECT 1 FROM processos_equipes pe ' +
          'JOIN equipes_membros em ON em.equipe_id = pe.equipe_id ' +
          'WHERE pe.processo_id = proc.id AND em.pessoa_id = ' + PH(params.length) +
        '))'
      );
    }

    // Status (default: em_andamento; 'todas' não filtra)
    const status = req.query.status || 'em_andamento';
    if (status !== 'todas') {
      params.push(status);
      filtros.push('i.status = ' + PH(params.length));
    }

    // Processo específico
    if (req.query.processo_id) {
      params.push(req.query.processo_id);
      filtros.push('i.processo_id = ' + PH(params.length));
    }

    // "Minhas" — sou criadora OU responsável por card ativo
    if (req.query.meu === 'true') {
      params.push(pessoaId);
      const ph = PH(params.length);
      filtros.push(
        '(i.iniciada_por_id = ' + ph + ' OR EXISTS (' +
          'SELECT 1 FROM processos_instancias_nos inn ' +
          'JOIN cards_responsaveis cr ON cr.card_id = inn.card_id ' +
          'WHERE inn.instancia_id = i.id AND inn.status = ' + "'ativo'" +
          ' AND cr.pessoa_id = ' + ph +
        '))'
      );
    }

    // Responsável específico (independente de "meu")
    if (req.query.responsavel_id) {
      params.push(req.query.responsavel_id);
      filtros.push(
        'EXISTS (' +
          'SELECT 1 FROM processos_instancias_nos inn ' +
          'JOIN cards_responsaveis cr ON cr.card_id = inn.card_id ' +
          'WHERE inn.instancia_id = i.id AND inn.status = ' + "'ativo'" +
          ' AND cr.pessoa_id = ' + PH(params.length) +
        ')'
      );
    }

    // Paradas há X dias
    if (req.query.paradas_dias) {
      const dias = parseInt(req.query.paradas_dias, 10);
      if (Number.isFinite(dias) && dias > 0) {
        params.push(dias);
        filtros.push(
          '(SELECT COALESCE(MAX(c.atualizado_em), i.iniciada_em) ' +
             'FROM processos_instancias_nos inn ' +
             'LEFT JOIN cards c ON c.id = inn.card_id ' +
            'WHERE inn.instancia_id = i.id' +
          ') < now() - (' + PH(params.length) + ' || ' + "' days'" + ')::interval'
        );
      }
    }

    // Busca textual
    if (req.query.busca) {
      params.push('%' + req.query.busca + '%');
      const ph = PH(params.length);
      filtros.push('(i.nome ILIKE ' + ph + ' OR proc.nome ILIKE ' + ph + ')');
    }

    const where = filtros.length > 0 ? 'WHERE ' + filtros.join(' AND ') : '';

    // SELECT principal com subqueries de agregação. O CIFRAO aqui não
    // entra na string (são placeholders pgsql).
    const sql =
      'SELECT ' +
        'i.id, i.nome, i.descricao, i.status, i.versao_processo, ' +
        'i.data_inicio, i.iniciada_em, i.concluida_em, i.cancelada_em, ' +
        'i.quadro_id, i.iniciada_por_id, ' +
        'p.nome AS iniciada_por_nome, ' +
        'proc.id AS processo_id, proc.nome AS processo_nome, proc.cor AS processo_cor, ' +
        '(SELECT COUNT(*)::int FROM processos_instancias_nos inn WHERE inn.instancia_id = i.id) AS total_nos, ' +
        "(SELECT COUNT(*)::int FROM processos_instancias_nos inn WHERE inn.instancia_id = i.id AND inn.status = 'concluido') AS nos_concluidos, " +
        "(SELECT COUNT(*)::int FROM processos_instancias_nos inn WHERE inn.instancia_id = i.id AND inn.status = 'ativo') AS nos_ativos, " +
        '(SELECT COALESCE(MAX(c.atualizado_em), i.iniciada_em) ' +
           'FROM processos_instancias_nos inn ' +
           'LEFT JOIN cards c ON c.id = inn.card_id ' +
          'WHERE inn.instancia_id = i.id) AS ultima_movimentacao, ' +
        'COALESCE(' +
          "(SELECT json_agg(DISTINCT jsonb_build_object('id', pa3.id, 'nome', pa3.nome)) " +
             'FROM processos_instancias_nos inn ' +
             'JOIN cards_responsaveis cr ON cr.card_id = inn.card_id ' +
             'JOIN pessoas_acesso pa3 ON pa3.id = cr.pessoa_id ' +
            "WHERE inn.instancia_id = i.id AND inn.status = 'ativo'), " +
          "'[]'::json" +
        ') AS responsaveis_ativos ' +
      'FROM processos_instancias i ' +
      'JOIN processos proc ON proc.id = i.processo_id ' +
      'LEFT JOIN pessoas_acesso p ON p.id = i.iniciada_por_id ' +
      where + ' ' +
      "ORDER BY (i.status = 'em_andamento') DESC, ultima_movimentacao ASC NULLS LAST, i.iniciada_em DESC " +
      'LIMIT 200';

    const { rows } = await query(sql, params);

    // Calcula dias_sem_movimentacao + flag parada
    const hoje = new Date();
    hoje.setHours(0, 0, 0, 0);
    const formatadas = rows.map((r) => {
      let dias = null;
      if (r.ultima_movimentacao) {
        const m = new Date(r.ultima_movimentacao);
        m.setHours(0, 0, 0, 0);
        dias = Math.floor((hoje - m) / (1000 * 60 * 60 * 24));
      }
      return {
        ...r,
        dias_sem_movimentacao: dias,
        parada: r.status === 'em_andamento' && dias !== null && dias >= 7,
      };
    });

    res.json(formatadas);
  } catch (err) { next(err); }
}
