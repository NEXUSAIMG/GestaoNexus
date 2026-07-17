import { useEffect, useMemo, useState } from 'react';
import { X, Plus, Play, Flag, Trash2, Pencil, Loader2, ChevronDown, ChevronRight } from 'lucide-react';
import { api, mensagemDeErro } from '../../api/client.js';

/**
 * Painel de Sprints — Sprint 41 (UI).
 *
 * Ciclo de vida das sprints de um quadro (criar/ativar/encerrar/editar/excluir)
 * + gestão dos cards de cada sprint (puxar do backlog / tirar).
 *
 * Várias sprints podem estar "ativa" ao mesmo tempo — cada uma é uma raia
 * sobre as mesmas colunas do quadro (ver visão Swimlanes → "Sprint").
 * Só cards de fluxo 'projeto' entram em sprint (sustentação é outro fluxo).
 */

const ESTADO_BADGE = {
  planejamento: { txt: 'Planejamento', cls: 'bg-slate-100 text-slate-600 border-slate-200' },
  ativa: { txt: 'Ativa', cls: 'bg-emerald-100 text-emerald-800 border-emerald-300' },
  encerrada: { txt: 'Encerrada', cls: 'bg-slate-50 text-slate-400 border-slate-200' },
};

const hoje = () => new Date().toISOString().slice(0, 10);
const emDias = (n) => new Date(Date.now() + n * 86400000).toISOString().slice(0, 10);

function FormSprint({ inicial, onSalvar, onCancelar, salvando }) {
  const [nome, setNome] = useState(inicial?.nome ?? '');
  const [meta, setMeta] = useState(inicial?.meta ?? '');
  const [dataInicio, setDataInicio] = useState(inicial?.data_inicio?.slice(0, 10) ?? hoje());
  const [dataFim, setDataFim] = useState(inicial?.data_fim?.slice(0, 10) ?? emDias(14));
  const [capacidade, setCapacidade] = useState(
    inicial?.capacidade_pontos != null ? String(inicial.capacidade_pontos) : '',
  );

  function submeter(e) {
    e.preventDefault();
    if (!nome.trim()) return;
    onSalvar({
      nome: nome.trim(),
      meta: meta.trim() || null,
      data_inicio: dataInicio,
      data_fim: dataFim,
      capacidade_pontos: capacidade === '' ? null : Math.max(0, parseInt(capacidade, 10) || 0),
    });
  }

  return (
    <form onSubmit={submeter} className="space-y-3 rounded-lg border border-slate-200 bg-slate-50 p-3">
      <div>
        <label className="mb-1 block text-xs font-medium text-slate-600">Nome da sprint *</label>
        <input
          value={nome}
          onChange={(e) => setNome(e.target.value)}
          placeholder="Ex.: Sprint 1 — Correções críticas"
          maxLength={100}
          autoFocus
          className="w-full rounded-md border border-slate-300 px-2.5 py-1.5 text-sm focus:border-nexus-500 focus:outline-none"
        />
      </div>
      <div>
        <label className="mb-1 block text-xs font-medium text-slate-600">Meta / objetivo (opcional)</label>
        <textarea
          value={meta}
          onChange={(e) => setMeta(e.target.value)}
          rows={2}
          maxLength={2000}
          placeholder="O que esta sprint quer entregar?"
          className="w-full resize-none rounded-md border border-slate-300 px-2.5 py-1.5 text-sm focus:border-nexus-500 focus:outline-none"
        />
      </div>
      <div className="grid grid-cols-3 gap-2">
        <div>
          <label className="mb-1 block text-xs font-medium text-slate-600">Início</label>
          <input type="date" value={dataInicio} onChange={(e) => setDataInicio(e.target.value)}
            className="w-full rounded-md border border-slate-300 px-2 py-1.5 text-sm focus:border-nexus-500 focus:outline-none" />
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium text-slate-600">Fim</label>
          <input type="date" value={dataFim} min={dataInicio} onChange={(e) => setDataFim(e.target.value)}
            className="w-full rounded-md border border-slate-300 px-2 py-1.5 text-sm focus:border-nexus-500 focus:outline-none" />
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium text-slate-600">Capacidade (pts)</label>
          <input type="number" min="0" value={capacidade} onChange={(e) => setCapacidade(e.target.value)} placeholder="—"
            className="w-full rounded-md border border-slate-300 px-2 py-1.5 text-sm focus:border-nexus-500 focus:outline-none" />
        </div>
      </div>
      <div className="flex justify-end gap-2 pt-1">
        <button type="button" onClick={onCancelar}
          className="rounded-md px-3 py-1.5 text-sm font-medium text-slate-600 hover:bg-slate-100">Cancelar</button>
        <button type="submit" disabled={salvando || !nome.trim()}
          className="inline-flex items-center gap-1 rounded-md bg-nexus-700 px-3 py-1.5 text-sm font-medium text-white hover:bg-nexus-800 disabled:opacity-50">
          {salvando && <Loader2 size={14} className="animate-spin" />} Salvar
        </button>
      </div>
    </form>
  );
}

function BarraProgresso({ feito, total }) {
  const pct = total > 0 ? Math.round((feito / total) * 100) : 0;
  return (
    <div className="mt-1.5 h-1.5 w-full overflow-hidden rounded-full bg-slate-200">
      <div className="h-full rounded-full bg-emerald-500 transition-all" style={{ width: `${pct}%` }} />
    </div>
  );
}

/** Gestão de cards de uma sprint: lista os atuais + picklist do backlog. */
function CardsDaSprint({ sprint, quadro, podeEditar, onErro, onMudou }) {
  const [abrindoPicker, setAbrindoPicker] = useState(false);
  const [sel, setSel] = useState(() => new Set());
  const [ocupado, setOcupado] = useState(false);

  const naSprint = useMemo(
    () => (quadro.cards || []).filter((c) => c.sprint_id === sprint.id),
    [quadro.cards, sprint.id],
  );
  const backlog = useMemo(
    () => (quadro.cards || []).filter((c) => c.fluxo === 'projeto' && !c.sprint_id),
    [quadro.cards],
  );

  async function adicionar() {
    if (sel.size === 0) return;
    setOcupado(true); onErro('');
    try {
      await api.post('/sprints/' + sprint.id + '/cards', { card_ids: [...sel] });
      setSel(new Set()); setAbrindoPicker(false);
      onMudou?.();
    } catch (e) { onErro(mensagemDeErro(e)); } finally { setOcupado(false); }
  }
  async function tirar(cardId) {
    setOcupado(true); onErro('');
    try {
      await api.delete('/sprints/' + sprint.id + '/cards/' + cardId);
      onMudou?.();
    } catch (e) { onErro(mensagemDeErro(e)); } finally { setOcupado(false); }
  }

  return (
    <div className="mt-2 rounded-md border border-slate-200 bg-white p-2">
      {naSprint.length === 0 ? (
        <p className="px-1 py-1 text-xs text-slate-400">Nenhum card nesta sprint ainda.</p>
      ) : (
        <ul className="space-y-1">
          {naSprint.map((c) => (
            <li key={c.id} className="flex items-center justify-between gap-2 rounded px-1.5 py-1 text-xs hover:bg-slate-50">
              <span className="min-w-0 truncate text-slate-700">
                {c.concluido_em && <span className="mr-1 text-emerald-600">✓</span>}
                {c.titulo}
              </span>
              {podeEditar && (
                <button onClick={() => tirar(c.id)} disabled={ocupado} title="Tirar da sprint"
                  className="shrink-0 rounded p-0.5 text-slate-400 hover:bg-red-50 hover:text-red-600 disabled:opacity-50">
                  <X size={13} />
                </button>
              )}
            </li>
          ))}
        </ul>
      )}

      {podeEditar && (
        <div className="mt-1.5 border-t border-slate-100 pt-1.5">
          {!abrindoPicker ? (
            <button onClick={() => setAbrindoPicker(true)} disabled={backlog.length === 0}
              className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs font-medium text-nexus-700 hover:bg-nexus-50 disabled:opacity-40">
              <Plus size={13} /> Puxar do backlog{backlog.length ? ` (${backlog.length})` : ' — vazio'}
            </button>
          ) : (
            <div>
              <div className="max-h-40 overflow-y-auto rounded border border-slate-200">
                {backlog.map((c) => {
                  const on = sel.has(c.id);
                  return (
                    <label key={c.id} className="flex cursor-pointer items-center gap-2 px-2 py-1 text-xs hover:bg-slate-50">
                      <input type="checkbox" checked={on} onChange={() => {
                        const n = new Set(sel); on ? n.delete(c.id) : n.add(c.id); setSel(n);
                      }} />
                      <span className="min-w-0 truncate text-slate-700">{c.titulo}</span>
                    </label>
                  );
                })}
              </div>
              <div className="mt-1.5 flex items-center gap-2">
                <button onClick={adicionar} disabled={ocupado || sel.size === 0}
                  className="inline-flex items-center gap-1 rounded-md bg-nexus-700 px-2.5 py-1 text-xs font-medium text-white hover:bg-nexus-800 disabled:opacity-50">
                  {ocupado && <Loader2 size={12} className="animate-spin" />} Adicionar {sel.size || ''}
                </button>
                <button onClick={() => { setAbrindoPicker(false); setSel(new Set()); }}
                  className="rounded-md px-2 py-1 text-xs text-slate-500 hover:bg-slate-100">Fechar</button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export default function ModalSprints({ quadro, podeEditar, onFechar, onMudou }) {
  const [sprints, setSprints] = useState([]);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState('');
  const [criando, setCriando] = useState(false);
  const [editando, setEditando] = useState(null);
  const [salvando, setSalvando] = useState(false);
  const [encerrando, setEncerrando] = useState(null);
  const [destinoEncerrar, setDestinoEncerrar] = useState('backlog');
  const [expandido, setExpandido] = useState(null); // sprint com cards abertos

  async function carregar() {
    setCarregando(true); setErro('');
    try {
      const r = await api.get('/sprints', { params: { quadro_id: quadro.id } });
      setSprints(r.data);
    } catch (e) { setErro(mensagemDeErro(e, 'Não foi possível carregar as sprints.')); }
    finally { setCarregando(false); }
  }
  useEffect(() => { carregar(); /* eslint-disable-next-line */ }, [quadro.id]);

  // Recarrega selos das sprints quando o board muda (cards puxados/tirados).
  async function recarregarTudo() { await Promise.resolve(onMudou?.()); await carregar(); }

  async function criarSprint(dados) {
    setSalvando(true); setErro('');
    try { await api.post('/sprints', { quadro_id: quadro.id, ...dados }); setCriando(false); await recarregarTudo(); }
    catch (e) { setErro(mensagemDeErro(e)); } finally { setSalvando(false); }
  }
  async function salvarEdicao(id, dados) {
    setSalvando(true); setErro('');
    try { await api.put('/sprints/' + id, dados); setEditando(null); await carregar(); }
    catch (e) { setErro(mensagemDeErro(e)); } finally { setSalvando(false); }
  }
  async function ativar(id) {
    setErro('');
    try { await api.post('/sprints/' + id + '/ativar'); await carregar(); }
    catch (e) { setErro(mensagemDeErro(e)); }
  }
  async function encerrar(id) {
    setSalvando(true); setErro('');
    try {
      await api.post('/sprints/' + id + '/encerrar', { destino: destinoEncerrar });
      setEncerrando(null); setDestinoEncerrar('backlog'); await recarregarTudo();
    } catch (e) { setErro(mensagemDeErro(e)); } finally { setSalvando(false); }
  }
  async function excluir(id) {
    setErro('');
    try { await api.delete('/sprints/' + id); await recarregarTudo(); }
    catch (e) { setErro(mensagemDeErro(e)); }
  }

  const outras = (id) => sprints.filter((s) => s.id !== id && s.estado !== 'encerrada');

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/40 p-4 sm:p-8" onClick={onFechar}>
      <div className="w-full max-w-2xl rounded-xl bg-white shadow-xl" onClick={(e) => e.stopPropagation()}>
        <header className="flex items-center justify-between border-b border-slate-200 px-5 py-3">
          <div className="flex items-center gap-2">
            <Flag size={16} className="text-nexus-700" />
            <h2 className="text-sm font-semibold text-slate-800">Sprints — {quadro.nome}</h2>
          </div>
          <button onClick={onFechar} className="rounded p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-600">
            <X size={18} />
          </button>
        </header>

        <div className="max-h-[74vh] space-y-3 overflow-y-auto px-5 py-4">
          <p className="text-xs text-slate-500">
            Sprints são compromissos com prazo. Várias podem ficar ativas ao mesmo tempo (cada uma vira
            uma raia no quadro — veja em Swimlanes → Sprint). Ao encerrar, os cards não concluídos voltam
            ao backlog (ou a outra sprint).
          </p>

          {erro && <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">{erro}</div>}

          {podeEditar && !criando && (
            <button onClick={() => { setCriando(true); setEditando(null); }}
              className="inline-flex items-center gap-1.5 rounded-md border border-dashed border-nexus-300 bg-nexus-50 px-3 py-2 text-sm font-medium text-nexus-700 hover:bg-nexus-100">
              <Plus size={15} /> Nova sprint
            </button>
          )}
          {criando && <FormSprint onSalvar={criarSprint} onCancelar={() => setCriando(false)} salvando={salvando} />}

          {carregando ? (
            <div className="flex items-center gap-2 py-6 text-sm text-slate-400"><Loader2 size={16} className="animate-spin" /> Carregando…</div>
          ) : sprints.length === 0 && !criando ? (
            <div className="py-6 text-center text-sm text-slate-400">Nenhuma sprint ainda.</div>
          ) : (
            <ul className="space-y-2">
              {sprints.map((s) => {
                const badge = ESTADO_BADGE[s.estado] ?? ESTADO_BADGE.planejamento;
                if (editando === s.id) {
                  return (
                    <li key={s.id}>
                      <FormSprint inicial={s} salvando={salvando}
                        onSalvar={(d) => salvarEdicao(s.id, d)} onCancelar={() => setEditando(null)} />
                    </li>
                  );
                }
                const aberto = expandido === s.id;
                return (
                  <li key={s.id} className="rounded-lg border border-slate-200 p-3">
                    <div className="flex items-start justify-between gap-2">
                      <button className="min-w-0 text-left" onClick={() => setExpandido(aberto ? null : s.id)}>
                        <div className="flex items-center gap-2">
                          {aberto ? <ChevronDown size={14} className="text-slate-400" /> : <ChevronRight size={14} className="text-slate-400" />}
                          <span className="truncate text-sm font-semibold text-slate-800">{s.nome}</span>
                          <span className={['rounded-full border px-2 py-0.5 text-[10px] font-medium', badge.cls].join(' ')}>{badge.txt}</span>
                        </div>
                        {s.meta && <p className="mt-0.5 line-clamp-2 pl-5 text-xs text-slate-500">{s.meta}</p>}
                        <div className="mt-1 pl-5 text-[11px] text-slate-400">
                          {String(s.data_inicio).slice(0, 10)} → {String(s.data_fim).slice(0, 10)}
                          {s.capacidade_pontos != null && ` · capacidade ${s.capacidade_pontos} pts`}
                        </div>
                      </button>
                      {podeEditar && (
                        <div className="flex shrink-0 items-center gap-1">
                          {s.estado !== 'ativa' && s.estado !== 'encerrada' && (
                            <button onClick={() => ativar(s.id)} title="Ativar"
                              className="inline-flex items-center gap-1 rounded-md bg-emerald-600 px-2 py-1 text-xs font-medium text-white hover:bg-emerald-700">
                              <Play size={12} /> Ativar
                            </button>
                          )}
                          {s.estado === 'ativa' && (
                            <button onClick={() => { setEncerrando(s.id); setDestinoEncerrar('backlog'); }} title="Encerrar"
                              className="inline-flex items-center gap-1 rounded-md border border-slate-300 px-2 py-1 text-xs font-medium text-slate-600 hover:bg-slate-50">
                              <Flag size={12} /> Encerrar
                            </button>
                          )}
                          <button onClick={() => { setEditando(s.id); setCriando(false); }} title="Editar"
                            className="rounded-md p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-600"><Pencil size={13} /></button>
                          <button onClick={() => excluir(s.id)} title="Excluir"
                            className="rounded-md p-1 text-slate-400 hover:bg-red-50 hover:text-red-600"><Trash2 size={13} /></button>
                        </div>
                      )}
                    </div>

                    <div className="mt-2 flex items-center gap-4 pl-5 text-[11px] text-slate-500">
                      <span>{s.n_concluidos}/{s.n_cards} cards</span>
                      <span>{s.pontos_concluidos}/{s.pontos_comprometidos} pts</span>
                    </div>
                    <div className="pl-5"><BarraProgresso feito={s.n_concluidos} total={s.n_cards} /></div>

                    {aberto && (
                      <div className="pl-5">
                        <CardsDaSprint sprint={s} quadro={quadro} podeEditar={podeEditar}
                          onErro={setErro} onMudou={recarregarTudo} />
                      </div>
                    )}

                    {encerrando === s.id && (
                      <div className="mt-3 rounded-md border border-slate-200 bg-slate-50 p-2.5">
                        <p className="mb-2 text-xs text-slate-600">Ao encerrar, os cards <strong>não concluídos</strong> vão para:</p>
                        <div className="flex items-center gap-2">
                          <select value={destinoEncerrar} onChange={(e) => setDestinoEncerrar(e.target.value)}
                            className="flex-1 rounded-md border border-slate-300 px-2 py-1.5 text-sm focus:border-nexus-500 focus:outline-none">
                            <option value="backlog">Backlog do produto</option>
                            {outras(s.id).map((o) => <option key={o.id} value={o.id}>Sprint: {o.nome}</option>)}
                          </select>
                          <button onClick={() => encerrar(s.id)} disabled={salvando}
                            className="inline-flex items-center gap-1 rounded-md bg-nexus-700 px-3 py-1.5 text-sm font-medium text-white hover:bg-nexus-800 disabled:opacity-50">
                            {salvando && <Loader2 size={13} className="animate-spin" />} Confirmar
                          </button>
                          <button onClick={() => setEncerrando(null)} className="rounded-md px-2 py-1.5 text-sm text-slate-500 hover:bg-slate-100">Cancelar</button>
                        </div>
                      </div>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}
