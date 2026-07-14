import { AlertCircle, X, Ban } from 'lucide-react';
import { PRIORIDADES } from './ui.js';

/**
 * Barra de filtros do board.
 * Sprint 34 — dois filtros novos: prioridade e "só bloqueados".
 */
export default function FiltroBar({
  responsaveis, etiquetas,
  filtroResponsavel, setFiltroResponsavel,
  filtroEtiqueta, setFiltroEtiqueta,
  filtroAtrasados, setFiltroAtrasados,
  filtroPrioridade, setFiltroPrioridade,
  filtroBloqueados, setFiltroBloqueados,
}) {
  const algumAtivo = filtroResponsavel || filtroEtiqueta || filtroAtrasados
    || filtroPrioridade !== '' || filtroBloqueados;

  return (
    <div className="flex items-center gap-1.5 text-xs">
      <select
        className="rounded-lg border border-slate-300 bg-white px-2 py-1.5 text-xs text-slate-700"
        value={filtroResponsavel}
        onChange={(e) => setFiltroResponsavel(e.target.value)}
      >
        <option value="">Todos os responsáveis</option>
        <option value="__sem__">Sem responsável</option>
        {responsaveis.map((r) => (<option key={r.id} value={r.id}>{r.nome}</option>))}
      </select>

      <select
        className="rounded-lg border border-slate-300 bg-white px-2 py-1.5 text-xs text-slate-700"
        value={filtroEtiqueta}
        onChange={(e) => setFiltroEtiqueta(e.target.value)}
      >
        <option value="">Todas as etiquetas</option>
        {etiquetas.map((e) => (<option key={e.id} value={e.id}>{e.nome}</option>))}
      </select>

      <select
        className="rounded-lg border border-slate-300 bg-white px-2 py-1.5 text-xs text-slate-700"
        value={filtroPrioridade}
        onChange={(e) => setFiltroPrioridade(e.target.value)}
      >
        <option value="">Qualquer prioridade</option>
        {PRIORIDADES.map((p) => (
          <option key={p.valor} value={String(p.valor)}>{p.sigla} · {p.nome}</option>
        ))}
      </select>

      <button
        type="button"
        onClick={() => setFiltroBloqueados((x) => !x)}
        className={[
          'inline-flex items-center gap-1 rounded-lg border px-2 py-1.5 font-medium',
          filtroBloqueados
            ? 'border-red-300 bg-red-50 text-red-700'
            : 'border-slate-300 bg-white text-slate-700 hover:bg-slate-50',
        ].join(' ')}
        title="Só cards travados por dependência"
      >
        <Ban size={11} /> Bloqueados
      </button>

      <button
        type="button"
        onClick={() => setFiltroAtrasados((x) => !x)}
        className={[
          'inline-flex items-center gap-1 rounded-lg border px-2 py-1.5 font-medium',
          filtroAtrasados
            ? 'border-red-300 bg-red-50 text-red-700'
            : 'border-slate-300 bg-white text-slate-700 hover:bg-slate-50',
        ].join(' ')}
      >
        <AlertCircle size={11} /> Atrasados
      </button>

      {algumAtivo && (
        <button
          type="button"
          onClick={() => {
            setFiltroResponsavel('');
            setFiltroEtiqueta('');
            setFiltroAtrasados(false);
            setFiltroPrioridade('');
            setFiltroBloqueados(false);
          }}
          className="rounded-lg p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700"
          title="Limpar filtros"
        >
          <X size={12} />
        </button>
      )}
    </div>
  );
}
