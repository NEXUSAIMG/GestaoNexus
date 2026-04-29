import { Link } from 'react-router-dom';
import {
  Wallet, Receipt, Tag, CalendarDays, PieChart, FileText, Users, UserCog, Link2, Landmark,
  ArrowRight, UserCircle2, Briefcase, Shield,
} from 'lucide-react';
import { useAuth } from '../context/AuthContext.jsx';

const areas = [
  {
    to: '/caixa',
    rotulo: 'Caixa',
    descricao: 'Saldo, entradas, saídas e fluxo projetado dia a dia.',
    icone: Wallet,
    sprint: 'Sprint 3',
    pronto: true,
  },
  {
    to: '/contas-pagar',
    rotulo: 'Contas a pagar',
    descricao: 'Cadastro, pagamento e cancelamento de contas.',
    icone: Receipt,
    sprint: 'Sprint 3',
    pronto: true,
  },
  {
    to: '/mensal',
    rotulo: 'Mês a mês',
    descricao: 'Resumo do mês, comparativo e PDF para reuniões.',
    icone: CalendarDays,
    sprint: 'Sprint 4',
    pronto: true,
  },
  {
    to: '/lucros',
    rotulo: 'Sócios & Lucros',
    descricao: 'Pró-labore, distribuições e aportes por sócio.',
    icone: PieChart,
    sprint: 'Sprint 5',
    pronto: true,
  },
  {
    to: '/governanca',
    rotulo: 'Governança',
    descricao: 'Atas, contrato social, decisões e calendário.',
    icone: FileText,
    sprint: 'Sprint 6',
    pronto: true,
  },
  {
    to: '/socios',
    rotulo: 'Sócios',
    descricao: 'Quem são os sócios, participação e contatos.',
    icone: Users,
    sprint: 'Sprint 1',
    pronto: true,
  },
  {
    to: '/contas-bancarias',
    rotulo: 'Contas bancárias',
    descricao: 'Cadastro de contas e registro manual de saldo.',
    icone: Landmark,
    sprint: 'Sprint 2',
    pronto: true,
  },
  {
    to: '/categorias-despesa',
    rotulo: 'Categorias de despesa',
    descricao: 'Como as despesas são organizadas (folha, aluguel, impostos…).',
    icone: Tag,
    sprint: 'Sprint 3',
    pronto: true,
  },
  {
    to: '/pessoas',
    rotulo: 'Pessoas de acesso',
    descricao: 'Quem pode entrar na ferramenta.',
    icone: UserCog,
    sprint: 'Sprint 1.5',
    pronto: true,
    adminOnly: true,
  },
  {
    to: '/representacoes',
    rotulo: 'Representações',
    descricao: 'Quem representa quem, com quais poderes.',
    icone: Link2,
    sprint: 'Sprint 1.5',
    pronto: true,
    adminOnly: true,
  },
];

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

export default function Dashboard() {
  const { pessoa, representacaoAtual, representacoes } = useAuth();
  const primeiroNome = pessoa?.nome?.split(' ')[0] ?? 'pessoa';
  const admin = !!pessoa?.administrador;

  const areasVisiveis = areas.filter((a) => !a.adminOnly || admin);

  return (
    <div className="max-w-5xl">
      <header className="mb-8">
        <div className="text-xs uppercase tracking-widest text-nexus-700">Painel</div>
        <h1 className="mt-1 text-2xl font-semibold text-slate-900">
          Olá, {primeiroNome}.
        </h1>
        <p className="mt-1 text-slate-600">
          Novidade: a <strong>Visão geral</strong> agrega tarefas, agenda, financeiro
          e governança num painel único, com gráficos. Acessa pelo menu lateral.
        </p>
        <Link
          to="/visao-geral"
          className="mt-3 inline-flex items-center gap-2 rounded-lg bg-nexus-700 px-3 py-1.5 text-sm font-medium text-white hover:bg-nexus-800"
        >
          Abrir visão geral <ArrowRight size={14} />
        </Link>
      </header>

      {/* Caixa de contexto atual */}
      {representacaoAtual ? (
        <div className="mb-8 rounded-xl border border-nexus-100 bg-nexus-50 p-4">
          <div className="flex items-start gap-3">
            {(() => {
              const Icone = iconePorPapel[representacaoAtual.papel] ?? UserCircle2;
              return <Icone size={18} className="mt-0.5 text-nexus-700" />;
            })()}
            <div className="flex-1 min-w-0">
              <div className="text-[10px] font-semibold uppercase tracking-wide text-nexus-700">
                Contexto atual
              </div>
              <div className="mt-0.5 font-semibold text-slate-900">
                {representacaoAtual.socio_nome}
              </div>
              <div className="text-xs text-slate-600">
                {rotuloPorPapel[representacaoAtual.papel]}
                {representacaoAtual.socio_percentual
                  ? ` · Participação ${formatarPercentual(representacaoAtual.socio_percentual)}`
                  : ''}
              </div>
            </div>
            {representacoes.length > 1 && (
              <div className="text-xs text-slate-500">
                Troque pelo menu lateral.
              </div>
            )}
          </div>
        </div>
      ) : admin ? (
        <div className="mb-8 rounded-xl border border-slate-200 bg-white p-4">
          <div className="flex items-center gap-3">
            <Shield size={18} className="text-slate-500" />
            <div className="text-sm text-slate-700">
              Você está em <span className="font-semibold">modo administração</span>.
              Para ver dados como sócio, escolha um contexto no menu lateral.
            </div>
          </div>
        </div>
      ) : null}

      <section className="grid gap-4 md:grid-cols-2">
        {areasVisiveis.map(({ to, rotulo, descricao, icone: Icone, sprint, pronto }) => (
          <Link
            key={to}
            to={to}
            className="group rounded-xl border border-slate-200 bg-white p-5 shadow-sm transition-colors hover:border-nexus-300 hover:shadow"
          >
            <div className="flex items-start gap-4">
              <div
                className={[
                  'rounded-lg p-2.5',
                  pronto
                    ? 'bg-nexus-100 text-nexus-700'
                    : 'bg-slate-100 text-slate-500',
                ].join(' ')}
              >
                <Icone size={20} />
              </div>

              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <div className="font-semibold text-slate-900">{rotulo}</div>
                  <span
                    className={[
                      'rounded-full px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide',
                      pronto
                        ? 'bg-emerald-100 text-emerald-700'
                        : 'bg-slate-100 text-slate-500',
                    ].join(' ')}
                  >
                    {pronto ? 'disponível' : sprint}
                  </span>
                </div>
                <p className="mt-1 text-sm text-slate-600">{descricao}</p>
              </div>

              <ArrowRight
                size={18}
                className="shrink-0 text-slate-300 transition-colors group-hover:text-nexus-700"
              />
            </div>
          </Link>
        ))}
      </section>

      <section className="mt-10 rounded-xl border border-slate-200 bg-white p-6">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500">
          Próximos passos
        </h2>
        <ol className="mt-3 space-y-2 text-sm text-slate-700">
          <li>
            <span className="font-medium">Próximas iterações:</span> PDFs gerados no
            servidor (pra anexar em e-mails), polimento mobile profundo, drag & drop
            no calendário.
          </li>
        </ol>
      </section>
    </div>
  );
}
