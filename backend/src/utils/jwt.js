import jwt from 'jsonwebtoken';
import { env } from '../config/env.js';

/**
 * Gera um token JWT.
 *
 * O payload carrega:
 *   - sub      → id da pessoa de acesso (quem está logada)
 *   - socio_id → id do sócio "no contexto" atual (em nome de quem ela age)
 *                Pode ser null se a pessoa ainda não escolheu, ou se for
 *                apenas um administrador sem representação.
 */
export function gerarToken({ pessoa_acesso_id, socio_id = null }) {
  return jwt.sign(
    { sub: pessoa_acesso_id, socio_id },
    env.JWT_SECRET,
    { expiresIn: env.JWT_EXPIRES_IN },
  );
}

export function verificarToken(token) {
  return jwt.verify(token, env.JWT_SECRET);
}
