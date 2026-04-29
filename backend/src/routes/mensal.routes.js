import { Router } from 'express';
import { resumo, historico } from '../controllers/mensal.controller.js';
import { autenticar } from '../middleware/auth.middleware.js';

const router = Router();

router.use(autenticar);

// Leitura: qualquer pessoa autenticada (transparência entre sócios).
router.get('/resumo',    resumo);
router.get('/historico', historico);

export default router;
