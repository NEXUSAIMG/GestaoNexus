import { z } from 'zod';
import { query } from '../config/database.js';
import { AppError, NaoEncontradoError } from '../utils/errors.js';

/**
 * Notificações in-app — Sprint 7.
 *
 * Cada notificação pertence a UMA pessoa (pessoa_acesso). Quando alguém
 * representa N sócios, os avisos vinculados àquela pessoa aparecem para
 * ela em qualquer contexto (porque é a pessoa logada que vê o sino).
 */

const listarSchema = z.object({
  filtro: z.enum(['todas', 'nao_lidas']).optional(),
  limite: z.coerce.number().int().min(1).max(100).optional(),
});

function serializar(r) {
  return {
    id: r.id,
    tipo: r.tipo,
    titulo: r.titulo,
    descricao: r.descricao,
    link: r.link,
    contexto: r.contexto,
    lida: r.lida,
    criada_em: r.criada_em,
    lida_em: r.lida_em,
  };
}

/**
 * GET /api/notificacoes?filtro=todas|nao_lidas&limite=N
 */
export async function listar(req, res, next) {
  try {
    const { filtro = 'todas', limite = 30 } = listarSchema.parse(req.query);
    const partes = ['pessoa_id = $1'];
    const params = [req.pessoa.id];
    if (filtro === 'nao_lidas') partes.push('lida = FALSE');
    params.push(limite);
    const { rows } = await query(
      `SELECT * FROM notificacoes
        WHERE ${partes.join(' AND ')}
        ORDER BY criada_em DESC
        LIMIT $${params.length}`,
      params,
    );
    res.json(rows.map(serializar));
  } catch (err) { next(err); }
}

/**
 * GET /api/notificacoes/contagem
 * Devolve contadores rápidos (não lidas + total nas últimas 30 dias).
 * Pensado pro polling do sino — endpoint leve.
 */
export async function contagem(req, res, next) {
  try {
    const { rows } = await query(
      `SELECT
         COUNT(*) FILTER (WHERE lida = FALSE)::int AS nao_lidas,
         COUNT(*)::int AS total_30d
        FROM notificacoes
        WHERE pessoa_id = $1
          AND criada_em >= now() - INTERVAL '30 days'`,
      [req.pessoa.id],
    );
    res.json(rows[0]);
  } catch (err) { next(err); }
}

/**
 * POST /api/notificacoes/:id/marcar-lida
 */
export async function marcarLida(req, res, next) {
  try {
    const { rows } = await query(
      `UPDATE notificacoes
          SET lida = TRUE, lida_em = COALESCE(lida_em, now())
        WHERE id = $1 AND pessoa_id = $2
        RETURNING *`,
      [req.params.id, req.pessoa.id],
    );
    if (!rows[0]) throw new NaoEncontradoError('Notificação não encontrada');
    res.json(serializar(rows[0]));
  } catch (err) { next(err); }
}

/**
 * POST /api/notificacoes/marcar-todas-lidas
 */
export async function marcarTodasLidas(req, res, next) {
  try {
    const { rowCount } = await query(
      `UPDATE notificacoes
          SET lida = TRUE, lida_em = COALESCE(lida_em, now())
        WHERE pessoa_id = $1 AND lida = FALSE`,
      [req.pessoa.id],
    );
    res.json({ atualizadas: rowCount });
  } catch (err) { next(err); }
}

/**
 * DELETE /api/notificacoes/:id
 * Remove uma notificação. Útil pra limpeza manual; admin pode futuramente
 * ter um botão "limpar todas".
 */
export async function excluir(req, res, next) {
  try {
    const { rowCount } = await query(
      `DELETE FROM notificacoes WHERE id = $1 AND pessoa_id = $2`,
      [req.params.id, req.pessoa.id],
    );
    if (!rowCount) throw new NaoEncontradoError('Notificação não encontrada');
    res.status(204).send();
  } catch (err) { next(err); }
}
