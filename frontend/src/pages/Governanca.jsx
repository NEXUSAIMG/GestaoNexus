import { Outlet, NavLink } from 'react-router-dom';
import { ScrollText, Vote, FileText, Calendar } from 'lucide-react';

/**
 * Hub da Governança — Sprint 6.
 *
 * Ao acessar /governanca, mostramos uma navegação por abas (Atas,
 * Decisões, Contrato Social, Calendário) e renderizamos a sub-rota
 * via <Outlet />.
 */

const abas = [
  { to: '/governanca/atas',       rotulo: 'Atas',            icone: ScrollText },
  { to: '/governanca/decisoes',   rotulo: 'Decisões',        icone: Vote },
  { to: '/governanca/contrato',   rotulo: 'Contrato Social', icone: FileText },
  { to: '/governanca/calendario', rotulo: 'Calendário',      icone: Calendar },
];

export default function Governanca() {
  return (
    <div className="max-w-6xl">
      <header className="mb-6 no-print">
        <h1 className="text-2xl font-semibold text-slate-900">Governança</h1>
        <p className="mt-1 text-slate-600">
          Atas das reuniões, decisões formais, contrato social vigente e calendário
          societário — tudo em um lugar só.
        </p>
      </header>

      {/* Abas */}
      <div className="mb-6 flex flex-wrap gap-1 border-b border-slate-200 no-print">
        {abas.map(({ to, rotulo, icone: Icone }) => (
          <NavLink
            key={to}
            to={to}
            className={({ isActive }) =>
              [
                'inline-flex items-center gap-2 border-b-2 px-3 py-2 text-sm font-medium transition-colors -mb-px',
                isActive
                  ? 'border-nexus-700 text-nexus-700'
                  : 'border-transparent text-slate-600 hover:text-slate-900 hover:border-slate-300',
              ].join(' ')
            }
          >
            <Icone size={14} /> {rotulo}
          </NavLink>
        ))}
      </div>

      <Outlet />
    </div>
  );
}
