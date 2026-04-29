import { z } from 'zod';
import { query } from '../config/database.js';
import { verificarSenha } from '../utils/password.js';
import { gerarToken } from '../utils/jwt.js';
import { registrarAcao } from '../utils/audit.js';
import { NaoAutorizadoError, AppError } from '../utils/errors.js';

const loginSchema = z.object({
  email: z.string().email('E-mail inválido'),
  senha: z.string().min(1, 'Senha obrigatória'),
});

const trocarContextoSchema = z.object({
  socio_id: z.string().uuid('Sócio inválido'),
});

/**
 * Monta o objeto de representação para retorno na API.
 */
function serializarRepresentacao(r) {
  return {
    id: r.id,
    socio_id: r.socio_id,
    socio_nome: r.socio_nome,
    socio_tipo_pessoa: r.socio_tipo_pessoa,
    socio_percentual: Number(r.socio_percentual),
    papel: r.papel,
    poderes: {
      ver_financeiro: r.pode_ver_financeiro,
      votar: r.pode_votar,
      aprovar_atas: r.pode_aprovar_atas,
      aprovar_distribuicoes: r.pode_aprovar_distribuicoes,
    },
    data_inicio: r.data_inicio,
    data_fim: r.data_fim,
  };
}

/**
 * Busca as representações ativas e vigentes de uma pessoa.
 */
async function representacoesAtivas(pessoaId) {
  const { rows } = await query(
    `SELECT r.id, r.socio_id, r.papel,
            r.pode_ver_financeiro, r.pode_votar,
            r.pode_aprovar_atas, r.pode_aprovar_distribuicoes,
            r.data_inicio, r.data_fim,
            s.nome AS socio_nome, s.tipo_pessoa AS socio_tipo_pessoa,
            s.percentual_participacao AS socio_percentual
       FROM representacoes r
       JOIN socios s ON s.id = r.socio_id
      WHERE r.pessoa_acesso_id = $1
        AND r.ativo = TRUE
        AND s.ativo = TRUE
        AND r.data_inicio <= CURRENT_DATE
        AND (r.data_fim IS NULL OR r.data_fim >= CURRENT_DATE)
      ORDER BY s.nome`,
    [pessoaId],
  );
  return rows;
}

/**
 * POST /api/auth/login
 *
 * Fluxo:
 *   1. Valida email+senha contra pessoas_acesso
 *   2. Busca representações ativas
 *   3. Se exatamente 1 representação → token já com contexto definido
 *   4. Se múltiplas representações → token sem contexto, frontend pede escolha
 *   5. Se 0 representações E a pessoa é admin → token sem contexto (admin puro)
 *   6. Se 0 representações E não é admin → erro
 */
export async function login(req, res, next) {
  try {
    const { email, senha } = loginSchema.parse(req.body);

    const { rows } = await query(
      `SELECT id, nome, email, senha_hash, administrador, ativo
         FROM pessoas_acesso
        WHERE lower(email) = lower($1)`,
      [email],
    );

    const pessoa = rows[0];
    if (!pessoa || !pessoa.ativo) {
      throw new NaoAutorizadoError('E-mail ou senha incorretos');
    }

    const senhaOk = await verificarSenha(senha, pessoa.senha_hash);
    if (!senhaOk) {
      throw new NaoAutorizadoError('E-mail ou senha incorretos');
    }

    const representacoes = await representacoesAtivas(pessoa.id);

    if (representacoes.length === 0 && !pessoa.administrador) {
      throw new NaoAutorizadoError(
        'Você não tem nenhuma representação ativa. Fale com um administrador.',
      );
    }

    await query('UPDATE pessoas_acesso SET ultimo_login_em = NOW() WHERE id = $1', [pessoa.id]);

    // Se tem exatamente uma representação, já define o contexto no token.
    const contextoAutomatico = representacoes.length === 1 ? representacoes[0].socio_id : null;

    const token = gerarToken({
      pessoa_acesso_id: pessoa.id,
      socio_id: contextoAutomatico,
    });

    await registrarAcao({
      pessoa_acesso_id: pessoa.id,
      socio_id: contextoAutomatico,
      acao: 'login',
      req,
    });

    res.json({
      token,
      pessoa: {
        id: pessoa.id,
        nome: pessoa.nome,
        email: pessoa.email,
        administrador: pessoa.administrador,
      },
      representacoes: representacoes.map(serializarRepresentacao),
      contexto_definido: contextoAutomatico !== null || pessoa.administrador,
      precisa_escolher_contexto: representacoes.length > 1,
    });
  } catch (err) {
    next(err);
  }
}

/**
 * POST /api/auth/trocar-contexto
 *
 * Gera um novo token com um sócio_id diferente no contexto.
 * Útil quando a pessoa representa vários sócios e quer alternar entre eles.
 * Para admins sem representação, passar socio_id=null limpa o contexto.
 */
export async function trocarContexto(req, res, next) {
  try {
    const { socio_id } = trocarContextoSchema.parse(req.body);
    const pessoa = req.pessoa;

    const tem = req.representacoes.some((r) => r.socio_id === socio_id);
    if (!tem) {
      throw new AppError('Você não tem representação ativa para esse sócio', 403);
    }

    const token = gerarToken({
      pessoa_acesso_id: pessoa.id,
      socio_id,
    });

    await registrarAcao({
      pessoa_acesso_id: pessoa.id,
      socio_id,
      acao: 'trocar_contexto',
      req,
    });

    res.json({ token, socio_id });
  } catch (err) {
    next(err);
  }
}

/**
 * GET /api/auth/eu
 * Retorna pessoa logada, contexto atual e todas as representações ativas.
 */
export async function eu(req, res, next) {
  try {
    const representacoes = await representacoesAtivas(req.pessoa.id);

    res.json({
      pessoa: {
        id: req.pessoa.id,
        nome: req.pessoa.nome,
        email: req.pessoa.email,
        administrador: req.pessoa.administrador,
      },
      representacoes: representacoes.map(serializarRepresentacao),
      contexto_socio_id: req.contextoSocioId,
      representacao_atual: req.representacaoAtual
        ? serializarRepresentacao(req.representacaoAtual)
        : null,
    });
  } catch (err) {
    next(err);
  }
}
