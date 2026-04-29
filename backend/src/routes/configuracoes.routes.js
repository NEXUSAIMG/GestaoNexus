import { Router } from 'express';
import { obter, atualizar } from '../controllers/configuracoes.controller.js';
import { autenticar, exigirAdmin } from '../middleware/auth.middleware.js';

const router = Router();

router.use(autenticar);

router.get('/',   obter);
router.put('/',   exigirAdmin, atualizar);

export default router;
