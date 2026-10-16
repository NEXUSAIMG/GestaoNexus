import { z } from 'zod';
import { query } from '../config/database.js';
import { AppError, NaoEncontradoError } from '../utils/errors.js';
import { registrarAcao } from '../utils/audit.js';
import { hojeBR, addDias } from '../services/comercial.regras.js';
import { rankingEmails } from '../services/comercial.emails.js';

/**
 * Sprint 44 — E-mails mais utilizados.
 *
 * Biblioteca de modelos de e-mail mantida pela gestão comercial e ranking de
 * uso (equipe e pessoa). O vendedor escolhe o modelo ao registrar o toque de
 * e-mail; o ranking conta esses toques.
 *
 * Regras:
 *   - qualquer pessoa do Comercial lê os modelos e o ranking;
 *   - criar, editar e arquivar modelo: só a gestão comercial;
 *   - modelo arquivado some da escolha, mas o histórico de uso continua
 *     contando no ranking do período em que foi usado.
 */

const ehGestor = (req) => !!req.gestorComercial || !!req.pessoa?.administrador;
function exigirGestor(req) {
  if (!ehGestor(req)) throw new AppError('Só a gestão comercial mexe nos modelos de e-mail.', 403, 'so_gestao');
}

const DATA = /^\d{4}-\d{2}-\d{2}$/;
const texto = (min, max, msg) => z.string().trim().min(min, msg).max(max);

const modeloSchema = z.object({
  titulo: texto(3, 120, 'Dê um nome ao modelo (pelo menos 3 letras).'),
  assunto: texto(3, 200, 'Escreva o assunto do e-mail.'),
  corpo: texto(10, 20000, 'Escreva o texto do e-mail.'),
  uso: z.string().trim().max(300).optional().nullable().transform((v) => (v ? v : null)),
});

const SELECT_MODELO = `
  SELECT m.id, m.chave, m.titulo, m.assunto, m.corpo, m.uso,
         m.criado_em, m.atualizado_em, m.arquivado_em, p.nome AS criado_por_nome
    FROM comercial_modelos_email m
    LEFT JOIN pessoas_acesso p ON p.id = m.criado_por_id
`;

/** Modelos ativos (para o registro do toque e a aba Scripts). */
export async function modelosAtivos() {
  const { rows } = await query(`${SELECT_MODELO} WHERE m.arquivado_em IS NULL ORDER BY (m.chave IS NULL), m.chave, lower(m.titulo)`);
  return rows;
}

async function tituloLivre(titulo, ignorarId = null) {
  const { rows } = await query(
    `SELECT 1 FROM comercial_modelos_email WHERE arquivado_em IS NULL AND lower(titulo) = lower($1) AND ($2::uuid IS NULL OR id <> $2)`,
    [titulo, ignorarId],
  );
  if (rows.length) throw new AppError(`Já existe um modelo chamado "${titulo}". Use outro nome para o ranking não confundir.`, 409, 'titulo_em_uso');
}

/** GET /comercial/modelos-email?arquivados=1 */
export async function listarModelos(req, res, next) {
  try {
    if (req.query.arquivados === '1' && ehGestor(req)) {
      const { rows } = await query(`${SELECT_MODELO} ORDER BY (m.arquivado_em IS NOT NULL), lower(m.titulo)`);
      return res.json(rows);
    }
    res.json(await modelosAtivos());
  } catch (err) { next(err); }
}

/** POST /comercial/modelos-email */
export async function criarModelo(req, res, next) {
  try {
    exigirGestor(req);
    const d = modeloSchema.parse(req.body || {});
    await tituloLivre(d.titulo);
    const { rows } = await query(
      `INSERT INTO comercial_modelos_email (titulo, assunto, corpo, uso, criado_por_id) VALUES ($1,$2,$3,$4,$5) RETURNING id`,
      [d.titulo, d.assunto, d.corpo, d.uso, req.pessoa.id],
    );
    await registrarAcao({ pessoa_acesso_id: req.pessoa.id, acao: 'comercial.modelo_email.criar', detalhes: { id: rows[0].id, titulo: d.titulo }, req });
    const { rows: [m] } = await query(`${SELECT_MODELO} WHERE m.id = $1`, [rows[0].id]);
    res.status(201).json(m);
  } catch (err) { next(err); }
}

/** PUT /comercial/modelos-email/:id */
export async function atualizarModelo(req, res, next) {
  try {
    exigirGestor(req);
    const d = modeloSchema.parse(req.body || {});
    const { rows: [atual] } = await query(`SELECT id, arquivado_em FROM comercial_modelos_email WHERE id = $1`, [req.params.id]);
    if (!atual) throw new NaoEncontradoError('Modelo não encontrado');
    if (atual.arquivado_em) throw new AppError('Modelo arquivado não pode ser editado.', 400, 'arquivado');
    await tituloLivre(d.titulo, atual.id);
    await query(
      `UPDATE comercial_modelos_email SET titulo = $2, assunto = $3, corpo = $4, uso = $5, atualizado_em = now() WHERE id = $1`,
      [atual.id, d.titulo, d.assunto, d.corpo, d.uso],
    );
    await registrarAcao({ pessoa_acesso_id: req.pessoa.id, acao: 'comercial.modelo_email.editar', detalhes: { id: atual.id, titulo: d.titulo }, req });
    const { rows: [m] } = await query(`${SELECT_MODELO} WHERE m.id = $1`, [atual.id]);
    res.json(m);
  } catch (err) { next(err); }
}

/** POST /comercial/modelos-email/:id/arquivar */
export async function arquivarModelo(req, res, next) {
  try {
    exigirGestor(req);
    const { rows } = await query(
      `UPDATE comercial_modelos_email SET arquivado_em = now(), arquivado_por_id = $2
        WHERE id = $1 AND arquivado_em IS NULL RETURNING id, titulo`,
      [req.params.id, req.pessoa.id],
    );
    if (!rows.length) throw new NaoEncontradoError('Modelo não encontrado (ou já arquivado)');
    await registrarAcao({ pessoa_acesso_id: req.pessoa.id, acao: 'comercial.modelo_email.arquivar', detalhes: rows[0], req });
    res.json({ ok: true });
  } catch (err) { next(err); }
}

/** GET /comercial/emails/ranking?de=&ate= */
export async function obterRankingEmails(req, res, next) {
  try {
    const hoje = hojeBR();
    let de = DATA.test(req.query.de || '') ? req.query.de : hoje.slice(0, 8) + '01';
    let ate = DATA.test(req.query.ate || '') ? req.query.ate : hoje;
    if (de > ate) [de, ate] = [ate, de];
    if (de < addDias(ate, -400)) de = addDias(ate, -400); // período de no máximo ~13 meses
    res.json(await rankingEmails(de, ate));
  } catch (err) { next(err); }
}
