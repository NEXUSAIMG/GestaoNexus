import { Router } from 'express';
import {
  listar, obter, criar, atualizar, arquivar, desarquivar,
  adicionarMembro, atualizarMembro, removerMembro,
} from '../controllers/equipes.controller.js';
import { autenticar, exigirAdmin } from '../middleware/auth.middleware.js';

const router = Router();
router.use(autenticar);

router.get('/', listar);
router.get('/:id', obter);

// Apenas admin do sistema cria equipes — alinhado com pessoas/representações.
router.post('/', exigirAdmin, criar);

// Líder OU admin (validação fina dentro do controller)
router.put('/:id', atualizar);
router.post('/:id/arquivar', arquivar);
router.post('/:id/desarquivar', exigirAdmin, desarquivar);

// Membros
router.post('/:id/membros', adicionarMembro);
router.put('/:equipeId/membros/:membroId', atualizarMembro);
router.delete('/:equipeId/membros/:membroId', removerMembro);

export default router;
