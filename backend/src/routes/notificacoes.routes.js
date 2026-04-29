import { Router } from 'express';
import {
  listar, contagem, marcarLida, marcarTodasLidas, excluir,
} from '../controllers/notificacoes.controller.js';
import { autenticar } from '../middleware/auth.middleware.js';

/**
 * Notificações in-app — Sprint 7.
 *
 * Cada pessoa autenticada acessa apenas suas próprias notificações.
 * Não existe "notificação de admin" global — admin vê só o que foi
 * direcionado pra ele (ex: resumo diário).
 */

const router = Router();

router.use(autenticar);

router.get('/',                      listar);
router.get('/contagem',              contagem);
router.post('/:id/marcar-lida',      marcarLida);
router.post('/marcar-todas-lidas',   marcarTodasLidas);
router.delete('/:id',                excluir);

export default router;
