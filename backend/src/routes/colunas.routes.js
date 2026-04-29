import { Router } from 'express';
import {
  atualizar as atualizarColuna,
  mover as moverColuna,
  arquivar as arquivarColuna,
} from '../controllers/colunas.controller.js';
import { autenticar } from '../middleware/auth.middleware.js';

const router = Router();
router.use(autenticar);

router.put('/:id', atualizarColuna);
router.post('/:id/mover', moverColuna);
router.post('/:id/arquivar', arquivarColuna);

export default router;
