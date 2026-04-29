import { Router } from 'express';
import {
  listar, resumoContas, obter, criar, atualizar, pagar, cancelar, cancelarSerie,
} from '../controllers/contas-pagar.controller.js';
import {
  baixar as baixarComprovante,
  anexar as anexarComprovante,
  remover as removerComprovante,
} from '../controllers/comprovantes.controller.js';
import { autenticar, exigirAdmin } from '../middleware/auth.middleware.js';
import { uploaderComprovantes } from '../utils/uploads.js';

const router = Router();
const upload = uploaderComprovantes();

router.use(autenticar);

// Leitura: qualquer sócio pode ver (transparência).
router.get('/', listar);
router.get('/resumo', resumoContas);
router.get('/:id', obter);

// Escrita: admin.
router.post('/', exigirAdmin, criar);
router.put('/:id', exigirAdmin, atualizar);
router.post('/:id/pagar', exigirAdmin, pagar);
router.post('/:id/cancelar', exigirAdmin, cancelar);

// Sprint 13 — cancelar TODA a série recorrente (só as pendentes;
// preserva pagas e já canceladas).
router.post('/grupo/:grupoId/cancelar-serie', exigirAdmin, cancelarSerie);

// Comprovante (Sprint 7): baixar é aberto, subir/apagar é admin.
router.get   ('/:id/comprovante', baixarComprovante('conta_pagar'));
router.post  ('/:id/comprovante', exigirAdmin, upload.single('arquivo'), anexarComprovante('conta_pagar'));
router.delete('/:id/comprovante', exigirAdmin, removerComprovante('conta_pagar'));

export default router;
