import { Router } from 'express';
import { autenticar, exigirAcessoCompleto } from '../middleware/auth.middleware.js';
import { streamQuadro } from '../controllers/stream.controller.js';
import authRoutes from './auth.routes.js';
import sociosRoutes from './socios.routes.js';
import pessoasRoutes from './pessoas.routes.js';
import representacoesRoutes from './representacoes.routes.js';
import contasBancariasRoutes from './contas-bancarias.routes.js';
import caixaRoutes from './caixa.routes.js';
import categoriasDespesaRoutes from './categorias-despesa.routes.js';
import contasPagarRoutes from './contas-pagar.routes.js';
import configuracoesRoutes from './configuracoes.routes.js';
import mensalRoutes from './mensal.routes.js';
import movimentosSociosRoutes from './movimentos-socios.routes.js';
import distribuicoesRoutes from './distribuicoes.routes.js';
import governancaRoutes from './governanca.routes.js';
import notificacoesRoutes from './notificacoes.routes.js';
import configuracoesNotificacoesRoutes from './configuracoes-notificacoes.routes.js';
import conciliacaoRoutes from './conciliacao.routes.js';
import equipesRoutes from './equipes.routes.js';
import quadrosRoutes from './quadros.routes.js';
import colunasRoutes from './colunas.routes.js';
import cardsRoutes from './cards.routes.js';
import sprintsRoutes from './sprints.routes.js';
import dashboardRoutes from './dashboard.routes.js';
import processosRoutes from './processos.routes.js';
import instanciasRoutes from './instancias.routes.js';
import produtosRoutes from './produtos.routes.js';
import inventarioRoutes from './inventario.routes.js';
import cartoriosRoutes from './cartorios.routes.js';
import documentosEmpresaRoutes from './documentos-empresa.routes.js';
import contratosRoutes from './contratos.routes.js';
import relatoriosRoutes from './relatorios.routes.js';
import custosCloudRoutes from './custos-cloud.routes.js';

const router = Router();

router.get('/saude', (_req, res) => {
  // Diagnóstico amplo: ajuda a confirmar deploy e configuração em produção
  // sem precisar logar SSH no container.
  res.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    node_env: process.env.NODE_ENV ?? '(não definido)',
    versao: '1.8', // bump a cada deploy novo
    sprints_ativas: 'até 34 (Projetos: subtarefas, dependências, campos personalizados, '
      + 'WIP, tipo de coluna, vínculos de negócio, apontamento de horas)',
  });
});

// ============================================================================
// AUTENTICAÇÃO (sempre liberada — qualquer um pode tentar logar)
// ============================================================================
router.use('/auth', authRoutes);

// ============================================================================
// LIBERADAS PRA TODAS AS PESSOAS AUTENTICADAS (incluindo acesso_restrito)
// ============================================================================
// Sprint 31 — pessoas com acesso restrito só podem usar estas 4 áreas:
//   /equipes, /quadros, /colunas, /cards  → Tarefas
//   /processos                            → Processos
//   /instancias                           → Em andamento
//   /cartorios                            → Cartórios
//
// Mais 2 que são infra liberada pra todos:
//   /pessoas       → leitura pra autocomplete (escrita já é admin)
//   /notificacoes  → sininho universal
//
// O middleware `autenticar` está aplicado dentro de cada arquivo de rota,
// então não precisamos repetir aqui.

router.use('/pessoas', pessoasRoutes);
router.use('/notificacoes', notificacoesRoutes);

// Sprint 10 — Tarefas (Trello interno)
router.use('/equipes', equipesRoutes);
// Sprint 38.1 — SSE do quadro. Registrado ANTES de /quadros porque faz a
// própria autenticação (token na query — EventSource não manda header) e
// não pode passar pelo `autenticar` global que exige Bearer no header.
router.get('/quadros/:id/stream', streamQuadro);
router.use('/quadros', quadrosRoutes);
router.use('/colunas', colunasRoutes);
router.use('/cards', cardsRoutes);
router.use('/sprints', sprintsRoutes);

// Sprint 14 — Processos / Workflows (estilo BPMN)
router.use('/processos', processosRoutes);

// Sprint 15 — Instâncias de processos (Em andamento)
router.use('/instancias', instanciasRoutes);

// Sprint 20 — Cartórios
router.use('/cartorios', cartoriosRoutes);

// ============================================================================
// BLOQUEADAS PRA ACESSO RESTRITO (admin sempre passa)
// ============================================================================
// Estas rotas exigem `pessoa.acesso_restrito = FALSE` OU `administrador = TRUE`.
// Pessoas restritas que tentarem acessar recebem 403 do middleware
// `exigirAcessoCompleto`.
//
// Aplicamos `autenticar` ANTES de `exigirAcessoCompleto` aqui pra garantir
// que `req.pessoa` esteja populado quando o middleware checar a flag.
// (O autenticar interno dos arquivos de rota é idempotente — roda 2x sem
// efeito colateral, vale a pena pela clareza.)

const restritoBloqueado = [autenticar, exigirAcessoCompleto];

router.use('/socios',                          restritoBloqueado, sociosRoutes);
router.use('/representacoes',                  restritoBloqueado, representacoesRoutes);
router.use('/contas-bancarias',                restritoBloqueado, contasBancariasRoutes);
router.use('/caixa',                           restritoBloqueado, caixaRoutes);

// Sprint 3
router.use('/categorias-despesa',              restritoBloqueado, categoriasDespesaRoutes);
router.use('/contas-pagar',                    restritoBloqueado, contasPagarRoutes);
router.use('/configuracoes-financeiras',       restritoBloqueado, configuracoesRoutes);

// Sprint 4
router.use('/mensal',                          restritoBloqueado, mensalRoutes);
// Sprint 5
router.use('/movimentos-socios',               restritoBloqueado, movimentosSociosRoutes);
router.use('/distribuicoes',                   restritoBloqueado, distribuicoesRoutes);

// Sprint 6
router.use('/governanca',                      restritoBloqueado, governancaRoutes);

// Sprint 7
router.use('/configuracoes-notificacoes',      restritoBloqueado, configuracoesNotificacoesRoutes);

// Sprint 9
router.use('/conciliacao',                     restritoBloqueado, conciliacaoRoutes);

// Sprint 12 — Visão geral / dashboard agregado
router.use('/dashboard',                       restritoBloqueado, dashboardRoutes);

// Sprint 16 — Portfólio de produtos
router.use('/produtos',                        restritoBloqueado, produtosRoutes);

// Sprint 17 — Inventário / Patrimônio
router.use('/inventario',                      restritoBloqueado, inventarioRoutes);

// Sprint 21 — Documentos da empresa + Contratos
router.use('/documentos-empresa',              restritoBloqueado, documentosEmpresaRoutes);
router.use('/contratos',                       restritoBloqueado, contratosRoutes);

// Relatórios (custos mês a mês — realizado + projetado)
router.use('/relatorios',                      restritoBloqueado, relatoriosRoutes);

// Sprint 40 — Custos Cloud (catalogo, fechamento mensal, dashboard)
router.use('/custos-cloud',                    restritoBloqueado, custosCloudRoutes);

export default router;
