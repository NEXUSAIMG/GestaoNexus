import { Router } from 'express';
import { autenticar, exigirAdmin } from '../middleware/auth.middleware.js';
import {
  listar as listarProdutos,
  obter as obterProduto,
  criar as criarProduto,
  atualizar as atualizarProduto,
  arquivar as arquivarProduto,
  desarquivar as desarquivarProduto,
} from '../controllers/produtos.controller.js';
import {
  listar as listarMetricas,
  upsert as upsertMetrica,
  excluir as excluirMetrica,
} from '../controllers/produtos-metricas.controller.js';
import {
  listar as listarClientes,
  criar as criarCliente,
  atualizar as atualizarCliente,
  excluir as excluirCliente,
} from '../controllers/produtos-clientes.controller.js';
import {
  listar as listarRoadmap,
  criar as criarRoadmapItem,
  atualizar as atualizarRoadmapItem,
  excluir as excluirRoadmapItem,
} from '../controllers/produtos-roadmap.controller.js';

const router = Router();
router.use(autenticar);

// =============================================================================
// Produtos (cabeçalho)
// =============================================================================
router.get('/', listarProdutos);
router.get('/:id', obterProduto);
router.post('/', exigirAdmin, criarProduto);
router.put('/:id', exigirAdmin, atualizarProduto);
router.post('/:id/arquivar', exigirAdmin, arquivarProduto);
router.post('/:id/desarquivar', exigirAdmin, desarquivarProduto);

// =============================================================================
// Métricas mensais
// =============================================================================
router.get('/:id/metricas', listarMetricas);
router.post('/:id/metricas', exigirAdmin, upsertMetrica);
router.delete('/:id/metricas/:metricaId', exigirAdmin, excluirMetrica);

// =============================================================================
// Clientes nominais
// =============================================================================
router.get('/:id/clientes', listarClientes);
router.post('/:id/clientes', exigirAdmin, criarCliente);
router.put('/:id/clientes/:clienteId', exigirAdmin, atualizarCliente);
router.delete('/:id/clientes/:clienteId', exigirAdmin, excluirCliente);

// =============================================================================
// Roadmap
// =============================================================================
router.get('/:id/roadmap', listarRoadmap);
router.post('/:id/roadmap', exigirAdmin, criarRoadmapItem);
router.put('/:id/roadmap/:itemId', exigirAdmin, atualizarRoadmapItem);
router.delete('/:id/roadmap/:itemId', exigirAdmin, excluirRoadmapItem);

export default router;
