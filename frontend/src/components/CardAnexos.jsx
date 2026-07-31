import { useEffect, useRef, useState } from 'react';
import {
  Upload, Trash2, FileText, Image as ImageIcon, Download, Loader2,
  AlertTriangle, RotateCcw,
} from 'lucide-react';
import { api, mensagemDeErro } from '../api/client.js';

/**
 * CardAnexos — Sprint 32 (Kanban nível Trello).
 *
 * Múltiplos arquivos por card. Download é autenticado (token no header),
 * então buscamos o blob via axios e abrimos num object URL — <a href> direto
 * não carregaria o Authorization.
 *
 * Sprint 42: anexos enviados antes do volume persistente do Railway podem
 * ter sumido do disco. O backend responde 410 'arquivo_perdido' nesses casos.
 * Aqui a gente marca o anexo como perdido e oferece "Reenviar" no lugar de
 * mostrar um erro cru.
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
  const [reenviandoId, setReenviandoId] = useState(null);
  const [perdidos, setPerdidos] = useState(() => new Set());
  const [erro, setErro] = useState('');
  const inputRef = useRef(null);
  const reenviarRef = useRef(null);
  const reenviarAlvoRef = useRef(null);

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

  function marcarPerdido(id) {
    setPerdidos((s) => { const n = new Set(s); n.add(id); return n; });
  }

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
      if (err?.response?.status === 410) {
        marcarPerdido(anexo.id);
      } else {
        alert(mensagemDeErro(err, 'Não consegui baixar o arquivo.'));
      }
    } finally {
      setBaixandoId(null);
    }
  }

  function pedirReenvio(anexo) {
    reenviarAlvoRef.current = anexo;
    reenviarRef.current?.click();
  }

  async function reenviar(arquivo) {
    const alvo = reenviarAlvoRef.current;
    if (!arquivo || !alvo) return;
    setReenviandoId(alvo.id);
    setErro('');
    try {
      const fd = new FormData();
      fd.append('arquivo', arquivo);
      if (alvo.descricao) fd.append('descricao', alvo.descricao);
      const r = await api.post(`/cards/${cardId}/anexos`, fd, {
        headers: { 'Content-Type': 'multipart/form-data' },
        timeout: 60_000,
      });
      // Remove o registro antigo (arquivo perdido). Best-effort.
      try { await api.delete(`/cards/${cardId}/anexos/${alvo.id}`); } catch { /* ignora */ }
      setAnexos((as) => [r.data, ...as.filter((a) => a.id !== alvo.id)]);
      setPerdidos((s) => { const n = new Set(s); n.delete(alvo.id); return n; });
      avisar();
    } catch (err) {
      setErro(mensagemDeErro(err));
    } finally {
      setReenviandoId(null);
      reenviarAlvoRef.current = null;
      if (reenviarRef.current) reenviarRef.current.value = '';
    }
  }

  async function excluir(anexo) {
    if (!confirm(`Excluir o anexo "${anexo.nome_original}"?`)) return;
    try {
      await api.delete(`/cards/${cardId}/anexos/${anexo.id}`);
      setAnexos((as) => as.filter((a) => a.id !== anexo.id));
      setPerdidos((s) => { const n = new Set(s); n.delete(anexo.id); return n; });
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
          {/* input dedicado ao fluxo de reenvio de anexo perdido */}
          <input
            ref={reenviarRef}
            type="file"
            className="hidden"
            onChange={(e) => reenviar(e.target.files?.[0])}
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
