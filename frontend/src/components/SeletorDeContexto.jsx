import { useEffect, useRef, useState } from 'react';
import { ChevronDown, Users, Check, Shield, Briefcase, UserCircle2, Loader2 } from 'lucide-react';
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
 * Dropdown que exibe em qual sócio estamos agindo e permite trocar
 * para outro, quando a pessoa logada representa múltiplos sócios.
 *
 * Se a pessoa tem só 1 representação, mostra só o resumo (sem dropdown).
 * Se é admin puro (sem representações), mostra "Administração".
 */
export default function SeletorDeContexto() {
  const { pessoa, representacoes, representacaoAtual, escolherContexto } = useAuth();
  const [aberto, setAberto] = useState(false);
  const [trocando, setTrocando] = useState(null);
  const [erro, setErro] = useState('');
  const refRaiz = useRef(null);

  // Fecha ao clicar fora.
  useEffect(() => {
    if (!aberto) return;
    function aoClicarFora(e) {
      if (refRaiz.current && !refRaiz.current.contains(e.target)) setAberto(false);
    }
    document.addEventListener('mousedown', aoClicarFora);
    return () => document.removeEventListener('mousedown', aoClicarFora);
  }, [aberto]);

  // Admin puro, sem nenhuma representação ativa.
  if (representacoes.length === 0) {
    return (
      <div className="inline-flex items-center gap-2 rounded-lg bg-nexus-800/40 px-3 py-1.5 text-sm text-nexus-100">
        <Shield size={14} />
        <span>Modo administração</span>
      </div>
    );
  }

  const atual = representacaoAtual || (representacoes.length === 1 ? representacoes[0] : null);

  async function trocar(socioId) {
    if (atual?.socio_id === socioId) { setAberto(false); return; }
    setErro('');
    setTrocando(socioId);
    try {
      await escolherContexto(socioId);
      setAberto(false);
    } catch (err) {
      setErro(mensagemDeErro(err, 'Não foi possível trocar de contexto.'));
    } finally {
      setTrocando(null);
    }
  }

  const multiplo = representacoes.length > 1;
  const Icone = atual ? iconePorPapel[atual.papel] ?? UserCircle2 : Users;

  return (
    <div ref={refRaiz} className="relative">
      <button
        type="button"
        disabled={!multiplo}
        onClick={() => setAberto((v) => !v)}
        className={[
          'flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm text-white',
          multiplo
            ? 'bg-nexus-800/60 hover:bg-nexus-800'
            : 'bg-nexus-800/40 cursor-default',
        ].join(' ')}
      >
        <Icone size={16} className="shrink-0 text-nexus-200" />
        <div className="min-w-0 flex-1">
          <div className="text-[10px] uppercase tracking-wide text-nexus-200">
            {atual ? rotuloPorPapel[atual.papel] : 'Selecionar sócio'}
          </div>
          <div className="truncate font-medium">
            {atual ? atual.socio_nome : 'Escolher contexto'}
          </div>
        </div>
        {multiplo && (
          <ChevronDown
            size={14}
            className={['text-nexus-200 transition-transform', aberto && 'rotate-180'].filter(Boolean).join(' ')}
          />
        )}
      </button>

      {aberto && multiplo && (
        <div className="absolute bottom-full left-0 right-0 z-50 mb-2 overflow-hidden rounded-lg border border-slate-200 bg-white shadow-xl">
          <div className="border-b border-slate-100 bg-slate-50 px-3 py-2">
            <div className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">
              Você representa
            </div>
            <div className="text-xs text-slate-700">{pessoa?.nome}</div>
          </div>

          <ul className="max-h-72 overflow-y-auto py-1">
            {representacoes.map((r) => {
              const IconeItem = iconePorPapel[r.papel] ?? UserCircle2;
              const ativo = atual?.socio_id === r.socio_id;
              const trocandoEste = trocando === r.socio_id;
              return (
                <li key={r.id}>
                  <button
                    type="button"
                    disabled={trocandoEste}
                    onClick={() => trocar(r.socio_id)}
                    className={[
                      'flex w-full items-center gap-3 px-3 py-2 text-left text-sm transition-colors',
                      ativo ? 'bg-nexus-50 text-nexus-900' : 'hover:bg-slate-50 text-slate-700',
                    ].join(' ')}
                  >
                    <IconeItem size={16} className={ativo ? 'text-nexus-700' : 'text-slate-400'} />
                    <div className="min-w-0 flex-1">
                      <div className="truncate font-medium">{r.socio_nome}</div>
                      <div className="truncate text-[11px] text-slate-500">
                        {rotuloPorPapel[r.papel]}
                        {r.socio_percentual ? ` · ${formatarPercentual(r.socio_percentual)}` : ''}
                      </div>
                    </div>
                    {trocandoEste && <Loader2 size={14} className="animate-spin text-slate-400" />}
                    {ativo && !trocandoEste && <Check size={14} className="text-nexus-700" />}
                  </button>
                </li>
              );
            })}
          </ul>

          {erro && (
            <div className="border-t border-red-100 bg-red-50 px-3 py-2 text-xs text-red-700">
              {erro}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
