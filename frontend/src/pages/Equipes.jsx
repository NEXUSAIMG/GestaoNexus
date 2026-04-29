import { useEffect, useState } from 'react';
import {
  Plus, X, Trash2, UserPlus, Crown, User as UserIcon, Archive, ArchiveRestore, Edit2,
} from 'lucide-react';
import { api, mensagemDeErro } from '../api/client.js';
import { useAuth } from '../context/AuthContext.jsx';

/**
 * Equipes — Sprint 10.
 *
 * Página admin-only de gestão de equipes. Cada equipe tem nome, cor,
 * descrição e uma lista de membros com papel ('lider' ou 'membro').
 *
 * Admin do sistema vê tudo e cria. Líderes podem editar a própria equipe
 * e mexer em membros (validação no backend).
 */

const CORES = [
  { v: 'slate',    bg: 'bg-slate-500',    label: 'Cinza' },
  { v: 'red',      bg: 'bg-red-500',      label: 'Vermelho' },
  { v: 'orange',   bg: 'bg-orange-500',   label: 'Laranja' },
  { v: 'amber',    bg: 'bg-amber-500',    label: 'Âmbar' },
  { v: 'yellow',   bg: 'bg-yellow-500',   label: 'Amarelo' },
  { v: 'lime',     bg: 'bg-lime-500',     label: 'Lima' },
  { v: 'emerald',  bg: 'bg-emerald-500',  label: 'Esmeralda' },
  { v: 'teal',     bg: 'bg-teal-500',     label: 'Turquesa' },
  { v: 'cyan',     bg: 'bg-cyan-500',     label: 'Ciano' },
  { v: 'blue',     bg: 'bg-blue-500',     label: 'Azul' },
  { v: 'indigo',   bg: 'bg-indigo-500',   label: 'Índigo' },
  { v: 'violet',   bg: 'bg-violet-500',   label: 'Violeta' },
  { v: 'fuchsia',  bg: 'bg-fuchsia-500',  label: 'Fúcsia' },
  { v: 'pink',     bg: 'bg-pink-500',     label: 'Rosa' },
  { v: 'rose',     bg: 'bg-rose-500',     label: 'Rosé' },
];

function corBg(cor) {
  const c = CORES.find((x) => x.v === cor);
  return c?.bg || 'bg-slate-500';
}

export default function Equipes() {
  const { pessoa } = useAuth();
  const [equipes, setEquipes] = useState([]);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState('');
  const [modalCriar, setModalCriar] = useState(false);
  const [modalDetalhes, setModalDetalhes] = useState(null); // equipeId

  async function carregar() {
    setCarregando(true);
    setErro('');
    try {
      const r = await api.get('/equipes', { params: { incluir_arquivadas: 'true' } });
      setEquipes(r.data);
    } catch (err) {
      setErro(mensagemDeErro(err, 'Não consegui carregar as equipes.'));
    } finally {
      setCarregando(false);
    }
  }

  useEffect(() => { carregar(); }, []);

  return (
    <div className="max-w-5xl">
      <header className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <div>
          <div className="text-xs uppercase tracking-widest text-nexus-700">Cadastros</div>
          <h1 className="mt-1 text-2xl font-semibold text-slate-900">Equipes</h1>
          <p className="mt-1 text-slate-600 text-sm">
            Equipes agrupam pessoas pra organizar acesso aos quadros de tarefas.
          </p>
        </div>
        <button
          type="button"
          onClick={() => setModalCriar(true)}
          className="inline-flex items-center gap-2 rounded-lg bg-nexus-700 px-3 py-2 text-sm font-medium text-white hover:bg-nexus-800"
        >
          <Plus size={14} /> Nova equipe
        </button>
      </header>

      {erro && (
        <div className="mb-4 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{erro}</div>
      )}

      {carregando ? (
        <div className="rounded-xl border border-slate-200 bg-white p-10 text-center text-sm text-slate-500">
          Carregando…
        </div>
      ) : equipes.length === 0 ? (
        <div className="rounded-xl border border-dashed border-slate-300 bg-white p-10 text-center">
          <p className="text-slate-600">Nenhuma equipe cadastrada ainda.</p>
          <button
            type="button"
            onClick={() => setModalCriar(true)}
            className="mt-3 inline-flex items-center gap-2 rounded-lg bg-nexus-700 px-3 py-2 text-sm font-medium text-white hover:bg-nexus-800"
          >
            <Plus size={14} /> Criar primeira equipe
          </button>
        </div>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {equipes.map((e) => (
            <button
              key={e.id}
              type="button"
              onClick={() => setModalDetalhes(e.id)}
              className={[
                'group rounded-xl border bg-white p-4 text-left shadow-sm transition-all hover:shadow-md hover:border-nexus-300',
                e.arquivada ? 'opacity-60' : '',
              ].join(' ')}
            >
              <div className="flex items-start gap-3">
                <span className={`h-10 w-1.5 rounded-full ${corBg(e.cor)} shrink-0`} />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <h3 className="truncate font-semibold text-slate-900">{e.nome}</h3>
                    {e.arquivada && (
                      <span className="rounded bg-slate-100 px-1.5 py-0.5 text-[10px] font-medium text-slate-600">
                        Arquivada
                      </span>
                    )}
                  </div>
                  {e.descricao && (
                    <p className="mt-0.5 line-clamp-2 text-xs text-slate-500">{e.descricao}</p>
                  )}
                  <div className="mt-2 flex items-center gap-3 text-xs text-slate-500">
                    <span>{e.qtd_membros} membro{e.qtd_membros === 1 ? '' : 's'}</span>
                    <span>·</span>
                    <span>{e.qtd_quadros} quadro{e.qtd_quadros === 1 ? '' : 's'}</span>
                    {e.meu_papel && (
                      <>
                        <span>·</span>
                        <span className="inline-flex items-center gap-1 text-nexus-700">
                          {e.meu_papel === 'lider' && <Crown size={10} />}
                          {e.meu_papel === 'lider' ? 'Líder' : 'Membro'}
                        </span>
                      </>
                    )}
                  </div>
                </div>
              </div>
            </button>
          ))}
        </div>
      )}

      {modalCriar && (
        <ModalEquipe
          onFechar={() => setModalCriar(false)}
          onSalvo={() => { setModalCriar(false); carregar(); }}
        />
      )}

      {modalDetalhes && (
        <ModalDetalhes
          equipeId={modalDetalhes}
          pessoaLogada={pessoa}
          onFechar={() => setModalDetalhes(null)}
          onAlterada={() => { carregar(); }}
        />
      )}
    </div>
  );
}

// =============================================================================
// Modal: criar/editar equipe
// =============================================================================

function ModalEquipe({ equipe, onFechar, onSalvo }) {
  const editando = !!equipe;
  const [nome, setNome] = useState(equipe?.nome || '');
  const [descricao, setDescricao] = useState(equipe?.descricao || '');
  const [cor, setCor] = useState(equipe?.cor || 'slate');
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState('');

  async function submeter(e) {
    e.preventDefault();
    setSalvando(true);
    setErro('');
    try {
      const body = { nome, descricao: descricao || null, cor };
      if (editando) {
        await api.put(`/equipes/${equipe.id}`, body);
      } else {
        await api.post('/equipes', body);
      }
      onSalvo();
    } catch (err) {
      setErro(mensagemDeErro(err, 'Não consegui salvar.'));
    } finally {
      setSalvando(false);
    }
  }

  return (
    <ModalFrame titulo={editando ? 'Editar equipe' : 'Nova equipe'} onFechar={onFechar}>
      <form onSubmit={submeter} className="space-y-3">
        <Campo rotulo="Nome" obrigatorio>
          <input
            className={inputCls}
            value={nome}
            onChange={(e) => setNome(e.target.value)}
            maxLength={100}
            required
            autoFocus
            placeholder="Ex: Financeiro"
          />
        </Campo>

        <Campo rotulo="Descrição (opcional)">
          <textarea
            className={inputCls}
            rows={2}
            value={descricao}
            onChange={(e) => setDescricao(e.target.value)}
            maxLength={2000}
            placeholder="Pra que serve esta equipe?"
          />
        </Campo>

        <Campo rotulo="Cor">
          <div className="flex flex-wrap gap-2">
            {CORES.map((c) => (
              <button
                key={c.v}
                type="button"
                onClick={() => setCor(c.v)}
                className={[
                  'h-7 w-7 rounded-full transition-transform',
                  c.bg,
                  cor === c.v ? 'ring-2 ring-offset-2 ring-nexus-700 scale-110' : 'hover:scale-110',
                ].join(' ')}
                title={c.label}
                aria-label={c.label}
              />
            ))}
          </div>
        </Campo>

        {erro && (
          <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{erro}</div>
        )}

        <div className="flex justify-end gap-2 pt-2">
          <button type="button" onClick={onFechar}
            className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
          >Cancelar</button>
          <button type="submit" disabled={salvando}
            className="rounded-lg bg-nexus-700 px-4 py-2 text-sm font-medium text-white hover:bg-nexus-800 disabled:opacity-50"
          >{salvando ? 'Salvando…' : (editando ? 'Salvar' : 'Criar equipe')}</button>
        </div>
      </form>
    </ModalFrame>
  );
}

// =============================================================================
// Modal de detalhes (membros + ações)
// =============================================================================

function ModalDetalhes({ equipeId, pessoaLogada, onFechar, onAlterada }) {
  const [equipe, setEquipe] = useState(null);
  const [pessoas, setPessoas] = useState([]);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState('');
  const [editando, setEditando] = useState(false);
  const [adicionandoMembro, setAdicionandoMembro] = useState(false);

  async function carregar() {
    setCarregando(true);
    try {
      const r = await api.get(`/equipes/${equipeId}`);
      setEquipe(r.data);
    } catch (err) {
      setErro(mensagemDeErro(err, 'Não consegui carregar os detalhes.'));
    } finally {
      setCarregando(false);
    }
  }

  useEffect(() => { carregar(); /* eslint-disable-next-line */ }, [equipeId]);

  // Carrega lista de pessoas só quando vai adicionar membro
  async function abrirAdicionarMembro() {
    if (pessoas.length === 0) {
      try {
        const r = await api.get('/pessoas');
        setPessoas(r.data);
      } catch (err) {
        setErro(mensagemDeErro(err, 'Não consegui carregar a lista de pessoas.'));
        return;
      }
    }
    setAdicionandoMembro(true);
  }

  async function arquivar() {
    if (!confirm(`Arquivar a equipe "${equipe.nome}"? Quadros associados continuam acessíveis pra quem é membro.`)) return;
    try {
      await api.post(`/equipes/${equipeId}/arquivar`);
      onAlterada();
      onFechar();
    } catch (err) {
      setErro(mensagemDeErro(err));
    }
  }

  async function desarquivar() {
    try {
      await api.post(`/equipes/${equipeId}/desarquivar`);
      onAlterada();
      carregar();
    } catch (err) {
      setErro(mensagemDeErro(err));
    }
  }

  if (carregando || !equipe) {
    return (
      <ModalFrame titulo="Carregando…" onFechar={onFechar}>
        <div className="py-8 text-center text-sm text-slate-500">Carregando…</div>
      </ModalFrame>
    );
  }

  const podeGerenciar = pessoaLogada?.administrador || equipe.meu_papel === 'lider';

  if (editando) {
    return <ModalEquipe equipe={equipe} onFechar={() => setEditando(false)} onSalvo={() => { setEditando(false); carregar(); onAlterada(); }} />;
  }

  return (
    <ModalFrame
      titulo={
        <span className="flex items-center gap-2">
          <span className={`h-3 w-3 rounded-full ${corBg(equipe.cor)}`} />
          {equipe.nome}
          {equipe.arquivada && (
            <span className="rounded bg-slate-100 px-1.5 py-0.5 text-[10px] font-medium text-slate-600">Arquivada</span>
          )}
        </span>
      }
      onFechar={onFechar}
    >
      {equipe.descricao && (
        <p className="mb-4 rounded-lg bg-slate-50 p-3 text-sm text-slate-700">{equipe.descricao}</p>
      )}

      <div className="mb-3 flex items-center justify-between">
        <h3 className="text-sm font-semibold text-slate-900">Membros ({equipe.membros.length})</h3>
        {podeGerenciar && !equipe.arquivada && (
          <button
            type="button"
            onClick={abrirAdicionarMembro}
            className="inline-flex items-center gap-1 rounded-md border border-slate-300 bg-white px-2.5 py-1 text-xs font-medium text-slate-700 hover:bg-slate-50"
          >
            <UserPlus size={12} /> Adicionar
          </button>
        )}
      </div>

      <ul className="divide-y divide-slate-100 rounded-lg border border-slate-200">
        {equipe.membros.map((m) => (
          <MembroItem
            key={m.id}
            membro={m}
            equipeId={equipe.id}
            podeGerenciar={podeGerenciar && !equipe.arquivada}
            onMudou={() => { carregar(); onAlterada(); }}
          />
        ))}
      </ul>

      {adicionandoMembro && (
        <FormAdicionarMembro
          pessoas={pessoas.filter((p) => !equipe.membros.some((m) => m.pessoa.id === p.id) && p.ativo)}
          equipeId={equipe.id}
          onFechar={() => setAdicionandoMembro(false)}
          onAdicionado={() => { setAdicionandoMembro(false); carregar(); onAlterada(); }}
        />
      )}

      {erro && (
        <div className="mt-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{erro}</div>
      )}

      {podeGerenciar && (
        <div className="mt-6 flex flex-wrap items-center justify-between gap-2 border-t border-slate-200 pt-4">
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => setEditando(true)}
              disabled={equipe.arquivada}
              className="inline-flex items-center gap-1 rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50"
            >
              <Edit2 size={13} /> Editar
            </button>
            {equipe.arquivada ? (
              <button
                type="button"
                onClick={desarquivar}
                className="inline-flex items-center gap-1 rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-50"
              >
                <ArchiveRestore size={13} /> Desarquivar
              </button>
            ) : (
              <button
                type="button"
                onClick={arquivar}
                className="inline-flex items-center gap-1 rounded-lg border border-amber-200 bg-white px-3 py-1.5 text-sm font-medium text-amber-700 hover:bg-amber-50"
              >
                <Archive size={13} /> Arquivar
              </button>
            )}
          </div>
        </div>
      )}
    </ModalFrame>
  );
}

function MembroItem({ membro, equipeId, podeGerenciar, onMudou }) {
  const [trocando, setTrocando] = useState(false);

  async function trocarPapel() {
    setTrocando(true);
    try {
      const novo = membro.papel === 'lider' ? 'membro' : 'lider';
      await api.put(`/equipes/${equipeId}/membros/${membro.id}`, { papel: novo });
      onMudou();
    } catch (err) {
      alert(mensagemDeErro(err));
    } finally {
      setTrocando(false);
    }
  }

  async function remover() {
    if (!confirm(`Remover ${membro.pessoa.nome} da equipe?`)) return;
    try {
      await api.delete(`/equipes/${equipeId}/membros/${membro.id}`);
      onMudou();
    } catch (err) {
      alert(mensagemDeErro(err));
    }
  }

  return (
    <li className="flex items-center gap-3 px-3 py-2.5">
      <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-slate-100 text-slate-600">
        {membro.papel === 'lider' ? <Crown size={14} /> : <UserIcon size={14} />}
      </div>
      <div className="flex-1 min-w-0">
        <div className="truncate text-sm font-medium text-slate-900">{membro.pessoa.nome}</div>
        <div className="truncate text-xs text-slate-500">
          {membro.pessoa.email} · {membro.papel === 'lider' ? 'Líder' : 'Membro'}
        </div>
      </div>
      {podeGerenciar && (
        <div className="flex gap-1">
          <button
            type="button"
            onClick={trocarPapel}
            disabled={trocando}
            className="rounded p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700 disabled:opacity-50"
            title={membro.papel === 'lider' ? 'Tornar membro' : 'Promover a líder'}
          >
            <Crown size={14} />
          </button>
          <button
            type="button"
            onClick={remover}
            className="rounded p-1.5 text-slate-400 hover:bg-red-50 hover:text-red-700"
            title="Remover"
          >
            <Trash2 size={14} />
          </button>
        </div>
      )}
    </li>
  );
}

function FormAdicionarMembro({ pessoas, equipeId, onFechar, onAdicionado }) {
  const [pessoaId, setPessoaId] = useState('');
  const [papel, setPapel] = useState('membro');
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState('');

  async function submeter(e) {
    e.preventDefault();
    if (!pessoaId) return;
    setSalvando(true);
    try {
      await api.post(`/equipes/${equipeId}/membros`, { pessoa_id: pessoaId, papel });
      onAdicionado();
    } catch (err) {
      setErro(mensagemDeErro(err));
    } finally {
      setSalvando(false);
    }
  }

  return (
    <form onSubmit={submeter} className="mt-3 rounded-lg border border-slate-200 bg-slate-50 p-3 space-y-2">
      <div>
        <label className="block text-xs font-medium text-slate-700 mb-1">Pessoa</label>
        <select
          className={inputCls}
          value={pessoaId}
          onChange={(e) => setPessoaId(e.target.value)}
          required
        >
          <option value="">— escolha —</option>
          {pessoas.map((p) => (
            <option key={p.id} value={p.id}>{p.nome} ({p.email})</option>
          ))}
        </select>
      </div>
      <div>
        <label className="block text-xs font-medium text-slate-700 mb-1">Papel</label>
        <select className={inputCls} value={papel} onChange={(e) => setPapel(e.target.value)}>
          <option value="membro">Membro</option>
          <option value="lider">Líder</option>
        </select>
      </div>
      {erro && <div className="text-xs text-red-700">{erro}</div>}
      <div className="flex justify-end gap-2 pt-1">
        <button type="button" onClick={onFechar}
          className="rounded-md border border-slate-300 bg-white px-3 py-1 text-xs font-medium text-slate-700 hover:bg-slate-50"
        >Cancelar</button>
        <button type="submit" disabled={salvando || !pessoaId}
          className="rounded-md bg-nexus-700 px-3 py-1 text-xs font-medium text-white hover:bg-nexus-800 disabled:opacity-50"
        >{salvando ? 'Adicionando…' : 'Adicionar'}</button>
      </div>
    </form>
  );
}

// =============================================================================
// Helpers de UI (locais — depois extrair pra um GovernancaUI 2.0)
// =============================================================================

const inputCls = 'w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm shadow-sm outline-none focus:border-nexus-500 focus:ring-2 focus:ring-nexus-200';

function Campo({ rotulo, obrigatorio, hint, children }) {
  return (
    <div>
      <label className="block text-sm font-medium text-slate-900 mb-1">
        {rotulo}{obrigatorio && <span className="text-red-600">*</span>}
      </label>
      {children}
      {hint && <p className="mt-1 text-xs text-slate-500">{hint}</p>}
    </div>
  );
}

function ModalFrame({ titulo, onFechar, children }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4">
      <div className="w-full max-w-lg rounded-xl bg-white shadow-xl">
        <header className="flex items-center justify-between border-b border-slate-200 px-5 py-3">
          <h2 className="text-base font-semibold text-slate-900">{titulo}</h2>
          <button
            type="button"
            onClick={onFechar}
            className="rounded p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-600"
          >
            <X size={18} />
          </button>
        </header>
        <div className="p-5 max-h-[80vh] overflow-y-auto">{children}</div>
      </div>
    </div>
  );
}
