import { Routes, Route, Navigate } from 'react-router-dom';
import Login from './pages/Login.jsx';
import EscolherContexto from './pages/EscolherContexto.jsx';
import Dashboard from './pages/Dashboard.jsx';
import VisaoGeral from './pages/VisaoGeral.jsx';
import Socios from './pages/Socios.jsx';
import Pessoas from './pages/Pessoas.jsx';
import Representacoes from './pages/Representacoes.jsx';
import Caixa from './pages/Caixa.jsx';
import ContasBancarias from './pages/ContasBancarias.jsx';
import ContasPagar from './pages/ContasPagar.jsx';
import CategoriasDespesa from './pages/CategoriasDespesa.jsx';
import Mensal from './pages/Mensal.jsx';
import Lucros from './pages/Lucros.jsx';
import ExtratoSocio from './pages/ExtratoSocio.jsx';
import Governanca from './pages/Governanca.jsx';
import Atas from './pages/Atas.jsx';
import Decisoes from './pages/Decisoes.jsx';
import ContratoSocial from './pages/ContratoSocial.jsx';
import CalendarioGov from './pages/CalendarioGov.jsx';
import Configuracoes from './pages/Configuracoes.jsx';
import Equipes from './pages/Equipes.jsx';
import Tarefas from './pages/Tarefas.jsx';
import Quadro from './pages/Quadro.jsx';
import Processos from './pages/Processos.jsx';
import EditorProcesso from './pages/EditorProcesso.jsx';
import InstanciasProcesso from './pages/InstanciasProcesso.jsx';
import Portfolio from './pages/Portfolio.jsx';
import PortfolioProduto from './pages/PortfolioProduto.jsx';
import Layout from './components/Layout.jsx';
import ProtectedRoute from './components/ProtectedRoute.jsx';
import AdminRoute from './components/AdminRoute.jsx';

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<Login />} />

      {/*
        /escolher-contexto é autenticada mas fica fora do Layout principal:
        o usuário precisa decidir "em nome de quem" antes de ver o menu do app.
      */}
      <Route
        path="/escolher-contexto"
        element={
          <ProtectedRoute>
            <EscolherContexto />
          </ProtectedRoute>
        }
      />

      <Route
        element={
          <ProtectedRoute>
            <Layout />
          </ProtectedRoute>
        }
      >
        <Route path="/" element={<Dashboard />} />

        {/* Sprint 12 — Visão geral / dashboard agregado (todos os autenticados) */}
        <Route path="/visao-geral" element={<VisaoGeral />} />

        <Route path="/caixa" element={<Caixa />} />
        <Route path="/contas-bancarias" element={<ContasBancarias />} />
        <Route path="/mensal" element={<Mensal />} />
        <Route path="/lucros" element={<Lucros />} />
        <Route path="/socios/:id/extrato" element={<ExtratoSocio />} />

        {/* Sprint 6 — Governança com sub-rotas */}
        <Route path="/governanca" element={<Governanca />}>
          <Route index element={<Navigate to="atas" replace />} />
          <Route path="atas" element={<Atas />} />
          <Route path="decisoes" element={<Decisoes />} />
          <Route path="contrato" element={<ContratoSocial />} />
          <Route path="calendario" element={<CalendarioGov />} />
        </Route>

        <Route path="/socios" element={<Socios />} />

        {/* Sprint 10 — Tarefas (Trello interno) */}
        <Route path="/tarefas" element={<Tarefas />} />
        <Route path="/tarefas/:id" element={<Quadro />} />
        <Route
          path="/equipes"
          element={<AdminRoute><Equipes /></AdminRoute>}
        />

        {/* Sprint 14 — Processos / Workflows (BPMN) */}
        <Route path="/processos" element={<Processos />} />
        <Route path="/processos/:id" element={<EditorProcesso />} />
        {/* Sprint 15 — Instâncias / execuções do processo */}
        <Route path="/processos/:id/instancias" element={<InstanciasProcesso />} />

        {/* Sprint 16 — Portfólio de produtos */}
        <Route path="/portfolio" element={<Portfolio />} />
        <Route path="/portfolio/:id" element={<PortfolioProduto />} />

        {/* Sprint 7 — Configurações de notificações (admin-only) */}
        <Route
          path="/configuracoes"
          element={<AdminRoute><Configuracoes /></AdminRoute>}
        />

        {/* Sprint 3 — todos os sócios podem ver (transparência);
            ações de escrita são barradas pelo backend via exigirAdmin. */}
        <Route path="/contas-pagar"       element={<ContasPagar />} />
        <Route path="/categorias-despesa" element={<CategoriasDespesa />} />

        {/* Rotas admin-only: pessoas e representações */}
        <Route
          path="/pessoas"
          element={<AdminRoute><Pessoas /></AdminRoute>}
        />
        <Route
          path="/representacoes"
          element={<AdminRoute><Representacoes /></AdminRoute>}
        />
      </Route>

      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
