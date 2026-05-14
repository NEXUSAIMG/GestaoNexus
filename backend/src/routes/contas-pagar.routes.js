import { Router } from 'express';
import {
  listar, resumoContas, obter, criar, atualizar, pagar, cancelar, cancelarSerie,
} from '../controllers/contas-pagar.controller.js';
import {
  baixar as baixarComprovante,
  anexar as anexarComprovante,
  remover as removerComprovante,
} from '../controllers/comprovantes.controller.js';
import {
  listar as listarAnexos,
  criar as criarAnexo,
  baixar as baixarAnexo,
  excluir as excluirAnexo,
} from '../controllers/contas-pagar-anexos.controller.js';
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

// Comprovante Único (Sprint 7) — mantido pra compatibilidade com histórico.
// O frontend novo usa /anexos (múltiplos) abaixo.
router.get   ('/:id/comprovante', baixarComprovante('conta_pagar'));
router.post  ('/:id/comprovante', exigirAdmin, upload.single('arquivo'), anexarComprovante('conta_pagar'));
router.delete('/:id/comprovante', exigirAdmin, removerComprovante('conta_pagar'));

// Sprint 17.1 — múltiplos anexos. Reusa o uploaderComprovantes (PDF + imagens).
router.get   ('/:id/anexos',                listarAnexos);
router.post  ('/:id/anexos',                exigirAdmin, upload.single('arquivo'), criarAnexo);
router.get   ('/:id/anexos/:anexoId/baixar', baixarAnexo);
router.delete('/:id/anexos/:anexoId',        exigirAdmin, excluirAnexo);

export default router;
