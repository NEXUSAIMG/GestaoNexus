import { Construction } from 'lucide-react';

/**
 * Placeholder reutilizável para as áreas que ainda vão ser construídas
 * nas próximas sprints. Deixa claro o que vem e quando.
 */
export default function EmConstrucao({ titulo, sprint, descricao, itens = [] }) {
  return (
    <div className="max-w-3xl">
      <div className="mb-6">
        <h1 className="text-2xl font-semibold text-slate-900">{titulo}</h1>
        <p className="mt-1 text-slate-600">{descricao}</p>
      </div>

      <div className="rounded-xl border border-amber-200 bg-amber-50 p-6">
        <div className="flex items-start gap-4">
          <div className="rounded-lg bg-amber-100 p-2 text-amber-700">
            <Construction size={20} />
          </div>
          <div className="flex-1">
            <div className="flex items-center gap-2">
              <span className="text-sm font-semibold text-amber-900">
                Área em construção
              </span>
              {sprint && (
                <span className="rounded-full bg-amber-200 px-2 py-0.5 text-[11px] font-medium uppercase tracking-wide text-amber-900">
                  {sprint}
                </span>
              )}
            </div>
            <p className="mt-1 text-sm text-amber-800">
              Esta funcionalidade faz parte do roadmap e será entregue numa sprint futura.
            </p>

            {itens.length > 0 && (
              <div className="mt-4">
                <div className="text-xs font-semibold uppercase tracking-wide text-amber-900">
                  O que vai ter aqui
                </div>
                <ul className="mt-2 space-y-1 text-sm text-amber-900">
                  {itens.map((item) => (
                    <li key={item} className="flex gap-2">
                      <span className="mt-1 h-1.5 w-1.5 shrink-0 rounded-full bg-amber-500" />
                      <span>{item}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
