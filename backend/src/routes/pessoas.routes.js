import { Router } from 'express';
import {
  listar, obter, criar, atualizar, alterarSenha,
} from '../controllers/pessoas.controller.js';
import { autenticar, exigirAdmin } from '../middleware/auth.middleware.js';

const router = Router();

router.use(autenticar);

// Listagem e detalhe: qualquer pessoa autenticada pode ver.
router.get('/', listar);
router.get('/:id', obter);

// Alteração de senha: própria pessoa ou admin.
router.post('/:id/senha', alterarSenha);

// Criar e atualizar: apenas admin.
router.post('/', exigirAdmin, criar);
router.put('/:id', exigirAdmin, atualizar);

export default router;
