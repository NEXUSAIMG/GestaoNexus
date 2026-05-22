import { Router } from 'express';
import {
  listar as listarQuadros, obter as obterQuadro,
  criar as criarQuadro, atualizar as atualizarQuadro, arquivar as arquivarQuadro,
  criarEtiqueta, atualizarEtiqueta, excluirEtiqueta,
} from '../controllers/quadros.controller.js';
import {
  criar as criarColuna,
} from '../controllers/colunas.controller.js';
import {
  listar as listarEventos, obter as obterEvento,
  criar as criarEvento, atualizar as atualizarEvento, excluir as excluirEvento,
} from '../controllers/eventos-quadro.controller.js';
import { listarPorQuadro as listarCartoriosPorQuadro } from '../controllers/cartorios.controller.js';
import { autenticar } from '../middleware/auth.middleware.js';

const router = Router();
router.use(autenticar);

// Quadros
router.get('/', listarQuadros);
router.get('/:id', obterQuadro);
router.post('/', criarQuadro);
router.put('/:id', atualizarQuadro);
router.post('/:id/arquivar', arquivarQuadro);

// Colunas (criação a partir do quadro pai — RESTful natural)
router.post('/:id/colunas', criarColuna);

// Etiquetas
router.post('/:id/etiquetas', criarEtiqueta);
router.put('/:id/etiquetas/:etiquetaId', atualizarEtiqueta);
router.delete('/:id/etiquetas/:etiquetaId', excluirEtiqueta);

// Calendário do quadro (Sprint 11)
router.get('/:id/eventos', listarEventos);
router.get('/:id/eventos/:eventoId', obterEvento);
router.post('/:id/eventos', criarEvento);
router.put('/:id/eventos/:eventoId', atualizarEvento);
router.delete('/:id/eventos/:eventoId', excluirEvento);

// Sprint 24 — Item 1.5: cartórios vinculados a este quadro (com fase atual)
router.get('/:id/cartorios', listarCartoriosPorQuadro);

export default router;
