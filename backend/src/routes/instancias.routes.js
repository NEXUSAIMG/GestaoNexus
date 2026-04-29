import { Router } from 'express';
import {
  obter, escolherSaidaDecisao, cancelar, obterPorQuadro,
} from '../controllers/instancias.controller.js';
import { autenticar } from '../middleware/auth.middleware.js';

const router = Router();
router.use(autenticar);

// GET /api/instancias/:id
router.get('/:id', obter);

// POST /api/instancias/:nodeId/escolher-saida
// (o :id aqui é o instancia_no_id, não o instancia_id)
router.post('/:id/escolher-saida', escolherSaidaDecisao);

// POST /api/instancias/:id/cancelar
router.post('/:id/cancelar', cancelar);

// Atalho: GET /api/instancias/por-quadro/:quadroId
router.get('/por-quadro/:id', obterPorQuadro);

export default router;
