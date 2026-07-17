import { AlertCircle, X, Ban, Search } from 'lucide-react';
import { PRIORIDADES } from './ui.js';

/**
 * Barra de filtros do board.
 * Sprint 34 — dois filtros novos: prioridade e "só bloqueados".
 * Sprint 41 — busca de cards por texto (título + descrição).
 */
export default function FiltroBar({
  responsaveis, etiquetas,
  filtroBusca, setFiltroBusca,
  filtroResponsavel, setFiltroResponsavel,
  filtroEtiqueta, setFiltroEtiqueta,
  filtroAtrasados, setFiltroAtrasados,
  filtroPrioridade, setFiltroPrioridade,
  filtroBloqueados, setFiltroBloqueados,
}) {
  const algumAtivo = filtroBusca || filtroResponsavel || filtroEtiqueta || filtroAtrasados
    || filtroPrioridade !== '' || filtroBloqueados;

  return (
    <div className="flex items-center gap-1.5 text-xs">
      <div className="relative">
        <Search size={13} className="pointer-events-none absolute left-2 top-1/2 -translate-y-1/2 text-slate-400" />
        <input
          type="text"
          value={filtroBusca}
          onChange={(e) => setFiltroBusca(e.target.value)}
          placeholder="Buscar cards…"
          className="w-44 rounded-lg border border-slate-300 bg-white py-1.5 pl-7 pr-6 text-xs text-slate-700 focus:border-nexus-500 focus:outline-none"
        />
        {filtroBusca && (
          <button
            type="button"
            onClick={() => setFiltroBusca('')}
            className="absolute right-1.5 top-1/2 -translate-y-1/2 rounded p-0.5 text-slate-400 hover:bg-slate-100 hover:text-slate-600"
            title="Limpar busca"
          >
            <X size={11} />
          </button>
        )}
      </div>

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
            setFiltroBusca('');
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
