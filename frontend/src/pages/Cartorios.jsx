import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Plus, Search, Building2, MapPin, Mail, Pencil, Archive, X,
} from 'lucide-react';
import { api, mensagemDeErro } from '../api/client.js';
import ModalCartorio, { TIPOS_CARTORIO, STATUS_CARTORIO } from '../components/ModalCartorio.jsx';

/**
 * Cartórios — Sprint 20A (lista) + Sprint 20B (click navega pro detalhe).
 *
 * Click numa linha → /cartorios/:id (página de detalhe).
 * Botão lápis → modal de edição rápida (sem sair da lista).
 */

function rotuloTipo(t) { return TIPOS_CARTORIO.find((x) => x.valor === t)?.rotulo || t; }
function statusInfo(s) { return STATUS_CARTORIO.find((x) => x.valor === s) || STATUS_CARTORIO[0]; }

function iniciais(nome) {
  return (nome || '?').split(' ').filter(Boolean).slice(0, 2).map((p) => p[0]?.toUpperCase()).join('');
}

export default function Cartorios() {
  const navigate = useNavigate();
  const [cartorios, setCartorios] = useState([]);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState('');

  // Sprint 30 — gate de versão + debounce isolado pro campo busca.
  const carregaIdRef = useRef(0);

  // Filtros
  const [filtroBusca, setFiltroBusca] = useState('');
  // Debounced (350ms) — selects disparam imediato.
  const [filtroBuscaDebounced, setFiltroBuscaDebounced] = useState('');
  const [filtroStatus, setFiltroStatus] = useState('');
  const [filtroTipo, setFiltroTipo] = useState('');

  const [modal, setModal] = useState(null); // null | { modo: 'criar' } | { modo: 'editar', cartorio }

  async function carregar() {
    const meuId = ++carregaIdRef.current;
    setCarregando(true);
    setErro('');
    try {
      const params = {};
      if (filtroStatus) params.status = filtroStatus;
      if (filtroTipo) params.tipo = filtroTipo;
      if (filtroBuscaDebounced.trim()) params.busca = filtroBuscaDebounced.trim();
      const r = await api.get('/cartorios', { params });
      // Descarta se outro carregar() começou enquanto este esperava.
      if (meuId !== carregaIdRef.current) return;
      setCartorios(r.data);
    } catch (err) {
      if (meuId === carregaIdRef.current) {
        setErro(mensagemDeErro(err, 'Não consegui carregar os cartórios.'));
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
  }, [filtroBuscaDebounced, filtroStatus, filtroTipo]);

  async function arquivar(c) {
    if (!confirm(`Arquivar o cartório "${c.nome}"?\nEle some da listagem mas pode ser desarquivado depois (via banco).`)) return;
    try {
      await api.post(`/cartorios/${c.id}/arquivar`);
      carregar();
    } catch (err) {
      alert(mensagemDeErro(err));
    }
  }

  const algumFiltroAtivo = filtroBusca || filtroStatus || filtroTipo;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <Building2 size={22} className="text-nexus-700" />
          <h1 className="text-xl font-semibold text-slate-900">Cartórios</h1>
          <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-600">
            {cartorios.length}
          </span>
        </div>

        <button
          type="button"
          onClick={() => setModal({ modo: 'criar' })}
          className="inline-flex items-center gap-2 rounded-lg bg-nexus-700 px-3 py-1.5 text-sm font-medium text-white hover:bg-nexus-800"
        >
          <Plus size={14} /> Novo cartório
        </button>
      </div>

      <div className="flex flex-wrap items-center gap-2 rounded-lg border border-slate-200 bg-white p-3">
        <div className="relative flex-1 min-w-[200px]">
          <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            type="text"
            placeholder="Buscar por nome ou cidade…"
            value={filtroBusca}
            onChange={(e) => setFiltroBusca(e.target.value)}
            className="w-full rounded-md border border-slate-300 bg-white pl-8 pr-3 py-1.5 text-sm outline-none focus:border-nexus-500 focus:ring-2 focus:ring-nexus-200"
          />
        </div>

        <select
          className="rounded-md border border-slate-300 bg-white px-2 py-1.5 text-sm text-slate-700"
          value={filtroStatus}
          onChange={(e) => setFiltroStatus(e.target.value)}
        >
          <option value="">Todos os status</option>
          {STATUS_CARTORIO.map((s) => (<option key={s.valor} value={s.valor}>{s.rotulo}</option>))}
        </select>

        <select
          className="rounded-md border border-slate-300 bg-white px-2 py-1.5 text-sm text-slate-700"
          value={filtroTipo}
          onChange={(e) => setFiltroTipo(e.target.value)}
        >
          <option value="">Todos os tipos</option>
          {TIPOS_CARTORIO.map((t) => (<option key={t.valor} value={t.valor}>{t.rotulo}</option>))}
        </select>

        {algumFiltroAtivo && (
          <button
            type="button"
            onClick={() => { setFiltroBusca(''); setFiltroStatus(''); setFiltroTipo(''); }}
            className="rounded p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700"
            title="Limpar filtros"
          >
            <X size={14} />
          </button>
        )}
      </div>

      {erro && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{erro}</div>
      )}

      {carregando ? (
        <div className="py-8 text-center text-sm text-slate-500">Carregando…</div>
      ) : cartorios.length === 0 ? (
        <div className="rounded-xl border border-dashed border-slate-300 bg-white py-12 text-center">
          <Building2 size={32} className="mx-auto text-slate-300" />
          <p className="mt-2 text-sm font-medium text-slate-700">
            {algumFiltroAtivo ? 'Nenhum cartório com esses filtros.' : 'Nenhum cartório cadastrado.'}
          </p>
          {!algumFiltroAtivo && (
            <button
              type="button"
              onClick={() => setModal({ modo: 'criar' })}
              className="mt-3 inline-flex items-center gap-1 rounded-lg bg-nexus-700 px-3 py-1.5 text-sm font-medium text-white hover:bg-nexus-800"
            >
              <Plus size={13} /> Cadastrar primeiro cartório
            </button>
          )}
        </div>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white shadow-sm">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-left text-[10px] font-semibold uppercase tracking-wider text-slate-500">
              <tr>
                <th className="px-3 py-2">Nome</th>
                <th className="px-3 py-2">Tipo</th>
                <th className="px-3 py-2">Localização</th>
                <th className="px-3 py-2">Status</th>
                <th className="px-3 py-2">Responsáveis</th>
                <th className="px-3 py-2 text-right">Ações</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {cartorios.map((c) => {
                const status = statusInfo(c.status);
                return (
                  <tr
                    key={c.id}
                    className="hover:bg-slate-50/60 cursor-pointer"
                    onClick={() => navigate(`/cartorios/${c.id}`)}
                  >
                    <td className="px-3 py-2.5">
                      <div className="font-medium text-slate-900">{c.nome}</div>
                      {c.email && (
                        <div className="text-[11px] text-slate-500 flex items-center gap-1">
                          <Mail size={10} /> {c.email}
                        </div>
                      )}
                    </td>
                    <td className="px-3 py-2.5">
                      <span className="rounded bg-slate-100 px-1.5 py-0.5 text-[11px] font-medium text-slate-700">
                        {rotuloTipo(c.tipo)}
                      </span>
                    </td>
                    <td className="px-3 py-2.5 text-slate-700">
                      {c.cidade || c.uf ? (
                        <span className="inline-flex items-center gap-1">
                          <MapPin size={11} className="text-slate-400" />
                          {[c.cidade, c.uf].filter(Boolean).join(' / ')}
                        </span>
                      ) : <span className="text-slate-400">—</span>}
                    </td>
                    <td className="px-3 py-2.5">
                      <span className={`inline-flex items-center rounded border px-1.5 py-0.5 text-[10px] font-medium ${status.cor}`}>
                        {status.rotulo}
                      </span>
                    </td>
                    <td className="px-3 py-2.5">
                      {(c.responsaveis || []).length === 0 ? (
                        <span className="text-[11px] text-slate-400">Sem responsável</span>
                      ) : (
                        <div className="flex -space-x-1.5" title={c.responsaveis.map((r) => r.nome).join(', ')}>
                          {c.responsaveis.slice(0, 3).map((r) => (
                            <span
                              key={r.id}
                              className="inline-flex h-6 w-6 items-center justify-center rounded-full bg-nexus-100 text-[10px] font-semibold text-nexus-800 ring-1 ring-white"
                              title={r.nome}
                            >
                              {iniciais(r.nome)}
                            </span>
                          ))}
                          {c.responsaveis.length > 3 && (
                            <span className="inline-flex h-6 w-6 items-center justify-center rounded-full bg-slate-200 text-[10px] font-semibold text-slate-700 ring-1 ring-white">
                              +{c.responsaveis.length - 3}
                            </span>
                          )}
                        </div>
                      )}
                    </td>
                    <td className="px-3 py-2.5 text-right">
                      <div className="inline-flex items-center gap-0.5" onClick={(e) => e.stopPropagation()}>
                        <button
                          type="button"
                          onClick={() => setModal({ modo: 'editar', cartorio: c })}
                          className="rounded p-1.5 text-slate-500 hover:bg-slate-100 hover:text-slate-900"
                          title="Edição rápida"
                        >
                          <Pencil size={13} />
                        </button>
                        <button
                          type="button"
                          onClick={() => arquivar(c)}
                          className="rounded p-1.5 text-slate-400 hover:bg-amber-50 hover:text-amber-700"
                          title="Arquivar"
                        >
                          <Archive size={13} />
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {modal && (
        <ModalCartorio
          modo={modal.modo}
          cartorio={modal.cartorio}
          onFechar={() => setModal(null)}
          onSalvo={() => { setModal(null); carregar(); }}
        />
      )}
    </div>
  );
}
