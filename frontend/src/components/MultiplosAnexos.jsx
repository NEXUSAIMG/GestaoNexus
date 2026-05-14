import { useEffect, useRef, useState } from 'react';
import {
  Paperclip, Upload, Download, Trash2, FileText, Image as ImageIcon, X,
} from 'lucide-react';
import { api, mensagemDeErro } from '../api/client.js';

/**
 * Componente reutilizável de MÚLTIPLOS ANEXOS — Sprint 17.1.
 *
 * Lista, faz upload e permite excluir anexos vinculados a um recurso
 * (ex: uma conta a pagar). Os endpoints REST esperados:
 *
 *   GET    /{recurso}/{id}/anexos
 *   POST   /{recurso}/{id}/anexos                  (multipart: arquivo, tipo, descricao)
 *   GET    /{recurso}/{id}/anexos/{anexoId}/baixar
 *   DELETE /{recurso}/{id}/anexos/{anexoId}
 *
 * Props:
 *   recurso        — caminho relativo na API (ex: 'contas-pagar')
 *   id             — UUID do registro pai
 *   podeEditar     — se false, só lista (admin pode editar)
 *   tiposDisponiveis — array de { v, l } pro select de tipo
 *   accept         — atributo do <input type=file>
 *   aoMudar        — callback opcional que recebe a lista atualizada
 */

const TIPOS_PADRAO = [
  { v: 'boleto',       l: 'Boleto' },
  { v: 'comprovante',  l: 'Comprovante' },
  { v: 'nota_fiscal',  l: 'Nota Fiscal' },
  { v: 'outro',        l: 'Outro' },
];

function fmtTamanho(bytes) {
  if (!bytes) return '';
  const kb = bytes / 1024;
  if (kb < 1000) return `${kb.toFixed(0)} KB`;
  return `${(kb / 1024).toFixed(1)} MB`;
}

function fmtDataHora(iso) {
  if (!iso) return '—';
  return new Date(iso).toLocaleString('pt-BR');
}

function iconePorMime(mime) {
  if (mime?.startsWith('image/')) return ImageIcon;
  return FileText;
}

export default function MultiplosAnexos({
  recurso,
  id,
  podeEditar = false,
  tiposDisponiveis = TIPOS_PADRAO,
  accept = '.pdf,.png,.jpg,.jpeg,.webp,application/pdf,image/*',
  aoMudar,
}) {
  const [anexos, setAnexos] = useState([]);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState('');
  const [tipo, setTipo] = useState(tiposDisponiveis[0]?.v || 'outro');
  const [enviando, setEnviando] = useState(false);
  const inputRef = useRef(null);

  async function carregar() {
    setCarregando(true);
    setErro('');
    try {
      const r = await api.get(`/${recurso}/${id}/anexos`);
      setAnexos(r.data);
      aoMudar?.(r.data);
    } catch (err) {
      setErro(mensagemDeErro(err, 'Não consegui carregar os anexos.'));
    } finally {
      setCarregando(false);
    }
  }

  useEffect(() => {
    if (!id) return;
    carregar();
    /* eslint-disable-next-line */
  }, [id]);

  async function aoEscolherArquivo(e) {
    const arquivo = e.target.files?.[0];
    if (!arquivo) return;
    setEnviando(true);
    setErro('');
    try {
      const fd = new FormData();
      fd.append('arquivo', arquivo);
      fd.append('tipo', tipo);
      await api.post(`/${recurso}/${id}/anexos`, fd, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
      await carregar();
    } catch (err) {
      setErro(mensagemDeErro(err, 'Falha ao enviar.'));
    } finally {
      setEnviando(false);
      if (inputRef.current) inputRef.current.value = '';
    }
  }

  async function excluir(anexo) {
    if (!confirm(`Excluir "${anexo.nome_original}"?`)) return;
    try {
      await api.delete(`/${recurso}/${id}/anexos/${anexo.id}`);
      await carregar();
    } catch (err) {
      alert(mensagemDeErro(err, 'Falha ao excluir.'));
    }
  }

  function urlBaixar(anexo) {
    return `${api.defaults.baseURL}/${recurso}/${id}/anexos/${anexo.id}/baixar`;
  }

  const rotuloTipo = (v) =>
    tiposDisponiveis.find((t) => t.v === v)?.l || v;

  return (
    <div className="space-y-3">
      {podeEditar && (
        <div className="rounded-lg border border-slate-200 bg-slate-50/60 p-3">
          <div className="flex items-center gap-1.5 text-xs font-medium text-slate-700 mb-2">
            <Upload size={12} />
            Adicionar arquivo
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            <select
              value={tipo}
              onChange={(e) => setTipo(e.target.value)}
              disabled={enviando}
              className="rounded-lg border border-slate-300 bg-white px-2 py-1.5 text-sm"
            >
              {tiposDisponiveis.map((t) => (
                <option key={t.v} value={t.v}>{t.l}</option>
              ))}
            </select>
            <input
              ref={inputRef}
              type="file"
              accept={accept}
              onChange={aoEscolherArquivo}
              disabled={enviando}
              className="block flex-1 min-w-[12rem] text-sm file:mr-3 file:rounded-lg file:border-0 file:bg-nexus-700 file:px-3 file:py-1.5 file:text-sm file:font-medium file:text-white hover:file:bg-nexus-800 file:cursor-pointer"
            />
            {enviando && <span className="text-xs text-slate-500">Enviando...</span>}
          </div>
          <p className="mt-1.5 text-[11px] text-slate-500">
            PDF ou imagem (PNG/JPG/WebP), até 10 MB.
          </p>
        </div>
      )}

      {erro && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">
          {erro}
        </div>
      )}

      {carregando ? (
        <div className="text-xs text-slate-500">Carregando anexos...</div>
      ) : anexos.length === 0 ? (
        <div className="rounded-lg border border-dashed border-slate-300 bg-white px-4 py-4 text-center text-xs text-slate-500">
          <Paperclip size={16} className="inline mr-1 text-slate-300" />
          Nenhum anexo ainda.
        </div>
      ) : (
        <ul className="space-y-1.5">
          {anexos.map((a) => {
            const Icone = iconePorMime(a.mime_type);
            return (
              <li
                key={a.id}
                className="flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2"
              >
                <div className="rounded bg-slate-100 p-1.5 text-slate-600">
                  <Icone size={14} />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-1.5">
                    <span className="text-sm text-slate-900 truncate">
                      {a.nome_original}
                    </span>
                    <span className="text-[9px] uppercase rounded bg-slate-100 px-1 py-0.5 text-slate-600 font-medium">
                      {rotuloTipo(a.tipo)}
                    </span>
                  </div>
                  <div className="text-[10px] text-slate-500">
                    {fmtTamanho(a.tamanho_bytes)} · {a.enviado_por_nome || '—'} em {fmtDataHora(a.criado_em)}
                  </div>
                </div>
                <a
                  href={urlBaixar(a)}
                  target="_blank" rel="noreferrer"
                  className="rounded p-1.5 text-slate-500 hover:bg-slate-100 hover:text-slate-700"
                  title="Abrir / baixar"
                >
                  <Download size={13} />
                </a>
                {podeEditar && (
                  <button
                    onClick={() => excluir(a)}
                    type="button"
                    className="rounded p-1.5 text-red-500 hover:bg-red-50"
                    title="Excluir"
                  >
                    <Trash2 size={13} />
                  </button>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
