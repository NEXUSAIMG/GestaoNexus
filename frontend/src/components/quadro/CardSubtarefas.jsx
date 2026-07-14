import { useEffect, useState } from 'react';
import { Plus, X, CheckCircle2, Circle, ListTree } from 'lucide-react';
import { api, mensagemDeErro } from '../../api/client.js';

/**
 * Sprint 34 — Subtarefas.
 *
 * Diferença pro checklist: aqui o filho é um CARD de verdade — tem
 * responsável, prazo, comentário, anexo e anda pelas colunas. O checklist
 * continua sendo o lugar do que é trivial demais pra virar card.
 */
export default function CardSubtarefas({ cardId, podeEditar, onMudou, aoAbrirCard }) {
  const [itens, setItens] = useState([]);
  const [carregando, setCarregando] = useState(true);
  const [criando, setCriando] = useState(false);
  const [titulo, setTitulo] = useState('');
  const [erro, setErro] = useState('');

  async function carregar() {
    try {
      const r = await api.get('/cards/' + cardId + '/subtarefas');
      setItens(r.data || []);
    } catch (err) {
      setErro(mensagemDeErro(err, 'Não consegui carregar as subtarefas.'));
    } finally {
      setCarregando(false);
    }
  }

  useEffect(() => { carregar(); /* eslint-disable-next-line */ }, [cardId]);

  async function criar(e) {
    e.preventDefault();
    if (!titulo.trim()) return;
    try {
      await api.post('/cards/' + cardId + '/subtarefas', { titulo: titulo.trim() });
      setTitulo('');
      setCriando(false);
      await carregar();
      onMudou?.();
    } catch (err) {
      alert(mensagemDeErro(err, 'Não consegui criar a subtarefa.'));
    }
  }

  if (carregando) return <p className="text-xs text-slate-400">Carregando…</p>;

  const feitas = itens.filter((i) => i.concluido).length;

  return (
    <div className="space-y-2">
      {itens.length > 0 && (
        <>
          <div className="flex items-center gap-2">
            <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-slate-200">
              <div
                className="h-full bg-emerald-500 transition-all"
                style={{ width: (itens.length ? Math.round((feitas / itens.length) * 100) : 0) + '%' }}
              />
            </div>
            <span className="text-[10px] tabular-nums text-slate-500">{feitas}/{itens.length}</span>
          </div>

          <ul className="space-y-1">
            {itens.map((s) => (
              <li key={s.id}>
                <button
                  type="button"
                  onClick={() => aoAbrirCard?.(s.id)}
                  className="flex w-full items-center gap-2 rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-left hover:border-nexus-300 hover:bg-nexus-50/40"
                >
                  {s.concluido
                    ? <CheckCircle2 size={13} className="shrink-0 text-emerald-600" />
                    : <Circle size={13} className="shrink-0 text-slate-300" />}
                  <span className={'flex-1 truncate text-xs ' + (s.concluido ? 'text-slate-400 line-through' : 'text-slate-800')}>
                    {s.titulo}
                  </span>
                  <span className="shrink-0 rounded bg-slate-100 px-1.5 py-0.5 text-[9px] font-medium text-slate-500">
                    {s.coluna_nome}
                  </span>
                  {(s.responsaveis || []).length > 0 && (
                    <span className="shrink-0 text-[9px] text-slate-400">
                      {s.responsaveis.map((r) => r.nome.split(' ')[0]).join(', ')}
                    </span>
                  )}
                </button>
              </li>
            ))}
          </ul>
        </>
      )}

      {itens.length === 0 && (
        <p className="text-xs text-slate-400">
          Nenhuma subtarefa. Uma subtarefa é um card completo — use quando o
          item precisa de responsável e prazo próprios.
        </p>
      )}

      {erro && <p className="text-xs text-red-600">{erro}</p>}

      {podeEditar && (
        criando ? (
          <form onSubmit={criar} className="flex gap-1">
            <input
              autoFocus
              value={titulo}
              onChange={(e) => setTitulo(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Escape') { setCriando(false); setTitulo(''); } }}
              maxLength={255}
              placeholder="Título da subtarefa"
              className="flex-1 rounded-md border border-slate-300 px-2 py-1 text-xs outline-none focus:border-nexus-500"
            />
            <button type="submit" className="rounded-md bg-nexus-700 px-2.5 py-1 text-xs font-medium text-white hover:bg-nexus-800">
              Criar
            </button>
            <button
              type="button"
              onClick={() => { setCriando(false); setTitulo(''); }}
              className="rounded-md p-1 text-slate-400 hover:bg-slate-100"
            >
              <X size={13} />
            </button>
          </form>
        ) : (
          <button
            type="button"
            onClick={() => setCriando(true)}
            className="inline-flex items-center gap-1 rounded-md border border-dashed border-slate-300 bg-white px-2 py-1 text-xs text-slate-500 hover:border-nexus-300 hover:text-nexus-700"
          >
            <Plus size={11} /> <ListTree size={11} /> Nova subtarefa
          </button>
        )
      )}
    </div>
  );
}
