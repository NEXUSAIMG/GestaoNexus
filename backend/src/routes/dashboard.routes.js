import { Router } from 'express';
import { obter } from '../controllers/dashboard.controller.js';
import { autenticar } from '../middleware/auth.middleware.js';

const router = Router();
router.use(autenticar);

router.get('/', obter);

export default router;
