import { useEffect, useMemo, useState } from 'react';
import { Plus, Edit2, X, Tag, AlertCircle } from 'lucide-react';
import { api, mensagemDeErro } from '../api/client.js';
import { useAuth } from '../context/AuthContext.jsx';

/**
 * CRUD de categorias de despesa — Sprint 3.
 *
 * Usadas para classificar as contas a pagar. Simples: nome, cor, ativo.
 * A migration 004 já cria um conjunto padrão (Folha, Impostos, Aluguel...).
 */

const CORES = [
  'slate', 'red', 'orange', 'amber', 'yellow',
  'lime', 'emerald', 'teal', 'cyan', 'blue',
  'indigo', 'violet', 'fuchsia', 'pink', 'rose',
];

// Mapa pra Tailwind não cortar as classes no build: é preciso que
// as strings apareçam inteiras no código.
const CLASSES_BADGE = {
  slate:   'bg-slate-100 text-slate-800',
  red:     'bg-red-100 text-red-800',
  orange:  'bg-orange-100 text-orange-800',
  amber:   'bg-amber-100 text-amber-800',
  yellow:  'bg-yellow-100 text-yellow-800',
  lime:    'bg-lime-100 text-lime-800',
  emerald: 'bg-emerald-100 text-emerald-800',
  teal:    'bg-teal-100 text-teal-800',
  cyan:    'bg-cyan-100 text-cyan-800',
  blue:    'bg-blue-100 text-blue-800',
  indigo:  'bg-indigo-100 text-indigo-800',
  violet:  'bg-violet-100 text-violet-800',
  fuchsia: 'bg-fuchsia-100 text-fuchsia-800',
  pink:    'bg-pink-100 text-pink-800',
  rose:    'bg-rose-100 text-rose-800',
};

const CLASSES_BOLINHA = {
  slate: 'bg-slate-500', red: 'bg-red-500', orange: 'bg-orange-500',
  amber: 'bg-amber-500', yellow: 'bg-yellow-500', lime: 'bg-lime-500',
  emerald: 'bg-emerald-500', teal: 'bg-teal-500', cyan: 'bg-cyan-500',
  blue: 'bg-blue-500', indigo: 'bg-indigo-500', violet: 'bg-violet-500',
  fuchsia: 'bg-fuchsia-500', pink: 'bg-pink-500', rose: 'bg-rose-500',
};

export function BadgeCategoria({ nome, cor, pequeno = false }) {
  const cl = CLASSES_BADGE[cor] ?? CLASSES_BADGE.slate;
  return (
    <span className={`inline-flex items-center gap-1 rounded-full ${cl} ${pequeno ? 'px-1.5 py-0 text-[10px]' : 'px-2 py-0.5 text-xs'} font-medium`}>
      <Tag size={pequeno ? 8 : 10} />
      {nome}
    </span>
  );
}

export default function CategoriasDespesa() {
  const { pessoa } = useAuth();
  const souAdmin = !!pessoa?.administrador;

  const [categorias, setCategorias] = useState([]);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState('');
  const [modal, setModal] = useState(null);

  async function carregar() {
    setCarregando(true);
    setErro('');
    try {
      const res = await api.get('/categorias-despesa');
      setCategorias(res.data);
    } catch (err) {
      setErro(mensagemDeErro(err, 'Não foi possível carregar as categorias.'));
    } finally {
      setCarregando(false);
    }
  }

  useEffect(() => { carregar(); }, []);

  const ativas = useMemo(() => categorias.filter((c) => c.ativo), [categorias]);
  const inativas = useMemo(() => categorias.filter((c) => !c.ativo), [categorias]);

  return (
    <div className="max-w-5xl">
      <div className="flex flex-wrap items-start justify-between gap-4 mb-6">
        <div>
          <h1 className="text-2xl font-semibold text-slate-900">Categorias de despesa</h1>
          <p className="mt-1 text-slate-600">
            Usadas para classificar as contas a pagar (aluguel, folha, impostos…).
            Ao inativar, as contas já cadastradas mantêm a categoria original.
          </p>
        </div>

        {souAdmin && (
          <button
            type="button"
            onClick={() => setModal({ tipo: 'novo' })}
            className="inline-flex items-center gap-2 rounded-lg bg-nexus-700 px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-nexus-800"
          >
            <Plus size={16} />
            Nova categoria
          </button>
        )}
      </div>

      {erro && (
        <div className="mb-4 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
          {erro}
        </div>
      )}

      <Secao titulo="Ativas" itens={ativas} carregando={carregando} onEditar={souAdmin ? (c) => setModal({ tipo: 'editar', categoria: c }) : null} />

      {inativas.length > 0 && (
        <div className="mt-8">
          <Secao titulo="Inativas" itens={inativas} onEditar={souAdmin ? (c) => setModal({ tipo: 'editar', categoria: c }) : null} />
        </div>
      )}

      {modal?.tipo === 'novo' && (
        <ModalCategoria
          aoFechar={() => setModal(null)}
          aoSalvar={async (dados) => {
            await api.post('/categorias-despesa', dados);
            setModal(null);
            carregar();
          }}
        />
      )}

      {modal?.tipo === 'editar' && (
        <ModalCategoria
          categoria={modal.categoria}
          aoFechar={() => setModal(null)}
          aoSalvar={async (dados) => {
            await api.put(`/categorias-despesa/${modal.categoria.id}`, dados);
            setModal(null);
            carregar();
          }}
        />
      )}
    </div>
  );
}

function Secao({ titulo, itens, carregando, onEditar }) {
  return (
    <div>
      <h2 className="text-xs font-semibold uppercase tracking-wider text-slate-500 mb-2">{titulo}</h2>
      <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
            <tr>
              <th className="px-4 py-3">Nome</th>
              <th className="px-4 py-3">Descrição</th>
              <th className="px-4 py-3 text-center">Contas usando</th>
              <th className="px-4 py-3"></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {carregando && (
              <tr><td colSpan={4} className="px-4 py-6 text-center text-slate-500">Carregando...</td></tr>
            )}
            {!carregando && itens.length === 0 && (
              <tr><td colSpan={4} className="px-4 py-6 text-center text-slate-500">Nenhuma.</td></tr>
            )}
            {!carregando && itens.map((c) => (
              <tr key={c.id} className={c.ativo ? '' : 'bg-slate-50/60 text-slate-500'}>
                <td className="px-4 py-3">
                  <BadgeCategoria nome={c.nome} cor={c.cor} />
                </td>
                <td className="px-4 py-3 text-slate-600 text-xs">{c.descricao || '—'}</td>
                <td className="px-4 py-3 text-center text-xs text-slate-600 tabular-nums">
                  {c.qtd_contas ?? 0}
                </td>
                <td className="px-4 py-3 text-right">
                  {onEditar && (
                    <button
                      type="button"
                      onClick={() => onEditar(c)}
                      className="rounded-md p-1.5 text-slate-500 hover:bg-slate-100 hover:text-slate-700"
                      title="Editar"
                    >
                      <Edit2 size={15} />
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function ModalCategoria({ categoria, aoFechar, aoSalvar }) {
  const ehNovo = !categoria;
  const [form, setForm] = useState({
    nome: categoria?.nome ?? '',
    cor: categoria?.cor ?? 'slate',
    descricao: categoria?.descricao ?? '',
    ativo: categoria?.ativo ?? true,
  });
  const [erro, setErro] = useState('');
  const [salvando, setSalvando] = useState(false);

  const temUso = (categoria?.qtd_contas ?? 0) > 0;

  async function enviar(e) {
    e.preventDefault();
    setErro('');
    setSalvando(true);
    try {
      const payload = {
        nome: form.nome.trim(),
        cor: form.cor,
        descricao: form.descricao?.trim() || null,
      };
      if (!ehNovo) payload.ativo = !!form.ativo;
      await aoSalvar(payload);
    } catch (err) {
      setErro(mensagemDeErro(err, 'Não foi possível salvar.'));
    } finally {
      setSalvando(false);
    }
  }

  return (
    <Modal titulo={ehNovo ? 'Nova categoria' : `Editar ${categoria.nome}`} aoFechar={aoFechar}>
      <form onSubmit={enviar} className="space-y-4">
        <Campo rotulo="Nome" obrigatorio>
          <input
            type="text"
            required
            minLength={2}
            maxLength={100}
            value={form.nome}
            onChange={(e) => setForm((f) => ({ ...f, nome: e.target.value }))}
            className={inputClasses}
          />
        </Campo>

        <Campo rotulo="Cor">
          <div className="flex flex-wrap gap-2">
            {CORES.map((c) => (
              <button
                key={c}
                type="button"
                onClick={() => setForm((f) => ({ ...f, cor: c }))}
                className={[
                  'h-7 w-7 rounded-full transition-all',
                  CLASSES_BOLINHA[c],
                  form.cor === c ? 'ring-2 ring-offset-2 ring-slate-400 scale-110' : 'hover:scale-105',
                ].join(' ')}
                title={c}
              />
            ))}
          </div>
          <div className="mt-3">
            <div className="text-xs text-slate-500 mb-1">Pré-visualização:</div>
            <BadgeCategoria nome={form.nome || 'Categoria'} cor={form.cor} />
          </div>
        </Campo>

        <Campo rotulo="Descrição (opcional)">
          <textarea
            rows={2}
            maxLength={500}
            value={form.descricao}
            onChange={(e) => setForm((f) => ({ ...f, descricao: e.target.value }))}
            className={inputClasses}
          />
        </Campo>

        {!ehNovo && (
          <div>
            <label className="inline-flex items-center gap-2 text-sm text-slate-700">
              <input
                type="checkbox"
                checked={form.ativo}
                onChange={(e) => setForm((f) => ({ ...f, ativo: e.target.checked }))}
                className="h-4 w-4 rounded border-slate-300 text-nexus-700 focus:ring-nexus-500"
              />
              Categoria ativa
            </label>
            {temUso && !form.ativo && (
              <div className="mt-2 flex gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
                <AlertCircle size={14} className="mt-0.5 shrink-0" />
                <div>
                  Esta categoria já é usada em <strong>{categoria.qtd_contas}</strong> conta{categoria.qtd_contas === 1 ? '' : 's'}.
                  Inativar não apaga nada — só impede de ser escolhida em novas contas.
                </div>
              </div>
            )}
          </div>
        )}

        {erro && (
          <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
            {erro}
          </div>
        )}

        <div className="flex justify-end gap-2 pt-2">
          <button type="button" onClick={aoFechar} className={botaoSecundario}>Cancelar</button>
          <button type="submit" disabled={salvando} className={botaoPrimario}>
            {salvando ? 'Salvando...' : (ehNovo ? 'Criar categoria' : 'Salvar')}
          </button>
        </div>
      </form>
    </Modal>
  );
}

function Modal({ titulo, aoFechar, children }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <button type="button" aria-label="Fechar" onClick={aoFechar} className="absolute inset-0 bg-slate-900/60" />
      <div className="relative z-10 w-full max-w-xl rounded-xl bg-white shadow-xl">
        <div className="flex items-center justify-between border-b border-slate-200 px-5 py-3">
          <h2 className="font-semibold text-slate-900">{titulo}</h2>
          <button type="button" onClick={aoFechar} className="rounded-md p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-600" aria-label="Fechar">
            <X size={18} />
          </button>
        </div>
        <div className="p-5">{children}</div>
      </div>
    </div>
  );
}

function Campo({ rotulo, obrigatorio, ajuda, children }) {
  return (
    <label className="block">
      <span className="block text-sm font-medium text-slate-700">
        {rotulo}{obrigatorio && <span className="ml-0.5 text-red-500">*</span>}
      </span>
      <div className="mt-1">{children}</div>
      {ajuda && <span className="mt-1 block text-xs text-slate-500">{ajuda}</span>}
    </label>
  );
}

const inputClasses =
  'w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm shadow-sm outline-none focus:border-nexus-500 focus:ring-2 focus:ring-nexus-200';

const botaoPrimario =
  'inline-flex items-center justify-center rounded-lg bg-nexus-700 px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-nexus-800 disabled:cursor-not-allowed disabled:opacity-60';

const botaoSecundario =
  'inline-flex items-center justify-center rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 shadow-sm hover:bg-slate-50';
