import { Router } from 'express';
import {
  listar, obter, criar, atualizar, registrarSaldo,
} from '../controllers/contas-bancarias.controller.js';
import { autenticar, exigirAdmin } from '../middleware/auth.middleware.js';

const router = Router();

router.use(autenticar);

// Leitura: qualquer pessoa autenticada (aplicação de poder "ver financeiro"
// fica no controller/poderes de sprints futuras; por ora admin e titulares
// conseguem ver).
router.get('/', listar);
router.get('/:id', obter);

// Mutações: admin-only.
router.post('/', exigirAdmin, criar);
router.put('/:id', exigirAdmin, atualizar);
router.post('/:id/saldo', exigirAdmin, registrarSaldo);

export default router;
