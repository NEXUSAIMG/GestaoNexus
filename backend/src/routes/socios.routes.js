import { Router } from 'express';
import { listar, obter, criar, atualizar } from '../controllers/socios.controller.js';
import { extratoSocio } from '../controllers/movimentos-socios.controller.js';
import { autenticar, exigirAdmin } from '../middleware/auth.middleware.js';

const router = Router();

router.use(autenticar);

router.get('/', listar);
router.get('/:id', obter);

// Extrato consolidado do sócio (Sprint 5) — leitura para qualquer
// pessoa autenticada.
router.get('/:id/extrato', extratoSocio);

router.post('/', exigirAdmin, criar);
router.put('/:id', exigirAdmin, atualizar);

export default router;
