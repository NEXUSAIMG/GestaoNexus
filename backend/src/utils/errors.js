/**
 * Erro de aplicação com código HTTP associado.
 * Use para erros esperados (validação, não encontrado, etc.).
 */
export class AppError extends Error {
  constructor(mensagem, status = 400, codigo = 'app_error') {
    super(mensagem);
    this.status = status;
    this.codigo = codigo;
    this.name = 'AppError';
  }
}

export class NaoAutorizadoError extends AppError {
  constructor(mensagem = 'Não autorizado') {
    super(mensagem, 401, 'nao_autorizado');
  }
}

export class NaoEncontradoError extends AppError {
  constructor(mensagem = 'Recurso não encontrado') {
    super(mensagem, 404, 'nao_encontrado');
  }
}

export class ConflitoError extends AppError {
  constructor(mensagem = 'Conflito com estado atual') {
    super(mensagem, 409, 'conflito');
  }
}
