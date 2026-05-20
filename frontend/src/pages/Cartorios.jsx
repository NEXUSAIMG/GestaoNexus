import { useEffect, useMemo, useState } from 'react';
import {
  Plus, Search, Building2, MapPin, Phone, Mail, Pencil, Archive,
  ChevronDown, X,
} from 'lucide-react';
import { api, mensagemDeErro } from '../api/client.js';

/**
 * Cartórios — Sprint 20A.
 *
 * Lista + criação/edição/arquivamento via modal. Responsáveis, vínculos
 * a quadros e histórico ficam pra Sprint 20B (página de detalhe).
 */

const TIPOS = [
  { valor: 'notas',               rotulo: 'Notas' },
  { valor: 'imoveis',             rotulo: 'Imóveis' },
  { valor: 'protesto',            rotulo: 'Protesto' },
  { valor: 'civil',               rotulo: 'Civil' },
  { valor: 'titulos_documentos',  rotulo: 'Títulos e Documentos' },
  { valor: 'outro',               rotulo: 'Outro' },
];

const STATUS = [
  { valor: 'ativo',           rotulo: 'Ativo',           cor: 'bg-emerald-100 text-emerald-800 border-emerald-200' },
  { valor: 'em_implantacao',  rotulo: 'Em implantação',  cor: 'bg-amber-100 text-amber-800 border-amber-200' },
  { valor: 'inativo',         rotulo: 'Inativo',         cor: 'bg-slate-100 text-slate-700 border-slate-200' },
];

const UFS = [
  'AC', 'AL', 'AM', 'AP', 'BA', 'CE', 'DF', 'ES', 'GO', 'MA', 'MG', 'MS',
  'MT', 'PA', 'PB', 'PE', 'PI', 'PR', 'RJ', 'RN', 'RO', 'RR', 'RS', 'SC',
  'SE', 'SP', 'TO',
];

function rotuloTipo(t) { return TIPOS.find((x) => x.valor === t)?.rotulo || t; }
function statusInfo(s) { return STATUS.find((x) => x.valor === s) || STATUS[0]; }

function iniciais(nome) {
  return (nome || '?').split(' ').filter(Boolean).slice(0, 2).map((p) => p[0]?.toUpperCase()).join('');
}

export default function Cartorios() {
  const [cartorios, setCartorios] = useState([]);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState('');

  // Filtros
  const [filtroBusca, setFiltroBusca] = useState('');
  const [filtroStatus, setFiltroStatus] = useState('');
  const [filtroTipo, setFiltroTipo] = useState('');

  const [modal, setModal] = useState(null); // null | { modo: 'criar' } | { modo: 'editar', cartorio }

  async function carregar() {
    setCarregando(true);
    setErro('');
    try {
      const params = {};
      if (filtroStatus) params.status = filtroStatus;
      if (filtroTipo) params.tipo = filtroTipo;
      if (filtroBusca.trim()) params.busca = filtroBusca.trim();
      const r = await api.get('/cartorios', { params });
      setCartorios(r.data);
    } catch (err) {
      setErro(mensagemDeErro(err, 'Não consegui carregar os cartórios.'));
    } finally {
      setCarregando(false);
    }
  }

  useEffect(() => {
    const id = setTimeout(carregar, 250); // debounce na busca
    return () => clearTimeout(id);
    // eslint-disable-next-line
  }, [filtroBusca, filtroStatus, filtroTipo]);

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
      {/* Header */}
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

      {/* Filtros */}
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
          {STATUS.map((s) => (<option key={s.valor} value={s.valor}>{s.rotulo}</option>))}
        </select>

        <select
          className="rounded-md border border-slate-300 bg-white px-2 py-1.5 text-sm text-slate-700"
          value={filtroTipo}
          onChange={(e) => setFiltroTipo(e.target.value)}
        >
          <option value="">Todos os tipos</option>
          {TIPOS.map((t) => (<option key={t.valor} value={t.valor}>{t.rotulo}</option>))}
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

      {/* Lista */}
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
                    onClick={() => setModal({ modo: 'editar', cartorio: c })}
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
                          title="Editar"
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

      {/* Hint sobre a página de detalhe (Sprint 20B) */}
      {cartorios.length > 0 && (
        <p className="text-xs text-slate-500">
          💡 Responsáveis, vínculos com quadros e histórico de atualizações ficarão disponíveis
          na página de detalhe (em construção).
        </p>
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

// =============================================================================
// Modal Novo / Editar
// =============================================================================

function ModalCartorio({ modo, cartorio, onFechar, onSalvo }) {
  const editando = modo === 'editar';

  const [nome, setNome] = useState(cartorio?.nome || '');
  const [tipo, setTipo] = useState(cartorio?.tipo || 'notas');
  const [cidade, setCidade] = useState(cartorio?.cidade || '');
  const [uf, setUf] = useState(cartorio?.uf || '');
  const [status, setStatus] = useState(cartorio?.status || 'em_implantacao');
  const [telefone, setTelefone] = useState(cartorio?.telefone || '');
  const [email, setEmail] = useState(cartorio?.email || '');
  const [especificidades, setEspecificidades] = useState(cartorio?.especificidades || '');

  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState('');

  async function submeter(e) {
    e.preventDefault();
    setErro('');
    setSalvando(true);
    try {
      const body = {
        nome: nome.trim(),
        tipo,
        cidade: cidade.trim() || null,
        uf: uf.trim().toUpperCase() || null,
        status,
        telefone: telefone.trim() || null,
        email: email.trim() || null,
        especificidades: especificidades.trim() || null,
      };
      if (editando) {
        await api.put(`/cartorios/${cartorio.id}`, body);
      } else {
        await api.post('/cartorios', body);
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
            {editando ? `Editar: ${cartorio.nome}` : 'Novo cartório'}
          </h2>
          <button type="button" onClick={onFechar}
            className="rounded p-1 text-slate-400 hover:bg-slate-100">
            <X size={18} />
          </button>
        </header>

        <form onSubmit={submeter} className="p-5 space-y-3 max-h-[80vh] overflow-y-auto">
          <div>
            <label className="block text-sm font-medium text-slate-900 mb-1">
              Nome<span className="text-red-600">*</span>
            </label>
            <input
              className={inputCls}
              value={nome} onChange={(e) => setNome(e.target.value)}
              maxLength={255} required autoFocus
              placeholder="Ex: 1º Tabelionato de Notas de São Paulo"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-medium text-slate-900 mb-1">Tipo<span className="text-red-600">*</span></label>
              <select className={inputCls} value={tipo} onChange={(e) => setTipo(e.target.value)} required>
                {TIPOS.map((t) => (<option key={t.valor} value={t.valor}>{t.rotulo}</option>))}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-900 mb-1">Status</label>
              <select className={inputCls} value={status} onChange={(e) => setStatus(e.target.value)}>
                {STATUS.map((s) => (<option key={s.valor} value={s.valor}>{s.rotulo}</option>))}
              </select>
            </div>
          </div>

          <div className="grid grid-cols-3 gap-3">
            <div className="col-span-2">
              <label className="block text-sm font-medium text-slate-900 mb-1">Cidade</label>
              <input className={inputCls} value={cidade} onChange={(e) => setCidade(e.target.value)} maxLength={100} />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-900 mb-1">UF</label>
              <select className={inputCls} value={uf} onChange={(e) => setUf(e.target.value)}>
                <option value="">—</option>
                {UFS.map((u) => (<option key={u} value={u}>{u}</option>))}
              </select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-medium text-slate-900 mb-1">Telefone</label>
              <input className={inputCls} value={telefone} onChange={(e) => setTelefone(e.target.value)}
                maxLength={40} placeholder="(11) 0000-0000" />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-900 mb-1">Email</label>
              <input type="email" className={inputCls} value={email} onChange={(e) => setEmail(e.target.value)}
                maxLength={255} placeholder="contato@cartorio.com.br" />
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-900 mb-1">Especificidades</label>
            <textarea
              className={inputCls}
              rows={4}
              value={especificidades} onChange={(e) => setEspecificidades(e.target.value)}
              maxLength={10000}
              placeholder="Horário de funcionamento, peculiaridades operacionais, atendimento especial..."
            />
          </div>

          {erro && (
            <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{erro}</div>
          )}

          <div className="flex justify-end gap-2 pt-2 border-t border-slate-100">
            <button type="button" onClick={onFechar}
              className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50">
              Cancelar
            </button>
            <button type="submit" disabled={salvando}
              className="rounded-lg bg-nexus-700 px-4 py-2 text-sm font-medium text-white hover:bg-nexus-800 disabled:opacity-50">
              {salvando ? 'Salvando…' : (editando ? 'Salvar' : 'Criar cartório')}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

const inputCls = 'w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm shadow-sm outline-none focus:border-nexus-500 focus:ring-2 focus:ring-nexus-200';
