import { z } from 'zod';
import { query } from '../config/database.js';
import { invalidarCacheConfig } from '../services/notificacoes.service.js';
import { registrarAcao } from '../utils/audit.js';

/**
 * Configurações de notificações — Sprint 7.
 *
 * Singleton (id=1). Permite ao admin ligar/desligar avisos por e-mail
 * sem precisar mexer no código.
 */

const atualizarSchema = z.object({
  email_voto_pendente:                   z.boolean().optional(),
  email_documento_finalizado:            z.boolean().optional(),
  email_movimento_socio_criado:          z.boolean().optional(),
  email_distribuicao_criada:             z.boolean().optional(),
  email_resumo_diario_admin:             z.boolean().optional(),
  email_card_atribuido:                  z.boolean().optional(),
  email_card_prazo_amanha:               z.boolean().optional(),
  dias_aviso_conta_vencendo:             z.number().int().min(1).max(30).optional(),
  dias_aviso_movimento_socio_vencendo:   z.number().int().min(1).max(30).optional(),
});

function serializar(r) {
  return {
    email_voto_pendente: r.email_voto_pendente,
    email_documento_finalizado: r.email_documento_finalizado,
    email_movimento_socio_criado: r.email_movimento_socio_criado,
    email_distribuicao_criada: r.email_distribuicao_criada,
    email_resumo_diario_admin: r.email_resumo_diario_admin,
    email_card_atribuido: r.email_card_atribuido,
    email_card_prazo_amanha: r.email_card_prazo_amanha,
    dias_aviso_conta_vencendo: r.dias_aviso_conta_vencendo,
    dias_aviso_movimento_socio_vencendo: r.dias_aviso_movimento_socio_vencendo,
    atualizado_em: r.atualizado_em,
  };
}

/**
 * GET /api/configuracoes-notificacoes
 */
export async function obter(_req, res, next) {
  try {
    const { rows } = await query(`SELECT * FROM configuracoes_notificacoes WHERE id = 1`);
    if (!rows[0]) {
      // Fallback (não deveria acontecer pq a migration insere o singleton)
      await query(`INSERT INTO configuracoes_notificacoes (id) VALUES (1) ON CONFLICT DO NOTHING`);
      const r2 = await query(`SELECT * FROM configuracoes_notificacoes WHERE id = 1`);
      return res.json(serializar(r2.rows[0]));
    }
    res.json(serializar(rows[0]));
  } catch (err) { next(err); }
}

/**
 * PUT /api/configuracoes-notificacoes (admin)
 */
export async function atualizar(req, res, next) {
  try {
    const dados = atualizarSchema.parse(req.body);

    const updates = [];
    const params = [];
    for (const [k, v] of Object.entries(dados)) {
      if (v === undefined) continue;
      params.push(v);
      updates.push(`${k} = $${params.length}`);
    }

    if (updates.length === 0) {
      const { rows } = await query(`SELECT * FROM configuracoes_notificacoes WHERE id = 1`);
      return res.json(serializar(rows[0]));
    }

    params.push(req.pessoa?.id || null);
    updates.push(`atualizado_por_id = $${params.length}`);

    await query(
      `UPDATE configuracoes_notificacoes SET ${updates.join(', ')} WHERE id = 1`,
      params,
    );

    // Invalida cache em memória do service
    invalidarCacheConfig();

    registrarAcao({
      acao: 'configuracoes_notificacoes.atualizou',
      pessoaId: req.pessoa?.id,
      detalhes: dados,
    });

    const { rows } = await query(`SELECT * FROM configuracoes_notificacoes WHERE id = 1`);
    res.json(serializar(rows[0]));
  } catch (err) { next(err); }
}
