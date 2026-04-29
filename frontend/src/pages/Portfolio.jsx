import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  Package, Plus, ExternalLink, Users, TrendingUp, TrendingDown,
  Minus, Archive, AlertCircle, X,
} from 'lucide-react';
import { api, mensagemDeErro } from '../api/client.js';
import { useAuth } from '../context/AuthContext.jsx';

/**
 * Portfólio de produtos da Nexus — Sprint 16.
 *
 * Lista todos os produtos como cards. Cada card mostra:
 *   - Logo + nome + status
 *   - MRR atual + delta vs mês anterior
 *   - Clientes ativos
 *   - Mini-sparkline de MRR dos últimos 6 meses
 *
 * Admin pode criar/arquivar. Sócios só veem.
 */

const STATUS_INFO = {
  em_desenvolvimento: { rotulo: 'Em desenvolvimento', cor: 'bg-amber-100 text-amber-800' },
  beta:               { rotulo: 'Beta',                cor: 'bg-violet-100 text-violet-800' },
  ativo:              { rotulo: 'Ativo',               cor: 'bg-emerald-100 text-emerald-800' },
  descontinuado:      { rotulo: 'Descontinuado',       cor: 'bg-slate-100 text-slate-600' },
};

const COR_BORDA = {
  slate: 'border-slate-300', red: 'border-red-300', orange: 'border-orange-300',
  amber: 'border-amber-300', yellow: 'border-yellow-300', lime: 'border-lime-300',
  emerald: 'border-emerald-300', teal: 'border-teal-300', cyan: 'border-cyan-300',
  blue: 'border-blue-300', indigo: 'border-indigo-300', violet: 'border-violet-300',
  fuchsia: 'border-fuchsia-300', pink: 'border-pink-300', rose: 'border-rose-300',
};

const COR_BG = {
  slate: 'bg-slate-500', red: 'bg-red-500', orange: 'bg-orange-500',
  amber: 'bg-amber-500', yellow: 'bg-yellow-500', lime: 'bg-lime-500',
  emerald: 'bg-emerald-500', teal: 'bg-teal-500', cyan: 'bg-cyan-500',
  blue: 'bg-blue-500', indigo: 'bg-indigo-500', violet: 'bg-violet-500',
  fuchsia: 'bg-fuchsia-500', pink: 'bg-pink-500', rose: 'bg-rose-500',
};

function fmtBRL(n) {
  return Number(n || 0).toLocaleString('pt-BR', {
    style: 'currency',
    currency: 'BRL',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  });
}

function fmtMes(iso) {
  if (!iso) return '—';
  const d = new Date(`${String(iso).slice(0, 10)}T12:00:00`);
  return d.toLocaleDateString('pt-BR', { month: 'short', year: '2-digit' });
}

/**
 * Calcula delta percentual entre o último e o penúltimo ponto da série.
 */
function calcDelta(serie) {
  if (!Array.isArray(serie) || serie.length < 2) return null;
  const ord = [...serie].sort((a, b) => a.mes < b.mes ? -1 : 1);
  const ultimo = Number(ord[ord.length - 1]?.mrr || 0);
  const penult = Number(ord[ord.length - 2]?.mrr || 0);
  if (penult === 0) return ultimo > 0 ? 100 : 0;
  return ((ultimo - penult) / penult) * 100;
}

/**
 * SVG sparkline simples — usa apenas SVG puro (sem libs).
 */
function Sparkline({ serie, cor = 'blue' }) {
  if (!Array.isArray(serie) || serie.length < 2) {
    return <div className="h-10 flex items-end justify-center text-xs text-slate-400">sem histórico</div>;
  }
  const ord = [...serie].sort((a, b) => a.mes < b.mes ? -1 : 1);
  const valores = ord.map((p) => Number(p.mrr || 0));
  const max = Math.max(...valores, 1);
  const min = Math.min(...valores, 0);
  const range = max - min || 1;
  const W = 120, H = 40, PAD = 2;
  const pontos = valores.map((v, i) => {
    const x = PAD + (i * (W - PAD * 2)) / (valores.length - 1);
    const y = PAD + (1 - (v - min) / range) * (H - PAD * 2);
    return [x, y];
  });
  const path = pontos.map(([x, y], i) => `${i === 0 ? 'M' : 'L'}${x.toFixed(1)},${y.toFixed(1)}`).join(' ');
  const corStroke = {
    slate: '#64748b', red: '#ef4444', orange: '#f97316', amber: '#f59e0b',
    yellow: '#eab308', lime: '#84cc16', emerald: '#10b981', teal: '#14b8a6',
    cyan: '#06b6d4', blue: '#3b82f6', indigo: '#6366f1', violet: '#8b5cf6',
    fuchsia: '#d946ef', pink: '#ec4899', rose: '#f43f5e',
  }[cor] || '#3b82f6';
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="h-10 w-full">
      <path d={path} fill="none" stroke={corStroke} strokeWidth="1.5" />
      {pontos.map(([x, y], i) => (
        <circle key={i} cx={x} cy={y} r={i === pontos.length - 1 ? 2.5 : 1.5}
          fill={corStroke} />
      ))}
    </svg>
  );
}

export default function Portfolio() {
  const { pessoa } = useAuth();
  const souAdmin = !!pessoa?.administrador;

  const [produtos, setProdutos] = useState([]);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState('');
  const [filtroStatus, setFiltroStatus] = useState('');
  const [modalNovo, setModalNovo] = useState(false);

  async function carregar() {
    setCarregando(true);
    setErro('');
    try {
      const params = filtroStatus ? `?status=${filtroStatus}` : '';
      const r = await api.get(`/produtos${params}`);
      setProdutos(r.data);
    } catch (err) {
      setErro(mensagemDeErro(err, 'Não consegui carregar.'));
    } finally {
      setCarregando(false);
    }
  }

  useEffect(() => { carregar(); /* eslint-disable-next-line */ }, [filtroStatus]);

  // Agregados gerais
  const totalMRR = produtos.reduce((s, p) => s + Number(p.mrr_atual || 0), 0);
  const totalClientes = produtos.reduce((s, p) => s + Number(p.clientes_atual || 0), 0);
  const totalReceita = produtos.reduce((s, p) => s + Number(p.receita_mes_atual || 0), 0);
  const qtdAtivos = produtos.filter((p) => p.status === 'ativo').length;

  return (
    <div className="max-w-7xl">
      <header className="mb-6 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold text-slate-900 inline-flex items-center gap-2">
            <Package size={22} className="text-nexus-700" /> Portfólio de produtos
          </h1>
          <p className="mt-1 text-sm text-slate-600">
            Visão consolidada dos produtos da Nexus — receita, clientes, evolução.
          </p>
        </div>

        {souAdmin && (
          <button
            type="button" onClick={() => setModalNovo(true)}
            className="inline-flex items-center gap-1.5 rounded-lg bg-nexus-700 px-3 py-2 text-sm font-medium text-white hover:bg-nexus-800"
          >
            <Plus size={14} /> Novo produto
          </button>
        )}
      </header>

      {/* KPIs do portfólio */}
      {!carregando && produtos.length > 0 && (
        <div className="mb-6 grid grid-cols-2 lg:grid-cols-4 gap-3">
          <Kpi titulo="MRR consolidado" valor={fmtBRL(totalMRR)}
            descricao="Receita recorrente mensal somada" />
          <Kpi titulo="Receita do mês" valor={fmtBRL(totalReceita)}
            descricao="Total faturado neste mês" />
          <Kpi titulo="Clientes ativos" valor={totalClientes.toLocaleString('pt-BR')}
            descricao="Soma entre todos os produtos" />
          <Kpi titulo="Produtos ativos" valor={`${qtdAtivos}/${produtos.length}`}
            descricao="Em produção atualmente" />
        </div>
      )}

      {/* Filtro de status */}
      <div className="mb-4 flex items-center gap-1 rounded-lg border border-slate-200 bg-slate-50 p-1 inline-flex">
        {[
          { v: '', r: 'Todos' },
          { v: 'ativo', r: 'Ativos' },
          { v: 'beta', r: 'Beta' },
          { v: 'em_desenvolvimento', r: 'Em desenvolvimento' },
          { v: 'descontinuado', r: 'Descontinuados' },
        ].map((o) => (
          <button
            key={o.v}
            type="button"
            onClick={() => setFiltroStatus(o.v)}
            className={[
              'rounded-md px-3 py-1 text-xs font-medium transition-colors',
              filtroStatus === o.v
                ? 'bg-white text-nexus-800 shadow-sm'
                : 'text-slate-600 hover:bg-slate-100',
            ].join(' ')}
          >
            {o.r}
          </button>
        ))}
      </div>

      {erro && (
        <div className="mb-4 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700 inline-flex items-center gap-2">
          <AlertCircle size={14} /> {erro}
        </div>
      )}

      {carregando && (
        <div className="rounded-xl border border-slate-200 bg-white p-8 text-center text-sm text-slate-500">
          Carregando portfólio...
        </div>
      )}

      {!carregando && produtos.length === 0 && (
        <div className="rounded-xl border border-dashed border-slate-300 bg-white p-10 text-center">
          <Package size={28} className="mx-auto text-slate-300 mb-3" />
          <h2 className="text-base font-medium text-slate-900">Nenhum produto cadastrado</h2>
          {souAdmin && (
            <p className="mt-1 text-sm text-slate-600">
              Clique em <strong>"Novo produto"</strong> pra começar.
            </p>
          )}
        </div>
      )}

      {!carregando && produtos.length > 0 && (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {produtos.map((p) => (
            <CardProduto key={p.id} produto={p} />
          ))}
        </div>
      )}

      {modalNovo && (
        <ModalNovoProduto
          aoFechar={() => setModalNovo(false)}
          aoCriado={(p) => { setModalNovo(false); carregar(); }}
        />
      )}
    </div>
  );
}

// =============================================================================
// KPI
// =============================================================================

function Kpi({ titulo, valor, descricao }) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-3 shadow-sm">
      <div className="text-[10px] uppercase tracking-wide text-slate-500 font-medium">
        {titulo}
      </div>
      <div className="mt-1 text-2xl font-semibold text-slate-900 tabular-nums">{valor}</div>
      {descricao && <div className="mt-0.5 text-[11px] text-slate-500">{descricao}</div>}
    </div>
  );
}

// =============================================================================
// Card de produto
// =============================================================================

function CardProduto({ produto }) {
  const status = STATUS_INFO[produto.status] || STATUS_INFO.ativo;
  const delta = calcDelta(produto.serie_mrr);
  const arquivado = !!produto.arquivado_em;

  return (
    <Link
      to={`/portfolio/${produto.id}`}
      className={[
        'block rounded-xl border-2 bg-white p-4 shadow-sm hover:shadow-md transition-shadow',
        COR_BORDA[produto.cor] || 'border-slate-300',
        arquivado ? 'opacity-50' : '',
      ].join(' ')}
    >
      {/* Header com logo (se houver) e nome */}
      <div className="flex items-start gap-3 mb-3">
        {produto.logo_url ? (
          <img
            src={produto.logo_url}
            alt={produto.nome}
            className="h-10 w-10 rounded object-contain bg-slate-50 border border-slate-100"
          />
        ) : (
          <div className={`h-10 w-10 rounded flex items-center justify-center text-white font-bold text-sm ${COR_BG[produto.cor] || 'bg-blue-500'}`}>
            {produto.nome.split(' ').map((w) => w[0]).slice(0, 2).join('').toUpperCase()}
          </div>
        )}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <h3 className="font-semibold text-slate-900 truncate">{produto.nome}</h3>
            {arquivado && <Archive size={12} className="text-slate-400" />}
          </div>
          <div className="mt-0.5 flex items-center gap-1 flex-wrap">
            <span className={`inline-flex items-center rounded px-1.5 py-0.5 text-[10px] font-medium uppercase ${status.cor}`}>
              {status.rotulo}
            </span>
            {produto.equipe_nome && (
              <span className="text-[11px] text-slate-500">· {produto.equipe_nome}</span>
            )}
          </div>
        </div>
      </div>

      {/* Descrição curta */}
      {produto.descricao_curta && (
        <p className="mb-3 text-sm text-slate-600 line-clamp-2">
          {produto.descricao_curta}
        </p>
      )}

      {/* Métricas + sparkline */}
      <div className="grid grid-cols-2 gap-3 mb-3">
        <div>
          <div className="text-[10px] uppercase text-slate-500 font-medium">MRR</div>
          <div className="flex items-baseline gap-1">
            <span className="text-lg font-semibold text-slate-900 tabular-nums">
              {fmtBRL(produto.mrr_atual)}
            </span>
            {delta != null && (
              <span className={`text-[11px] inline-flex items-center gap-0.5 ${
                delta > 0 ? 'text-emerald-700' : delta < 0 ? 'text-red-700' : 'text-slate-500'
              }`}>
                {delta > 0 ? <TrendingUp size={10} /> :
                 delta < 0 ? <TrendingDown size={10} /> : <Minus size={10} />}
                {Math.abs(delta).toFixed(0)}%
              </span>
            )}
          </div>
          {produto.ultima_metrica_em && (
            <div className="text-[10px] text-slate-400">
              em {fmtMes(produto.ultima_metrica_em)}
            </div>
          )}
        </div>
        <div>
          <div className="text-[10px] uppercase text-slate-500 font-medium">Clientes</div>
          <div className="text-lg font-semibold text-slate-900 tabular-nums inline-flex items-center gap-1">
            <Users size={13} className="text-slate-400" />
            {produto.clientes_atual?.toLocaleString('pt-BR') || 0}
          </div>
          {produto.novos_mes_atual > 0 && (
            <div className="text-[10px] text-emerald-700">
              +{produto.novos_mes_atual} novos
            </div>
          )}
        </div>
      </div>

      <div className="border-t border-slate-100 pt-2">
        <div className="text-[10px] uppercase text-slate-400 font-medium mb-1">
          MRR (6 meses)
        </div>
        <Sparkline serie={produto.serie_mrr} cor={produto.cor} />
      </div>

      {/* Links externos */}
      {(produto.link_site || produto.link_app) && (
        <div className="mt-2 flex gap-2 text-[11px]">
          {produto.link_site && (
            <span
              onClick={(e) => { e.preventDefault(); window.open(produto.link_site, '_blank'); }}
              className="inline-flex items-center gap-0.5 text-nexus-700 hover:text-nexus-800"
            >
              <ExternalLink size={9} /> site
            </span>
          )}
          {produto.link_app && (
            <span
              onClick={(e) => { e.preventDefault(); window.open(produto.link_app, '_blank'); }}
              className="inline-flex items-center gap-0.5 text-nexus-700 hover:text-nexus-800"
            >
              <ExternalLink size={9} /> app
            </span>
          )}
        </div>
      )}
    </Link>
  );
}

// =============================================================================
// Modal: novo produto
// =============================================================================

function ModalNovoProduto({ aoFechar, aoCriado }) {
  const [nome, setNome] = useState('');
  const [slug, setSlug] = useState('');
  const [descricaoCurta, setDescricaoCurta] = useState('');
  const [status, setStatus] = useState('ativo');
  const [cor, setCor] = useState('blue');
  const [linkSite, setLinkSite] = useState('');
  const [erro, setErro] = useState('');
  const [salvando, setSalvando] = useState(false);

  // Auto-gera slug a partir do nome
  function aoMudarNome(v) {
    setNome(v);
    if (!slug || slug === gerarSlug(nome)) {
      setSlug(gerarSlug(v));
    }
  }
  function gerarSlug(s) {
    return s.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
  }

  async function submeter(e) {
    e.preventDefault();
    setErro('');
    setSalvando(true);
    try {
      const r = await api.post('/produtos', {
        nome: nome.trim(),
        slug: slug.trim(),
        descricao_curta: descricaoCurta.trim() || null,
        status,
        cor,
        link_site: linkSite.trim() || null,
      });
      aoCriado(r.data);
    } catch (err) {
      setErro(mensagemDeErro(err, 'Não consegui criar.'));
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
      <div className="w-full max-w-lg rounded-xl bg-white shadow-xl">
        <header className="flex items-center justify-between border-b border-slate-200 px-5 py-3">
          <h2 className="text-base font-semibold text-slate-900">Novo produto</h2>
          <button onClick={aoFechar} className="rounded p-1 text-slate-400 hover:bg-slate-100">
            <X size={18} />
          </button>
        </header>

        <form onSubmit={submeter} className="p-5 space-y-3">
          <div>
            <label className="block text-sm font-medium text-slate-900 mb-1">
              Nome <span className="text-red-600">*</span>
            </label>
            <input
              required minLength={2} maxLength={100}
              value={nome} onChange={(e) => aoMudarNome(e.target.value)}
              placeholder="Ex: Seu Cartório, Outro Produto"
              autoFocus
              className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm shadow-sm outline-none focus:border-nexus-500 focus:ring-2 focus:ring-nexus-200"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-900 mb-1">
              Identificador (slug) <span className="text-red-600">*</span>
            </label>
            <input
              required minLength={2} maxLength={80}
              value={slug} onChange={(e) => setSlug(e.target.value.toLowerCase())}
              pattern="[a-z0-9\-]+"
              placeholder="seu-cartorio"
              className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm shadow-sm outline-none focus:border-nexus-500 focus:ring-2 focus:ring-nexus-200 font-mono"
            />
            <p className="mt-1 text-xs text-slate-500">
              Letras minúsculas, números e hífens. Usado em URLs no futuro.
            </p>
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-900 mb-1">Descrição curta</label>
            <input
              maxLength={255}
              value={descricaoCurta} onChange={(e) => setDescricaoCurta(e.target.value)}
              placeholder="Uma frase pra aparecer no card"
              className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm shadow-sm outline-none focus:border-nexus-500 focus:ring-2 focus:ring-nexus-200"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-medium text-slate-900 mb-1">Status</label>
              <select
                value={status} onChange={(e) => setStatus(e.target.value)}
                className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm shadow-sm outline-none focus:border-nexus-500 focus:ring-2 focus:ring-nexus-200"
              >
                <option value="em_desenvolvimento">Em desenvolvimento</option>
                <option value="beta">Beta</option>
                <option value="ativo">Ativo</option>
                <option value="descontinuado">Descontinuado</option>
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-900 mb-1">Site (opcional)</label>
              <input
                type="url"
                value={linkSite} onChange={(e) => setLinkSite(e.target.value)}
                placeholder="https://..."
                className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm shadow-sm outline-none focus:border-nexus-500 focus:ring-2 focus:ring-nexus-200"
              />
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-900 mb-1">Cor</label>
            <div className="flex flex-wrap gap-1.5">
              {CORES.map((c) => (
                <button
                  key={c} type="button" onClick={() => setCor(c)}
                  aria-label={c}
                  className={[
                    'h-7 w-7 rounded-full transition-all',
                    COR_BG[c],
                    cor === c ? 'ring-2 ring-offset-2 ring-slate-700 scale-110' : '',
                  ].join(' ')}
                />
              ))}
            </div>
          </div>

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
              {salvando ? 'Criando...' : 'Criar produto'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
