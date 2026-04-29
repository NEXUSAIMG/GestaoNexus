import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext.jsx';

/**
 * Envelope que protege rotas autenticadas.
 *
 * Regras:
 *   - Se ainda está carregando o token → tela de loading.
 *   - Se não está autenticado → manda para /login, guardando o destino.
 *   - Se está autenticado mas precisa escolher contexto → manda para
 *     /escolher-contexto (a menos que já esteja lá).
 *   - Se tudo ok → renderiza os filhos.
 */
export default function ProtectedRoute({ children }) {
  const { autenticado, carregando, precisaEscolherContexto } = useAuth();
  const location = useLocation();

  if (carregando) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50">
        <div className="text-slate-500 text-sm">Carregando...</div>
      </div>
    );
  }

  if (!autenticado) {
    return <Navigate to="/login" replace state={{ de: location.pathname }} />;
  }

  if (precisaEscolherContexto && location.pathname !== '/escolher-contexto') {
    return <Navigate to="/escolher-contexto" replace state={{ de: location.pathname }} />;
  }

  return children;
}
