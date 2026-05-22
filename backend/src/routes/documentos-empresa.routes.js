import { Router } from 'express';
import {
  listar, obter, criar, atualizar, substituirArquivo,
  baixarArquivo, arquivar, excluir,
} from '../controllers/documentos-empresa.controller.js';
import { autenticar, exigirAdmin } from '../middleware/auth.middleware.js';
import { uploaderGovernanca } from '../utils/uploads.js';

/**
 * Documentos da empresa — Sprint 21 (item 6.1 da spec).
 *
 * Leitura/download: qualquer pessoa logada.
 * Escrita: admin (segue padrão dos outros módulos de governança).
 */
const router = Router();
router.use(autenticar);

const upload = uploaderGovernanca();

router.get('/', listar);
router.get('/:id', obter);
router.get('/:id/arquivo', baixarArquivo);

router.post('/', exigirAdmin, upload.single('arquivo'), criar);
router.put('/:id', exigirAdmin, atualizar);
router.post('/:id/arquivo', exigirAdmin, upload.single('arquivo'), substituirArquivo);
router.post('/:id/arquivar', exigirAdmin, arquivar);
router.delete('/:id', exigirAdmin, excluir);

export default router;
