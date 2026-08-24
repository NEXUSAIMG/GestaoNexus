import { Router } from 'express';
import {
  meusCards, obter, criar, atualizar, mover, moverQuadro, arquivar, desarquivar,
} from '../controllers/cards.controller.js';
import {
  listarChecklists, criarChecklist, atualizarChecklist, excluirChecklist,
  criarItem, atualizarItem, excluirItem,
  listarComentarios, criarComentario, atualizarComentario, excluirComentario,
  listarAnexos, criarAnexo, baixarAnexo, excluirAnexo,
  listarAtividades, listarHistorico,
} from '../controllers/card-extras.controller.js';
import {
  definirValorCampo,
  listarDependencias, criarDependencia, excluirDependencia,
  listarSubtarefas, criarSubtarefa,
  listarVinculos, criarVinculo, excluirVinculo, cardsPorVinculo,
  timerAtivo, iniciarTimer, pararTimer,
  listarApontamentos, criarApontamento, excluirApontamento,
} from '../controllers/projetos.controller.js';
import { autenticar } from '../middleware/auth.middleware.js';
import { uploaderCards } from '../utils/uploads.js';

const router = Router();
const upload = uploaderCards();

router.use(autenticar);

// Cards atribuídos a mim — usado no Dashboard e em "Minhas tarefas"
router.get('/meus', meusCards);

// Sprint 34 — rotas ESTATICAS antes de /:id (senao o Express casa "timer"
// e "por-vinculo" como se fossem um uuid de card).
router.get('/timer/ativo', timerAtivo);
router.get('/por-vinculo', cardsPorVinculo);

router.get('/:id', obter);
router.post('/', criar);
router.put('/:id', atualizar);
router.post('/:id/mover', mover);
// Move pra OUTRO quadro (equipe/funil diferente) — o /mover de cima só
// troca de coluna dentro do mesmo quadro, e recusa entre quadros.
router.post('/:id/mover-quadro', moverQuadro);
router.post('/:id/arquivar', arquivar);
router.post('/:id/desarquivar', desarquivar);

// ---------------------------------------------------------------------------
// Sprint 32 — Extras do card (Kanban nível Trello)
// ---------------------------------------------------------------------------

// Checklists + itens
router.get('/:id/checklists', listarChecklists);
router.post('/:id/checklists', criarChecklist);
router.put('/:id/checklists/:checklistId', atualizarChecklist);
router.delete('/:id/checklists/:checklistId', excluirChecklist);
router.post('/:id/checklists/:checklistId/itens', criarItem);
router.put('/:id/checklists/:checklistId/itens/:itemId', atualizarItem);
router.delete('/:id/checklists/:checklistId/itens/:itemId', excluirItem);

// Comentários
router.get('/:id/comentarios', listarComentarios);
router.post('/:id/comentarios', criarComentario);
router.put('/:id/comentarios/:comentarioId', atualizarComentario);
router.delete('/:id/comentarios/:comentarioId', excluirComentario);

// Anexos
router.get('/:id/anexos', listarAnexos);
router.post('/:id/anexos', upload.single('arquivo'), criarAnexo);
router.get('/:id/anexos/:anexoId/baixar', baixarAnexo);
router.delete('/:id/anexos/:anexoId', excluirAnexo);

// Feed de atividades
router.get('/:id/atividades', listarAtividades);

// Historico do card: movimentacoes (de X para Y) + demais acoes
router.get('/:id/historico', listarHistorico);

// ---------------------------------------------------------------------------
// Sprint 34 — Projetos: fundação (além do Trello)
// ---------------------------------------------------------------------------

// Campos personalizados (valor por card; a definição fica em /quadros)
router.put('/:id/campos/:campoId', definirValorCampo);

// Dependências (bloqueia / bloqueado por)
router.get('/:id/dependencias', listarDependencias);
router.post('/:id/dependencias', criarDependencia);
router.delete('/:id/dependencias/:alvoId', excluirDependencia);

// Subtarefas (hierarquia de cards)
router.get('/:id/subtarefas', listarSubtarefas);
router.post('/:id/subtarefas', criarSubtarefa);

// Vínculos de negócio (cartório, contrato, processo, produto, conta a pagar)
router.get('/:id/vinculos', listarVinculos);
router.post('/:id/vinculos', criarVinculo);
router.delete('/:id/vinculos/:vinculoId', excluirVinculo);

// Apontamento de horas
router.post('/:id/timer/iniciar', iniciarTimer);
router.post('/:id/timer/parar', pararTimer);
router.get('/:id/apontamentos', listarApontamentos);
router.post('/:id/apontamentos', criarApontamento);
router.delete('/:id/apontamentos/:apontamentoId', excluirApontamento);

export default router;
