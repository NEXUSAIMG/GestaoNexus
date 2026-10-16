import { Router } from 'express';
import {
  config, listar, obter, verificar, criar, atualizar, arquivar,
  registrarToque, estornarToque, estornarToqueRoteiro,
  agendarReuniao, desfechoReuniao, remarcarReuniao, excluirReuniao,
  registrarProposta, statusProposta, confirmarPagamento, recompensaIndicacao,
  painel, obterMetas, salvarMetas,
  importarLista, prorrogarTrial, previaImportarQuadro, importarQuadro, pegarDaFila, listarEspelhos, atualizarEspelho,
} from '../controllers/comercial.controller.js';
import {
  listarNaoContatar, incluirNaoContatar, removerNaoContatar,
  registrarChecagem, listarChecagens, registrar1a1, listar1a1, criarAcao, atualizarAcao,
  obterPlacar, incluirFeriado, removerFeriado, listarGestores, salvarGestores,
} from '../controllers/comercial-gestao.controller.js';
import { autenticar, exigirAdmin } from '../middleware/auth.middleware.js';
import {
  painelMarketing, criarAcaoMkt, atualizarAcaoMkt, arquivarAcaoMkt, loteMarketing, criarDataMkt, removerDataMkt,
} from '../controllers/comercial.marketing.controller.js';
import { marcarGestorComercial } from '../services/comercial.dados.js';
import { espelharDepois } from '../services/comercial.espelho.js';
import { painelTv } from '../controllers/comercial.tv.controller.js';
import {
  listarModelos, criarModelo, atualizarModelo, arquivarModelo, obterRankingEmails,
} from '../controllers/comercial.emails.controller.js';
import adaptaiRoutes from './adaptai.routes.js';

/**
 * Módulo Comercial — Sprint 42 / 42B.
 *
 * Liberado para qualquer pessoa logada (a equipe comercial costuma ter
 * acesso restrito). Ações de gestão (metas, arquivar, checagens, 1:1,
 * remover da lista de não contatar, feriados) exigem a gestão comercial
 * (admin ou pessoa da lista comercial_gestores); pagamento manual, definir
 * a gestão e importar o quadro exigem admin — checado no controller ou aqui.
 */
const router = Router();
router.use(autenticar);
router.use(marcarGestorComercial);
// Sprint 42F — toda escrita no Comercial é espelhada no quadro (se houver)
router.use(espelharDepois);

router.get('/config', config);
router.get('/painel', painel);
router.get('/placar', obterPlacar);
router.get('/tv', painelTv); // Sprint 42M — modo TV (só leitura)

// Sprint 43 — frente AdaptAI (escolas, foco em TEA)
router.use('/adaptai', adaptaiRoutes);

router.get('/metas', obterMetas);
router.put('/metas/:mes', salvarMetas);

// Leads
router.get('/leads', listar);
router.post('/leads', criar);
router.post('/leads/verificar', verificar);
router.post('/leads/importar-lista', importarLista);
router.post('/leads/pegar', pegarDaFila);
router.get('/leads/:id', obter);
router.put('/leads/:id', atualizar);
router.post('/leads/:id/arquivar', arquivar);

// Atividade
router.post('/leads/:id/toques', registrarToque);
router.post('/leads/:id/trial/prorrogar', prorrogarTrial); // 42L
router.post('/leads/:id/toques/estornar', estornarToqueRoteiro);
router.post('/toques/:id/estornar', estornarToque);

// Reuniões
router.post('/leads/:id/reunioes', agendarReuniao);
router.post('/reunioes/:id/desfecho', desfechoReuniao);
router.post('/reunioes/:id/remarcar', remarcarReuniao);
router.delete('/reunioes/:id', excluirReuniao); // só a gestão; registro errado/duplicado

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

// Gestão comercial (lista definida pelo admin)
router.get('/gestores', listarGestores);
router.put('/gestores', salvarGestores);

// Feriados
router.post('/feriados', incluirFeriado);
router.delete('/feriados/:data', removerFeriado);

// Importar quadro Kanban
router.get('/importar-quadro/previa', exigirAdmin, previaImportarQuadro);
router.post('/importar-quadro', exigirAdmin, importarQuadro);

// Espelho quadro ↔ Comercial
// Sprint 42I — Marketing (calendário das ações + resultado no funil)
router.get('/marketing', painelMarketing);
router.post('/marketing/acoes', criarAcaoMkt);
router.put('/marketing/acoes/:id', atualizarAcaoMkt);
router.post('/marketing/acoes/:id/arquivar', arquivarAcaoMkt);
router.post('/marketing/lote', loteMarketing);
router.post('/marketing/datas', criarDataMkt);
router.delete('/marketing/datas/:id', removerDataMkt);

// Sprint 44 — modelos de e-mail e ranking dos mais utilizados
router.get('/modelos-email', listarModelos);
router.post('/modelos-email', criarModelo);
router.put('/modelos-email/:id', atualizarModelo);
router.post('/modelos-email/:id/arquivar', arquivarModelo);
router.get('/emails/ranking', obterRankingEmails);

router.get('/espelho', listarEspelhos);
router.put('/espelho/:quadroId', exigirAdmin, atualizarEspelho);

export default router;
