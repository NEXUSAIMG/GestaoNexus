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
import Relatorios from './pages/Relatorios.jsx';
import CustosCloud from './pages/CustosCloud.jsx';
import Lucros from './pages/Lucros.jsx';
import ExtratoSocio from './pages/ExtratoSocio.jsx';
import Governanca from './pages/Governanca.jsx';
import Atas from './pages/Atas.jsx';
import Decisoes from './pages/Decisoes.jsx';
import ContratoSocial from './pages/ContratoSocial.jsx';
import CalendarioGov from './pages/CalendarioGov.jsx';
import DocumentosEmpresa from './pages/DocumentosEmpresa.jsx';
import Contratos from './pages/Contratos.jsx';
import Configuracoes from './pages/Configuracoes.jsx';
import Equipes from './pages/Equipes.jsx';
import Tarefas from './pages/Tarefas.jsx';
import Quadro from './pages/Quadro.jsx';
import Processos from './pages/Processos.jsx';
import EditorProcesso from './pages/EditorProcesso.jsx';
import InstanciasProcesso from './pages/InstanciasProcesso.jsx';
import Instancias from './pages/Instancias.jsx';
import Portfolio from './pages/Portfolio.jsx';
import PortfolioProduto from './pages/PortfolioProduto.jsx';
import Inventario from './pages/Inventario.jsx';
import InventarioItem from './pages/InventarioItem.jsx';
import Cartorios from './pages/Cartorios.jsx';
import Cartorio from './pages/Cartorio.jsx';
import Apresentacao from './pages/Apresentacao.jsx';
import Layout from './components/Layout.jsx';
import ProtectedRoute from './components/ProtectedRoute.jsx';
import AdminRoute from './components/AdminRoute.jsx';
import AcessoCompletoRoute from './components/AcessoCompletoRoute.jsx';

// Sprint 31 — Helper local: marca uma rota como "bloqueada pra acesso restrito".
// Pessoa restrita acessando uma dessas é redirecionada pra /tarefas.
// Admin sempre passa.
function Bloqueado({ children }) {
  return <AcessoCompletoRoute>{children}</AcessoCompletoRoute>;
}

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

      {/*
        /apresentacao — Modo Apresentação (estrutura de custos), tela cheia
        sem o Layout/menu lateral. Pensada pra projetar em reunião.
      */}
      <Route
        path="/apresentacao"
        element={
          <ProtectedRoute>
            <Bloqueado>
              <Apresentacao />
            </Bloqueado>
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
        {/* ===== Sprint 31 — BLOQUEADAS pra acesso restrito ===== */}
        {/* Painel principal — acesso restrito é redirecionado pra /tarefas */}
        <Route path="/" element={<Bloqueado><Dashboard /></Bloqueado>} />
        <Route path="/visao-geral" element={<Bloqueado><VisaoGeral /></Bloqueado>} />

        <Route path="/caixa"            element={<Bloqueado><Caixa /></Bloqueado>} />
        <Route path="/contas-bancarias" element={<Bloqueado><ContasBancarias /></Bloqueado>} />
        <Route path="/mensal"           element={<Bloqueado><Mensal /></Bloqueado>} />
        <Route path="/relatorios"       element={<Bloqueado><Relatorios /></Bloqueado>} />
        <Route path="/custos-cloud"     element={<Bloqueado><CustosCloud /></Bloqueado>} />
        <Route path="/lucros"           element={<Bloqueado><Lucros /></Bloqueado>} />
        <Route path="/socios/:id/extrato" element={<Bloqueado><ExtratoSocio /></Bloqueado>} />

        {/* Sprint 6 — Governança com sub-rotas */}
        <Route path="/governanca" element={<Bloqueado><Governanca /></Bloqueado>}>
          <Route index element={<Navigate to="atas" replace />} />
          <Route path="atas" element={<Atas />} />
          <Route path="decisoes" element={<Decisoes />} />
          <Route path="contrato" element={<ContratoSocial />} />
          {/* Sprint 21 — Documentos da empresa + Contratos */}
          <Route path="documentos" element={<DocumentosEmpresa />} />
          <Route path="contratos" element={<Contratos />} />
          <Route path="calendario" element={<CalendarioGov />} />
        </Route>

        <Route path="/socios" element={<Bloqueado><Socios /></Bloqueado>} />

        {/* Sprint 16 — Portfólio de produtos */}
        <Route path="/portfolio"     element={<Bloqueado><Portfolio /></Bloqueado>} />
        <Route path="/portfolio/:id" element={<Bloqueado><PortfolioProduto /></Bloqueado>} />

        {/* Sprint 17 — Inventário / Patrimônio */}
        <Route path="/inventario"     element={<Bloqueado><Inventario /></Bloqueado>} />
        <Route path="/inventario/:id" element={<Bloqueado><InventarioItem /></Bloqueado>} />

        {/* Sprint 3 — Contas a pagar */}
        <Route path="/contas-pagar"       element={<Bloqueado><ContasPagar /></Bloqueado>} />
        <Route path="/categorias-despesa" element={<Bloqueado><CategoriasDespesa /></Bloqueado>} />

        {/* Admin-only: já redobra a proteção. Acesso restrito também é redirecionado. */}
        <Route path="/configuracoes"  element={<AdminRoute><Configuracoes /></AdminRoute>} />
        <Route path="/equipes"        element={<AdminRoute><Equipes /></AdminRoute>} />
        <Route path="/pessoas"        element={<AdminRoute><Pessoas /></AdminRoute>} />
        <Route path="/representacoes" element={<AdminRoute><Representacoes /></AdminRoute>} />

        {/* ===== Sprint 31 — LIBERADAS pra acesso restrito ===== */}
        {/* Sprint 10 — Tarefas (Trello interno) */}
        <Route path="/tarefas" element={<Tarefas />} />
        <Route path="/tarefas/:id" element={<Quadro />} />

        {/* Sprint 14 — Processos / Workflows (BPMN) */}
        <Route path="/processos" element={<Processos />} />
        <Route path="/processos/:id" element={<EditorProcesso />} />
        {/* Sprint 15 — Instâncias / execuções do processo */}
        <Route path="/processos/:id/instancias" element={<InstanciasProcesso />} />

        {/* Sprint 22 — Dashboard cross-processo de instâncias em andamento */}
        <Route path="/instancias" element={<Instancias />} />

        {/* Sprint 20 — Cartórios */}
        <Route path="/cartorios" element={<Cartorios />} />
        <Route path="/cartorios/:id" element={<Cartorio />} />
      </Route>

      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
