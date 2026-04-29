import { Router } from 'express';
import {
  meusCards, obter, criar, atualizar, mover, arquivar,
} from '../controllers/cards.controller.js';
import { autenticar } from '../middleware/auth.middleware.js';

const router = Router();
router.use(autenticar);

// Cards atribuídos a mim — usado no Dashboard e em "Minhas tarefas"
router.get('/meus', meusCards);

router.get('/:id', obter);
router.post('/', criar);
router.put('/:id', atualizar);
router.post('/:id/mover', mover);
router.post('/:id/arquivar', arquivar);

export default router;
