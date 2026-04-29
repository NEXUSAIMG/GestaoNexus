import { z } from 'zod';
import { query } from '../config/database.js';
import { registrarAcao } from '../utils/audit.js';

/**
 * Configurações financeiras — Sprint 3.
 *
 * Tabela singleton (id fixo = 1). Hoje guarda só o caixa_minimo, mas
 * a ideia é crescer daqui: moeda default, política de distribuição, etc.
 */

const atualizarSchema = z.object({
  caixa_minimo: z.number().min(0),
  caixa_minimo_observacao: z.string().max(500).optional().nullable(),
});

function serializar(r) {
  if (!r) return { caixa_minimo: 0, caixa_minimo_observacao: null, updated_at: null };
  return {
    caixa_minimo: Number(r.caixa_minimo),
    caixa_minimo_observacao: r.caixa_minimo_observacao,
    atualizado_por_id: r.atualizado_por_id,
    updated_at: r.updated_at,
  };
}

/**
 * GET /api/configuracoes-financeiras
 */
export async function obter(_req, res, next) {
  try {
    const { rows } = await query(
      `SELECT caixa_minimo, caixa_minimo_observacao, atualizado_por_id, updated_at
         FROM configuracoes_financeiras WHERE id = 1`,
    );
    res.json(serializar(rows[0]));
  } catch (err) { next(err); }
}

/**
 * PUT /api/configuracoes-financeiras   (admin-only)
 */
export async function atualizar(req, res, next) {
  try {
    const d = atualizarSchema.parse(req.body);

    const { rows } = await query(
      `UPDATE configuracoes_financeiras
          SET caixa_minimo = $1,
              caixa_minimo_observacao = $2,
              atualizado_por_id = $3,
              updated_at = NOW()
        WHERE id = 1
        RETURNING *`,
      [d.caixa_minimo, d.caixa_minimo_observacao?.trim() || null, req.pessoa.id],
    );

    await registrarAcao({
      pessoa_acesso_id: req.pessoa.id,
      acao: 'configuracoes_financeiras.atualizar',
      detalhes: { caixa_minimo: d.caixa_minimo },
      req,
    });

    res.json(serializar(rows[0]));
  } catch (err) { next(err); }
}
