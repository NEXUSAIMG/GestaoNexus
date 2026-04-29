import { Router } from 'express';
import {
  listar, obter, criar, atualizar,
  efetivar, cancelar, resumo, extratoSocio,
} from '../controllers/movimentos-socios.controller.js';
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

// Leitura: todos os sócios autenticados (alinhado com o resto do app).
router.get('/',       listar);
router.get('/resumo', resumo);
router.get('/:id',    obter);

// Escrita: admin.
router.post('/',           exigirAdmin, criar);
router.put('/:id',         exigirAdmin, atualizar);
router.post('/:id/efetivar', exigirAdmin, efetivar);
router.post('/:id/cancelar', exigirAdmin, cancelar);

// Comprovante (Sprint 7): baixar é aberto, subir/apagar é admin.
router.get   ('/:id/comprovante', baixarComprovante('movimento_socio'));
router.post  ('/:id/comprovante', exigirAdmin, upload.single('arquivo'), anexarComprovante('movimento_socio'));
router.delete('/:id/comprovante', exigirAdmin, removerComprovante('movimento_socio'));

export default router;

// Helper de extrato por sócio (montado em /api/socios/:id/extrato
// pelo index.js pra ficar semanticamente na rota de sócios).
export { extratoSocio };
