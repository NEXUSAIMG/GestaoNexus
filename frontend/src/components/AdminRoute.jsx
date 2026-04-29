import { Navigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext.jsx';

/**
 * Envelope para rotas restritas a administradores.
 *
 * Deve ser usado DENTRO de um ProtectedRoute — ele assume que a pessoa
 * já está autenticada. Se não for admin, devolve para o dashboard.
 *
 * É só uma trava extra na navegação; a proteção de verdade está no
 * backend (middleware exigirAdmin).
 */
export default function AdminRoute({ children }) {
  const { pessoa } = useAuth();
  if (!pessoa?.administrador) {
    return <Navigate to="/" replace />;
  }
  return children;
}
