import { Router } from 'express';
import {
  listar, obter, criar, atualizar, substituirArquivo,
  baixarArquivo, arquivar, excluir, dispararAlertas,
} from '../controllers/contratos.controller.js';
import { autenticar, exigirAdmin } from '../middleware/auth.middleware.js';
import { uploaderGovernanca } from '../utils/uploads.js';

/**
 * Contratos com terceiros — Sprint 21 (item 6.2 da spec).
 *
 * Reuso do uploaderGovernanca (mesma pasta, mesmos MIMEs aceitos).
 */
const router = Router();
router.use(autenticar);

const upload = uploaderGovernanca();

router.get('/', listar);

// Sprint 26 — disparar manualmente o aviso de contratos vencendo (admin).
// Vem ANTES de '/:id' pra não ser interpretado como ID.
router.post('/disparar-alertas', exigirAdmin, dispararAlertas);

router.get('/:id', obter);
router.get('/:id/arquivo', baixarArquivo);

router.post('/', exigirAdmin, upload.single('arquivo'), criar);
router.put('/:id', exigirAdmin, atualizar);
router.post('/:id/arquivo', exigirAdmin, upload.single('arquivo'), substituirArquivo);
router.post('/:id/arquivar', exigirAdmin, arquivar);
router.delete('/:id', exigirAdmin, excluir);

export default router;
