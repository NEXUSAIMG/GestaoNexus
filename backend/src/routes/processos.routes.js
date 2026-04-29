import { Router } from 'express';
import {
  listar, obter, criar, salvar, publicar, arquivar,
} from '../controllers/processos.controller.js';
import {
  listarPorProcesso as listarInstancias,
  criar as criarInstancia,
} from '../controllers/instancias.controller.js';
import { autenticar, exigirAdmin } from '../middleware/auth.middleware.js';

const router = Router();
router.use(autenticar);

// Leitura: respeita visibilidade dentro do controller
router.get('/', listar);
router.get('/:id', obter);

// Escrita: admin
router.post('/', exigirAdmin, criar);
router.put('/:id', exigirAdmin, salvar);
router.post('/:id/publicar', exigirAdmin, publicar);
router.post('/:id/arquivar', exigirAdmin, arquivar);

// Sprint 15 — Instâncias do processo
router.get('/:id/instancias', listarInstancias);
router.post('/:id/instancias', criarInstancia);

export default router;
