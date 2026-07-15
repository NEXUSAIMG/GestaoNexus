import { Router } from 'express';
import {
  listarServicos, criarServico, atualizarServico,
  fechamento, lancarValor, dashboard,
} from '../controllers/custos-cloud.controller.js';
import { autenticar, exigirAdmin } from '../middleware/auth.middleware.js';

const router = Router();

router.use(autenticar);

// Catalogo de servicos
router.get('/servicos', listarServicos);
router.post('/servicos', exigirAdmin, criarServico);
router.put('/servicos/:id', exigirAdmin, atualizarServico);

// Fechamento mensal (valores por servico)
router.get('/fechamento', fechamento);
router.put('/mensal', exigirAdmin, lancarValor);

// Dashboard do mes
router.get('/dashboard', dashboard);

export default router;
