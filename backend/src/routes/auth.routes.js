import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { login, eu, trocarContexto } from '../controllers/auth.controller.js';
import { autenticar } from '../middleware/auth.middleware.js';

const router = Router();

const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { erro: 'Muitas tentativas de login. Tente novamente em alguns minutos.' },
});

router.post('/login', loginLimiter, login);
router.get('/eu', autenticar, eu);
router.post('/trocar-contexto', autenticar, trocarContexto);

export default router;
