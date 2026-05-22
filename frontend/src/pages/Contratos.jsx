import { useEffect, useMemo, useRef, useState } from 'react';
import {
  Plus, Search, FileSignature, Download, Pencil, Trash2, Upload, X,
  AlertTriangle, Clock, CheckCircle2, Calendar, DollarSign, Building,
  User, Bell,
} from 'lucide-react';
import { api, mensagemDeErro } from '../api/client.js';
import { useAuth } from '../context/AuthContext.jsx';

/**
 * Contratos com terceiros — Sprint 21B (item 6.2 da spec).
 *
 * Lista de contratos com badge de vencimento calculado no backend.
 * Apenas admin gerencia; qualquer pessoa logada visualiza/baixa.
 */

const STATUS = [
  { valor: 'vigente',        rotulo: 'Vigente',          cor: 'bg-emerald-100 text-emerald-800 border-emerald-200' },
  { valor: 'em_negociacao',  rotulo: 'Em negociação',    cor: 'bg-blue-100 text-blue-800 border-blue-200' },
  { valor: 'encerrado',      rotulo: 'Encerrado',        cor: 'bg-slate-100 text-slate-700 border-slate-200' },
  { valor: 'cancelado',      rotulo: 'Cancelado',        cor: 'bg-red-100 text-red-800 border-red-200' },
];

const PERIODICIDADES = [
  { valor: 'mensal',  rotulo: 'Mensal' },
  { valor: 'anual',   rotulo: 'Anual' },
  { valor: 'unico',   rotulo: 'Pagamento único' },
  { valor: 'outro',   rotulo: 'Outra' },
];

function statusInfo(s) { return STATUS.find((x) => x.valor === s) || STATUS[0]; }

function formatarMoeda(valor, moeda = 'BRL') {
  if (valor === null || valor === undefined) return null;
  try {
    return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: moeda || 'BRL' }).format(valor);
  } catch {
    return `${moeda} ${Number(valor).toFixed(2)}`;
  }
}

function formatarData(iso) {
  if (!iso) return '';
  return new Date(iso).toLocaleDateString('pt-BR');
}

function formatarTamanho(bytes) {
  if (!bytes) return '';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

const inputCls = 'w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm shadow-sm outline-none focus:border-nexus-500 focus:ring-2 focus:ring-nexus-200';

export default function Contratos() {
  const { pessoa } = useAuth();
  const admin = !!pessoa?.administrador;

  const [contratos, setContratos] = useState([]);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState('');

  // Sprint 30 — gate de versão + debounce isolado pro campo busca.
  // Gate protege de race condition entre múltiplos carregar() em paralelo.
  const carregaIdRef = useRef(0);

  const [filtroBusca, setFiltroBusca] = useState('');
  // Debounced (350ms) — só o campo busca passa por aqui; selects disparam imediato.
  const [filtroBuscaDebounced, setFiltroBuscaDebounced] = useState('');
  const [filtroStatus, setFiltroStatus] = useState('');
  const [filtroAlertas, setFiltroAlertas] = useState(false); // só vencendo/vencidos

  const [modal, setModal] = useState(null);

  async function carregar() {
    const meuId = ++carregaIdRef.current;
    setCarregando(true);
    setErro('');
    try {
      const params = {};
      if (filtroBuscaDebounced.trim()) params.busca = filtroBuscaDebounced.trim();
      if (filtroStatus) params.status = filtroStatus;
      const r = await api.get('/contratos', { params });
      // Descarta se outro carregar() começou enquanto este estava em flight.
      if (meuId !== carregaIdRef.current) return;
      setContratos(r.data);
    } catch (err) {
      if (meuId === carregaIdRef.current) {
        setErro(mensagemDeErro(err, 'Não consegui carregar os contratos.'));
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
  }, [filtroBuscaDebounced, filtroStatus]);

  // Estatísticas pra os cards do topo
  const stats = useMemo(() => {
    return contratos.reduce((acc, c) => {
      if (c.status === 'vigente') acc.vigentes += 1;
      if (c.vencido) acc.vencidos += 1;
      if (c.vencendo && !c.vencido) acc.vencendo += 1;
      return acc;
    }, { vigentes: 0, vencendo: 0, vencidos: 0 });
  }, [contratos]);

  const visiveis = useMemo(() => {
    if (!filtroAlertas) return contratos;
    return contratos.filter((c) => c.vencendo || c.vencido);
  }, [contratos, filtroAlertas]);

  async function baixar(c) {
    try {
      const r = await api.get(`/contratos/${c.id}/arquivo`, { responseType: 'blob' });
      const url = window.URL.createObjectURL(new Blob([r.data]));
      const a = document.createElement('a');
      a.href = url;
      a.download = c.arquivo_nome || 'contrato';
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      window.URL.revokeObjectURL(url);
    } catch (err) {
      alert(mensagemDeErro(err, 'Não consegui baixar o arquivo.'));
    }
  }

  async function excluir(c) {
    if (!confirm(`Excluir permanentemente o contrato "${c.titulo}"?\nO arquivo também será apagado.`)) return;
    try {
      await api.delete(`/contratos/${c.id}`);
      carregar();
    } catch (err) {
      alert(mensagemDeErro(err));
    }
  }

  // Sprint 26 — dispara o cron manualmente. Idempotente: contratos já
  // alertados nos últimos 7 dias não re-disparam.
  async function dispararAlertas() {
    if (!confirm(
      'Disparar agora o aviso de contratos vencendo / vencidos?\n\n' +
      'Vai enviar e-mail + notificação aos administradores. ' +
      'Contratos alertados nos últimos 7 dias NÃO serão re-alertados.'
    )) return;
    try {
      const r = await api.post('/contratos/disparar-alertas');
      const { enviados, contratos: qtd } = r.data || {};
      if (qtd > 0) {
        alert(
          `✓ ${qtd} contrato${qtd === 1 ? '' : 's'} entrou${qtd === 1 ? '' : 'aram'} no aviso. ` +
          `${enviados} administrador${enviados === 1 ? '' : 'es'} foi/foram notificado${enviados === 1 ? '' : 's'}.`
        );
      } else {
        alert('Nenhum contrato precisa de aviso agora. Possibilidades:\n' +
          '• Sem contrato com data fim na janela de alerta;\n' +
          '• Todos já foram alertados nos últimos 7 dias.');
      }
    } catch (err) {
      alert(mensagemDeErro(err, 'Não consegui disparar os alertas.'));
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 className="text-lg font-semibold text-slate-900">Contratos</h2>
          <p className="text-xs text-slate-500">
            Contratos com clientes, fornecedores e parceiros — com aviso de vencimento.
          </p>
        </div>
        {admin && (
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={dispararAlertas}
              className="inline-flex items-center gap-1.5 rounded-lg border border-amber-300 bg-amber-50 px-3 py-1.5 text-sm font-medium text-amber-800 hover:bg-amber-100"
              title="Sprint 26 — dispara agora o e-mail de aviso de contratos vencendo. Normalmente roda automaticamente às 8h."
            >
              <Bell size={13} /> Disparar alertas
            </button>
            <button
              type="button"
              onClick={() => setModal({ modo: 'criar' })}
              className="inline-flex items-center gap-1.5 rounded-lg bg-nexus-700 px-3 py-1.5 text-sm font-medium text-white hover:bg-nexus-800"
            >
              <Plus size={14} /> Novo contrato
            </button>
          </div>
        )}
      </div>

      {/* Cards de estatística */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <CardStat
          rotulo="Vigentes"
          valor={stats.vigentes}
          icone={<CheckCircle2 size={16} className="text-emerald-600" />}
          cor="border-emerald-200 bg-emerald-50/40"
        />
        <CardStat
          rotulo="Vencendo em breve"
          valor={stats.vencendo}
          icone={<Clock size={16} className="text-amber-600" />}
          cor="border-amber-200 bg-amber-50/40"
          destacar={stats.vencendo > 0}
          onClick={() => stats.vencendo > 0 && setFiltroAlertas(true)}
        />
        <CardStat
          rotulo="Vencidos"
          valor={stats.vencidos}
          icone={<AlertTriangle size={16} className="text-red-600" />}
          cor="border-red-200 bg-red-50/40"
          destacar={stats.vencidos > 0}
          onClick={() => stats.vencidos > 0 && setFiltroAlertas(true)}
        />
      </div>

      <div className="flex flex-wrap items-center gap-2 rounded-lg border border-slate-200 bg-white p-3">
        <div className="relative flex-1 min-w-[200px]">
          <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            type="text"
            placeholder="Buscar por título ou contraparte…"
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
        <label className="inline-flex items-center gap-1.5 text-xs text-slate-700 cursor-pointer">
          <input
            type="checkbox"
            checked={filtroAlertas}
            onChange={(e) => setFiltroAlertas(e.target.checked)}
          />
          Só com alerta
        </label>
        {(filtroBusca || filtroStatus || filtroAlertas) && (
          <button
            type="button"
            onClick={() => { setFiltroBusca(''); setFiltroStatus(''); setFiltroAlertas(false); }}
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
      ) : visiveis.length === 0 ? (
        <div className="rounded-xl border border-dashed border-slate-300 bg-white py-12 text-center">
          <FileSignature size={32} className="mx-auto text-slate-300" />
          <p className="mt-2 text-sm font-medium text-slate-700">
            {contratos.length === 0
              ? 'Nenhum contrato cadastrado ainda.'
              : 'Nenhum contrato corresponde aos filtros.'}
          </p>
          {admin && contratos.length === 0 && (
            <button
              type="button"
              onClick={() => setModal({ modo: 'criar' })}
              className="mt-3 inline-flex items-center gap-1 rounded-lg bg-nexus-700 px-3 py-1.5 text-sm font-medium text-white hover:bg-nexus-800"
            >
              <Plus size={13} /> Cadastrar primeiro contrato
            </button>
          )}
        </div>
      ) : (
        <ul className="space-y-2">
          {visiveis.map((c) => (
            <CardContrato
              key={c.id}
              c={c}
              admin={admin}
              onBaixar={() => baixar(c)}
              onEditar={() => setModal({ modo: 'editar', contrato: c })}
              onExcluir={() => excluir(c)}
            />
          ))}
        </ul>
      )}

      {modal && (
        <ModalContrato
          modo={modal.modo}
          contrato={modal.contrato}
          onFechar={() => setModal(null)}
          onSalvo={() => { setModal(null); carregar(); }}
        />
      )}
    </div>
  );
}

// =============================================================================
// Card de estatística (topo)
// =============================================================================

function CardStat({ rotulo, valor, icone, cor, destacar, onClick }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={!onClick || !destacar}
      className={[
        'rounded-lg border p-3 text-left transition-colors',
        cor,
        destacar && onClick ? 'cursor-pointer hover:shadow-sm' : 'cursor-default',
      ].join(' ')}
    >
      <div className="flex items-center gap-2">
        {icone}
        <span className="text-xs font-medium text-slate-700">{rotulo}</span>
      </div>
      <div className="mt-1 text-2xl font-semibold tabular-nums text-slate-900">{valor}</div>
    </button>
  );
}

// =============================================================================
// Card de um contrato
// =============================================================================

function CardContrato({ c, admin, onBaixar, onEditar, onExcluir }) {
  const status = statusInfo(c.status);
  return (
    <li className="rounded-xl border border-slate-200 bg-white shadow-sm overflow-hidden">
      <div className="flex flex-wrap items-start gap-3 p-4">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <h3 className="text-sm font-semibold text-slate-900 break-words">{c.titulo}</h3>
            <span className={`inline-flex items-center rounded border px-1.5 py-0.5 text-[10px] font-medium ${status.cor}`}>
              {status.rotulo}
            </span>
            <BadgeVencimento c={c} />
          </div>

          <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-slate-600">
            <span className="inline-flex items-center gap-1">
              {c.contraparte_tipo === 'pj' ? <Building size={11} /> : <User size={11} />}
              {c.contraparte_nome}
              {c.contraparte_documento && (
                <span className="text-slate-400">· {c.contraparte_documento}</span>
              )}
            </span>
            {c.valor !== null && (
              <span className="inline-flex items-center gap-1">
                <DollarSign size={11} />
                {formatarMoeda(c.valor, c.moeda)}
                {c.periodicidade && c.periodicidade !== 'unico' && (
                  <span className="text-slate-400">
                    /{c.periodicidade === 'mensal' ? 'mês' : c.periodicidade === 'anual' ? 'ano' : c.periodicidade}
                  </span>
                )}
              </span>
            )}
            <span className="inline-flex items-center gap-1">
              <Calendar size={11} />
              {formatarData(c.data_inicio)}
              {c.data_fim ? ` → ${formatarData(c.data_fim)}` : ' → indeterminado'}
            </span>
          </div>

          {c.descricao && (
            <p className="mt-2 text-xs text-slate-600 line-clamp-2 whitespace-pre-wrap">{c.descricao}</p>
          )}

          {c.tem_arquivo && (
            <p className="mt-1 text-[10px] text-slate-400">
              Arquivo: {c.arquivo_nome} · {formatarTamanho(c.arquivo_tamanho)}
            </p>
          )}
        </div>

        <div className="flex items-center gap-1">
          {c.tem_arquivo && (
            <button
              type="button"
              onClick={onBaixar}
              className="inline-flex items-center gap-1 rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50"
              title="Baixar arquivo"
            >
              <Download size={11} /> Baixar
            </button>
          )}
          {admin && (
            <>
              <button
                type="button"
                onClick={onEditar}
                className="rounded p-1.5 text-slate-500 hover:bg-slate-100 hover:text-slate-900"
                title="Editar"
              >
                <Pencil size={12} />
              </button>
              <button
                type="button"
                onClick={onExcluir}
                className="rounded p-1.5 text-slate-400 hover:bg-red-50 hover:text-red-700"
                title="Excluir"
              >
                <Trash2 size={12} />
              </button>
            </>
          )}
        </div>
      </div>
    </li>
  );
}

function BadgeVencimento({ c }) {
  if (c.vencido) {
    return (
      <span className="inline-flex items-center gap-1 rounded border border-red-300 bg-red-100 px-1.5 py-0.5 text-[10px] font-semibold text-red-800">
        <AlertTriangle size={10} />
        Vencido há {Math.abs(c.dias_pra_vencer)} dia{Math.abs(c.dias_pra_vencer) === 1 ? '' : 's'}
      </span>
    );
  }
  if (c.vencendo) {
    return (
      <span className="inline-flex items-center gap-1 rounded border border-amber-300 bg-amber-100 px-1.5 py-0.5 text-[10px] font-semibold text-amber-800">
        <Clock size={10} />
        Vence em {c.dias_pra_vencer} dia{c.dias_pra_vencer === 1 ? '' : 's'}
      </span>
    );
  }
  return null;
}

// =============================================================================
// Modal Novo / Editar
// =============================================================================

function ModalContrato({ modo, contrato, onFechar, onSalvo }) {
  const editando = modo === 'editar';

  const [titulo, setTitulo] = useState(contrato?.titulo || '');
  const [descricao, setDescricao] = useState(contrato?.descricao || '');
  const [contraparteNome, setContraparteNome] = useState(contrato?.contraparte_nome || '');
  const [contraparteDoc, setContraparteDoc] = useState(contrato?.contraparte_documento || '');
  const [contraparteTipo, setContraparteTipo] = useState(contrato?.contraparte_tipo || 'pj');
  const [valor, setValor] = useState(contrato?.valor !== null && contrato?.valor !== undefined ? String(contrato.valor) : '');
  const [moeda, setMoeda] = useState(contrato?.moeda || 'BRL');
  const [periodicidade, setPeriodicidade] = useState(contrato?.periodicidade || '');
  const [dataInicio, setDataInicio] = useState(contrato?.data_inicio ? String(contrato.data_inicio).slice(0, 10) : '');
  const [dataFim, setDataFim] = useState(contrato?.data_fim ? String(contrato.data_fim).slice(0, 10) : '');
  const [status, setStatus] = useState(contrato?.status || 'vigente');
  const [alertaAntes, setAlertaAntes] = useState(contrato?.alerta_antes_dias ?? 30);
  const [arquivo, setArquivo] = useState(null);
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState('');

  async function submeter(e) {
    e.preventDefault();
    if (dataFim && dataFim < dataInicio) {
      setErro('Data fim deve ser posterior à data início.');
      return;
    }
    setErro('');
    setSalvando(true);
    try {
      const body = {
        titulo: titulo.trim(),
        descricao: descricao.trim() || null,
        contraparte_nome: contraparteNome.trim(),
        contraparte_documento: contraparteDoc.trim() || null,
        contraparte_tipo: contraparteTipo || null,
        valor: valor.trim() ? Number(valor.replace(',', '.')) : null,
        moeda: moeda || 'BRL',
        periodicidade: periodicidade || null,
        data_inicio: dataInicio,
        data_fim: dataFim || null,
        status,
        alerta_antes_dias: Number(alertaAntes) || 30,
      };

      if (editando) {
        await api.put(`/contratos/${contrato.id}`, body);
        if (arquivo) {
          const fd = new FormData();
          fd.append('arquivo', arquivo);
          await api.post(`/contratos/${contrato.id}/arquivo`, fd, {
            headers: { 'Content-Type': 'multipart/form-data' },
          });
        }
      } else {
        // Criação multipart (com ou sem arquivo)
        const fd = new FormData();
        Object.entries(body).forEach(([k, v]) => {
          if (v !== null && v !== undefined && v !== '') fd.append(k, v);
        });
        if (arquivo) fd.append('arquivo', arquivo);
        await api.post('/contratos', fd, {
          headers: { 'Content-Type': 'multipart/form-data' },
        });
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
      <div className="w-full max-w-2xl rounded-xl bg-white shadow-xl">
        <header className="flex items-center justify-between border-b border-slate-200 px-5 py-3">
          <h2 className="text-base font-semibold text-slate-900">
            {editando ? `Editar: ${contrato.titulo}` : 'Novo contrato'}
          </h2>
          <button type="button" onClick={onFechar}
            className="rounded p-1 text-slate-400 hover:bg-slate-100">
            <X size={18} />
          </button>
        </header>

        <form onSubmit={submeter} className="p-5 space-y-3 max-h-[80vh] overflow-y-auto">
          <div>
            <label className="block text-sm font-medium text-slate-900 mb-1">
              Título<span className="text-red-600">*</span>
            </label>
            <input className={inputCls} value={titulo} onChange={(e) => setTitulo(e.target.value)}
              required autoFocus maxLength={255}
              placeholder="Ex: Prestação de serviços de TI - 2024" />
          </div>

          <fieldset className="rounded-lg border border-slate-200 bg-slate-50/60 p-3 space-y-2">
            <legend className="px-2 text-xs font-semibold text-slate-700">Contraparte</legend>
            <div className="grid grid-cols-3 gap-2">
              <div className="col-span-2">
                <label className="block text-xs font-medium text-slate-700 mb-1">Nome<span className="text-red-600">*</span></label>
                <input className={inputCls} value={contraparteNome} onChange={(e) => setContraparteNome(e.target.value)}
                  required maxLength={255} placeholder="Nome da empresa ou pessoa" />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">Tipo</label>
                <select className={inputCls} value={contraparteTipo} onChange={(e) => setContraparteTipo(e.target.value)}>
                  <option value="pj">Pessoa Jurídica</option>
                  <option value="pf">Pessoa Física</option>
                </select>
              </div>
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">CPF/CNPJ</label>
              <input className={inputCls} value={contraparteDoc} onChange={(e) => setContraparteDoc(e.target.value)}
                maxLength={40} placeholder="00.000.000/0001-00 ou 000.000.000-00" />
            </div>
          </fieldset>

          <fieldset className="rounded-lg border border-slate-200 bg-slate-50/60 p-3 space-y-2">
            <legend className="px-2 text-xs font-semibold text-slate-700">Valor e periodicidade</legend>
            <div className="grid grid-cols-3 gap-2">
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">Valor</label>
                <input className={inputCls} value={valor} onChange={(e) => setValor(e.target.value)}
                  type="text" inputMode="decimal" placeholder="0,00" />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">Moeda</label>
                <select className={inputCls} value={moeda} onChange={(e) => setMoeda(e.target.value)}>
                  <option value="BRL">BRL (R$)</option>
                  <option value="USD">USD ($)</option>
                  <option value="EUR">EUR (€)</option>
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">Periodicidade</label>
                <select className={inputCls} value={periodicidade} onChange={(e) => setPeriodicidade(e.target.value)}>
                  <option value="">—</option>
                  {PERIODICIDADES.map((p) => (<option key={p.valor} value={p.valor}>{p.rotulo}</option>))}
                </select>
              </div>
            </div>
          </fieldset>

          <fieldset className="rounded-lg border border-slate-200 bg-slate-50/60 p-3 space-y-2">
            <legend className="px-2 text-xs font-semibold text-slate-700">Vigência</legend>
            <div className="grid grid-cols-3 gap-2">
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">
                  Início<span className="text-red-600">*</span>
                </label>
                <input className={inputCls} type="date"
                  value={dataInicio} onChange={(e) => setDataInicio(e.target.value)} required />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">
                  Fim <span className="text-[10px] font-normal text-slate-400">(opcional)</span>
                </label>
                <input className={inputCls} type="date"
                  value={dataFim} onChange={(e) => setDataFim(e.target.value)} />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">Status</label>
                <select className={inputCls} value={status} onChange={(e) => setStatus(e.target.value)}>
                  {STATUS.map((s) => (<option key={s.valor} value={s.valor}>{s.rotulo}</option>))}
                </select>
              </div>
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">
                Avisar quantos dias antes do vencimento?
              </label>
              <input className={inputCls} type="number" min={0} max={365}
                value={alertaAntes} onChange={(e) => setAlertaAntes(e.target.value)} />
              <p className="mt-1 text-[10px] text-slate-500">
                Contratos com data fim a menos de {alertaAntes || 30} dia(s) aparecem como "Vencendo em breve".
              </p>
            </div>
          </fieldset>

          <div>
            <label className="block text-sm font-medium text-slate-900 mb-1">Descrição</label>
            <textarea className={inputCls} rows={3}
              value={descricao} onChange={(e) => setDescricao(e.target.value)}
              maxLength={10000}
              placeholder="Observações, cláusulas importantes, notas internas…" />
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-900 mb-1">
              Arquivo {editando && contrato?.tem_arquivo && (
                <span className="text-xs font-normal text-slate-500">
                  (atual: {contrato.arquivo_nome} · {formatarTamanho(contrato.arquivo_tamanho)})
                </span>
              )}
            </label>
            <label className="flex items-center gap-2 rounded-lg border border-dashed border-slate-300 bg-slate-50 px-3 py-2 text-sm cursor-pointer hover:border-nexus-300 hover:bg-nexus-50/30">
              <Upload size={14} className="text-slate-400" />
              <span className="flex-1 text-slate-600 truncate">
                {arquivo ? arquivo.name : (editando ? 'Trocar arquivo (deixe vazio pra manter)' : 'Escolher arquivo')}
              </span>
              <input
                type="file"
                className="hidden"
                accept=".pdf,.png,.jpg,.jpeg,.webp,.doc,.docx"
                onChange={(e) => setArquivo(e.target.files?.[0] || null)}
              />
            </label>
            <p className="mt-1 text-[11px] text-slate-500">
              Aceitos: PDF, imagens (PNG/JPG/WebP), Word (.doc, .docx).
            </p>
          </div>

          {erro && (
            <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{erro}</div>
          )}

          <div className="flex justify-end gap-2 border-t border-slate-100 pt-3">
            <button type="button" onClick={onFechar}
              className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50">
              Cancelar
            </button>
            <button type="submit" disabled={salvando}
              className="rounded-lg bg-nexus-700 px-4 py-2 text-sm font-medium text-white hover:bg-nexus-800 disabled:opacity-50">
              {salvando ? 'Salvando…' : (editando ? 'Salvar' : 'Criar contrato')}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
