import { useEffect, useMemo, useRef, useState } from 'react';
import { useParams, useSearchParams, Link } from 'react-router-dom';
import {
  ArrowLeft, Globe, Lock, Users2, Calendar, Settings, KanbanSquare, Gauge, X,
  BarChart3,
} from 'lucide-react';
import {
  DndContext, DragOverlay, PointerSensor, useSensor, useSensors, rectIntersection,
} from '@dnd-kit/core';
import { SortableContext, horizontalListSortingStrategy } from '@dnd-kit/sortable';
import { api, mensagemDeErro } from '../api/client.js';
import QuadroCalendario from '../components/QuadroCalendario.jsx';
import Card from '../components/quadro/Card.jsx';
import Coluna, { BotaoNovaColuna } from '../components/quadro/Coluna.jsx';
import FiltroBar from '../components/quadro/FiltroBar.jsx';
import ModalCard from '../components/quadro/ModalCard.jsx';
import ModalConfigQuadro from '../components/quadro/ModalConfigQuadro.jsx';
import ModalBloqueadores from '../components/quadro/ModalBloqueadores.jsx';
import { HeaderInstancia, ModalEscolherSaida } from '../components/quadro/Instancia.jsx';
import Metricas from '../components/quadro/Metricas.jsx';
import { moverCardLocal } from '../components/quadro/ui.js';
import { useAuth } from '../context/AuthContext.jsx';

/**
 * Quadro (board).
 *
 * Sprint 34 — esta página era um arquivo de 1.7k linhas com 9 componentes
 * dentro. Agora ela só ORQUESTRA: estado, drag & drop, filtros e modais.
 * Cada peça mora em components/quadro/.
 *
 * Drag & drop:
 *   - card entre colunas → muda coluna_id + ordem
 *   - card dentro da coluna → reordena
 *   - coluna → reordena (Sprint 19)
 *
 * Estado otimista: mexe local primeiro, faz request, recarrega no sucesso
 * pra pegar a ordem real do servidor (evita drift entre clientes).
 *
 * Gate de dependência (Sprint 34): se o backend responder 409, a gente NÃO
 * desfaz silenciosamente — mostra quem bloqueia e deixa a pessoa forçar.
 */
export default function Quadro() {
  const { id } = useParams();
  const [searchParams, setSearchParams] = useSearchParams();
  const { pessoa } = useAuth();
  const ehAdmin = !!pessoa?.administrador;

  const [quadro, setQuadro] = useState(null);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState('');
  const [cartoriosDoQuadro, setCartoriosDoQuadro] = useState([]);

  // Gate de versão: descarta o response de um carregar() antigo que chegou
  // depois de um mais novo (bug clássico "o card volta ao estado anterior").
  const carregaIdRef = useRef(0);

  // Filtros
  const [filtroResponsavel, setFiltroResponsavel] = useState('');
  const [filtroEtiqueta, setFiltroEtiqueta] = useState('');
  const [filtroAtrasados, setFiltroAtrasados] = useState(false);
  const [filtroPrioridade, setFiltroPrioridade] = useState('');
  const [filtroBloqueados, setFiltroBloqueados] = useState(false);

  // Drag
  const [arrastando, setArrastando] = useState(null);
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
  );

  // Modais
  const [modalConfig, setModalConfig] = useState(false);
  const [novoCardEm, setNovoCardEm] = useState(null);
  const [cardAberto, setCardAberto] = useState(null);
  const [bloqueio, setBloqueio] = useState(null); // { dados, tentativa, snapshot }
  const [aviso, setAviso] = useState(null); // toast de WIP

  const [aba, setAba] = useState('kanban');

  // Sprint 15 — instância de processo
  const [instancia, setInstancia] = useState(null);
  const [modalDecisao, setModalDecisao] = useState(null);

  async function carregar() {
    const meuId = ++carregaIdRef.current;
    setCarregando(true);
    setErro('');
    try {
      const r = await api.get('/quadros/' + id);
      if (meuId !== carregaIdRef.current) return;
      setQuadro(r.data);
      carregarInstancia();
      carregarCartorios();
    } catch (err) {
      if (meuId === carregaIdRef.current) {
        setErro(mensagemDeErro(err, 'Não consegui carregar o quadro.'));
      }
    } finally {
      if (meuId === carregaIdRef.current) setCarregando(false);
    }
  }

  async function carregarInstancia() {
    try {
      const r = await api.get('/instancias/por-quadro/' + id);
      if (r.status === 204 || !r.data) { setInstancia(null); return; }
      setInstancia(r.data);
    } catch {
      setInstancia(null);
    }
  }

  async function carregarCartorios() {
    try {
      const r = await api.get('/quadros/' + id + '/cartorios');
      setCartoriosDoQuadro(r.data || []);
    } catch {
      setCartoriosDoQuadro([]);
    }
  }

  useEffect(() => { carregar(); /* eslint-disable-next-line */ }, [id]);

  useEffect(() => {
    const c = searchParams.get('card');
    if (c) setCardAberto(c);
  }, [searchParams]);

  useEffect(() => {
    if (!instancia || modalDecisao) return;
    const pendentes = instancia.decisoes_pendentes || [];
    if (pendentes.length > 0) setModalDecisao(pendentes[0]);
    // eslint-disable-next-line
  }, [instancia]);

  // Toast de WIP some sozinho.
  useEffect(() => {
    if (!aviso) return undefined;
    const t = setTimeout(() => setAviso(null), 6000);
    return () => clearTimeout(t);
  }, [aviso]);

  // ---------------------------------------------------------------------------
  // Drag & drop
  // ---------------------------------------------------------------------------

  function aoIniciarDrag(event) {
    const ativoId = event.active.id;
    if (String(ativoId).startsWith('col-')) {
      const colunaId = String(ativoId).replace('col-', '');
      setArrastando({ tipo: 'coluna', coluna: quadro.colunas.find((c) => c.id === colunaId) });
    } else {
      setArrastando({ tipo: 'card', card: quadro.cards.find((c) => c.id === ativoId) });
    }
  }

  /**
   * Envia o /mover. Se vier 409 (bloqueado), abre o diálogo em vez de
   * simplesmente reverter — a pessoa precisa SABER o que travou.
   */
  async function enviarMover(cardId, colunaId, posicao, snapshot, forcar = false) {
    try {
      const r = await api.post('/cards/' + cardId + '/mover', {
        coluna_id: colunaId,
        posicao,
        forcar,
      });
      carregar();
      if (r.data?.wip_estourado) setAviso(r.data.wip_estourado);
      if (instancia && r.data?.avanco_instancia?.motivo === 'decisao-aguarda-escolha') {
        await carregarInstancia();
      }
    } catch (err) {
      const status = err?.response?.status;
      const detalhes = err?.response?.data?.detalhes;
      if (status === 409 && detalhes?.pode_forcar) {
        // Mantém o preview otimista na tela enquanto a pessoa decide.
        setBloqueio({
          dados: detalhes,
          tentativa: { cardId, colunaId, posicao },
          snapshot,
        });
        return;
      }
      setQuadro(snapshot);
      alert(mensagemDeErro(err, 'Não consegui mover o card.'));
    }
  }

  async function aoFinalizarDrag(event) {
    const { active, over } = event;
    setArrastando(null);
    if (!over) return;

    // ----- Coluna -----
    if (String(active.id).startsWith('col-')) {
      if (!String(over.id).startsWith('col-') || active.id === over.id) return;
      const ativaId = String(active.id).replace('col-', '');
      const sobreId = String(over.id).replace('col-', '');

      const ordenadas = [...quadro.colunas].sort((a, b) => a.ordem - b.ordem);
      const idxAtiva = ordenadas.findIndex((c) => c.id === ativaId);
      const idxSobre = ordenadas.findIndex((c) => c.id === sobreId);
      if (idxAtiva < 0 || idxSobre < 0 || idxAtiva === idxSobre) return;

      const snapshot = quadro;
      const novaOrdem = [...ordenadas];
      const [movida] = novaOrdem.splice(idxAtiva, 1);
      novaOrdem.splice(idxSobre, 0, movida);
      novaOrdem.forEach((c, i) => { c.ordem = (i + 1) * 1000; });
      setQuadro((q) => ({ ...q, colunas: novaOrdem }));

      try {
        await api.post('/colunas/' + ativaId + '/mover', { posicao: idxSobre });
        carregar();
      } catch (err) {
        setQuadro(snapshot);
        alert(mensagemDeErro(err, 'Não consegui reordenar a coluna.'));
      }
      return;
    }

    // ----- Card -----
    const cardId = active.id;
    const cardArrastado = quadro.cards.find((c) => c.id === cardId);
    if (!cardArrastado) return;

    let novaColunaId;
    let novaPosicao;

    if (String(over.id).startsWith('coluna-') || String(over.id).startsWith('col-')) {
      novaColunaId = String(over.id).replace('coluna-', '').replace('col-', '');
      novaPosicao = quadro.cards
        .filter((c) => c.coluna_id === novaColunaId && c.id !== cardId).length;
    } else {
      const cardAlvo = quadro.cards.find((c) => c.id === over.id);
      if (!cardAlvo) return;
      novaColunaId = cardAlvo.coluna_id;
      novaPosicao = quadro.cards
        .filter((c) => c.coluna_id === novaColunaId && c.id !== cardId)
        .sort((a, b) => a.ordem - b.ordem)
        .findIndex((c) => c.id === cardAlvo.id);
    }

    const posAtual = quadro.cards
      .filter((c) => c.coluna_id === novaColunaId)
      .sort((a, b) => a.ordem - b.ordem)
      .findIndex((c) => c.id === cardId);
    if (cardArrastado.coluna_id === novaColunaId && posAtual === novaPosicao) return;

    const snapshot = quadro;
    setQuadro((q) => moverCardLocal(q, cardId, novaColunaId, novaPosicao));
    await enviarMover(cardId, novaColunaId, novaPosicao, snapshot);
  }

  // ---------------------------------------------------------------------------
  // Filtros
  // ---------------------------------------------------------------------------

  const cardsFiltrados = useMemo(() => {
    if (!quadro) return [];
    return quadro.cards.filter((c) => {
      const resps = c.responsaveis || [];
      if (filtroResponsavel === '__sem__' && resps.length > 0) return false;
      if (filtroResponsavel && filtroResponsavel !== '__sem__'
        && !resps.some((r) => r.id === filtroResponsavel)) return false;
      if (filtroEtiqueta && !(c.etiqueta_ids || []).includes(filtroEtiqueta)) return false;
      if (filtroPrioridade !== '' && Number(c.prioridade ?? 2) !== Number(filtroPrioridade)) return false;
      if (filtroBloqueados && !(c.bloqueado || Number(c.n_bloqueadores || 0) > 0)) return false;
      if (filtroAtrasados) {
        if (!c.data_prazo) return false;
        const d = new Date(String(c.data_prazo).slice(0, 10) + 'T23:59:59');
        if (d >= new Date()) return false;
      }
      return true;
    });
  }, [quadro, filtroResponsavel, filtroEtiqueta, filtroAtrasados, filtroPrioridade, filtroBloqueados]);

  const responsaveisDisponiveis = useMemo(() => {
    if (!quadro) return [];
    const map = new Map();
    for (const c of quadro.cards) {
      for (const r of (c.responsaveis || [])) {
        if (!map.has(r.id)) map.set(r.id, { id: r.id, nome: r.nome });
      }
    }
    return [...map.values()].sort((a, b) => a.nome.localeCompare(b.nome));
  }, [quadro]);

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------

  if (carregando) {
    return <div className="p-4 text-sm text-slate-500">Carregando quadro…</div>;
  }
  if (erro) {
    return (
      <div className="p-4">
        <Link to="/tarefas" className="inline-flex items-center gap-1 text-sm text-slate-600 hover:text-nexus-700">
          <ArrowLeft size={14} /> Voltar
        </Link>
        <div className="mt-4 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{erro}</div>
      </div>
    );
  }
  if (!quadro) return null;

  const colunasOrdenadas = [...quadro.colunas].sort((a, b) => a.ordem - b.ordem);

  return (
    <div className="-m-4 md:-m-8 flex h-[calc(100vh-3.5rem)] lg:h-screen flex-col bg-slate-50">
      {instancia && (
        <HeaderInstancia instancia={instancia} aoAbrirDecisao={(d) => setModalDecisao(d)} />
      )}

      <header className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-200 bg-white px-4 py-3">
        <div className="flex items-center gap-3 min-w-0">
          <Link to="/tarefas" className="rounded p-1.5 text-slate-500 hover:bg-slate-100 hover:text-slate-900">
            <ArrowLeft size={18} />
          </Link>
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <h1 className="truncate text-lg font-semibold text-slate-900">{quadro.nome}</h1>
              {quadro.aberto_a_socios
                ? <Globe size={14} className="shrink-0 text-emerald-600" />
                : <Lock size={14} className="shrink-0 text-slate-400" />}
            </div>
            <div className="flex items-center gap-1 text-xs text-slate-500">
              <Users2 size={11} /> {quadro.equipe_nome}
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <div className="inline-flex rounded-lg border border-slate-300 bg-white p-0.5">
            <button
              type="button"
              onClick={() => setAba('kanban')}
              className={[
                'inline-flex items-center gap-1 rounded-md px-2.5 py-1 text-xs font-medium transition-colors',
                aba === 'kanban' ? 'bg-nexus-700 text-white' : 'text-slate-600 hover:bg-slate-50',
              ].join(' ')}
            >
              <KanbanSquare size={12} /> Kanban
            </button>
            <button
              type="button"
              onClick={() => setAba('calendario')}
              className={[
                'inline-flex items-center gap-1 rounded-md px-2.5 py-1 text-xs font-medium transition-colors',
                aba === 'calendario' ? 'bg-nexus-700 text-white' : 'text-slate-600 hover:bg-slate-50',
              ].join(' ')}
            >
              <Calendar size={12} /> Calendário
            </button>
            <button
              type="button"
              onClick={() => setAba('metricas')}
              className={[
                'inline-flex items-center gap-1 rounded-md px-2.5 py-1 text-xs font-medium transition-colors',
                aba === 'metricas' ? 'bg-nexus-700 text-white' : 'text-slate-600 hover:bg-slate-50',
              ].join(' ')}
            >
              <BarChart3 size={12} /> Métricas
            </button>
          </div>

          {aba === 'kanban' && (
            <FiltroBar
              responsaveis={responsaveisDisponiveis}
              etiquetas={quadro.etiquetas}
              filtroResponsavel={filtroResponsavel}
              setFiltroResponsavel={setFiltroResponsavel}
              filtroEtiqueta={filtroEtiqueta}
              setFiltroEtiqueta={setFiltroEtiqueta}
              filtroAtrasados={filtroAtrasados}
              setFiltroAtrasados={setFiltroAtrasados}
              filtroPrioridade={filtroPrioridade}
              setFiltroPrioridade={setFiltroPrioridade}
              filtroBloqueados={filtroBloqueados}
              setFiltroBloqueados={setFiltroBloqueados}
            />
          )}

          {quadro.pode_editar && (
            <button
              type="button"
              onClick={() => setModalConfig(true)}
              className="inline-flex items-center gap-1 rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50"
              title="Configurações"
            >
              <Settings size={13} />
            </button>
          )}
        </div>
      </header>

      {aba === 'metricas' ? (
        <div className="flex-1 overflow-y-auto">
          <Metricas quadroId={quadro.id} ehAdmin={ehAdmin} />
        </div>
      ) : aba === 'calendario' ? (
        <div className="flex-1 overflow-y-auto">
          <QuadroCalendario
            quadro={quadro}
            podeEditar={quadro.pode_editar}
            aoClicarCard={(cid) => { setAba('kanban'); setCardAberto(cid); }}
          />
        </div>
      ) : (
        <div className="flex-1 overflow-x-auto overflow-y-hidden">
          <DndContext
            sensors={sensors}
            collisionDetection={rectIntersection}
            onDragStart={aoIniciarDrag}
            onDragEnd={aoFinalizarDrag}
            onDragCancel={() => setArrastando(null)}
          >
            <SortableContext
              items={colunasOrdenadas.map((c) => 'col-' + c.id)}
              strategy={horizontalListSortingStrategy}
            >
              <div className="flex h-full gap-3 p-4">
                {colunasOrdenadas.map((col) => (
                  <Coluna
                    key={col.id}
                    coluna={col}
                    cards={cardsFiltrados
                      .filter((c) => c.coluna_id === col.id)
                      .sort((a, b) => a.ordem - b.ordem)}
                    cartoriosNestaFase={cartoriosDoQuadro.filter((c) => c.coluna_id === col.id)}
                    podeEditar={quadro.pode_editar}
                    etiquetas={quadro.etiquetas}
                    aoClicarCard={(c) => setCardAberto(c.id)}
                    aoNovoCard={() => setNovoCardEm(col.id)}
                    aoMudarColuna={carregar}
                    aoArquivarColuna={async () => {
                      if (!confirm('Arquivar a coluna "' + col.nome + '"? Os cards ficam no histórico mas saem do board.')) return;
                      try {
                        await api.post('/colunas/' + col.id + '/arquivar');
                        carregar();
                      } catch (err) { alert(mensagemDeErro(err)); }
                    }}
                  />
                ))}

                {quadro.pode_editar && (
                  <BotaoNovaColuna quadroId={quadro.id} onCriada={carregar} />
                )}
              </div>
            </SortableContext>

            <DragOverlay>
              {arrastando?.tipo === 'card' && (
                <Card card={arrastando.card} etiquetas={quadro.etiquetas} arrastando />
              )}
              {arrastando?.tipo === 'coluna' && (
                <div className="w-72 rounded-xl bg-slate-100 px-3 py-2 shadow-2xl ring-2 ring-nexus-300 opacity-90">
                  <h3 className="text-sm font-semibold text-slate-900">{arrastando.coluna?.nome}</h3>
                </div>
              )}
            </DragOverlay>
          </DndContext>
        </div>
      )}

      {/* Toast de WIP estourado — avisa, não bloqueia. */}
      {aviso && (
        <div className="fixed bottom-4 right-4 z-40 flex max-w-sm items-start gap-2 rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 shadow-lg">
          <Gauge size={16} className="mt-0.5 shrink-0 text-amber-700" />
          <div className="text-xs text-amber-900">
            <strong>WIP estourado em "{aviso.coluna}"</strong>
            <div>
              {aviso.atual} cards para um limite de {aviso.limite}. Terminar vale mais que começar.
            </div>
          </div>
          <button
            type="button"
            onClick={() => setAviso(null)}
            className="rounded p-0.5 text-amber-700 hover:bg-amber-100"
          >
            <X size={13} />
          </button>
        </div>
      )}

      {/* Modais */}
      {modalConfig && (
        <ModalConfigQuadro
          quadro={quadro}
          onFechar={() => setModalConfig(false)}
          onAlterado={() => { setModalConfig(false); carregar(); }}
          onRecarregar={carregar}
        />
      )}

      {novoCardEm && (
        <ModalCard
          colunaId={novoCardEm}
          quadro={quadro}
          onFechar={() => setNovoCardEm(null)}
          onSalvo={() => { setNovoCardEm(null); carregar(); }}
        />
      )}

      {cardAberto && (
        <ModalCard
          cardId={cardAberto}
          quadro={quadro}
          onExtrasMudou={carregar}
          aoAbrirCard={(cid) => setCardAberto(cid)}
          onFechar={() => {
            setCardAberto(null);
            if (searchParams.get('card')) {
              searchParams.delete('card');
              setSearchParams(searchParams, { replace: true });
            }
          }}
          onSalvo={() => { setCardAberto(null); carregar(); }}
        />
      )}

      {bloqueio && (
        <ModalBloqueadores
          dados={bloqueio.dados}
          onCancelar={() => {
            setQuadro(bloqueio.snapshot);
            setBloqueio(null);
          }}
          onForcar={async () => {
            const { cardId, colunaId, posicao } = bloqueio.tentativa;
            const snap = bloqueio.snapshot;
            setBloqueio(null);
            await enviarMover(cardId, colunaId, posicao, snap, true);
          }}
        />
      )}

      {modalDecisao && (
        <ModalEscolherSaida
          decisao={modalDecisao}
          aoFechar={() => setModalDecisao(null)}
          aoEscolhido={async () => {
            setModalDecisao(null);
            await carregarInstancia();
            await carregar();
          }}
        />
      )}
    </div>
  );
}
