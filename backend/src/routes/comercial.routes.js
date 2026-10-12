import { Router } from 'express';
import {
  config, listar, obter, criar, atualizar, arquivar,
  registrarToque, excluirToque, desmarcarToque,
  painel, obterMetas, salvarMetas,
  importarLista, previaImportarQuadro, importarQuadro,
} from '../controllers/comercial.controller.js';
import { autenticar, exigirAdmin } from '../middleware/auth.middleware.js';

/**
 * Módulo Comercial — Sprint 42.
 *
 * Liberado para qualquer pessoa logada (a equipe comercial costuma ter
 * acesso restrito). Importar o quadro Kanban é só admin.
 */
const router = Router();
router.use(autenticar);

router.get('/config', config);
router.get('/painel', painel);

router.get('/metas', obterMetas);
router.put('/metas/:mes', salvarMetas);

router.get('/leads', listar);
router.post('/leads', criar);
router.post('/leads/importar-lista', importarLista);
router.get('/leads/:id', obter);
router.put('/leads/:id', atualizar);
router.post('/leads/:id/arquivar', arquivar);
router.post('/leads/:id/toques', registrarToque);
router.delete('/leads/:id/toques', desmarcarToque);
router.delete('/toques/:id', excluirToque);

router.get('/importar-quadro/previa', exigirAdmin, previaImportarQuadro);
router.post('/importar-quadro', exigirAdmin, importarQuadro);

export default router;
