import { useEffect, useRef, useState } from 'react';
import {
  Paperclip, Upload, Trash2, FileText, Image as ImageIcon, Download, Loader2,
} from 'lucide-react';
import { api, mensagemDeErro } from '../api/client.js';

/**
 * CardAnexos — Sprint 32 (Kanban nível Trello).
 *
 * Múltiplos arquivos por card. Download é autenticado (token no header),
 * então buscamos o blob via axios e abrimos num object URL — <a href> direto
 * não carregaria o Authorization.
 */

function humanizarBytes(n) {
  if (n == null) return '';
  const num = Number(n);
  if (num < 1024) return `${num} B`;
  if (num < 1024 * 1024) return `${(num / 1024).toFixed(0)} KB`;
  return `${(num / (1024 * 1024)).toFixed(1)} MB`;
}

function ehImagem(mime) {
  return typeof mime === 'string' && mime.startsWith('image/');
}

export default function CardAnexos({ cardId, podeEditar, onMudou }) {
  const [anexos, setAnexos] = useState([]);
  const [carregando, setCarregando] = useState(true);
  const [enviando, setEnviando] = useState(false);
  const [baixandoId, setBaixandoId] = useState(null);
  const [erro, setErro] = useState('');
  const inputRef = useRef(null);

  async function carregar() {
    setCarregando(true);
    try {
      const r = await api.get(`/cards/${cardId}/anexos`);
      setAnexos(r.data || []);
    } catch (err) {
      setErro(mensagemDeErro(err, 'Não consegui carregar os anexos.'));
    } finally {
      setCarregando(false);
    }
  }

  useEffect(() => { carregar(); /* eslint-disable-next-line */ }, [cardId]);

  function avisar() { if (onMudou) onMudou(); }

  async function enviar(arquivo) {
    if (!arquivo) return;
    setEnviando(true);
    setErro('');
    try {
      const fd = new FormData();
      fd.append('arquivo', arquivo);
      const r = await api.post(`/cards/${cardId}/anexos`, fd, {
        headers: { 'Content-Type': 'multipart/form-data' },
        timeout: 60_000,
      });
      setAnexos((as) => [r.data, ...as]);
      avisar();
    } catch (err) {
      setErro(mensagemDeErro(err));
    } finally {
      setEnviando(false);
      if (inputRef.current) inputRef.current.value = '';
    }
  }

  async function baixar(anexo) {
    setBaixandoId(anexo.id);
    try {
      const r = await api.get(`/cards/${cardId}/anexos/${anexo.id}/baixar`, {
        responseType: 'blob',
        timeout: 60_000,
      });
      const tipo = anexo.mime_type || r.data.type || '';
      const url = URL.createObjectURL(r.data);
      // Imagens e PDF podem abrir em nova aba (preview seguro). Qualquer
      // outro tipo baixa como arquivo — evita renderizar HTML/SVG malicioso.
      if (tipo.startsWith('image/') || tipo === 'application/pdf') {
        window.open(url, '_blank', 'noopener');
      } else {
        const link = document.createElement('a');
        link.href = url;
        link.download = anexo.nome_original || 'arquivo';
        document.body.appendChild(link);
        link.click();
        link.remove();
      }
      setTimeout(() => URL.revokeObjectURL(url), 60_000);
    } catch (err) {
      alert(mensagemDeErro(err, 'Não consegui baixar o arquivo.'));
    } finally {
      setBaixandoId(null);
    }
  }

  async function excluir(anexo) {
    if (!confirm(`Excluir o anexo "${anexo.nome_original}"?`)) return;
    try {
      await api.delete(`/cards/${cardId}/anexos/${anexo.id}`);
      setAnexos((as) => as.filter((a) => a.id !== anexo.id));
      avisar();
    } catch (err) { alert(mensagemDeErro(err)); }
  }

  return (
    <div className="space-y-2">
      {podeEditar && (
        <div>
          <input
            ref={inputRef}
            type="file"
            className="hidden"
            onChange={(e) => enviar(e.target.files?.[0])}
          />
          <button
            type="button"
            onClick={() => inputRef.current?.click()}
            disabled={enviando}
            className="inline-flex items-center gap-1.5 rounded-lg border border-dashed border-slate-300 bg-white px-3 py-1.5 text-xs font-medium text-slate-600 hover:border-nexus-300 hover:text-nexus-700 disabled:opacity-50"
          >
            {enviando ? <Loader2 size={13} className="animate-spin" /> : <Upload size={13} />}
            {enviando ? 'Enviando…' : 'Anexar arquivo'}
          </button>
          <span className="ml-2 text-[10px] text-slate-400">Qualquer arquivo (até 10 MB)</span>
        </div>
      )}

      {erro && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">{erro}</div>
      )}

      {carregando ? (
        <div className="text-xs text-slate-400">Carregando anexos…</div>
      ) : anexos.length === 0 ? (
        <div className="text-xs text-slate-400">Nenhum anexo.</div>
      ) : (
        <ul className="space-y-1.5">
          {anexos.map((a) => (
            <li key={a.id} className="group flex items-center gap-2 rounded-lg border border-slate-200 bg-white p-2">
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded bg-slate-100 text-slate-500">
                {ehImagem(a.mime_type) ? <ImageIcon size={16} /> : <FileText size={16} />}
              </span>
              <div className="min-w-0 flex-1">
                <button
                  type="button"
                  onClick={() => baixar(a)}
                  className="block truncate text-left text-sm font-medium text-slate-800 hover:text-nexus-700 hover:underline"
                  title={a.nome_original}
                >
                  {a.nome_original}
                </button>
                <div className="text-[10px] text-slate-400">
                  {humanizarBytes(a.tamanho_bytes)}
                  {a.enviado_por_nome ? ` · ${a.enviado_por_nome}` : ''}
                </div>
              </div>
              <div className="flex items-center gap-0.5">
                <button
                  type="button"
                  onClick={() => baixar(a)}
                  disabled={baixandoId === a.id}
                  className="rounded p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700"
                  title="Abrir / baixar"
                >
                  {baixandoId === a.id ? <Loader2 size={14} className="animate-spin" /> : <Download size={14} />}
                </button>
                {podeEditar && (
                  <button
                    type="button"
                    onClick={() => excluir(a)}
                    className="rounded p-1.5 text-slate-400 opacity-0 group-hover:opacity-100 hover:bg-red-50 hover:text-red-600"
                    title="Excluir"
                  >
                    <Trash2 size={14} />
                  </button>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
