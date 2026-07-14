import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Workflow, GitBranch, ListChecks, X } from 'lucide-react';
import { api, mensagemDeErro } from '../../api/client.js';

/**
 * Sprint 15 — instância de processo dentro do quadro.
 * Extraído do Quadro.jsx sem mudança de comportamento (Sprint 34 refactor).
 */

export function HeaderInstancia({ instancia, aoAbrirDecisao }) {
  const concluidos = instancia.nos.filter((n) => n.status === 'concluido').length;
  const ativos = instancia.nos.filter((n) => n.status === 'ativo').length;
  const pct = instancia.total_nos > 0
    ? Math.round((concluidos / instancia.total_nos) * 100)
    : 0;
  const pendentes = instancia.decisoes_pendentes || [];

  const chipStatus = instancia.status === 'em_andamento'
    ? 'bg-amber-100 text-amber-800'
    : instancia.status === 'concluida'
      ? 'bg-emerald-100 text-emerald-800'
      : 'bg-slate-100 text-slate-600';

  const rotuloStatus = instancia.status === 'em_andamento'
    ? 'em andamento'
    : instancia.status === 'concluida' ? 'concluída' : 'cancelada';

  return (
    <div className="border-b border-nexus-200 bg-gradient-to-r from-nexus-50 to-white px-4 py-2.5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2 min-w-0">
          <Workflow size={14} className="text-nexus-700 shrink-0" />
          <div className="min-w-0">
            <div className="text-[10px] uppercase tracking-wide text-nexus-700 font-medium">
              Instância do processo · {instancia.processo_nome}
            </div>
            <div className="flex items-center gap-2">
              <span className="text-sm font-semibold text-slate-900 truncate">{instancia.nome}</span>
              <span className={'rounded px-1.5 py-0.5 text-[10px] font-medium uppercase ' + chipStatus}>
                {rotuloStatus}
              </span>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2 text-xs">
          <div className="w-32 h-1.5 rounded-full bg-slate-200 overflow-hidden">
            <div
              className={'h-full ' + (instancia.status === 'concluida' ? 'bg-emerald-500' : 'bg-nexus-600')}
              style={{ width: pct + '%' }}
            />
          </div>
          <span className="tabular-nums text-slate-600">
            {concluidos}/{instancia.total_nos}
            {ativos > 0 && (
              <span className="text-amber-700"> · {ativos} ativo{ativos === 1 ? '' : 's'}</span>
            )}
          </span>
          <Link
            to={'/processos/' + instancia.processo_id + '/instancias'}
            className="inline-flex items-center gap-1 rounded border border-slate-300 bg-white px-2 py-0.5 text-[11px] font-medium text-slate-700 hover:bg-slate-50"
          >
            <ListChecks size={10} /> Todas
          </Link>
        </div>
      </div>

      {pendentes.length > 0 && (
        <div className="mt-2 rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 flex items-center justify-between gap-2">
          <div className="flex items-center gap-2 text-sm text-amber-900">
            <GitBranch size={14} className="shrink-0" />
            <span>
              {pendentes.length === 1 ? (
                <>Decisão pendente: <strong>{pendentes[0].rotulo}</strong></>
              ) : (
                <><strong>{pendentes.length} decisões</strong> aguardando escolha de saída</>
              )}
            </span>
          </div>
          <button
            type="button"
            onClick={() => aoAbrirDecisao(pendentes[0])}
            className="inline-flex items-center gap-1 rounded-lg bg-amber-600 px-3 py-1 text-xs font-medium text-white hover:bg-amber-700"
          >
            Escolher saída
          </button>
        </div>
      )}
    </div>
  );
}

export function ModalEscolherSaida({ decisao, aoFechar, aoEscolhido }) {
  const [enviando, setEnviando] = useState(false);
  const [erro, setErro] = useState('');

  async function escolher(arestaId) {
    setEnviando(true);
    setErro('');
    try {
      await api.post('/instancias/' + decisao.instancia_no_id + '/escolher-saida', {
        aresta_id: arestaId,
      });
      aoEscolhido();
    } catch (err) {
      setErro(mensagemDeErro(err, 'Não consegui registrar a escolha.'));
      setEnviando(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4">
      <div className="w-full max-w-md rounded-xl bg-white shadow-xl">
        <header className="flex items-center justify-between border-b border-slate-200 px-5 py-3">
          <h2 className="text-base font-semibold text-slate-900 inline-flex items-center gap-1.5">
            <GitBranch size={14} className="text-amber-600" /> Decisão: {decisao.rotulo}
          </h2>
          <button onClick={aoFechar} className="rounded p-1 text-slate-400 hover:bg-slate-100">
            <X size={18} />
          </button>
        </header>

        <div className="p-5 space-y-4">
          <p className="text-sm text-slate-600">
            Qual caminho o processo deve seguir agora? A escolha é definitiva
            e cria os próximos cards automaticamente.
          </p>

          {decisao.saidas.length === 0 ? (
            <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
              Esta decisão não tem nenhuma saída no processo. Volte ao editor
              e adicione conexões a partir deste nó.
            </div>
          ) : (
            <div className="space-y-2">
              {decisao.saidas.map((s, i) => (
                <button
                  key={s.id}
                  type="button"
                  disabled={enviando}
                  onClick={() => escolher(s.id)}
                  className="w-full rounded-lg border-2 border-slate-200 bg-white p-3 text-left hover:border-nexus-400 hover:bg-nexus-50 disabled:opacity-50 transition-colors"
                >
                  <div className="flex items-center gap-2">
                    <span className="inline-flex h-6 w-6 items-center justify-center rounded-full bg-amber-100 text-xs font-bold text-amber-800">
                      {String.fromCharCode(65 + i)}
                    </span>
                    <div className="flex-1">
                      <div className="text-sm font-medium text-slate-900">
                        {s.rotulo || ('Caminho ' + String.fromCharCode(65 + i))}
                      </div>
                      <div className="text-xs text-slate-500">
                        Próxima etapa: <strong>{s.destino_rotulo}</strong>
                      </div>
                    </div>
                  </div>
                </button>
              ))}
            </div>
          )}

          {erro && (
            <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{erro}</div>
          )}

          <div className="flex justify-end pt-2">
            <button
              type="button"
              onClick={aoFechar}
              className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
            >
              Decidir depois
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
