import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  LayoutDashboard, KanbanSquare, Calendar, Wallet, Receipt, PieChart,
  FileText, Activity, AlertCircle, ArrowRight, Clock, Users2,
  TrendingUp, TrendingDown, CheckCircle2, RefreshCw,
} from 'lucide-react';
import { api, mensagemDeErro } from '../api/client.js';

/**
 * Visão Geral — Sprint 12.
 *
 * Dashboard agregado com tudo que está acontecendo na empresa:
 * tarefas, agenda (governança + quadros), financeiro, lucros,
 * governança em aberto e atividade recente.
 *
 * Visibilidade respeita a regra dos quadros (membro/aberto a sócios).
 * Toda a agregação acontece num único endpoint /api/dashboard pra
 * evitar 10 requests da página.
 *
 * Gráficos são feitos em SVG puro (alinhado com GraficoFluxo e
 * GraficoMensal das sprints anteriores) — sem dependência extra.
 */

const COR_EQUIPE = {
  slate:    '#64748b', red:     '#ef4444', orange:  '#f97316',
  amber:    '#f59e0b', yellow:  '#eab308', lime:    '#84cc16',
  emerald:  '#10b981', teal:    '#14b8a6', cyan:    '#06b6d4',
  blue:     '#3b82f6', indigo:  '#6366f1', violet:  '#8b5cf6',
  fuchsia:  '#d946ef', pink:    '#ec4899', rose:    '#f43f5e',
};

const TIPO_EVENTO_COR = {
  reuniao: 'bg-sky-100 text-sky-800',
  vencimento_legal: 'bg-red-100 text-red-800',
  pagamento_importante: 'bg-amber-100 text-amber-800',
  deadline: 'bg-red-100 text-red-800',
  marco: 'bg-violet-100 text-violet-800',
  outro: 'bg-slate-100 text-slate-700',
};

function formatarBRL(v) {
  return new Intl.NumberFormat('pt-BR', {
    style: 'currency', currency: 'BRL',
  }).format(Number(v) || 0);
}

function formatarData(iso) {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString('pt-BR');
}

function formatarDiaCurto(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  return d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' });
}

function diasAteHoje(iso) {
  if (!iso) return null;
  const d = new Date(`${String(iso).slice(0, 10)}T12:00:00`);
  const h = new Date(); h.setHours(0, 0, 0, 0);
  return Math.round((d - h) / 86400000);
}

function rotuloPrazo(iso) {
  const d = diasAteHoje(iso);
  if (d === null) return null;
  if (d < 0) return { texto: `${Math.abs(d)}d atrás`, cor: 'text-red-700 bg-red-50 border-red-200' };
  if (d === 0) return { texto: 'Hoje', cor: 'text-amber-800 bg-amber-50 border-amber-200' };
  if (d === 1) return { texto: 'Amanhã', cor: 'text-amber-800 bg-amber-50 border-amber-200' };
  if (d <= 7) return { texto: `em ${d}d`, cor: 'text-slate-700 bg-slate-50 border-slate-200' };
  return { texto: formatarDiaCurto(iso), cor: 'text-slate-700 bg-slate-50 border-slate-200' };
}

export default function VisaoGeral() {
  const [dados, setDados] = useState(null);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState('');

  async function carregar() {
    setCarregando(true);
    setErro('');
    try {
      const r = await api.get('/dashboard');
      setDados(r.data);
    } catch (err) {
      setErro(mensagemDeErro(err, 'Não consegui carregar o painel.'));
    } finally {
      setCarregando(false);
    }
  }

  useEffect(() => { carregar(); }, []);

  if (carregando && !dados) {
    return (
      <div className="rounded-xl border border-slate-200 bg-white p-10 text-center text-sm text-slate-500">
        Carregando painel...
      </div>
    );
  }
  if (erro) {
    return (
      <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">{erro}</div>
    );
  }
  if (!dados) return null;

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <div className="text-xs uppercase tracking-widest text-nexus-700">Painel</div>
          <h1 className="mt-1 text-2xl font-semibold text-slate-900">Visão geral</h1>
          <p className="mt-1 text-sm text-slate-600">
            Tudo o que está acontecendo na empresa, num lugar só.
          </p>
        </div>
        <button
          type="button"
          onClick={carregar}
          disabled={carregando}
          className="inline-flex items-center gap-2 rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50"
        >
          <RefreshCw size={12} className={carregando ? 'animate-spin' : ''} />
          Atualizar
        </button>
      </header>

      {/* Linha 1 — KPIs principais */}
      <section className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <KPI
          icone={<Wallet size={16} />}
          rotulo="Saldo em conta"
          valor={formatarBRL(dados.financeiro.saldo_total)}
          sub={`${dados.financeiro.contas.length} conta${dados.financeiro.contas.length === 1 ? '' : 's'} ativa${dados.financeiro.contas.length === 1 ? '' : 's'}`}
          cor="emerald"
        />
        <KPI
          icone={<Receipt size={16} />}
          rotulo="Contas a pagar"
          valor={formatarBRL(dados.financeiro.contas_a_pagar.total_pendentes)}
          sub={`${dados.financeiro.contas_a_pagar.atrasadas} atrasada${dados.financeiro.contas_a_pagar.atrasadas === 1 ? '' : 's'}`}
          cor={dados.financeiro.contas_a_pagar.atrasadas > 0 ? 'red' : 'amber'}
        />
        <KPI
          icone={<KanbanSquare size={16} />}
          rotulo="Tarefas atrasadas"
          valor={dados.tarefas.resumo.atrasados}
          sub={`de ${dados.tarefas.resumo.total} no total`}
          cor={dados.tarefas.resumo.atrasados > 0 ? 'red' : 'slate'}
        />
        <KPI
          icone={<PieChart size={16} />}
          rotulo="Distribuído no ano"
          valor={formatarBRL(dados.socios.distribuicoes_ano.distribuido)}
          sub={`${dados.socios.distribuicoes_ano.qtd_efetivadas} distribuiç${dados.socios.distribuicoes_ano.qtd_efetivadas === 1 ? 'ão' : 'ões'}`}
          cor="nexus"
        />
      </section>

      {/* Linha 2 — Fluxo de caixa (gráfico grande) + Pendências */}
      <section className="grid gap-3 lg:grid-cols-3">
        <div className="lg:col-span-2 rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
          <Cabecalho titulo="Fluxo de caixa — últimos 6 meses" link="/mensal" />
          <GraficoFluxoCaixa dados={dados.financeiro.fluxo_serie} />
        </div>

        <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
          <Cabecalho titulo="Pendências" />
          <ul className="space-y-2 text-sm">
            {dados.financeiro.contas_a_pagar.atrasadas > 0 && (
              <ItemPendencia
                cor="red"
                label={`${dados.financeiro.contas_a_pagar.atrasadas} conta${dados.financeiro.contas_a_pagar.atrasadas === 1 ? '' : 's'} atrasada${dados.financeiro.contas_a_pagar.atrasadas === 1 ? '' : 's'}`}
                valor={formatarBRL(dados.financeiro.contas_a_pagar.total_atrasadas)}
                link="/contas-pagar"
              />
            )}
            {dados.financeiro.contas_a_pagar.vencendo_7 > 0 && (
              <ItemPendencia
                cor="amber"
                label={`${dados.financeiro.contas_a_pagar.vencendo_7} venc. próx. 7d`}
                valor={formatarBRL(dados.financeiro.contas_a_pagar.total_vencendo_7)}
                link="/contas-pagar"
              />
            )}
            {dados.governanca.docs_aprovacao > 0 && (
              <ItemPendencia
                cor="violet"
                label={`${dados.governanca.docs_aprovacao} documento${dados.governanca.docs_aprovacao === 1 ? '' : 's'} aguardando voto`}
                link="/governanca/atas"
              />
            )}
            {dados.governanca.decisoes_aprovacao > 0 && (
              <ItemPendencia
                cor="violet"
                label={`${dados.governanca.decisoes_aprovacao} decis${dados.governanca.decisoes_aprovacao === 1 ? 'ão' : 'ões'} aguardando voto`}
                link="/governanca/decisoes"
              />
            )}
            {dados.tarefas.resumo.hoje > 0 && (
              <ItemPendencia
                cor="amber"
                label={`${dados.tarefas.resumo.hoje} tarefa${dados.tarefas.resumo.hoje === 1 ? '' : 's'} com prazo hoje`}
                link="/tarefas"
              />
            )}
            {dados.financeiro.contas_a_pagar.atrasadas === 0
              && dados.financeiro.contas_a_pagar.vencendo_7 === 0
              && dados.governanca.docs_aprovacao === 0
              && dados.governanca.decisoes_aprovacao === 0
              && dados.tarefas.resumo.hoje === 0
              && (
                <li className="rounded-lg bg-emerald-50 border border-emerald-200 px-3 py-2 text-xs text-emerald-800 inline-flex items-center gap-2">
                  <CheckCircle2 size={14} /> Sem pendências urgentes.
                </li>
              )}
          </ul>
        </div>
      </section>

      {/* Linha 3 — Minhas tarefas + Agenda (próximos 14 dias) */}
      <section className="grid gap-3 lg:grid-cols-2">
        <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
          <Cabecalho
            titulo={`Minhas tarefas (${dados.tarefas.meus.length})`}
            link="/tarefas"
            icone={<KanbanSquare size={14} />}
          />
          {dados.tarefas.meus.length === 0 ? (
            <p className="text-sm text-slate-500">Você não tem tarefas atribuídas no momento.</p>
          ) : (
            <ul className="space-y-1.5 max-h-80 overflow-y-auto">
              {dados.tarefas.meus.map((c) => {
                const prazo = rotuloPrazo(c.data_prazo);
                return (
                  <li key={c.id}>
                    <Link
                      to={`/tarefas/${c.quadro_id}?card=${c.id}`}
                      className="flex items-start justify-between gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 hover:border-nexus-300 hover:bg-slate-50"
                    >
                      <div className="flex-1 min-w-0">
                        <div className="text-sm font-medium text-slate-900 truncate">{c.titulo}</div>
                        <div className="mt-0.5 flex items-center gap-1.5 text-[11px] text-slate-500">
                          <span
                            className="inline-block h-1.5 w-1.5 rounded-full"
                            style={{ backgroundColor: COR_EQUIPE[c.equipe_cor] || '#64748b' }}
                          />
                          {c.equipe_nome} · {c.quadro_nome}
                        </div>
                      </div>
                      {prazo && (
                        <span className={`shrink-0 inline-flex items-center gap-1 rounded border px-1.5 py-0.5 text-[10px] font-medium ${prazo.cor}`}>
                          <Calendar size={9} /> {prazo.texto}
                        </span>
                      )}
                    </Link>
                  </li>
                );
              })}
            </ul>
          )}
        </div>

        <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
          <Cabecalho
            titulo="Agenda — próximos 14 dias"
            icone={<Calendar size={14} />}
          />
          <Agenda dadosAgenda={dados.agenda} />
        </div>
      </section>

      {/* Linha 4 — Tarefas por equipe + Distribuição por sócio */}
      <section className="grid gap-3 lg:grid-cols-2">
        <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
          <Cabecalho titulo="Tarefas por equipe" icone={<Users2 size={14} />} />
          {dados.tarefas.por_equipe.length === 0 ? (
            <p className="text-sm text-slate-500">Nenhuma equipe com tarefas visíveis.</p>
          ) : (
            <GraficoTarefasPorEquipe equipes={dados.tarefas.por_equipe} />
          )}
        </div>

        <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
          <Cabecalho titulo="Distribuição de lucros — ano" link="/lucros" icone={<PieChart size={14} />} />
          {dados.socios.por_socio.length === 0 ? (
            <p className="text-sm text-slate-500">Nenhuma distribuição efetivada neste ano.</p>
          ) : (
            <GraficoDistribuicaoSocios socios={dados.socios.por_socio} total={dados.socios.distribuicoes_ano.distribuido} />
          )}
        </div>
      </section>

      {/* Linha 5 — Saldos detalhados + Atividade recente */}
      <section className="grid gap-3 lg:grid-cols-2">
        <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
          <Cabecalho titulo="Saldos por conta" link="/contas-bancarias" icone={<Wallet size={14} />} />
          {dados.financeiro.contas.length === 0 ? (
            <p className="text-sm text-slate-500">Nenhuma conta bancária cadastrada.</p>
          ) : (
            <ul className="space-y-1.5">
              {dados.financeiro.contas.map((c) => (
                <li key={c.id} className="flex items-center justify-between rounded-lg border border-slate-200 bg-slate-50/50 px-3 py-2 text-sm">
                  <div className="min-w-0">
                    <div className="font-medium text-slate-900 truncate">{c.nome}</div>
                    {c.banco && <div className="text-xs text-slate-500 truncate">{c.banco}</div>}
                  </div>
                  <div className={`shrink-0 font-semibold tabular-nums ${Number(c.saldo) < 0 ? 'text-red-700' : 'text-slate-900'}`}>
                    {formatarBRL(c.saldo)}
                  </div>
                </li>
              ))}
              <li className="flex items-center justify-between border-t border-slate-200 pt-2 mt-2 px-3 text-sm">
                <strong className="text-slate-900">Total</strong>
                <strong className="tabular-nums text-slate-900">{formatarBRL(dados.financeiro.saldo_total)}</strong>
              </li>
            </ul>
          )}
        </div>

        <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
          <Cabecalho titulo="Atividade recente" icone={<Activity size={14} />} />
          {dados.atividade.length === 0 ? (
            <p className="text-sm text-slate-500">Sem atividade registrada.</p>
          ) : (
            <ul className="space-y-1.5 text-xs max-h-80 overflow-y-auto">
              {dados.atividade.map((a, i) => (
                <li key={i} className="flex items-start gap-2 rounded-lg px-2 py-1.5 hover:bg-slate-50">
                  <div className="shrink-0 mt-0.5 h-1.5 w-1.5 rounded-full bg-nexus-400" />
                  <div className="flex-1 min-w-0">
                    <div className="text-slate-700">
                      <strong>{a.pessoa_nome || 'Sistema'}</strong>{' '}
                      <span className="text-slate-500">{descreverAcao(a.acao, a.detalhes)}</span>
                    </div>
                    <div className="text-slate-400 text-[10px]">{tempoRelativo(a.criado_em)}</div>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      </section>
    </div>
  );
}

// =============================================================================
// Componentes auxiliares
// =============================================================================

function KPI({ icone, rotulo, valor, sub, cor = 'slate' }) {
  const cores = {
    emerald: 'bg-emerald-50 text-emerald-700 border-emerald-200',
    amber:   'bg-amber-50 text-amber-700 border-amber-200',
    red:     'bg-red-50 text-red-700 border-red-200',
    nexus:   'bg-nexus-50 text-nexus-700 border-nexus-200',
    slate:   'bg-slate-50 text-slate-700 border-slate-200',
  }[cor];
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
      <div className="flex items-center justify-between">
        <span className={`inline-flex items-center justify-center h-8 w-8 rounded-lg border ${cores}`}>
          {icone}
        </span>
      </div>
      <div className="mt-3 text-xs font-medium uppercase tracking-wide text-slate-500">{rotulo}</div>
      <div className="mt-1 text-xl font-semibold tabular-nums text-slate-900">{valor}</div>
      {sub && <div className="mt-0.5 text-xs text-slate-500">{sub}</div>}
    </div>
  );
}

function Cabecalho({ titulo, link, icone }) {
  return (
    <div className="mb-3 flex items-center justify-between">
      <h3 className="inline-flex items-center gap-2 text-sm font-semibold uppercase tracking-wide text-slate-600">
        {icone}
        {titulo}
      </h3>
      {link && (
        <Link to={link} className="inline-flex items-center gap-1 text-xs text-nexus-700 hover:text-nexus-800">
          ver mais <ArrowRight size={11} />
        </Link>
      )}
    </div>
  );
}

function ItemPendencia({ cor, label, valor, link }) {
  const cores = {
    red: 'border-red-200 bg-red-50 text-red-800',
    amber: 'border-amber-200 bg-amber-50 text-amber-800',
    violet: 'border-violet-200 bg-violet-50 text-violet-800',
  }[cor] || 'border-slate-200 bg-slate-50 text-slate-700';

  const conteudo = (
    <div className={`flex items-center justify-between rounded-lg border px-3 py-2 ${cores}`}>
      <span className="inline-flex items-center gap-2">
        <AlertCircle size={12} />
        <span>{label}</span>
      </span>
      {valor && <span className="text-xs font-semibold tabular-nums">{valor}</span>}
    </div>
  );

  return <li>{link ? <Link to={link} className="block hover:opacity-80">{conteudo}</Link> : conteudo}</li>;
}

// =============================================================================
// Gráfico SVG: fluxo de caixa (entradas vs saídas, 6 meses)
// =============================================================================

function GraficoFluxoCaixa({ dados }) {
  if (!dados || dados.length === 0) {
    return <p className="text-sm text-slate-500 py-6 text-center">Sem dados.</p>;
  }
  const W = 600, H = 220, M = { top: 20, right: 20, bottom: 30, left: 60 };
  const innerW = W - M.left - M.right;
  const innerH = H - M.top - M.bottom;

  const max = Math.max(
    ...dados.map((d) => Math.max(d.entradas, d.saidas)),
    1,
  );
  const barW = innerW / dados.length / 3;

  function y(v) { return innerH - (v / max) * innerH; }
  function x(i) { return (i + 0.5) * (innerW / dados.length); }

  // Ticks (3-4 níveis horizontais)
  const ticks = [0, max / 3, (2 * max) / 3, max];

  return (
    <div className="overflow-x-auto">
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-auto" preserveAspectRatio="xMidYMid meet">
        <g transform={`translate(${M.left},${M.top})`}>
          {/* Grid horizontal */}
          {ticks.map((t, i) => (
            <g key={i}>
              <line x1={0} y1={y(t)} x2={innerW} y2={y(t)} stroke="#e2e8f0" strokeDasharray="2,3" />
              <text x={-8} y={y(t)} dy={4} textAnchor="end" fontSize="10" fill="#64748b">
                {formatarBRLCompacto(t)}
              </text>
            </g>
          ))}

          {/* Barras */}
          {dados.map((d, i) => (
            <g key={d.mes}>
              <rect
                x={x(i) - barW - 2}
                y={y(d.entradas)}
                width={barW}
                height={innerH - y(d.entradas)}
                fill="#10b981"
                rx="2"
              />
              <rect
                x={x(i) + 2}
                y={y(d.saidas)}
                width={barW}
                height={innerH - y(d.saidas)}
                fill="#ef4444"
                rx="2"
              />
              <text x={x(i)} y={innerH + 18} textAnchor="middle" fontSize="10" fill="#64748b">
                {nomeMesCurto(d.mes)}
              </text>
            </g>
          ))}
        </g>
      </svg>
      <div className="mt-2 flex flex-wrap items-center justify-center gap-4 text-xs">
        <span className="inline-flex items-center gap-1.5">
          <span className="h-2.5 w-2.5 rounded bg-emerald-500" /> Entradas
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="h-2.5 w-2.5 rounded bg-red-500" /> Saídas
        </span>
      </div>
    </div>
  );
}

// =============================================================================
// Gráfico SVG: tarefas por equipe (barras horizontais)
// =============================================================================

function GraficoTarefasPorEquipe({ equipes }) {
  const max = Math.max(...equipes.map((e) => e.total), 1);
  return (
    <ul className="space-y-2">
      {equipes.map((eq) => {
        const pct = (eq.total / max) * 100;
        const pctAtraso = eq.total > 0 ? (eq.atrasados / eq.total) * 100 : 0;
        return (
          <li key={eq.id}>
            <div className="flex items-center justify-between mb-1">
              <span className="inline-flex items-center gap-2 text-sm text-slate-700">
                <span
                  className="h-2.5 w-2.5 rounded-full"
                  style={{ backgroundColor: COR_EQUIPE[eq.cor] || '#64748b' }}
                />
                {eq.nome}
              </span>
              <span className="text-xs text-slate-500">
                {eq.total} {eq.atrasados > 0 && (
                  <span className="text-red-700">({eq.atrasados} atras.)</span>
                )}
              </span>
            </div>
            <div className="relative h-2 rounded-full bg-slate-100 overflow-hidden">
              <div
                className="absolute inset-y-0 left-0 rounded-full"
                style={{
                  width: `${pct}%`,
                  backgroundColor: COR_EQUIPE[eq.cor] || '#64748b',
                }}
              />
              {eq.atrasados > 0 && (
                <div
                  className="absolute inset-y-0 right-0 rounded-r-full bg-red-500/60"
                  style={{ width: `${(pctAtraso * pct) / 100}%`, left: `${pct - (pctAtraso * pct) / 100}%` }}
                />
              )}
            </div>
          </li>
        );
      })}
    </ul>
  );
}

// =============================================================================
// Gráfico SVG: distribuição por sócio (donut)
// =============================================================================

function GraficoDistribuicaoSocios({ socios, total }) {
  if (!socios || socios.length === 0 || total === 0) {
    return <p className="text-sm text-slate-500 py-6 text-center">Sem dados.</p>;
  }

  const cores = ['#0ea5e9', '#8b5cf6', '#10b981', '#f59e0b', '#ec4899', '#14b8a6', '#f43f5e', '#6366f1'];
  const cx = 90, cy = 90, R = 70, r = 45;

  let acumulado = 0;
  const fatias = socios.map((s, i) => {
    const inicio = acumulado;
    acumulado += s.valor;
    const fim = acumulado;
    const a1 = (inicio / total) * 2 * Math.PI - Math.PI / 2;
    const a2 = (fim / total) * 2 * Math.PI - Math.PI / 2;
    const grande = (fim - inicio) / total > 0.5 ? 1 : 0;

    const xR1 = cx + R * Math.cos(a1);
    const yR1 = cy + R * Math.sin(a1);
    const xR2 = cx + R * Math.cos(a2);
    const yR2 = cy + R * Math.sin(a2);
    const xr1 = cx + r * Math.cos(a1);
    const yr1 = cy + r * Math.sin(a1);
    const xr2 = cx + r * Math.cos(a2);
    const yr2 = cy + r * Math.sin(a2);

    const path = [
      `M ${xR1} ${yR1}`,
      `A ${R} ${R} 0 ${grande} 1 ${xR2} ${yR2}`,
      `L ${xr2} ${yr2}`,
      `A ${r} ${r} 0 ${grande} 0 ${xr1} ${yr1}`,
      'Z',
    ].join(' ');

    return { ...s, path, cor: cores[i % cores.length], pct: (s.valor / total) * 100 };
  });

  return (
    <div className="flex flex-col sm:flex-row items-center gap-4">
      <svg viewBox="0 0 180 180" className="w-40 h-40 shrink-0">
        {fatias.map((f) => (
          <path key={f.id} d={f.path} fill={f.cor} stroke="#fff" strokeWidth={1} />
        ))}
        <text x="90" y="86" textAnchor="middle" fontSize="11" fill="#64748b">total</text>
        <text x="90" y="100" textAnchor="middle" fontSize="11" fontWeight="600" fill="#0f172a">
          {formatarBRLCompacto(total)}
        </text>
      </svg>
      <ul className="flex-1 space-y-1.5 text-xs w-full">
        {fatias.map((f) => (
          <li key={f.id} className="flex items-center justify-between gap-2">
            <span className="inline-flex items-center gap-2 min-w-0">
              <span className="h-2.5 w-2.5 rounded-sm shrink-0" style={{ backgroundColor: f.cor }} />
              <span className="truncate text-slate-700">{f.nome}</span>
            </span>
            <span className="shrink-0 text-slate-600 tabular-nums">
              {formatarBRL(f.valor)} <span className="text-slate-400">({f.pct.toFixed(0)}%)</span>
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

// =============================================================================
// Lista de agenda (próximos 14 dias)
// =============================================================================

function Agenda({ dadosAgenda }) {
  const todos = useMemo(() => {
    const lista = [
      ...dadosAgenda.governanca.map((e) => ({ ...e, fonte: 'governanca' })),
      ...dadosAgenda.quadros.map((e) => ({ ...e, fonte: 'quadro' })),
    ];
    lista.sort((a, b) => new Date(a.data_inicio) - new Date(b.data_inicio));
    return lista.slice(0, 12);
  }, [dadosAgenda]);

  if (todos.length === 0) {
    return <p className="text-sm text-slate-500">Sem eventos nos próximos 14 dias.</p>;
  }

  return (
    <ul className="space-y-1.5 max-h-80 overflow-y-auto">
      {todos.map((e, i) => {
        const cor = TIPO_EVENTO_COR[e.tipo] || TIPO_EVENTO_COR.outro;
        const link = e.fonte === 'quadro' ? `/tarefas/${e.quadro_id}` : '/governanca/calendario';
        return (
          <li key={`${e.fonte}-${e.id}-${i}`}>
            <Link
              to={link}
              className="flex items-center justify-between gap-2 rounded-lg border border-slate-200 px-3 py-2 hover:bg-slate-50"
            >
              <div className="flex items-start gap-2 min-w-0">
                <div className="shrink-0 text-center min-w-[40px]">
                  <div className="text-[10px] uppercase text-slate-500 tabular-nums">
                    {nomeMesCurtissimo(e.data_inicio)}
                  </div>
                  <div className="text-base font-semibold text-slate-900 leading-tight tabular-nums">
                    {String(new Date(e.data_inicio).getDate()).padStart(2, '0')}
                  </div>
                </div>
                <div className="min-w-0">
                  <div className="text-sm font-medium text-slate-900 truncate">{e.titulo}</div>
                  <div className="mt-0.5 flex items-center gap-1.5 text-[11px] text-slate-500">
                    <span className={`inline-flex items-center rounded px-1 py-0.5 text-[9px] font-medium ${cor}`}>
                      {e.fonte === 'quadro' ? e.equipe_nome : 'Governança'}
                    </span>
                    {!e.dia_inteiro && (
                      <span>{new Date(e.data_inicio).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}</span>
                    )}
                    {e.recorrencia_tipo && <span className="text-slate-400">↻</span>}
                  </div>
                </div>
              </div>
            </Link>
          </li>
        );
      })}
    </ul>
  );
}

// =============================================================================
// Helpers de formatação
// =============================================================================

function formatarBRLCompacto(v) {
  v = Number(v) || 0;
  if (Math.abs(v) >= 1_000_000) return `R$ ${(v / 1_000_000).toFixed(1)}M`;
  if (Math.abs(v) >= 1_000) return `R$ ${(v / 1_000).toFixed(1)}k`;
  return formatarBRL(v);
}

function nomeMesCurto(ymd) {
  const [ano, mes] = String(ymd).split('-');
  const nomes = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];
  return `${nomes[parseInt(mes, 10) - 1]}/${ano.slice(2)}`;
}

function nomeMesCurtissimo(iso) {
  const d = new Date(iso);
  const nomes = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'];
  return nomes[d.getMonth()];
}

function tempoRelativo(iso) {
  const ms = Date.now() - new Date(iso).getTime();
  const seg = Math.floor(ms / 1000);
  if (seg < 60) return 'agora';
  const min = Math.floor(seg / 60);
  if (min < 60) return `${min} min atrás`;
  const h = Math.floor(min / 60);
  if (h < 24) return `${h}h atrás`;
  const d = Math.floor(h / 24);
  if (d < 7) return `${d}d atrás`;
  return formatarData(iso);
}

function descreverAcao(acao, detalhes = {}) {
  // Mapeia códigos de ação pra texto natural. Dá pra adicionar mais
  // conforme novos tipos de log aparecerem.
  const mapa = {
    'login': 'fez login',
    'logout': 'saiu',
    'socio.criou': 'criou um sócio',
    'socio.atualizou': 'atualizou dados de sócio',
    'pessoa_acesso.criar': 'criou uma pessoa de acesso',
    'pessoa_acesso.atualizar': 'atualizou pessoa de acesso',
    'pessoa_acesso.trocar_propria_senha': 'trocou a própria senha',
    'pessoa_acesso.resetar_senha': 'resetou senha de outra pessoa',
    'conta_pagar.criou': 'criou conta a pagar',
    'conta_pagar.pagou': 'efetivou pagamento de conta',
    'conta_pagar.cancelou': 'cancelou conta a pagar',
    'distribuicao.criou': 'criou distribuição de lucros',
    'distribuicao.efetivou': 'efetivou distribuição',
    'movimento_socio.criou': 'criou movimento de sócio',
    'movimento_socio.efetivou': 'efetivou movimento de sócio',
    'documento.criou': 'criou documento de governança',
    'documento.votou': 'votou em documento',
    'decisao.criou': 'criou decisão',
    'decisao.votou': 'votou em decisão',
    'evento_calendario.criou': 'criou evento no calendário',
    'evento_quadro.criou': 'criou evento em quadro',
    'equipe.criou': 'criou equipe',
    'equipe.adicionou_membro': 'adicionou membro à equipe',
    'quadro.criou': 'criou quadro',
    'card.criou': 'criou card',
    'card.moveu': 'moveu card',
    'card.editou': 'editou card',
  };
  return mapa[acao] || acao;
}
