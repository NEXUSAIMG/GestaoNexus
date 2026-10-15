import { Router } from 'express';
import {
  config, listar, obter, criar, atualizar, arquivar,
  registrarAtividade, desfecho, estornar,
  painel, salvarMetas, listarChecklist, salvarChecklist, salvarConfig, carregarLista,
} from '../controllers/adaptai.controller.js';

/**
 * Sprint 43 — Frente AdaptAI (montada em /comercial/adaptai).
 * Herda do Comercial: autenticação, marca de gestão comercial e o aviso às
 * TVs abertas a cada escrita.
 */
const router = Router();

router.get('/config', config);
router.get('/painel', painel);
router.put('/metas', salvarMetas);
router.get('/checklist', listarChecklist);
router.put('/checklist/:chave', salvarChecklist);
router.put('/config', salvarConfig);
router.post('/carregar-lista', carregarLista);

router.get('/escolas', listar);
router.post('/escolas', criar);
router.get('/escolas/:id', obter);
router.put('/escolas/:id', atualizar);
router.post('/escolas/:id/arquivar', arquivar);
router.post('/escolas/:id/atividades', registrarAtividade);

router.post('/atividades/:id/desfecho', desfecho);
router.post('/atividades/:id/estornar', estornar);

export default router;
