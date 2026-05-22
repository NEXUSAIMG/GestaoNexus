import { useEffect, useMemo, useRef, useState } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import {
  ArrowLeft, Building2, Pencil, Archive, Users2, KanbanSquare, History,
  Plus, X, MapPin, Phone, Mail, ExternalLink, Trash2, ChevronRight,
  MessageSquare, PhoneCall, RefreshCw, ArrowRight,
} from 'lucide-react';
import { api, mensagemDeErro } from '../api/client.js';
import MultiSelectPessoas from '../components/MultiSelectPessoas.jsx';
import ModalCartorio, { TIPOS_CARTORIO, STATUS_CARTORIO } from '../components/ModalCartorio.jsx';

/**
 * Página de detalhe do cartório — Sprint 20B.
 *
 * Quatro seções verticais:
 *   1. Informações básicas (read-only + botão editar abre ModalCartorio)
 *   2. Responsáveis (lista + botão gerenciar abre ModalResponsaveis)
 *   3. Vínculos com quadros (lista + botões vincular/mudar fase/desvincular)
 *   4. Histórico (timeline + botão adicionar nota/contato)
 */

const inputCls = 'w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm shadow-sm outline-none focus:border-nexus-500 focus:ring-2 focus:ring-nexus-200';

function rotuloTipo(t) { return TIPOS_CARTORIO.find((x) => x.valor === t)?.rotulo || t; }
function statusInfo(s) { return STATUS_CARTORIO.find((x) => x.valor === s) || STATUS_CARTORIO[0]; }
function iniciais(nome) {
  return (nome || '?').split(' ').filter(Boolean).slice(0, 2).map((p) => p[0]?.toUpperCase()).join('');
}
function formatarDataHora(iso) {
  if (!iso) return '';
  return new Date(iso).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}

// =============================================================================
// Página principal
// =============================================================================

export default function Cartorio() {
  const { id } = useParams();
  const navigate = useNavigate();

  const [cartorio, setCartorio] = useState(null);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState('');

  // Sprint 28 — gate de versão pra resolver race condition entre múltiplos
  // carregar() em paralelo (ex: usuário salva no modal e desvincula quadro em
  // sequência rápida). O response mais recente sempre vence.
  const carregaIdRef = useRef(0);

  // modal pode ser: null | 'editar' | 'responsaveis' | 'vincular' | 'nota' | { tipo: 'mudarFase', vinculo }
  const [modal, setModal] = useState(null);

  async function carregar() {
    const meuId = ++carregaIdRef.current;
    setCarregando(true);
    setErro('');
    try {
      const r = await api.get(`/cartorios/${id}`);
      // Se outro carregar() começou enquanto este estava em flight, descarta.
      if (meuId !== carregaIdRef.current) return;
      setCartorio(r.data);
    } catch (err) {
      if (meuId === carregaIdRef.current) {
        setErro(mensagemDeErro(err, 'Não consegui carregar o cartório.'));
      }
    } finally {
      if (meuId === carregaIdRef.current) {
        setCarregando(false);
      }
    }
  }

  useEffect(() => { carregar(); /* eslint-disable-next-line */ }, [id]);

  async function arquivar() {
    if (!confirm(`Arquivar o cartório "${cartorio.nome}"?\nEle some da listagem mas pode ser desarquivado depois (via banco).`)) return;
    try {
      await api.post(`/cartorios/${cartorio.id}/arquivar`);
      navigate('/cartorios');
    } catch (err) {
      alert(mensagemDeErro(err));
    }
  }

  async function desvincular(quadroId) {
    if (!confirm('Desvincular este cartório do quadro? O histórico de vínculo é mantido.')) return;
    try {
      await api.delete(`/cartorios/${cartorio.id}/quadros/${quadroId}`);
      carregar();
    } catch (err) {
      alert(mensagemDeErro(err));
    }
  }

  if (carregando) {
    return <div className="py-12 text-center text-sm text-slate-500">Carregando…</div>;
  }
  if (erro || !cartorio) {
    return (
      <div className="space-y-3">
        <Link to="/cartorios" className="inline-flex items-center gap-1 text-sm text-nexus-700 hover:underline">
          <ArrowLeft size={14} /> Voltar à lista
        </Link>
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {erro || 'Cartório não encontrado.'}
        </div>
      </div>
    );
  }

  const status = statusInfo(cartorio.status);

  return (
    <div className="space-y-4">
      {/* HEADER */}
      <div>
        <Link to="/cartorios" className="inline-flex items-center gap-1 text-xs text-slate-500 hover:text-nexus-700">
          <ArrowLeft size={12} /> Voltar à lista
        </Link>
        <div className="mt-1 flex flex-wrap items-start justify-between gap-2">
          <div className="flex items-start gap-2 min-w-0 flex-1">
            <Building2 size={26} className="mt-1 shrink-0 text-nexus-700" />
            <div className="min-w-0">
              <h1 className="text-xl font-semibold text-slate-900 break-words">{cartorio.nome}</h1>
              <div className="mt-1 flex flex-wrap items-center gap-2">
                <span className={`inline-flex items-center rounded border px-1.5 py-0.5 text-[10px] font-medium ${status.cor}`}>
                  {status.rotulo}
                </span>
                <span className="rounded bg-slate-100 px-1.5 py-0.5 text-[10px] font-medium text-slate-700">
                  {rotuloTipo(cartorio.tipo)}
                </span>
                {(cartorio.cidade || cartorio.uf) && (
                  <span className="inline-flex items-center gap-1 text-xs text-slate-500">
                    <MapPin size={11} />
                    {[cartorio.cidade, cartorio.uf].filter(Boolean).join(' / ')}
                  </span>
                )}
              </div>
            </div>
          </div>
          <div className="flex items-center gap-1.5">
            <button type="button" onClick={() => setModal('editar')}
              className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50">
              <Pencil size={12} /> Editar
            </button>
            <button type="button" onClick={arquivar}
              className="inline-flex items-center gap-1.5 rounded-lg border border-red-200 bg-white px-2.5 py-1.5 text-xs font-medium text-red-700 hover:bg-red-50">
              <Archive size={12} /> Arquivar
            </button>
          </div>
        </div>
      </div>

      {/* SEÇÃO 1 — Informações */}
      <Secao titulo="Informações">
        <dl className="grid grid-cols-1 md:grid-cols-2 gap-x-6 gap-y-3 text-sm">
          <Campo rotulo="Telefone" icone={<Phone size={12} />}>{cartorio.telefone || <Vazio />}</Campo>
          <Campo rotulo="Email" icone={<Mail size={12} />}>
            {cartorio.email ? (
              <a href={`mailto:${cartorio.email}`} className="text-nexus-700 hover:underline">{cartorio.email}</a>
            ) : <Vazio />}
          </Campo>
        </dl>
        <div className="mt-3">
          <div className="text-[10px] font-semibold uppercase tracking-wider text-slate-500 mb-1">Especificidades</div>
          {cartorio.especificidades ? (
            <div className="rounded-lg bg-slate-50 p-3 text-sm text-slate-700 whitespace-pre-wrap">
              {cartorio.especificidades}
            </div>
          ) : <Vazio />}
        </div>
      </Secao>

      {/* SEÇÃO 2 — Responsáveis */}
      <Secao
        titulo="Responsáveis"
        icone={<Users2 size={14} />}
        contador={cartorio.responsaveis.length}
        acao={
          <button type="button" onClick={() => setModal('responsaveis')}
            className="text-xs font-medium text-nexus-700 hover:text-nexus-800">
            Gerenciar
          </button>
        }
      >
        {cartorio.responsaveis.length === 0 ? (
          <div className="text-sm text-slate-500">
            Nenhum responsável atribuído.{' '}
            <button type="button" onClick={() => setModal('responsaveis')}
              className="font-medium text-nexus-700 hover:underline">
              Atribuir agora
            </button>
          </div>
        ) : (
          <div className="flex flex-wrap gap-2">
            {cartorio.responsaveis.map((r) => (
              <span key={r.id}
                className="inline-flex items-center gap-2 rounded-full bg-slate-100 pl-1 pr-3 py-0.5 text-sm">
                <span className="inline-flex h-6 w-6 items-center justify-center rounded-full bg-nexus-100 text-[10px] font-semibold text-nexus-800">
                  {iniciais(r.nome)}
                </span>
                <span className="text-slate-700">{r.nome}</span>
              </span>
            ))}
          </div>
        )}
      </Secao>

      {/* SEÇÃO 3 — Vínculos com quadros */}
      <Secao
        titulo="Vínculos com quadros"
        icone={<KanbanSquare size={14} />}
        contador={cartorio.vinculos.length}
        acao={
          <button type="button" onClick={() => setModal('vincular')}
            className="inline-flex items-center gap-1 text-xs font-medium text-nexus-700 hover:text-nexus-800">
            <Plus size={11} /> Vincular a quadro
          </button>
        }
      >
        {cartorio.vinculos.length === 0 ? (
          <div className="text-sm text-slate-500">
            Não vinculado a nenhum quadro.{' '}
            <button type="button" onClick={() => setModal('vincular')}
              className="font-medium text-nexus-700 hover:underline">
              Vincular agora
            </button>
          </div>
        ) : (
          <ul className="space-y-2">
            {cartorio.vinculos.map((v) => (
              <li key={v.quadro_id}
                className="flex items-center gap-2 rounded-lg border border-slate-200 bg-white p-2.5">
                <KanbanSquare size={14} className="shrink-0 text-slate-400" />
                <div className="flex-1 min-w-0">
                  <Link to={`/tarefas/${v.quadro_id}`}
                    className="text-sm font-medium text-slate-900 hover:text-nexus-700 hover:underline">
                    {v.quadro_nome}
                  </Link>
                  <div className="text-xs text-slate-500">
                    Fase atual:{' '}
                    {v.coluna_nome ? (
                      <span className="font-medium text-slate-700">{v.coluna_nome}</span>
                    ) : (
                      <span className="text-slate-400 italic">não definida</span>
                    )}
                  </div>
                </div>
                <button type="button" onClick={() => setModal({ tipo: 'mudarFase', vinculo: v })}
                  className="rounded p-1.5 text-slate-500 hover:bg-slate-100 hover:text-nexus-700"
                  title="Mudar de fase">
                  <RefreshCw size={12} />
                </button>
                <button type="button" onClick={() => desvincular(v.quadro_id)}
                  className="rounded p-1.5 text-slate-400 hover:bg-red-50 hover:text-red-700"
                  title="Desvincular">
                  <Trash2 size={12} />
                </button>
              </li>
            ))}
          </ul>
        )}
      </Secao>

      {/* SEÇÃO 4 — Histórico */}
      <Secao
        titulo="Histórico"
        icone={<History size={14} />}
        contador={(cartorio.atualizacoes_recentes || []).length}
        acao={
          <button type="button" onClick={() => setModal('nota')}
            className="inline-flex items-center gap-1 text-xs font-medium text-nexus-700 hover:text-nexus-800">
            <Plus size={11} /> Nova nota/contato
          </button>
        }
      >
        <Historico atualizacoes={cartorio.atualizacoes_recentes || []} cartorio={cartorio} />
      </Secao>

      {/* MODAIS */}
      {modal === 'editar' && (
        <ModalCartorio
          modo="editar"
          cartorio={cartorio}
          onFechar={() => setModal(null)}
          onSalvo={() => { setModal(null); carregar(); }}
        />
      )}
      {modal === 'responsaveis' && (
        <ModalResponsaveis
          cartorio={cartorio}
          onFechar={() => setModal(null)}
          onSalvo={() => { setModal(null); carregar(); }}
        />
      )}
      {modal === 'vincular' && (
        <ModalVincularQuadro
          cartorio={cartorio}
          onFechar={() => setModal(null)}
          onSalvo={() => { setModal(null); carregar(); }}
        />
      )}
      {modal?.tipo === 'mudarFase' && (
        <ModalMudarFase
          cartorio={cartorio}
          vinculo={modal.vinculo}
          onFechar={() => setModal(null)}
          onSalvo={() => { setModal(null); carregar(); }}
        />
      )}
      {modal === 'nota' && (
        <ModalNota
          cartorio={cartorio}
          onFechar={() => setModal(null)}
          onSalvo={() => { setModal(null); carregar(); }}
        />
      )}
    </div>
  );
}

// =============================================================================
// Subcomponentes de layout
// =============================================================================

function Secao({ titulo, icone, contador, acao, children }) {
  return (
    <section className="rounded-xl border border-slate-200 bg-white shadow-sm">
      <header className="flex items-center justify-between border-b border-slate-100 px-4 py-2.5">
        <div className="flex items-center gap-2">
          {icone && <span className="text-slate-500">{icone}</span>}
          <h2 className="text-sm font-semibold text-slate-900">{titulo}</h2>
          {typeof contador === 'number' && (
            <span className="rounded-full bg-slate-100 px-1.5 py-0.5 text-[10px] font-semibold text-slate-600">
              {contador}
            </span>
          )}
        </div>
        {acao}
      </header>
      <div className="p-4">{children}</div>
    </section>
  );
}

function Campo({ rotulo, icone, children }) {
  return (
    <div>
      <dt className="flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wider text-slate-500">
        {icone} {rotulo}
      </dt>
      <dd className="mt-0.5 text-slate-800">{children}</dd>
    </div>
  );
}

function Vazio() { return <span className="text-slate-400 italic">não informado</span>; }

// =============================================================================
// Histórico (timeline)
// =============================================================================

function Historico({ atualizacoes, cartorio }) {
  if (atualizacoes.length === 0) {
    return (
      <div className="text-sm text-slate-500">
        Nenhuma atualização registrada ainda.
      </div>
    );
  }
  return (
    <ol className="space-y-3">
      {atualizacoes.map((a) => <ItemHistorico key={a.id} a={a} cartorio={cartorio} />)}
    </ol>
  );
}

function ItemHistorico({ a, cartorio }) {
  // Cada tipo tem um ícone, cor e texto descritivo próprio
  const config = {
    nota: {
      icone: <MessageSquare size={12} />,
      cor: 'bg-slate-100 text-slate-700',
      label: 'Nota',
      conteudo: <p className="text-sm text-slate-700 whitespace-pre-wrap">{a.texto}</p>,
    },
    contato: {
      icone: <PhoneCall size={12} />,
      cor: 'bg-blue-100 text-blue-700',
      label: 'Contato',
      conteudo: <p className="text-sm text-slate-700 whitespace-pre-wrap">{a.texto}</p>,
    },
    mudanca_status: {
      icone: <RefreshCw size={12} />,
      cor: 'bg-amber-100 text-amber-700',
      label: 'Status alterado',
      conteudo: (
        <p className="text-sm text-slate-700">
          <span className="font-medium">{rotuloStatus(a.metadados?.antes)}</span>
          <ArrowRight size={11} className="inline mx-1 text-slate-400" />
          <span className="font-medium">{rotuloStatus(a.metadados?.depois)}</span>
        </p>
      ),
    },
    mudanca_fase: {
      icone: <ArrowRight size={12} />,
      cor: 'bg-violet-100 text-violet-700',
      label: 'Fase alterada',
      conteudo: (() => {
        const vinculo = cartorio.vinculos.find((v) => v.quadro_id === a.metadados?.quadro_id);
        const quadroNome = vinculo?.quadro_nome || 'quadro desconhecido';
        return (
          <p className="text-sm text-slate-700">
            Em <span className="font-medium">{quadroNome}</span>:{' '}
            <span className="font-medium">{a.metadados?.coluna_antes_nome || 'sem fase'}</span>
            <ArrowRight size={11} className="inline mx-1 text-slate-400" />
            <span className="font-medium">{a.metadados?.coluna_depois_nome || 'sem fase'}</span>
          </p>
        );
      })(),
    },
  };
  const c = config[a.tipo] || { icone: <MessageSquare size={12} />, cor: 'bg-slate-100 text-slate-700', label: a.tipo, conteudo: <p>{a.texto}</p> };

  return (
    <li className="flex gap-3">
      <span className={`inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-full ${c.cor}`}>
        {c.icone}
      </span>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 text-[11px]">
          <span className="font-semibold text-slate-700">{c.label}</span>
          <span className="text-slate-400">·</span>
          <span className="text-slate-500">{a.pessoa_nome || 'Sistema'}</span>
          <span className="text-slate-400">·</span>
          <span className="text-slate-500 tabular-nums">{formatarDataHora(a.criado_em)}</span>
        </div>
        <div className="mt-1">{c.conteudo}</div>
      </div>
    </li>
  );
}

function rotuloStatus(valor) {
  return STATUS_CARTORIO.find((s) => s.valor === valor)?.rotulo || valor || 'desconhecido';
}

// =============================================================================
// Modal Gerenciar Responsáveis
// =============================================================================

function ModalResponsaveis({ cartorio, onFechar, onSalvo }) {
  const [pessoas, setPessoas] = useState([]);
  const [selecionados, setSelecionados] = useState(cartorio.responsaveis.map((r) => r.id));
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState('');

  useEffect(() => {
    api.get('/pessoas')
      .then((r) => setPessoas((r.data || []).filter((p) => p.ativo)))
      .catch(() => {});
  }, []);

  async function salvar() {
    setSalvando(true);
    setErro('');
    try {
      await api.put(`/cartorios/${cartorio.id}`, { responsavel_ids: selecionados });
      onSalvo();
    } catch (err) {
      setErro(mensagemDeErro(err));
      setSalvando(false);
    }
  }

  return (
    <ModalFrame titulo="Gerenciar responsáveis" onFechar={onFechar}>
      <p className="mb-3 text-xs text-slate-500">
        Pessoas atribuídas como responsáveis pelo cartório. A primeira da lista é tratada como principal.
      </p>
      <MultiSelectPessoas
        pessoas={pessoas}
        selecionadosIds={selecionados}
        onChange={setSelecionados}
      />
      {erro && (
        <div className="mt-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{erro}</div>
      )}
      <div className="mt-4 flex justify-end gap-2 border-t border-slate-100 pt-3">
        <button type="button" onClick={onFechar}
          className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50">
          Cancelar
        </button>
        <button type="button" onClick={salvar} disabled={salvando}
          className="rounded-lg bg-nexus-700 px-4 py-2 text-sm font-medium text-white hover:bg-nexus-800 disabled:opacity-50">
          {salvando ? 'Salvando…' : 'Salvar'}
        </button>
      </div>
    </ModalFrame>
  );
}

// =============================================================================
// Modal Vincular a Quadro
// =============================================================================

function ModalVincularQuadro({ cartorio, onFechar, onSalvo }) {
  const [quadros, setQuadros] = useState([]);
  const [carregandoQuadros, setCarregandoQuadros] = useState(true);
  const [quadroId, setQuadroId] = useState('');
  const [colunas, setColunas] = useState([]);
  const [colunaId, setColunaId] = useState('');
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState('');

  // Quadros já vinculados não aparecem na lista
  const idsJaVinculados = useMemo(
    () => new Set(cartorio.vinculos.map((v) => v.quadro_id)),
    [cartorio.vinculos],
  );

  useEffect(() => {
    api.get('/quadros')
      .then((r) => setQuadros((r.data || []).filter((q) => !idsJaVinculados.has(q.id))))
      .catch((err) => setErro(mensagemDeErro(err, 'Não consegui listar quadros.')))
      .finally(() => setCarregandoQuadros(false));
  }, [idsJaVinculados]);

  // Quando muda quadro, carrega colunas
  useEffect(() => {
    if (!quadroId) { setColunas([]); setColunaId(''); return; }
    api.get(`/quadros/${quadroId}`)
      .then((r) => setColunas((r.data?.colunas || []).filter((c) => !c.arquivada_em)))
      .catch(() => setColunas([]));
  }, [quadroId]);

  async function salvar() {
    if (!quadroId) return;
    setSalvando(true);
    setErro('');
    try {
      await api.post(`/cartorios/${cartorio.id}/quadros`, {
        quadro_id: quadroId,
        coluna_id: colunaId || null,
      });
      onSalvo();
    } catch (err) {
      setErro(mensagemDeErro(err));
      setSalvando(false);
    }
  }

  return (
    <ModalFrame titulo="Vincular a um quadro" onFechar={onFechar}>
      {carregandoQuadros ? (
        <p className="text-sm text-slate-500">Carregando quadros…</p>
      ) : quadros.length === 0 ? (
        <p className="text-sm text-slate-500">
          {cartorio.vinculos.length > 0
            ? 'O cartório já está vinculado a todos os quadros disponíveis.'
            : 'Você não tem acesso a nenhum quadro.'}
        </p>
      ) : (
        <div className="space-y-3">
          <div>
            <label className="block text-sm font-medium text-slate-900 mb-1">
              Quadro<span className="text-red-600">*</span>
            </label>
            <select className={inputCls} value={quadroId} onChange={(e) => setQuadroId(e.target.value)} required>
              <option value="">— escolha um quadro —</option>
              {quadros.map((q) => (
                <option key={q.id} value={q.id}>
                  {q.nome}{q.equipe_nome ? ` (${q.equipe_nome})` : ''}
                </option>
              ))}
            </select>
          </div>

          {quadroId && (
            <div>
              <label className="block text-sm font-medium text-slate-900 mb-1">
                Fase inicial <span className="text-xs font-normal text-slate-500">(opcional)</span>
              </label>
              <select className={inputCls} value={colunaId} onChange={(e) => setColunaId(e.target.value)}>
                <option value="">— sem fase definida —</option>
                {colunas.map((c) => (
                  <option key={c.id} value={c.id}>{c.nome}</option>
                ))}
              </select>
              <p className="mt-1 text-[11px] text-slate-500">
                Você pode definir/mudar a fase depois sem precisar desvincular.
              </p>
            </div>
          )}
        </div>
      )}

      {erro && (
        <div className="mt-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{erro}</div>
      )}
      <div className="mt-4 flex justify-end gap-2 border-t border-slate-100 pt-3">
        <button type="button" onClick={onFechar}
          className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50">
          Cancelar
        </button>
        <button type="button" onClick={salvar} disabled={!quadroId || salvando}
          className="rounded-lg bg-nexus-700 px-4 py-2 text-sm font-medium text-white hover:bg-nexus-800 disabled:opacity-50">
          {salvando ? 'Salvando…' : 'Vincular'}
        </button>
      </div>
    </ModalFrame>
  );
}

// =============================================================================
// Modal Mudar Fase
// =============================================================================

function ModalMudarFase({ cartorio, vinculo, onFechar, onSalvo }) {
  const [colunas, setColunas] = useState([]);
  const [carregandoColunas, setCarregandoColunas] = useState(true);
  const [colunaId, setColunaId] = useState(vinculo.coluna_id || '');
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState('');

  useEffect(() => {
    api.get(`/quadros/${vinculo.quadro_id}`)
      .then((r) => setColunas((r.data?.colunas || []).filter((c) => !c.arquivada_em)))
      .catch((err) => setErro(mensagemDeErro(err)))
      .finally(() => setCarregandoColunas(false));
  }, [vinculo.quadro_id]);

  async function salvar() {
    setSalvando(true);
    setErro('');
    try {
      await api.post(`/cartorios/${cartorio.id}/quadros/${vinculo.quadro_id}/mudar-fase`, {
        coluna_id: colunaId || null,
      });
      onSalvo();
    } catch (err) {
      setErro(mensagemDeErro(err));
      setSalvando(false);
    }
  }

  return (
    <ModalFrame titulo={`Mudar fase no quadro "${vinculo.quadro_nome}"`} onFechar={onFechar}>
      <p className="mb-3 text-xs text-slate-500">
        Fase atual: <span className="font-medium text-slate-700">{vinculo.coluna_nome || 'não definida'}</span>
      </p>
      {carregandoColunas ? (
        <p className="text-sm text-slate-500">Carregando fases…</p>
      ) : (
        <div>
          <label className="block text-sm font-medium text-slate-900 mb-1">Nova fase</label>
          <select className={inputCls} value={colunaId} onChange={(e) => setColunaId(e.target.value)}>
            <option value="">— sem fase definida —</option>
            {colunas.map((c) => (
              <option key={c.id} value={c.id}>{c.nome}</option>
            ))}
          </select>
        </div>
      )}
      {erro && (
        <div className="mt-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{erro}</div>
      )}
      <div className="mt-4 flex justify-end gap-2 border-t border-slate-100 pt-3">
        <button type="button" onClick={onFechar}
          className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50">
          Cancelar
        </button>
        <button type="button" onClick={salvar} disabled={salvando}
          className="rounded-lg bg-nexus-700 px-4 py-2 text-sm font-medium text-white hover:bg-nexus-800 disabled:opacity-50">
          {salvando ? 'Salvando…' : 'Salvar mudança'}
        </button>
      </div>
    </ModalFrame>
  );
}

// =============================================================================
// Modal Nova Nota / Contato
// =============================================================================

function ModalNota({ cartorio, onFechar, onSalvo }) {
  const [tipo, setTipo] = useState('nota');
  const [texto, setTexto] = useState('');
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState('');

  async function salvar(e) {
    e.preventDefault();
    setSalvando(true);
    setErro('');
    try {
      await api.post(`/cartorios/${cartorio.id}/atualizacoes`, { tipo, texto: texto.trim() });
      onSalvo();
    } catch (err) {
      setErro(mensagemDeErro(err));
      setSalvando(false);
    }
  }

  return (
    <ModalFrame titulo="Nova nota ou contato" onFechar={onFechar}>
      <form onSubmit={salvar} className="space-y-3">
        <div>
          <label className="block text-sm font-medium text-slate-900 mb-1">Tipo</label>
          <div className="flex gap-2">
            <button type="button" onClick={() => setTipo('nota')}
              className={[
                'flex-1 inline-flex items-center justify-center gap-1.5 rounded-lg border px-3 py-2 text-sm font-medium',
                tipo === 'nota' ? 'border-nexus-500 bg-nexus-50 text-nexus-800' : 'border-slate-300 bg-white text-slate-600',
              ].join(' ')}
            >
              <MessageSquare size={13} /> Nota
            </button>
            <button type="button" onClick={() => setTipo('contato')}
              className={[
                'flex-1 inline-flex items-center justify-center gap-1.5 rounded-lg border px-3 py-2 text-sm font-medium',
                tipo === 'contato' ? 'border-nexus-500 bg-nexus-50 text-nexus-800' : 'border-slate-300 bg-white text-slate-600',
              ].join(' ')}
            >
              <PhoneCall size={13} /> Contato
            </button>
          </div>
          <p className="mt-1 text-[11px] text-slate-500">
            {tipo === 'nota'
              ? 'Observação geral sobre o cartório.'
              : 'Registro de ligação, visita ou reunião com o cartório.'}
          </p>
        </div>

        <div>
          <label className="block text-sm font-medium text-slate-900 mb-1">
            Descrição<span className="text-red-600">*</span>
          </label>
          <textarea className={inputCls} rows={5}
            value={texto} onChange={(e) => setTexto(e.target.value)}
            maxLength={5000} required autoFocus
            placeholder={tipo === 'nota'
              ? 'Ex: O cartório está fechando para reforma em janeiro...'
              : 'Ex: Ligação com Sr. João às 14h sobre a documentação pendente. Combinamos retorno na sexta.'} />
        </div>

        {erro && (
          <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{erro}</div>
        )}

        <div className="flex justify-end gap-2 border-t border-slate-100 pt-3">
          <button type="button" onClick={onFechar}
            className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50">
            Cancelar
          </button>
          <button type="submit" disabled={salvando || !texto.trim()}
            className="rounded-lg bg-nexus-700 px-4 py-2 text-sm font-medium text-white hover:bg-nexus-800 disabled:opacity-50">
            {salvando ? 'Salvando…' : 'Adicionar'}
          </button>
        </div>
      </form>
    </ModalFrame>
  );
}

// =============================================================================
// Frame de modal genérico
// =============================================================================

function ModalFrame({ titulo, onFechar, children }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4">
      <div className="w-full max-w-xl rounded-xl bg-white shadow-xl">
        <header className="flex items-center justify-between border-b border-slate-200 px-5 py-3">
          <h2 className="text-base font-semibold text-slate-900">{titulo}</h2>
          <button type="button" onClick={onFechar}
            className="rounded p-1 text-slate-400 hover:bg-slate-100">
            <X size={18} />
          </button>
        </header>
        <div className="p-5 max-h-[80vh] overflow-y-auto">{children}</div>
      </div>
    </div>
  );
}
