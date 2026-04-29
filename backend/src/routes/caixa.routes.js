import { Router } from 'express';
import {
  resumo, entradas, fluxo, sincronizarManualmente, statusIntegracao,
} from '../controllers/caixa.controller.js';
import { autenticar, exigirAdmin } from '../middleware/auth.middleware.js';

const router = Router();

router.use(autenticar);

router.get('/resumo', resumo);
router.get('/entradas', entradas);
router.get('/fluxo', fluxo);
router.get('/integracao/status', statusIntegracao);

// Disparo manual da sincronização — admin-only.
router.post('/sincronizar', exigirAdmin, sincronizarManualmente);

export default router;
