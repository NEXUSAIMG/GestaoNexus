import { z } from 'zod';
import { query, pool } from '../config/database.js';
import { NaoEncontradoError, AppError, NaoAutorizadoError } from '../utils/errors.js';
import { registrarAcao } from '../utils/audit.js';
import { podeVerQuadro } from './quadros.controller.js';

/**
 * Colunas — Sprint 10.
 *
 * Cada coluna pertence a um quadro. Reordenação usa passo de 1000 entre
 * vizinhos. Quando o gap fica < 2 entre dois vizinhos, fazemos uma
 * renormalização (reescrevemos as ordens em múltiplos de 1000).
 */

const criarSchema = z.object({
  nome: z.string().min(1).max(80),
  // Posição opcional — se vier, insere ali. Se não, vai pro final.
  posicao: z.number().int().min(0).optional(),
});

const atualizarSchema = z.object({
  nome: z.string().min(1).max(80).optional(),
});

const moverSchema = z.object({
  // Nova posição (índice 0-based) entre as colunas ATIVAS do quadro.
  posicao: z.number().int().min(0),
});

/**
 * Recalcula a `ordem` de uma coluna pra inserir num índice específico
 * (0-based) dentro do quadro. Devolve o novo valor de `ordem`.
 *
 * Estratégia: pega ordens vizinhas e faz a média. Se o gap for < 2,
 * renormaliza tudo em múltiplos de 1000.
 */
async function calcularOrdemColuna(client, quadroId, posicaoDesejada, excluirId = null) {
  const params = [quadroId];
  let excluiSql = '';
  if (excluirId) {
    params.push(excluirId);
    excluiSql = `AND id <> $${params.length}`;
  }
  const { rows: lista } = await client.query(
    `SELECT id, ordem FROM colunas
      WHERE quadro_id = $1 AND arquivada_em IS NULL ${excluiSql}
      ORDER BY ordem`,
    params,
  );

  // posição 0 = antes do primeiro; posição N = depois do último
  const antes = posicaoDesejada > 0 ? lista[posicaoDesejada - 1] : null;
  const depois = posicaoDesejada < lista.length ? lista[posicaoDesejada] : null;

  if (!antes && !depois) return 1000; // primeiro item
  if (!antes) return depois.ordem - 1000;
  if (!depois) return antes.ordem + 1000;

  const meio = Math.floor((Number(antes.ordem) + Number(depois.ordem)) / 2);
  if (meio === Number(antes.ordem) || meio === Number(depois.ordem)) {
    // Gap acabou — renormaliza tudo. Caso raro.
    await renormalizarColunas(client, quadroId);
    // Recursão: agora há gap suficiente.
    return calcularOrdemColuna(client, quadroId, posicaoDesejada, excluirId);
  }
  return meio;
}

async function renormalizarColunas(client, quadroId) {
  const { rows } = await client.query(
    `SELECT id FROM colunas
      WHERE quadro_id = $1 AND arquivada_em IS NULL
      ORDER BY ordem, criado_em`,
    [quadroId],
  );
  let ordem = 1000;
  for (const c of rows) {
    await client.query(`UPDATE colunas SET ordem = $1 WHERE id = $2`, [ordem, c.id]);
    ordem += 1000;
  }
}

/**
 * POST /api/quadros/:id/colunas
 */
export async function criar(req, res, next) {
  const client = await pool.connect();
  try {
    const isAdmin = !!req.pessoa?.administrador;
    const { podeEditar } = await podeVerQuadro(req.pessoa.id, isAdmin, req.params.id);
    if (!podeEditar) throw new NaoAutorizadoError('Sem permissão.');

    const d = criarSchema.parse(req.body);

    await client.query('BEGIN');

    let ordem;
    if (d.posicao !== undefined) {
      ordem = await calcularOrdemColuna(client, req.params.id, d.posicao);
    } else {
      const { rows: max } = await client.query(
        `SELECT COALESCE(MAX(ordem), 0) + 1000 AS prox
           FROM colunas WHERE quadro_id = $1 AND arquivada_em IS NULL`,
        [req.params.id],
      );
      ordem = max[0].prox;
    }

    const { rows } = await client.query(
      `INSERT INTO colunas (quadro_id, nome, ordem)
       VALUES ($1, $2, $3)
       RETURNING id, nome, ordem, criado_em`,
      [req.params.id, d.nome.trim(), ordem],
    );

    await client.query('COMMIT');

    registrarAcao({
      acao: 'coluna.criou',
      pessoa_acesso_id: req.pessoa.id,
      detalhes: { quadro_id: req.params.id, coluna_id: rows[0].id, nome: d.nome },
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

/**
 * PUT /api/colunas/:id (renomeia)
 */
export async function atualizar(req, res, next) {
  try {
    // Pega o quadro pra checar permissão
    const cR = await query(`SELECT quadro_id FROM colunas WHERE id = $1`, [req.params.id]);
    if (!cR.rows[0]) throw new NaoEncontradoError('Coluna não encontrada');

    const isAdmin = !!req.pessoa?.administrador;
    const { podeEditar } = await podeVerQuadro(req.pessoa.id, isAdmin, cR.rows[0].quadro_id);
    if (!podeEditar) throw new NaoAutorizadoError('Sem permissão.');

    const d = atualizarSchema.parse(req.body);
    if (d.nome !== undefined) {
      await query(`UPDATE colunas SET nome = $1 WHERE id = $2`, [d.nome.trim(), req.params.id]);
    }

    registrarAcao({
      acao: 'coluna.editou',
      pessoa_acesso_id: req.pessoa.id,
      detalhes: { coluna_id: req.params.id },
      req,
    });

    res.json({ ok: true });
  } catch (err) { next(err); }
}

/**
 * POST /api/colunas/:id/mover
 * Move a coluna pra uma posição nova dentro do mesmo quadro.
 */
export async function mover(req, res, next) {
  const client = await pool.connect();
  try {
    const cR = await query(`SELECT quadro_id FROM colunas WHERE id = $1`, [req.params.id]);
    if (!cR.rows[0]) throw new NaoEncontradoError('Coluna não encontrada');

    const isAdmin = !!req.pessoa?.administrador;
    const { podeEditar } = await podeVerQuadro(req.pessoa.id, isAdmin, cR.rows[0].quadro_id);
    if (!podeEditar) throw new NaoAutorizadoError('Sem permissão.');

    const { posicao } = moverSchema.parse(req.body);

    await client.query('BEGIN');
    const novaOrdem = await calcularOrdemColuna(
      client, cR.rows[0].quadro_id, posicao, req.params.id,
    );
    await client.query(`UPDATE colunas SET ordem = $1 WHERE id = $2`, [novaOrdem, req.params.id]);
    await client.query('COMMIT');

    res.json({ ok: true, ordem: novaOrdem });
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    next(err);
  } finally {
    client.release();
  }
}

/**
 * POST /api/colunas/:id/arquivar
 * Arquiva a coluna. Cards dentro dela ficam acessíveis pelo histórico
 * mas não aparecem no board.
 */
export async function arquivar(req, res, next) {
  try {
    const cR = await query(`SELECT quadro_id FROM colunas WHERE id = $1`, [req.params.id]);
    if (!cR.rows[0]) throw new NaoEncontradoError('Coluna não encontrada');

    const isAdmin = !!req.pessoa?.administrador;
    const { podeEditar } = await podeVerQuadro(req.pessoa.id, isAdmin, cR.rows[0].quadro_id);
    if (!podeEditar) throw new NaoAutorizadoError('Sem permissão.');

    const { rowCount } = await query(
      `UPDATE colunas SET arquivada_em = NOW()
        WHERE id = $1 AND arquivada_em IS NULL`,
      [req.params.id],
    );
    if (rowCount === 0) throw new AppError('Coluna não encontrada ou já arquivada.', 400);

    registrarAcao({
      acao: 'coluna.arquivou',
      pessoa_acesso_id: req.pessoa.id,
      detalhes: { coluna_id: req.params.id },
      req,
    });

    res.status(204).send();
  } catch (err) { next(err); }
}
