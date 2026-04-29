import { z } from 'zod';
import { query, pool } from '../config/database.js';
import { NaoEncontradoError, AppError, NaoAutorizadoError } from '../utils/errors.js';
import { registrarAcao } from '../utils/audit.js';
import {
  criarInstancia, escolherSaida, cancelarInstancia,
} from '../services/instancias.service.js';

/**
 * Controller de instâncias de processos — Sprint 15.
 *
 * Visibilidade alinha com o processo (ver processos.controller.js):
 * admin vê tudo; não-admin vê processos publicados ou de equipes que
 * é membro. Aqui, mesma regra — derivada via JOIN.
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

    // Confere visibilidade do processo
    const { rows: procs } = await query(
      `SELECT p.id, p.status
         FROM processos p
        WHERE p.id = $1
          AND (
            $2 = TRUE
            OR p.status = 'publicado'
            OR EXISTS (
              SELECT 1 FROM processos_equipes pe
               JOIN equipes_membros em ON em.equipe_id = pe.equipe_id
              WHERE pe.processo_id = p.id AND em.pessoa_id = $3
            )
          )`,
      [processoId, isAdmin, req.pessoa.id],
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
    // Erros do service (ex: "processo precisa estar publicado") são strings;
    // converte pra AppError 400
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
    const { pode, instancia } = await podeVerInstancia(req.pessoa.id, isAdmin, req.params.id);
    if (!pode) throw new NaoEncontradoError('Instância não encontrada');

    // Recarrega completo (podeVerInstancia retorna parcial)
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

    // Estado de cada nó
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

    // Decisões pendentes: nós tipo 'decisao' que estão concluidos
    // mas SEM saida_escolhida_aresta_id
    const decisoesPendentes = nos
      .filter((n) => n.no_tipo === 'decisao' && n.status === 'concluido' && !n.saida_escolhida_aresta_id);

    // Pra cada decisão pendente, busca as saídas possíveis
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
 * Útil pro frontend do Quadro.jsx detectar e renderizar header de processo.
 */
export async function obterPorQuadro(req, res, next) {
  try {
    const isAdmin = !!req.pessoa?.administrador;

    const { rows } = await query(
      `SELECT i.id
         FROM processos_instancias i
         JOIN processos p ON p.id = i.processo_id
        WHERE i.quadro_id = $1
          AND (
            $2 = TRUE
            OR p.status = 'publicado'
            OR EXISTS (
              SELECT 1 FROM processos_equipes pe
               JOIN equipes_membros em ON em.equipe_id = pe.equipe_id
              WHERE pe.processo_id = p.id AND em.pessoa_id = $3
            )
          )
        LIMIT 1`,
      [req.params.id, isAdmin, req.pessoa.id],
    );

    if (!rows[0]) {
      // Não é quadro de instância — retorna 204 (sem conteúdo)
      return res.status(204).send();
    }

    // Reusa o obter
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

    // Valida que o nó da instância existe e que a pessoa pode operar o processo
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
