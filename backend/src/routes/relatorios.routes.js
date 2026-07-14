import { Router } from 'express';
import { custosMensais, detalheMes } from '../controllers/relatorios.controller.js';
import { autenticar } from '../middleware/auth.middleware.js';

const router = Router();

router.use(autenticar);

// Leitura: qualquer pessoa autenticada com acesso completo (o bloqueio de
// acesso restrito é aplicado no index.js via restritoBloqueado).
router.get('/custos-mensais', custosMensais);
router.get('/detalhe-mes', detalheMes);

export default router;
