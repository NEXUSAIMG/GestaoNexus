import { useEffect, useState } from 'react';
import { Trash2, Pencil, Send, X } from 'lucide-react';
import { api, mensagemDeErro } from '../api/client.js';
import { useAuth } from '../context/AuthContext.jsx';

/**
 * CardComentarios — Sprint 32 (Kanban nível Trello).
 *
 * Thread de comentários do card. Qualquer membro comenta; editar/excluir
 * só o próprio autor (ou admin). Mais novo no topo.
 */

function iniciais(nome) {
  return (nome || '?').split(' ').filter(Boolean).slice(0, 2).map((p) => p[0]?.toUpperCase()).join('');
}

function tempoRelativo(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  const seg = Math.round((Date.now() - d.getTime()) / 1000);
  if (seg < 60) return 'agora';
  const min = Math.round(seg / 60);
  if (min < 60) return `há ${min}min`;
  const h = Math.round(min / 60);
  if (h < 24) return `há ${h}h`;
  const dias = Math.round(h / 24);
  if (dias < 7) return `há ${dias}d`;
  return d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: '2-digit' });
}

export default function CardComentarios({ cardId, podeEditar, onMudou }) {
  const { pessoa } = useAuth();
  const [comentarios, setComentarios] = useState([]);
  const [carregando, setCarregando] = useState(true);
  const [texto, setTexto] = useState('');
  const [enviando, setEnviando] = useState(false);
  const [erro, setErro] = useState('');

  async function carregar() {
    setCarregando(true);
    try {
      const r = await api.get(`/cards/${cardId}/comentarios`);
      setComentarios(r.data || []);
    } catch (err) {
      setErro(mensagemDeErro(err, 'Não consegui carregar os comentários.'));
    } finally {
      setCarregando(false);
    }
  }

  useEffect(() => { carregar(); /* eslint-disable-next-line */ }, [cardId]);

  function avisar() { if (onMudou) onMudou(); }

  async function enviar() {
    const t = texto.trim();
    if (!t) return;
    setEnviando(true);
    setErro('');
    try {
      const r = await api.post(`/cards/${cardId}/comentarios`, { texto: t });
      setComentarios((cs) => [r.data, ...cs]);
      setTexto('');
      avisar();
    } catch (err) {
      setErro(mensagemDeErro(err));
    } finally {
      setEnviando(false);
    }
  }

  async function salvarEdicao(id, novoTexto) {
    try {
      const r = await api.put(`/cards/${cardId}/comentarios/${id}`, { texto: novoTexto });
      setComentarios((cs) => cs.map((c) => (c.id === id ? r.data : c)));
    } catch (err) { alert(mensagemDeErro(err)); }
  }

  async function excluir(id) {
    if (!confirm('Excluir este comentário?')) return;
    try {
      await api.delete(`/cards/${cardId}/comentarios/${id}`);
      setComentarios((cs) => cs.filter((c) => c.id !== id));
      avisar();
    } catch (err) { alert(mensagemDeErro(err)); }
  }

  return (
    <div className="space-y-3">
      {podeEditar && (
        <div className="flex items-start gap-2">
          <span className="mt-0.5 inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-nexus-100 text-[10px] font-semibold text-nexus-800">
            {iniciais(pessoa?.nome)}
          </span>
          <div className="flex-1">
            <textarea
              className={`${inputCls} text-sm`}
              rows={2}
              value={texto}
              onChange={(e) => setTexto(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) { e.preventDefault(); enviar(); }
              }}
              maxLength={5000}
              placeholder="Escreva um comentário… (Ctrl+Enter envia)"
            />
            <div className="mt-1 flex justify-end">
              <button
                type="button"
                onClick={enviar}
                disabled={enviando || !texto.trim()}
                className="inline-flex items-center gap-1 rounded-lg bg-nexus-700 px-3 py-1.5 text-xs font-medium text-white hover:bg-nexus-800 disabled:opacity-50"
              >
                <Send size={12} /> {enviando ? 'Enviando…' : 'Comentar'}
              </button>
            </div>
          </div>
        </div>
      )}

      {erro && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">{erro}</div>
      )}

      {carregando ? (
        <div className="text-xs text-slate-400">Carregando comentários…</div>
      ) : comentarios.length === 0 ? (
        <div className="text-xs text-slate-400">Nenhum comentário ainda.</div>
      ) : (
        <ul className="space-y-3">
          {comentarios.map((c) => (
            <Comentario
              key={c.id}
              comentario={c}
              podeMexer={podeEditar && (c.pessoa_id === pessoa?.id || pessoa?.administrador)}
              onSalvar={(t) => salvarEdicao(c.id, t)}
              onExcluir={() => excluir(c.id)}
            />
          ))}
        </ul>
      )}
    </div>
  );
}

function Comentario({ comentario, podeMexer, onSalvar, onExcluir }) {
  const [editando, setEditando] = useState(false);
  const [texto, setTexto] = useState(comentario.texto);

  function salvar() {
    const t = texto.trim();
    if (t && t !== comentario.texto) onSalvar(t);
    setEditando(false);
  }

  return (
    <li className="flex items-start gap-2">
      <span className="mt-0.5 inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-slate-200 text-[10px] font-semibold text-slate-700">
        {iniciais(comentario.pessoa_nome)}
      </span>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium text-slate-900">{comentario.pessoa_nome || 'Alguém'}</span>
          <span className="text-[10px] text-slate-400">
            {tempoRelativo(comentario.criado_em)}
            {comentario.editado_em ? ' · editado' : ''}
          </span>
        </div>

        {editando ? (
          <div className="mt-1 space-y-1.5">
            <textarea
              autoFocus
              className={`${inputCls} text-sm`}
              rows={3}
              value={texto}
              onChange={(e) => setTexto(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) { e.preventDefault(); salvar(); }
                if (e.key === 'Escape') { setTexto(comentario.texto); setEditando(false); }
              }}
              maxLength={5000}
            />
            <div className="flex gap-1">
              <button type="button" onClick={salvar}
                className="rounded-md bg-nexus-700 px-2.5 py-1 text-xs font-medium text-white hover:bg-nexus-800">Salvar</button>
              <button type="button" onClick={() => { setTexto(comentario.texto); setEditando(false); }}
                className="rounded-md p-1 text-slate-500 hover:bg-slate-100"><X size={14} /></button>
            </div>
          </div>
        ) : (
          <div className="mt-0.5 whitespace-pre-wrap break-words rounded-lg bg-slate-50 px-3 py-2 text-sm text-slate-800">
            {comentario.texto}
          </div>
        )}

        {podeMexer && !editando && (
          <div className="mt-1 flex items-center gap-2 text-[11px] text-slate-400">
            <button type="button" onClick={() => setEditando(true)} className="inline-flex items-center gap-0.5 hover:text-slate-700">
              <Pencil size={10} /> Editar
            </button>
            <button type="button" onClick={onExcluir} className="inline-flex items-center gap-0.5 hover:text-red-600">
              <Trash2 size={10} /> Excluir
            </button>
          </div>
        )}
      </div>
    </li>
  );
}

const inputCls = 'w-full rounded-lg border border-slate-300 bg-white px-3 py-2 shadow-sm outline-none focus:border-nexus-500 focus:ring-2 focus:ring-nexus-200';
