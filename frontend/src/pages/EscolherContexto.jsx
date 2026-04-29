import { useState } from 'react';
import { Navigate, useNavigate, useLocation } from 'react-router-dom';
import {
  LogOut, ArrowRight, Shield, Briefcase, UserCircle2, Loader2, Users,
} from 'lucide-react';
import { useAuth } from '../context/AuthContext.jsx';
import { mensagemDeErro } from '../api/client.js';

const iconePorPapel = {
  titular: UserCircle2,
  representante: Briefcase,
  procurador: Shield,
};

const rotuloPorPapel = {
  titular: 'Titular',
  representante: 'Representante',
  procurador: 'Procurador',
};

function formatarPercentual(v) {
  if (v === null || v === undefined) return '';
  return `${Number(v).toFixed(2).replace('.', ',')}%`;
}

/**
 * Tela intermediária que aparece logo após o login, quando a pessoa
 * representa mais de um sócio. Ela precisa dizer "em nome de quem"
 * vai agir nesta sessão antes de entrar.
 *
 * Uma pessoa com uma única representação, ou um administrador puro,
 * nunca cai aqui — o token sai já com o contexto certo do /auth/login.
 */
export default function EscolherContexto() {
  const {
    pessoa, representacoes, representacaoAtual,
    autenticado, carregando, escolherContexto, sair,
  } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const destino = location.state?.de && location.state.de !== '/escolher-contexto'
    ? location.state.de
    : '/';

  const [trocando, setTrocando] = useState(null);
  const [erro, setErro] = useState('');

  if (!carregando && !autenticado) {
    return <Navigate to="/login" replace />;
  }

  // Se não tem motivo pra estar aqui (já tem contexto escolhido ou
  // pessoa é admin sem representação), vai pro destino.
  const naoPrecisaDisso =
    autenticado
    && (representacaoAtual || representacoes.length <= 1 || pessoa?.administrador);

  if (!carregando && naoPrecisaDisso && !trocando) {
    return <Navigate to={destino} replace />;
  }

  async function selecionar(socioId) {
    setErro('');
    setTrocando(socioId);
    try {
      await escolherContexto(socioId);
      navigate(destino, { replace: true });
    } catch (err) {
      setErro(mensagemDeErro(err, 'Não foi possível entrar nesse contexto.'));
      setTrocando(null);
    }
  }

  function sairClicado() {
    sair();
    navigate('/login', { replace: true });
  }

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto max-w-3xl flex items-center justify-between px-6 py-4">
          <div>
            <div className="text-xs uppercase tracking-widest text-nexus-700">Gestão Nexus</div>
            <div className="text-sm text-slate-600">Olá, {pessoa?.nome}</div>
          </div>
          <button
            type="button"
            onClick={sairClicado}
            className="inline-flex items-center gap-2 rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm text-slate-700 hover:bg-slate-50"
          >
            <LogOut size={14} />
            Sair
          </button>
        </div>
      </header>

      <main className="flex-1">
        <div className="mx-auto max-w-3xl px-6 py-10">
          <div className="mb-8">
            <div className="inline-flex items-center gap-2 rounded-full bg-nexus-100 px-3 py-1 text-xs font-medium text-nexus-800">
              <Users size={14} />
              Você representa mais de um sócio
            </div>
            <h1 className="mt-4 text-2xl font-semibold text-slate-900">
              Em nome de quem você vai agir agora?
            </h1>
            <p className="mt-2 text-slate-600">
              Você pode trocar de contexto a qualquer momento pelo menu lateral,
              sem precisar sair e entrar de novo.
            </p>
          </div>

          {erro && (
            <div className="mb-4 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
              {erro}
            </div>
          )}

          <ul className="grid gap-3 sm:grid-cols-2">
            {representacoes.map((r) => {
              const Icone = iconePorPapel[r.papel] ?? UserCircle2;
              const trocandoEste = trocando === r.socio_id;
              return (
                <li key={r.id}>
                  <button
                    type="button"
                    disabled={!!trocando}
                    onClick={() => selecionar(r.socio_id)}
                    className={[
                      'group w-full rounded-xl border border-slate-200 bg-white p-4 text-left shadow-sm transition-all',
                      'hover:border-nexus-300 hover:shadow',
                      trocandoEste && 'opacity-60',
                      trocando && !trocandoEste && 'opacity-40 cursor-not-allowed',
                    ].filter(Boolean).join(' ')}
                  >
                    <div className="flex items-start gap-3">
                      <div className="rounded-lg bg-nexus-50 p-2.5 text-nexus-700">
                        <Icone size={18} />
                      </div>

                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-slate-600">
                            {rotuloPorPapel[r.papel]}
                          </span>
                          {r.socio_tipo_pessoa === 'juridica' && (
                            <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-slate-600">
                              PJ
                            </span>
                          )}
                        </div>
                        <div className="mt-1 truncate font-semibold text-slate-900">
                          {r.socio_nome}
                        </div>
                        {r.socio_percentual ? (
                          <div className="mt-0.5 text-xs text-slate-500">
                            Participação: {formatarPercentual(r.socio_percentual)}
                          </div>
                        ) : null}
                      </div>

                      {trocandoEste ? (
                        <Loader2 size={16} className="shrink-0 animate-spin text-slate-400" />
                      ) : (
                        <ArrowRight size={16} className="shrink-0 text-slate-300 group-hover:text-nexus-700" />
                      )}
                    </div>
                  </button>
                </li>
              );
            })}
          </ul>
        </div>
      </main>
    </div>
  );
}
