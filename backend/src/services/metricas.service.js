import { query } from '../config/database.js';

/**
 * Sprint 37 — Métricas de fluxo.
 *
 * Este serviço tem uma responsabilidade só: tirar a FOTO diária do board.
 * Sem foto diária não existe CFD — e reconstruir o CFD a partir do log de
 * movimentos toda vez que alguém abre a tela é caro e frágil.
 *
 * O job é idempotente: rodar duas vezes no mesmo dia sobrescreve a linha
 * (ON CONFLICT), não duplica.
 */

/**
 * Grava a foto de hoje: onde está cada card ativo e há quantos dias.
 * Devolve quantas linhas foram gravadas.
 */
export async function tirarSnapshotDiario() {
  const { rowCount } = await query(
    `INSERT INTO cards_snapshot_diario
       (data, card_id, quadro_id, coluna_id, coluna_tipo, dias_na_coluna)
     SELECT CURRENT_DATE,
            c.id,
            c.quadro_id,
            c.coluna_id,
            col.tipo,
            GREATEST(0, EXTRACT(DAY FROM (NOW() - COALESCE(c.coluna_desde, c.criado_em)))::int)
       FROM cards c
       JOIN colunas col ON col.id = c.coluna_id
       JOIN quadros q   ON q.id = c.quadro_id
      WHERE c.arquivado_em IS NULL
        AND col.arquivada_em IS NULL
        AND q.arquivado_em IS NULL
     ON CONFLICT (data, card_id) DO UPDATE
       SET coluna_id      = EXCLUDED.coluna_id,
           coluna_tipo    = EXCLUDED.coluna_tipo,
           dias_na_coluna = EXCLUDED.dias_na_coluna`,
  );
  return rowCount;
}

/**
 * Percentil de uma lista JÁ ORDENADA de números (método do "nearest rank").
 *
 * Por que percentil e não média: cycle time tem cauda longa. A média é
 * puxada por um card que ficou 90 dias parado e não descreve nada.
 * "85% das entregas saem em até X dias" é uma promessa que dá pra fazer.
 */
export function percentil(ordenados, p) {
  if (!ordenados.length) return null;
  const idx = Math.ceil((p / 100) * ordenados.length) - 1;
  return ordenados[Math.min(Math.max(idx, 0), ordenados.length - 1)];
}
