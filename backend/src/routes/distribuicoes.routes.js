import { Router } from 'express';
import {
  listar, obter, criar, atualizar,
  efetivar, cancelar,
} from '../controllers/distribuicoes.controller.js';
import { autenticar, exigirAdmin } from '../middleware/auth.middleware.js';

const router = Router();

router.use(autenticar);

router.get('/',    listar);
router.get('/:id', obter);

router.post('/',             exigirAdmin, criar);
router.put('/:id',           exigirAdmin, atualizar);
router.post('/:id/efetivar', exigirAdmin, efetivar);
router.post('/:id/cancelar', exigirAdmin, cancelar);

export default router;
