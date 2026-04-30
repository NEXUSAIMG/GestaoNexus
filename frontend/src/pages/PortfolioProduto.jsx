import { useEffect, useState } from 'react';
import { Link, useParams, useNavigate } from 'react-router-dom';
import {
  ArrowLeft, Package, ExternalLink, Pencil, Save, X, Plus,
  TrendingUp, TrendingDown, Users, AlertCircle, Trash2, Archive,
  GitBranch, BarChart3, ListChecks, Calendar, CheckCircle2,
  RefreshCw, Zap,
} from 'lucide-react';
import { api, mensagemDeErro } from '../api/client.js';
import { useAuth } from '../context/AuthContext.jsx';

/**
 * Detalhe de um produto do portfólio — Sprint 16.
 *
 * Quatro tabs: Visão geral, Clientes, Roadmap, Métricas (admin edita).
 */

const STATUS_PRODUTO = {
  em_desenvolvimento: { rotulo: 'Em desenvolvimento', cor: 'bg-amber-100 text-amber-800' },
  beta:               { rotulo: 'Beta',                cor: 'bg-violet-100 text-violet-800' },
  ativo:              { rotulo: 'Ativo',               cor: 'bg-emerald-100 text-emerald-800' },
  descontinuado:      { rotulo: 'Descontinuado',       cor: 'bg-slate-100 text-slate-600' },
};

const STATUS_CLIENTE = {
  trial:         { rotulo: 'Trial',         cor: 'bg-blue-100 text-blue-800' },
  ativo:         { rotulo: 'Ativo',         cor: 'bg-emerald-100 text-emerald-800' },
  pausado:       { rotulo: 'Pausado',       cor: 'bg-amber-100 text-amber-800' },
  inadimplente:  { rotulo: 'Inadimplente',  cor: 'bg-red-100 text-red-800' },
  cancelado:     { rotulo: 'Cancelado',     cor: 'bg-slate-100 text-slate-600' },
};

const STATUS_ROADMAP = {
  planejado:           { rotulo: 'Planejado',           cor: 'bg-slate-100 text-slate-700' },
  em_desenvolvimento:  { rotulo: 'Em desenvolvimento',  cor: 'bg-amber-100 text-amber-800' },
  em_teste:            { rotulo: 'Em teste',            cor: 'bg-violet-100 text-violet-800' },
  lancado:             { rotulo: 'Lançado',             cor: 'bg-emerald-100 text-emerald-800' },
  cancelado:           { rotulo: 'Cancelado',           cor: 'bg-slate-100 text-slate-500' },
};

const COR_BG = {
  slate: 'bg-slate-500', red: 'bg-red-500', orange: 'bg-orange-500',
  amber: 'bg-amber-500', yellow: 'bg-yellow-500', lime: 'bg-lime-500',
  emerald: 'bg-emerald-500', teal: 'bg-teal-500', cyan: 'bg-cyan-500',
  blue: 'bg-blue-500', indigo: 'bg-indigo-500', violet: 'bg-violet-500',
  fuchsia: 'bg-fuchsia-500', pink: 'bg-pink-500', rose: 'bg-rose-500',
};

const COR_HEX = {
  slate: '#64748b', red: '#ef4444', orange: '#f97316', amber: '#f59e0b',
  yellow: '#eab308', lime: '#84cc16', emerald: '#10b981', teal: '#14b8a6',
  cyan: '#06b6d4', blue: '#3b82f6', indigo: '#6366f1', violet: '#8b5cf6',
  fuchsia: '#d946ef', pink: '#ec4899', rose: '#f43f5e',
};

function fmtBRL(n, opts = {}) {
  return Number(n || 0).toLocaleString('pt-BR', {
    style: 'currency',
    currency: 'BRL',
    minimumFractionDigits: opts.casas ?? 0,
    maximumFractionDigits: opts.casas ?? 0,
  });
}
function fmtMes(iso) {
  if (!iso) return '—';
  const d = new Date(`${String(iso).slice(0, 10)}T12:00:00`);
  return d.toLocaleDateString('pt-BR', { month: 'short', year: '2-digit' });
}
function fmtData(iso) {
  if (!iso) return '—';
  return new Date(`${String(iso).slice(0, 10)}T12:00:00`).toLocaleDateString('pt-BR');
}
function mesAtualISO() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01`;
}

// =============================================================================
// Página principal
// =============================================================================

export default function PortfolioProduto() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { pessoa } = useAuth();
  const souAdmin = !!pessoa?.administrador;

  const [produto, setProduto] = useState(null);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState('');
  const [tab, setTab] = useState('overview');
  const [editandoCabecalho, setEditandoCabecalho] = useState(false);
  const [sincronizando, setSincronizando] = useState(false);
  const [resultadoSync, setResultadoSync] = useState(null);

  async function carregar() {
    setCarregando(true);
    setErro('');
    try {
      const r = await api.get(`/produtos/${id}`);
      setProduto(r.data);
    } catch (err) {
      setErro(mensagemDeErro(err, 'Não consegui carregar o produto.'));
    } finally {
      setCarregando(false);
    }
  }

  useEffect(() => { carregar(); /* eslint-disable-next-line */ }, [id]);

  /**
   * Dispara sync sob demanda. Aceita meses pra escolher histórico:
   *   - meses=1  — só mês atual ("rápido")
   *   - meses=12 — puxa o ano todo ("primeira sincronização")
   */
  async function sincronizarAgora(meses = 1) {
    if (!produto || produto.fonte_dados === 'manual') return;
    setSincronizando(true);
    setResultadoSync(null);
    try {
      const r = await api.post(`/produtos/${id}/sincronizar?meses=${meses}`);
      setResultadoSync({
        ok: true,
        msg: `Sincronizado: ${r.data.qtd_metricas} mês(es), ${r.data.qtd_clientes} cliente(s) (${r.data.duracao_ms}ms)`,
      });
      await carregar();
    } catch (err) {
      setResultadoSync({
        ok: false,
        msg: mensagemDeErro(err, 'Falha ao sincronizar.'),
      });
    } finally {
      setSincronizando(false);
    }
  }

  if (carregando) {
    return <div className="p-4 text-sm text-slate-500">Carregando produto...</div>;
  }
  if (erro) {
    return (
      <div className="max-w-3xl">
        <Link to="/portfolio" className="inline-flex items-center gap-1 text-sm text-slate-600 hover:text-nexus-700 mb-3">
          <ArrowLeft size={14} /> Voltar ao portfólio
        </Link>
        <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{erro}</div>
      </div>
    );
  }
  if (!produto) return null;

  const status = STATUS_PRODUTO[produto.status] || STATUS_PRODUTO.ativo;

  return (
    <div className="max-w-7xl">
      <Link to="/portfolio" className="inline-flex items-center gap-1 text-xs text-slate-600 hover:text-nexus-700 mb-3">
        <ArrowLeft size={11} /> Voltar ao portfólio
      </Link>

      {/* Cabeçalho */}
      <div className="rounded-xl border border-slate-200 bg-white p-5 mb-4 shadow-sm">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="flex items-start gap-3 min-w-0">
            {produto.logo_url ? (
              <img
                src={produto.logo_url}
                alt={produto.nome}
                className="h-14 w-14 rounded-lg object-contain bg-slate-50 border border-slate-100"
              />
            ) : (
              <div className={`h-14 w-14 rounded-lg flex items-center justify-center text-white font-bold text-lg ${COR_BG[produto.cor] || 'bg-blue-500'}`}>
                {produto.nome.split(' ').map((w) => w[0]).slice(0, 2).join('').toUpperCase()}
              </div>
            )}
            <div className="min-w-0">
              <h1 className="text-2xl font-semibold text-slate-900">{produto.nome}</h1>
              <div className="mt-1 flex items-center gap-2 flex-wrap text-sm">
                <span className={`inline-flex items-center rounded px-2 py-0.5 text-xs font-medium uppercase ${status.cor}`}>
                  {status.rotulo}
                </span>
                {produto.equipe_nome && (
                  <span className="text-slate-600">
                    <Users size={11} className="inline mr-0.5" />
                    {produto.equipe_nome}
                  </span>
                )}
                {produto.data_lancamento && (
                  <span className="text-slate-600">
                    <Calendar size={11} className="inline mr-0.5" />
                    Desde {fmtData(produto.data_lancamento)}
                  </span>
                )}
                {produto.fonte_dados !== 'manual' && (
                  <span className="rounded bg-blue-50 border border-blue-200 px-1.5 py-0.5 text-[10px] font-medium text-blue-700">
                    Sync: {produto.fonte_dados}
                  </span>
                )}
              </div>
              {produto.descricao_curta && (
                <p className="mt-2 text-sm text-slate-600 max-w-2xl">{produto.descricao_curta}</p>
              )}
            </div>
          </div>

          <div className="flex items-center gap-1.5">
            {(produto.link_site || produto.link_app || produto.link_landing) && (
              <div className="flex flex-wrap gap-1.5">
                {produto.link_site && (
                  <a href={produto.link_site} target="_blank" rel="noreferrer"
                    className="inline-flex items-center gap-1 rounded-lg border border-slate-300 bg-white px-2.5 py-1 text-xs font-medium text-slate-700 hover:bg-slate-50">
                    <ExternalLink size={11} /> Site
                  </a>
                )}
                {produto.link_app && (
                  <a href={produto.link_app} target="_blank" rel="noreferrer"
                    className="inline-flex items-center gap-1 rounded-lg border border-slate-300 bg-white px-2.5 py-1 text-xs font-medium text-slate-700 hover:bg-slate-50">
                    <ExternalLink size={11} /> App
                  </a>
                )}
                {produto.link_landing && (
                  <a href={produto.link_landing} target="_blank" rel="noreferrer"
                    className="inline-flex items-center gap-1 rounded-lg border border-slate-300 bg-white px-2.5 py-1 text-xs font-medium text-slate-700 hover:bg-slate-50">
                    <ExternalLink size={11} /> Landing
                  </a>
                )}
              </div>
            )}
            {souAdmin && produto.fonte_dados !== 'manual' && (
              <button type="button" onClick={() => sincronizarAgora(1)}
                disabled={sincronizando}
                title="Puxar dados atualizados do produto-fonte agora"
                className="inline-flex items-center gap-1 rounded-lg border border-blue-300 bg-blue-50 px-2.5 py-1 text-xs font-medium text-blue-800 hover:bg-blue-100 disabled:opacity-50">
                <RefreshCw size={11} className={sincronizando ? 'animate-spin' : ''} />
                {sincronizando ? 'Sincronizando...' : 'Sincronizar'}
              </button>
            )}
            {souAdmin && (
              <button type="button" onClick={() => setEditandoCabecalho(true)}
                className="inline-flex items-center gap-1 rounded-lg border border-slate-300 bg-white px-2.5 py-1 text-xs font-medium text-slate-700 hover:bg-slate-50">
                <Pencil size={11} /> Editar
              </button>
            )}
          </div>
        </div>

        {/* Status do sync (só quando produto tem fonte != manual) */}
        {produto.fonte_dados !== 'manual' && (
          <div className="mt-3 pt-3 border-t border-slate-100 flex items-center justify-between text-xs">
            <div className="flex items-center gap-2 text-slate-600">
              <Zap size={12} className="text-blue-500" />
              <span>
                Sync automático de <strong>{produto.fonte_dados}</strong>
                {produto.sincronizado_em && (
                  <> · última vez: {new Date(produto.sincronizado_em).toLocaleString('pt-BR')}</>
                )}
                {!produto.sincronizado_em && (
                  <> · <span className="text-amber-700">nunca sincronizado</span></>
                )}
              </span>
            </div>
            {souAdmin && !produto.sincronizado_em && (
              <button type="button" onClick={() => sincronizarAgora(12)}
                disabled={sincronizando}
                className="text-blue-700 hover:underline disabled:opacity-50">
                Puxar 12 meses de histórico
              </button>
            )}
          </div>
        )}

        {resultadoSync && (
          <div className={[
            'mt-3 rounded-lg px-3 py-2 text-xs',
            resultadoSync.ok
              ? 'bg-emerald-50 border border-emerald-200 text-emerald-800'
              : 'bg-red-50 border border-red-200 text-red-700',
          ].join(' ')}>
            {resultadoSync.msg}
          </div>
        )}
      </div>

      {/* Tabs */}
      <div className="flex border-b border-slate-200 mb-4 overflow-x-auto">
        {[
          { v: 'overview',  l: 'Visão geral',  i: BarChart3 },
          { v: 'clientes',  l: 'Clientes',     i: Users },
          { v: 'roadmap',   l: 'Roadmap',      i: GitBranch },
          { v: 'metricas',  l: 'Métricas',     i: ListChecks },
        ].map((t) => (
          <button
            key={t.v} type="button" onClick={() => setTab(t.v)}
            className={[
              'inline-flex items-center gap-1.5 px-3 py-2 text-sm font-medium transition-colors whitespace-nowrap',
              tab === t.v
                ? 'border-b-2 border-nexus-700 text-nexus-800'
                : 'text-slate-600 hover:text-slate-900',
            ].join(' ')}
          >
            <t.i size={13} /> {t.l}
          </button>
        ))}
      </div>

      {/* Conteúdo */}
      {tab === 'overview' && <TabVisaoGeral produto={produto} />}
      {tab === 'clientes' && <TabClientes produto={produto} souAdmin={souAdmin} aoMudou={carregar} />}
      {tab === 'roadmap' && <TabRoadmap produto={produto} souAdmin={souAdmin} aoMudou={carregar} />}
      {tab === 'metricas' && <TabMetricas produto={produto} souAdmin={souAdmin} aoMudou={carregar} />}

      {editandoCabecalho && (
        <ModalEditarCabecalho
          produto={produto}
          aoFechar={() => setEditandoCabecalho(false)}
          aoSalvo={() => { setEditandoCabecalho(false); carregar(); }}
        />
      )}
    </div>
  );
}

// =============================================================================
// Tab: Visão geral (gráficos)
// =============================================================================

function TabVisaoGeral({ produto }) {
  const metricas = [...(produto.metricas || [])].sort(
    (a, b) => a.mes < b.mes ? -1 : 1,
  );
  const ultima = metricas[metricas.length - 1];

  if (metricas.length === 0) {
    return (
      <div className="rounded-xl border border-dashed border-slate-300 bg-white p-8 text-center text-sm text-slate-500">
        Nenhuma métrica cadastrada ainda. Vá pra aba <strong>Métricas</strong> pra adicionar.
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* KPIs do mês mais recente */}
      <div>
        <div className="text-xs uppercase tracking-wide text-slate-500 font-medium mb-2">
          Mês mais recente · {fmtMes(ultima.mes)}
        </div>
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          <Kpi titulo="MRR" valor={fmtBRL(ultima.mrr)}
            descricao={`Receita total: ${fmtBRL(ultima.receita_total)}`} />
          <Kpi titulo="Clientes ativos" valor={Number(ultima.clientes_ativos).toLocaleString('pt-BR')}
            descricao={`+${ultima.novos_clientes} novos · -${ultima.churn_clientes} churn`} />
          <Kpi titulo="Tickets" valor={`${ultima.tickets_resolvidos}/${ultima.tickets_abertos}`}
            descricao="Resolvidos / abertos" />
          <Kpi titulo="Conversão" valor={
            ultima.trials_iniciados > 0
              ? `${Math.round((ultima.conversoes / ultima.trials_iniciados) * 100)}%`
              : '—'
          } descricao={`${ultima.conversoes} de ${ultima.trials_iniciados} trials`} />
        </div>
      </div>

      {/* Gráfico de MRR e Receita Total */}
      <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
        <h3 className="text-sm font-semibold text-slate-900 mb-3">Receita</h3>
        <GraficoLinha
          serie={metricas}
          linhas={[
            { campo: 'mrr', label: 'MRR', cor: produto.cor },
            { campo: 'receita_total', label: 'Receita total', cor: 'slate' },
          ]}
          formatador={fmtBRL}
        />
      </div>

      {/* Gráfico de clientes */}
      <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
        <h3 className="text-sm font-semibold text-slate-900 mb-3">Clientes</h3>
        <GraficoLinha
          serie={metricas}
          linhas={[
            { campo: 'clientes_ativos', label: 'Ativos', cor: 'emerald' },
            { campo: 'novos_clientes', label: 'Novos', cor: 'blue' },
            { campo: 'churn_clientes', label: 'Churn', cor: 'red' },
          ]}
          formatador={(v) => Number(v).toLocaleString('pt-BR')}
        />
      </div>

      {/* Funil de conversão */}
      {(ultima.visitantes_landing > 0 || ultima.trials_iniciados > 0) && (
        <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
          <h3 className="text-sm font-semibold text-slate-900 mb-3">Funil de conversão (mês atual)</h3>
          <Funil
            etapas={[
              { rotulo: 'Visitantes da landing', valor: ultima.visitantes_landing },
              { rotulo: 'Trials iniciados', valor: ultima.trials_iniciados },
              { rotulo: 'Conversões', valor: ultima.conversoes },
            ]}
          />
        </div>
      )}

      {/* Descrição longa */}
      {produto.descricao_longa && (
        <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
          <h3 className="text-sm font-semibold text-slate-900 mb-2">Sobre o produto</h3>
          <pre className="text-sm text-slate-700 whitespace-pre-wrap font-sans">
            {produto.descricao_longa}
          </pre>
        </div>
      )}
    </div>
  );
}

function Kpi({ titulo, valor, descricao }) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-3 shadow-sm">
      <div className="text-[10px] uppercase tracking-wide text-slate-500 font-medium">{titulo}</div>
      <div className="mt-1 text-xl font-semibold text-slate-900 tabular-nums">{valor}</div>
      {descricao && <div className="mt-0.5 text-[11px] text-slate-500">{descricao}</div>}
    </div>
  );
}

// =============================================================================
// Gráfico de linha (SVG puro)
// =============================================================================

function GraficoLinha({ serie, linhas, formatador }) {
  if (!serie || serie.length === 0) return null;

  const W = 720, H = 220, PAD_L = 60, PAD_R = 20, PAD_T = 20, PAD_B = 30;
  const innerW = W - PAD_L - PAD_R;
  const innerH = H - PAD_T - PAD_B;

  // Calcula max global (todas as linhas)
  let max = 0;
  for (const p of serie) {
    for (const l of linhas) {
      max = Math.max(max, Number(p[l.campo] || 0));
    }
  }
  if (max === 0) max = 1;
  // Arredonda pra cima pro próximo "passo" bonito
  const escala = Math.pow(10, Math.floor(Math.log10(max)));
  max = Math.ceil(max / escala) * escala;

  const yEsc = (v) => PAD_T + innerH - (Number(v || 0) / max) * innerH;
  const xEsc = (i) => PAD_L + (i * innerW) / Math.max(serie.length - 1, 1);

  // Grade horizontal (4 linhas)
  const gradeY = [0, 0.25, 0.5, 0.75, 1].map((p) => ({
    y: PAD_T + innerH - p * innerH,
    valor: max * p,
  }));

  return (
    <div>
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-auto">
        {/* Grade */}
        {gradeY.map((g, i) => (
          <g key={i}>
            <line x1={PAD_L} x2={W - PAD_R} y1={g.y} y2={g.y}
              stroke="#e2e8f0" strokeWidth="1" />
            <text x={PAD_L - 8} y={g.y} textAnchor="end" dominantBaseline="middle"
              fontSize="10" fill="#94a3b8">
              {formatador(g.valor)}
            </text>
          </g>
        ))}

        {/* Eixo X */}
        {serie.map((p, i) => (
          <text key={i} x={xEsc(i)} y={H - 8} textAnchor="middle"
            fontSize="10" fill="#64748b">
            {fmtMes(p.mes)}
          </text>
        ))}

        {/* Linhas */}
        {linhas.map((l) => {
          const path = serie.map((p, i) => {
            const x = xEsc(i);
            const y = yEsc(p[l.campo]);
            return `${i === 0 ? 'M' : 'L'}${x.toFixed(1)},${y.toFixed(1)}`;
          }).join(' ');
          const corHex = COR_HEX[l.cor] || COR_HEX.blue;
          return (
            <g key={l.campo}>
              <path d={path} fill="none" stroke={corHex} strokeWidth="2" />
              {serie.map((p, i) => (
                <circle key={i} cx={xEsc(i)} cy={yEsc(p[l.campo])}
                  r="3" fill={corHex} />
              ))}
            </g>
          );
        })}
      </svg>

      {/* Legenda */}
      <div className="flex items-center gap-3 mt-2 text-xs">
        {linhas.map((l) => (
          <span key={l.campo} className="inline-flex items-center gap-1 text-slate-700">
            <span className="h-2 w-2 rounded-full" style={{ backgroundColor: COR_HEX[l.cor] || COR_HEX.blue }} />
            {l.label}
          </span>
        ))}
      </div>
    </div>
  );
}

// =============================================================================
// Funil
// =============================================================================

function Funil({ etapas }) {
  const max = Math.max(...etapas.map((e) => e.valor || 0), 1);
  return (
    <div className="space-y-2">
      {etapas.map((e, i) => {
        const pct = (e.valor / max) * 100;
        const taxaConv = i > 0 && etapas[i - 1].valor > 0
          ? (e.valor / etapas[i - 1].valor) * 100
          : null;
        return (
          <div key={i}>
            <div className="flex items-center justify-between text-xs mb-0.5">
              <span className="text-slate-700 font-medium">{e.rotulo}</span>
              <span className="text-slate-500 tabular-nums">
                {Number(e.valor).toLocaleString('pt-BR')}
                {taxaConv != null && (
                  <span className="text-emerald-700 ml-2">
                    ({taxaConv.toFixed(1)}%)
                  </span>
                )}
              </span>
            </div>
            <div className="h-7 bg-slate-100 rounded overflow-hidden">
              <div
                className="h-full bg-nexus-600 transition-all"
                style={{ width: `${pct}%` }}
              />
            </div>
          </div>
        );
      })}
    </div>
  );
}

// =============================================================================
// Tab: Clientes
// =============================================================================

function TabClientes({ produto, souAdmin, aoMudou }) {
  const [busca, setBusca] = useState('');
  const [filtroStatus, setFiltroStatus] = useState('');
  const [modal, setModal] = useState(null); // { cliente? }

  const clientesFiltrados = (produto.clientes || []).filter((c) => {
    if (filtroStatus && c.status !== filtroStatus) return false;
    if (busca) {
      const b = busca.toLowerCase();
      return (
        (c.nome || '').toLowerCase().includes(b) ||
        (c.email || '').toLowerCase().includes(b) ||
        (c.documento || '').toLowerCase().includes(b)
      );
    }
    return true;
  });

  const totalMRR = (produto.clientes || [])
    .filter((c) => c.status === 'ativo')
    .reduce((s, c) => s + Number(c.valor_mensal || 0), 0);

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <input
            type="search"
            value={busca} onChange={(e) => setBusca(e.target.value)}
            placeholder="Buscar por nome, email, documento..."
            className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm w-64"
          />
          <select
            value={filtroStatus} onChange={(e) => setFiltroStatus(e.target.value)}
            className="rounded-lg border border-slate-300 bg-white px-2 py-1.5 text-sm"
          >
            <option value="">Todos os status</option>
            {Object.entries(STATUS_CLIENTE).map(([v, info]) => (
              <option key={v} value={v}>{info.rotulo}</option>
            ))}
          </select>
        </div>

        <div className="flex items-center gap-3 text-xs">
          <span className="text-slate-600">
            <strong>{clientesFiltrados.length}</strong> cliente{clientesFiltrados.length === 1 ? '' : 's'}
          </span>
          <span className="text-slate-400">·</span>
          <span className="text-slate-600">
            MRR ativo: <strong>{fmtBRL(totalMRR, { casas: 2 })}</strong>
          </span>
          {souAdmin && (
            <button type="button" onClick={() => setModal({ cliente: null })}
              className="inline-flex items-center gap-1 rounded-lg bg-nexus-700 px-3 py-1.5 text-xs font-medium text-white hover:bg-nexus-800">
              <Plus size={11} /> Novo cliente
            </button>
          )}
        </div>
      </div>

      {clientesFiltrados.length === 0 && (
        <div className="rounded-xl border border-dashed border-slate-300 bg-white p-8 text-center text-sm text-slate-500">
          {(produto.clientes || []).length === 0
            ? 'Nenhum cliente cadastrado ainda.'
            : 'Nenhum cliente bate com o filtro.'}
        </div>
      )}

      {clientesFiltrados.length > 0 && (
        <div className="rounded-xl border border-slate-200 bg-white overflow-hidden shadow-sm">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 text-[11px] uppercase text-slate-500 font-medium">
                <tr>
                  <th className="text-left px-3 py-2">Nome</th>
                  <th className="text-left px-3 py-2">Plano</th>
                  <th className="text-right px-3 py-2">Valor/mês</th>
                  <th className="text-left px-3 py-2">Status</th>
                  <th className="text-left px-3 py-2">Início</th>
                  {souAdmin && <th className="px-3 py-2 w-10"></th>}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {clientesFiltrados.map((c) => {
                  const st = STATUS_CLIENTE[c.status] || STATUS_CLIENTE.ativo;
                  return (
                    <tr key={c.id} className="hover:bg-slate-50">
                      <td className="px-3 py-2">
                        <div className="font-medium text-slate-900">{c.nome}</div>
                        {c.email && <div className="text-xs text-slate-500">{c.email}</div>}
                      </td>
                      <td className="px-3 py-2 text-slate-700">{c.plano || '—'}</td>
                      <td className="px-3 py-2 text-right tabular-nums text-slate-900">
                        {c.valor_mensal != null ? fmtBRL(c.valor_mensal, { casas: 2 }) : '—'}
                      </td>
                      <td className="px-3 py-2">
                        <span className={`inline-flex rounded px-1.5 py-0.5 text-[10px] font-medium uppercase ${st.cor}`}>
                          {st.rotulo}
                        </span>
                      </td>
                      <td className="px-3 py-2 text-xs text-slate-600">
                        {fmtData(c.data_inicio)}
                      </td>
                      {souAdmin && (
                        <td className="px-3 py-2 text-right">
                          <button type="button" onClick={() => setModal({ cliente: c })}
                            className="rounded p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700">
                            <Pencil size={12} />
                          </button>
                        </td>
                      )}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {modal && (
        <ModalCliente
          produtoId={produto.id}
          cliente={modal.cliente}
          aoFechar={() => setModal(null)}
          aoSalvo={() => { setModal(null); aoMudou(); }}
        />
      )}
    </div>
  );
}

function ModalCliente({ produtoId, cliente, aoFechar, aoSalvo }) {
  const editando = !!cliente;
  const [d, setD] = useState({
    nome: cliente?.nome || '',
    documento: cliente?.documento || '',
    email: cliente?.email || '',
    telefone: cliente?.telefone || '',
    plano: cliente?.plano || '',
    valor_mensal: cliente?.valor_mensal ?? '',
    data_inicio: cliente?.data_inicio?.slice(0, 10) || '',
    data_fim: cliente?.data_fim?.slice(0, 10) || '',
    status: cliente?.status || 'ativo',
    origem: cliente?.origem || '',
    observacao: cliente?.observacao || '',
  });
  const [erro, setErro] = useState('');
  const [salvando, setSalvando] = useState(false);

  function setField(k, v) { setD((s) => ({ ...s, [k]: v })); }

  async function submeter(e) {
    e.preventDefault();
    setErro('');
    setSalvando(true);
    try {
      const body = {
        ...d,
        valor_mensal: d.valor_mensal === '' ? null : Number(d.valor_mensal),
        data_inicio: d.data_inicio || null,
        data_fim: d.data_fim || null,
      };
      if (editando) {
        await api.put(`/produtos/${produtoId}/clientes/${cliente.id}`, body);
      } else {
        await api.post(`/produtos/${produtoId}/clientes`, body);
      }
      aoSalvo();
    } catch (err) {
      setErro(mensagemDeErro(err, 'Não consegui salvar.'));
      setSalvando(false);
    }
  }

  async function excluir() {
    if (!confirm(`Excluir cliente "${cliente.nome}"?`)) return;
    try {
      await api.delete(`/produtos/${produtoId}/clientes/${cliente.id}`);
      aoSalvo();
    } catch (err) {
      setErro(mensagemDeErro(err, 'Não consegui excluir.'));
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4">
      <div className="w-full max-w-2xl rounded-xl bg-white shadow-xl max-h-[90vh] overflow-y-auto">
        <header className="flex items-center justify-between border-b border-slate-200 px-5 py-3 sticky top-0 bg-white">
          <h2 className="text-base font-semibold text-slate-900">
            {editando ? 'Editar cliente' : 'Novo cliente'}
          </h2>
          <button onClick={aoFechar} className="rounded p-1 text-slate-400 hover:bg-slate-100">
            <X size={18} />
          </button>
        </header>

        <form onSubmit={submeter} className="p-5 space-y-3">
          <Campo label="Nome*" requerido>
            <input required minLength={1} maxLength={255}
              value={d.nome} onChange={(e) => setField('nome', e.target.value)}
              autoFocus className={inputCls} />
          </Campo>

          <div className="grid grid-cols-2 gap-3">
            <Campo label="CNPJ/CPF">
              <input value={d.documento} onChange={(e) => setField('documento', e.target.value)}
                className={inputCls} />
            </Campo>
            <Campo label="Telefone">
              <input value={d.telefone} onChange={(e) => setField('telefone', e.target.value)}
                className={inputCls} />
            </Campo>
          </div>

          <Campo label="Email">
            <input type="email" value={d.email} onChange={(e) => setField('email', e.target.value)}
              className={inputCls} />
          </Campo>

          <div className="grid grid-cols-2 gap-3">
            <Campo label="Plano">
              <input value={d.plano} onChange={(e) => setField('plano', e.target.value)}
                placeholder="Básico, Pro Anual..." className={inputCls} />
            </Campo>
            <Campo label="Valor mensal (R$)">
              <input type="number" step="0.01" min="0"
                value={d.valor_mensal} onChange={(e) => setField('valor_mensal', e.target.value)}
                className={inputCls} />
            </Campo>
          </div>

          <div className="grid grid-cols-3 gap-3">
            <Campo label="Início">
              <input type="date" value={d.data_inicio} onChange={(e) => setField('data_inicio', e.target.value)}
                className={inputCls} />
            </Campo>
            <Campo label="Fim">
              <input type="date" value={d.data_fim} onChange={(e) => setField('data_fim', e.target.value)}
                className={inputCls} />
            </Campo>
            <Campo label="Status">
              <select value={d.status} onChange={(e) => setField('status', e.target.value)}
                className={inputCls}>
                {Object.entries(STATUS_CLIENTE).map(([v, info]) => (
                  <option key={v} value={v}>{info.rotulo}</option>
                ))}
              </select>
            </Campo>
          </div>

          <Campo label="Origem">
            <input value={d.origem} onChange={(e) => setField('origem', e.target.value)}
              placeholder="Vendedor X, indicação, marketing..." className={inputCls} />
          </Campo>

          <Campo label="Observação">
            <textarea rows={2} value={d.observacao} onChange={(e) => setField('observacao', e.target.value)}
              className={inputCls} />
          </Campo>

          {erro && (
            <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{erro}</div>
          )}

          <div className="flex justify-between gap-2 pt-2">
            {editando ? (
              <button type="button" onClick={excluir}
                className="inline-flex items-center gap-1 rounded-lg border border-red-300 bg-white px-3 py-2 text-sm font-medium text-red-700 hover:bg-red-50">
                <Trash2 size={12} /> Excluir
              </button>
            ) : <span />}
            <div className="flex gap-2">
              <button type="button" onClick={aoFechar}
                className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50">
                Cancelar
              </button>
              <button type="submit" disabled={salvando}
                className="rounded-lg bg-nexus-700 px-4 py-2 text-sm font-medium text-white hover:bg-nexus-800 disabled:opacity-50">
                {salvando ? 'Salvando...' : 'Salvar'}
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
}

// =============================================================================
// Tab: Roadmap
// =============================================================================

function TabRoadmap({ produto, souAdmin, aoMudou }) {
  const [modal, setModal] = useState(null);

  const grupos = {
    em_desenvolvimento: [],
    em_teste: [],
    planejado: [],
    lancado: [],
    cancelado: [],
  };
  for (const item of (produto.roadmap || [])) {
    if (grupos[item.status]) grupos[item.status].push(item);
  }

  return (
    <div className="space-y-4">
      {souAdmin && (
        <div className="flex justify-end">
          <button type="button" onClick={() => setModal({ item: null })}
            className="inline-flex items-center gap-1 rounded-lg bg-nexus-700 px-3 py-1.5 text-xs font-medium text-white hover:bg-nexus-800">
            <Plus size={11} /> Novo item
          </button>
        </div>
      )}

      {(produto.roadmap || []).length === 0 && (
        <div className="rounded-xl border border-dashed border-slate-300 bg-white p-8 text-center text-sm text-slate-500">
          Nenhum item no roadmap ainda.
        </div>
      )}

      {Object.entries(grupos).map(([statusKey, items]) => {
        if (items.length === 0) return null;
        const info = STATUS_ROADMAP[statusKey];
        return (
          <section key={statusKey}>
            <h3 className="text-sm font-semibold text-slate-900 mb-2 inline-flex items-center gap-2">
              <span className={`inline-flex items-center rounded px-1.5 py-0.5 text-[10px] font-medium uppercase ${info.cor}`}>
                {info.rotulo}
              </span>
              <span className="text-slate-400 text-xs font-normal">({items.length})</span>
            </h3>
            <ul className="space-y-2">
              {items.map((item) => (
                <ItemRoadmap
                  key={item.id} item={item} souAdmin={souAdmin}
                  aoEditar={() => setModal({ item })}
                />
              ))}
            </ul>
          </section>
        );
      })}

      {modal && (
        <ModalRoadmap
          produtoId={produto.id} item={modal.item}
          aoFechar={() => setModal(null)}
          aoSalvo={() => { setModal(null); aoMudou(); }}
        />
      )}
    </div>
  );
}

function ItemRoadmap({ item, souAdmin, aoEditar }) {
  const corPrior = {
    alta: 'border-red-300 bg-red-50',
    media: 'border-slate-200 bg-white',
    baixa: 'border-slate-200 bg-slate-50/50',
  }[item.prioridade] || 'border-slate-200 bg-white';

  return (
    <li className={`rounded-lg border p-3 ${corPrior}`}>
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 flex-wrap">
            <h4 className="font-medium text-slate-900">{item.titulo}</h4>
            <span className={`text-[10px] uppercase font-medium ${
              item.prioridade === 'alta' ? 'text-red-700' :
              item.prioridade === 'baixa' ? 'text-slate-500' : 'text-slate-700'
            }`}>
              {item.prioridade}
            </span>
          </div>
          {item.descricao && (
            <p className="mt-1 text-sm text-slate-600 whitespace-pre-wrap">{item.descricao}</p>
          )}
          <div className="mt-1.5 flex items-center gap-3 text-[11px] text-slate-500">
            {item.data_prevista && (
              <span>Prevista: {fmtData(item.data_prevista)}</span>
            )}
            {item.data_lancamento && (
              <span className="text-emerald-700 inline-flex items-center gap-0.5">
                <CheckCircle2 size={10} /> Lançada em {fmtData(item.data_lancamento)}
              </span>
            )}
            {item.card_quadro_id && item.card_id && (
              <Link to={`/tarefas/${item.card_quadro_id}?card=${item.card_id}`}
                className="text-nexus-700 hover:text-nexus-800">
                → ver no Kanban
              </Link>
            )}
          </div>
        </div>
        {souAdmin && (
          <button onClick={aoEditar} className="rounded p-1 text-slate-400 hover:bg-slate-100">
            <Pencil size={12} />
          </button>
        )}
      </div>
    </li>
  );
}

function ModalRoadmap({ produtoId, item, aoFechar, aoSalvo }) {
  const editando = !!item;
  const [d, setD] = useState({
    titulo: item?.titulo || '',
    descricao: item?.descricao || '',
    status: item?.status || 'planejado',
    prioridade: item?.prioridade || 'media',
    data_prevista: item?.data_prevista?.slice(0, 10) || '',
    data_lancamento: item?.data_lancamento?.slice(0, 10) || '',
  });
  const [erro, setErro] = useState('');
  const [salvando, setSalvando] = useState(false);

  function setField(k, v) { setD((s) => ({ ...s, [k]: v })); }

  async function submeter(e) {
    e.preventDefault();
    setErro('');
    setSalvando(true);
    try {
      const body = {
        ...d,
        data_prevista: d.data_prevista || null,
        data_lancamento: d.data_lancamento || null,
      };
      if (editando) {
        await api.put(`/produtos/${produtoId}/roadmap/${item.id}`, body);
      } else {
        await api.post(`/produtos/${produtoId}/roadmap`, body);
      }
      aoSalvo();
    } catch (err) {
      setErro(mensagemDeErro(err, 'Não consegui salvar.'));
      setSalvando(false);
    }
  }

  async function excluir() {
    if (!confirm(`Excluir item "${item.titulo}"?`)) return;
    try {
      await api.delete(`/produtos/${produtoId}/roadmap/${item.id}`);
      aoSalvo();
    } catch (err) {
      setErro(mensagemDeErro(err, 'Não consegui excluir.'));
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4">
      <div className="w-full max-w-lg rounded-xl bg-white shadow-xl max-h-[90vh] overflow-y-auto">
        <header className="flex items-center justify-between border-b border-slate-200 px-5 py-3">
          <h2 className="text-base font-semibold text-slate-900">
            {editando ? 'Editar item' : 'Novo item de roadmap'}
          </h2>
          <button onClick={aoFechar} className="rounded p-1 text-slate-400 hover:bg-slate-100">
            <X size={18} />
          </button>
        </header>

        <form onSubmit={submeter} className="p-5 space-y-3">
          <Campo label="Título*" requerido>
            <input required minLength={2} maxLength={255}
              value={d.titulo} onChange={(e) => setField('titulo', e.target.value)}
              autoFocus className={inputCls} />
          </Campo>

          <Campo label="Descrição">
            <textarea rows={3} value={d.descricao} onChange={(e) => setField('descricao', e.target.value)}
              className={inputCls} />
          </Campo>

          <div className="grid grid-cols-2 gap-3">
            <Campo label="Status">
              <select value={d.status} onChange={(e) => setField('status', e.target.value)}
                className={inputCls}>
                {Object.entries(STATUS_ROADMAP).map(([v, info]) => (
                  <option key={v} value={v}>{info.rotulo}</option>
                ))}
              </select>
            </Campo>
            <Campo label="Prioridade">
              <select value={d.prioridade} onChange={(e) => setField('prioridade', e.target.value)}
                className={inputCls}>
                <option value="baixa">Baixa</option>
                <option value="media">Média</option>
                <option value="alta">Alta</option>
              </select>
            </Campo>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <Campo label="Data prevista">
              <input type="date" value={d.data_prevista} onChange={(e) => setField('data_prevista', e.target.value)}
                className={inputCls} />
            </Campo>
            <Campo label="Data de lançamento">
              <input type="date" value={d.data_lancamento} onChange={(e) => setField('data_lancamento', e.target.value)}
                className={inputCls} />
            </Campo>
          </div>

          {erro && (
            <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{erro}</div>
          )}

          <div className="flex justify-between gap-2 pt-2">
            {editando ? (
              <button type="button" onClick={excluir}
                className="inline-flex items-center gap-1 rounded-lg border border-red-300 bg-white px-3 py-2 text-sm font-medium text-red-700 hover:bg-red-50">
                <Trash2 size={12} /> Excluir
              </button>
            ) : <span />}
            <div className="flex gap-2">
              <button type="button" onClick={aoFechar}
                className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50">
                Cancelar
              </button>
              <button type="submit" disabled={salvando}
                className="rounded-lg bg-nexus-700 px-4 py-2 text-sm font-medium text-white hover:bg-nexus-800 disabled:opacity-50">
                {salvando ? 'Salvando...' : 'Salvar'}
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
}

// =============================================================================
// Tab: Métricas (admin cadastra mês a mês)
// =============================================================================

function TabMetricas({ produto, souAdmin, aoMudou }) {
  const [modal, setModal] = useState(null);

  const metricas = [...(produto.metricas || [])]; // já vem ordenado DESC

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <p className="text-sm text-slate-600">
          Histórico mensal — MRR, clientes, churn, conversão. Salvar o mesmo
          mês de novo sobrescreve.
        </p>
        {souAdmin && (
          <button type="button" onClick={() => setModal({ metrica: null })}
            className="inline-flex items-center gap-1 rounded-lg bg-nexus-700 px-3 py-1.5 text-xs font-medium text-white hover:bg-nexus-800">
            <Plus size={11} /> Adicionar mês
          </button>
        )}
      </div>

      {metricas.length === 0 && (
        <div className="rounded-xl border border-dashed border-slate-300 bg-white p-8 text-center text-sm text-slate-500">
          Nenhuma métrica cadastrada ainda.
        </div>
      )}

      {metricas.length > 0 && (
        <div className="rounded-xl border border-slate-200 bg-white overflow-hidden shadow-sm">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 text-[11px] uppercase text-slate-500 font-medium">
                <tr>
                  <th className="text-left px-3 py-2">Mês</th>
                  <th className="text-right px-3 py-2">MRR</th>
                  <th className="text-right px-3 py-2">Receita total</th>
                  <th className="text-right px-3 py-2">Clientes</th>
                  <th className="text-right px-3 py-2">Novos</th>
                  <th className="text-right px-3 py-2">Churn</th>
                  <th className="text-right px-3 py-2">Tickets</th>
                  {souAdmin && <th className="px-3 py-2 w-10"></th>}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {metricas.map((m) => (
                  <tr key={m.id} className="hover:bg-slate-50">
                    <td className="px-3 py-2 font-medium text-slate-900">{fmtMes(m.mes)}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{fmtBRL(m.mrr)}</td>
                    <td className="px-3 py-2 text-right tabular-nums text-slate-600">{fmtBRL(m.receita_total)}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{Number(m.clientes_ativos).toLocaleString('pt-BR')}</td>
                    <td className="px-3 py-2 text-right tabular-nums text-emerald-700">+{m.novos_clientes}</td>
                    <td className="px-3 py-2 text-right tabular-nums text-red-700">-{m.churn_clientes}</td>
                    <td className="px-3 py-2 text-right tabular-nums text-slate-600">{m.tickets_resolvidos}/{m.tickets_abertos}</td>
                    {souAdmin && (
                      <td className="px-3 py-2 text-right">
                        <button type="button" onClick={() => setModal({ metrica: m })}
                          className="rounded p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700">
                          <Pencil size={12} />
                        </button>
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {modal && (
        <ModalMetrica
          produtoId={produto.id} metrica={modal.metrica}
          aoFechar={() => setModal(null)}
          aoSalvo={() => { setModal(null); aoMudou(); }}
        />
      )}
    </div>
  );
}

function ModalMetrica({ produtoId, metrica, aoFechar, aoSalvo }) {
  const editando = !!metrica;
  const [d, setD] = useState({
    mes: metrica?.mes?.slice(0, 10) || mesAtualISO(),
    mrr: metrica?.mrr || '',
    receita_total: metrica?.receita_total || '',
    clientes_ativos: metrica?.clientes_ativos || '',
    novos_clientes: metrica?.novos_clientes || '',
    churn_clientes: metrica?.churn_clientes || '',
    churn_mrr: metrica?.churn_mrr || '',
    tickets_abertos: metrica?.tickets_abertos || '',
    tickets_resolvidos: metrica?.tickets_resolvidos || '',
    visitantes_landing: metrica?.visitantes_landing || '',
    trials_iniciados: metrica?.trials_iniciados || '',
    conversoes: metrica?.conversoes || '',
    observacao: metrica?.observacao || '',
  });
  const [erro, setErro] = useState('');
  const [salvando, setSalvando] = useState(false);

  function setField(k, v) { setD((s) => ({ ...s, [k]: v })); }

  async function submeter(e) {
    e.preventDefault();
    setErro('');
    setSalvando(true);
    try {
      // Garante que dia é 01
      const mes = d.mes.slice(0, 7) + '-01';
      const body = {
        ...d,
        mes,
        mrr: Number(d.mrr || 0),
        receita_total: Number(d.receita_total || 0),
        clientes_ativos: Number(d.clientes_ativos || 0),
        novos_clientes: Number(d.novos_clientes || 0),
        churn_clientes: Number(d.churn_clientes || 0),
        churn_mrr: Number(d.churn_mrr || 0),
        tickets_abertos: Number(d.tickets_abertos || 0),
        tickets_resolvidos: Number(d.tickets_resolvidos || 0),
        visitantes_landing: Number(d.visitantes_landing || 0),
        trials_iniciados: Number(d.trials_iniciados || 0),
        conversoes: Number(d.conversoes || 0),
        observacao: d.observacao || null,
      };
      await api.post(`/produtos/${produtoId}/metricas`, body);
      aoSalvo();
    } catch (err) {
      setErro(mensagemDeErro(err, 'Não consegui salvar.'));
      setSalvando(false);
    }
  }

  async function excluir() {
    if (!confirm(`Excluir métricas de ${fmtMes(metrica.mes)}?`)) return;
    try {
      await api.delete(`/produtos/${produtoId}/metricas/${metrica.id}`);
      aoSalvo();
    } catch (err) {
      setErro(mensagemDeErro(err, 'Não consegui excluir.'));
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4">
      <div className="w-full max-w-2xl rounded-xl bg-white shadow-xl max-h-[90vh] overflow-y-auto">
        <header className="flex items-center justify-between border-b border-slate-200 px-5 py-3 sticky top-0 bg-white">
          <h2 className="text-base font-semibold text-slate-900">
            {editando ? `Editar métricas — ${fmtMes(metrica.mes)}` : 'Adicionar métricas mensais'}
          </h2>
          <button onClick={aoFechar} className="rounded p-1 text-slate-400 hover:bg-slate-100">
            <X size={18} />
          </button>
        </header>

        <form onSubmit={submeter} className="p-5 space-y-4">
          <Campo label="Mês de referência*" requerido>
            <input
              type="month" required
              value={d.mes.slice(0, 7)}
              onChange={(e) => setField('mes', e.target.value + '-01')}
              className={inputCls}
            />
            <p className="mt-1 text-xs text-slate-500">
              Salvar o mesmo mês de novo sobrescreve os valores.
            </p>
          </Campo>

          <fieldset className="rounded-lg border border-slate-200 p-3">
            <legend className="text-xs font-semibold text-slate-700 px-1">Receita</legend>
            <div className="grid grid-cols-2 gap-3">
              <Campo label="MRR (R$)">
                <input type="number" step="0.01" min="0"
                  value={d.mrr} onChange={(e) => setField('mrr', e.target.value)}
                  className={inputCls} placeholder="Ex: 25000" />
              </Campo>
              <Campo label="Receita total do mês (R$)">
                <input type="number" step="0.01" min="0"
                  value={d.receita_total} onChange={(e) => setField('receita_total', e.target.value)}
                  className={inputCls} placeholder="MRR + extras" />
              </Campo>
            </div>
          </fieldset>

          <fieldset className="rounded-lg border border-slate-200 p-3">
            <legend className="text-xs font-semibold text-slate-700 px-1">Clientes</legend>
            <div className="grid grid-cols-2 gap-3">
              <Campo label="Ativos (fim do mês)">
                <input type="number" min="0"
                  value={d.clientes_ativos} onChange={(e) => setField('clientes_ativos', e.target.value)}
                  className={inputCls} />
              </Campo>
              <Campo label="Novos (entraram no mês)">
                <input type="number" min="0"
                  value={d.novos_clientes} onChange={(e) => setField('novos_clientes', e.target.value)}
                  className={inputCls} />
              </Campo>
              <Campo label="Churn (cancelaram)">
                <input type="number" min="0"
                  value={d.churn_clientes} onChange={(e) => setField('churn_clientes', e.target.value)}
                  className={inputCls} />
              </Campo>
              <Campo label="Churn MRR (R$ perdidos)">
                <input type="number" step="0.01" min="0"
                  value={d.churn_mrr} onChange={(e) => setField('churn_mrr', e.target.value)}
                  className={inputCls} />
              </Campo>
            </div>
          </fieldset>

          <fieldset className="rounded-lg border border-slate-200 p-3">
            <legend className="text-xs font-semibold text-slate-700 px-1">Suporte</legend>
            <div className="grid grid-cols-2 gap-3">
              <Campo label="Tickets abertos no mês">
                <input type="number" min="0"
                  value={d.tickets_abertos} onChange={(e) => setField('tickets_abertos', e.target.value)}
                  className={inputCls} />
              </Campo>
              <Campo label="Tickets resolvidos no mês">
                <input type="number" min="0"
                  value={d.tickets_resolvidos} onChange={(e) => setField('tickets_resolvidos', e.target.value)}
                  className={inputCls} />
              </Campo>
            </div>
          </fieldset>

          <fieldset className="rounded-lg border border-slate-200 p-3">
            <legend className="text-xs font-semibold text-slate-700 px-1">Funil de conversão</legend>
            <div className="grid grid-cols-3 gap-3">
              <Campo label="Visitantes landing">
                <input type="number" min="0"
                  value={d.visitantes_landing} onChange={(e) => setField('visitantes_landing', e.target.value)}
                  className={inputCls} />
              </Campo>
              <Campo label="Trials iniciados">
                <input type="number" min="0"
                  value={d.trials_iniciados} onChange={(e) => setField('trials_iniciados', e.target.value)}
                  className={inputCls} />
              </Campo>
              <Campo label="Conversões">
                <input type="number" min="0"
                  value={d.conversoes} onChange={(e) => setField('conversoes', e.target.value)}
                  className={inputCls} />
              </Campo>
            </div>
          </fieldset>

          <Campo label="Observação">
            <textarea rows={2} value={d.observacao} onChange={(e) => setField('observacao', e.target.value)}
              className={inputCls} placeholder="Eventos, lançamentos, contexto..." />
          </Campo>

          {erro && (
            <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{erro}</div>
          )}

          <div className="flex justify-between gap-2 pt-2">
            {editando ? (
              <button type="button" onClick={excluir}
                className="inline-flex items-center gap-1 rounded-lg border border-red-300 bg-white px-3 py-2 text-sm font-medium text-red-700 hover:bg-red-50">
                <Trash2 size={12} /> Excluir
              </button>
            ) : <span />}
            <div className="flex gap-2">
              <button type="button" onClick={aoFechar}
                className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50">
                Cancelar
              </button>
              <button type="submit" disabled={salvando}
                className="rounded-lg bg-nexus-700 px-4 py-2 text-sm font-medium text-white hover:bg-nexus-800 disabled:opacity-50">
                {salvando ? 'Salvando...' : 'Salvar'}
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
}

// =============================================================================
// Modal: Editar cabeçalho
// =============================================================================

function ModalEditarCabecalho({ produto, aoFechar, aoSalvo }) {
  const [d, setD] = useState({
    nome: produto.nome,
    slug: produto.slug,
    descricao_curta: produto.descricao_curta || '',
    descricao_longa: produto.descricao_longa || '',
    status: produto.status,
    cor: produto.cor,
    logo_url: produto.logo_url || '',
    link_site: produto.link_site || '',
    link_app: produto.link_app || '',
    link_landing: produto.link_landing || '',
    data_lancamento: produto.data_lancamento?.slice(0, 10) || '',
    fonte_dados: produto.fonte_dados || 'manual',
  });
  const [erro, setErro] = useState('');
  const [salvando, setSalvando] = useState(false);

  function setField(k, v) { setD((s) => ({ ...s, [k]: v })); }

  async function submeter(e) {
    e.preventDefault();
    setErro('');
    setSalvando(true);
    try {
      await api.put(`/produtos/${produto.id}`, {
        ...d,
        data_lancamento: d.data_lancamento || null,
      });
      aoSalvo();
    } catch (err) {
      setErro(mensagemDeErro(err, 'Não consegui salvar.'));
      setSalvando(false);
    }
  }

  const CORES = [
    'slate', 'red', 'orange', 'amber', 'yellow', 'lime',
    'emerald', 'teal', 'cyan', 'blue', 'indigo', 'violet',
    'fuchsia', 'pink', 'rose',
  ];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4">
      <div className="w-full max-w-2xl rounded-xl bg-white shadow-xl max-h-[90vh] overflow-y-auto">
        <header className="flex items-center justify-between border-b border-slate-200 px-5 py-3 sticky top-0 bg-white">
          <h2 className="text-base font-semibold text-slate-900">Editar produto</h2>
          <button onClick={aoFechar} className="rounded p-1 text-slate-400 hover:bg-slate-100">
            <X size={18} />
          </button>
        </header>

        <form onSubmit={submeter} className="p-5 space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <Campo label="Nome*" requerido>
              <input required minLength={2} maxLength={100}
                value={d.nome} onChange={(e) => setField('nome', e.target.value)}
                className={inputCls} />
            </Campo>
            <Campo label="Slug*" requerido>
              <input required minLength={2} maxLength={80}
                pattern="[a-z0-9\-]+"
                value={d.slug} onChange={(e) => setField('slug', e.target.value.toLowerCase())}
                className={`${inputCls} font-mono`} />
            </Campo>
          </div>

          <Campo label="Descrição curta">
            <input maxLength={255}
              value={d.descricao_curta} onChange={(e) => setField('descricao_curta', e.target.value)}
              className={inputCls} />
          </Campo>

          <Campo label="Descrição longa (markdown)">
            <textarea rows={4} maxLength={20000}
              value={d.descricao_longa} onChange={(e) => setField('descricao_longa', e.target.value)}
              className={inputCls} />
          </Campo>

          <div className="grid grid-cols-3 gap-3">
            <Campo label="Status">
              <select value={d.status} onChange={(e) => setField('status', e.target.value)}
                className={inputCls}>
                {Object.entries(STATUS_PRODUTO).map(([v, info]) => (
                  <option key={v} value={v}>{info.rotulo}</option>
                ))}
              </select>
            </Campo>
            <Campo label="Lançamento">
              <input type="date" value={d.data_lancamento} onChange={(e) => setField('data_lancamento', e.target.value)}
                className={inputCls} />
            </Campo>
            <Campo label="URL do logo">
              <input type="url" value={d.logo_url} onChange={(e) => setField('logo_url', e.target.value)}
                placeholder="https://..." className={inputCls} />
            </Campo>
          </div>

          <Campo label="Cor">
            <div className="flex flex-wrap gap-1.5">
              {CORES.map((c) => (
                <button key={c} type="button" onClick={() => setField('cor', c)}
                  aria-label={c}
                  className={[
                    'h-7 w-7 rounded-full transition-all',
                    COR_BG[c],
                    d.cor === c ? 'ring-2 ring-offset-2 ring-slate-700 scale-110' : '',
                  ].join(' ')}
                />
              ))}
            </div>
          </Campo>

          <div className="grid grid-cols-3 gap-3">
            <Campo label="Site">
              <input type="url" value={d.link_site} onChange={(e) => setField('link_site', e.target.value)}
                placeholder="https://..." className={inputCls} />
            </Campo>
            <Campo label="App / Painel">
              <input type="url" value={d.link_app} onChange={(e) => setField('link_app', e.target.value)}
                placeholder="https://app..." className={inputCls} />
            </Campo>
            <Campo label="Landing">
              <input type="url" value={d.link_landing} onChange={(e) => setField('link_landing', e.target.value)}
                placeholder="https://..." className={inputCls} />
            </Campo>
          </div>

          <Campo label="Fonte de dados das métricas">
            <select value={d.fonte_dados} onChange={(e) => setField('fonte_dados', e.target.value)}
              className={inputCls}>
              <option value="manual">Manual (admin atualiza pela UI)</option>
              <option value="seu_cartorio">Seu Cartório (sync automático via API)</option>
            </select>
            <p className="mt-1 text-xs text-slate-500">
              Sync automático exige que o servidor esteja com SEU_CARTORIO_URL e
              SEU_CARTORIO_API_KEY configuradas.
            </p>
          </Campo>

          {erro && (
            <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{erro}</div>
          )}

          <div className="flex justify-end gap-2 pt-2">
            <button type="button" onClick={aoFechar}
              className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50">
              Cancelar
            </button>
            <button type="submit" disabled={salvando}
              className="rounded-lg bg-nexus-700 px-4 py-2 text-sm font-medium text-white hover:bg-nexus-800 disabled:opacity-50">
              {salvando ? 'Salvando...' : 'Salvar'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// =============================================================================
// Helpers visuais
// =============================================================================

const inputCls = 'w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm shadow-sm outline-none focus:border-nexus-500 focus:ring-2 focus:ring-nexus-200';

function Campo({ label, requerido, children }) {
  return (
    <div>
      <label className="block text-sm font-medium text-slate-900 mb-1">
        {label.replace('*', '')}
        {requerido && <span className="text-red-600 ml-0.5">*</span>}
      </label>
      {children}
    </div>
  );
}
