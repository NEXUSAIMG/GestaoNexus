import { useRef, useState } from 'react';
import { Paperclip, Download, Trash2, Loader2, Upload, AlertCircle } from 'lucide-react';
import { api, BASE_URL, mensagemDeErro } from '../api/client.js';

/**
 * Campo de Comprovante — Sprint 7.
 *
 * Componente reusável para anexar/baixar/remover comprovantes financeiros
 * em movimentos de sócios e contas a pagar. Usa os endpoints
 * `/api/<recurso>/:id/comprovante` (POST, GET, DELETE).
 *
 * Props:
 *   recurso     'movimentos-socios' | 'contas-pagar'
 *   id          uuid do registro
 *   comprovante { nome, tamanho, mime } | null  (estado atual)
 *   podeEditar  bool (admin)
 *   aoMudar     callback opcional, chamado após upload/delete bem-sucedido
 *               recebe o novo estado de comprovante (ou null se removeu)
 *
 * Comportamento:
 *  - Se não tem arquivo: mostra área de drop "Anexar comprovante"
 *  - Se tem: mostra o nome + tamanho + botão baixar (e remover se admin)
 *  - Validação de tamanho/tipo é no backend; aqui só envia
 *  - Aceita PDF, PNG, JPG, JPEG, WebP
 */
export default function CampoComprovante({
  recurso,
  id,
  comprovante,
  podeEditar = false,
  aoMudar,
}) {
  const [enviando, setEnviando] = useState(false);
  const [removendo, setRemovendo] = useState(false);
  const [erro, setErro] = useState('');
  const inputRef = useRef(null);

  const baseUrl = `${BASE_URL}/${recurso}/${id}/comprovante`;
  const tem = !!comprovante?.nome;

  function escolher() {
    if (!podeEditar || enviando || removendo) return;
    inputRef.current?.click();
  }

  async function aoSelecionarArquivo(e) {
    const arquivo = e.target.files?.[0];
    if (!arquivo) return;
    e.target.value = ''; // permite reanexar o mesmo arquivo depois

    setErro('');
    setEnviando(true);
    try {
      const fd = new FormData();
      fd.append('arquivo', arquivo);
      const r = await api.post(`/${recurso}/${id}/comprovante`, fd, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
      // Backend retorna { id, comprovante_nome, comprovante_tamanho, comprovante_mime, tem_comprovante }
      const novo = {
        nome: r.data.comprovante_nome,
        tamanho: r.data.comprovante_tamanho,
        mime: r.data.comprovante_mime,
      };
      aoMudar?.(novo);
    } catch (err) {
      setErro(mensagemDeErro(err, 'Não consegui enviar o arquivo.'));
    } finally {
      setEnviando(false);
    }
  }

  async function remover() {
    if (!podeEditar) return;
    if (!window.confirm('Remover o comprovante?')) return;
    setErro('');
    setRemovendo(true);
    try {
      await api.delete(`/${recurso}/${id}/comprovante`);
      aoMudar?.(null);
    } catch (err) {
      setErro(mensagemDeErro(err, 'Não consegui remover o arquivo.'));
    } finally {
      setRemovendo(false);
    }
  }

  // ESTADO 1: tem arquivo anexado
  if (tem) {
    return (
      <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
        <div className="flex items-center gap-3">
          <Paperclip size={16} className="shrink-0 text-slate-500" />
          <div className="min-w-0 flex-1">
            <div className="truncate text-sm font-medium text-slate-900">
              {comprovante.nome}
            </div>
            <div className="text-xs text-slate-500">
              {formatarTamanho(comprovante.tamanho)}
              {comprovante.mime ? ` · ${rotuloMime(comprovante.mime)}` : ''}
            </div>
          </div>

          {/* Baixar usa <a target="_blank"> direto pra o stream do backend */}
          <a
            href={baseUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 rounded-md border border-slate-300 bg-white px-2.5 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50"
            title="Baixar"
          >
            <Download size={13} />
            Baixar
          </a>

          {podeEditar && (
            <>
              <button
                type="button"
                onClick={escolher}
                disabled={enviando || removendo}
                className="inline-flex items-center gap-1.5 rounded-md border border-slate-300 bg-white px-2.5 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-60"
                title="Substituir"
              >
                {enviando ? <Loader2 size={13} className="animate-spin" /> : <Upload size={13} />}
                {enviando ? 'Enviando…' : 'Substituir'}
              </button>
              <button
                type="button"
                onClick={remover}
                disabled={enviando || removendo}
                className="inline-flex items-center gap-1.5 rounded-md border border-red-200 bg-white px-2.5 py-1.5 text-xs font-medium text-red-700 hover:bg-red-50 disabled:opacity-60"
                title="Remover"
              >
                {removendo ? <Loader2 size={13} className="animate-spin" /> : <Trash2 size={13} />}
              </button>
            </>
          )}
        </div>

        {erro && (
          <div className="mt-2 flex items-start gap-1.5 text-xs text-red-700">
            <AlertCircle size={12} className="mt-0.5 shrink-0" />
            <span>{erro}</span>
          </div>
        )}

        <input
          ref={inputRef}
          type="file"
          accept=".pdf,.png,.jpg,.jpeg,.webp,application/pdf,image/png,image/jpeg,image/webp"
          onChange={aoSelecionarArquivo}
          className="hidden"
        />
      </div>
    );
  }

  // ESTADO 2: sem arquivo, leitor (não-admin)
  if (!podeEditar) {
    return (
      <div className="rounded-lg border border-dashed border-slate-200 bg-slate-50 p-3 text-center text-xs text-slate-500">
        Sem comprovante anexado.
      </div>
    );
  }

  // ESTADO 3: sem arquivo, admin pode anexar
  return (
    <>
      <button
        type="button"
        onClick={escolher}
        disabled={enviando}
        className="flex w-full items-center justify-center gap-2 rounded-lg border border-dashed border-slate-300 bg-white px-3 py-3 text-sm text-slate-600 transition-colors hover:border-nexus-400 hover:bg-nexus-50/40 hover:text-nexus-700 disabled:opacity-60"
      >
        {enviando ? (
          <>
            <Loader2 size={15} className="animate-spin" />
            Enviando arquivo…
          </>
        ) : (
          <>
            <Paperclip size={15} />
            Anexar comprovante (PDF ou imagem)
          </>
        )}
      </button>

      {erro && (
        <div className="mt-2 flex items-start gap-1.5 text-xs text-red-700">
          <AlertCircle size={12} className="mt-0.5 shrink-0" />
          <span>{erro}</span>
        </div>
      )}

      <input
        ref={inputRef}
        type="file"
        accept=".pdf,.png,.jpg,.jpeg,.webp,application/pdf,image/png,image/jpeg,image/webp"
        onChange={aoSelecionarArquivo}
        className="hidden"
      />
    </>
  );
}

function formatarTamanho(bytes) {
  if (bytes == null) return '';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function rotuloMime(mime) {
  if (!mime) return '';
  if (mime === 'application/pdf') return 'PDF';
  if (mime.startsWith('image/')) return mime.replace('image/', '').toUpperCase();
  return mime;
}
