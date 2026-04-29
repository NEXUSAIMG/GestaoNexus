import { z } from 'zod';
import { query, pool } from '../config/database.js';
import { NaoEncontradoError, AppError, ConflitoError } from '../utils/errors.js';
import { registrarAcao } from '../utils/audit.js';

/**
 * CRUD de representações (vínculo pessoa ↔ sócio).
 *
 * Regras:
 *   - Só pode existir UMA representação ATIVA entre a mesma pessoa e o mesmo sócio.
 *     (Histórico é preservado: ao revogar, marcamos ativo=false e podemos criar outra.)
 *   - Revogar ≠ apagar. Revogar é o caminho normal; só admins criam/editam/revogam.
 *   - O token do representante só enxerga um sócio por vez. Para "trocar de chapéu"
 *     o frontend chama /auth/trocar-contexto.
 */

// Regex de data ISO (YYYY-MM-DD). Não validamos calendário aqui;
// o Postgres rejeita data inválida na hora do CAST.
const dataIso = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Data deve estar no formato YYYY-MM-DD');

const criarSchema = z.object({
  pessoa_acesso_id: z.string().uuid('Pessoa inválida'),
  socio_id: z.string().uuid('Sócio inválido'),
  papel: z.enum(['titular', 'representante', 'procurador']),

  pode_ver_financeiro: z.boolean().default(true),
  pode_votar: z.boolean().default(false),
  pode_aprovar_atas: z.boolean().default(false),
  pode_aprovar_distribuicoes: z.boolean().default(false),

  // data_inicio: NUNCA pode ser null (coluna NOT NULL com default).
  //   - omitido     → backend usa CURRENT_DATE
  //   - YYYY-MM-DD  → usa o valor
  data_inicio: dataIso.optional(),
  // data_fim: pode ser null (vigência aberta).
  data_fim: dataIso.nullable().optional(),

  documento_procuracao_url: z.string().url().max(2048).optional().nullable(),
  observacoes: z.string().max(2000).optional().nullable(),
});

const atualizarSchema = z.object({
  papel: z.enum(['titular', 'representante', 'procurador']).optional(),
  pode_ver_financeiro: z.boolean().optional(),
  pode_votar: z.boolean().optional(),
  pode_aprovar_atas: z.boolean().optional(),
  pode_aprovar_distribuicoes: z.boolean().optional(),
  // No update, data_inicio também não aceita null — pra não violar o NOT NULL.
  data_inicio: dataIso.optional(),
  data_fim: dataIso.nullable().optional(),
  documento_procuracao_url: z.string().url().max(2048).optional().nullable(),
  observacoes: z.string().max(2000).optional().nullable(),
});

const revogarSchema = z.object({
  motivo_revogacao: z.string().min(3).max(500),
});

function serializar(r) {
  return {
    id: r.id,
    pessoa_acesso_id: r.pessoa_acesso_id,
    pessoa_nome: r.pessoa_nome ?? null,
    pessoa_email: r.pessoa_email ?? null,
    socio_id: r.socio_id,
    socio_nome: r.socio_nome ?? null,
    socio_tipo_pessoa: r.socio_tipo_pessoa ?? null,
    papel: r.papel,
    poderes: {
      ver_financeiro: r.pode_ver_financeiro,
      votar: r.pode_votar,
      aprovar_atas: r.pode_aprovar_atas,
      aprovar_distribuicoes: r.pode_aprovar_distribuicoes,
    },
    data_inicio: r.data_inicio,
    data_fim: r.data_fim,
    documento_procuracao_url: r.documento_procuracao_url,
    observacoes: r.observacoes,
    ativo: r.ativo,
    revogado_em: r.revogado_em,
    revogado_por_id: r.revogado_por_id,
    motivo_revogacao: r.motivo_revogacao,
    created_at: r.created_at,
    updated_at: r.updated_at,
  };
}

const SELECT_COMPLETO = `
  SELECT r.id, r.pessoa_acesso_id, r.socio_id, r.papel,
         r.pode_ver_financeiro, r.pode_votar,
         r.pode_aprovar_atas, r.pode_aprovar_distribuicoes,
         r.data_inicio, r.data_fim,
         r.documento_procuracao_url, r.observacoes,
         r.ativo, r.revogado_em, r.revogado_por_id, r.motivo_revogacao,
         r.created_at, r.updated_at,
         p.nome AS pessoa_nome, p.email AS pessoa_email,
         s.nome AS socio_nome, s.tipo_pessoa AS socio_tipo_pessoa
    FROM representacoes r
    JOIN pessoas_acesso p ON p.id = r.pessoa_acesso_id
    JOIN socios s         ON s.id = r.socio_id
`;

/**
 * GET /api/representacoes
 *
 * Filtros opcionais:
 *   ?pessoa_id=<uuid>
 *   ?socio_id=<uuid>
 *   ?somente_ativas=true  (default: mostra tudo)
 */
export async function listar(req, res, next) {
  try {
    const partes = [];
    const valores = [];

    if (req.query.pessoa_id) {
      valores.push(req.query.pessoa_id);
      partes.push(`r.pessoa_acesso_id = $${valores.length}`);
    }
    if (req.query.socio_id) {
      valores.push(req.query.socio_id);
      partes.push(`r.socio_id = $${valores.length}`);
    }
    if (req.query.somente_ativas === 'true') {
      partes.push(`r.ativo = TRUE`);
    }

    const where = partes.length ? `WHERE ${partes.join(' AND ')}` : '';
    const sql = `${SELECT_COMPLETO} ${where} ORDER BY r.ativo DESC, s.nome, p.nome`;

    const { rows } = await query(sql, valores);
    res.json(rows.map(serializar));
  } catch (err) { next(err); }
}

export async function obter(req, res, next) {
  try {
    const { rows } = await query(
      `${SELECT_COMPLETO} WHERE r.id = $1`,
      [req.params.id],
    );
    if (!rows[0]) throw new NaoEncontradoError('Representação não encontrada');
    res.json(serializar(rows[0]));
  } catch (err) { next(err); }
}

/**
 * POST /api/representacoes
 * Cria uma nova representação. Admin-only (garantido na rota).
 */
export async function criar(req, res, next) {
  const client = await pool.connect();
  try {
    const d = criarSchema.parse(req.body);

    await client.query('BEGIN');

    // Confere que pessoa e sócio existem e estão ativos.
    const { rows: pessoas } = await client.query(
      `SELECT id, ativo FROM pessoas_acesso WHERE id = $1`,
      [d.pessoa_acesso_id],
    );
    if (!pessoas[0]) throw new NaoEncontradoError('Pessoa de acesso não encontrada');
    if (!pessoas[0].ativo) throw new AppError('Pessoa de acesso está inativa', 400);

    const { rows: socios } = await client.query(
      `SELECT id, ativo FROM socios WHERE id = $1`,
      [d.socio_id],
    );
    if (!socios[0]) throw new NaoEncontradoError('Sócio não encontrado');
    if (!socios[0].ativo) throw new AppError('Sócio está inativo', 400);

    // Valida datas — usando a mesma data_inicio efetiva que o INSERT vai usar
    // (CURRENT_DATE quando o cliente não enviar nada).
    const dataInicioEfetiva = d.data_inicio || new Date().toISOString().slice(0, 10);
    if (d.data_fim && d.data_fim < dataInicioEfetiva) {
      throw new AppError('Data fim não pode ser anterior à data início', 400);
    }

    // Checa se já existe uma representação ATIVA entre essa dupla.
    const { rows: existentes } = await client.query(
      `SELECT id FROM representacoes
        WHERE pessoa_acesso_id = $1 AND socio_id = $2 AND ativo = TRUE`,
      [d.pessoa_acesso_id, d.socio_id],
    );
    if (existentes[0]) {
      throw new ConflitoError(
        'Já existe uma representação ativa entre esta pessoa e este sócio. ' +
        'Revogue a atual antes de criar outra.',
      );
    }

    const { rows: inseridas } = await client.query(
      `INSERT INTO representacoes
         (pessoa_acesso_id, socio_id, papel,
          pode_ver_financeiro, pode_votar,
          pode_aprovar_atas, pode_aprovar_distribuicoes,
          data_inicio, data_fim,
          documento_procuracao_url, observacoes,
          criado_por_id)
       VALUES ($1, $2, $3, $4, $5, $6, $7,
               COALESCE($8::date, CURRENT_DATE), $9::date,
               $10, $11, $12)
       RETURNING id`,
      [
        d.pessoa_acesso_id, d.socio_id, d.papel,
        d.pode_ver_financeiro, d.pode_votar,
        d.pode_aprovar_atas, d.pode_aprovar_distribuicoes,
        d.data_inicio || null, d.data_fim || null,
        d.documento_procuracao_url ?? null,
        d.observacoes ?? null,
        req.pessoa.id,
      ],
    );

    const { rows: completas } = await client.query(
      `${SELECT_COMPLETO} WHERE r.id = $1`,
      [inseridas[0].id],
    );

    await client.query('COMMIT');

    await registrarAcao({
      pessoa_acesso_id: req.pessoa.id,
      socio_id: d.socio_id,
      acao: 'representacao.criar',
      detalhes: {
        representacao_id: inseridas[0].id,
        pessoa_acesso_id: d.pessoa_acesso_id,
        papel: d.papel,
      },
      req,
    });

    res.status(201).json(serializar(completas[0]));
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    next(err);
  } finally {
    client.release();
  }
}

/**
 * PUT /api/representacoes/:id
 * Altera papel/poderes/vigência/procuração da representação.
 * Não permite trocar pessoa/sócio — para isso, revogue e crie outra.
 */
export async function atualizar(req, res, next) {
  try {
    const d = atualizarSchema.parse(req.body);
    const campos = Object.keys(d);
    if (campos.length === 0) throw new AppError('Nenhum campo para atualizar', 400);

    // Confere se a representação existe e está ativa.
    const { rows: atuais } = await query(
      `SELECT id, ativo, data_inicio, data_fim
         FROM representacoes WHERE id = $1`,
      [req.params.id],
    );
    if (!atuais[0]) throw new NaoEncontradoError('Representação não encontrada');
    if (!atuais[0].ativo) throw new AppError('Não é possível alterar uma representação revogada', 400);

    // Checagem coerente de datas, considerando os valores atuais.
    const dataInicio = d.data_inicio !== undefined ? d.data_inicio : atuais[0].data_inicio;
    const dataFim = d.data_fim !== undefined ? d.data_fim : atuais[0].data_fim;
    if (dataInicio && dataFim && new Date(dataFim) < new Date(dataInicio)) {
      throw new AppError('Data fim não pode ser anterior à data início', 400);
    }

    const sets = campos.map((c, i) => `${c} = $${i + 1}`).join(', ');
    const valores = campos.map((c) => d[c]);
    valores.push(req.params.id);

    await query(
      `UPDATE representacoes SET ${sets}, updated_at = NOW()
        WHERE id = $${valores.length}`,
      valores,
    );

    const { rows: completas } = await query(
      `${SELECT_COMPLETO} WHERE r.id = $1`,
      [req.params.id],
    );

    await registrarAcao({
      pessoa_acesso_id: req.pessoa.id,
      socio_id: completas[0].socio_id,
      acao: 'representacao.atualizar',
      detalhes: { representacao_id: req.params.id, campos },
      req,
    });

    res.json(serializar(completas[0]));
  } catch (err) { next(err); }
}

/**
 * POST /api/representacoes/:id/revogar
 *
 * Caminho oficial para "desligar" uma representação.
 * Mantém o registro histórico: marca ativo=false, grava revogado_em,
 * revogado_por_id e motivo. Após revogada, não deve ser editada.
 */
export async function revogar(req, res, next) {
  try {
    const { motivo_revogacao } = revogarSchema.parse(req.body);

    const { rows: atuais } = await query(
      `SELECT id, ativo, pessoa_acesso_id, socio_id
         FROM representacoes WHERE id = $1`,
      [req.params.id],
    );
    if (!atuais[0]) throw new NaoEncontradoError('Representação não encontrada');
    if (!atuais[0].ativo) throw new AppError('Representação já está revogada', 400);

    await query(
      `UPDATE representacoes
          SET ativo = FALSE,
              revogado_em = NOW(),
              revogado_por_id = $1,
              motivo_revogacao = $2,
              updated_at = NOW()
        WHERE id = $3`,
      [req.pessoa.id, motivo_revogacao, req.params.id],
    );

    const { rows: completas } = await query(
      `${SELECT_COMPLETO} WHERE r.id = $1`,
      [req.params.id],
    );

    await registrarAcao({
      pessoa_acesso_id: req.pessoa.id,
      socio_id: atuais[0].socio_id,
      acao: 'representacao.revogar',
      detalhes: {
        representacao_id: req.params.id,
        pessoa_acesso_id: atuais[0].pessoa_acesso_id,
        motivo: motivo_revogacao,
      },
      req,
    });

    res.json(serializar(completas[0]));
  } catch (err) { next(err); }
}
