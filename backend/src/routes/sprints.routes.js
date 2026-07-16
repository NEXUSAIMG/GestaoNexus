import { Router } from 'express';
import {
  listar, criar, atualizar, ativar, encerrar, remover, puxarCards, removerCard,
} from '../controllers/sprints.controller.js';
import { autenticar } from '../middleware/auth.middleware.js';

/**
 * Sprints — Sprint 41.
 *
 * Parte do modulo de tarefas (nao passa por restritoBloqueado). A permissao
 * fina (ver x editar) e checada no controller via podeVerQuadro do quadro.
 */
const router = Router();
router.use(autenticar);

router.get('/', listar);
router.post('/', criar);
router.put('/:id', atualizar);
router.post('/:id/ativar', ativar);
router.post('/:id/encerrar', encerrar);
router.delete('/:id', remover);

// Puxar do backlog / tirar da sprint
router.post('/:id/cards', puxarCards);
router.delete('/:id/cards/:cardId', removerCard);

export default router;
