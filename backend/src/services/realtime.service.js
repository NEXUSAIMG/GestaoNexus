import { EventEmitter } from 'node:events';

/**
 * Sprint 38.1 — Barramento de tempo real (SSE).
 *
 * Um EventEmitter em memória. Quando um card/coluna muda, o controller
 * publica `{ quadroId, tipo }`; as conexões SSE abertas naquele quadro
 * recebem e o cliente recarrega.
 *
 * Decisão consciente: NÃO enviamos o payload do card pelo stream, só um
 * aviso "algo mudou neste quadro". O cliente busca o estado novo via
 * GET /quadros/:id (que já tem gate de versão e checa permissão). Isso:
 *   - evita mandar dado sensível por um canal a mais pra proteger;
 *   - mantém uma única fonte de verdade pro payload;
 *   - torna o stream trivialmente barato (um "ping" de bytes).
 *
 * Escopo: processo único. O Railway roda 1 instância deste backend, então
 * um EventEmitter local alcança todos os clientes. Se um dia escalar
 * horizontalmente, este arquivo é o ÚNICO ponto a trocar — por Redis
 * pub/sub, mantendo a mesma interface publicar()/assinar().
 */

const bus = new EventEmitter();
// Muitas abas abertas no mesmo quadro somam listeners; o default (10) alerta
// à toa. Elevamos e monitoramos pelo contador de conexões.
bus.setMaxListeners(0);

let conexoesAbertas = 0;

/** Publica uma mudança de um quadro para todos os assinantes. */
export function publicarMudanca(quadroId, tipo = 'mudou') {
  if (!quadroId) return;
  bus.emit('quadro:' + quadroId, { quadroId, tipo, em: Date.now() });
}

/**
 * Assina as mudanças de um quadro. Devolve a função de cancelamento —
 * chamá-la remove o listener (essencial: sem isso, cada conexão fechada
 * deixaria um listener vazando).
 */
export function assinarQuadro(quadroId, handler) {
  const canal = 'quadro:' + quadroId;
  bus.on(canal, handler);
  conexoesAbertas += 1;
  return () => {
    bus.off(canal, handler);
    conexoesAbertas = Math.max(0, conexoesAbertas - 1);
  };
}

export function totalConexoes() {
  return conexoesAbertas;
}
