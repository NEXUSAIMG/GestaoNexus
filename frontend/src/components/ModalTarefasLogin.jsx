import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ClipboardList, AlertTriangle, ArrowRight, X } from 'lucide-react';
import { api } from '../api/client.js';
import { useAuth } from '../context/AuthContext.jsx';

/**
 * Modal de boas-vindas — "voce tem tarefas te esperando".
 *
 * Objetivo: chamar a atencao da pessoa logo que ela entra, quando ha
 * cards atribuidos a ela ainda nao concluidos. Aparece UMA vez por
 * sessao de login (nao a cada navegacao).
 *
 * Fonte de dados: reaproveita GET /api/cards/meus (ja existente). O
 * backend amarra pelo JWT, entao so vem card da propria pessoa.
 * "Pendente" = card nao arquivado e sem concluido_em (nao esta numa
 * coluna do tipo 'concluida').
 *
 * Controle de exibicao: guarda no sessionStorage o token da sessao
 * atual. Como cada login gera um token novo, o modal reaparece a cada
 * novo login, mas nao volta a incomodar enquanto a pessoa navega.
 */

const CHAVE_VISTO = 'nexus_modal_tarefas_visto';
const MAX_LISTADAS = 5;

function hojeLocal() {
  const d = new Date();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${d.getFullYear()}-${mm}-${dd}`;
}

/** Compara so a parte YYYY-MM-DD (ignora fuso/hora). */
function estaAtrasada(dataPrazo) {
  if (!dataPrazo) return false;
  return String(dataPrazo).slice(0, 10) < hojeLocal();
}

function formatarPrazo(dataPrazo) {
  if (!dataPrazo) return null;
  const iso = String(dataPrazo).slice(0, 10);
  const [a, m, d] = iso.split('-');
  return `${d}/${m}/${a}`;
}

export default function ModalTarefasLogin() {
  const { autenticado, pessoa } = useAuth();
  const navigate = useNavigate();
  const [tarefas, setTarefas] = useState([]);
  const [aberto, setAberto] = useState(false);

  useEffect(() => {
    if (!autenticado || !pessoa?.id) return;

    const token = localStorage.getItem('nexus_token');
    // Ja mostrou nesta sessao de login? nao busca de novo.
    if (!token || sessionStorage.getItem(CHAVE_VISTO) === token) return;

    let ativo = true;
    (async () => {
      try {
        const r = await api.get('/cards/meus');
        if (!ativo) return;

        const pendentes = (r.data ?? [])
          .filter((c) => !c.concluido_em && !c.arquivado)
          .sort((a, b) => {
            // Atrasadas primeiro, depois por prazo mais proximo, sem prazo por ultimo.
            const atA = estaAtrasada(a.data_prazo) ? 0 : 1;
            const atB = estaAtrasada(b.data_prazo) ? 0 : 1;
            if (atA !== atB) return atA - atB;
            const pa = a.data_prazo || '9999-12-31';
            const pb = b.data_prazo || '9999-12-31';
            return String(pa).localeCompare(String(pb));
          });

        // Marca como visto independentemente do resultado (evita refetch
        // a cada re-render / troca de rota dentro da mesma sessao).
        sessionStorage.setItem(CHAVE_VISTO, token);

        if (pendentes.length > 0) {
          setTarefas(pendentes);
          setAberto(true);
        }
      } catch {
        // Silencioso: se falhar a busca, o app segue normal sem o modal.
      }
    })();

    return () => { ativo = false; };
  }, [autenticado, pessoa?.id]);

  if (!aberto) return null;

  const total = tarefas.length;
  const atrasadas = tarefas.filter((t) => estaAtrasada(t.data_prazo)).length;
  const primeiroNome = (pessoa?.nome || '').split(' ')[0] || '';
  const visiveis = tarefas.slice(0, MAX_LISTADAS);
  const restantes = total - visiveis.length;

  function fechar() {
    setAberto(false);
  }

  function irParaTarefas() {
    fechar();
    navigate('/tarefas');
  }

  function irParaCard(card) {
    fechar();
    // /tarefas/:quadroId abre o quadro onde o card esta.
    navigate(`/tarefas/${card.quadro_id}`);
  }

  return (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="modal-tarefas-titulo"
    >
      {/* Fundo escuro */}
      <button
        type="button"
        onClick={fechar}
        className="absolute inset-0 bg-slate-900/50"
        aria-label="Fechar"
      />

      {/* Cartao */}
      <div className="relative w-full max-w-md overflow-hidden rounded-2xl bg-white shadow-2xl">
        {/* Cabecalho */}
        <div className="flex items-start gap-3 bg-nexus-950 px-5 py-4 text-white">
          <div className="mt-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-nexus-700">
            <ClipboardList size={20} />
          </div>
          <div className="flex-1 min-w-0">
            <div id="modal-tarefas-titulo" className="text-base font-semibold">
              {primeiroNome ? `Ola, ${primeiroNome}!` : 'Ola!'}
            </div>
            <div className="text-sm text-nexus-100">
              Voce tem{' '}
              <strong className="text-white">
                {total} {total === 1 ? 'tarefa' : 'tarefas'}
              </strong>{' '}
              te esperando no quadro.
            </div>
          </div>
          <button
            type="button"
            onClick={fechar}
            className="rounded-md p-1 text-nexus-200 hover:bg-white/10 hover:text-white"
            aria-label="Fechar"
          >
            <X size={18} />
          </button>
        </div>

        {/* Aviso de atrasadas */}
        {atrasadas > 0 && (
          <div className="flex items-center gap-2 border-b border-amber-200 bg-amber-50 px-5 py-2.5 text-sm text-amber-800">
            <AlertTriangle size={16} className="shrink-0" />
            <span>
              {atrasadas} {atrasadas === 1 ? 'esta atrasada' : 'estao atrasadas'}.
            </span>
          </div>
        )}

        {/* Lista */}
        <ul className="max-h-72 divide-y divide-slate-100 overflow-y-auto">
          {visiveis.map((c) => {
            const atrasada = estaAtrasada(c.data_prazo);
            const prazo = formatarPrazo(c.data_prazo);
            return (
              <li key={c.id}>
                <button
                  type="button"
                  onClick={() => irParaCard(c)}
                  className="flex w-full items-center gap-3 px-5 py-3 text-left transition-colors hover:bg-slate-50"
                >
                  <div className="flex-1 min-w-0">
                    <div className="truncate text-sm font-medium text-slate-800">
                      {c.titulo}
                    </div>
                    {prazo && (
                      <div
                        className={[
                          'mt-0.5 text-xs',
                          atrasada ? 'font-medium text-red-600' : 'text-slate-500',
                        ].join(' ')}
                      >
                        {atrasada ? 'Venceu em ' : 'Prazo: '}
                        {prazo}
                      </div>
                    )}
                  </div>
                  <ArrowRight size={16} className="shrink-0 text-slate-300" />
                </button>
              </li>
            );
          })}
        </ul>

        {restantes > 0 && (
          <div className="border-t border-slate-100 px-5 py-2 text-center text-xs text-slate-500">
            + {restantes} {restantes === 1 ? 'outra tarefa' : 'outras tarefas'}
          </div>
        )}

        {/* Acoes */}
        <div className="flex items-center justify-end gap-2 border-t border-slate-200 bg-slate-50 px-5 py-3">
          <button
            type="button"
            onClick={fechar}
            className="rounded-lg px-3 py-2 text-sm font-medium text-slate-600 hover:bg-slate-200/60"
          >
            Depois
          </button>
          <button
            type="button"
            onClick={irParaTarefas}
            className="inline-flex items-center gap-1.5 rounded-lg bg-nexus-700 px-4 py-2 text-sm font-semibold text-white hover:bg-nexus-800"
          >
            Ver minhas tarefas
            <ArrowRight size={16} />
          </button>
        </div>
      </div>
    </div>
  );
}
