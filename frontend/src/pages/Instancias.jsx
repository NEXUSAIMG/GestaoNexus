import { useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  Activity, Clock, ExternalLink, Search, X, AlertTriangle,
  Filter, User, Workflow, CheckCircle2, Ban,
} from 'lucide-react';
import { api, mensagemDeErro } from '../api/client.js';
import { useAuth } from '../context/AuthContext.jsx';

/**
 * Instâncias em andamento — Sprint 22 (item 3 da spec).
 *
 * Dashboard cross-processo das execuções de workflow. Cobre:
 *   (a) "Minhas instâncias" — toggle no topo
 *   (b) Filtros por processo, responsável, status, busca
 *   (d) Alerta visual de instâncias paradas há ≥ 7 dias
 */

const STATUS_INFO = {
  em_andamento: { rotulo: 'Em andamento', cor: 'bg-amber-100 text-amber-800',  icone: Clock },
  concluida:    { rotulo: 'Concluída',    cor: 'bg-emerald-100 text-emerald-800', icone: CheckCircle2 },
  cancelada:    { rotulo: 'Cancelada',    cor: 'bg-slate-100 text-slate-700', icone: Ban },
};

function iniciais(nome) {
  return (nome || '?').split(' ').filter(Boolean).slice(0, 2).map((p) => p[0]?.toUpperCase()).join('');
}

function formatarDataHora(iso) {
  if (!iso) return '—';
  return new Date(iso).toLocaleString('pt-BR', {
    day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit',
  });
}

export default function Instancias() {
  const { pessoa } = useAuth();

  const [instancias, setInstancias] = useState([]);
  const [processos, setProcessos] = useState([]);
  const [pessoas, setPessoas] = useState([]);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState('');

  // Sprint 28 — gate de versão pra resolver race condition entre múltiplos
  // carregar() em paralelo. Como o useEffect dispara carregar() a cada
  // mudança de filtro (incluindo digitação no campo busca), múltiplos
  // requests podem voar em paralelo. O response mais recente sempre vence.
  const carregaIdRef = useRef(0);

  // Filtros
  const [meu, setMeu] = useState(true); // default: só minhas
  const [busca, setBusca] = useState('');
  // Sprint 29 — debounce isolado do campo busca (350ms). Selects disparam
  // imediato (não passam por aqui). Reduz N requests durante digitação.
  const [buscaDebounced, setBuscaDebounced] = useState('');
  const [processoId, setProcessoId] = useState('');
  const [responsavelId, setResponsavelId] = useState('');
  const [statusFiltro, setStatusFiltro] = useState('em_andamento');
  const [soParadas, setSoParadas] = useState(false);

  // Carrega processos e pessoas uma vez (pra preencher selects)
  useEffect(() => {
    api.get('/processos')
      .then((r) => setProcessos(r.data || []))
      .catch(() => {});
    api.get('/pessoas')
      .then((r) => setPessoas((r.data || []).filter((p) => p.ativo)))
      .catch(() => {});
  }, []);

  async function carregar() {
    const meuId = ++carregaIdRef.current;
    setCarregando(true);
    setErro('');
    try {
      const params = { status: statusFiltro };
      if (meu) params.meu = 'true';
      if (buscaDebounced.trim()) params.busca = buscaDebounced.trim();
      if (processoId) params.processo_id = processoId;
      if (responsavelId) params.responsavel_id = responsavelId;
      if (soParadas) params.paradas_dias = 7;
      const r = await api.get('/instancias', { params });
      // Descarta response se outro carregar() começou enquanto este esperava.
      if (meuId !== carregaIdRef.current) return;
      setInstancias(r.data || []);
    } catch (err) {
      if (meuId === carregaIdRef.current) {
        setErro(mensagemDeErro(err, 'Não consegui carregar as instâncias.'));
      }
    } finally {
      if (meuId === carregaIdRef.current) {
        setCarregando(false);
      }
    }
  }

  useEffect(() => {
    const id = setTimeout(() => setBuscaDebounced(busca), 350);
    return () => clearTimeout(id);
  }, [busca]);

  useEffect(() => {
    carregar();
    // eslint-disable-next-line
  }, [meu, buscaDebounced, processoId, responsavelId, statusFiltro, soParadas]);

  // Estatísticas do topo (calculadas sobre o resultado atual)
  const stats = useMemo(() => {
    return instancias.reduce((acc, i) => {
      if (i.status === 'em_andamento') acc.em_andamento += 1;
      if (i.parada) acc.paradas += 1;
      return acc;
    }, { em_andamento: 0, paradas: 0 });
  }, [instancias]);

  const algumFiltroExtra = busca || processoId || responsavelId || soParadas || statusFiltro !== 'em_andamento';

  return (
    <div className="space-y-4">
      <div>
        <div className="flex items-center gap-2">
          <Activity size={22} className="text-nexus-700" />
          <h1 className="text-xl font-semibold text-slate-900">Instâncias em andamento</h1>
        </div>
        <p className="mt-1 text-sm text-slate-600">
          Execuções de processos da empresa — minhas e da equipe. Use os filtros pra encontrar instâncias paradas, do seu time ou de um processo específico.
        </p>
      </div>

      {/* Cards de estatística */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <CardStat
          rotulo={meu ? 'Minhas em andamento' : 'Em andamento (visíveis)'}
          valor={stats.em_andamento}
          icone={<Clock size={16} className="text-amber-600" />}
          cor="border-amber-200 bg-amber-50/40"
        />
        <CardStat
          rotulo="Paradas há 7+ dias"
          valor={stats.paradas}
          icone={<AlertTriangle size={16} className="text-red-600" />}
          cor="border-red-200 bg-red-50/40"
          destacar={stats.paradas > 0}
          onClick={() => stats.paradas > 0 && setSoParadas(true)}
        />
        <CardStat
          rotulo="Total exibido"
          valor={instancias.length}
          icone={<Activity size={16} className="text-slate-600" />}
          cor="border-slate-200 bg-slate-50/40"
        />
      </div>

      {/* Filtros */}
      <div className="rounded-lg border border-slate-200 bg-white p-3 space-y-2">
        <div className="flex flex-wrap items-center gap-2">
          {/* Toggle "Minhas" */}
          <div className="inline-flex rounded-lg border border-slate-300 bg-slate-50 p-0.5">
            <button type="button" onClick={() => setMeu(true)}
              className={[
                'rounded-md px-3 py-1 text-xs font-medium',
                meu ? 'bg-white text-nexus-800 shadow-sm' : 'text-slate-600 hover:bg-white/60',
              ].join(' ')}
            >
              Minhas
            </button>
            <button type="button" onClick={() => setMeu(false)}
              className={[
                'rounded-md px-3 py-1 text-xs font-medium',
                !meu ? 'bg-white text-nexus-800 shadow-sm' : 'text-slate-600 hover:bg-white/60',
              ].join(' ')}
            >
              Todas que vejo
            </button>
          </div>

          <div className="relative flex-1 min-w-[180px]">
            <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              placeholder="Buscar por nome da instância ou processo…"
              value={busca}
              onChange={(e) => setBusca(e.target.value)}
              className="w-full rounded-md border border-slate-300 bg-white pl-8 pr-3 py-1.5 text-sm outline-none focus:border-nexus-500 focus:ring-2 focus:ring-nexus-200"
            />
          </div>

          {algumFiltroExtra && (
            <button
              type="button"
              onClick={() => {
                setBusca(''); setProcessoId(''); setResponsavelId('');
                setStatusFiltro('em_andamento'); setSoParadas(false);
              }}
              className="inline-flex items-center gap-1 rounded p-1 text-xs text-slate-500 hover:bg-slate-100 hover:text-slate-700"
              title="Limpar filtros"
            >
              <X size={12} /> Limpar
            </button>
          )}
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <div className="inline-flex items-center gap-1 text-[10px] uppercase tracking-wider font-semibold text-slate-500">
            <Filter size={11} /> Filtros
          </div>

          <select
            className="rounded-md border border-slate-300 bg-white px-2 py-1 text-xs text-slate-700"
            value={statusFiltro}
            onChange={(e) => setStatusFiltro(e.target.value)}
          >
            <option value="em_andamento">Em andamento</option>
            <option value="concluida">Concluídas</option>
            <option value="cancelada">Canceladas</option>
            <option value="todas">Todos os status</option>
          </select>

          <select
            className="rounded-md border border-slate-300 bg-white px-2 py-1 text-xs text-slate-700"
            value={processoId}
            onChange={(e) => setProcessoId(e.target.value)}
          >
            <option value="">Todos os processos</option>
            {processos.map((p) => (<option key={p.id} value={p.id}>{p.nome}</option>))}
          </select>

          <select
            className="rounded-md border border-slate-300 bg-white px-2 py-1 text-xs text-slate-700"
            value={responsavelId}
            onChange={(e) => setResponsavelId(e.target.value)}
          >
            <option value="">Qualquer responsável</option>
            {pessoas.map((p) => (<option key={p.id} value={p.id}>{p.nome}</option>))}
          </select>

          <label className="inline-flex items-center gap-1.5 text-xs text-slate-700 cursor-pointer ml-2">
            <input
              type="checkbox"
              checked={soParadas}
              onChange={(e) => setSoParadas(e.target.checked)}
            />
            Só paradas há 7+ dias
          </label>
        </div>
      </div>

      {erro && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{erro}</div>
      )}

      {carregando ? (
        <div className="py-8 text-center text-sm text-slate-500">Carregando…</div>
      ) : instancias.length === 0 ? (
        <div className="rounded-xl border border-dashed border-slate-300 bg-white py-12 text-center">
          <Workflow size={32} className="mx-auto text-slate-300" />
          <p className="mt-2 text-sm font-medium text-slate-700">
            {algumFiltroExtra || !meu
              ? 'Nenhuma instância com esses filtros.'
              : 'Você não tem instâncias em andamento.'}
          </p>
          <p className="mt-1 text-xs text-slate-500">
            {meu && !algumFiltroExtra
              ? 'Você verá aqui as instâncias que você iniciou ou onde é responsável por algum card ativo.'
              : ''}
          </p>
        </div>
      ) : (
        <ul className="space-y-2">
          {instancias.map((i) => (
            <CardInstancia key={i.id} i={i} pessoaLogadaId={pessoa?.id} />
          ))}
        </ul>
      )}
    </div>
  );
}

// =============================================================================
// Card de estatística
// =============================================================================

function CardStat({ rotulo, valor, icone, cor, destacar, onClick }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={!onClick || !destacar}
      className={[
        'rounded-lg border p-3 text-left transition-colors',
        cor,
        destacar && onClick ? 'cursor-pointer hover:shadow-sm' : 'cursor-default',
      ].join(' ')}
    >
      <div className="flex items-center gap-2">
        {icone}
        <span className="text-xs font-medium text-slate-700">{rotulo}</span>
      </div>
      <div className="mt-1 text-2xl font-semibold tabular-nums text-slate-900">{valor}</div>
    </button>
  );
}

// =============================================================================
// Card de uma instância
// =============================================================================

function CardInstancia({ i, pessoaLogadaId }) {
  const status = STATUS_INFO[i.status] || STATUS_INFO.em_andamento;
  const Icone = status.icone;
  const pct = i.total_nos > 0 ? Math.round((i.nos_concluidos / i.total_nos) * 100) : 0;
  const responsaveis = i.responsaveis_ativos || [];

  return (
    <li className={[
      'rounded-xl border bg-white p-3 shadow-sm transition-colors',
      i.parada ? 'border-red-300 bg-red-50/30' : 'border-slate-200',
    ].join(' ')}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex-1 min-w-0">
          {/* Nome do processo + nome da instância */}
          <div className="flex items-center gap-2 flex-wrap">
            <Link to={`/processos/${i.processo_id}`}
              className="inline-flex items-center gap-1 text-[11px] font-medium text-nexus-700 hover:text-nexus-800 hover:underline">
              <Workflow size={11} /> {i.processo_nome}
            </Link>
            <span className="text-slate-300">·</span>
            <span className={`inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[10px] font-medium uppercase ${status.cor}`}>
              <Icone size={10} /> {status.rotulo}
            </span>
            {i.parada && (
              <span className="inline-flex items-center gap-1 rounded border border-red-300 bg-red-100 px-1.5 py-0.5 text-[10px] font-semibold text-red-800">
                <AlertTriangle size={10} />
                Parada há {i.dias_sem_movimentacao} dia{i.dias_sem_movimentacao === 1 ? '' : 's'}
              </span>
            )}
          </div>

          <h3 className="mt-1.5 text-sm font-semibold text-slate-900 break-words">{i.nome}</h3>
          {i.descricao && (
            <p className="mt-0.5 text-xs text-slate-600 line-clamp-2">{i.descricao}</p>
          )}

          {/* Metadados */}
          <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-slate-500">
            <span>Iniciada em {formatarDataHora(i.iniciada_em)}</span>
            {i.iniciada_por_nome && (
              <span className="inline-flex items-center gap-0.5">
                <User size={9} /> {i.iniciada_por_nome}
                {i.iniciada_por_id === pessoaLogadaId && (
                  <span className="ml-0.5 text-[9px] font-semibold text-nexus-700">(você)</span>
                )}
              </span>
            )}
          </div>

          {/* Barra de progresso */}
          <div className="mt-2 flex items-center gap-2">
            <div className="flex-1 max-w-[300px] h-1.5 rounded-full bg-slate-100 overflow-hidden">
              <div
                className={[
                  'h-full transition-all',
                  i.status === 'concluida' ? 'bg-emerald-500' :
                  i.parada ? 'bg-red-500' : 'bg-nexus-600',
                ].join(' ')}
                style={{ width: `${pct}%` }}
              />
            </div>
            <span className="text-[11px] text-slate-600 tabular-nums">
              {i.nos_concluidos}/{i.total_nos}
              {i.nos_ativos > 0 && (
                <span className={i.parada ? 'text-red-700' : 'text-amber-700'}>
                  {' · '}{i.nos_ativos} ativo{i.nos_ativos === 1 ? '' : 's'}
                </span>
              )}
            </span>
          </div>

          {/* Responsáveis ativos */}
          {responsaveis.length > 0 && (
            <div className="mt-2 flex items-center gap-2">
              <span className="text-[10px] uppercase tracking-wider font-semibold text-slate-500">
                Responsáveis ativos:
              </span>
              <div className="flex -space-x-1.5" title={responsaveis.map((r) => r.nome).join(', ')}>
                {responsaveis.slice(0, 5).map((r) => (
                  <span
                    key={r.id}
                    className={[
                      'inline-flex h-6 w-6 items-center justify-center rounded-full text-[10px] font-semibold ring-1 ring-white',
                      r.id === pessoaLogadaId
                        ? 'bg-nexus-700 text-white'
                        : 'bg-nexus-100 text-nexus-800',
                    ].join(' ')}
                    title={r.nome}
                  >
                    {iniciais(r.nome)}
                  </span>
                ))}
                {responsaveis.length > 5 && (
                  <span className="inline-flex h-6 w-6 items-center justify-center rounded-full bg-slate-200 text-[10px] font-semibold text-slate-700 ring-1 ring-white">
                    +{responsaveis.length - 5}
                  </span>
                )}
              </div>
            </div>
          )}
        </div>

        <div className="flex flex-col items-end gap-1 shrink-0">
          <Link
            to={`/tarefas/${i.quadro_id}`}
            className="inline-flex items-center gap-1 rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50"
          >
            <ExternalLink size={11} /> Abrir quadro
          </Link>
          <Link
            to={`/processos/${i.processo_id}/instancias`}
            className="text-[10px] text-slate-400 hover:text-nexus-700 hover:underline"
          >
            ver todas
          </Link>
        </div>
      </div>
    </li>
  );
}
