import { useState } from 'react';
import { Navigate, useLocation, useNavigate } from 'react-router-dom';
import { Eye, EyeOff, LogIn } from 'lucide-react';
import { useAuth } from '../context/AuthContext.jsx';
import { mensagemDeErro } from '../api/client.js';

export default function Login() {
  const { login, autenticado, carregando, precisaEscolherContexto } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const destinoSolicitado = location.state?.de || '/';

  const [email, setEmail] = useState('');
  const [senha, setSenha] = useState('');
  const [mostrarSenha, setMostrarSenha] = useState(false);
  const [erro, setErro] = useState('');
  const [enviando, setEnviando] = useState(false);

  // Se já está logado ao chegar aqui, segue direto.
  if (!carregando && autenticado) {
    const para = precisaEscolherContexto ? '/escolher-contexto' : destinoSolicitado;
    return <Navigate to={para} replace />;
  }

  async function enviar(e) {
    e.preventDefault();
    setErro('');
    setEnviando(true);
    try {
      const { precisaEscolherContexto: precisa } = await login(email.trim(), senha);
      if (precisa) {
        navigate('/escolher-contexto', { replace: true, state: { de: destinoSolicitado } });
      } else {
        navigate(destinoSolicitado, { replace: true });
      }
    } catch (err) {
      setErro(mensagemDeErro(err, 'Não foi possível entrar. Verifique os dados.'));
    } finally {
      setEnviando(false);
    }
  }

  return (
    <div className="min-h-screen grid lg:grid-cols-2">
      {/* Coluna esquerda — marca */}
      <div className="hidden lg:flex flex-col justify-between bg-gradient-to-br from-nexus-900 to-nexus-950 p-12 text-white">
        <div>
          <div className="text-sm uppercase tracking-[0.2em] text-nexus-200">Nexus</div>
          <div className="mt-2 text-3xl font-semibold">Gestão & Transparência</div>
        </div>
        <div className="max-w-md">
          <div className="text-2xl font-light leading-snug">
            Um único lugar para os sócios acompanharem{' '}
            <span className="font-semibold text-white">comercial</span>,{' '}
            <span className="font-semibold text-white">financeiro</span> e{' '}
            <span className="font-semibold text-white">decisões</span> da empresa.
          </div>
          <div className="mt-6 text-sm text-nexus-200">
            Tudo aberto para quem é sócio. Sem planilhas perdidas.
          </div>
        </div>
        <div className="text-xs text-nexus-300">
          Gestão Ayio · v1.2
        </div>
      </div>

      {/* Coluna direita — formulário */}
      <div className="flex items-center justify-center p-6 lg:p-12 bg-slate-50">
        <div className="w-full max-w-sm">
          <div className="lg:hidden mb-8 text-center">
            <div className="text-sm uppercase tracking-[0.2em] text-nexus-700">Nexus</div>
            <div className="mt-1 text-2xl font-semibold text-slate-900">Gestão & Transparência</div>
          </div>

          <h1 className="text-2xl font-semibold text-slate-900">Entrar</h1>
          <p className="mt-1 text-sm text-slate-600">
            Use seu e-mail cadastrado para acessar.
          </p>

          <form onSubmit={enviar} className="mt-8 space-y-4">
            <div>
              <label className="block text-sm font-medium text-slate-700" htmlFor="email">
                E-mail
              </label>
              <input
                id="email"
                type="email"
                required
                autoFocus
                autoComplete="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm shadow-sm outline-none focus:border-nexus-500 focus:ring-2 focus:ring-nexus-200"
                placeholder="voce@nexus.com.br"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-700" htmlFor="senha">
                Senha
              </label>
              <div className="relative mt-1">
                <input
                  id="senha"
                  type={mostrarSenha ? 'text' : 'password'}
                  required
                  autoComplete="current-password"
                  value={senha}
                  onChange={(e) => setSenha(e.target.value)}
                  className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 pr-10 text-sm shadow-sm outline-none focus:border-nexus-500 focus:ring-2 focus:ring-nexus-200"
                />
                <button
                  type="button"
                  onClick={() => setMostrarSenha((v) => !v)}
                  className="absolute inset-y-0 right-0 flex items-center px-3 text-slate-400 hover:text-slate-600"
                  aria-label={mostrarSenha ? 'Ocultar senha' : 'Mostrar senha'}
                >
                  {mostrarSenha ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              </div>
            </div>

            {erro && (
              <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
                {erro}
              </div>
            )}

            <button
              type="submit"
              disabled={enviando}
              className="inline-flex w-full items-center justify-center gap-2 rounded-lg bg-nexus-700 px-4 py-2.5 text-sm font-medium text-white shadow-sm transition-colors hover:bg-nexus-800 disabled:cursor-not-allowed disabled:opacity-60"
            >
              <LogIn size={16} />
              {enviando ? 'Entrando...' : 'Entrar'}
            </button>
          </form>

          <p className="mt-6 text-xs text-slate-500">
            Esqueceu a senha? Fale com um dos administradores para redefinir.
          </p>
        </div>
      </div>
    </div>
  );
}
