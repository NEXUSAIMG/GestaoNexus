import { Router } from 'express';
import { autenticar, exigirAdmin } from '../middleware/auth.middleware.js';
import { uploaderInventario } from '../utils/uploads.js';

import {
  listar as listarCategorias,
  criar as criarCategoria,
  atualizar as atualizarCategoria,
  arquivar as arquivarCategoria,
  desarquivar as desarquivarCategoria,
} from '../controllers/inventario-categorias.controller.js';

import {
  listar as listarItens,
  resumo as resumoInventario,
  obter as obterItem,
  criar as criarItem,
  atualizar as atualizarItem,
  transferir as transferirItem,
  descartar as descartarItem,
  movimentos as movimentosItem,
} from '../controllers/inventario.controller.js';

import {
  listar as listarAnexos,
  criar as criarAnexo,
  baixar as baixarAnexo,
  excluir as excluirAnexo,
} from '../controllers/inventario-anexos.controller.js';

const router = Router();
router.use(autenticar);

// =============================================================================
// Categorias
// =============================================================================
// IMPORTANTE: rotas de /categorias precisam vir ANTES de /:id pra não bater
// com a rota de obter item por ID.
router.get('/categorias', listarCategorias);
router.post('/categorias', exigirAdmin, criarCategoria);
router.put('/categorias/:id', exigirAdmin, atualizarCategoria);
router.post('/categorias/:id/arquivar', exigirAdmin, arquivarCategoria);
router.post('/categorias/:id/desarquivar', exigirAdmin, desarquivarCategoria);

// =============================================================================
// Resumo (KPIs do topo)
// =============================================================================
router.get('/resumo', resumoInventario);

// =============================================================================
// Itens
// =============================================================================
router.get('/', listarItens);
router.get('/:id', obterItem);
router.post('/', exigirAdmin, criarItem);
router.put('/:id', exigirAdmin, atualizarItem);

// Atalhos: transferência (mudar responsável/local) e descarte
router.post('/:id/transferir', exigirAdmin, transferirItem);
router.post('/:id/descartar', exigirAdmin, descartarItem);

// Histórico de movimentos
router.get('/:id/movimentos', movimentosItem);

// =============================================================================
// Anexos
// =============================================================================
// Upload: campo 'arquivo' no multipart/form-data
router.get('/:id/anexos', listarAnexos);
router.post(
  '/:id/anexos',
  exigirAdmin,
  uploaderInventario().single('arquivo'),
  criarAnexo,
);
router.get('/:id/anexos/:anexoId/baixar', baixarAnexo);
router.delete('/:id/anexos/:anexoId', exigirAdmin, excluirAnexo);

export default router;
