import { z } from 'zod';
import { query, pool } from '../config/database.js';
import { AppError, NaoEncontradoError } from '../utils/errors.js';
import { registrarAcao } from '../utils/audit.js';
import {
  CANAIS_MKT, CANAIS_MKT_CHAVES, STATUS_MKT, ORIGENS, hojeBR, addDias,
} from '../services/comercial.regras.js';
import { pessoasAtivas } from '../services/comercial.dados.js';

/**
 * Sprint 42I — Marketing no Comercial.
 *
 * Calendário das ações de marketing com o resultado no funil. A ação se liga
 * aos cartórios pela CAMPANHA: cartório cadastrado com a campanha da ação
 * (comercial_leads.campanha, sem diferenciar maiúsculas) conta para ela.
 *
 * Regras:
 *   - qualquer pessoa do Comercial cria ações e atualiza status/resultado
 *     (quem faz o post marca "feita");
 *   - arquivar ação, lançar o plano em lote e mexer nas datas importantes:
 *     gestão (ou quem criou a ação, para arquivar);
 *   - a campanha nasce do título se ninguém informar, e é única entre as
 *     ações ativas (senão o resultado de uma iria para a outra).
 */

const ehAdmin = (req) => !!req.pessoa?.administrador;
const ehGestor = (req) => !!req.gestorComercial || ehAdmin(req);
function exigirGestor(req, msg) {
  if (!ehGestor(req)) throw new AppError(msg || 'Só a gestão comercial pode fazer isso.', 403, 'so_gestao');
}

const DATA = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Data inválida (use AAAA-MM-DD).');
const opcTexto = (max) => z.string().trim().max(max).optional().nullable().transform((v) => (v ? v : null));

const acaoSchema = z.object({
  titulo: z.string().trim().min(3, 'Escreva o título da ação.').max(200),
  canal: z.enum(CANAIS_MKT_CHAVES, { errorMap: () => ({ message: 'Escolha o canal.' }) }),
  data: DATA,
  status: z.enum(Object.keys(STATUS_MKT)).optional(),
  responsavel_id: z.string().uuid().optional().nullable(),
  responsavel_texto: opcTexto(80),
  campanha: opcTexto(120),
  custo: z.coerce.number().min(0, 'Custo não pode ser negativo.').max(10_000_000).optional(),
  horas: z.coerce.number().min(0).max(10_000).optional().nullable(),
  notas: opcTexto(4000),
  resultado: opcTexto(4000),
});

const SELECT_ACAO = `
  SELECT a.id, a.titulo, a.canal, a.data::text AS data, a.status,
         a.responsavel_id, rp.nome AS responsavel_nome, a.responsavel_texto,
         a.campanha, a.custo::float AS custo, a.horas::float AS horas, a.notas, a.resultado,
         a.feita_em::text AS feita_em, a.criado_por_id, a.criado_em,
         f.cartorios, f.reunioes, f.propostas, f.ganhos, f.pagos, f.receita
    FROM comercial_mkt_acoes a
    LEFT JOIN pessoas_acesso rp ON rp.id = a.responsavel_id
    LEFT JOIN LATERAL (
      SELECT count(*)::int AS cartorios,
             count(*) FILTER (WHERE l.marcos ? 'diagnostico' OR l.etapa IN ('diagnostico','trial','proposta','corregedoria','ganho')
                               OR EXISTS (SELECT 1 FROM comercial_reunioes r WHERE r.lead_id = l.id AND r.tipo = 'diagnostico'
                                                                              AND r.status IN ('agendada','realizada','remarcada')))::int AS reunioes,
             count(*) FILTER (WHERE l.marcos ? 'proposta' OR l.etapa IN ('proposta','corregedoria','ganho'))::int AS propostas,
             count(*) FILTER (WHERE l.etapa = 'ganho')::int AS ganhos,
             count(*) FILTER (WHERE l.pago_em IS NOT NULL)::int AS pagos,
             COALESCE(sum(l.valor_mensal) FILTER (WHERE l.pago_em IS NOT NULL), 0)::float AS receita
        FROM comercial_leads l
       WHERE l.arquivado_em IS NULL AND l.campanha IS NOT NULL AND lower(l.campanha) = lower(a.campanha)
    ) f ON TRUE
`;

/** Campanha a partir do título: curta, sem acento esquisito, legível. */
function campanhaDoTitulo(titulo, data) {
  const base = String(titulo).replace(/\s+/g, ' ').trim().slice(0, 100);
  return `${base} (${data.slice(8, 10)}/${data.slice(5, 7)})`.slice(0, 120);
}

async function campanhaLivre(client, campanha, ignorarId = null) {
  const { rows } = await client.query(
    `SELECT id, titulo FROM comercial_mkt_acoes
      WHERE arquivado_em IS NULL AND lower(campanha) = lower($1) AND ($2::uuid IS NULL OR id <> $2)`,
    [campanha, ignorarId],
  );
  if (rows[0]) {
    throw new AppError(`A campanha "${campanha}" já é da ação "${rows[0].titulo}". Use outro nome para o resultado não se misturar.`, 409, 'campanha_em_uso');
  }
}

/** GET /comercial/marketing?de=&ate= */
export async function painelMarketing(req, res, next) {
  try {
    const hoje = hojeBR();
    const de = /^\d{4}-\d{2}-\d{2}$/.test(req.query.de || '') ? req.query.de : addDias(hoje, -45);
    const ate = /^\d{4}-\d{2}-\d{2}$/.test(req.query.ate || '') ? req.query.ate : addDias(hoje, 120);

    const [{ rows: acoes }, { rows: datas }, { rows: porCanal }, { rows: soltas }] = await Promise.all([
      query(`${SELECT_ACAO} WHERE a.arquivado_em IS NULL AND a.data BETWEEN $1 AND $2 ORDER BY a.data, a.criado_em`, [de, ate]),
      query(`SELECT id, titulo, data::text AS data, nota FROM comercial_mkt_datas WHERE data BETWEEN $1 AND $2 ORDER BY data`, [de, ate]),
      // Resultado por origem dos cartórios que chegaram nos últimos 90 dias
      query(
        `SELECT l.origem, count(*)::int AS cartorios,
                count(*) FILTER (WHERE l.marcos ? 'diagnostico' OR l.etapa IN ('diagnostico','trial','proposta','corregedoria','ganho')
                               OR EXISTS (SELECT 1 FROM comercial_reunioes r WHERE r.lead_id = l.id AND r.tipo = 'diagnostico'
                                                                              AND r.status IN ('agendada','realizada','remarcada')))::int AS reunioes,
                count(*) FILTER (WHERE l.marcos ? 'proposta' OR l.etapa IN ('proposta','corregedoria','ganho'))::int AS propostas,
                count(*) FILTER (WHERE l.etapa = 'ganho')::int AS ganhos,
                count(*) FILTER (WHERE l.pago_em IS NOT NULL)::int AS pagos
           FROM comercial_leads l
          WHERE l.arquivado_em IS NULL AND l.criado_em >= (CURRENT_DATE - 90)
          GROUP BY l.origem ORDER BY count(*) DESC`,
      ),
      // Campanhas digitadas nos cartórios que não batem com nenhuma ação
      query(
        `SELECT l.campanha, count(*)::int AS cartorios
           FROM comercial_leads l
          WHERE l.arquivado_em IS NULL AND l.campanha IS NOT NULL AND l.campanha <> ''
            AND l.criado_em >= (CURRENT_DATE - 120)
            AND NOT EXISTS (SELECT 1 FROM comercial_mkt_acoes a
                             WHERE a.arquivado_em IS NULL AND lower(a.campanha) = lower(l.campanha))
          GROUP BY l.campanha ORDER BY count(*) DESC LIMIT 20`,
      ),
    ]);

    // Resumo do mês corrente
    const mes = hoje.slice(0, 7);
    const doMes = acoes.filter((a) => a.data.slice(0, 7) === mes && a.status !== 'cancelada');
    const ativas = (a) => ['planejada', 'em_andamento'].includes(a.status);
    const resumo = {
      mes,
      acoes_mes: doMes.length,
      feitas_mes: doMes.filter((a) => a.status === 'feita').length,
      atrasadas: acoes.filter((a) => ativas(a) && a.data < hoje).length,
      semana: acoes.filter((a) => ativas(a) && a.data >= hoje && a.data <= addDias(hoje, 6)).length,
      custo_mes: doMes.reduce((s, a) => s + (a.custo || 0), 0),
      cartorios_mes: doMes.reduce((s, a) => s + a.cartorios, 0),
      reunioes_mes: doMes.reduce((s, a) => s + a.reunioes, 0),
      pagos_mes: doMes.reduce((s, a) => s + a.pagos, 0),
    };

    res.json({
      hoje, de, ate, acoes, datas, resumo, campanhas_soltas: soltas,
      por_canal: porCanal.map((c) => ({ ...c, nome: ORIGENS[c.origem] || c.origem })),
      canais: CANAIS_MKT, status: STATUS_MKT,
      pode_gerir: ehGestor(req),
    });
  } catch (err) { next(err); }
}

async function acaoPorId(id, client = { query }) {
  const { rows } = await client.query(`${SELECT_ACAO} WHERE a.id = $1 AND a.arquivado_em IS NULL`, [id]);
  if (!rows[0]) throw new NaoEncontradoError('Ação de marketing não encontrada.');
  return rows[0];
}

/** POST /comercial/marketing/acoes */
export async function criarAcaoMkt(req, res, next) {
  try {
    const d = acaoSchema.parse(req.body);
    const campanha = d.campanha || campanhaDoTitulo(d.titulo, d.data);
    await campanhaLivre({ query }, campanha);
    const status = d.status || 'planejada';
    const { rows } = await query(
      `INSERT INTO comercial_mkt_acoes
         (titulo, canal, data, status, responsavel_id, responsavel_texto, campanha, custo, horas, notas, resultado, feita_em, criado_por_id)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13) RETURNING id`,
      [d.titulo, d.canal, d.data, status, d.responsavel_id || null, d.responsavel_texto, campanha,
        d.custo ?? 0, d.horas ?? null, d.notas, d.resultado, status === 'feita' ? hojeBR() : null, req.pessoa.id],
    );
    await registrarAcao({ pessoa_acesso_id: req.pessoa.id, acao: 'comercial.marketing.criar', detalhes: { id: rows[0].id, titulo: d.titulo }, req });
    res.status(201).json(await acaoPorId(rows[0].id));
  } catch (err) { next(err); }
}

/** PUT /comercial/marketing/acoes/:id */
export async function atualizarAcaoMkt(req, res, next) {
  try {
    const atual = await acaoPorId(req.params.id);
    const d = acaoSchema.partial().parse(req.body);
    if (d.campanha !== undefined && d.campanha && d.campanha.toLowerCase() !== atual.campanha.toLowerCase()) {
      await campanhaLivre({ query }, d.campanha, atual.id);
    }
    const campos = {
      titulo: d.titulo, canal: d.canal, data: d.data, status: d.status,
      responsavel_id: d.responsavel_id, responsavel_texto: d.responsavel_texto,
      campanha: d.campanha || undefined, custo: d.custo, horas: d.horas, notas: d.notas, resultado: d.resultado,
    };
    if (d.status && d.status !== atual.status) campos.feita_em = d.status === 'feita' ? hojeBR() : null;
    const sets = []; const vals = [];
    for (const [k, v] of Object.entries(campos)) {
      if (v === undefined) continue;
      vals.push(v); sets.push(`${k} = $${vals.length}`);
    }
    if (sets.length) {
      vals.push(atual.id);
      await query(`UPDATE comercial_mkt_acoes SET ${sets.join(', ')}, atualizado_em = now() WHERE id = $${vals.length}`, vals);
    }
    res.json(await acaoPorId(atual.id));
  } catch (err) { next(err); }
}

/** POST /comercial/marketing/acoes/:id/arquivar */
export async function arquivarAcaoMkt(req, res, next) {
  try {
    const atual = await acaoPorId(req.params.id);
    if (!ehGestor(req) && atual.criado_por_id !== req.pessoa.id) {
      throw new AppError('Só a gestão ou quem criou a ação pode removê-la. Se ela não vai acontecer, marque como Cancelada.', 403, 'so_gestao');
    }
    await query(`UPDATE comercial_mkt_acoes SET arquivado_em = now() WHERE id = $1`, [atual.id]);
    await registrarAcao({ pessoa_acesso_id: req.pessoa.id, acao: 'comercial.marketing.arquivar', detalhes: { id: atual.id, titulo: atual.titulo }, req });
    res.json({ ok: true });
  } catch (err) { next(err); }
}

const loteSchema = z.object({
  acoes: z.array(z.object({
    titulo: z.string().trim().min(3).max(200),
    canal: z.enum(CANAIS_MKT_CHAVES),
    data: DATA,
    status: z.enum(Object.keys(STATUS_MKT)).optional(),
    responsavel: z.string().trim().max(80).optional().nullable(),
    custo: z.coerce.number().min(0).optional(),
    horas: z.coerce.number().min(0).optional().nullable(),
    notas: z.string().max(4000).optional().nullable(),
  })).max(300),
  datas: z.array(z.object({ titulo: z.string().trim().min(2).max(120), data: DATA, nota: z.string().max(200).optional().nullable() })).max(100).optional(),
});

/**
 * POST /comercial/marketing/lote (gestão) — lança um plano inteiro.
 * Idempotente: pula ação com o mesmo título e data, e data com mesmo título e dia.
 * O responsável é procurado pelo primeiro nome entre as pessoas do Nexus;
 * se não achar (ex.: "Sócio"), fica como texto.
 */
export async function loteMarketing(req, res, next) {
  const client = await pool.connect();
  try {
    exigirGestor(req, 'Só a gestão lança o plano de marketing de uma vez.');
    const d = loteSchema.parse(req.body);
    const pessoas = await pessoasAtivas();
    const primeiro = (n) => String(n || '').trim().split(/\s+/)[0].toLowerCase();
    let criadas = 0; let puladas = 0; let datasCriadas = 0;
    await client.query('BEGIN');
    for (const a of d.acoes) {
      const { rows: ex } = await client.query(
        `SELECT 1 FROM comercial_mkt_acoes WHERE arquivado_em IS NULL AND lower(titulo) = lower($1) AND data = $2`, [a.titulo, a.data],
      );
      if (ex.length) { puladas += 1; continue; }
      const p = a.responsavel ? pessoas.find((x) => primeiro(x.nome) === primeiro(a.responsavel)) : null;
      let campanha = campanhaDoTitulo(a.titulo, a.data);
      const { rows: usada } = await client.query(
        `SELECT 1 FROM comercial_mkt_acoes WHERE arquivado_em IS NULL AND lower(campanha) = lower($1)`, [campanha],
      );
      if (usada.length) campanha = (campanha.slice(0, 112) + ' #' + Math.random().toString(36).slice(2, 6));
      await client.query(
        `INSERT INTO comercial_mkt_acoes
           (titulo, canal, data, status, responsavel_id, responsavel_texto, campanha, custo, horas, notas, criado_por_id)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)`,
        [a.titulo, a.canal, a.data, a.status || 'planejada', p?.id || null, p ? null : (a.responsavel || null),
          campanha, a.custo ?? 0, a.horas ?? null, a.notas || null, req.pessoa.id],
      );
      criadas += 1;
    }
    for (const x of d.datas || []) {
      const { rows: ex } = await client.query(
        `SELECT 1 FROM comercial_mkt_datas WHERE lower(titulo) = lower($1) AND data = $2`, [x.titulo, x.data],
      );
      if (ex.length) continue;
      await client.query(
        `INSERT INTO comercial_mkt_datas (titulo, data, nota, criado_por_id) VALUES ($1,$2,$3,$4)`,
        [x.titulo, x.data, x.nota || null, req.pessoa.id],
      );
      datasCriadas += 1;
    }
    await client.query('COMMIT');
    await registrarAcao({ pessoa_acesso_id: req.pessoa.id, acao: 'comercial.marketing.lote', detalhes: { criadas, puladas, datas: datasCriadas }, req });
    res.status(201).json({ criadas, puladas, datas: datasCriadas });
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    next(err);
  } finally { client.release(); }
}

/** POST /comercial/marketing/datas (gestão) */
export async function criarDataMkt(req, res, next) {
  try {
    exigirGestor(req, 'Só a gestão marca as datas importantes.');
    const d = z.object({ titulo: z.string().trim().min(2, 'Escreva o nome da data.').max(120), data: DATA, nota: opcTexto(200) }).parse(req.body);
    const { rows } = await query(
      `INSERT INTO comercial_mkt_datas (titulo, data, nota, criado_por_id) VALUES ($1,$2,$3,$4)
       RETURNING id, titulo, data::text AS data, nota`,
      [d.titulo, d.data, d.nota, req.pessoa.id],
    );
    res.status(201).json(rows[0]);
  } catch (err) { next(err); }
}

/** DELETE /comercial/marketing/datas/:id (gestão) */
export async function removerDataMkt(req, res, next) {
  try {
    exigirGestor(req, 'Só a gestão mexe nas datas importantes.');
    const { rowCount } = await query(`DELETE FROM comercial_mkt_datas WHERE id = $1`, [req.params.id]);
    if (!rowCount) throw new NaoEncontradoError('Data não encontrada.');
    res.json({ ok: true });
  } catch (err) { next(err); }
}

/** Campanhas para o cadastro do cartório (lista no campo "Campanha"). */
export async function campanhasAtivas() {
  const hoje = hojeBR();
  const { rows } = await query(
    `SELECT campanha, titulo, canal, data::text AS data FROM comercial_mkt_acoes
      WHERE arquivado_em IS NULL AND status <> 'cancelada' AND data BETWEEN $1 AND $2
      ORDER BY data DESC LIMIT 60`,
    [addDias(hoje, -120), addDias(hoje, 30)],
  );
  return rows.map((r) => ({ ...r, origem: CANAIS_MKT[r.canal]?.origem || null }));
}
