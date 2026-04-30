import { Router } from 'express';
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
import dashboardRoutes from './dashboard.routes.js';
import processosRoutes from './processos.routes.js';
import instanciasRoutes from './instancias.routes.js';
import produtosRoutes from './produtos.routes.js';
import inventarioRoutes from './inventario.routes.js';

const router = Router();

router.get('/saude', (_req, res) => {
  // Diagnóstico amplo: ajuda a confirmar deploy e configuração em produção
  // sem precisar logar SSH no container.
  res.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    node_env: process.env.NODE_ENV ?? '(não definido)',
    versao: '1.5', // bump a cada deploy novo
    sprints_ativas: 'até 17 (inventário / patrimônio)',
  });
});

router.use('/auth', authRoutes);
router.use('/socios', sociosRoutes);
router.use('/pessoas', pessoasRoutes);
router.use('/representacoes', representacoesRoutes);
router.use('/contas-bancarias', contasBancariasRoutes);
router.use('/caixa', caixaRoutes);

// Sprint 3
router.use('/categorias-despesa', categoriasDespesaRoutes);
router.use('/contas-pagar', contasPagarRoutes);
router.use('/configuracoes-financeiras', configuracoesRoutes);

// Sprint 4
router.use('/mensal', mensalRoutes);

// Sprint 5
router.use('/movimentos-socios', movimentosSociosRoutes);
router.use('/distribuicoes', distribuicoesRoutes);

// Sprint 6
router.use('/governanca', governancaRoutes);

// Sprint 7
router.use('/notificacoes', notificacoesRoutes);
router.use('/configuracoes-notificacoes', configuracoesNotificacoesRoutes);

// Sprint 9
router.use('/conciliacao', conciliacaoRoutes);

// Sprint 10 — Tarefas (Trello interno)
router.use('/equipes', equipesRoutes);
router.use('/quadros', quadrosRoutes);
router.use('/colunas', colunasRoutes);
router.use('/cards', cardsRoutes);

// Sprint 12 — Visão geral / dashboard agregado
router.use('/dashboard', dashboardRoutes);

// Sprint 14 — Processos / Workflows (estilo BPMN)
router.use('/processos', processosRoutes);

// Sprint 15 — Instâncias de processos
router.use('/instancias', instanciasRoutes);

// Sprint 16 — Portfólio de produtos
router.use('/produtos', produtosRoutes);

// Sprint 17 — Inventário / Patrimônio
router.use('/inventario', inventarioRoutes);

export default router;
