import { Router } from 'express';
import {
  listar, criar, atualizar, promover, remover,
} from '../controllers/sustentacao.controller.js';
import { autenticar } from '../middleware/auth.middleware.js';

/**
 * Sustentação — Sprint 41. Parte do módulo de tarefas (permissão fina checada
 * no controller via podeVerQuadro do quadro).
 */
const router = Router();
router.use(autenticar);

router.get('/', listar);
router.post('/', criar);
router.patch('/:id', atualizar);
router.post('/:id/promover', promover);
router.delete('/:id', remover);

export default router;
