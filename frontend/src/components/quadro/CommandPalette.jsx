import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Search, KanbanSquare, CreditCard, Table2, GanttChartSquare, BarChart3,
  CornerDownLeft,
} from 'lucide-react';

/**
 * Sprint 38 — Command palette (Ctrl/Cmd+K).
 *
 * Uma caixa de busca única sobre TUDO que a pessoa alcança rápido:
 *   - cards do quadro atual (pula direto pro card)
 *   - outros quadros (navega)
 *   - trocar de vista do quadro atual
 *
 * Sem dependência: filtro em memória. O board já tem os cards; os quadros
 * vêm de uma chamada única quando a paleta abre pela primeira vez.
 */

const ICONE_VISTA = {
  kanban: KanbanSquare, tabela: Table2, timeline: GanttChartSquare,
  metricas: BarChart3, carga: KanbanSquare,
};

export default function CommandPalette({
  aberto, onFechar, quadro, quadros, aoAbrirCard, aoTrocarVista,
}) {
  const [busca, setBusca] = useState('');
  const [idx, setIdx] = useState(0);
  const inputRef = useRef(null);
  const navigate = useNavigate();

  useEffect(() => {
    if (aberto) {
      setBusca('');
      setIdx(0);
      setTimeout(() => inputRef.current?.focus(), 20);
    }
  }, [aberto]);

  const itens = useMemo(() => {
    const termo = busca.trim().toLowerCase();
    const lista = [];

    // Vistas do quadro atual
    const vistas = [
      { id: 'kanban', nome: 'Kanban' },
      { id: 'tabela', nome: 'Tabela' },
      { id: 'timeline', nome: 'Timeline' },
      { id: 'carga', nome: 'Carga' },
      { id: 'agrupada', nome: 'Swimlanes' },
      { id: 'metricas', nome: 'Métricas' },
    ];
    for (const v of vistas) {
      if (!termo || v.nome.toLowerCase().includes(termo)) {
        lista.push({
          tipo: 'vista', chave: 'v-' + v.id,
          icone: ICONE_VISTA[v.id] || KanbanSquare,
          titulo: 'Ver: ' + v.nome, sub: 'quadro atual',
          acao: () => { aoTrocarVista(v.id); onFechar(); },
        });
      }
    }

    // Cards do quadro atual
    if (termo && quadro?.cards) {
      for (const c of quadro.cards) {
        if (c.titulo.toLowerCase().includes(termo)) {
          lista.push({
            tipo: 'card', chave: 'c-' + c.id, icone: CreditCard,
            titulo: c.titulo, sub: 'card neste quadro',
            acao: () => { aoAbrirCard(c.id); onFechar(); },
          });
        }
        if (lista.length > 40) break;
      }
    }

    // Outros quadros
    for (const q of (quadros || [])) {
      if (q.id === quadro?.id) continue;
      if (!termo || q.nome.toLowerCase().includes(termo)) {
        lista.push({
          tipo: 'quadro', chave: 'q-' + q.id, icone: KanbanSquare,
          titulo: q.nome, sub: q.equipe_nome || 'outro quadro',
          acao: () => { navigate('/tarefas/' + q.id); onFechar(); },
        });
      }
      if (lista.length > 60) break;
    }

    return lista.slice(0, 40);
  }, [busca, quadro, quadros, aoAbrirCard, aoTrocarVista, navigate, onFechar]);

  useEffect(() => { setIdx(0); }, [busca]);

  function aoTeclar(e) {
    if (e.key === 'ArrowDown') { e.preventDefault(); setIdx((i) => Math.min(i + 1, itens.length - 1)); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setIdx((i) => Math.max(i - 1, 0)); }
    else if (e.key === 'Enter') { e.preventDefault(); itens[idx]?.acao(); }
    else if (e.key === 'Escape') { e.preventDefault(); onFechar(); }
  }

  if (!aberto) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center bg-slate-900/40 p-4 pt-[12vh]"
      onClick={onFechar}
    >
      <div
        className="w-full max-w-lg overflow-hidden rounded-xl border border-slate-200 bg-white shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center gap-2 border-b border-slate-200 px-3 py-2.5">
          <Search size={16} className="text-slate-400" />
          <input
            ref={inputRef}
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
            onKeyDown={aoTeclar}
            placeholder="Buscar card, quadro ou vista…"
            className="flex-1 text-sm text-slate-800 outline-none placeholder:text-slate-400"
          />
          <kbd className="rounded border border-slate-200 bg-slate-50 px-1.5 py-0.5 text-[10px] text-slate-400">Esc</kbd>
        </div>

        <ul className="max-h-80 overflow-y-auto py-1">
          {itens.length === 0 && (
            <li className="px-4 py-6 text-center text-xs text-slate-400">
              {busca ? 'Nada encontrado.' : 'Digite para buscar.'}
            </li>
          )}
          {itens.map((it, i) => {
            const Icone = it.icone;
            return (
              <li key={it.chave}>
                <button
                  type="button"
                  onClick={it.acao}
                  onMouseEnter={() => setIdx(i)}
                  className={[
                    'flex w-full items-center gap-2.5 px-3 py-2 text-left',
                    i === idx ? 'bg-nexus-50' : 'hover:bg-slate-50',
                  ].join(' ')}
                >
                  <Icone size={15} className={i === idx ? 'text-nexus-700' : 'text-slate-400'} />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm text-slate-800">{it.titulo}</span>
                    <span className="block truncate text-[11px] text-slate-400">{it.sub}</span>
                  </span>
                  {i === idx && <CornerDownLeft size={13} className="text-slate-300" />}
                </button>
              </li>
            );
          })}
        </ul>
      </div>
    </div>
  );
}
