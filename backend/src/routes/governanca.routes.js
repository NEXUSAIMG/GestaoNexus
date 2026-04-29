import { Router } from 'express';
import {
  listar as listarDocs, obter as obterDoc, baixarArquivo,
  criar as criarDoc, atualizar as atualizarDoc, substituirArquivo,
  votar as votarDoc, marcarVigente, arquivar as arquivarDoc,
  excluir as excluirDoc, contratoVigente,
} from '../controllers/documentos-governanca.controller.js';
import {
  listar as listarDecisoes, obter as obterDecisao,
  criar as criarDecisao, atualizar as atualizarDecisao,
  votar as votarDecisao, cancelar as cancelarDecisao,
} from '../controllers/decisoes.controller.js';
import {
  listar as listarEventos, obter as obterEvento,
  criar as criarEvento, atualizar as atualizarEvento, excluir as excluirEvento,
} from '../controllers/eventos-calendario.controller.js';
import { autenticar, exigirAdmin } from '../middleware/auth.middleware.js';
import { uploaderGovernanca } from '../utils/uploads.js';

const router = Router();
router.use(autenticar);

const upload = uploaderGovernanca();

// =========================================================
// Documentos de governança (atas, contratos, outros)
// =========================================================
router.get('/contrato-vigente', contratoVigente);
router.get('/documentos', listarDocs);
router.get('/documentos/:id', obterDoc);
router.get('/documentos/:id/arquivo', baixarArquivo);
// Votar não exige admin (qualquer sócio com poder); validação fica no controller
router.post('/documentos/:id/votar', votarDoc);

// Escrita exige admin
router.post('/documentos', exigirAdmin, upload.single('arquivo'), criarDoc);
router.put('/documentos/:id', exigirAdmin, atualizarDoc);
router.post('/documentos/:id/arquivo', exigirAdmin, upload.single('arquivo'), substituirArquivo);
router.post('/documentos/:id/marcar-vigente', exigirAdmin, marcarVigente);
router.post('/documentos/:id/arquivar', exigirAdmin, arquivarDoc);
router.delete('/documentos/:id', exigirAdmin, excluirDoc);

// =========================================================
// Decisões societárias
// =========================================================
router.get('/decisoes', listarDecisoes);
router.get('/decisoes/:id', obterDecisao);
router.post('/decisoes/:id/votar', votarDecisao);

router.post('/decisoes', exigirAdmin, criarDecisao);
router.put('/decisoes/:id', exigirAdmin, atualizarDecisao);
router.post('/decisoes/:id/cancelar', exigirAdmin, cancelarDecisao);

// =========================================================
// Eventos de calendário
// =========================================================
router.get('/eventos', listarEventos);
router.get('/eventos/:id', obterEvento);

router.post('/eventos', exigirAdmin, criarEvento);
router.put('/eventos/:id', exigirAdmin, atualizarEvento);
router.delete('/eventos/:id', exigirAdmin, excluirEvento);

export default router;
