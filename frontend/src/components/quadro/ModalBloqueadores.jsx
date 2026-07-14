import { Ban, ArrowRight } from 'lucide-react';
import ModalFrame from './ModalFrame.jsx';

/**
 * Sprint 34 — diálogo do 409 no /cards/:id/mover.
 *
 * O backend recusa mover um card que tem bloqueador em aberto e devolve a
 * lista. Aqui a gente mostra QUEM trava e deixa a pessoa decidir: voltar e
 * resolver, ou mover mesmo assim (reenvia com forcar=true).
 *
 * Nunca "silenciamos" o bloqueio nem simplesmente proibimos: o board avisa,
 * a pessoa decide. Kanban orienta, não impede.
 */
export default function ModalBloqueadores({ dados, onCancelar, onForcar }) {
  const bloqueadores = dados?.bloqueadores || [];

  return (
    <ModalFrame titulo="Este card está bloqueado" onFechar={onCancelar}>
      <div className="space-y-4">
        <div className="flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
          <Ban size={16} className="mt-0.5 shrink-0" />
          <p>
            {bloqueadores.length === 1
              ? 'Um card em aberto precisa ser concluído antes deste andar.'
              : bloqueadores.length + ' cards em aberto precisam ser concluídos antes deste andar.'}
          </p>
        </div>

        <ul className="space-y-1">
          {bloqueadores.map((b) => (
            <li
              key={b.id}
              className="flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2"
            >
              <Ban size={13} className="shrink-0 text-red-500" />
              <span className="flex-1 truncate text-sm text-slate-800">{b.titulo}</span>
              <span className="shrink-0 rounded bg-slate-100 px-1.5 py-0.5 text-[10px] font-medium text-slate-500">
                {b.coluna_nome}
              </span>
            </li>
          ))}
        </ul>

        <p className="text-xs text-slate-500">
          Um bloqueador só é considerado resolvido quando entra numa coluna do
          tipo <strong>Concluída</strong>.
        </p>

        <div className="flex items-center justify-between gap-2 border-t border-slate-200 pt-4">
          <button
            type="button"
            onClick={onCancelar}
            className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
          >
            Deixar onde está
          </button>
          <button
            type="button"
            onClick={onForcar}
            className="inline-flex items-center gap-1 rounded-lg bg-amber-600 px-4 py-2 text-sm font-medium text-white hover:bg-amber-700"
          >
            Mover mesmo assim <ArrowRight size={13} />
          </button>
        </div>
      </div>
    </ModalFrame>
  );
}
