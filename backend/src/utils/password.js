import bcrypt from 'bcryptjs';

const SALT_ROUNDS = 10;

export async function hashSenha(senhaPura) {
  return bcrypt.hash(senhaPura, SALT_ROUNDS);
}

export async function verificarSenha(senhaPura, hash) {
  return bcrypt.compare(senhaPura, hash);
}
