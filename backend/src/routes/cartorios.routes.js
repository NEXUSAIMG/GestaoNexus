import { Router } from 'express';
import {
  listar, obter, criar, atualizar, arquivar,
  vincularQuadro, desvincularQuadro, mudarFase,
  listarAtualizacoes, criarAtualizacao,
} from '../controllers/cartorios.controller.js';
import { autenticar } from '../middleware/auth.middleware.js';

/**
 * Cartórios — Sprint 20.
 *
 * Todos os endpoints exigem autenticação. Não há check de admin
 * (decisão 5 do usuário: qualquer pessoa logada gerencia cartórios).
 */
const router = Router();
router.use(autenticar);

// CRUD principal
router.get('/', listar);
router.get('/:id', obter);
router.post('/', criar);
router.put('/:id', atualizar);
router.post('/:id/arquivar', arquivar);

// Vínculos com quadros (item 1.5 da spec)
router.post('/:id/quadros', vincularQuadro);
router.delete('/:id/quadros/:quadroId', desvincularQuadro);
router.post('/:id/quadros/:quadroId/mudar-fase', mudarFase);

// Histórico
router.get('/:id/atualizacoes', listarAtualizacoes);
router.post('/:id/atualizacoes', criarAtualizacao);

export default router;
