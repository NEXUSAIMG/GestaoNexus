import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  Plus, KanbanSquare, Globe, Lock, X, Archive, Upload, Loader2, CheckCircle2,
} from 'lucide-react';
import { api, mensagemDeErro } from '../api/client.js';
import { useAuth } from '../context/AuthContext.jsx';

/**
 * Tarefas — Sprint 10.
 *
 * Página de entrada que lista todos os quadros que a pessoa tem acesso.
 * Quadros são agrupados por equipe.
 *
 * Qualquer membro de equipe pode criar quadros nela; quadros abertos a
 * sócios (visibilidade pública dentro da ferramenta) aparecem com ícone
 * de cadeado aberto (Globe).
 */

const COR_BG = {
  slate: 'bg-slate-500', red: 'bg-red-500', orange: 'bg-orange-500',
  amber: 'bg-amber-500', yellow: 'bg-yellow-500', lime: 'bg-lime-500',
  emerald: 'bg-emerald-500', teal: 'bg-teal-500', cyan: 'bg-cyan-500',
  blue: 'bg-blue-500', indigo: 'bg-indigo-500', violet: 'bg-violet-500',
  fuchsia: 'bg-fuchsia-500', pink: 'bg-pink-500', rose: 'bg-rose-500',
};

export default function Tarefas() {
  const { pessoa } = useAuth();
  const [quadros, setQuadros] = useState([]);
  const [equipes, setEquipes] = useState([]);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState('');
  const [modalNovo, setModalNovo] = useState(false);
  const [modalImportar, setModalImportar] = useState(false);

  // Sprint 30 — gate de versão pra evitar race condition em operações rápidas
  // (criar quadro / arquivar / refresh em sequência).
  const carregaIdRef = useRef(0);

  async function carregar() {
    const meuId = ++carregaIdRef.current;
    setCarregando(true);
    setErro('');
    try {
      const [qR, eR] = await Promise.all([
        api.get('/quadros'),
        api.get('/equipes'),
      ]);
      if (meuId !== carregaIdRef.current) return;
      setQuadros(qR.data);
      setEquipes(eR.data);
    } catch (err) {
      if (meuId === carregaIdRef.current) {
        setErro(mensagemDeErro(err, 'Não consegui carregar.'));
      }
    } finally {
      if (meuId === carregaIdRef.current) {
        setCarregando(false);
      }
    }
  }

  useEffect(() => { carregar(); }, []);

  // Equipes onde a pessoa pode criar quadros (admin OU membro da equipe)
  const equipesParaCriar = equipes.filter((e) => !e.arquivada && (pessoa?.administrador || e.meu_papel));

  // Agrupa quadros por equipe
  const porEquipe = new Map();
  for (const q of quadros) {
    if (!porEquipe.has(q.equipe_id)) {
      porEquipe.set(q.equipe_id, { equipe_nome: q.equipe_nome, equipe_cor: q.equipe_cor, quadros: [] });
    }
    porEquipe.get(q.equipe_id).quadros.push(q);
  }

  return (
    <div className="max-w-6xl">
      <header className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <div>
          <div className="text-xs uppercase tracking-widest text-nexus-700">Operação</div>
          <h1 className="mt-1 text-2xl font-semibold text-slate-900">Tarefas</h1>
          <p className="mt-1 text-slate-600 text-sm">
            Quadros das equipes pra organizar o trabalho operacional.
          </p>
        </div>
        {equipesParaCriar.length > 0 && (
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setModalImportar(true)}
              className="inline-flex items-center gap-2 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
            >
              <Upload size={14} /> Importar do Trello
            </button>
            <button
              type="button"
              onClick={() => setModalNovo(true)}
              className="inline-flex items-center gap-2 rounded-lg bg-nexus-700 px-3 py-2 text-sm font-medium text-white hover:bg-nexus-800"
            >
              <Plus size={14} /> Novo quadro
            </button>
          </div>
        )}
      </header>

      {erro && (
        <div className="mb-4 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{erro}</div>
      )}

      {carregando ? (
        <div className="rounded-xl border border-slate-200 bg-white p-10 text-center text-sm text-slate-500">
          Carregando…
        </div>
      ) : quadros.length === 0 ? (
        <div className="rounded-xl border border-dashed border-slate-300 bg-white p-10 text-center">
          <KanbanSquare size={32} className="mx-auto mb-2 text-slate-400" />
          <p className="text-slate-600">Nenhum quadro acessível.</p>
          {equipesParaCriar.length === 0 ? (
            <p className="mt-2 text-xs text-slate-500">
              {pessoa?.administrador
                ? 'Crie uma equipe primeiro em Cadastros → Equipes.'
                : 'Peça pra um administrador adicionar você a uma equipe.'}
            </p>
          ) : (
            <button
              type="button"
              onClick={() => setModalNovo(true)}
              className="mt-3 inline-flex items-center gap-2 rounded-lg bg-nexus-700 px-3 py-2 text-sm font-medium text-white hover:bg-nexus-800"
            >
              <Plus size={14} /> Criar primeiro quadro
            </button>
          )}
        </div>
      ) : (
        <div className="space-y-6">
          {[...porEquipe.entries()].map(([equipeId, grupo]) => (
            <section key={equipeId}>
              <div className="mb-2 flex items-center gap-2">
                <span className={`h-3 w-3 rounded-full ${COR_BG[grupo.equipe_cor] || 'bg-slate-500'}`} />
                <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-600">
                  {grupo.equipe_nome}
                </h2>
              </div>
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {grupo.quadros.map((q) => (
                  <Link
                    key={q.id}
                    to={`/tarefas/${q.id}`}
                    className="group rounded-xl border border-slate-200 bg-white p-4 shadow-sm transition-all hover:shadow-md hover:border-nexus-300"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <h3 className="line-clamp-2 font-semibold text-slate-900 group-hover:text-nexus-800">
                        {q.nome}
                      </h3>
                      {q.aberto_a_socios ? (
                        <Globe size={14} className="shrink-0 text-emerald-600" title="Aberto a todos os sócios" />
                      ) : (
                        <Lock size={14} className="shrink-0 text-slate-400" title="Privado da equipe" />
                      )}
                    </div>
                    {q.descricao && (
                      <p className="mt-1 line-clamp-2 text-xs text-slate-500">{q.descricao}</p>
                    )}
                    <div className="mt-3 flex items-center gap-3 text-xs text-slate-500">
                      <span>{q.qtd_colunas} coluna{q.qtd_colunas === 1 ? '' : 's'}</span>
                      <span>·</span>
                      <span>{q.qtd_cards} card{q.qtd_cards === 1 ? '' : 's'}</span>
                    </div>
                  </Link>
                ))}
              </div>
            </section>
          ))}
        </div>
      )}

      {modalNovo && (
        <ModalNovoQuadro
          equipes={equipesParaCriar}
          onFechar={() => setModalNovo(false)}
          onCriado={() => { setModalNovo(false); carregar(); }}
        />
      )}

      {modalImportar && (
        <ModalImportarTrello
          equipes={equipesParaCriar}
          onFechar={() => setModalImportar(false)}
          onImportado={() => { setModalImportar(false); carregar(); }}
        />
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Sprint 38 — Importar do Trello
// ---------------------------------------------------------------------------

function ModalImportarTrello({ equipes, onFechar, onImportado }) {
  const [equipeId, setEquipeId] = useState(equipes[0]?.id || '');
  const [arquivo, setArquivo] = useState(null);
  const [board, setBoard] = useState(null);
  const [erro, setErro] = useState('');
  const [enviando, setEnviando] = useState(false);
  const [criarMembros, setCriarMembros] = useState(true);
  const [resultado, setResultado] = useState(null);

  function aoEscolher(e) {
    setErro('');
    setBoard(null);
    const f = e.target.files?.[0];
    if (!f) return;
    setArquivo(f);
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const json = JSON.parse(reader.result);
        if (!json.lists && !json.cards) {
          setErro('Esse JSON não parece um export de board do Trello.');
          return;
        }
        setBoard(json);
      } catch {
        setErro('Não consegui ler o arquivo — ele precisa ser o JSON exportado do Trello.');
      }
    };
    reader.readAsText(f);
  }

  async function importar() {
    if (!equipeId || !board) return;
    setEnviando(true);
    setErro('');
    try {
      const r = await api.post('/quadros/importar-trello', {
        equipe_id: equipeId,
        board,
        criar_membros_ausentes: criarMembros,
      });
      setResultado(r.data);
    } catch (err) {
      setErro(mensagemDeErro(err, 'Falha ao importar.'));
    } finally {
      setEnviando(false);
    }
  }

  const previa = board
    ? {
      listas: (board.lists || []).filter((l) => !l.closed).length,
      cards: (board.cards || []).filter((c) => !c.closed).length,
      etiquetas: (board.labels || []).length,
    }
    : null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4">
      <div className="w-full max-w-md rounded-xl bg-white shadow-xl">
        <header className="flex items-center justify-between border-b border-slate-200 px-5 py-3">
          <h2 className="inline-flex items-center gap-1.5 text-base font-semibold text-slate-900">
            <Upload size={15} /> Importar do Trello
          </h2>
          <button onClick={onFechar} className="rounded p-1 text-slate-400 hover:bg-slate-100">
            <X size={18} />
          </button>
        </header>

        <div className="space-y-4 p-5">
          {resultado ? (
            <div className="space-y-3 text-center">
              <CheckCircle2 size={36} className="mx-auto text-emerald-500" />
              <p className="text-sm text-slate-700">
                Quadro <strong>{resultado.nome}</strong> importado:
                {' '}{resultado.colunas} colunas, {resultado.cards} cards,
                {' '}{resultado.etiquetas} etiquetas, {resultado.checklists} checklists
                {resultado.responsaveis ? ', ' + resultado.responsaveis + ' responsáveis' : ''}
                {resultado.membros_criados ? ' (' + resultado.membros_criados + ' contas novas)' : ''}.
              </p>
              <div className="flex justify-center gap-2">
                <Link
                  to={'/tarefas/' + resultado.quadro_id}
                  className="rounded-lg bg-nexus-700 px-4 py-2 text-sm font-medium text-white hover:bg-nexus-800"
                >
                  Abrir quadro
                </Link>
                <button
                  type="button"
                  onClick={onImportado}
                  className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
                >
                  Fechar
                </button>
              </div>
            </div>
          ) : (
            <>
              <p className="text-xs text-slate-500">
                No Trello: Menu → “…” → Print, export and share → Export as JSON.
                Baixe o arquivo e envie aqui.
              </p>

              <div>
                <label className="mb-1 block text-sm font-medium text-slate-900">Equipe de destino</label>
                <select
                  value={equipeId}
                  onChange={(e) => setEquipeId(e.target.value)}
                  className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm outline-none focus:border-nexus-500"
                >
                  {equipes.map((e) => (<option key={e.id} value={e.id}>{e.nome}</option>))}
                </select>
              </div>

              <div>
                <label className="mb-1 block text-sm font-medium text-slate-900">Arquivo JSON do Trello</label>
                <input
                  type="file"
                  accept=".json,application/json"
                  onChange={aoEscolher}
                  className="w-full text-xs text-slate-600 file:mr-2 file:rounded-lg file:border-0 file:bg-nexus-50 file:px-3 file:py-1.5 file:text-nexus-800 hover:file:bg-nexus-100"
                />
              </div>

              {previa && (
                <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs text-emerald-900">
                  Pronto para importar: <strong>{previa.listas}</strong> listas,
                  {' '}<strong>{previa.cards}</strong> cards, {previa.etiquetas} etiquetas.
                </div>
              )}

              <label className="flex items-start gap-2 text-xs text-slate-600">
                <input
                  type="checkbox"
                  checked={criarMembros}
                  onChange={(e) => setCriarMembros(e.target.checked)}
                  className="mt-0.5"
                />
                <span>
                  Criar contas (inativas) para membros do Trello que ainda não existem e
                  adicioná-los à equipe como responsáveis dos cards.
                </span>
              </label>

              {erro && (
                <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">{erro}</div>
              )}

              <div className="flex justify-end gap-2">
                <button
                  type="button"
                  onClick={onFechar}
                  className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
                >
                  Cancelar
                </button>
                <button
                  type="button"
                  onClick={importar}
                  disabled={!board || !equipeId || enviando}
                  className="inline-flex items-center gap-1 rounded-lg bg-nexus-700 px-4 py-2 text-sm font-medium text-white hover:bg-nexus-800 disabled:opacity-50"
                >
                  {enviando && <Loader2 size={13} className="animate-spin" />}
                  {enviando ? 'Importando…' : 'Importar'}
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

function ModalNovoQuadro({ equipes, onFechar, onCriado }) {
  const [equipeId, setEquipeId] = useState(equipes[0]?.id || '');
  const [nome, setNome] = useState('');
  const [descricao, setDescricao] = useState('');
  const [aberto, setAberto] = useState(true);
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState('');

  async function submeter(e) {
    e.preventDefault();
    setSalvando(true);
    try {
      await api.post('/quadros', {
        equipe_id: equipeId,
        nome,
        descricao: descricao || null,
        aberto_a_socios: aberto,
      });
      onCriado();
    } catch (err) {
      setErro(mensagemDeErro(err));
    } finally {
      setSalvando(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4">
      <div className="w-full max-w-md rounded-xl bg-white shadow-xl">
        <header className="flex items-center justify-between border-b border-slate-200 px-5 py-3">
          <h2 className="text-base font-semibold text-slate-900">Novo quadro</h2>
          <button onClick={onFechar} type="button" className="rounded p-1 text-slate-400 hover:bg-slate-100">
            <X size={18} />
          </button>
        </header>
        <form onSubmit={submeter} className="p-5 space-y-3">
          <div>
            <label className="block text-sm font-medium text-slate-900 mb-1">
              Equipe<span className="text-red-600">*</span>
            </label>
            <select
              className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm shadow-sm outline-none focus:border-nexus-500 focus:ring-2 focus:ring-nexus-200"
              value={equipeId} onChange={(e) => setEquipeId(e.target.value)} required
            >
              {equipes.map((e) => (
                <option key={e.id} value={e.id}>{e.nome}</option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-900 mb-1">
              Nome do quadro<span className="text-red-600">*</span>
            </label>
            <input
              className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm shadow-sm outline-none focus:border-nexus-500 focus:ring-2 focus:ring-nexus-200"
              value={nome} onChange={(e) => setNome(e.target.value)}
              maxLength={100} required autoFocus
              placeholder="Ex: Roadmap do produto"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-900 mb-1">Descrição (opcional)</label>
            <textarea
              className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm shadow-sm outline-none focus:border-nexus-500 focus:ring-2 focus:ring-nexus-200"
              rows={2} value={descricao} onChange={(e) => setDescricao(e.target.value)}
              maxLength={2000}
            />
          </div>

          <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
            <label className="flex items-start gap-2 cursor-pointer">
              <input
                type="checkbox" checked={aberto} onChange={(e) => setAberto(e.target.checked)}
                className="mt-1"
              />
              <div>
                <div className="text-sm font-medium text-slate-900">Aberto a todos os sócios</div>
                <div className="text-xs text-slate-500">
                  Qualquer pessoa autenticada visualiza o quadro (transparência), mas só
                  membros da equipe podem editar.
                </div>
              </div>
            </label>
          </div>

          {erro && <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{erro}</div>}

          <div className="flex justify-end gap-2 pt-2">
            <button type="button" onClick={onFechar}
              className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
            >Cancelar</button>
            <button type="submit" disabled={salvando || !equipeId}
              className="rounded-lg bg-nexus-700 px-4 py-2 text-sm font-medium text-white hover:bg-nexus-800 disabled:opacity-50"
            >{salvando ? 'Criando…' : 'Criar quadro'}</button>
          </div>
        </form>
      </div>
    </div>
  );
}
