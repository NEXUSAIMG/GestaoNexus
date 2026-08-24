import { Router } from 'express';
import {
  listar as listarQuadros, obter as obterQuadro,
  criar as criarQuadro, atualizar as atualizarQuadro, arquivar as arquivarQuadro,
  criarEtiqueta, atualizarEtiqueta, excluirEtiqueta,
} from '../controllers/quadros.controller.js';
import {
  criar as criarColuna, listarArquivados,
} from '../controllers/colunas.controller.js';
import {
  listar as listarEventos, obter as obterEvento,
  criar as criarEvento, atualizar as atualizarEvento, excluir as excluirEvento,
} from '../controllers/eventos-quadro.controller.js';
import { listarPorQuadro as listarCartoriosPorQuadro } from '../controllers/cartorios.controller.js';
import {
  listarCampos, criarCampo, atualizarCampo, excluirCampo,
} from '../controllers/projetos.controller.js';
import { metricasDoQuadro, forcarSnapshot } from '../controllers/metricas.controller.js';
import { importarTrello } from '../controllers/importar-trello.controller.js';
import { importarCsv, previaCsv } from '../controllers/importar-csv.controller.js';
import { uploaderCards } from '../utils/uploads.js';
import {
  listar as listarAutomacoes, criar as criarAutomacao,
  atualizar as atualizarAutomacao, excluir as excluirAutomacao,
  execucoes as execucoesAutomacao,
} from '../controllers/automacoes.controller.js';
import { autenticar } from '../middleware/auth.middleware.js';

const router = Router();
// A planilha chega como multipart; reaproveitamos o uploader de cards, que
// aceita qualquer tipo e respeita o limite de tamanho.
const uploadPlanilha = uploaderCards();

router.use(autenticar);

// Quadros
router.get('/', listarQuadros);
router.get('/:id', obterQuadro);
router.post('/', criarQuadro);
// Sprint 38 — importador do Trello (rota estatica antes de /:id)
router.post('/importar-trello', importarTrello);

// Sprint 43 — importador de planilha (CSV). A previa nao grava nada.
router.post('/importar-csv/previa', uploadPlanilha.single('arquivo'), previaCsv);
router.post('/importar-csv', uploadPlanilha.single('arquivo'), importarCsv);
router.put('/:id', atualizarQuadro);
router.post('/:id/arquivar', arquivarQuadro);

// Colunas (criação a partir do quadro pai — RESTful natural)
router.post('/:id/colunas', criarColuna);

// Gaveta de arquivados (colunas e cards que sairam do board)
router.get('/:id/arquivados', listarArquivados);

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

// Sprint 37 — Métricas de fluxo
router.get('/:id/metricas', metricasDoQuadro);
router.post('/:id/metricas/snapshot', forcarSnapshot);

// Sprint 36 — Automações
router.get('/:id/automacoes', listarAutomacoes);
router.post('/:id/automacoes', criarAutomacao);
router.put('/:id/automacoes/:automacaoId', atualizarAutomacao);
router.delete('/:id/automacoes/:automacaoId', excluirAutomacao);
router.get('/:id/automacoes/:automacaoId/execucoes', execucoesAutomacao);

// Sprint 34 — Campos personalizados do quadro (definição)
router.get('/:id/campos', listarCampos);
router.post('/:id/campos', criarCampo);
router.put('/:id/campos/:campoId', atualizarCampo);
router.delete('/:id/campos/:campoId', excluirCampo);

export default router;
