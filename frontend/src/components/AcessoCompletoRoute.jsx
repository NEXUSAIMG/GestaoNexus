import { Navigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext.jsx';

/**
 * Sprint 31 — Envelope para rotas bloqueadas pra "acesso restrito".
 *
 * Deve ser usado DENTRO de um ProtectedRoute — assume que a pessoa
 * já está autenticada.
 *
 * Regras:
 *   - Admin sempre passa (independente da flag).
 *   - Pessoa com `acesso_restrito = TRUE` é redirecionada pra /tarefas
 *     (que é uma das 4 áreas liberadas).
 *   - Demais pessoas passam normalmente.
 *
 * É só uma trava extra na navegação. A proteção real está no backend
 * (middleware `exigirAcessoCompleto` em `routes/index.js`). Mesmo que
 * alguém burle o frontend e acesse a rota direto, as chamadas de API
 * vão devolver 403.
 */
export default function AcessoCompletoRoute({ children }) {
  const { pessoa } = useAuth();

  // Admin passa sempre.
  if (pessoa?.administrador) return children;

  // Pessoa restrita não pode estar aqui — manda pra área permitida.
  if (pessoa?.acesso_restrito) {
    return <Navigate to="/tarefas" replace />;
  }

  return children;
}
