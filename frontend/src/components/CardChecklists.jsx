import { useEffect, useState } from 'react';
import {
  Plus, X, Trash2, CheckSquare, Square, ListChecks, Pencil,
} from 'lucide-react';
import { api, mensagemDeErro } from '../api/client.js';

/**
 * CardChecklists — Sprint 32 (Kanban nível Trello).
 *
 * Lista de checklists do card, cada um com barra de progresso e itens
 * marcáveis. Edição inline de título, adicionar/remover itens, marcar
 * conclusão. Chama `onMudou()` após mutações pra o board atualizar os selos.
 */
export default function CardChecklists({ cardId, podeEditar, onMudou }) {
  const [checklists, setChecklists] = useState([]);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState('');
  const [criando, setCriando] = useState(false);
  const [novoTitulo, setNovoTitulo] = useState('Checklist');

  async function carregar() {
    setCarregando(true);
    try {
      const r = await api.get(`/cards/${cardId}/checklists`);
      setChecklists(r.data || []);
    } catch (err) {
      setErro(mensagemDeErro(err, 'Não consegui carregar os checklists.'));
    } finally {
      setCarregando(false);
    }
  }

  useEffect(() => { carregar(); /* eslint-disable-next-line */ }, [cardId]);

  function avisar() { if (onMudou) onMudou(); }

  async function criarChecklist() {
    const titulo = novoTitulo.trim() || 'Checklist';
    try {
      const r = await api.post(`/cards/${cardId}/checklists`, { titulo });
      setChecklists((cs) => [...cs, { ...r.data, itens: r.data.itens || [] }]);
      setNovoTitulo('Checklist');
      setCriando(false);
      avisar();
    } catch (err) { alert(mensagemDeErro(err)); }
  }

  async function renomear(cid, titulo) {
    try {
      await api.put(`/cards/${cardId}/checklists/${cid}`, { titulo });
      setChecklists((cs) => cs.map((c) => (c.id === cid ? { ...c, titulo } : c)));
    } catch (err) { alert(mensagemDeErro(err)); }
  }

  async function excluirChecklist(cid) {
    if (!confirm('Excluir este checklist e todos os seus itens?')) return;
    try {
      await api.delete(`/cards/${cardId}/checklists/${cid}`);
      setChecklists((cs) => cs.filter((c) => c.id !== cid));
      avisar();
    } catch (err) { alert(mensagemDeErro(err)); }
  }

  async function adicionarItem(cid, texto) {
    try {
      const r = await api.post(`/cards/${cardId}/checklists/${cid}/itens`, { texto });
      setChecklists((cs) => cs.map((c) => (
        c.id === cid ? { ...c, itens: [...c.itens, r.data] } : c
      )));
      avisar();
    } catch (err) { alert(mensagemDeErro(err)); }
  }

  async function alternarItem(cid, item) {
    const concluido = !item.concluido;
    // otimista
    setChecklists((cs) => cs.map((c) => (
      c.id === cid
        ? { ...c, itens: c.itens.map((i) => (i.id === item.id ? { ...i, concluido } : i)) }
        : c
    )));
    try {
      await api.put(`/cards/${cardId}/checklists/${cid}/itens/${item.id}`, { concluido });
      avisar();
    } catch (err) {
      // reverte
      setChecklists((cs) => cs.map((c) => (
        c.id === cid
          ? { ...c, itens: c.itens.map((i) => (i.id === item.id ? { ...i, concluido: item.concluido } : i)) }
          : c
      )));
      alert(mensagemDeErro(err));
    }
  }

  async function renomearItem(cid, item, texto) {
    try {
      await api.put(`/cards/${cardId}/checklists/${cid}/itens/${item.id}`, { texto });
      setChecklists((cs) => cs.map((c) => (
        c.id === cid
          ? { ...c, itens: c.itens.map((i) => (i.id === item.id ? { ...i, texto } : i)) }
          : c
      )));
    } catch (err) { alert(mensagemDeErro(err)); }
  }

  async function excluirItem(cid, itemId) {
    try {
      await api.delete(`/cards/${cardId}/checklists/${cid}/itens/${itemId}`);
      setChecklists((cs) => cs.map((c) => (
        c.id === cid ? { ...c, itens: c.itens.filter((i) => i.id !== itemId) } : c
      )));
      avisar();
    } catch (err) { alert(mensagemDeErro(err)); }
  }

  if (carregando) {
    return <div className="text-xs text-slate-400">Carregando checklists…</div>;
  }

  return (
    <div className="space-y-4">
      {erro && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">{erro}</div>
      )}

      {checklists.map((c) => (
        <ChecklistBloco
          key={c.id}
          checklist={c}
          podeEditar={podeEditar}
          onRenomear={(t) => renomear(c.id, t)}
          onExcluir={() => excluirChecklist(c.id)}
          onAdicionarItem={(t) => adicionarItem(c.id, t)}
          onAlternarItem={(item) => alternarItem(c.id, item)}
          onRenomearItem={(item, t) => renomearItem(c.id, item, t)}
          onExcluirItem={(itemId) => excluirItem(c.id, itemId)}
        />
      ))}

      {podeEditar && (
        criando ? (
          <div className="rounded-lg border border-slate-200 bg-slate-50 p-2 space-y-2">
            <input
              autoFocus
              className={inputCls}
              value={novoTitulo}
              onChange={(e) => setNovoTitulo(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') { e.preventDefault(); criarChecklist(); }
                if (e.key === 'Escape') setCriando(false);
              }}
              maxLength={120}
              placeholder="Título do checklist"
            />
            <div className="flex gap-1">
              <button type="button" onClick={criarChecklist}
                className="rounded-md bg-nexus-700 px-2.5 py-1 text-xs font-medium text-white hover:bg-nexus-800">
                Adicionar
              </button>
              <button type="button" onClick={() => setCriando(false)}
                className="rounded-md border border-slate-300 bg-white px-2.5 py-1 text-xs font-medium text-slate-700 hover:bg-slate-50">
                Cancelar
              </button>
            </div>
          </div>
        ) : (
          <button type="button" onClick={() => setCriando(true)}
            className="inline-flex items-center gap-1 rounded-md border border-dashed border-slate-300 bg-white px-2.5 py-1.5 text-xs text-slate-600 hover:border-nexus-300 hover:text-nexus-700">
            <ListChecks size={13} /> Adicionar checklist
          </button>
        )
      )}
    </div>
  );
}

function ChecklistBloco({
  checklist, podeEditar,
  onRenomear, onExcluir, onAdicionarItem, onAlternarItem, onRenomearItem, onExcluirItem,
}) {
  const [editandoTitulo, setEditandoTitulo] = useState(false);
  const [titulo, setTitulo] = useState(checklist.titulo);
  const [novoItem, setNovoItem] = useState('');
  const [addOpen, setAddOpen] = useState(false);

  const total = checklist.itens.length;
  const concluidos = checklist.itens.filter((i) => i.concluido).length;
  const pct = total > 0 ? Math.round((concluidos / total) * 100) : 0;

  function salvarTitulo() {
    const t = titulo.trim();
    if (t && t !== checklist.titulo) onRenomear(t);
    setEditandoTitulo(false);
  }

  function submeterItem() {
    const t = novoItem.trim();
    if (!t) return;
    onAdicionarItem(t);
    setNovoItem('');
  }

  return (
    <div className="rounded-lg border border-slate-200 bg-white p-3">
      <div className="mb-2 flex items-center justify-between gap-2">
        <div className="flex items-center gap-1.5 min-w-0">
          <ListChecks size={14} className="shrink-0 text-slate-500" />
          {editandoTitulo && podeEditar ? (
            <input
              autoFocus
              className="rounded border border-slate-300 px-1.5 py-0.5 text-sm font-semibold outline-none focus:border-nexus-500"
              value={titulo}
              onChange={(e) => setTitulo(e.target.value)}
              onBlur={salvarTitulo}
              onKeyDown={(e) => {
                if (e.key === 'Enter') { e.preventDefault(); salvarTitulo(); }
                if (e.key === 'Escape') { setTitulo(checklist.titulo); setEditandoTitulo(false); }
              }}
              maxLength={120}
            />
          ) : (
            <h4
              className={`truncate text-sm font-semibold text-slate-900 ${podeEditar ? 'cursor-pointer hover:text-nexus-700' : ''}`}
              onClick={() => podeEditar && setEditandoTitulo(true)}
              title={podeEditar ? 'Clique para renomear' : undefined}
            >
              {checklist.titulo}
            </h4>
          )}
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <span className="tabular-nums text-xs font-medium text-slate-500">{concluidos}/{total}</span>
          {podeEditar && (
            <button type="button" onClick={onExcluir}
              className="rounded p-1 text-slate-400 hover:bg-red-50 hover:text-red-600" title="Excluir checklist">
              <Trash2 size={13} />
            </button>
          )}
        </div>
      </div>

      {/* Barra de progresso */}
      <div className="mb-2 flex items-center gap-2">
        <span className="tabular-nums text-[10px] font-medium text-slate-400 w-8 text-right">{pct}%</span>
        <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-slate-200">
          <div
            className={`h-full transition-all ${pct === 100 ? 'bg-emerald-500' : 'bg-nexus-600'}`}
            style={{ width: `${pct}%` }}
          />
        </div>
      </div>

      {/* Itens */}
      <ul className="space-y-0.5">
        {checklist.itens.map((item) => (
          <ItemLinha
            key={item.id}
            item={item}
            podeEditar={podeEditar}
            onAlternar={() => onAlternarItem(item)}
            onRenomear={(t) => onRenomearItem(item, t)}
            onExcluir={() => onExcluirItem(item.id)}
          />
        ))}
      </ul>

      {podeEditar && (
        addOpen ? (
          <div className="mt-2 space-y-1.5">
            <textarea
              autoFocus
              className={`${inputCls} text-xs`}
              rows={2}
              value={novoItem}
              onChange={(e) => setNovoItem(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); submeterItem(); }
                if (e.key === 'Escape') { setNovoItem(''); setAddOpen(false); }
              }}
              maxLength={500}
              placeholder="Adicionar um item (Enter para salvar)"
            />
            <div className="flex gap-1">
              <button type="button" onClick={submeterItem}
                className="rounded-md bg-nexus-700 px-2.5 py-1 text-xs font-medium text-white hover:bg-nexus-800">
                Adicionar
              </button>
              <button type="button" onClick={() => { setNovoItem(''); setAddOpen(false); }}
                className="rounded-md p-1 text-slate-500 hover:bg-slate-100"><X size={14} /></button>
            </div>
          </div>
        ) : (
          <button type="button" onClick={() => setAddOpen(true)}
            className="mt-1.5 inline-flex items-center gap-1 rounded px-1.5 py-1 text-xs text-slate-500 hover:bg-slate-100 hover:text-slate-800">
            <Plus size={12} /> Adicionar item
          </button>
        )
      )}
    </div>
  );
}

function ItemLinha({ item, podeEditar, onAlternar, onRenomear, onExcluir }) {
  const [editando, setEditando] = useState(false);
  const [texto, setTexto] = useState(item.texto);

  function salvar() {
    const t = texto.trim();
    if (t && t !== item.texto) onRenomear(t);
    setEditando(false);
  }

  return (
    <li className="group flex items-start gap-2 rounded px-1 py-0.5 hover:bg-slate-50">
      <button
        type="button"
        onClick={() => podeEditar && onAlternar()}
        disabled={!podeEditar}
        className={`mt-0.5 shrink-0 ${item.concluido ? 'text-emerald-600' : 'text-slate-400'} ${podeEditar ? 'hover:text-nexus-700' : ''}`}
      >
        {item.concluido ? <CheckSquare size={15} /> : <Square size={15} />}
      </button>

      {editando && podeEditar ? (
        <input
          autoFocus
          className="flex-1 rounded border border-slate-300 px-1.5 py-0.5 text-sm outline-none focus:border-nexus-500"
          value={texto}
          onChange={(e) => setTexto(e.target.value)}
          onBlur={salvar}
          onKeyDown={(e) => {
            if (e.key === 'Enter') { e.preventDefault(); salvar(); }
            if (e.key === 'Escape') { setTexto(item.texto); setEditando(false); }
          }}
          maxLength={500}
        />
      ) : (
        <span
          className={`flex-1 text-sm leading-snug ${item.concluido ? 'text-slate-400 line-through' : 'text-slate-800'} ${podeEditar ? 'cursor-pointer' : ''}`}
          onClick={() => podeEditar && setEditando(true)}
        >
          {item.texto}
        </span>
      )}

      {podeEditar && !editando && (
        <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100">
          <button type="button" onClick={() => setEditando(true)}
            className="rounded p-0.5 text-slate-400 hover:text-slate-700" title="Editar">
            <Pencil size={11} />
          </button>
          <button type="button" onClick={onExcluir}
            className="rounded p-0.5 text-slate-400 hover:text-red-600" title="Excluir">
            <Trash2 size={11} />
          </button>
        </div>
      )}
    </li>
  );
}

const inputCls = 'w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm shadow-sm outline-none focus:border-nexus-500 focus:ring-2 focus:ring-nexus-200';
