import { NavLink } from 'react-router-dom';
import {
  LayoutDashboard,
  Eye,
  Wallet,
  Receipt,
  CalendarDays,
  PieChart,
  Presentation,
  FileText,
  KanbanSquare,
  Workflow,
  Activity,
  Package,
  Boxes,
  Building2,
  Users,
  Users2,
  UserCog,
  Link2,
  Landmark,
  Tag,
  Settings,
} from 'lucide-react';
import { useAuth } from '../context/AuthContext.jsx';

// Sprint 31 — itens marcados com `liberadoRestrito: true` aparecem mesmo
// para pessoas com acesso restrito. Os demais ficam invisíveis nesse caso.
const itensBase = [
  { to: '/visao-geral',   rotulo: 'Visão geral',     icone: Eye },
  { to: '/',              rotulo: 'Painel',          icone: LayoutDashboard },
  { to: '/caixa',         rotulo: 'Caixa',           icone: Wallet },
  { to: '/contas-pagar',  rotulo: 'Contas a pagar',  icone: Receipt },
  { to: '/mensal',        rotulo: 'Mês a mês',       icone: CalendarDays },
  { to: '/apresentacao',  rotulo: 'Apresentação',     icone: Presentation },
  { to: '/lucros',        rotulo: 'Sócios & Lucros', icone: PieChart },
  { to: '/governanca',    rotulo: 'Governança',      icone: FileText },
  { to: '/tarefas',       rotulo: 'Tarefas',         icone: KanbanSquare, liberadoRestrito: true },
  { to: '/processos',     rotulo: 'Processos',       icone: Workflow,     liberadoRestrito: true },
  { to: '/instancias',    rotulo: 'Em andamento',    icone: Activity,     liberadoRestrito: true },
  { to: '/cartorios',     rotulo: 'Cartórios',       icone: Building2,    liberadoRestrito: true },
  { to: '/portfolio',     rotulo: 'Portfólio',        icone: Package },
  { to: '/inventario',    rotulo: 'Inventário',       icone: Boxes },
];

const itensCadastro = [
  { to: '/socios',              rotulo: 'Sócios',              icone: Users },
  { to: '/contas-bancarias',    rotulo: 'Contas bancárias',    icone: Landmark },
  { to: '/categorias-despesa',  rotulo: 'Categorias de despesa', icone: Tag },
  { to: '/equipes',             rotulo: 'Equipes',             icone: Users2, adminOnly: true },
  { to: '/pessoas',             rotulo: 'Pessoas de acesso',   icone: UserCog, adminOnly: true },
  { to: '/representacoes',      rotulo: 'Representações',      icone: Link2,   adminOnly: true },
  { to: '/configuracoes',       rotulo: 'Notificações',         icone: Settings, adminOnly: true },
];

export default function Sidebar({ aoClicar }) {
  const { pessoa } = useAuth();
  const admin = !!pessoa?.administrador;
  // Sprint 31 — acesso restrito: só vê itens com liberadoRestrito.
  // Admin sempre vê tudo (a flag não se aplica a admin).
  const restrito = !!pessoa?.acesso_restrito && !admin;

  const baseVisivel = restrito
    ? itensBase.filter((i) => i.liberadoRestrito)
    : itensBase;

  // Cadastros não aparecem pra acesso restrito — todos os itens são
  // administrativos ou financeiros.
  const cadastrosVisiveis = restrito
    ? []
    : itensCadastro.filter((i) => !i.adminOnly || admin);

  return (
    <nav className="flex flex-col gap-1 p-3">
      {baseVisivel.map((item) => (
        <ItemMenu key={item.to} {...item} aoClicar={aoClicar} />
      ))}

      {cadastrosVisiveis.length > 0 && (
        <>
          <div className="mt-4 mb-1 px-3 text-[10px] font-semibold uppercase tracking-wider text-nexus-300">
            Cadastros
          </div>
          {cadastrosVisiveis.map((item) => (
            <ItemMenu key={item.to} {...item} aoClicar={aoClicar} />
          ))}
        </>
      )}
    </nav>
  );
}

function ItemMenu({ to, rotulo, icone: Icone, marcador, aoClicar }) {
  return (
    <NavLink
      to={to}
      end={to === '/'}
      onClick={aoClicar}
      className={({ isActive }) =>
        [
          'group flex items-center gap-3 rounded-lg px-3 py-2 text-sm transition-colors',
          isActive
            ? 'bg-nexus-700 text-white shadow-sm'
            : 'text-slate-200 hover:bg-nexus-800/60 hover:text-white',
        ].join(' ')
      }
    >
      <Icone size={18} className="shrink-0" />
      <span className="flex-1">{rotulo}</span>
      {marcador && (
        <span className="text-[10px] font-medium uppercase tracking-wide text-nexus-200/80 group-hover:text-white/80">
          {marcador}
        </span>
      )}
    </NavLink>
  );
}
