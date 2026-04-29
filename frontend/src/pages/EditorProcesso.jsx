import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import {
  ReactFlow, ReactFlowProvider, Controls, Background,
  applyNodeChanges, applyEdgeChanges, addEdge,
  MarkerType, Handle, Position,
} from 'reactflow';
import 'reactflow/dist/style.css';
import {
  ArrowLeft, Save, Plus, Trash2, Users2, UserCircle2,
  CircleDot, Square, Diamond, Circle, Workflow as WorkflowIcon,
  CheckCircle2, Archive, AlertCircle, X, Pencil, Settings,
  Play, ListChecks,
} from 'lucide-react';
import { api, mensagemDeErro } from '../api/client.js';
import { useAuth } from '../context/AuthContext.jsx';

/**
 * Editor visual de processos — Sprint 14.
 *
 * Usa React Flow pro canvas. Ao salvar, monta o payload no formato esperado
 * pelo backend (com id_local pra ligar nós-arestas-papéis sem depender
 * de UUIDs gerados). O backend faz replace-all dentro de transação.
 *
 * Modelo no canvas:
 *   - Nó tipo 'inicio' → renderiza como CircleDot verde
 *   - Nó tipo 'tarefa' → caixa retangular azul
 *   - Nó tipo 'decisao' → losango amarelo
 *   - Nó tipo 'fim' → círculo vermelho
 *   - Cada nó mostra o nome do papel (raia) como pequeno label
 */

const TIPOS_NO = [
  { tipo: 'inicio',  rotulo: 'Início',  icone: CircleDot,  cor: 'emerald' },
  { tipo: 'tarefa',  rotulo: 'Tarefa',  icone: Square,     cor: 'blue' },
  { tipo: 'decisao', rotulo: 'Decisão', icone: Diamond,    cor: 'amber' },
  { tipo: 'fim',     rotulo: 'Fim',     icone: Circle,     cor: 'red' },
];

const CORES_PAPEL = {
  slate: '#64748b', red: '#ef4444', orange: '#f97316', amber: '#f59e0b',
  yellow: '#eab308', lime: '#84cc16', emerald: '#10b981', teal: '#14b8a6',
  cyan: '#06b6d4', blue: '#3b82f6', indigo: '#6366f1', violet: '#8b5cf6',
  fuchsia: '#d946ef', pink: '#ec4899', rose: '#f43f5e',
};

// =============================================================================
// Componentes de nó customizados
// =============================================================================
//
// React Flow exige que cada nó seja um componente React. As cores e
// formas refletem o tipo. O `data` traz o payload do nó (rótulo, papel,
// etc.) que vem do estado do React.

function NoBase({ data, selected, formato, cores }) {
  const corPapel = data.papel?.cor ? CORES_PAPEL[data.papel.cor] : '#94a3b8';
  return (
    <div
      className={`relative ${formato} ${cores.bg} ${cores.border} ${cores.texto} shadow-sm transition-all`}
      style={{
        outline: selected ? '2px solid #4f46e5' : 'none',
        outlineOffset: 2,
      }}
    >
      <Handle type="target" position={Position.Left}  className="!h-2 !w-2 !bg-slate-400" />
      <Handle type="source" position={Position.Right} className="!h-2 !w-2 !bg-slate-400" />
      <div className="px-3 py-1.5 text-xs font-medium text-center break-words max-w-[180px]">
        {data.rotulo || '(sem título)'}
      </div>
      {data.papel && (
        <div
          className="absolute -top-2 left-2 inline-flex items-center gap-0.5 rounded-full bg-white px-1.5 py-0 text-[9px] font-medium text-slate-700 shadow-sm border"
          style={{ borderColor: corPapel }}
        >
          <span className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: corPapel }} />
          {data.papel.nome}
        </div>
      )}
      {data.prazo_dias != null && (
        <div className="absolute -bottom-2 right-1 inline-flex rounded bg-amber-100 px-1 py-0 text-[9px] font-medium text-amber-800 border border-amber-200">
          {data.prazo_dias}d
        </div>
      )}
    </div>
  );
}

function NoInicio(props) {
  return <NoBase {...props}
    formato="rounded-full min-w-[80px] min-h-[40px] flex items-center justify-center"
    cores={{ bg: 'bg-emerald-100', border: 'border-2 border-emerald-500', texto: 'text-emerald-900' }} />;
}
function NoFim(props) {
  return <NoBase {...props}
    formato="rounded-full min-w-[80px] min-h-[40px] flex items-center justify-center"
    cores={{ bg: 'bg-red-100', border: 'border-2 border-red-500', texto: 'text-red-900' }} />;
}
function NoTarefa(props) {
  return <NoBase {...props}
    formato="rounded-lg min-w-[140px] min-h-[44px] flex items-center justify-center"
    cores={{ bg: 'bg-blue-50', border: 'border-2 border-blue-400', texto: 'text-blue-900' }} />;
}
function NoDecisao(props) {
  // Losango feito com transform (alternativa: SVG)
  return (
    <div className="relative" style={{ width: 130, height: 90 }}>
      <Handle type="target" position={Position.Left}  className="!h-2 !w-2 !bg-slate-400" style={{ left: -4, top: '50%' }} />
      <Handle type="source" position={Position.Right} className="!h-2 !w-2 !bg-slate-400" style={{ right: -4, top: '50%' }} />
      <div
        className="absolute inset-0 bg-amber-50 border-2 border-amber-500 shadow-sm"
        style={{ transform: 'rotate(45deg) scale(0.7)', transformOrigin: 'center' }}
      />
      <div
        className="absolute inset-0 flex items-center justify-center px-3 text-xs font-medium text-amber-900 text-center"
      >
        {props.data.rotulo || '(decisão)'}
      </div>
      {props.data.papel && (
        <div
          className="absolute -top-1 left-2 inline-flex items-center gap-0.5 rounded-full bg-white px-1.5 py-0 text-[9px] font-medium text-slate-700 shadow-sm border"
          style={{ borderColor: CORES_PAPEL[props.data.papel.cor] || '#94a3b8' }}
        >
          <span className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: CORES_PAPEL[props.data.papel.cor] || '#94a3b8' }} />
          {props.data.papel.nome}
        </div>
      )}
      {props.selected && (
        <div className="absolute -inset-1 border-2 border-indigo-600 rounded pointer-events-none" />
      )}
    </div>
  );
}

const tiposNoCustomizados = {
  inicio: NoInicio,
  fim: NoFim,
  tarefa: NoTarefa,
  decisao: NoDecisao,
};

// =============================================================================
// Editor principal
// =============================================================================

export default function EditorProcesso() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { pessoa } = useAuth();
  const souAdmin = !!pessoa?.administrador;

  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState('');

  // Cabeçalho
  const [nome, setNome] = useState('');
  const [descricao, setDescricao] = useState('');
  const [cor, setCor] = useState('slate');
  const [status, setStatus] = useState('rascunho');
  const [versao, setVersao] = useState(1);

  // Equipes associadas
  const [equipesDisponiveis, setEquipesDisponiveis] = useState([]);
  const [equipesIds, setEquipesIds] = useState([]);

  // Papéis: array com id_local, nome, descricao, cor, equipe_id, pessoa_id
  const [papeis, setPapeis] = useState([]);
  // Pessoas e equipes pra mapear papéis
  const [pessoasDisponiveis, setPessoasDisponiveis] = useState([]);

  // Nós e arestas no formato React Flow
  const [nos, setNos] = useState([]);
  const [arestas, setArestas] = useState([]);

  // Seleção atual (pra editar no painel lateral)
  const [noSelecionadoId, setNoSelecionadoId] = useState(null);

  const [salvando, setSalvando] = useState(false);
  const [sujo, setSujo] = useState(false); // tem mudança não salva
  const [sucesso, setSucesso] = useState('');

  // Sprint 15 — modal de iniciar instância
  const [modalIniciar, setModalIniciar] = useState(false);

  const [painel, setPainel] = useState('papeis'); // 'papeis' | 'no' | 'config'

  // Auto-incremento de id_local pra novos itens
  const proximoIdLocalRef = useRef(1);
  function novoIdLocal(prefixo) {
    const id = `${prefixo}-${proximoIdLocalRef.current++}`;
    return id;
  }

  // ===========================================================
  // Carga inicial
  // ===========================================================

  useEffect(() => {
    async function carregar() {
      setCarregando(true);
      setErro('');
      try {
        const [proc, eq, pe] = await Promise.all([
          api.get(`/processos/${id}`),
          api.get('/equipes'),
          api.get('/pessoas').catch(() => ({ data: [] })), // não-admin pode não ter
        ]);

        setNome(proc.data.nome);
        setDescricao(proc.data.descricao || '');
        setCor(proc.data.cor);
        setStatus(proc.data.status);
        setVersao(proc.data.versao);
        setEquipesIds(proc.data.equipes.map((e) => e.id));
        setEquipesDisponiveis(eq.data);
        setPessoasDisponiveis(pe.data);

        // Mapeia papéis: id real → id_local pra estabilidade no frontend
        const papelIdRealParaLocal = {};
        const papeisLocais = proc.data.papeis.map((p, i) => {
          const idLocal = `papel-${proximoIdLocalRef.current++}`;
          papelIdRealParaLocal[p.id] = idLocal;
          return {
            id_local: idLocal,
            nome: p.nome,
            descricao: p.descricao || '',
            cor: p.cor,
            equipe_id: p.equipe_id,
            pessoa_id: p.pessoa_id,
            equipe_nome: p.equipe_nome,
            pessoa_nome: p.pessoa_nome,
            ordem: p.ordem,
          };
        });
        setPapeis(papeisLocais);

        // Mapeia nós
        const noIdRealParaLocal = {};
        const nosCanvas = proc.data.nos.map((n) => {
          const idLocal = `no-${proximoIdLocalRef.current++}`;
          noIdRealParaLocal[n.id] = idLocal;
          const papelIdLocal = n.papel_id ? papelIdRealParaLocal[n.papel_id] : null;
          const papel = papelIdLocal ? papeisLocais.find((p) => p.id_local === papelIdLocal) : null;
          return {
            id: idLocal,
            type: n.tipo,
            position: { x: Number(n.posicao_x), y: Number(n.posicao_y) },
            data: {
              rotulo: n.rotulo,
              descricao: n.descricao || '',
              tipo: n.tipo,
              papel_id_local: papelIdLocal,
              papel,
              prazo_dias: n.prazo_dias,
            },
          };
        });
        setNos(nosCanvas);

        // Mapeia arestas
        const arestasCanvas = proc.data.arestas.map((a, idx) => ({
          id: `aresta-${proximoIdLocalRef.current++}`,
          source: noIdRealParaLocal[a.origem_no_id],
          target: noIdRealParaLocal[a.destino_no_id],
          label: a.rotulo || '',
          markerEnd: { type: MarkerType.ArrowClosed },
        })).filter((a) => a.source && a.target);
        setArestas(arestasCanvas);
      } catch (err) {
        setErro(mensagemDeErro(err, 'Não consegui carregar o processo.'));
      } finally {
        setCarregando(false);
      }
    }
    carregar();
  }, [id]);

  // ===========================================================
  // Re-injeta `papel` nos data dos nós sempre que papeis mudar
  // (assim renderiza a label do papel atualizada)
  // ===========================================================
  useEffect(() => {
    setNos((nos) => nos.map((n) => {
      const papel = n.data.papel_id_local
        ? papeis.find((p) => p.id_local === n.data.papel_id_local) || null
        : null;
      return { ...n, data: { ...n.data, papel } };
    }));
    // eslint-disable-next-line
  }, [papeis]);

  // ===========================================================
  // Handlers do React Flow
  // ===========================================================

  const aoMudarNos = useCallback((mudancas) => {
    setNos((nds) => applyNodeChanges(mudancas, nds));
    // Marca sujo só quando há mudança "real" (não só seleção)
    if (mudancas.some((m) => m.type === 'position' || m.type === 'remove')) {
      setSujo(true);
    }
  }, []);

  const aoMudarArestas = useCallback((mudancas) => {
    setArestas((eds) => applyEdgeChanges(mudancas, eds));
    if (mudancas.some((m) => m.type === 'remove')) setSujo(true);
  }, []);

  const aoConectar = useCallback((conexao) => {
    setArestas((eds) => addEdge({
      ...conexao,
      id: `aresta-${proximoIdLocalRef.current++}`,
      markerEnd: { type: MarkerType.ArrowClosed },
    }, eds));
    setSujo(true);
  }, []);

  function adicionarNo(tipo) {
    if (!souAdmin) return;
    const novoId = novoIdLocal('no');
    const rotulosPadrao = {
      inicio: 'Início', fim: 'Fim', tarefa: 'Nova tarefa', decisao: 'Decisão?',
    };
    setNos((nds) => [...nds, {
      id: novoId,
      type: tipo,
      // Posiciona no centro aproximado, com pequeno offset pra não empilhar
      position: { x: 250 + (nds.length * 30) % 200, y: 250 + (nds.length * 30) % 200 },
      data: {
        rotulo: rotulosPadrao[tipo],
        descricao: '',
        tipo,
        papel_id_local: null,
        papel: null,
        prazo_dias: null,
      },
    }]);
    setSujo(true);
    setNoSelecionadoId(novoId);
    setPainel('no');
  }

  function aoClicarNo(_evt, node) {
    setNoSelecionadoId(node.id);
    setPainel('no');
  }

  function atualizarNoSelecionado(patch) {
    setNos((nds) => nds.map((n) =>
      n.id === noSelecionadoId
        ? { ...n, data: { ...n.data, ...patch } }
        : n,
    ));
    setSujo(true);
  }

  function removerNoSelecionado() {
    if (!noSelecionadoId) return;
    if (!confirm('Excluir este nó e todas suas conexões?')) return;
    setNos((nds) => nds.filter((n) => n.id !== noSelecionadoId));
    setArestas((eds) => eds.filter((e) => e.source !== noSelecionadoId && e.target !== noSelecionadoId));
    setNoSelecionadoId(null);
    setPainel('papeis');
    setSujo(true);
  }

  // ===========================================================
  // Papéis
  // ===========================================================

  function adicionarPapel() {
    setPapeis((ps) => [...ps, {
      id_local: novoIdLocal('papel'),
      nome: 'Novo papel',
      descricao: '',
      cor: 'blue',
      equipe_id: null,
      pessoa_id: null,
      ordem: ps.length,
    }]);
    setSujo(true);
  }

  function atualizarPapel(idLocal, patch) {
    setPapeis((ps) => ps.map((p) => p.id_local === idLocal ? { ...p, ...patch } : p));
    setSujo(true);
  }

  function removerPapel(idLocal) {
    if (!confirm('Excluir este papel? Os nós que usam ficarão sem responsável.')) return;
    setPapeis((ps) => ps.filter((p) => p.id_local !== idLocal));
    // Remove referência nos nós
    setNos((nds) => nds.map((n) =>
      n.data.papel_id_local === idLocal
        ? { ...n, data: { ...n.data, papel_id_local: null, papel: null } }
        : n,
    ));
    setSujo(true);
  }

  // ===========================================================
  // Salvar
  // ===========================================================

  async function salvar() {
    setSalvando(true);
    setErro('');
    setSucesso('');
    try {
      const payload = {
        nome, descricao: descricao || null, cor,
        equipes_ids: equipesIds,
        papeis: papeis.map((p, i) => ({
          id_local: p.id_local,
          nome: p.nome,
          descricao: p.descricao || null,
          cor: p.cor,
          equipe_id: p.equipe_id || null,
          pessoa_id: p.pessoa_id || null,
          ordem: i,
        })),
        nos: nos.map((n) => ({
          id_local: n.id,
          tipo: n.type,
          rotulo: n.data.rotulo,
          descricao: n.data.descricao || null,
          papel_id_local: n.data.papel_id_local || null,
          prazo_dias: n.data.prazo_dias ?? null,
          posicao_x: n.position.x,
          posicao_y: n.position.y,
        })),
        arestas: arestas.map((a) => ({
          origem_id_local: a.source,
          destino_id_local: a.target,
          rotulo: a.label || null,
        })),
      };
      await api.put(`/processos/${id}`, payload);
      setSujo(false);
      setSucesso('Salvo!');
      setTimeout(() => setSucesso(''), 2000);
    } catch (err) {
      setErro(mensagemDeErro(err, 'Não consegui salvar.'));
    } finally {
      setSalvando(false);
    }
  }

  async function publicar() {
    if (sujo) {
      if (!confirm('Você tem alterações não salvas. Salvar antes de publicar?')) return;
      await salvar();
    }
    if (!confirm('Publicar este processo? Ele ficará visível pra todos os autenticados (transparência).')) return;
    try {
      await api.post(`/processos/${id}/publicar`);
      setStatus('publicado');
      setSucesso('Publicado!');
      setTimeout(() => setSucesso(''), 2000);
    } catch (err) {
      setErro(mensagemDeErro(err, 'Não consegui publicar.'));
    }
  }

  async function arquivar() {
    if (!confirm('Arquivar este processo? Ele some da lista mas o histórico fica.')) return;
    try {
      await api.post(`/processos/${id}/arquivar`);
      navigate('/processos');
    } catch (err) {
      setErro(mensagemDeErro(err, 'Não consegui arquivar.'));
    }
  }

  // ===========================================================
  // Render
  // ===========================================================

  const noSelecionado = useMemo(
    () => nos.find((n) => n.id === noSelecionadoId) || null,
    [nos, noSelecionadoId],
  );

  if (carregando) {
    return (
      <div className="flex h-full items-center justify-center text-sm text-slate-500">
        Carregando processo...
      </div>
    );
  }

  if (erro && !nome) {
    return (
      <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
        {erro}
      </div>
    );
  }

  return (
    <div className="flex flex-col h-[calc(100vh-110px)]">
      {/* Header */}
      <header className="flex items-center justify-between gap-2 border-b border-slate-200 bg-white px-4 py-2">
        <div className="flex items-center gap-3 min-w-0">
          <Link to="/processos" className="rounded p-1 text-slate-500 hover:bg-slate-100">
            <ArrowLeft size={16} />
          </Link>
          <div className="min-w-0">
            <h1 className="text-base font-semibold text-slate-900 truncate">{nome}</h1>
            <div className="flex items-center gap-2 text-[11px] text-slate-500">
              <span className={`rounded px-1.5 py-0.5 font-medium ${
                status === 'publicado' ? 'bg-emerald-100 text-emerald-700' :
                status === 'arquivado' ? 'bg-slate-100 text-slate-500' :
                'bg-slate-100 text-slate-700'
              }`}>{status}</span>
              <span>v{versao}</span>
              <span>· {nos.length} nó{nos.length === 1 ? '' : 's'}</span>
              <span>· {arestas.length} conexõ{arestas.length === 1 ? 'es' : 'es'}</span>
              {sujo && <span className="text-amber-600 font-medium">· alterado</span>}
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {sucesso && (
            <span className="text-xs text-emerald-700 inline-flex items-center gap-1">
              <CheckCircle2 size={12} /> {sucesso}
            </span>
          )}

          {/* Sprint 15 — ações de instância */}
          <Link
            to={`/processos/${id}/instancias`}
            className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50"
          >
            <ListChecks size={12} /> Instâncias
          </Link>
          {status === 'publicado' && souAdmin && (
            <button
              type="button" onClick={() => setModalIniciar(true)}
              className="inline-flex items-center gap-1.5 rounded-lg border border-emerald-300 bg-white px-3 py-1.5 text-xs font-medium text-emerald-700 hover:bg-emerald-50"
              title="Iniciar nova instância (executa o processo)"
            >
              <Play size={12} /> Iniciar instância
            </button>
          )}

          {souAdmin && (
            <>
              <button
                type="button" onClick={salvar} disabled={salvando || !sujo}
                className="inline-flex items-center gap-1.5 rounded-lg bg-nexus-700 px-3 py-1.5 text-xs font-medium text-white hover:bg-nexus-800 disabled:opacity-40"
              >
                <Save size={12} /> {salvando ? 'Salvando...' : 'Salvar'}
              </button>
              {status !== 'publicado' && (
                <button
                  type="button" onClick={publicar}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-emerald-300 bg-white px-3 py-1.5 text-xs font-medium text-emerald-700 hover:bg-emerald-50"
                >
                  <CheckCircle2 size={12} /> Publicar
                </button>
              )}
              <button
                type="button" onClick={arquivar}
                className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50"
                title="Arquivar"
              >
                <Archive size={12} />
              </button>
            </>
          )}
        </div>
      </header>

      {erro && (
        <div className="border-b border-red-200 bg-red-50 px-4 py-2 text-xs text-red-700">{erro}</div>
      )}

      <div className="flex flex-1 overflow-hidden">
        {/* Canvas */}
        <div className="flex-1 relative bg-slate-50">
          {souAdmin && (
            <div className="absolute top-3 left-3 z-10 flex flex-wrap gap-1.5 rounded-lg bg-white p-1.5 border border-slate-200 shadow-sm">
              {TIPOS_NO.map((t) => (
                <button
                  key={t.tipo}
                  type="button"
                  onClick={() => adicionarNo(t.tipo)}
                  className="inline-flex items-center gap-1.5 rounded px-2 py-1 text-xs font-medium text-slate-700 hover:bg-slate-100"
                  title={`Adicionar ${t.rotulo}`}
                >
                  <t.icone size={12} /> {t.rotulo}
                </button>
              ))}
            </div>
          )}

          <ReactFlowProvider>
            <ReactFlow
              nodes={nos}
              edges={arestas}
              nodeTypes={tiposNoCustomizados}
              onNodesChange={aoMudarNos}
              onEdgesChange={aoMudarArestas}
              onConnect={aoConectar}
              onNodeClick={aoClicarNo}
              fitView
              defaultEdgeOptions={{ markerEnd: { type: MarkerType.ArrowClosed } }}
              proOptions={{ hideAttribution: true }}
            >
              <Background gap={16} size={1} />
              <Controls />
            </ReactFlow>
          </ReactFlowProvider>
        </div>

        {/* Painel lateral */}
        <aside className="w-72 border-l border-slate-200 bg-white overflow-y-auto">
          <div className="flex border-b border-slate-200">
            {[
              { v: 'papeis', l: 'Papéis', i: Users2 },
              { v: 'no',     l: 'Nó',     i: Pencil },
              { v: 'config', l: 'Geral',  i: Settings },
            ].map((t) => (
              <button
                key={t.v}
                type="button"
                onClick={() => setPainel(t.v)}
                className={`flex-1 inline-flex items-center justify-center gap-1.5 px-2 py-2 text-xs font-medium ${
                  painel === t.v ? 'bg-nexus-50 text-nexus-800 border-b-2 border-nexus-700' : 'text-slate-600 hover:bg-slate-50'
                }`}
                disabled={t.v === 'no' && !noSelecionado}
              >
                <t.i size={12} /> {t.l}
              </button>
            ))}
          </div>

          <div className="p-3">
            {painel === 'papeis' && (
              <PainelPapeis
                papeis={papeis}
                souAdmin={souAdmin}
                equipes={equipesDisponiveis}
                pessoas={pessoasDisponiveis}
                aoAdicionar={adicionarPapel}
                aoAtualizar={atualizarPapel}
                aoRemover={removerPapel}
              />
            )}
            {painel === 'no' && noSelecionado && (
              <PainelNo
                no={noSelecionado}
                papeis={papeis}
                souAdmin={souAdmin}
                aoAtualizar={atualizarNoSelecionado}
                aoRemover={removerNoSelecionado}
              />
            )}
            {painel === 'no' && !noSelecionado && (
              <p className="text-xs text-slate-500">Clique em um nó pra editar.</p>
            )}
            {painel === 'config' && (
              <PainelConfig
                nome={nome} setNome={setNome}
                descricao={descricao} setDescricao={setDescricao}
                cor={cor} setCor={setCor}
                equipesDisponiveis={equipesDisponiveis}
                equipesIds={equipesIds} setEquipesIds={setEquipesIds}
                souAdmin={souAdmin}
                aoMudar={() => setSujo(true)}
              />
            )}
          </div>
        </aside>
      </div>

      {/* Sprint 15 — modal de iniciar instância */}
      {modalIniciar && (
        <ModalIniciarInstancia
          processoId={id}
          processoNome={nome}
          aoFechar={() => setModalIniciar(false)}
          aoCriada={(quadroId) => {
            setModalIniciar(false);
            navigate(`/tarefas/${quadroId}`);
          }}
        />
      )}
    </div>
  );
}

// =============================================================================
// Painéis laterais
// =============================================================================

function PainelPapeis({ papeis, souAdmin, equipes, pessoas, aoAdicionar, aoAtualizar, aoRemover }) {
  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-700">
          Papéis ({papeis.length})
        </h3>
        {souAdmin && (
          <button
            type="button" onClick={aoAdicionar}
            className="inline-flex items-center gap-1 rounded text-xs text-nexus-700 hover:text-nexus-800"
          >
            <Plus size={11} /> novo
          </button>
        )}
      </div>

      {papeis.length === 0 && (
        <p className="text-xs text-slate-500">
          Defina os papéis das pessoas no processo (ex: Vendedor, Aprovador).
        </p>
      )}

      <ul className="space-y-2">
        {papeis.map((p) => (
          <li key={p.id_local} className="rounded-lg border border-slate-200 bg-slate-50/50 p-2">
            <div className="flex items-center justify-between gap-1 mb-1.5">
              <input
                type="text"
                value={p.nome}
                onChange={(e) => aoAtualizar(p.id_local, { nome: e.target.value })}
                disabled={!souAdmin}
                className="flex-1 rounded border border-slate-300 bg-white px-2 py-1 text-xs font-medium outline-none focus:border-nexus-500"
                placeholder="Nome do papel"
              />
              {souAdmin && (
                <button onClick={() => aoRemover(p.id_local)} className="text-red-500 hover:bg-red-50 rounded p-1">
                  <Trash2 size={11} />
                </button>
              )}
            </div>

            {/* Cor */}
            <div className="flex flex-wrap gap-1 mb-1.5">
              {Object.entries(CORES_PAPEL).map(([nome, hex]) => (
                <button
                  key={nome}
                  type="button"
                  disabled={!souAdmin}
                  onClick={() => aoAtualizar(p.id_local, { cor: nome })}
                  aria-label={nome}
                  className={`h-4 w-4 rounded-full ${p.cor === nome ? 'ring-1 ring-offset-1 ring-slate-700' : ''}`}
                  style={{ backgroundColor: hex }}
                />
              ))}
            </div>

            {/* Mapeamento */}
            <div className="space-y-1">
              <select
                value={p.equipe_id || (p.pessoa_id ? '__pessoa' : '')}
                onChange={(e) => {
                  const v = e.target.value;
                  if (v === '') aoAtualizar(p.id_local, { equipe_id: null, pessoa_id: null });
                  else if (v === '__pessoa') aoAtualizar(p.id_local, { equipe_id: null });
                  else aoAtualizar(p.id_local, { equipe_id: v, pessoa_id: null });
                }}
                disabled={!souAdmin}
                className="w-full rounded border border-slate-300 bg-white px-2 py-1 text-xs outline-none focus:border-nexus-500"
              >
                <option value="">Sem mapeamento</option>
                {equipes.length > 0 && (
                  <optgroup label="Equipes">
                    {equipes.map((eq) => <option key={eq.id} value={eq.id}>👥 {eq.nome}</option>)}
                  </optgroup>
                )}
                {pessoas.length > 0 && (
                  <option value="__pessoa">👤 Escolher pessoa específica...</option>
                )}
              </select>

              {(!p.equipe_id && (p.pessoa_id || pessoas.length > 0)) && (
                <select
                  value={p.pessoa_id || ''}
                  onChange={(e) => aoAtualizar(p.id_local, { pessoa_id: e.target.value || null, equipe_id: null })}
                  disabled={!souAdmin}
                  className="w-full rounded border border-slate-300 bg-white px-2 py-1 text-xs outline-none focus:border-nexus-500"
                >
                  <option value="">— Selecione uma pessoa —</option>
                  {pessoas.map((pe) => <option key={pe.id} value={pe.id}>{pe.nome}</option>)}
                </select>
              )}
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}

function PainelNo({ no, papeis, souAdmin, aoAtualizar, aoRemover }) {
  const tipoInfo = TIPOS_NO.find((t) => t.tipo === no.type);
  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-700 inline-flex items-center gap-1.5">
          {tipoInfo && <tipoInfo.icone size={12} />} {tipoInfo?.rotulo || no.type}
        </h3>
        {souAdmin && (
          <button onClick={aoRemover} className="text-red-500 hover:bg-red-50 rounded p-1">
            <Trash2 size={12} />
          </button>
        )}
      </div>

      <div>
        <label className="block text-[10px] font-medium uppercase text-slate-500 mb-0.5">Rótulo</label>
        <input
          type="text"
          value={no.data.rotulo}
          onChange={(e) => aoAtualizar({ rotulo: e.target.value })}
          disabled={!souAdmin}
          className="w-full rounded border border-slate-300 bg-white px-2 py-1 text-xs outline-none focus:border-nexus-500"
        />
      </div>

      <div>
        <label className="block text-[10px] font-medium uppercase text-slate-500 mb-0.5">Descrição</label>
        <textarea
          rows={3}
          value={no.data.descricao}
          onChange={(e) => aoAtualizar({ descricao: e.target.value })}
          disabled={!souAdmin}
          className="w-full rounded border border-slate-300 bg-white px-2 py-1 text-xs outline-none focus:border-nexus-500"
          placeholder="O que acontece nesta etapa..."
        />
      </div>

      {(no.type === 'tarefa' || no.type === 'decisao') && (
        <>
          <div>
            <label className="block text-[10px] font-medium uppercase text-slate-500 mb-0.5">Papel responsável</label>
            <select
              value={no.data.papel_id_local || ''}
              onChange={(e) => aoAtualizar({ papel_id_local: e.target.value || null })}
              disabled={!souAdmin}
              className="w-full rounded border border-slate-300 bg-white px-2 py-1 text-xs outline-none focus:border-nexus-500"
            >
              <option value="">— Sem papel definido —</option>
              {papeis.map((p) => (
                <option key={p.id_local} value={p.id_local}>{p.nome}</option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-[10px] font-medium uppercase text-slate-500 mb-0.5">
              Prazo (dias após etapa anterior)
            </label>
            <input
              type="number" min="0" max="365"
              value={no.data.prazo_dias ?? ''}
              onChange={(e) => aoAtualizar({ prazo_dias: e.target.value === '' ? null : Number(e.target.value) })}
              disabled={!souAdmin}
              className="w-full rounded border border-slate-300 bg-white px-2 py-1 text-xs outline-none focus:border-nexus-500"
              placeholder="Ex: 3"
            />
            <p className="mt-0.5 text-[10px] text-slate-500">
              Vai virar o prazo do card quando o processo for executado (Sprint 15).
            </p>
          </div>
        </>
      )}
    </div>
  );
}

function PainelConfig({
  nome, setNome, descricao, setDescricao, cor, setCor,
  equipesDisponiveis, equipesIds, setEquipesIds, souAdmin, aoMudar,
}) {
  const wrap = (setter) => (v) => { setter(v); aoMudar(); };
  return (
    <div className="space-y-3">
      <div>
        <label className="block text-[10px] font-medium uppercase text-slate-500 mb-0.5">Nome</label>
        <input
          type="text"
          value={nome}
          onChange={(e) => wrap(setNome)(e.target.value)}
          disabled={!souAdmin}
          className="w-full rounded border border-slate-300 bg-white px-2 py-1 text-xs outline-none focus:border-nexus-500"
        />
      </div>

      <div>
        <label className="block text-[10px] font-medium uppercase text-slate-500 mb-0.5">Descrição</label>
        <textarea
          rows={3}
          value={descricao}
          onChange={(e) => wrap(setDescricao)(e.target.value)}
          disabled={!souAdmin}
          className="w-full rounded border border-slate-300 bg-white px-2 py-1 text-xs outline-none focus:border-nexus-500"
        />
      </div>

      <div>
        <label className="block text-[10px] font-medium uppercase text-slate-500 mb-1">Cor</label>
        <div className="flex flex-wrap gap-1">
          {Object.entries(CORES_PAPEL).map(([nome, hex]) => (
            <button
              key={nome} type="button" disabled={!souAdmin}
              onClick={() => wrap(setCor)(nome)}
              aria-label={nome}
              className={`h-5 w-5 rounded-full ${cor === nome ? 'ring-1 ring-offset-1 ring-slate-700' : ''}`}
              style={{ backgroundColor: hex }}
            />
          ))}
        </div>
      </div>

      <div>
        <label className="block text-[10px] font-medium uppercase text-slate-500 mb-1">Equipes envolvidas</label>
        {equipesDisponiveis.length === 0 ? (
          <p className="text-xs text-slate-500">Nenhuma equipe cadastrada.</p>
        ) : (
          <div className="space-y-1 max-h-40 overflow-y-auto border border-slate-200 rounded p-1.5">
            {equipesDisponiveis.map((eq) => {
              const ativo = equipesIds.includes(eq.id);
              return (
                <label key={eq.id} className="flex items-center gap-1.5 text-xs cursor-pointer">
                  <input
                    type="checkbox" checked={ativo} disabled={!souAdmin}
                    onChange={(e) => {
                      if (e.target.checked) wrap(setEquipesIds)([...equipesIds, eq.id]);
                      else wrap(setEquipesIds)(equipesIds.filter((x) => x !== eq.id));
                    }}
                  />
                  <span>{eq.nome}</span>
                </label>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

// =============================================================================
// Sprint 15 — Modal de iniciar instância
// =============================================================================

function ModalIniciarInstancia({ processoId, processoNome, aoFechar, aoCriada }) {
  const [nome, setNome] = useState('');
  const [descricao, setDescricao] = useState('');
  const [dataInicio, setDataInicio] = useState(new Date().toISOString().slice(0, 10));
  const [erro, setErro] = useState('');
  const [salvando, setSalvando] = useState(false);

  async function submeter(e) {
    e.preventDefault();
    setErro('');
    setSalvando(true);
    try {
      const r = await api.post(`/processos/${processoId}/instancias`, {
        nome: nome.trim(),
        descricao: descricao.trim() || null,
        data_inicio: dataInicio || null,
      });
      aoCriada(r.data.quadro_id);
    } catch (err) {
      setErro(mensagemDeErro(err, 'Não consegui iniciar a instância.'));
      setSalvando(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4">
      <div className="w-full max-w-lg rounded-xl bg-white shadow-xl">
        <header className="flex items-center justify-between border-b border-slate-200 px-5 py-3">
          <h2 className="text-base font-semibold text-slate-900 inline-flex items-center gap-1.5">
            <Play size={14} /> Iniciar instância de “{processoNome}”
          </h2>
          <button onClick={aoFechar} className="rounded p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-600">
            <X size={18} />
          </button>
        </header>

        <form onSubmit={submeter} className="p-5 space-y-4">
          <div className="rounded-lg bg-emerald-50 border border-emerald-200 p-3 text-xs text-emerald-800">
            Vai ser criado <strong>um quadro novo</strong> pra esta execução,
            com 3 colunas (A fazer / Em andamento / Concluído). Os cards das
            tarefas iniciais nascem na coluna “A fazer”. Conforme você move pra
            “Concluído”, as próximas etapas ganham seus cards automaticamente.
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-900 mb-1">
              Nome da instância <span className="text-red-600">*</span>
            </label>
            <input
              required minLength={2} maxLength={255}
              value={nome}
              onChange={(e) => setNome(e.target.value)}
              placeholder="Ex: Cliente João Silva"
              className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm shadow-sm outline-none focus:border-nexus-500 focus:ring-2 focus:ring-nexus-200"
              autoFocus
            />
            <p className="mt-1 text-xs text-slate-500">
              O quadro será nomeado “{processoNome} — [seu nome]”.
            </p>
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-900 mb-1">Descrição</label>
            <textarea
              rows={2}
              maxLength={2000}
              value={descricao}
              onChange={(e) => setDescricao(e.target.value)}
              placeholder="Detalhes específicos desta execução (opcional)"
              className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm shadow-sm outline-none focus:border-nexus-500 focus:ring-2 focus:ring-nexus-200"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-900 mb-1">Data de início</label>
            <input
              type="date"
              value={dataInicio}
              onChange={(e) => setDataInicio(e.target.value)}
              className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm shadow-sm outline-none focus:border-nexus-500 focus:ring-2 focus:ring-nexus-200"
            />
            <p className="mt-1 text-xs text-slate-500">
              Os prazos dos cards são calculados a partir desta data.
            </p>
          </div>

          {erro && (
            <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{erro}</div>
          )}

          <div className="flex justify-end gap-2 pt-2">
            <button type="button" onClick={aoFechar}
              className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50">
              Cancelar
            </button>
            <button type="submit" disabled={salvando}
              className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-600 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-700 disabled:opacity-50">
              <Play size={14} />
              {salvando ? 'Iniciando...' : 'Iniciar e abrir quadro'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
