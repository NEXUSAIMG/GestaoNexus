import { useEffect, useMemo, useState } from 'react';
import { useParams, useSearchParams, Link } from 'react-router-dom';
import {
  ArrowLeft, Plus, Globe, Lock, Users2, X, Calendar,
  AlertCircle, Trash2, Archive, Settings, Tag as TagIcon, KanbanSquare,
  Workflow, GitBranch, ListChecks, CheckCircle2, GripVertical, Pencil,
} from 'lucide-react';
import {
  DndContext, DragOverlay, PointerSensor, useSensor, useSensors,
  rectIntersection, useDroppable,
} from '@dnd-kit/core';
import {
  SortableContext, useSortable, verticalListSortingStrategy,
  horizontalListSortingStrategy,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { api, mensagemDeErro } from '../api/client.js';
import QuadroCalendario from '../components/QuadroCalendario.jsx';
import MultiSelectPessoas from '../components/MultiSelectPessoas.jsx';

/**
 * Quadro (board) — Sprint 10.
 *
 * Layout: colunas horizontais com cards verticais. Drag & drop:
 *   - Arrastar card entre colunas → muda coluna_id + ordem
 *   - Arrastar card dentro da coluna → reordena
 *
 * Estado otimista: mexe local primeiro, faz request, recarrega no sucesso
 * pra pegar a ordem real do servidor (evita drift entre clientes).
 *
 * Modal de card abre quando clica em qualquer card (ou via ?card= na URL,
 * usado pelas notificações).
 */

const COR_CHIP = {
  slate: 'bg-slate-100 text-slate-700 border-slate-200',
  red: 'bg-red-100 text-red-700 border-red-200',
  orange: 'bg-orange-100 text-orange-700 border-orange-200',
  amber: 'bg-amber-100 text-amber-700 border-amber-200',
  yellow: 'bg-yellow-100 text-yellow-700 border-yellow-200',
  lime: 'bg-lime-100 text-lime-700 border-lime-200',
  emerald: 'bg-emerald-100 text-emerald-700 border-emerald-200',
  teal: 'bg-teal-100 text-teal-700 border-teal-200',
  cyan: 'bg-cyan-100 text-cyan-700 border-cyan-200',
  blue: 'bg-blue-100 text-blue-700 border-blue-200',
  indigo: 'bg-indigo-100 text-indigo-700 border-indigo-200',
  violet: 'bg-violet-100 text-violet-700 border-violet-200',
  fuchsia: 'bg-fuchsia-100 text-fuchsia-700 border-fuchsia-200',
  pink: 'bg-pink-100 text-pink-700 border-pink-200',
  rose: 'bg-rose-100 text-rose-700 border-rose-200',
};

const CORES = Object.keys(COR_CHIP);

function formatarPrazo(iso) {
  if (!iso) return null;
  const d = new Date(`${String(iso).slice(0, 10)}T12:00:00`);
  const hoje = new Date(); hoje.setHours(0, 0, 0, 0);
  const dHoje = new Date(d); dHoje.setHours(0, 0, 0, 0);
  const diff = Math.round((dHoje - hoje) / 86400000);
  let label, cor;
  if (diff < 0) { label = `${Math.abs(diff)}d atrás`; cor = 'text-red-700 bg-red-50 border-red-200'; }
  else if (diff === 0) { label = 'Hoje'; cor = 'text-amber-800 bg-amber-50 border-amber-200'; }
  else if (diff === 1) { label = 'Amanhã'; cor = 'text-amber-800 bg-amber-50 border-amber-200'; }
  else if (diff <= 7) { label = `em ${diff}d`; cor = 'text-slate-700 bg-slate-50 border-slate-200'; }
  else { label = d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' }); cor = 'text-slate-700 bg-slate-50 border-slate-200'; }
  return { label, cor, dataCompleta: d.toLocaleDateString('pt-BR') };
}

function iniciais(nome) {
  return (nome || '?').split(' ').filter(Boolean).slice(0, 2).map((p) => p[0]?.toUpperCase()).join('');
}

export default function Quadro() {
  const { id } = useParams();
  const [searchParams, setSearchParams] = useSearchParams();

  const [quadro, setQuadro] = useState(null);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState('');

  // Filtros
  const [filtroResponsavel, setFiltroResponsavel] = useState('');
  const [filtroEtiqueta, setFiltroEtiqueta] = useState('');
  const [filtroAtrasados, setFiltroAtrasados] = useState(false);

  // Drag state
  const [arrastando, setArrastando] = useState(null);
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
  );

  // Modais
  const [modalConfig, setModalConfig] = useState(false);
  const [novoCardEm, setNovoCardEm] = useState(null);
  const [cardAberto, setCardAberto] = useState(null);

  // Aba ativa: 'kanban' ou 'calendario' (Sprint 11)
  const [aba, setAba] = useState('kanban');

  // Sprint 15 — instância de processo (se for o caso)
  const [instancia, setInstancia] = useState(null); // null = não é instância
  const [modalDecisao, setModalDecisao] = useState(null); // { instancia_no_id, rotulo, saidas }

  async function carregar() {
    setCarregando(true);
    setErro('');
    try {
      const r = await api.get(`/quadros/${id}`);
      // TEMP DIAG — remover após investigação do bug "card volta ao estado antigo"
      console.log('[DIAG-card] ← GET /quadros recarregou', r.data.cards.length, 'cards:',
        r.data.cards.map((c) => `${c.id.slice(0, 8)} "${c.titulo}" prazo=${c.data_prazo || '∅'} resp=${c.responsavel_id?.slice(0, 8) || '∅'} etqs=${(c.etiqueta_ids || []).length}`));
      setQuadro(r.data);
      // Em paralelo, descobre se este quadro é de uma instância de processo
      carregarInstancia();
    } catch (err) {
      setErro(mensagemDeErro(err, 'Não consegui carregar o quadro.'));
    } finally {
      setCarregando(false);
    }
  }

  // Sprint 15 — busca instância vinculada ao quadro (status 204 = não é instância)
  async function carregarInstancia() {
    try {
      const r = await api.get(`/instancias/por-quadro/${id}`);
      if (r.status === 204 || !r.data) {
        setInstancia(null);
        return;
      }
      setInstancia(r.data);
    } catch {
      setInstancia(null);
    }
  }

  useEffect(() => { carregar(); /* eslint-disable-next-line */ }, [id]);

  // Abre card via ?card=ID (vem das notificações)
  useEffect(() => {
    const c = searchParams.get('card');
    if (c) setCardAberto(c);
  }, [searchParams]);

  // ---------------------------------------------------------------------------
  // Drag & drop
  // ---------------------------------------------------------------------------

  function aoIniciarDrag(event) {
    const id = event.active.id;
    // Sprint 19: pode ser drag de COLUNA (prefixo 'col-') ou de CARD (uuid)
    if (String(id).startsWith('col-')) {
      const colunaId = String(id).replace('col-', '');
      const col = quadro.colunas.find((c) => c.id === colunaId);
      setArrastando({ tipo: 'coluna', coluna: col });
    } else {
      const card = quadro.cards.find((c) => c.id === id);
      setArrastando({ tipo: 'card', card });
    }
  }

  async function aoFinalizarDrag(event) {
    const { active, over } = event;
    setArrastando(null);
    if (!over) return;

    // ----- Sprint 19: drag de COLUNA -----
    if (String(active.id).startsWith('col-')) {
      if (!String(over.id).startsWith('col-')) return;
      if (active.id === over.id) return;
      const ativaId = String(active.id).replace('col-', '');
      const sobreId = String(over.id).replace('col-', '');

      const ordenadas = [...quadro.colunas].sort((a, b) => a.ordem - b.ordem);
      const idxAtiva = ordenadas.findIndex((c) => c.id === ativaId);
      const idxSobre = ordenadas.findIndex((c) => c.id === sobreId);
      if (idxAtiva < 0 || idxSobre < 0 || idxAtiva === idxSobre) return;

      // Atualização otimista: reordena local
      const snapshot = quadro;
      const novaOrdem = [...ordenadas];
      const [movida] = novaOrdem.splice(idxAtiva, 1);
      novaOrdem.splice(idxSobre, 0, movida);
      novaOrdem.forEach((c, i) => { c.ordem = (i + 1) * 1000; });
      setQuadro((q) => ({ ...q, colunas: novaOrdem }));

      try {
        await api.post(`/colunas/${ativaId}/mover`, { posicao: idxSobre });
        carregar(); // recarrega pra ter a ordem real do servidor
      } catch (err) {
        setQuadro(snapshot);
        alert(mensagemDeErro(err, 'Não consegui reordenar a coluna.'));
      }
      return;
    }

    // ----- Drag de CARD (fluxo original) -----
    const cardId = active.id;
    const cardArrastado = quadro.cards.find((c) => c.id === cardId);
    if (!cardArrastado) return;

    let novaColunaId;
    let novaPosicao;

    // `over.id` pode ser o ID de um card OU 'coluna-XYZ' (área vazia da coluna)
    if (String(over.id).startsWith('coluna-')) {
      novaColunaId = String(over.id).replace('coluna-', '');
      const cardsNaColuna = quadro.cards.filter((c) => c.coluna_id === novaColunaId && c.id !== cardId);
      novaPosicao = cardsNaColuna.length;
    } else if (String(over.id).startsWith('col-')) {
      // Card solto sobre o handle da coluna — trata como solto no fim da coluna
      novaColunaId = String(over.id).replace('col-', '');
      const cardsNaColuna = quadro.cards.filter((c) => c.coluna_id === novaColunaId && c.id !== cardId);
      novaPosicao = cardsNaColuna.length;
    } else {
      const cardAlvo = quadro.cards.find((c) => c.id === over.id);
      if (!cardAlvo) return;
      novaColunaId = cardAlvo.coluna_id;
      const cardsNaColuna = quadro.cards
        .filter((c) => c.coluna_id === novaColunaId && c.id !== cardId)
        .sort((a, b) => a.ordem - b.ordem);
      novaPosicao = cardsNaColuna.findIndex((c) => c.id === cardAlvo.id);
    }

    // Se nada mudou de fato, sai
    const cardsAtuaisDestino = quadro.cards
      .filter((c) => c.coluna_id === novaColunaId)
      .sort((a, b) => a.ordem - b.ordem);
    const posAtualNoDestino = cardsAtuaisDestino.findIndex((c) => c.id === cardId);
    if (cardArrastado.coluna_id === novaColunaId && posAtualNoDestino === novaPosicao) return;

    // Atualização otimista
    const snapshot = quadro;
    setQuadro((q) => moverCardLocal(q, cardId, novaColunaId, novaPosicao));

    try {
      const r = await api.post(`/cards/${cardId}/mover`, { coluna_id: novaColunaId, posicao: novaPosicao });
      carregar(); // recarrega pra ter a ordem real do servidor
      // Sprint 15 — se card foi movido pra coluna 'Concluído' de instância,
      // o backend pode ter detectado decisão. Recarrega instância e mostra modal.
      if (instancia && r.data?.avanco_instancia?.motivo === 'decisao-aguarda-escolha') {
        await carregarInstancia();
      }
    } catch (err) {
      setQuadro(snapshot);
      alert(mensagemDeErro(err, 'Não consegui mover o card.'));
    }
  }

  // Sprint 15 — quando carrega instância e há decisões pendentes, abre modal
  // automaticamente da primeira (se ainda não há modal aberto).
  useEffect(() => {
    if (!instancia || modalDecisao) return;
    const pendentes = instancia.decisoes_pendentes || [];
    if (pendentes.length > 0) setModalDecisao(pendentes[0]);
    // eslint-disable-next-line
  }, [instancia]);

  // ---------------------------------------------------------------------------
  // Filtros
  // ---------------------------------------------------------------------------

  const cardsFiltrados = useMemo(() => {
    if (!quadro) return [];
    return quadro.cards.filter((c) => {
      // Sprint 18: filtra contra a lista de responsáveis (N:N)
      const resps = c.responsaveis || [];
      if (filtroResponsavel === '__sem__' && resps.length > 0) return false;
      if (filtroResponsavel && filtroResponsavel !== '__sem__'
          && !resps.some((r) => r.id === filtroResponsavel)) return false;
      if (filtroEtiqueta && !(c.etiqueta_ids || []).includes(filtroEtiqueta)) return false;
      if (filtroAtrasados) {
        if (!c.data_prazo) return false;
        const d = new Date(`${String(c.data_prazo).slice(0, 10)}T23:59:59`);
        if (d >= new Date()) return false;
      }
      return true;
    });
  }, [quadro, filtroResponsavel, filtroEtiqueta, filtroAtrasados]);

  const responsaveisDisponiveis = useMemo(() => {
    if (!quadro) return [];
    // Sprint 18: agrega de todos os responsáveis (N:N) presentes nos cards do quadro
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
      {/* Sprint 15 — Header de instância de processo (se for o caso) */}
      {instancia && (
        <HeaderInstancia
          instancia={instancia}
          aoAbrirDecisao={(d) => setModalDecisao(d)}
        />
      )}

      {/* Header */}
      <header className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-200 bg-white px-4 py-3">
        <div className="flex items-center gap-3 min-w-0">
          <Link to="/tarefas" className="rounded p-1.5 text-slate-500 hover:bg-slate-100 hover:text-slate-900">
            <ArrowLeft size={18} />
          </Link>
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <h1 className="truncate text-lg font-semibold text-slate-900">{quadro.nome}</h1>
              {quadro.aberto_a_socios ? (
                <Globe size={14} className="shrink-0 text-emerald-600" />
              ) : (
                <Lock size={14} className="shrink-0 text-slate-400" />
              )}
            </div>
            <div className="flex items-center gap-1 text-xs text-slate-500">
              <Users2 size={11} /> {quadro.equipe_nome}
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {/* Abas Kanban / Calendário (Sprint 11) */}
          <div className="inline-flex rounded-lg border border-slate-300 bg-white p-0.5">
            <button
              type="button"
              onClick={() => setAba('kanban')}
              className={[
                'inline-flex items-center gap-1 rounded-md px-2.5 py-1 text-xs font-medium transition-colors',
                aba === 'kanban'
                  ? 'bg-nexus-700 text-white'
                  : 'text-slate-600 hover:bg-slate-50',
              ].join(' ')}
            >
              <KanbanSquare size={12} /> Kanban
            </button>
            <button
              type="button"
              onClick={() => setAba('calendario')}
              className={[
                'inline-flex items-center gap-1 rounded-md px-2.5 py-1 text-xs font-medium transition-colors',
                aba === 'calendario'
                  ? 'bg-nexus-700 text-white'
                  : 'text-slate-600 hover:bg-slate-50',
              ].join(' ')}
            >
              <Calendar size={12} /> Calendário
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

      {/* Conteúdo: Kanban OU Calendário (Sprint 11) */}
      {aba === 'calendario' ? (
        <div className="flex-1 overflow-y-auto">
          <QuadroCalendario
            quadro={quadro}
            podeEditar={quadro.pode_editar}
            aoClicarCard={(cardId) => {
              setAba('kanban');
              setCardAberto(cardId);
            }}
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
          {/* Sprint 19: SortableContext de colunas (horizontal) */}
          <SortableContext
            items={colunasOrdenadas.map((c) => 'col-' + c.id)}
            strategy={horizontalListSortingStrategy}
          >
          <div className="flex h-full gap-3 p-4">
            {colunasOrdenadas.map((col) => {
              const cardsDaColuna = cardsFiltrados
                .filter((c) => c.coluna_id === col.id)
                .sort((a, b) => a.ordem - b.ordem);
              return (
                <Coluna
                  key={col.id}
                  coluna={col}
                  cards={cardsDaColuna}
                  podeEditar={quadro.pode_editar}
                  etiquetas={quadro.etiquetas}
                  aoClicarCard={(c) => setCardAberto(c.id)}
                  aoNovoCard={() => setNovoCardEm(col.id)}
                  aoArquivarColuna={async () => {
                    if (!confirm(`Arquivar a coluna "${col.nome}"? Os cards ficam no histórico mas saem do board.`)) return;
                    try {
                      await api.post(`/colunas/${col.id}/arquivar`);
                      carregar();
                    } catch (err) { alert(mensagemDeErro(err)); }
                  }}
                />
              );
            })}

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

      {/* Modais */}
      {modalConfig && (
        <ModalConfigQuadro
          quadro={quadro}
          onFechar={() => setModalConfig(false)}
          onAlterado={() => { setModalConfig(false); carregar(); }}
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

      {/* Sprint 15 — modal de escolher saída de decisão */}
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

// =============================================================================
// Sprint 15 — Header de instância de processo
// =============================================================================

function HeaderInstancia({ instancia, aoAbrirDecisao }) {
  const pct = instancia.total_nos > 0
    ? Math.round((instancia.nos.filter((n) => n.status === 'concluido').length / instancia.total_nos) * 100)
    : 0;
  const concluidos = instancia.nos.filter((n) => n.status === 'concluido').length;
  const ativos = instancia.nos.filter((n) => n.status === 'ativo').length;
  const pendentes = instancia.decisoes_pendentes || [];

  return (
    <div className="border-b border-nexus-200 bg-gradient-to-r from-nexus-50 to-white px-4 py-2.5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2 min-w-0">
          <Workflow size={14} className="text-nexus-700 shrink-0" />
          <div className="min-w-0">
            <div className="text-[10px] uppercase tracking-wide text-nexus-700 font-medium">
              Instância do processo · {instancia.processo_nome}
            </div>
            <div className="flex items-center gap-2">
              <span className="text-sm font-semibold text-slate-900 truncate">{instancia.nome}</span>
              <span className={`rounded px-1.5 py-0.5 text-[10px] font-medium uppercase ${
                instancia.status === 'em_andamento' ? 'bg-amber-100 text-amber-800' :
                instancia.status === 'concluida' ? 'bg-emerald-100 text-emerald-800' :
                'bg-slate-100 text-slate-600'
              }`}>
                {instancia.status === 'em_andamento' ? 'em andamento' :
                 instancia.status === 'concluida' ? 'concluída' : 'cancelada'}
              </span>
            </div>
          </div>
        </div>

        {/* Progresso */}
        <div className="flex items-center gap-2 text-xs">
          <div className="w-32 h-1.5 rounded-full bg-slate-200 overflow-hidden">
            <div
              className={`h-full ${instancia.status === 'concluida' ? 'bg-emerald-500' : 'bg-nexus-600'}`}
              style={{ width: `${pct}%` }}
            />
          </div>
          <span className="tabular-nums text-slate-600">
            {concluidos}/{instancia.total_nos}
            {ativos > 0 && <span className="text-amber-700"> · {ativos} ativo{ativos === 1 ? '' : 's'}</span>}
          </span>
          <Link
            to={`/processos/${instancia.processo_id}/instancias`}
            className="inline-flex items-center gap-1 rounded border border-slate-300 bg-white px-2 py-0.5 text-[11px] font-medium text-slate-700 hover:bg-slate-50"
          >
            <ListChecks size={10} /> Todas
          </Link>
        </div>
      </div>

      {/* Banner de decisões pendentes */}
      {pendentes.length > 0 && (
        <div className="mt-2 rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 flex items-center justify-between gap-2">
          <div className="flex items-center gap-2 text-sm text-amber-900">
            <GitBranch size={14} className="shrink-0" />
            <span>
              {pendentes.length === 1 ? (
                <>Decisão pendente: <strong>{pendentes[0].rotulo}</strong></>
              ) : (
                <><strong>{pendentes.length} decisões</strong> aguardando escolha de saída</>
              )}
            </span>
          </div>
          <button
            type="button"
            onClick={() => aoAbrirDecisao(pendentes[0])}
            className="inline-flex items-center gap-1 rounded-lg bg-amber-600 px-3 py-1 text-xs font-medium text-white hover:bg-amber-700"
          >
            Escolher saída
          </button>
        </div>
      )}
    </div>
  );
}

// =============================================================================
// Sprint 15 — Modal de escolher saída de decisão
// =============================================================================

function ModalEscolherSaida({ decisao, aoFechar, aoEscolhido }) {
  const [enviando, setEnviando] = useState(false);
  const [erro, setErro] = useState('');

  async function escolher(arestaId) {
    setEnviando(true);
    setErro('');
    try {
      await api.post(`/instancias/${decisao.instancia_no_id}/escolher-saida`, {
        aresta_id: arestaId,
      });
      aoEscolhido();
    } catch (err) {
      setErro(mensagemDeErro(err, 'Não consegui registrar a escolha.'));
      setEnviando(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4">
      <div className="w-full max-w-md rounded-xl bg-white shadow-xl">
        <header className="flex items-center justify-between border-b border-slate-200 px-5 py-3">
          <h2 className="text-base font-semibold text-slate-900 inline-flex items-center gap-1.5">
            <GitBranch size={14} className="text-amber-600" /> Decisão: {decisao.rotulo}
          </h2>
          <button onClick={aoFechar} className="rounded p-1 text-slate-400 hover:bg-slate-100">
            <X size={18} />
          </button>
        </header>

        <div className="p-5 space-y-4">
          <p className="text-sm text-slate-600">
            Qual caminho o processo deve seguir agora? A escolha é definitiva
            e cria os próximos cards automaticamente.
          </p>

          {decisao.saidas.length === 0 ? (
            <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
              Esta decisão não tem nenhuma saída no processo. Volte ao editor
              e adicione conexões a partir deste nó.
            </div>
          ) : (
            <div className="space-y-2">
              {decisao.saidas.map((s, i) => (
                <button
                  key={s.id}
                  type="button"
                  disabled={enviando}
                  onClick={() => escolher(s.id)}
                  className="w-full rounded-lg border-2 border-slate-200 bg-white p-3 text-left hover:border-nexus-400 hover:bg-nexus-50 disabled:opacity-50 transition-colors"
                >
                  <div className="flex items-center gap-2">
                    <span className="inline-flex h-6 w-6 items-center justify-center rounded-full bg-amber-100 text-xs font-bold text-amber-800">
                      {String.fromCharCode(65 + i)}
                    </span>
                    <div className="flex-1">
                      <div className="text-sm font-medium text-slate-900">
                        {s.rotulo || `Caminho ${String.fromCharCode(65 + i)}`}
                      </div>
                      <div className="text-xs text-slate-500">
                        Próxima etapa: <strong>{s.destino_rotulo}</strong>
                      </div>
                    </div>
                  </div>
                </button>
              ))}
            </div>
          )}

          {erro && (
            <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{erro}</div>
          )}

          <div className="flex justify-end pt-2">
            <button type="button" onClick={aoFechar}
              className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50">
              Decidir depois
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// =============================================================================
// Util: mover card localmente (estado otimista)
// =============================================================================

function moverCardLocal(quadro, cardId, novaColunaId, novaPosicao) {
  const cardsRestantes = quadro.cards.filter((c) => c.id !== cardId);
  const card = quadro.cards.find((c) => c.id === cardId);
  if (!card) return quadro;

  const cardsNoDestino = cardsRestantes
    .filter((c) => c.coluna_id === novaColunaId)
    .sort((a, b) => a.ordem - b.ordem);

  const cardAtualizado = { ...card, coluna_id: novaColunaId };
  cardsNoDestino.splice(novaPosicao, 0, cardAtualizado);

  // Renumera só pra preview funcionar
  cardsNoDestino.forEach((c, i) => { c.ordem = (i + 1) * 1000; });

  const cardsForaDestino = cardsRestantes.filter((c) => c.coluna_id !== novaColunaId);
  return { ...quadro, cards: [...cardsForaDestino, ...cardsNoDestino] };
}

// =============================================================================
// Coluna
// =============================================================================

function Coluna({ coluna, cards, podeEditar, etiquetas, aoClicarCard, aoNovoCard, aoArquivarColuna }) {
  // Sprint 19: useSortable pro próprio drag da coluna (handle no header)
  const sortable = useSortable({ id: 'col-' + coluna.id });
  // Mantido: useDroppable pra coluna ser zona de drop de cards (mesmo quando vazia)
  const drop = useDroppable({ id: `coluna-${coluna.id}` });
  const [menuAberto, setMenuAberto] = useState(false);

  const style = {
    transform: CSS.Transform.toString(sortable.transform),
    transition: sortable.transition,
    opacity: sortable.isDragging ? 0.4 : 1,
  };

  return (
    <div
      ref={sortable.setNodeRef}
      style={style}
      className="flex h-full w-72 shrink-0 flex-col rounded-xl bg-slate-100"
    >
      <header className="flex items-center justify-between gap-2 px-3 pt-3 pb-2">
        <div className="flex items-center gap-1 min-w-0">
          {podeEditar && (
            <button
              type="button"
              {...sortable.attributes}
              {...sortable.listeners}
              className="cursor-grab rounded p-0.5 text-slate-400 hover:bg-slate-200 hover:text-slate-700 active:cursor-grabbing"
              title="Arraste para reordenar a coluna"
            >
              <GripVertical size={13} />
            </button>
          )}
          <h3 title={coluna.nome} className="text-sm font-semibold text-slate-900 leading-tight break-words">{coluna.nome}</h3>
          <span className="rounded-full bg-slate-200 px-2 py-0.5 text-[10px] font-semibold text-slate-600">
            {cards.length}
          </span>
        </div>
        {podeEditar && (
          <div className="flex items-center gap-0.5">
            <button
              type="button"
              onClick={aoNovoCard}
              className="rounded p-1 text-slate-500 hover:bg-slate-200 hover:text-slate-900"
              title="Novo card"
            >
              <Plus size={14} />
            </button>
            <div className="relative">
              <button
                type="button"
                onClick={() => setMenuAberto((x) => !x)}
                className="rounded p-1 text-slate-400 hover:bg-slate-200 hover:text-slate-700"
                title="Opções"
              >
                <Settings size={12} />
              </button>
              {menuAberto && (
                <>
                  <button
                    type="button"
                    className="fixed inset-0 z-10"
                    onClick={() => setMenuAberto(false)}
                    aria-label="Fechar menu"
                  />
                  <div className="absolute right-0 top-full z-20 mt-1 w-44 rounded-lg border border-slate-200 bg-white py-1 shadow-lg">
                    <button
                      type="button"
                      onClick={() => { setMenuAberto(false); aoArquivarColuna(); }}
                      className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-xs text-slate-700 hover:bg-slate-50"
                    >
                      <Archive size={11} /> Arquivar coluna
                    </button>
                  </div>
                </>
              )}
            </div>
          </div>
        )}
      </header>

      <div ref={drop.setNodeRef} className="flex-1 space-y-2 overflow-y-auto px-2 pb-2 pt-1">
        <SortableContext items={cards.map((c) => c.id)} strategy={verticalListSortingStrategy}>
          {cards.map((card) => (
            <CardSortable
              key={card.id}
              card={card}
              etiquetas={etiquetas}
              aoClicar={() => aoClicarCard(card)}
            />
          ))}
        </SortableContext>

        {cards.length === 0 && (
          <div className="rounded-lg border border-dashed border-slate-300 bg-white/50 p-3 text-center text-xs text-slate-400">
            Sem cards
          </div>
        )}
      </div>

      {podeEditar && cards.length > 0 && (
        <button
          type="button"
          onClick={aoNovoCard}
          className="m-2 flex items-center justify-center gap-1 rounded-lg border border-dashed border-slate-300 bg-white/50 py-1.5 text-xs text-slate-500 hover:border-nexus-300 hover:bg-white hover:text-nexus-700"
        >
          <Plus size={12} /> Adicionar card
        </button>
      )}
    </div>
  );
}

// =============================================================================
// Card
// =============================================================================

function CardSortable({ card, etiquetas, aoClicar }) {
  const {
    attributes, listeners, setNodeRef, transform, transition, isDragging,
  } = useSortable({ id: card.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.4 : 1,
  };

  return (
    <div ref={setNodeRef} style={style} {...attributes} {...listeners}>
      <Card card={card} etiquetas={etiquetas} aoClicar={aoClicar} />
    </div>
  );
}

function Card({ card, etiquetas, aoClicar, arrastando }) {
  const prazo = formatarPrazo(card.data_prazo);
  const etqs = (card.etiqueta_ids || [])
    .map((id) => etiquetas.find((e) => e.id === id))
    .filter(Boolean);
  // Sprint 18: lista de responsáveis (N:N). Pode estar vazia.
  const resps = card.responsaveis || [];

  return (
    <div
      onClick={(e) => {
        if (aoClicar && !arrastando) {
          e.stopPropagation();
          aoClicar();
        }
      }}
      className={[
        'rounded-lg border bg-white p-2.5 shadow-sm transition-shadow',
        arrastando ? 'rotate-1 shadow-lg ring-2 ring-nexus-300 cursor-grabbing'
                   : 'cursor-pointer border-slate-200 hover:shadow-md hover:border-nexus-200',
      ].join(' ')}
    >
      {etqs.length > 0 && (
        <div className="mb-1.5 flex flex-wrap gap-1">
          {etqs.map((e) => (
            <span
              key={e.id}
              className={`inline-flex items-center rounded px-1.5 py-0.5 text-[10px] font-medium border ${COR_CHIP[e.cor] || COR_CHIP.slate}`}
            >
              {e.nome}
            </span>
          ))}
        </div>
      )}

      <div className="text-sm font-medium text-slate-900 leading-snug">{card.titulo}</div>

      {(prazo || resps.length > 0) && (
        <div className="mt-2 flex items-center justify-between gap-2">
          {prazo ? (
            <span
              className={`inline-flex items-center gap-1 rounded border px-1.5 py-0.5 text-[10px] font-medium ${prazo.cor}`}
              title={prazo.dataCompleta}
            >
              <Calendar size={9} /> {prazo.label}
            </span>
          ) : <span />}

          {resps.length > 0 && (
            <div className="flex -space-x-1.5" title={resps.map((r) => r.nome).join(', ')}>
              {resps.slice(0, 3).map((r) => (
                <span
                  key={r.id}
                  className="inline-flex h-5 w-5 items-center justify-center rounded-full bg-nexus-100 text-[9px] font-semibold text-nexus-800 ring-1 ring-white"
                  title={r.nome}
                >
                  {iniciais(r.nome)}
                </span>
              ))}
              {resps.length > 3 && (
                <span
                  className="inline-flex h-5 w-5 items-center justify-center rounded-full bg-slate-200 text-[9px] font-semibold text-slate-700 ring-1 ring-white"
                  title={resps.slice(3).map((r) => r.nome).join(', ')}
                >
                  +{resps.length - 3}
                </span>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// =============================================================================
// Filtros
// =============================================================================

function FiltroBar({
  responsaveis, etiquetas,
  filtroResponsavel, setFiltroResponsavel,
  filtroEtiqueta, setFiltroEtiqueta,
  filtroAtrasados, setFiltroAtrasados,
}) {
  const algumAtivo = filtroResponsavel || filtroEtiqueta || filtroAtrasados;
  return (
    <div className="flex items-center gap-1.5 text-xs">
      <select
        className="rounded-lg border border-slate-300 bg-white px-2 py-1.5 text-xs text-slate-700"
        value={filtroResponsavel} onChange={(e) => setFiltroResponsavel(e.target.value)}
      >
        <option value="">Todos os responsáveis</option>
        <option value="__sem__">Sem responsável</option>
        {responsaveis.map((r) => (<option key={r.id} value={r.id}>{r.nome}</option>))}
      </select>

      <select
        className="rounded-lg border border-slate-300 bg-white px-2 py-1.5 text-xs text-slate-700"
        value={filtroEtiqueta} onChange={(e) => setFiltroEtiqueta(e.target.value)}
      >
        <option value="">Todas as etiquetas</option>
        {etiquetas.map((e) => (<option key={e.id} value={e.id}>{e.nome}</option>))}
      </select>

      <button
        type="button"
        onClick={() => setFiltroAtrasados((x) => !x)}
        className={[
          'inline-flex items-center gap-1 rounded-lg border px-2 py-1.5 font-medium',
          filtroAtrasados ? 'border-red-300 bg-red-50 text-red-700' : 'border-slate-300 bg-white text-slate-700 hover:bg-slate-50',
        ].join(' ')}
      >
        <AlertCircle size={11} /> Atrasados
      </button>

      {algumAtivo && (
        <button
          type="button"
          onClick={() => { setFiltroResponsavel(''); setFiltroEtiqueta(''); setFiltroAtrasados(false); }}
          className="rounded-lg p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700"
          title="Limpar filtros"
        >
          <X size={12} />
        </button>
      )}
    </div>
  );
}

// =============================================================================
// Botão "Adicionar coluna"
// =============================================================================

function BotaoNovaColuna({ quadroId, onCriada }) {
  const [criando, setCriando] = useState(false);
  const [nome, setNome] = useState('');

  async function submeter(e) {
    e.preventDefault();
    if (!nome.trim()) return;
    try {
      await api.post(`/quadros/${quadroId}/colunas`, { nome: nome.trim() });
      setNome('');
      setCriando(false);
      onCriada();
    } catch (err) {
      alert(mensagemDeErro(err));
    }
  }

  if (!criando) {
    return (
      <button
        type="button"
        onClick={() => setCriando(true)}
        className="flex h-min w-72 shrink-0 items-center justify-center gap-1 rounded-xl border-2 border-dashed border-slate-300 bg-white/50 py-3 text-sm text-slate-500 hover:border-nexus-300 hover:bg-white hover:text-nexus-700"
      >
        <Plus size={14} /> Adicionar coluna
      </button>
    );
  }

  return (
    <form onSubmit={submeter} className="w-72 shrink-0 rounded-xl bg-slate-100 p-2">
      <input
        autoFocus
        value={nome}
        onChange={(e) => setNome(e.target.value)}
        onBlur={() => { if (!nome.trim()) setCriando(false); }}
        onKeyDown={(e) => { if (e.key === 'Escape') { setCriando(false); setNome(''); } }}
        maxLength={80}
        placeholder="Nome da coluna"
        className="w-full rounded-md border border-slate-300 bg-white px-2 py-1.5 text-sm shadow-sm outline-none focus:border-nexus-500 focus:ring-2 focus:ring-nexus-200"
      />
      <div className="mt-1.5 flex gap-1">
        <button type="submit" className="rounded-md bg-nexus-700 px-2.5 py-1 text-xs font-medium text-white hover:bg-nexus-800">
          Adicionar
        </button>
        <button type="button" onClick={() => { setCriando(false); setNome(''); }}
          className="rounded-md p-1 text-slate-500 hover:bg-slate-200">
          <X size={14} />
        </button>
      </div>
    </form>
  );
}

// =============================================================================
// Modal de Card (criar/editar)
// =============================================================================

function ModalCard({ cardId, colunaId, quadro, onFechar, onSalvo }) {
  const editando = !!cardId;
  const [carregando, setCarregando] = useState(editando);
  const [pessoasEquipe, setPessoasEquipe] = useState([]);
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState('');

  // Form state
  const [titulo, setTitulo] = useState('');
  const [descricao, setDescricao] = useState('');
  // Sprint 18: lista de UUIDs (vazia = sem responsável)
  const [responsavelIds, setResponsavelIds] = useState([]);
  const [dataPrazo, setDataPrazo] = useState('');
  const [etiquetaIds, setEtiquetaIds] = useState([]);

  // Sprint 18: lista TODAS as pessoas ativas — responsáveis podem ser de
  // equipes diferentes da equipe do quadro. O nome da variável de estado
  // (`pessoasEquipe`) ficou legado, mas o conteúdo agora é global.
  useEffect(() => {
    api.get('/pessoas')
      .then((r) => setPessoasEquipe((r.data || []).filter((p) => p.ativo)))
      .catch(() => { /* sem permissão — deixa vazio */ });
  }, []);

  // Carrega card existente
  useEffect(() => {
    if (!editando) { setCarregando(false); return; }
    setCarregando(true);
    api.get(`/cards/${cardId}`)
      .then((r) => {
        const c = r.data;
        setTitulo(c.titulo);
        setDescricao(c.descricao || '');
        // Sprint 18: extrai IDs da lista de responsáveis (mantém ordem)
        setResponsavelIds((c.responsaveis || []).map((p) => p.id));
        setDataPrazo(c.data_prazo ? String(c.data_prazo).slice(0, 10) : '');
        setEtiquetaIds(c.etiqueta_ids || []);
      })
      .catch((err) => setErro(mensagemDeErro(err)))
      .finally(() => setCarregando(false));
  }, [cardId, editando]);

  function alternarEtiqueta(eid) {
    setEtiquetaIds((atual) =>
      atual.includes(eid) ? atual.filter((x) => x !== eid) : [...atual, eid],
    );
  }

  async function submeter(e) {
    e.preventDefault();
    setSalvando(true);
    setErro('');
    try {
      const body = {
        titulo,
        descricao: descricao || null,
        // Sprint 18: array de UUIDs (vazio = sem responsável)
        responsavel_ids: responsavelIds,
        data_prazo: dataPrazo || null,
        etiqueta_ids: etiquetaIds,
      };
      // TEMP DIAG — remover após investigação do bug "card volta ao estado antigo"
      console.log('[DIAG-card] →', editando ? 'PUT /cards/' + cardId : 'POST /cards', 'body:', body);
      let r;
      if (editando) {
        r = await api.put(`/cards/${cardId}`, body);
      } else {
        r = await api.post('/cards', { ...body, coluna_id: colunaId });
      }
      console.log('[DIAG-card] ← resposta status', r.status, 'data:', r.data);
      onSalvo();
    } catch (err) {
      console.error('[DIAG-card] ✗ erro no save:', err.response?.status, err.response?.data, err);
      setErro(mensagemDeErro(err));
    } finally {
      setSalvando(false);
    }
  }

  async function arquivar() {
    if (!confirm('Arquivar este card? Ele some do board mas fica no histórico.')) return;
    try {
      await api.post(`/cards/${cardId}/arquivar`);
      onSalvo();
    } catch (err) {
      setErro(mensagemDeErro(err));
    }
  }

  if (carregando) {
    return (
      <ModalFrame titulo="Carregando…" onFechar={onFechar}>
        <div className="py-8 text-center text-sm text-slate-500">Carregando…</div>
      </ModalFrame>
    );
  }

  return (
    <ModalFrame titulo={editando ? 'Editar tarefa' : 'Nova tarefa'} onFechar={onFechar}>
      <form onSubmit={submeter} className="space-y-3">
        <div>
          <label className="block text-sm font-medium text-slate-900 mb-1">
            Título<span className="text-red-600">*</span>
          </label>
          <input
            className={inputCls}
            value={titulo} onChange={(e) => setTitulo(e.target.value)}
            maxLength={255} required autoFocus
          />
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-sm font-medium text-slate-900 mb-1">
              Responsáveis
              {responsavelIds.length > 0 && (
                <span className="ml-1 text-xs font-normal text-slate-500">
                  ({responsavelIds.length} selecionado{responsavelIds.length === 1 ? '' : 's'})
                </span>
              )}
            </label>
            <MultiSelectPessoas
              pessoas={pessoasEquipe}
              selecionadosIds={responsavelIds}
              onChange={setResponsavelIds}
            />
            {pessoasEquipe.length === 0 && (
              <p className="mt-1 text-xs text-slate-500">
                Nenhuma pessoa ativa cadastrada.
              </p>
            )}
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-900 mb-1">Prazo</label>
            <input
              type="date"
              className={inputCls}
              value={dataPrazo} onChange={(e) => setDataPrazo(e.target.value)}
            />
          </div>
        </div>

        {quadro.etiquetas.length > 0 && (
          <div>
            <label className="block text-sm font-medium text-slate-900 mb-1">Etiquetas</label>
            <div className="flex flex-wrap gap-1.5">
              {quadro.etiquetas.map((e) => {
                const ativo = etiquetaIds.includes(e.id);
                return (
                  <button
                    key={e.id}
                    type="button"
                    onClick={() => alternarEtiqueta(e.id)}
                    className={[
                      'inline-flex items-center rounded px-2 py-0.5 text-xs font-medium border transition-opacity',
                      COR_CHIP[e.cor] || COR_CHIP.slate,
                      ativo ? 'opacity-100 ring-1 ring-offset-1 ring-nexus-700' : 'opacity-50 hover:opacity-100',
                    ].join(' ')}
                  >
                    {e.nome}
                  </button>
                );
              })}
            </div>
          </div>
        )}

        <div>
          <label className="block text-sm font-medium text-slate-900 mb-1">
            Descrição <span className="text-xs font-normal text-slate-500">(suporta markdown)</span>
          </label>
          <textarea
            className={`${inputCls} font-mono text-xs`}
            rows={6}
            value={descricao} onChange={(e) => setDescricao(e.target.value)}
            maxLength={20000}
            placeholder="Detalhes da tarefa, contexto, links…"
          />
        </div>

        {erro && (
          <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{erro}</div>
        )}

        <div className="flex items-center justify-between gap-2 pt-2">
          {editando ? (
            <button
              type="button"
              onClick={arquivar}
              className="inline-flex items-center gap-1 rounded-lg border border-amber-200 bg-white px-3 py-1.5 text-xs font-medium text-amber-700 hover:bg-amber-50"
            >
              <Archive size={12} /> Arquivar
            </button>
          ) : <span />}

          <div className="flex gap-2">
            <button type="button" onClick={onFechar}
              className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
            >Cancelar</button>
            <button type="submit" disabled={salvando}
              className="rounded-lg bg-nexus-700 px-4 py-2 text-sm font-medium text-white hover:bg-nexus-800 disabled:opacity-50"
            >{salvando ? 'Salvando…' : (editando ? 'Salvar' : 'Criar tarefa')}</button>
          </div>
        </div>
      </form>
    </ModalFrame>
  );
}

// =============================================================================
// Modal de configurações do quadro (editar nome/visibilidade + etiquetas)
// =============================================================================

function ModalConfigQuadro({ quadro, onFechar, onAlterado }) {
  const [nome, setNome] = useState(quadro.nome);
  const [descricao, setDescricao] = useState(quadro.descricao || '');
  const [aberto, setAberto] = useState(quadro.aberto_a_socios);
  const [etiquetas, setEtiquetas] = useState(quadro.etiquetas);
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState('');

  async function salvarMetadados() {
    setSalvando(true);
    setErro('');
    try {
      await api.put(`/quadros/${quadro.id}`, {
        nome,
        descricao: descricao || null,
        aberto_a_socios: aberto,
      });
      onAlterado();
    } catch (err) {
      setErro(mensagemDeErro(err));
    } finally {
      setSalvando(false);
    }
  }

  async function arquivar() {
    if (!confirm(`Arquivar o quadro "${quadro.nome}"? Ele some da listagem mas pode ser desarquivado depois (no banco).`)) return;
    try {
      await api.post(`/quadros/${quadro.id}/arquivar`);
      window.location.assign('/tarefas');
    } catch (err) {
      setErro(mensagemDeErro(err));
    }
  }

  return (
    <ModalFrame titulo="Configurações do quadro" onFechar={onFechar}>
      <div className="space-y-4">
        <div>
          <label className="block text-sm font-medium text-slate-900 mb-1">
            Nome<span className="text-red-600">*</span>
          </label>
          <input
            className={inputCls}
            value={nome} onChange={(e) => setNome(e.target.value)}
            maxLength={100} required
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-slate-900 mb-1">Descrição</label>
          <textarea
            className={inputCls} rows={2}
            value={descricao} onChange={(e) => setDescricao(e.target.value)}
            maxLength={2000}
          />
        </div>

        <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
          <label className="flex items-start gap-2 cursor-pointer">
            <input type="checkbox" checked={aberto} onChange={(e) => setAberto(e.target.checked)} className="mt-1" />
            <div>
              <div className="text-sm font-medium text-slate-900">Aberto a todos os sócios</div>
              <div className="text-xs text-slate-500">
                Qualquer pessoa autenticada visualiza, mas só membros da equipe editam.
              </div>
            </div>
          </label>
        </div>

        <div>
          <h3 className="mb-2 flex items-center gap-1.5 text-sm font-semibold text-slate-900">
            <TagIcon size={13} /> Etiquetas
          </h3>
          <ListaEtiquetas
            quadroId={quadro.id}
            etiquetas={etiquetas}
            onMudou={(novas) => setEtiquetas(novas)}
          />
        </div>

        {erro && (
          <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{erro}</div>
        )}

        <div className="flex items-center justify-between gap-2 border-t border-slate-200 pt-4">
          <button
            type="button"
            onClick={arquivar}
            className="inline-flex items-center gap-1 rounded-lg border border-amber-200 bg-white px-3 py-1.5 text-xs font-medium text-amber-700 hover:bg-amber-50"
          >
            <Archive size={12} /> Arquivar quadro
          </button>
          <div className="flex gap-2">
            <button type="button" onClick={onFechar}
              className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
            >Fechar</button>
            <button type="button" onClick={salvarMetadados} disabled={salvando}
              className="rounded-lg bg-nexus-700 px-4 py-2 text-sm font-medium text-white hover:bg-nexus-800 disabled:opacity-50"
            >{salvando ? 'Salvando…' : 'Salvar'}</button>
          </div>
        </div>
      </div>
    </ModalFrame>
  );
}

function ListaEtiquetas({ quadroId, etiquetas, onMudou }) {
  const [criando, setCriando] = useState(false);
  const [novoNome, setNovoNome] = useState('');
  const [novaCor, setNovaCor] = useState('slate');
  // Sprint 19: edição de etiqueta existente
  const [editandoId, setEditandoId] = useState(null);
  const [editNome, setEditNome] = useState('');
  const [editCor, setEditCor] = useState('slate');

  async function criar() {
    if (!novoNome.trim()) return;
    try {
      const r = await api.post(`/quadros/${quadroId}/etiquetas`, { nome: novoNome.trim(), cor: novaCor });
      onMudou([...etiquetas, r.data]);
      setNovoNome('');
      setNovaCor('slate');
      setCriando(false);
    } catch (err) {
      alert(mensagemDeErro(err));
    }
  }

  async function excluir(eid) {
    if (!confirm('Excluir etiqueta? Ela some dos cards onde está aplicada.')) return;
    try {
      await api.delete(`/quadros/${quadroId}/etiquetas/${eid}`);
      onMudou(etiquetas.filter((e) => e.id !== eid));
    } catch (err) {
      alert(mensagemDeErro(err));
    }
  }

  function iniciarEdicao(et) {
    setEditandoId(et.id);
    setEditNome(et.nome);
    setEditCor(et.cor || 'slate');
    setCriando(false); // não pode editar e criar ao mesmo tempo
  }

  function cancelarEdicao() {
    setEditandoId(null);
    setEditNome('');
    setEditCor('slate');
  }

  async function salvarEdicao() {
    if (!editNome.trim()) return;
    try {
      const r = await api.put(`/quadros/${quadroId}/etiquetas/${editandoId}`, {
        nome: editNome.trim(),
        cor: editCor,
      });
      onMudou(etiquetas.map((e) => (e.id === editandoId ? (r.data || { ...e, nome: editNome.trim(), cor: editCor }) : e)));
      cancelarEdicao();
    } catch (err) {
      alert(mensagemDeErro(err));
    }
  }

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-1.5">
        {etiquetas.map((e) => (
          editandoId === e.id ? (
            // Modo edição inline
            <div key={e.id} className="w-full rounded-lg border border-nexus-200 bg-nexus-50/50 p-2 space-y-2">
              <input
                autoFocus
                className={inputCls}
                value={editNome}
                onChange={(ev) => setEditNome(ev.target.value)}
                onKeyDown={(ev) => {
                  if (ev.key === 'Enter') { ev.preventDefault(); salvarEdicao(); }
                  if (ev.key === 'Escape') cancelarEdicao();
                }}
                maxLength={50}
              />
              <div className="flex flex-wrap gap-1">
                {CORES.map((c) => (
                  <button
                    key={c}
                    type="button"
                    onClick={() => setEditCor(c)}
                    className={[
                      'h-5 w-5 rounded-full transition-transform',
                      COR_CHIP[c]?.split(' ')[0]?.replace('-100', '-500') || 'bg-slate-500',
                      editCor === c ? 'ring-2 ring-offset-1 ring-nexus-700 scale-110' : '',
                    ].join(' ')}
                  />
                ))}
              </div>
              <div className="flex gap-1">
                <button type="button" onClick={salvarEdicao}
                  className="rounded-md bg-nexus-700 px-2.5 py-1 text-xs font-medium text-white hover:bg-nexus-800">
                  Salvar
                </button>
                <button type="button" onClick={cancelarEdicao}
                  className="rounded-md border border-slate-300 bg-white px-2.5 py-1 text-xs font-medium text-slate-700 hover:bg-slate-50">
                  Cancelar
                </button>
                <button type="button" onClick={() => { excluir(e.id); cancelarEdicao(); }}
                  className="ml-auto inline-flex items-center gap-1 rounded-md border border-red-200 bg-white px-2.5 py-1 text-xs font-medium text-red-700 hover:bg-red-50">
                  <Trash2 size={10} /> Excluir
                </button>
              </div>
            </div>
          ) : (
            <span
              key={e.id}
              className={`group inline-flex items-center gap-1 rounded px-2 py-0.5 text-xs font-medium border ${COR_CHIP[e.cor] || COR_CHIP.slate}`}
            >
              {e.nome}
              <button
                type="button"
                onClick={() => iniciarEdicao(e)}
                className="opacity-0 group-hover:opacity-70 hover:opacity-100"
                title="Editar"
              >
                <Pencil size={9} />
              </button>
            </span>
          )
        ))}
      </div>

      {criando ? (
        <div className="rounded-lg border border-slate-200 bg-slate-50 p-2 space-y-2">
          <input
            autoFocus
            className={inputCls}
            value={novoNome}
            onChange={(e) => setNovoNome(e.target.value)}
            placeholder="Nome da etiqueta"
            maxLength={50}
          />
          <div className="flex flex-wrap gap-1">
            {CORES.map((c) => (
              <button
                key={c}
                type="button"
                onClick={() => setNovaCor(c)}
                className={[
                  'h-5 w-5 rounded-full transition-transform',
                  COR_CHIP[c]?.split(' ')[0]?.replace('-100', '-500') || 'bg-slate-500',
                  novaCor === c ? 'ring-2 ring-offset-1 ring-nexus-700 scale-110' : '',
                ].join(' ')}
              />
            ))}
          </div>
          <div className="flex gap-1">
            <button type="button" onClick={criar}
              className="rounded-md bg-nexus-700 px-2.5 py-1 text-xs font-medium text-white hover:bg-nexus-800">
              Criar
            </button>
            <button type="button" onClick={() => { setCriando(false); setNovoNome(''); }}
              className="rounded-md border border-slate-300 bg-white px-2.5 py-1 text-xs font-medium text-slate-700 hover:bg-slate-50">
              Cancelar
            </button>
          </div>
        </div>
      ) : !editandoId ? (
        <button
          type="button"
          onClick={() => setCriando(true)}
          className="inline-flex items-center gap-1 rounded-md border border-dashed border-slate-300 bg-white px-2 py-1 text-xs text-slate-500 hover:border-nexus-300 hover:text-nexus-700"
        >
          <Plus size={11} /> Nova etiqueta
        </button>
      ) : null}
    </div>
  );
}

// =============================================================================
// Helpers de UI
// =============================================================================

const inputCls = 'w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm shadow-sm outline-none focus:border-nexus-500 focus:ring-2 focus:ring-nexus-200';

function ModalFrame({ titulo, onFechar, children }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4">
      <div className="w-full max-w-xl rounded-xl bg-white shadow-xl">
        <header className="flex items-center justify-between border-b border-slate-200 px-5 py-3">
          <h2 className="text-base font-semibold text-slate-900">{titulo}</h2>
          <button type="button" onClick={onFechar} className="rounded p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-600">
            <X size={18} />
          </button>
        </header>
        <div className="p-5 max-h-[80vh] overflow-y-auto">{children}</div>
      </div>
    </div>
  );
}
