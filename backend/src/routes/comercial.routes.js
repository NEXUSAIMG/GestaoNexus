import { Router } from 'express';
import {
  config, listar, obter, verificar, criar, atualizar, arquivar,
  registrarToque, estornarToque, estornarToqueRoteiro,
  agendarReuniao, desfechoReuniao, remarcarReuniao,
  registrarProposta, statusProposta, confirmarPagamento, recompensaIndicacao,
  painel, obterMetas, salvarMetas,
  importarLista, previaImportarQuadro, importarQuadro,
} from '../controllers/comercial.controller.js';
import {
  listarNaoContatar, incluirNaoContatar, removerNaoContatar,
  registrarChecagem, listarChecagens, registrar1a1, listar1a1, criarAcao, atualizarAcao,
  obterPlacar, incluirFeriado, removerFeriado,
} from '../controllers/comercial-gestao.controller.js';
import { autenticar, exigirAdmin } from '../middleware/auth.middleware.js';
import { marcarGestorComercial } from '../services/comercial.dados.js';

/**
 * Módulo Comercial — Sprint 42 / 42B.
 *
 * Liberado para qualquer pessoa logada (a equipe comercial costuma ter
 * acesso restrito). Ações de gestão (metas, arquivar, pagamento manual,
 * checagens, 1:1, remover da lista de não contatar, feriados, importar
 * quadro) exigem admin — checado no controller ou aqui.
 */
const router = Router();
router.use(autenticar);
router.use(marcarGestorComercial);

router.get('/config', config);
router.get('/painel', painel);
router.get('/placar', obterPlacar);

router.get('/metas', obterMetas);
router.put('/metas/:mes', salvarMetas);

// Leads
router.get('/leads', listar);
router.post('/leads', criar);
router.post('/leads/verificar', verificar);
router.post('/leads/importar-lista', importarLista);
router.get('/leads/:id', obter);
router.put('/leads/:id', atualizar);
router.post('/leads/:id/arquivar', arquivar);

// Atividade
router.post('/leads/:id/toques', registrarToque);
router.post('/leads/:id/toques/estornar', estornarToqueRoteiro);
router.post('/toques/:id/estornar', estornarToque);

// Reuniões
router.post('/leads/:id/reunioes', agendarReuniao);
router.post('/reunioes/:id/desfecho', desfechoReuniao);
router.post('/reunioes/:id/remarcar', remarcarReuniao);

// Proposta, pagamento, indicação
router.post('/leads/:id/propostas', registrarProposta);
router.post('/propostas/:id/status', statusProposta);
router.post('/leads/:id/pagamento', confirmarPagamento);
router.post('/leads/:id/recompensa-indicacao', recompensaIndicacao);

// Não contatar
router.get('/nao-contatar', listarNaoContatar);
router.post('/nao-contatar', incluirNaoContatar);
router.delete('/nao-contatar/:id', removerNaoContatar);

// Rotina da gestão
router.get('/checagens', listarChecagens);
router.post('/checagens', registrarChecagem);
router.get('/1a1', listar1a1);
router.post('/1a1', registrar1a1);
router.post('/acoes', criarAcao);
router.put('/acoes/:id', atualizarAcao);

// Feriados
router.post('/feriados', incluirFeriado);
router.delete('/feriados/:data', removerFeriado);

// Importar quadro Kanban
router.get('/importar-quadro/previa', exigirAdmin, previaImportarQuadro);
router.post('/importar-quadro', exigirAdmin, importarQuadro);

export default router;
