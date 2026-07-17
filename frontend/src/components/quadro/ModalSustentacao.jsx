import { useEffect, useMemo, useState } from 'react';
import { X, Plus, LifeBuoy, Trash2, ArrowUpRight, Loader2, AlertTriangle } from 'lucide-react';
import { api, mensagemDeErro } from '../../api/client.js';

/**
 * Fila de Sustentação — Sprint 41 (UI).
 *
 * Fluxo reativo/contínuo, separado do kanban: aberto → triado → atendendo →
 * aguardando → resolvido, com severidade e SLA. Um chamado pode ser promovido
 * a uma sprint (vira trabalho de projeto). Consome /api/sustentacao.
 */

const STATUS = [
  { id: 'aberto', nome: 'Aberto', cls: 'bg-red-50 text-red-700 border-red-200' },
  { id: 'triado', nome: 'Triado', cls: 'bg-orange-50 text-orange-700 border-orange-200' },
  { id: 'atendendo', nome: 'Atendendo', cls: 'bg-blue-50 text-blue-700 border-blue-200' },
  { id: 'aguardando', nome: 'Aguardando', cls: 'bg-amber-50 text-amber-700 border-amber-200' },
  { id: 'resolvido', nome: 'Resolvido', cls: 'bg-emerald-50 text-emerald-700 border-emerald-200' },
];
const SEVERIDADES = [
  { id: 'baixa', nome: 'Baixa', cls: 'bg-slate-100 text-slate-600 border-slate-200' },
  { id: 'media', nome: 'Média', cls: 'bg-amber-100 text-amber-800 border-amber-300' },
  { id: 'alta', nome: 'Alta', cls: 'bg-orange-100 text-orange-800 border-orange-300' },
  { id: 'critica', nome: 'Crítica', cls: 'bg-red-600 text-white border-red-700' },
];
const sevInfo = (s) => SEVERIDADES.find((x) => x.id === s);

function fmtSla(iso) {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  return d.toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
}

function FormChamado({ onCriar, onCancelar, salvando }) {
  const [titulo, setTitulo] = useState('');
  const [descricao, setDescricao] = useState('');
  const [severidade, setSeveridade] = useState('media');
  const [canal, setCanal] = useState('');
  const [sla, setSla] = useState('');

  function submeter(e) {
    e.preventDefault();
    if (!titulo.trim()) return;
    onCriar({
      titulo: titulo.trim(),
      descricao: descricao.trim() || null,
      severidade,
      canal_origem: canal.trim() || null,
      sla_vence_em: sla ? new Date(sla).toISOString() : null,
    });
  }
  return (
    <form onSubmit={submeter} className="space-y-3 rounded-lg border border-slate-200 bg-slate-50 p-3">
      <input value={titulo} onChange={(e) => setTitulo(e.target.value)} autoFocus maxLength={255}
        placeholder="Título do chamado *"
        className="w-full rounded-md border border-slate-300 px-2.5 py-1.5 text-sm focus:border-nexus-500 focus:outline-none" />
      <textarea value={descricao} onChange={(e) => setDescricao(e.target.value)} rows={2} maxLength={20000}
        placeholder="Descrição (opcional)"
        className="w-full resize-none rounded-md border border-slate-300 px-2.5 py-1.5 text-sm focus:border-nexus-500 focus:outline-none" />
      <div className="grid grid-cols-3 gap-2">
        <div>
          <label className="mb-1 block text-xs font-medium text-slate-600">Severidade</label>
          <select value={severidade} onChange={(e) => setSeveridade(e.target.value)}
            className="w-full rounded-md border border-slate-300 px-2 py-1.5 text-sm focus:border-nexus-500 focus:outline-none">
            {SEVERIDADES.map((s) => <option key={s.id} value={s.id}>{s.nome}</option>)}
          </select>
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium text-slate-600">Canal de origem</label>
          <input value={canal} onChange={(e) => setCanal(e.target.value)} maxLength={120} placeholder="Ex.: WhatsApp"
            className="w-full rounded-md border border-slate-300 px-2 py-1.5 text-sm focus:border-nexus-500 focus:outline-none" />
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium text-slate-600">SLA (vence em)</label>
          <input type="datetime-local" value={sla} onChange={(e) => setSla(e.target.value)}
            className="w-full rounded-md border border-slate-300 px-2 py-1.5 text-sm focus:border-nexus-500 focus:outline-none" />
        </div>
      </div>
      <div className="flex justify-end gap-2">
        <button type="button" onClick={onCancelar} className="rounded-md px-3 py-1.5 text-sm font-medium text-slate-600 hover:bg-slate-100">Cancelar</button>
        <button type="submit" disabled={salvando || !titulo.trim()}
          className="inline-flex items-center gap-1 rounded-md bg-nexus-700 px-3 py-1.5 text-sm font-medium text-white hover:bg-nexus-800 disabled:opacity-50">
          {salvando && <Loader2 size={14} className="animate-spin" />} Abrir chamado
        </button>
      </div>
    </form>
  );
}

export default function ModalSustentacao({ quadro, podeEditar, onFechar, onMudou }) {
  const [chamados, setChamados] = useState([]);
  const [sprints, setSprints] = useState([]);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState('');
  const [criando, setCriando] = useState(false);
  const [salvando, setSalvando] = useState(false);
  const [promovendo, setPromovendo] = useState(null); // card id
  const [destinoSprint, setDestinoSprint] = useState('');

  async function carregar() {
    setCarregando(true); setErro('');
    try {
      const [c, s] = await Promise.all([
        api.get('/sustentacao', { params: { quadro_id: quadro.id } }),
        api.get('/sprints', { params: { quadro_id: quadro.id } }).catch(() => ({ data: [] })),
      ]);
      setChamados(c.data);
      setSprints(s.data.filter((x) => x.estado !== 'encerrada'));
    } catch (e) { setErro(mensagemDeErro(e, 'Não foi possível carregar a fila.')); }
    finally { setCarregando(false); }
  }
  useEffect(() => { carregar(); /* eslint-disable-next-line */ }, [quadro.id]);

  async function criar(dados) {
    setSalvando(true); setErro('');
    try { await api.post('/sustentacao', { quadro_id: quadro.id, ...dados }); setCriando(false); await carregar(); onMudou?.(); }
    catch (e) { setErro(mensagemDeErro(e)); } finally { setSalvando(false); }
  }
  async function patch(id, campos) {
    setErro('');
    try { await api.patch('/sustentacao/' + id, campos); await carregar(); onMudou?.(); }
    catch (e) { setErro(mensagemDeErro(e)); }
  }
  async function promover(id) {
    setErro('');
    try {
      await api.post('/sustentacao/' + id + '/promover', destinoSprint ? { sprint_id: destinoSprint } : {});
      setPromovendo(null); setDestinoSprint(''); await carregar(); onMudou?.();
    } catch (e) { setErro(mensagemDeErro(e)); }
  }
  async function remover(id) {
    setErro('');
    try { await api.delete('/sustentacao/' + id); await carregar(); onMudou?.(); }
    catch (e) { setErro(mensagemDeErro(e)); }
  }

  const porStatus = useMemo(() => {
    const m = Object.fromEntries(STATUS.map((s) => [s.id, []]));
    for (const c of chamados) (m[c.sustentacao_status] || m.aberto).push(c);
    return m;
  }, [chamados]);

  const agora = Date.now();

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/40 p-4 sm:p-8" onClick={onFechar}>
      <div className="w-full max-w-3xl rounded-xl bg-white shadow-xl" onClick={(e) => e.stopPropagation()}>
        <header className="flex items-center justify-between border-b border-slate-200 px-5 py-3">
          <div className="flex items-center gap-2">
            <LifeBuoy size={16} className="text-nexus-700" />
            <h2 className="text-sm font-semibold text-slate-800">Sustentação — {quadro.nome}</h2>
          </div>
          <button onClick={onFechar} className="rounded p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-600"><X size={18} /></button>
        </header>

        <div className="max-h-[76vh] space-y-3 overflow-y-auto px-5 py-4">
          <p className="text-xs text-slate-500">
            Fila de chamados (fluxo reativo, fora do kanban): aberto → triado → atendendo → aguardando →
            resolvido, com severidade e SLA. Um chamado pode ser <strong>promovido</strong> a uma sprint.
          </p>
          {erro && <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">{erro}</div>}

          {podeEditar && !criando && (
            <button onClick={() => setCriando(true)}
              className="inline-flex items-center gap-1.5 rounded-md border border-dashed border-nexus-300 bg-nexus-50 px-3 py-2 text-sm font-medium text-nexus-700 hover:bg-nexus-100">
              <Plus size={15} /> Novo chamado
            </button>
          )}
          {criando && <FormChamado onCriar={criar} onCancelar={() => setCriando(false)} salvando={salvando} />}

          {carregando ? (
            <div className="flex items-center gap-2 py-6 text-sm text-slate-400"><Loader2 size={16} className="animate-spin" /> Carregando…</div>
          ) : chamados.length === 0 && !criando ? (
            <div className="py-6 text-center text-sm text-slate-400">Nenhum chamado na fila.</div>
          ) : (
            STATUS.map((st) => {
              const lista = porStatus[st.id] || [];
              if (lista.length === 0) return null;
              return (
                <div key={st.id}>
                  <div className="mb-1.5 flex items-center gap-2">
                    <span className={['rounded-full border px-2 py-0.5 text-[10px] font-semibold', st.cls].join(' ')}>{st.nome}</span>
                    <span className="text-[11px] text-slate-400">{lista.length}</span>
                  </div>
                  <ul className="space-y-2">
                    {lista.map((c) => {
                      const sev = sevInfo(c.severidade);
                      const slaTxt = fmtSla(c.sla_vence_em);
                      const atrasado = c.sla_vence_em && c.sustentacao_status !== 'resolvido' && new Date(c.sla_vence_em).getTime() < agora;
                      return (
                        <li key={c.id} className="rounded-lg border border-slate-200 p-2.5">
                          <div className="flex items-start justify-between gap-2">
                            <div className="min-w-0">
                              <div className="flex flex-wrap items-center gap-1.5">
                                <span className="text-sm font-medium text-slate-800">{c.titulo}</span>
                                {sev && <span className={['rounded border px-1.5 py-0.5 text-[10px] font-medium', sev.cls].join(' ')}>{sev.nome}</span>}
                                {c.canal_origem && <span className="rounded bg-slate-100 px-1.5 py-0.5 text-[10px] text-slate-500">{c.canal_origem}</span>}
                              </div>
                              {c.descricao && <p className="mt-0.5 line-clamp-2 text-xs text-slate-500">{c.descricao}</p>}
                              {slaTxt && (
                                <div className={['mt-1 inline-flex items-center gap-1 text-[11px]', atrasado ? 'font-semibold text-red-600' : 'text-slate-400'].join(' ')}>
                                  {atrasado && <AlertTriangle size={11} />} SLA: {slaTxt}{atrasado && ' (vencido)'}
                                </div>
                              )}
                            </div>
                          </div>

                          {podeEditar && (
                            <div className="mt-2 flex flex-wrap items-center gap-2">
                              <select value={c.sustentacao_status} onChange={(e) => patch(c.id, { sustentacao_status: e.target.value })}
                                className="rounded-md border border-slate-300 px-2 py-1 text-xs focus:border-nexus-500 focus:outline-none">
                                {STATUS.map((s) => <option key={s.id} value={s.id}>{s.nome}</option>)}
                              </select>
                              <select value={c.severidade || ''} onChange={(e) => patch(c.id, { severidade: e.target.value || null })}
                                className="rounded-md border border-slate-300 px-2 py-1 text-xs focus:border-nexus-500 focus:outline-none">
                                <option value="">Severidade…</option>
                                {SEVERIDADES.map((s) => <option key={s.id} value={s.id}>{s.nome}</option>)}
                              </select>
                              {promovendo === c.id ? (
                                <span className="inline-flex items-center gap-1">
                                  <select value={destinoSprint} onChange={(e) => setDestinoSprint(e.target.value)}
                                    className="rounded-md border border-slate-300 px-2 py-1 text-xs focus:border-nexus-500 focus:outline-none">
                                    <option value="">Backlog</option>
                                    {sprints.map((s) => <option key={s.id} value={s.id}>{s.nome}</option>)}
                                  </select>
                                  <button onClick={() => promover(c.id)} className="rounded-md bg-nexus-700 px-2 py-1 text-xs font-medium text-white hover:bg-nexus-800">Confirmar</button>
                                  <button onClick={() => setPromovendo(null)} className="rounded-md px-1.5 py-1 text-xs text-slate-500 hover:bg-slate-100">×</button>
                                </span>
                              ) : (
                                <button onClick={() => { setPromovendo(c.id); setDestinoSprint(''); }} title="Promover a sprint/projeto"
                                  className="inline-flex items-center gap-1 rounded-md border border-slate-300 px-2 py-1 text-xs font-medium text-slate-600 hover:bg-slate-50">
                                  <ArrowUpRight size={12} /> Promover
                                </button>
                              )}
                              <button onClick={() => remover(c.id)} title="Arquivar chamado"
                                className="ml-auto rounded-md p-1 text-slate-400 hover:bg-red-50 hover:text-red-600"><Trash2 size={13} /></button>
                            </div>
                          )}
                        </li>
                      );
                    })}
                  </ul>
                </div>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
}
