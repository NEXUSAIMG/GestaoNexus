import { z } from 'zod';
import { query, pool } from '../config/database.js';
import { AppError, NaoEncontradoError } from '../utils/errors.js';
import { registrarAcao } from '../utils/audit.js';
import { hojeBR, addDias, mesDe, MOTIVOS_NAO_CONTATAR, JANELAS } from '../services/comercial.regras.js';
import {
  calcularPainel, placar, carregarFeriados, soDigitos, normEmail, normTelefone,
} from '../services/comercial.dados.js';

/**
 * Módulo Comercial — gestão (Sprint 42B).
 *
 *   - Lista de não contatar (qualquer um inclui; só admin remove)
 *   - Rotina da gestão: checagens 8h30/12h30/17h, 1:1 de sexta, planos de ação
 *   - Placar do período por pessoa (atividade × resultado)
 *   - Feriados
 *
 * "Gestão" = administrador do Nexus.
 */

const ehAdmin = (req) => !!req.pessoa?.administrador;
function exigirGestao(req) {
  if (!ehAdmin(req)) throw new AppError('Só a gestão (admin) pode fazer isso.', 403, 'so_admin');
}
const dataISO = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const txt = (max) => z.string().max(max).nullable().optional()
  .transform((v) => (v == null || String(v).trim() === '' ? null : String(v).trim()));

// ---------------------------------------------------------------------------
// Não contatar
// ---------------------------------------------------------------------------
function normalizarNc(tipo, valor) {
  const v = String(valor || '').trim();
  if (tipo === 'email') return normEmail(v);
  if (tipo === 'dominio') return v.toLowerCase().replace(/^@/, '') || null;
  if (tipo === 'telefone') return normTelefone(v);
  return soDigitos(v);
}

/** GET /comercial/nao-contatar?busca= */
export async function listarNaoContatar(req, res, next) {
  try {
    const params = []; let filtro = 'nc.removido_em IS NULL';
    if (req.query.busca) { params.push('%' + String(req.query.busca).toLowerCase() + '%'); filtro += ' AND nc.valor ILIKE $1'; }
    const { rows } = await query(
      `SELECT nc.id, nc.tipo, nc.valor, nc.motivo, nc.observacao, nc.criado_em, p.nome AS criado_por_nome
         FROM comercial_nao_contatar nc LEFT JOIN pessoas_acesso p ON p.id = nc.criado_por_id
        WHERE ${filtro} ORDER BY nc.criado_em DESC LIMIT 1000`,
      params,
    );
    res.json(rows);
  } catch (err) { next(err); }
}

/** POST /comercial/nao-contatar {tipo, valor, motivo, observacao} ou {itens:[...]} */
export async function incluirNaoContatar(req, res, next) {
  try {
    const item = z.object({
      tipo: z.enum(['email', 'telefone', 'cns', 'cnpj', 'dominio']),
      valor: z.string().trim().min(3).max(255),
      motivo: z.enum(Object.keys(MOTIVOS_NAO_CONTATAR)),
      observacao: txt(1000),
    });
    const corpo = z.union([z.object({ itens: z.array(item).min(1).max(5000) }), item]).parse(req.body || {});
    const itens = corpo.itens || [corpo];
    let incluidos = 0;
    for (const it of itens) {
      const v = normalizarNc(it.tipo, it.valor);
      if (!v) continue;
      const { rowCount } = await query(
        `INSERT INTO comercial_nao_contatar (tipo, valor, motivo, observacao, criado_por_id)
         VALUES ($1,$2,$3,$4,$5) ON CONFLICT (tipo, valor) WHERE removido_em IS NULL DO NOTHING`,
        [it.tipo, v, it.motivo, it.observacao ?? null, req.pessoa.id],
      );
      incluidos += rowCount;
    }
    await registrarAcao({ pessoa_acesso_id: req.pessoa.id, acao: 'comercial.nao_contatar.incluir', detalhes: { incluidos, total: itens.length }, req });
    res.status(201).json({ incluidos, ja_existiam: itens.length - incluidos });
  } catch (err) { next(err); }
}

/** DELETE /comercial/nao-contatar/:id — só admin (remoção lógica, fica registrada) */
export async function removerNaoContatar(req, res, next) {
  try {
    exigirGestao(req);
    const { rowCount } = await query(
      `UPDATE comercial_nao_contatar SET removido_em = now(), removido_por_id = $2 WHERE id = $1 AND removido_em IS NULL`,
      [req.params.id, req.pessoa.id],
    );
    if (!rowCount) throw new NaoEncontradoError('Registro não encontrado');
    await registrarAcao({ pessoa_acesso_id: req.pessoa.id, acao: 'comercial.nao_contatar.remover', detalhes: { id: req.params.id }, req });
    res.status(204).end();
  } catch (err) { next(err); }
}

// ---------------------------------------------------------------------------
// Checagens diárias (8h30, 12h30, 17h)
// ---------------------------------------------------------------------------

/** POST /comercial/checagens {janela, pessoa_id, observacao} — fotografa o semáforo */
export async function registrarChecagem(req, res, next) {
  try {
    exigirGestao(req);
    const b = z.object({
      janela: z.enum(Object.keys(JANELAS)),
      pessoa_id: z.string().uuid(),
      observacao: txt(2000),
    }).parse(req.body || {});
    const painel = await calcularPainel();
    const s = painel.supervisao.find((x) => x.pessoa.id === b.pessoa_id);
    if (!s) throw new AppError('Pessoa sem carteira ativa nem meta: nada para checar.');
    if (s.sinal !== 'ok' && !b.observacao) {
      throw new AppError('Semáforo não está verde: registre o que foi combinado com a pessoa.', 400, 'observacao_obrigatoria');
    }
    await query(
      `INSERT INTO comercial_checagens (data, janela, pessoa_id, gestor_id, sinal, indice, feitos, pendentes, observacao)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
       ON CONFLICT (data, janela, pessoa_id) DO UPDATE SET
         gestor_id = EXCLUDED.gestor_id, sinal = EXCLUDED.sinal, indice = EXCLUDED.indice,
         feitos = EXCLUDED.feitos, pendentes = EXCLUDED.pendentes, observacao = EXCLUDED.observacao, criado_em = now()`,
      [hojeBR(), b.janela, b.pessoa_id, req.pessoa.id, s.sinal, s.indice, s.feitos, s.pendentes, b.observacao ?? null],
    );
    res.status(201).json({ ok: true, sinal: s.sinal });
  } catch (err) { next(err); }
}

/** GET /comercial/checagens?de=&ate= — histórico (cumprimento da rotina) */
export async function listarChecagens(req, res, next) {
  try {
    const ate = req.query.ate || hojeBR();
    const de = req.query.de || addDias(ate, -13);
    const { rows } = await query(
      `SELECT c.data::text AS data, c.janela, c.pessoa_id, p.nome AS pessoa_nome, c.sinal, c.indice,
              c.feitos, c.pendentes, c.observacao, c.criado_em, g.nome AS gestor_nome
         FROM comercial_checagens c
         JOIN pessoas_acesso p ON p.id = c.pessoa_id
         LEFT JOIN pessoas_acesso g ON g.id = c.gestor_id
        WHERE c.data BETWEEN $1 AND $2 ORDER BY c.data DESC, c.janela, p.nome`,
      [de, ate],
    );
    res.json({ de, ate, checagens: rows });
  } catch (err) { next(err); }
}

// ---------------------------------------------------------------------------
// 1:1 e planos de ação
// ---------------------------------------------------------------------------

/** POST /comercial/1a1 {pessoa_id, bloqueios, combinados, acoes:[{acao, prazo}]} */
export async function registrar1a1(req, res, next) {
  const client = await pool.connect();
  try {
    exigirGestao(req);
    const b = z.object({
      pessoa_id: z.string().uuid(),
      bloqueios: txt(4000),
      combinados: z.string().trim().min(5, 'registre o que foi combinado').max(4000),
      acoes: z.array(z.object({ acao: z.string().trim().min(3).max(1000), prazo: dataISO })).max(20).optional().default([]),
    }).parse(req.body || {});
    const hoje = hojeBR();
    const sem = await placar(addDias(hoje, -6), hoje);
    const numeros = sem.find((x) => x.id === b.pessoa_id) || {};
    await client.query('BEGIN');
    const { rows } = await client.query(
      `INSERT INTO comercial_1a1 (data, pessoa_id, gestor_id, numeros, bloqueios, combinados)
       VALUES ($1,$2,$3,$4::jsonb,$5,$6) RETURNING id`,
      [hoje, b.pessoa_id, req.pessoa.id, JSON.stringify(numeros), b.bloqueios ?? null, b.combinados],
    );
    for (const a of b.acoes) {
      if (a.prazo < hoje) throw new AppError('Prazo de ação no passado.');
      await client.query(
        `INSERT INTO comercial_acoes (pessoa_id, um_a_um_id, acao, prazo, criado_por_id) VALUES ($1,$2,$3,$4,$5)`,
        [b.pessoa_id, rows[0].id, a.acao, a.prazo, req.pessoa.id],
      );
    }
    await client.query('COMMIT');
    res.status(201).json({ id: rows[0].id });
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    next(err);
  } finally { client.release(); }
}

/** GET /comercial/1a1?pessoa_id= */
export async function listar1a1(req, res, next) {
  try {
    const params = []; let filtro = 'TRUE';
    if (req.query.pessoa_id) { params.push(req.query.pessoa_id); filtro = 'u.pessoa_id = $1'; }
    const { rows } = await query(
      `SELECT u.id, u.data::text AS data, u.pessoa_id, p.nome AS pessoa_nome, g.nome AS gestor_nome,
              u.numeros, u.bloqueios, u.combinados,
              COALESCE((SELECT json_agg(json_build_object('id', a.id, 'acao', a.acao, 'prazo', a.prazo::text, 'status', a.status) ORDER BY a.prazo)
                          FROM comercial_acoes a WHERE a.um_a_um_id = u.id), '[]'::json) AS acoes
         FROM comercial_1a1 u JOIN pessoas_acesso p ON p.id = u.pessoa_id LEFT JOIN pessoas_acesso g ON g.id = u.gestor_id
        WHERE ${filtro} ORDER BY u.data DESC, p.nome LIMIT 100`,
      params,
    );
    res.json(rows);
  } catch (err) { next(err); }
}

/** POST /comercial/acoes {pessoa_id, acao, prazo} */
export async function criarAcao(req, res, next) {
  try {
    exigirGestao(req);
    const b = z.object({ pessoa_id: z.string().uuid(), acao: z.string().trim().min(3).max(1000), prazo: dataISO }).parse(req.body || {});
    if (b.prazo < hojeBR()) throw new AppError('Prazo no passado.');
    const { rows } = await query(
      `INSERT INTO comercial_acoes (pessoa_id, acao, prazo, criado_por_id) VALUES ($1,$2,$3,$4) RETURNING id`,
      [b.pessoa_id, b.acao, b.prazo, req.pessoa.id],
    );
    res.status(201).json({ id: rows[0].id });
  } catch (err) { next(err); }
}

/** PUT /comercial/acoes/:id {status: feita|cancelada} — a pessoa conclui; só gestão cancela */
export async function atualizarAcao(req, res, next) {
  try {
    const b = z.object({ status: z.enum(['feita', 'cancelada']) }).parse(req.body || {});
    const { rows } = await query(`SELECT id, pessoa_id, status FROM comercial_acoes WHERE id = $1`, [req.params.id]);
    if (!rows.length) throw new NaoEncontradoError('Ação não encontrada');
    if (rows[0].status !== 'aberta') throw new AppError('Ação já encerrada.');
    if (b.status === 'cancelada') exigirGestao(req);
    else if (rows[0].pessoa_id !== req.pessoa.id && !ehAdmin(req)) throw new AppError('Só a própria pessoa ou a gestão conclui a ação.', 403);
    await query(`UPDATE comercial_acoes SET status = $2, concluida_em = now() WHERE id = $1`, [req.params.id, b.status]);
    res.json({ ok: true });
  } catch (err) { next(err); }
}

// ---------------------------------------------------------------------------
// Placar
// ---------------------------------------------------------------------------

/** GET /comercial/placar?de=&ate= (padrão: mês corrente) */
export async function obterPlacar(req, res, next) {
  try {
    const hoje = hojeBR();
    const de = /^\d{4}-\d{2}-\d{2}$/.test(req.query.de || '') ? req.query.de : mesDe(hoje) + '-01';
    const ate = /^\d{4}-\d{2}-\d{2}$/.test(req.query.ate || '') ? req.query.ate : hoje;
    const { rows: cumpr } = await query(
      `SELECT pessoa_id, count(*)::int AS checagens FROM comercial_checagens WHERE data BETWEEN $1 AND $2 GROUP BY pessoa_id`,
      [de, ate],
    );
    const { rows: ac } = await query(
      `SELECT pessoa_id,
              count(*) FILTER (WHERE status = 'aberta' AND prazo < $1)::int AS acoes_vencidas,
              count(*) FILTER (WHERE status = 'aberta')::int AS acoes_abertas,
              count(*) FILTER (WHERE status = 'feita')::int AS acoes_feitas
         FROM comercial_acoes GROUP BY pessoa_id`,
      [hoje],
    );
    const ch = new Map(cumpr.map((r) => [r.pessoa_id, r.checagens]));
    const am = new Map(ac.map((r) => [r.pessoa_id, r]));
    const linhas = (await placar(de, ate)).map((r) => ({
      ...r,
      checagens: ch.get(r.id) || 0,
      acoes_abertas: am.get(r.id)?.acoes_abertas || 0,
      acoes_vencidas: am.get(r.id)?.acoes_vencidas || 0,
      acoes_feitas: am.get(r.id)?.acoes_feitas || 0,
    }));
    res.json({ de, ate, linhas });
  } catch (err) { next(err); }
}

// ---------------------------------------------------------------------------
// Feriados
// ---------------------------------------------------------------------------

/** POST /comercial/feriados {data, nome, abrangencia} — só admin */
export async function incluirFeriado(req, res, next) {
  try {
    exigirGestao(req);
    const b = z.object({ data: dataISO, nome: z.string().trim().min(2).max(120), abrangencia: z.enum(['nacional', 'estadual', 'municipal', 'empresa']).default('municipal') }).parse(req.body || {});
    await query(
      `INSERT INTO comercial_feriados (data, nome, abrangencia) VALUES ($1,$2,$3)
       ON CONFLICT (data) DO UPDATE SET nome = EXCLUDED.nome, abrangencia = EXCLUDED.abrangencia`,
      [b.data, b.nome, b.abrangencia],
    );
    await carregarFeriados(true);
    res.status(201).json({ ok: true });
  } catch (err) { next(err); }
}

/** DELETE /comercial/feriados/:data — só admin */
export async function removerFeriado(req, res, next) {
  try {
    exigirGestao(req);
    await query(`DELETE FROM comercial_feriados WHERE data = $1`, [req.params.data]);
    await carregarFeriados(true);
    res.status(204).end();
  } catch (err) { next(err); }
}
