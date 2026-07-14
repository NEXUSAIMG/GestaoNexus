import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useDroppable } from '@dnd-kit/core';
import { SortableContext, useSortable, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import {
  Plus, X, Archive, Settings, GripVertical, Building2, Gauge,
} from 'lucide-react';
import { api, mensagemDeErro } from '../../api/client.js';
import { CardSortable } from './Card.jsx';
import { TIPOS_COLUNA } from './ui.js';

/**
 * Coluna do board.
 *
 * Sprint 34:
 *   - `tipo` (backlog / em_andamento / concluida) — habilita métricas e o
 *     gate de dependências. Editável direto no menu da coluna.
 *   - `wip_limite` — quando estourado, o header fica âmbar. NUNCA bloqueia
 *     o drop: kanban saudável avisa, não impede.
 */

const PONTO_TIPO = {
  backlog: 'bg-slate-400',
  em_andamento: 'bg-blue-500',
  concluida: 'bg-emerald-500',
};

export default function Coluna({
  coluna, cards, cartoriosNestaFase = [], podeEditar, etiquetas,
  aoClicarCard, aoNovoCard, aoArquivarColuna, aoMudarColuna,
}) {
  const sortable = useSortable({ id: 'col-' + coluna.id });
  const drop = useDroppable({ id: 'coluna-' + coluna.id });
  const [menuAberto, setMenuAberto] = useState(false);
  const [editandoWip, setEditandoWip] = useState(false);
  const [wipTexto, setWipTexto] = useState(String(coluna.wip_limite || ''));

  const style = {
    transform: CSS.Transform.toString(sortable.transform),
    transition: sortable.transition,
    opacity: sortable.isDragging ? 0.4 : 1,
  };

  // Conta os cards REAIS da coluna (n_cards vem do backend, sem filtro de UI).
  // Usar cards.length aqui daria falso alívio quando há filtro ativo.
  const totalReal = coluna.n_cards != null ? Number(coluna.n_cards) : cards.length;
  const limite = coluna.wip_limite ? Number(coluna.wip_limite) : null;
  const estourado = limite != null && totalReal > limite;

  async function salvarColuna(patch) {
    try {
      await api.put('/colunas/' + coluna.id, patch);
      aoMudarColuna?.();
    } catch (err) {
      alert(mensagemDeErro(err, 'Não consegui salvar a coluna.'));
    }
  }

  async function salvarWip() {
    const n = wipTexto.trim() === '' ? null : Number(wipTexto);
    if (n !== null && (!Number.isInteger(n) || n < 1)) {
      alert('O limite de WIP precisa ser um número inteiro maior que zero (ou vazio para remover).');
      return;
    }
    setEditandoWip(false);
    await salvarColuna({ wip_limite: n });
  }

  return (
    <div
      ref={sortable.setNodeRef}
      style={style}
      className="flex h-full w-72 shrink-0 flex-col rounded-xl bg-slate-100"
    >
      <header
        className={[
          'flex items-center justify-between gap-2 px-3 pt-3 pb-2 rounded-t-xl',
          estourado ? 'bg-amber-100' : '',
        ].join(' ')}
      >
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
          <span
            className={'h-2 w-2 shrink-0 rounded-full ' + (PONTO_TIPO[coluna.tipo] || PONTO_TIPO.em_andamento)}
            title={TIPOS_COLUNA.find((t) => t.valor === coluna.tipo)?.nome || 'Em andamento'}
          />
          <h3 title={coluna.nome} className="text-sm font-semibold text-slate-900 leading-tight break-words">
            {coluna.nome}
          </h3>
          <span
            className={[
              'rounded-full px-2 py-0.5 text-[10px] font-semibold tabular-nums',
              estourado ? 'bg-amber-500 text-white' : 'bg-slate-200 text-slate-600',
            ].join(' ')}
            title={limite ? 'WIP: ' + totalReal + ' de ' + limite : undefined}
          >
            {limite ? totalReal + '/' + limite : cards.length}
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
                  <div className="absolute right-0 top-full z-20 mt-1 w-60 rounded-lg border border-slate-200 bg-white py-1 shadow-lg">
                    <div className="px-3 pb-1 pt-1 text-[10px] font-semibold uppercase tracking-wide text-slate-400">
                      Tipo da coluna
                    </div>
                    {TIPOS_COLUNA.map((t) => (
                      <button
                        key={t.valor}
                        type="button"
                        onClick={() => { setMenuAberto(false); salvarColuna({ tipo: t.valor }); }}
                        className={[
                          'flex w-full items-start gap-2 px-3 py-1.5 text-left text-xs hover:bg-slate-50',
                          coluna.tipo === t.valor ? 'text-nexus-800 font-medium' : 'text-slate-700',
                        ].join(' ')}
                        title={t.ajuda}
                      >
                        <span className={'mt-1 h-2 w-2 shrink-0 rounded-full ' + PONTO_TIPO[t.valor]} />
                        <span>
                          {t.nome}
                          <span className="block text-[10px] font-normal text-slate-400">{t.ajuda}</span>
                        </span>
                      </button>
                    ))}

                    <div className="my-1 border-t border-slate-100" />

                    <button
                      type="button"
                      onClick={() => { setMenuAberto(false); setEditandoWip(true); }}
                      className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-xs text-slate-700 hover:bg-slate-50"
                    >
                      <Gauge size={11} /> {limite ? 'Alterar limite de WIP (' + limite + ')' : 'Definir limite de WIP'}
                    </button>
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

      {editandoWip && (
        <div className="mx-2 mb-1 rounded-lg border border-slate-300 bg-white p-2">
          <label className="block text-[10px] font-semibold uppercase tracking-wide text-slate-500">
            Limite de WIP
          </label>
          <p className="mb-1 text-[10px] text-slate-400">
            Vazio = sem limite. O board avisa quando estoura, mas não impede o drop.
          </p>
          <div className="flex gap-1">
            <input
              autoFocus
              type="number"
              min={1}
              value={wipTexto}
              onChange={(e) => setWipTexto(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') salvarWip();
                if (e.key === 'Escape') setEditandoWip(false);
              }}
              className="w-full rounded-md border border-slate-300 px-2 py-1 text-xs outline-none focus:border-nexus-500"
            />
            <button
              type="button"
              onClick={salvarWip}
              className="rounded-md bg-nexus-700 px-2 py-1 text-xs font-medium text-white hover:bg-nexus-800"
            >
              OK
            </button>
            <button
              type="button"
              onClick={() => setEditandoWip(false)}
              className="rounded-md p-1 text-slate-400 hover:bg-slate-100"
            >
              <X size={12} />
            </button>
          </div>
        </div>
      )}

      {estourado && (
        <div className="mx-2 mb-1 rounded-md bg-amber-50 border border-amber-200 px-2 py-1 text-[10px] text-amber-800">
          WIP estourado: {totalReal} cards para um limite de {limite}. Termine antes de começar.
        </div>
      )}

      {cartoriosNestaFase.length > 0 && (
        <div className="mx-2 mb-1 rounded-lg border border-amber-200 bg-amber-50/60 p-1.5">
          <div className="flex items-center gap-1 px-1 pb-1 text-[9px] uppercase tracking-wider font-semibold text-amber-700">
            <Building2 size={9} /> Cartórios ({cartoriosNestaFase.length})
          </div>
          <div className="flex flex-wrap gap-1">
            {cartoriosNestaFase.map((c) => (
              <Link
                key={c.id}
                to={'/cartorios/' + c.id}
                className="inline-flex items-center gap-1 rounded-full bg-white border border-amber-300 px-1.5 py-0.5 text-[10px] font-medium text-amber-900 hover:bg-amber-100 hover:border-amber-400 transition-colors"
                title={c.nome + (c.cidade ? ' · ' + c.cidade : '') + (c.uf ? '/' + c.uf : '')}
              >
                <Building2 size={8} />
                <span className="truncate max-w-[140px]">{c.nome}</span>
              </Link>
            ))}
          </div>
        </div>
      )}

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

// ---------------------------------------------------------------------------
// Botão "Adicionar coluna"
// ---------------------------------------------------------------------------

export function BotaoNovaColuna({ quadroId, onCriada }) {
  const [criando, setCriando] = useState(false);
  const [nome, setNome] = useState('');

  async function submeter(e) {
    e.preventDefault();
    if (!nome.trim()) return;
    try {
      await api.post('/quadros/' + quadroId + '/colunas', { nome: nome.trim() });
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
        <button
          type="button"
          onClick={() => { setCriando(false); setNome(''); }}
          className="rounded-md p-1 text-slate-500 hover:bg-slate-200"
        >
          <X size={14} />
        </button>
      </div>
    </form>
  );
}
