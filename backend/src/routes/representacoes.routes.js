import { Router } from 'express';
import {
  listar, obter, criar, atualizar, revogar,
} from '../controllers/representacoes.controller.js';
import { autenticar, exigirAdmin } from '../middleware/auth.middleware.js';

const router = Router();

router.use(autenticar);

// Leitura: qualquer pessoa autenticada pode consultar.
// (A página de Representações só aparece no menu para admin, mas a rota
// deixa os próprios interessados consultarem seus vínculos por filtro.)
router.get('/', listar);
router.get('/:id', obter);

// Criação, edição e revogação: admin-only.
router.post('/', exigirAdmin, criar);
router.put('/:id', exigirAdmin, atualizar);
router.post('/:id/revogar', exigirAdmin, revogar);

export default router;
