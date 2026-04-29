import { Router } from 'express';
import {
  listar, obter, criar, atualizar,
} from '../controllers/categorias-despesa.controller.js';
import { autenticar, exigirAdmin } from '../middleware/auth.middleware.js';

const router = Router();

router.use(autenticar);

// Leitura: qualquer pessoa autenticada (inclusive sócios não-admin
// precisam ver a categoria quando consultam uma conta).
router.get('/', listar);
router.get('/:id', obter);

// Criar e editar: só admin.
router.post('/', exigirAdmin, criar);
router.put('/:id', exigirAdmin, atualizar);

export default router;
