import { verificarToken } from '../utils/jwt.js';
import { query } from '../config/database.js';
import { NaoAutorizadoError } from '../utils/errors.js';

/**
 * Middleware de autenticação.
 *
 * Valida o JWT e carrega no req:
 *   - req.pessoa            → { id, nome, email, administrador, ativo }
 *   - req.contextoSocioId   → id do sócio no contexto (pode ser null)
 *   - req.representacoes    → todas as representações ativas da pessoa
 *   - req.representacaoAtual → a representação ativa para o sócio do contexto
 *                              (null se contextoSocioId for null)
 */
export async function autenticar(req, _res, next) {
  try {
    const header = req.headers.authorization ?? '';
    const [tipo, token] = header.split(' ');

    if (tipo !== 'Bearer' || !token) {
      throw new NaoAutorizadoError('Token não fornecido');
    }

    let payload;
    try {
      payload = verificarToken(token);
    } catch {
      throw new NaoAutorizadoError('Token inválido ou expirado');
    }

    const { rows: pessoas } = await query(
      `SELECT id, nome, email, administrador, ativo, acesso_restrito
         FROM pessoas_acesso
        WHERE id = $1`,
      [payload.sub],
    );

    const pessoa = pessoas[0];
    if (!pessoa || !pessoa.ativo) {
      throw new NaoAutorizadoError('Usuário inexistente ou inativo');
    }

    // Carrega todas as representações ativas e dentro da vigência.
    const { rows: representacoes } = await query(
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
      [pessoa.id],
    );

    req.pessoa = pessoa;
    req.representacoes = representacoes;

    // Valida o contexto do token contra as representações realmente existentes.
    const contextoSolicitado = payload.socio_id ?? null;
    let representacaoAtual = null;

    if (contextoSolicitado) {
      representacaoAtual = representacoes.find((r) => r.socio_id === contextoSolicitado);
      if (!representacaoAtual) {
        throw new NaoAutorizadoError(
          'Contexto inválido: você não tem representação ativa para este sócio',
        );
      }
    }

    req.contextoSocioId = representacaoAtual ? representacaoAtual.socio_id : null;
    req.representacaoAtual = representacaoAtual;

    next();
  } catch (err) {
    next(err);
  }
}

/** Só deixa passar administradores do sistema. */
export function exigirAdmin(req, _res, next) {
  if (!req.pessoa?.administrador) {
    return next(new NaoAutorizadoError('Ação permitida apenas a administradores'));
  }
  next();
}

/**
 * Sprint 31 — bloqueia pessoas com acesso restrito (não-admin).
 *
 * Pessoas com `acesso_restrito = TRUE` só podem acessar 4 módulos
 * operacionais: tarefas, processos, instancias (em andamento) e cartórios.
 * Esta função é aplicada ANTES das rotas dos demais módulos no
 * routes/index.js — então pessoas restritas recebem 403 ao tentar
 * acessar caixa, governança, contas a pagar etc.
 *
 * Admin SEMPRE passa, independente da flag.
 */
export function exigirAcessoCompleto(req, _res, next) {
  if (req.pessoa?.administrador) return next();
  if (req.pessoa?.acesso_restrito) {
    return next(new NaoAutorizadoError(
      'Você não tem acesso a este módulo. Fale com um administrador.',
    ));
  }
  next();
}

/**
 * Fábrica de middleware que exige um poder específico na representação atual.
 * Ex: exigirPoder('pode_votar')
 */
export function exigirPoder(poder) {
  return (req, _res, next) => {
    if (req.pessoa?.administrador) return next(); // admin passa sempre
    const r = req.representacaoAtual;
    if (!r) {
      return next(new NaoAutorizadoError('Escolha um contexto de sócio para continuar'));
    }
    if (!r[poder]) {
      return next(new NaoAutorizadoError('Você não tem esse poder na representação atual'));
    }
    next();
  };
}
