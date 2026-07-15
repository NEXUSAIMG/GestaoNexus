import { Router } from 'express';
import {
  listarServicos, criarServico, atualizarServico,
  fechamento, lancarValor, dashboard,
  rateio, salvarRateio, alertas,
  obterCotacao, salvarCotacao,
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

// Cotacao do dolar por mes
router.get('/cotacao', obterCotacao);
router.put('/cotacao', exigirAdmin, salvarCotacao);

// Dashboard do mes
router.get('/dashboard', dashboard);

// Fase 2 -- rateio por cartorio e alertas
router.get('/rateio', rateio);
router.put('/rateio', exigirAdmin, salvarRateio);
router.get('/alertas', alertas);

export default router;
