import { Router } from 'express';
import { uploadExtrato, middlewareUpload } from '../controllers/conciliacao.controller.js';
import { autenticar, exigirAdmin } from '../middleware/auth.middleware.js';

/**
 * Rotas de conciliação bancária — Sprint 9.
 *
 * Apenas admin pode fazer upload e ver o resultado. Não persiste nada,
 * então não há GET de histórico.
 */

const router = Router();

router.use(autenticar);

router.post('/upload', exigirAdmin, middlewareUpload, uploadExtrato);

export default router;
