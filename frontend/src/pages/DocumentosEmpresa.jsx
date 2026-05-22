import { useEffect, useRef, useState } from 'react';
import {
  Plus, Search, FileText, Download, Pencil, Trash2, Upload, X,
} from 'lucide-react';
import { api, mensagemDeErro } from '../api/client.js';
import { useAuth } from '../context/AuthContext.jsx';

/**
 * Documentos da empresa — Sprint 21A (item 6.1 da spec).
 *
 * Lista de documentos institucionais com upload, download, edição e
 * exclusão. Apenas admin gerencia; qualquer pessoa logada visualiza/baixa.
 */

// Categorias sugeridas (string livre no banco, mas a UI usa enum visual)
const CATEGORIAS = [
  { valor: 'estatuto',   rotulo: 'Estatuto' },
  { valor: 'regimento',  rotulo: 'Regimento Interno' },
  { valor: 'certidao',   rotulo: 'Certidão' },
  { valor: 'alvara',     rotulo: 'Alvará' },
  { valor: 'politica',   rotulo: 'Política Interna' },
  { valor: 'procuracao', rotulo: 'Procuração' },
  { valor: 'outro',      rotulo: 'Outro' },
];

function rotuloCategoria(v) { return CATEGORIAS.find((c) => c.valor === v)?.rotulo || v; }

function formatarTamanho(bytes) {
  if (!bytes) return '';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

const inputCls = 'w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm shadow-sm outline-none focus:border-nexus-500 focus:ring-2 focus:ring-nexus-200';

export default function DocumentosEmpresa() {
  const { pessoa } = useAuth();
  const admin = !!pessoa?.administrador;

  const [documentos, setDocumentos] = useState([]);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState('');

  // Sprint 30 — gate de versão + debounce isolado pro campo busca.
  const carregaIdRef = useRef(0);

  const [filtroBusca, setFiltroBusca] = useState('');
  // Debounced (350ms) — select de categoria dispara imediato.
  const [filtroBuscaDebounced, setFiltroBuscaDebounced] = useState('');
  const [filtroCategoria, setFiltroCategoria] = useState('');

  const [modal, setModal] = useState(null); // null | { modo: 'criar' } | { modo: 'editar', documento }

  async function carregar() {
    const meuId = ++carregaIdRef.current;
    setCarregando(true);
    setErro('');
    try {
      const params = {};
      if (filtroBuscaDebounced.trim()) params.busca = filtroBuscaDebounced.trim();
      if (filtroCategoria) params.categoria = filtroCategoria;
      const r = await api.get('/documentos-empresa', { params });
      // Descarta se outro carregar() começou enquanto este esperava.
      if (meuId !== carregaIdRef.current) return;
      setDocumentos(r.data);
    } catch (err) {
      if (meuId === carregaIdRef.current) {
        setErro(mensagemDeErro(err, 'Não consegui carregar os documentos.'));
      }
    } finally {
      if (meuId === carregaIdRef.current) {
        setCarregando(false);
      }
    }
  }

  useEffect(() => {
    const id = setTimeout(() => setFiltroBuscaDebounced(filtroBusca), 350);
    return () => clearTimeout(id);
  }, [filtroBusca]);

  useEffect(() => {
    carregar();
    // eslint-disable-next-line
  }, [filtroBuscaDebounced, filtroCategoria]);

  async function baixar(doc) {
    try {
      const r = await api.get(`/documentos-empresa/${doc.id}/arquivo`, {
        responseType: 'blob',
      });
      const url = window.URL.createObjectURL(new Blob([r.data]));
      const a = document.createElement('a');
      a.href = url;
      a.download = doc.arquivo_nome || 'documento';
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      window.URL.revokeObjectURL(url);
    } catch (err) {
      alert(mensagemDeErro(err, 'Não consegui baixar o arquivo.'));
    }
  }

  async function excluir(doc) {
    if (!confirm(`Excluir permanentemente "${doc.titulo}"?\nO arquivo também será apagado do servidor.`)) return;
    try {
      await api.delete(`/documentos-empresa/${doc.id}`);
      carregar();
    } catch (err) {
      alert(mensagemDeErro(err));
    }
  }

  // Agrupa por categoria pra exibir
  const porCategoria = documentos.reduce((acc, d) => {
    const cat = d.categoria || 'outro';
    if (!acc[cat]) acc[cat] = [];
    acc[cat].push(d);
    return acc;
  }, {});

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 className="text-lg font-semibold text-slate-900">Documentos da empresa</h2>
          <p className="text-xs text-slate-500">
            Documentos institucionais (estatuto, regimento, certidões, políticas, alvarás, procurações).
          </p>
        </div>
        {admin && (
          <button
            type="button"
            onClick={() => setModal({ modo: 'criar' })}
            className="inline-flex items-center gap-1.5 rounded-lg bg-nexus-700 px-3 py-1.5 text-sm font-medium text-white hover:bg-nexus-800"
          >
            <Plus size={14} /> Novo documento
          </button>
        )}
      </div>

      <div className="flex flex-wrap items-center gap-2 rounded-lg border border-slate-200 bg-white p-3">
        <div className="relative flex-1 min-w-[200px]">
          <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            type="text"
            placeholder="Buscar por título ou descrição…"
            value={filtroBusca}
            onChange={(e) => setFiltroBusca(e.target.value)}
            className="w-full rounded-md border border-slate-300 bg-white pl-8 pr-3 py-1.5 text-sm outline-none focus:border-nexus-500 focus:ring-2 focus:ring-nexus-200"
          />
        </div>
        <select
          className="rounded-md border border-slate-300 bg-white px-2 py-1.5 text-sm text-slate-700"
          value={filtroCategoria}
          onChange={(e) => setFiltroCategoria(e.target.value)}
        >
          <option value="">Todas as categorias</option>
          {CATEGORIAS.map((c) => (<option key={c.valor} value={c.valor}>{c.rotulo}</option>))}
        </select>
      </div>

      {erro && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{erro}</div>
      )}

      {carregando ? (
        <div className="py-8 text-center text-sm text-slate-500">Carregando…</div>
      ) : documentos.length === 0 ? (
        <div className="rounded-xl border border-dashed border-slate-300 bg-white py-12 text-center">
          <FileText size={32} className="mx-auto text-slate-300" />
          <p className="mt-2 text-sm font-medium text-slate-700">
            {filtroBusca || filtroCategoria
              ? 'Nenhum documento com esses filtros.'
              : 'Nenhum documento cadastrado ainda.'}
          </p>
          {admin && !filtroBusca && !filtroCategoria && (
            <button
              type="button"
              onClick={() => setModal({ modo: 'criar' })}
              className="mt-3 inline-flex items-center gap-1 rounded-lg bg-nexus-700 px-3 py-1.5 text-sm font-medium text-white hover:bg-nexus-800"
            >
              <Plus size={13} /> Cadastrar primeiro documento
            </button>
          )}
        </div>
      ) : (
        <div className="space-y-4">
          {Object.entries(porCategoria).map(([cat, docs]) => (
            <section key={cat} className="rounded-xl border border-slate-200 bg-white shadow-sm">
              <header className="border-b border-slate-100 px-4 py-2">
                <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-500">
                  {rotuloCategoria(cat)} <span className="text-slate-400">({docs.length})</span>
                </h3>
              </header>
              <ul className="divide-y divide-slate-100">
                {docs.map((d) => (
                  <li key={d.id} className="flex items-center gap-3 px-4 py-3 hover:bg-slate-50/60">
                    <FileText size={18} className="shrink-0 text-slate-400" />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-medium text-slate-900">{d.titulo}</span>
                        {d.tem_arquivo && (
                          <span className="text-[10px] text-slate-400 tabular-nums">
                            {formatarTamanho(d.arquivo_tamanho)}
                          </span>
                        )}
                      </div>
                      {d.descricao && (
                        <p className="mt-0.5 text-xs text-slate-600 line-clamp-2">{d.descricao}</p>
                      )}
                      <p className="mt-0.5 text-[10px] text-slate-400">
                        Adicionado por {d.criado_por_nome || 'sistema'} ·{' '}
                        {new Date(d.criado_em).toLocaleDateString('pt-BR')}
                      </p>
                    </div>
                    <div className="flex items-center gap-0.5">
                      {d.tem_arquivo ? (
                        <button
                          type="button"
                          onClick={() => baixar(d)}
                          className="inline-flex items-center gap-1 rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50"
                          title="Baixar arquivo"
                        >
                          <Download size={11} /> Baixar
                        </button>
                      ) : (
                        <span className="text-[10px] text-slate-400 italic px-2">sem arquivo</span>
                      )}
                      {admin && (
                        <>
                          <button
                            type="button"
                            onClick={() => setModal({ modo: 'editar', documento: d })}
                            className="rounded p-1.5 text-slate-500 hover:bg-slate-100 hover:text-slate-900"
                            title="Editar"
                          >
                            <Pencil size={12} />
                          </button>
                          <button
                            type="button"
                            onClick={() => excluir(d)}
                            className="rounded p-1.5 text-slate-400 hover:bg-red-50 hover:text-red-700"
                            title="Excluir"
                          >
                            <Trash2 size={12} />
                          </button>
                        </>
                      )}
                    </div>
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </div>
      )}

      {modal && (
        <ModalDocumento
          modo={modal.modo}
          documento={modal.documento}
          onFechar={() => setModal(null)}
          onSalvo={() => { setModal(null); carregar(); }}
        />
      )}
    </div>
  );
}

// =============================================================================
// Modal Novo / Editar
// =============================================================================

function ModalDocumento({ modo, documento, onFechar, onSalvo }) {
  const editando = modo === 'editar';

  const [titulo, setTitulo] = useState(documento?.titulo || '');
  const [descricao, setDescricao] = useState(documento?.descricao || '');
  const [categoria, setCategoria] = useState(documento?.categoria || 'estatuto');
  const [arquivo, setArquivo] = useState(null); // File ou null
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState('');

  async function submeter(e) {
    e.preventDefault();
    setErro('');
    setSalvando(true);
    try {
      if (editando) {
        // Atualiza dados textuais
        await api.put(`/documentos-empresa/${documento.id}`, {
          titulo: titulo.trim(),
          descricao: descricao.trim() || null,
          categoria,
        });
        // Se trocou o arquivo, sobe novo
        if (arquivo) {
          const fd = new FormData();
          fd.append('arquivo', arquivo);
          await api.post(`/documentos-empresa/${documento.id}/arquivo`, fd, {
            headers: { 'Content-Type': 'multipart/form-data' },
          });
        }
      } else {
        // Criação: tudo num único POST multipart
        const fd = new FormData();
        fd.append('titulo', titulo.trim());
        if (descricao.trim()) fd.append('descricao', descricao.trim());
        fd.append('categoria', categoria);
        if (arquivo) fd.append('arquivo', arquivo);
        await api.post('/documentos-empresa', fd, {
          headers: { 'Content-Type': 'multipart/form-data' },
        });
      }
      onSalvo();
    } catch (err) {
      setErro(mensagemDeErro(err));
    } finally {
      setSalvando(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4">
      <div className="w-full max-w-xl rounded-xl bg-white shadow-xl">
        <header className="flex items-center justify-between border-b border-slate-200 px-5 py-3">
          <h2 className="text-base font-semibold text-slate-900">
            {editando ? `Editar: ${documento.titulo}` : 'Novo documento'}
          </h2>
          <button type="button" onClick={onFechar}
            className="rounded p-1 text-slate-400 hover:bg-slate-100">
            <X size={18} />
          </button>
        </header>

        <form onSubmit={submeter} className="p-5 space-y-3 max-h-[80vh] overflow-y-auto">
          <div>
            <label className="block text-sm font-medium text-slate-900 mb-1">
              Título<span className="text-red-600">*</span>
            </label>
            <input className={inputCls} value={titulo} onChange={(e) => setTitulo(e.target.value)}
              required autoFocus maxLength={255}
              placeholder="Ex: Estatuto Social Consolidado 2024" />
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-900 mb-1">
              Categoria<span className="text-red-600">*</span>
            </label>
            <select className={inputCls} value={categoria} onChange={(e) => setCategoria(e.target.value)} required>
              {CATEGORIAS.map((c) => (<option key={c.valor} value={c.valor}>{c.rotulo}</option>))}
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-900 mb-1">Descrição</label>
            <textarea className={inputCls} rows={3}
              value={descricao} onChange={(e) => setDescricao(e.target.value)}
              maxLength={10000}
              placeholder="Notas, contexto, número da revisão…" />
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-900 mb-1">
              Arquivo {editando && documento?.tem_arquivo && (
                <span className="text-xs font-normal text-slate-500">
                  (atual: {documento.arquivo_nome} · {formatarTamanho(documento.arquivo_tamanho)})
                </span>
              )}
            </label>
            <label className="flex items-center gap-2 rounded-lg border border-dashed border-slate-300 bg-slate-50 px-3 py-2 text-sm cursor-pointer hover:border-nexus-300 hover:bg-nexus-50/30">
              <Upload size={14} className="text-slate-400" />
              <span className="flex-1 text-slate-600 truncate">
                {arquivo ? arquivo.name : (editando ? 'Trocar arquivo (deixe vazio pra manter o atual)' : 'Escolher arquivo')}
              </span>
              <input
                type="file"
                className="hidden"
                accept=".pdf,.png,.jpg,.jpeg,.webp,.doc,.docx"
                onChange={(e) => setArquivo(e.target.files?.[0] || null)}
              />
            </label>
            <p className="mt-1 text-[11px] text-slate-500">
              Aceitos: PDF, imagens (PNG/JPG/WebP), Word (.doc, .docx).
            </p>
          </div>

          {erro && (
            <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{erro}</div>
          )}

          <div className="flex justify-end gap-2 border-t border-slate-100 pt-3">
            <button type="button" onClick={onFechar}
              className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50">
              Cancelar
            </button>
            <button type="submit" disabled={salvando}
              className="rounded-lg bg-nexus-700 px-4 py-2 text-sm font-medium text-white hover:bg-nexus-800 disabled:opacity-50">
              {salvando ? 'Salvando…' : (editando ? 'Salvar' : 'Criar')}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
