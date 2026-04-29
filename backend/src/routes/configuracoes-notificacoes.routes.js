import { Router } from 'express';
import { obter, atualizar } from '../controllers/configuracoes-notificacoes.controller.js';
import { autenticar, exigirAdmin } from '../middleware/auth.middleware.js';

/**
 * Configurações de notificações — Sprint 7.
 *
 * Singleton (id=1). Leitura pra qualquer autenticado (transparência —
 * todo sócio sabe quais avisos a empresa configurou). Escrita só admin.
 */

const router = Router();

router.use(autenticar);

router.get('/',   obter);
router.put('/',   exigirAdmin, atualizar);

export default router;
