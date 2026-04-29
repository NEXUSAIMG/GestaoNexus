import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  Workflow, Plus, X, ArrowRight, Tag,
  CheckCircle2, Pencil, Archive, AlertCircle,
} from 'lucide-react';
import { api, mensagemDeErro } from '../api/client.js';
import { useAuth } from '../context/AuthContext.jsx';

/**
 * Processos / Workflows — Sprint 14.
 *
 * Lista de processos da empresa. Cada item leva ao editor visual.
 * Admin pode criar novos. Não-admin só vê os processos das equipes
 * de que é membro + os publicados (transparência).
 */

const CORES_PROCESSO = {
  slate:   { bg: 'bg-slate-100',   texto: 'text-slate-800',   border: 'border-slate-200' },
  red:     { bg: 'bg-red-100',     texto: 'text-red-800',     border: 'border-red-200' },
  orange:  { bg: 'bg-orange-100',  texto: 'text-orange-800',  border: 'border-orange-200' },
  amber:   { bg: 'bg-amber-100',   texto: 'text-amber-800',   border: 'border-amber-200' },
  yellow:  { bg: 'bg-yellow-100',  texto: 'text-yellow-800',  border: 'border-yellow-200' },
  lime:    { bg: 'bg-lime-100',    texto: 'text-lime-800',    border: 'border-lime-200' },
  emerald: { bg: 'bg-emerald-100', texto: 'text-emerald-800', border: 'border-emerald-200' },
  teal:    { bg: 'bg-teal-100',    texto: 'text-teal-800',    border: 'border-teal-200' },
  cyan:    { bg: 'bg-cyan-100',    texto: 'text-cyan-800',    border: 'border-cyan-200' },
  blue:    { bg: 'bg-blue-100',    texto: 'text-blue-800',    border: 'border-blue-200' },
  indigo:  { bg: 'bg-indigo-100',  texto: 'text-indigo-800',  border: 'border-indigo-200' },
  violet:  { bg: 'bg-violet-100',  texto: 'text-violet-800',  border: 'border-violet-200' },
  fuchsia: { bg: 'bg-fuchsia-100', texto: 'text-fuchsia-800', border: 'border-fuchsia-200' },
  pink:    { bg: 'bg-pink-100',    texto: 'text-pink-800',    border: 'border-pink-200' },
  rose:    { bg: 'bg-rose-100',    texto: 'text-rose-800',    border: 'border-rose-200' },
};

const ROTULO_STATUS = {
  rascunho:  { texto: 'Rascunho',  cor: 'bg-slate-100 text-slate-700' },
  publicado: { texto: 'Publicado', cor: 'bg-emerald-100 text-emerald-700' },
  arquivado: { texto: 'Arquivado', cor: 'bg-slate-100 text-slate-500' },
};

export default function Processos() {
  const { pessoa } = useAuth();
  const souAdmin = !!pessoa?.administrador;

  const [processos, setProcessos] = useState([]);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState('');
  const [modalNovo, setModalNovo] = useState(false);

  async function carregar() {
    setCarregando(true);
    setErro('');
    try {
      const r = await api.get('/processos');
      setProcessos(r.data);
    } catch (err) {
      setErro(mensagemDeErro(err, 'Não consegui carregar os processos.'));
    } finally {
      setCarregando(false);
    }
  }

  useEffect(() => { carregar(); }, []);

  return (
    <div className="max-w-6xl">
      <header className="mb-6 flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="text-xs uppercase tracking-widest text-nexus-700 inline-flex items-center gap-1.5">
            <Workflow size={12} /> Sprint 14
          </div>
          <h1 className="mt-1 text-2xl font-semibold text-slate-900">Processos</h1>
          <p className="mt-1 text-slate-600">
            Documente os fluxos da empresa de forma visual. Cada processo
            tem nós (início, tarefas, decisões, fim), papéis e equipes
            envolvidas.
          </p>
        </div>

        {souAdmin && (
          <button
            type="button"
            onClick={() => setModalNovo(true)}
            className="inline-flex items-center gap-2 rounded-lg bg-nexus-700 px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-nexus-800"
          >
            <Plus size={16} /> Novo processo
          </button>
        )}
      </header>

      {erro && (
        <div className="mb-4 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{erro}</div>
      )}

      {carregando && (
        <div className="rounded-xl border border-slate-200 bg-white p-10 text-center text-sm text-slate-500">
          Carregando...
        </div>
      )}

      {!carregando && processos.length === 0 && (
        <div className="rounded-xl border border-dashed border-slate-300 bg-white p-10 text-center">
          <Workflow size={32} className="mx-auto text-slate-300 mb-3" />
          <h2 className="text-base font-medium text-slate-900">Nenhum processo ainda.</h2>
          <p className="mt-1 text-sm text-slate-600">
            {souAdmin
              ? 'Crie o primeiro processo da empresa pra começar a documentar os fluxos.'
              : 'Quando um admin criar processos, eles aparecem aqui.'}
          </p>
          {souAdmin && (
            <button
              type="button"
              onClick={() => setModalNovo(true)}
              className="mt-4 inline-flex items-center gap-2 rounded-lg bg-nexus-700 px-4 py-2 text-sm font-medium text-white hover:bg-nexus-800"
            >
              <Plus size={14} /> Criar primeiro processo
            </button>
          )}
        </div>
      )}

      {!carregando && processos.length > 0 && (
        <ul className="grid gap-3 md:grid-cols-2">
          {processos.map((p) => {
            const cor = CORES_PROCESSO[p.cor] || CORES_PROCESSO.slate;
            const status = ROTULO_STATUS[p.status];
            return (
              <li key={p.id}>
                <Link
                  to={`/processos/${p.id}`}
                  className={`block rounded-xl border ${cor.border} bg-white p-4 shadow-sm hover:shadow transition-shadow`}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className={`inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[10px] font-medium uppercase ${cor.bg} ${cor.texto}`}>
                          <Tag size={10} /> {p.nome}
                        </span>
                        <span className={`inline-flex rounded px-1.5 py-0.5 text-[10px] font-medium uppercase ${status.cor}`}>
                          {status.texto}
                        </span>
                        {p.versao > 1 && (
                          <span className="inline-flex rounded bg-slate-100 px-1.5 py-0.5 text-[10px] font-medium text-slate-600">
                            v{p.versao}
                          </span>
                        )}
                      </div>

                      <h3 className="mt-2 text-base font-semibold text-slate-900">{p.nome}</h3>

                      {p.descricao && (
                        <p className="mt-1 text-xs text-slate-600 line-clamp-2">{p.descricao}</p>
                      )}

                      <div className="mt-3 flex flex-wrap items-center gap-2 text-[11px] text-slate-500">
                        <span className="inline-flex items-center gap-1">
                          <Workflow size={11} /> {p.qtd_nos} {p.qtd_nos === 1 ? 'nó' : 'nós'}
                        </span>
                        {p.equipes.length > 0 && (
                          <span className="inline-flex items-center gap-1">
                            · {p.equipes.length === 1
                                ? p.equipes[0].nome
                                : `${p.equipes.length} equipes`}
                          </span>
                        )}
                      </div>
                    </div>
                    <ArrowRight size={16} className="text-slate-400 mt-1 shrink-0" />
                  </div>
                </Link>
              </li>
            );
          })}
        </ul>
      )}

      {modalNovo && (
        <ModalNovoProcesso
          aoFechar={() => setModalNovo(false)}
          aoCriado={() => { setModalNovo(false); carregar(); }}
        />
      )}
    </div>
  );
}

// =============================================================================
// Modal de criar novo processo
// =============================================================================

function ModalNovoProcesso({ aoFechar, aoCriado }) {
  const [nome, setNome] = useState('');
  const [descricao, setDescricao] = useState('');
  const [cor, setCor] = useState('slate');
  const [equipes, setEquipes] = useState([]);
  const [equipesIds, setEquipesIds] = useState([]);
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState('');

  useEffect(() => {
    api.get('/equipes').then((r) => setEquipes(r.data)).catch(() => {});
  }, []);

  async function submeter(e) {
    e.preventDefault();
    setErro('');
    setSalvando(true);
    try {
      const r = await api.post('/processos', {
        nome: nome.trim(),
        descricao: descricao.trim() || null,
        cor,
        equipes_ids: equipesIds,
      });
      // Redireciona pro editor já depois de criar
      window.location.assign(`/processos/${r.data.id}`);
      aoCriado();
    } catch (err) {
      setErro(mensagemDeErro(err, 'Não consegui criar o processo.'));
      setSalvando(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4">
      <div className="w-full max-w-lg rounded-xl bg-white shadow-xl">
        <header className="flex items-center justify-between border-b border-slate-200 px-5 py-3">
          <h2 className="text-base font-semibold text-slate-900">Novo processo</h2>
          <button onClick={aoFechar} className="rounded p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-600">
            <X size={18} />
          </button>
        </header>

        <form onSubmit={submeter} className="p-5 space-y-4">
          <div>
            <label className="block text-sm font-medium text-slate-900 mb-1">
              Nome <span className="text-red-600">*</span>
            </label>
            <input
              required minLength={2} maxLength={100}
              value={nome}
              onChange={(e) => setNome(e.target.value)}
              placeholder="Ex: Onboarding de cliente novo"
              className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm shadow-sm outline-none focus:border-nexus-500 focus:ring-2 focus:ring-nexus-200"
              autoFocus
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-900 mb-1">Descrição</label>
            <textarea
              maxLength={5000} rows={3}
              value={descricao}
              onChange={(e) => setDescricao(e.target.value)}
              placeholder="Pra que serve esse processo, quando deve ser usado..."
              className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm shadow-sm outline-none focus:border-nexus-500 focus:ring-2 focus:ring-nexus-200"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-900 mb-1.5">Cor</label>
            <div className="flex flex-wrap gap-1.5">
              {Object.keys(CORES_PROCESSO).map((c) => {
                const cs = CORES_PROCESSO[c];
                return (
                  <button
                    key={c}
                    type="button"
                    onClick={() => setCor(c)}
                    aria-label={c}
                    className={`h-7 w-7 rounded-full ${cs.bg} ${cor === c ? 'ring-2 ring-offset-1 ring-slate-800' : ''}`}
                  />
                );
              })}
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-900 mb-1.5">
              Equipes envolvidas (opcional)
            </label>
            {equipes.length === 0 ? (
              <p className="text-xs text-slate-500">Nenhuma equipe cadastrada.</p>
            ) : (
              <div className="grid grid-cols-2 gap-1.5 max-h-32 overflow-y-auto border border-slate-200 rounded-lg p-2">
                {equipes.map((eq) => {
                  const ativo = equipesIds.includes(eq.id);
                  return (
                    <label key={eq.id} className="inline-flex items-center gap-1.5 text-sm cursor-pointer">
                      <input
                        type="checkbox"
                        checked={ativo}
                        onChange={(e) => {
                          if (e.target.checked) setEquipesIds([...equipesIds, eq.id]);
                          else setEquipesIds(equipesIds.filter((x) => x !== eq.id));
                        }}
                      />
                      <span>{eq.nome}</span>
                    </label>
                  );
                })}
              </div>
            )}
          </div>

          <div className="rounded-lg bg-amber-50 border border-amber-200 px-3 py-2 text-xs text-amber-800 inline-flex items-start gap-2">
            <AlertCircle size={12} className="mt-0.5 shrink-0" />
            <span>Ao criar, o processo já vem com nós "Início" e "Fim". Você adiciona as tarefas no editor.</span>
          </div>

          {erro && (
            <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{erro}</div>
          )}

          <div className="flex justify-end gap-2 pt-2">
            <button type="button" onClick={aoFechar} className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50">
              Cancelar
            </button>
            <button type="submit" disabled={salvando} className="rounded-lg bg-nexus-700 px-4 py-2 text-sm font-medium text-white hover:bg-nexus-800 disabled:opacity-50">
              {salvando ? 'Criando...' : 'Criar e abrir editor'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
