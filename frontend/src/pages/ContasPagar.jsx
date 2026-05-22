import { useEffect, useMemo, useRef, useState } from 'react';
import {
  Plus, Edit2, CheckCircle2, Ban, X, Search, AlertTriangle,
  Calendar, Clock, FileText, ExternalLink, CircleDollarSign, Receipt, Filter,
  Repeat, Layers, Paperclip,
} from 'lucide-react';
import { api, mensagemDeErro } from '../api/client.js';
import { useAuth } from '../context/AuthContext.jsx';
import { BadgeCategoria } from './CategoriasDespesa.jsx';
import CampoComprovante from '../components/CampoComprovante.jsx';
import MultiplosAnexos from '../components/MultiplosAnexos.jsx';

/**
 * Contas a pagar — Sprint 3.
 *
 * Página central das saídas: cadastrar, listar, filtrar por status,
 * marcar como paga e cancelar. Mostra um resumo de barra em cima com
 * pendentes, atrasadas e pago nos últimos 30 dias.
 */

const FORMAS_PAGAMENTO = [
  { valor: 'pix',               rotulo: 'PIX' },
  { valor: 'boleto',            rotulo: 'Boleto' },
  { valor: 'ted',               rotulo: 'TED' },
  { valor: 'cartao',            rotulo: 'Cartão' },
  { valor: 'dinheiro',          rotulo: 'Dinheiro' },
  { valor: 'debito_automatico', rotulo: 'Débito automático' },
  { valor: 'outro',             rotulo: 'Outro' },
];

const ROTULO_RECORRENCIA = {
  mensal:     'Mensal',
  trimestral: 'Trimestral',
  semestral:  'Semestral',
  anual:      'Anual',
};

function formatarBRL(n) {
  const v = Number(n ?? 0);
  return v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

function formatarData(d) {
  if (!d) return '—';
  try { return new Date(d + 'T12:00:00').toLocaleDateString('pt-BR'); } catch { return '—'; }
}

function hoje() {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
}

function diasAteVencer(dataISO) {
  if (!dataISO) return null;
  const venc = new Date(dataISO + 'T12:00:00');
  venc.setHours(0, 0, 0, 0);
  const msPorDia = 86400000;
  return Math.round((venc - hoje()) / msPorDia);
}

function estaAtrasada(conta) {
  if (conta.status !== 'pendente') return false;
  const dias = diasAteVencer(conta.data_vencimento);
  return dias !== null && dias < 0;
}

export default function ContasPagar() {
  const { pessoa } = useAuth();
  const souAdmin = !!pessoa?.administrador;

  const [contas, setContas] = useState([]);
  const [categorias, setCategorias] = useState([]);
  const [contasBancarias, setContasBancarias] = useState([]);
  const [resumo, setResumo] = useState(null);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState('');

  // Sprint 28 — gate de versão pra resolver race condition entre múltiplos
  // carregarContas() em paralelo (ex: salvar conta + recarregar enquanto
  // mudança de filtro dispara outro carregar). O mais recente sempre vence.
  const carregaIdRef = useRef(0);

  const [statusFiltro, setStatusFiltro] = useState('pendentes');
  const [categoriaFiltro, setCategoriaFiltro] = useState('');
  const [busca, setBusca] = useState('');
  const [buscaAtiva, setBuscaAtiva] = useState('');

  const [modal, setModal] = useState(null);

  async function carregarContas() {
    const meuId = ++carregaIdRef.current;
    setCarregando(true);
    setErro('');
    try {
      const [resC, resR] = await Promise.all([
        api.get('/contas-pagar', {
          params: {
            status: statusFiltro,
            categoria_id: categoriaFiltro || undefined,
            q: buscaAtiva || undefined,
          },
        }),
        api.get('/contas-pagar/resumo'),
      ]);
      // Descarta se outro carregarContas() começou enquanto este esperava.
      if (meuId !== carregaIdRef.current) return;
      setContas(resC.data);
      setResumo(resR.data);
    } catch (err) {
      if (meuId === carregaIdRef.current) {
        setErro(mensagemDeErro(err, 'Não foi possível carregar as contas.'));
      }
    } finally {
      if (meuId === carregaIdRef.current) {
        setCarregando(false);
      }
    }
  }

  async function carregarAuxiliares() {
    try {
      const [resCat, resCb] = await Promise.all([
        api.get('/categorias-despesa'),
        api.get('/contas-bancarias'),
      ]);
      setCategorias(resCat.data);
      setContasBancarias(resCb.data);
    } catch {
      // sem categorias/contas ainda não é bloqueante
    }
  }

  useEffect(() => { carregarAuxiliares(); }, []);
  useEffect(() => { carregarContas(); /* eslint-disable-next-line */ }, [statusFiltro, categoriaFiltro, buscaAtiva]);

  const totalMostrado = useMemo(
    () => contas.reduce((acc, c) => acc + Number(c.status === 'paga' ? (c.valor_pago ?? 0) : c.valor), 0),
    [contas],
  );

  return (
    <div className="max-w-6xl">
      <header className="mb-6 flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold text-slate-900">Contas a pagar</h1>
          <p className="mt-1 text-slate-600">
            Tudo que a empresa precisa pagar, com vencimento e status.
            Atrasadas aparecem em vermelho no topo.
          </p>
        </div>

        {souAdmin && (
          <button
            type="button"
            onClick={() => setModal({ tipo: 'nova' })}
            className="inline-flex items-center gap-2 rounded-lg bg-nexus-700 px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-nexus-800"
          >
            <Plus size={16} />
            Nova conta
          </button>
        )}
      </header>

      {resumo && (
        <div className="mb-6 grid gap-3 sm:grid-cols-4">
          <CartaoResumo
            titulo="Pendentes"
            valor={resumo.pendentes.valor}
            qtd={resumo.pendentes.qtd}
            icone={Receipt}
            cor="slate"
          />
          <CartaoResumo
            titulo="Atrasadas"
            valor={resumo.atrasadas.valor}
            qtd={resumo.atrasadas.qtd}
            icone={AlertTriangle}
            cor={resumo.atrasadas.qtd > 0 ? 'red' : 'slate'}
            destaque={resumo.atrasadas.qtd > 0}
          />
          <CartaoResumo
            titulo="A sair em 30 dias"
            valor={resumo.saidas_previstas.em_30}
            subtitulo="Pendentes + atrasadas não incluídas"
            icone={CircleDollarSign}
            cor="amber"
          />
          <CartaoResumo
            titulo="Pago nos últimos 30 dias"
            valor={resumo.pago_ultimos_30_dias}
            icone={CheckCircle2}
            cor="emerald"
          />
        </div>
      )}

      {/* Filtros */}
      <div className="mb-4 rounded-xl border border-slate-200 bg-white p-3">
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-1 rounded-lg border border-slate-200 bg-slate-50 p-1">
            {[
              { v: 'pendentes',  r: 'Pendentes' },
              { v: 'atrasadas',  r: 'Atrasadas' },
              { v: 'pagas',      r: 'Pagas' },
              { v: 'canceladas', r: 'Canceladas' },
              { v: 'todas',      r: 'Todas' },
            ].map((o) => (
              <button
                key={o.v}
                type="button"
                onClick={() => setStatusFiltro(o.v)}
                className={[
                  'rounded-md px-3 py-1 text-xs font-medium transition-colors',
                  statusFiltro === o.v
                    ? 'bg-white text-nexus-800 shadow-sm'
                    : 'text-slate-600 hover:bg-slate-100',
                ].join(' ')}
              >
                {o.r}
              </button>
            ))}
          </div>

          <div className="flex items-center gap-1.5 text-xs text-slate-500">
            <Filter size={13} />
          </div>

          <select
            value={categoriaFiltro}
            onChange={(e) => setCategoriaFiltro(e.target.value)}
            className="rounded-lg border border-slate-300 bg-white px-2 py-1 text-sm shadow-sm outline-none focus:border-nexus-500 focus:ring-2 focus:ring-nexus-200"
          >
            <option value="">Todas as categorias</option>
            {categorias.filter((c) => c.ativo).map((c) => (
              <option key={c.id} value={c.id}>{c.nome}</option>
            ))}
          </select>

          <form
            onSubmit={(e) => { e.preventDefault(); setBuscaAtiva(busca.trim()); }}
            className="relative ml-auto"
          >
            <Search size={14} className="pointer-events-none absolute left-2 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              type="search"
              placeholder="Buscar descrição ou fornecedor..."
              value={busca}
              onChange={(e) => setBusca(e.target.value)}
              onBlur={() => setBuscaAtiva(busca.trim())}
              className="w-64 rounded-lg border border-slate-300 bg-white py-1.5 pl-7 pr-3 text-sm shadow-sm outline-none focus:border-nexus-500 focus:ring-2 focus:ring-nexus-200"
            />
          </form>
        </div>
      </div>

      {erro && (
        <div className="mb-4 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
          {erro}
        </div>
      )}

      <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
            <tr>
              <th className="px-4 py-3">Descrição / Fornecedor</th>
              <th className="px-4 py-3">Categoria</th>
              <th className="px-4 py-3">Vencimento</th>
              <th className="px-4 py-3 text-right">Valor</th>
              <th className="px-4 py-3">Status</th>
              <th className="px-4 py-3"></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {carregando && (
              <tr><td colSpan={6} className="px-4 py-8 text-center text-slate-500">Carregando...</td></tr>
            )}
            {!carregando && contas.length === 0 && (
              <tr>
                <td colSpan={6} className="px-4 py-10 text-center text-slate-500">
                  Nenhuma conta {statusFiltro !== 'todas' ? statusFiltro : ''} encontrada.
                </td>
              </tr>
            )}
            {!carregando && contas.map((c) => {
              const atrasada = estaAtrasada(c);
              const dias = diasAteVencer(c.data_vencimento);
              return (
                <tr key={c.id} className={c.status === 'cancelada' ? 'bg-slate-50/60 text-slate-500' : ''}>
                  <td className="px-4 py-3">
                    <div className="flex items-start gap-2">
                      {c.eh_recorrente && (
                        <span
                          title={`Conta recorrente · ocorrência ${c.recorrencia_indice}${c.recorrencia_qtd ? ` de ${c.recorrencia_qtd}` : ''}`}
                          className="mt-0.5 inline-flex shrink-0 items-center justify-center rounded bg-nexus-100 p-1 text-nexus-700"
                        >
                          <Repeat size={10} />
                        </span>
                      )}
                      <div className="min-w-0">
                        <div className="font-medium text-slate-900">{c.descricao}</div>
                        {c.fornecedor_nome && (
                          <div className="text-xs text-slate-500">{c.fornecedor_nome}</div>
                        )}
                        {c.eh_recorrente && (
                          <div className="text-[10px] text-nexus-700 mt-0.5">
                            {ROTULO_RECORRENCIA[c.recorrencia_tipo]}
                            {c.recorrencia_qtd != null && ` · ${c.recorrencia_indice}/${c.recorrencia_qtd}`}
                            {c.recorrencia_qtd == null && c.recorrencia_ate && ` · até ${formatarData(c.recorrencia_ate)}`}
                            {c.recorrencia_qtd == null && !c.recorrencia_ate && ` · sem término`}
                          </div>
                        )}
                      </div>
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    {c.categoria_nome
                      ? <BadgeCategoria nome={c.categoria_nome} cor={c.categoria_cor || 'slate'} pequeno />
                      : <span className="text-xs text-slate-400">—</span>
                    }
                  </td>
                  <td className="px-4 py-3 text-xs text-slate-600 whitespace-nowrap">
                    <div className="flex items-center gap-1">
                      <Calendar size={11} className="text-slate-400" />
                      {formatarData(c.data_vencimento)}
                    </div>
                    {c.status === 'pendente' && dias !== null && (
                      <div className={[
                        'text-[10px] mt-0.5',
                        atrasada ? 'text-red-600 font-semibold'
                          : dias <= 7 ? 'text-amber-600' : 'text-slate-400',
                      ].join(' ')}>
                        {atrasada
                          ? `${Math.abs(dias)} dia${Math.abs(dias) === 1 ? '' : 's'} atrás`
                          : dias === 0 ? 'hoje'
                          : `em ${dias} dia${dias === 1 ? '' : 's'}`}
                      </div>
                    )}
                    {c.status === 'paga' && c.data_pagamento && (
                      <div className="text-[10px] mt-0.5 text-emerald-700">
                        pago em {formatarData(c.data_pagamento)}
                      </div>
                    )}
                  </td>
                  <td className="px-4 py-3 text-right tabular-nums font-medium text-slate-900">
                    {formatarBRL(c.status === 'paga' ? (c.valor_pago ?? c.valor) : c.valor)}
                    {c.status === 'paga' && c.valor_pago != null && Number(c.valor_pago) !== Number(c.valor) && (
                      <div className="text-[10px] text-slate-400 line-through">{formatarBRL(c.valor)}</div>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <BadgeStatus conta={c} atrasada={atrasada} />
                  </td>
                  <td className="px-4 py-3 text-right">
                    <Acoes
                      conta={c}
                      souAdmin={souAdmin}
                      onEditar={() => setModal({ tipo: 'editar', conta: c })}
                      onAnexos={() => setModal({ tipo: 'anexos', conta: c })}
                      onPagar={() => setModal({ tipo: 'pagar', conta: c })}
                      onCancelar={() => setModal({ tipo: 'cancelar', conta: c })}
                      onCancelarSerie={() => setModal({ tipo: 'cancelar-serie', conta: c })}
                    />
                  </td>
                </tr>
              );
            })}
          </tbody>
          {!carregando && contas.length > 0 && (
            <tfoot className="bg-slate-50">
              <tr>
                <td colSpan={3} className="px-4 py-2 text-xs font-medium text-slate-600">
                  {contas.length} conta{contas.length === 1 ? '' : 's'}
                </td>
                <td className="px-4 py-2 text-right tabular-nums font-semibold text-slate-900">
                  {formatarBRL(totalMostrado)}
                </td>
                <td colSpan={2} />
              </tr>
            </tfoot>
          )}
        </table>
      </div>

      {modal?.tipo === 'nova' && (
        <ModalConta
          categorias={categorias}
          aoFechar={() => setModal(null)}
          aoSalvar={async (dados) => {
            await api.post('/contas-pagar', dados);
            setModal(null);
            carregarContas();
          }}
        />
      )}

      {modal?.tipo === 'editar' && (
        <ModalConta
          conta={modal.conta}
          categorias={categorias}
          aoFechar={() => setModal(null)}
          aoSalvar={async (dados) => {
            await api.put(`/contas-pagar/${modal.conta.id}`, dados);
            setModal(null);
            carregarContas();
          }}
        />
      )}

      {modal?.tipo === 'pagar' && (
        <ModalPagar
          conta={modal.conta}
          contasBancarias={contasBancarias}
          aoFechar={() => setModal(null)}
          aoConfirmar={async (dados) => {
            await api.post(`/contas-pagar/${modal.conta.id}/pagar`, dados);
            setModal(null);
            carregarContas();
          }}
        />
      )}

      {modal?.tipo === 'cancelar' && (
        <ModalCancelar
          conta={modal.conta}
          aoFechar={() => setModal(null)}
          aoConfirmar={async (motivo) => {
            await api.post(`/contas-pagar/${modal.conta.id}/cancelar`, {
              motivo_cancelamento: motivo,
            });
            setModal(null);
            carregarContas();
          }}
        />
      )}

      {modal?.tipo === 'cancelar-serie' && (
        <ModalCancelarSerie
          conta={modal.conta}
          aoFechar={() => setModal(null)}
          aoConfirmar={async (motivo) => {
            const r = await api.post(
              `/contas-pagar/grupo/${modal.conta.grupo_recorrencia_id}/cancelar-serie`,
              { motivo_cancelamento: motivo },
            );
            setModal(null);
            carregarContas();
            return r.data;
          }}
        />
      )}

      {modal?.tipo === 'anexos' && (
        <ModalAnexos
          conta={modal.conta}
          souAdmin={souAdmin}
          aoFechar={() => {
            setModal(null);
            // recarrega só a lista pra atualizar contador de anexos
            carregarContas();
          }}
        />
      )}
    </div>
  );
}

function Acoes({ conta, souAdmin, onEditar, onAnexos, onPagar, onCancelar, onCancelarSerie }) {
  if (!souAdmin) {
    return (
      <div className="flex justify-end gap-1">
        <button
          type="button"
          onClick={onAnexos}
          className="rounded-md p-1.5 text-slate-500 hover:bg-slate-100 hover:text-slate-700 relative"
          title={`Anexos (${conta.qtd_anexos || 0})`}
        >
          <Paperclip size={13} />
          {conta.qtd_anexos > 0 && (
            <span className="absolute -top-1 -right-1 inline-flex items-center justify-center rounded-full bg-nexus-600 px-1 text-[9px] font-bold leading-3 text-white min-w-[14px] h-[14px]">
              {conta.qtd_anexos}
            </span>
          )}
        </button>
        {conta.comprovante_url && (
          <a
            href={conta.comprovante_url}
            target="_blank" rel="noopener noreferrer"
            className="inline-flex rounded-md p-1.5 text-slate-500 hover:bg-slate-100 hover:text-slate-700"
            title="Link externo"
          >
            <ExternalLink size={13} />
          </a>
        )}
      </div>
    );
  }

  // Sprint 17.1 — edição e anexos passam a estar disponíveis em QUALQUER status
  // (não só pendente). Útil pra corrigir erro depois de marcar como paga.
  return (
    <div className="flex justify-end gap-1">
      <button
        type="button"
        onClick={onAnexos}
        className="rounded-md p-1.5 text-slate-500 hover:bg-slate-100 hover:text-slate-700 relative"
        title={`Anexos (${conta.qtd_anexos || 0})`}
      >
        <Paperclip size={15} />
        {conta.qtd_anexos > 0 && (
          <span className="absolute -top-1 -right-1 inline-flex items-center justify-center rounded-full bg-nexus-600 px-1 text-[9px] font-bold leading-3 text-white min-w-[14px] h-[14px]">
            {conta.qtd_anexos}
          </span>
        )}
      </button>

      {conta.status === 'pendente' && (
        <>
          <button
            type="button"
            onClick={onPagar}
            className="rounded-md p-1.5 text-emerald-600 hover:bg-emerald-50"
            title="Marcar como paga"
          >
            <CheckCircle2 size={15} />
          </button>
          <button
            type="button"
            onClick={onEditar}
            className="rounded-md p-1.5 text-slate-500 hover:bg-slate-100 hover:text-slate-700"
            title="Editar"
          >
            <Edit2 size={15} />
          </button>
          <button
            type="button"
            onClick={onCancelar}
            className="rounded-md p-1.5 text-red-500 hover:bg-red-50"
            title="Cancelar esta"
          >
            <Ban size={15} />
          </button>
          {conta.eh_recorrente && (
            <button
              type="button"
              onClick={onCancelarSerie}
              className="rounded-md p-1.5 text-red-500 hover:bg-red-50"
              title="Cancelar SÉRIE inteira (todas as pendentes)"
            >
              <Layers size={15} />
            </button>
          )}
        </>
      )}

      {(conta.status === 'paga' || conta.status === 'cancelada') && (
        <button
          type="button"
          onClick={onEditar}
          className="rounded-md p-1.5 text-slate-500 hover:bg-slate-100 hover:text-slate-700"
          title="Editar (corrigir erro)"
        >
          <Edit2 size={15} />
        </button>
      )}
    </div>
  );
}

function CartaoResumo({ titulo, valor, qtd, subtitulo, icone: Icone, cor = 'slate', destaque }) {
  const cores = {
    slate:   { fundo: 'bg-white',       borda: 'border-slate-200',  iconeBg: 'bg-slate-100',   iconeTxt: 'text-slate-600' },
    red:     { fundo: 'bg-red-50',      borda: 'border-red-200',    iconeBg: 'bg-red-100',     iconeTxt: 'text-red-700'   },
    amber:   { fundo: 'bg-white',       borda: 'border-slate-200',  iconeBg: 'bg-amber-100',   iconeTxt: 'text-amber-700' },
    emerald: { fundo: 'bg-white',       borda: 'border-slate-200',  iconeBg: 'bg-emerald-100', iconeTxt: 'text-emerald-700' },
  }[cor] ?? { fundo: 'bg-white', borda: 'border-slate-200', iconeBg: 'bg-slate-100', iconeTxt: 'text-slate-600' };

  return (
    <div className={`rounded-xl border ${cores.borda} ${cores.fundo} p-4 shadow-sm ${destaque ? 'ring-1 ring-red-300' : ''}`}>
      <div className="flex items-start gap-3">
        <div className={`rounded-lg p-2 ${cores.iconeBg} ${cores.iconeTxt}`}>
          <Icone size={16} />
        </div>
        <div className="flex-1 min-w-0">
          <div className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">
            {titulo}
          </div>
          <div className="mt-0.5 text-xl font-semibold tabular-nums text-slate-900">
            {formatarBRL(valor)}
          </div>
          {qtd != null && (
            <div className="text-xs text-slate-500">
              {qtd} conta{qtd === 1 ? '' : 's'}
            </div>
          )}
          {subtitulo && <div className="text-[10px] text-slate-500 mt-0.5">{subtitulo}</div>}
        </div>
      </div>
    </div>
  );
}

function BadgeStatus({ conta, atrasada }) {
  if (conta.status === 'paga') {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-medium uppercase text-emerald-800">
        <CheckCircle2 size={11} /> Paga
      </span>
    );
  }
  if (conta.status === 'cancelada') {
    return (
      <span
        className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-medium uppercase text-slate-600"
        title={conta.motivo_cancelamento || ''}
      >
        <Ban size={11} /> Cancelada
      </span>
    );
  }
  if (atrasada) {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-red-100 px-2 py-0.5 text-[10px] font-medium uppercase text-red-800">
        <AlertTriangle size={11} /> Atrasada
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-medium uppercase text-amber-800">
      <Clock size={11} /> Pendente
    </span>
  );
}

/* -------------------- Modais -------------------- */

function ModalConta({ conta, categorias, aoFechar, aoSalvar }) {
  const ehNovo = !conta;
  const ehHistorico = !ehNovo && (conta.status === 'paga' || conta.status === 'cancelada');
  const [form, setForm] = useState({
    descricao: conta?.descricao ?? '',
    fornecedor_nome: conta?.fornecedor_nome ?? '',
    fornecedor_documento: conta?.fornecedor_documento ?? '',
    categoria_id: conta?.categoria_id ?? '',
    valor: conta?.valor ?? '',
    data_vencimento: conta?.data_vencimento ? String(conta.data_vencimento).slice(0, 10) : '',
    observacoes: conta?.observacoes ?? '',
    comprovante_url: conta?.comprovante_url ?? '',
  });
  // Sprint 13 — recorrência (só na criação; edição não mexe na regra)
  const [recorrente, setRecorrente] = useState(false);
  const [recTipo, setRecTipo] = useState('mensal');
  const [recModoFim, setRecModoFim] = useState('infinito'); // 'infinito' | 'qtd' | 'ate'
  const [recQtd, setRecQtd] = useState(12);
  const [recAte, setRecAte] = useState('');

  const [comprovanteAnexo, setComprovanteAnexo] = useState(
    conta?.comprovante_nome
      ? { nome: conta.comprovante_nome, tamanho: conta.comprovante_tamanho, mime: conta.comprovante_mime }
      : null,
  );
  const [erro, setErro] = useState('');
  const [salvando, setSalvando] = useState(false);

  async function enviar(e) {
    e.preventDefault();
    setErro('');
    setSalvando(true);
    try {
      const payload = {
        descricao: form.descricao.trim(),
        fornecedor_nome: form.fornecedor_nome?.trim() || null,
        fornecedor_documento: form.fornecedor_documento?.trim() || null,
        categoria_id: form.categoria_id || null,
        valor: Number(form.valor),
        data_vencimento: form.data_vencimento,
        observacoes: form.observacoes?.trim() || null,
        comprovante_url: form.comprovante_url?.trim() || null,
      };
      // Recorrência só entra na criação
      if (ehNovo && recorrente) {
        const r = { tipo: recTipo, qtd: null, ate: null };
        if (recModoFim === 'qtd') r.qtd = Number(recQtd);
        if (recModoFim === 'ate') r.ate = recAte || null;
        payload.recorrencia = r;
      }
      await aoSalvar(payload);
    } catch (err) {
      setErro(mensagemDeErro(err, 'Não foi possível salvar.'));
    } finally {
      setSalvando(false);
    }
  }

  return (
    <Modal titulo={ehNovo ? 'Nova conta a pagar' : (ehHistorico ? 'Corrigir conta ' + (conta.status === 'paga' ? 'paga' : 'cancelada') : 'Editar conta')} aoFechar={aoFechar}>
      <form onSubmit={enviar} className="space-y-4">
        {ehHistorico && (
          <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
            <div className="flex items-start gap-2">
              <AlertTriangle size={14} className="mt-0.5 shrink-0 text-amber-700" />
              <div>
                <strong>Esta conta já está {conta.status === 'paga' ? 'paga' : 'cancelada'}.</strong>{' '}
                Edite somente pra corrigir erros cadastrais (descrição, fornecedor,
                categoria, observações). Cada alteração fica registrada no log
                de auditoria.
              </div>
            </div>
          </div>
        )}
        <Campo rotulo="Descrição" obrigatorio>
          <input
            type="text"
            required
            value={form.descricao}
            onChange={(e) => setForm((f) => ({ ...f, descricao: e.target.value }))}
            className={inputClasses}
            placeholder="Ex.: Aluguel de novembro"
          />
        </Campo>

        <div className="grid gap-4 sm:grid-cols-2">
          <Campo rotulo="Fornecedor">
            <input
              type="text"
              value={form.fornecedor_nome}
              onChange={(e) => setForm((f) => ({ ...f, fornecedor_nome: e.target.value }))}
              className={inputClasses}
            />
          </Campo>

          <Campo rotulo="Documento do fornecedor">
            <input
              type="text"
              value={form.fornecedor_documento}
              onChange={(e) => setForm((f) => ({ ...f, fornecedor_documento: e.target.value }))}
              className={inputClasses}
              placeholder="CPF ou CNPJ"
            />
          </Campo>

          <Campo rotulo="Categoria">
            <select
              value={form.categoria_id}
              onChange={(e) => setForm((f) => ({ ...f, categoria_id: e.target.value }))}
              className={inputClasses}
            >
              <option value="">Sem categoria</option>
              {categorias.filter((c) => c.ativo).map((c) => (
                <option key={c.id} value={c.id}>{c.nome}</option>
              ))}
            </select>
          </Campo>

          <Campo rotulo="Valor" obrigatorio>
            <input
              type="number"
              min="0"
              step="0.01"
              required
              value={form.valor}
              onChange={(e) => setForm((f) => ({ ...f, valor: e.target.value }))}
              className={inputClasses}
              placeholder="0,00"
            />
          </Campo>

          <Campo rotulo="Data de vencimento" obrigatorio>
            <input
              type="date"
              required
              value={form.data_vencimento}
              onChange={(e) => setForm((f) => ({ ...f, data_vencimento: e.target.value }))}
              className={inputClasses}
            />
          </Campo>

          <Campo rotulo="Link do boleto / comprovante">
            <input
              type="url"
              value={form.comprovante_url}
              onChange={(e) => setForm((f) => ({ ...f, comprovante_url: e.target.value }))}
              className={inputClasses}
              placeholder="https://..."
            />
          </Campo>
        </div>

        {!ehNovo && (
          <Campo rotulo="Comprovante anexado" ajuda="Arquivo guardado no servidor (PDF ou imagem). Pode coexistir com o link acima.">
            <CampoComprovante
              recurso="contas-pagar"
              id={conta.id}
              comprovante={comprovanteAnexo}
              podeEditar
              aoMudar={setComprovanteAnexo}
            />
          </Campo>
        )}

        {ehNovo && (
          <div className="rounded-lg border border-slate-200 bg-slate-50/60 p-3">
            <label className="flex items-start gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={recorrente}
                onChange={(e) => setRecorrente(e.target.checked)}
                className="mt-0.5"
              />
              <div className="flex-1">
                <div className="flex items-center gap-1.5 text-sm font-medium text-slate-900">
                  <Repeat size={13} /> Esta conta se repete
                </div>
                <div className="text-xs text-slate-500">
                  Cria automaticamente as ocorrências futuras. Cada uma vira uma
                  conta independente, com seu próprio fluxo de pagamento.
                </div>
              </div>
            </label>

            {recorrente && (
              <div className="mt-3 space-y-3 border-t border-slate-200 pt-3">
                <Campo rotulo="Frequência">
                  <select
                    value={recTipo}
                    onChange={(e) => setRecTipo(e.target.value)}
                    className={inputClasses}
                  >
                    <option value="mensal">Mensal</option>
                    <option value="trimestral">A cada 3 meses</option>
                    <option value="semestral">A cada 6 meses</option>
                    <option value="anual">Anualmente</option>
                  </select>
                </Campo>

                <fieldset className="space-y-2">
                  <legend className="text-sm font-medium text-slate-700 mb-1">
                    Até quando?
                  </legend>

                  <label className="flex items-center gap-2 text-sm text-slate-700 cursor-pointer">
                    <input
                      type="radio" name="rec-fim" value="infinito"
                      checked={recModoFim === 'infinito'}
                      onChange={() => setRecModoFim('infinito')}
                    />
                    Sem data definida
                    <span className="text-xs text-slate-500">
                      (gera 24 meses; o sistema renova automaticamente)
                    </span>
                  </label>

                  <label className="flex items-center gap-2 text-sm text-slate-700 cursor-pointer">
                    <input
                      type="radio" name="rec-fim" value="qtd"
                      checked={recModoFim === 'qtd'}
                      onChange={() => setRecModoFim('qtd')}
                    />
                    Por
                    <input
                      type="number" min="1" max="240"
                      value={recQtd}
                      onChange={(e) => setRecQtd(e.target.value)}
                      onFocus={() => setRecModoFim('qtd')}
                      className="w-20 rounded-md border border-slate-300 bg-white px-2 py-1 text-sm"
                    />
                    vezes
                  </label>

                  <label className="flex items-center gap-2 text-sm text-slate-700 cursor-pointer">
                    <input
                      type="radio" name="rec-fim" value="ate"
                      checked={recModoFim === 'ate'}
                      onChange={() => setRecModoFim('ate')}
                    />
                    Até a data
                    <input
                      type="date"
                      value={recAte}
                      onChange={(e) => setRecAte(e.target.value)}
                      onFocus={() => setRecModoFim('ate')}
                      className="rounded-md border border-slate-300 bg-white px-2 py-1 text-sm"
                    />
                  </label>
                </fieldset>

                <div className="rounded bg-amber-50 border border-amber-200 px-2.5 py-1.5 text-[11px] text-amber-800">
                  A primeira ocorrência usa a data de vencimento informada acima.
                  As demais são calculadas a partir dela.
                </div>
              </div>
            )}
          </div>
        )}

        <Campo rotulo="Observações">
          <textarea
            rows={2}
            value={form.observacoes}
            onChange={(e) => setForm((f) => ({ ...f, observacoes: e.target.value }))}
            className={inputClasses}
          />
        </Campo>

        {erro && (
          <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
            {erro}
          </div>
        )}

        <div className="flex justify-end gap-2 pt-2">
          <button type="button" onClick={aoFechar} className={botaoSecundario}>Cancelar</button>
          <button type="submit" disabled={salvando} className={botaoPrimario}>
            {salvando ? 'Salvando...' : (ehNovo ? 'Criar conta' : 'Salvar')}
          </button>
        </div>
      </form>
    </Modal>
  );
}

function ModalPagar({ conta, contasBancarias, aoFechar, aoConfirmar }) {
  const [form, setForm] = useState({
    data_pagamento: new Date().toISOString().slice(0, 10),
    valor_pago: String(conta.valor),
    forma_pagamento: 'pix',
    conta_bancaria_id: '',
    comprovante_url: conta.comprovante_url ?? '',
    observacoes: '',
  });
  const [comprovanteAnexo, setComprovanteAnexo] = useState(
    conta?.comprovante_nome
      ? { nome: conta.comprovante_nome, tamanho: conta.comprovante_tamanho, mime: conta.comprovante_mime }
      : null,
  );
  const [erro, setErro] = useState('');
  const [enviando, setEnviando] = useState(false);

  const diferenteDoOriginal = Number(form.valor_pago) !== Number(conta.valor);

  async function confirmar(e) {
    e.preventDefault();
    setErro('');
    setEnviando(true);
    try {
      await aoConfirmar({
        data_pagamento: form.data_pagamento,
        valor_pago: Number(form.valor_pago),
        forma_pagamento: form.forma_pagamento || null,
        conta_bancaria_id: form.conta_bancaria_id || null,
        comprovante_url: form.comprovante_url?.trim() || null,
        observacoes: form.observacoes?.trim() || null,
      });
    } catch (err) {
      setErro(mensagemDeErro(err, 'Não foi possível registrar o pagamento.'));
      setEnviando(false);
    }
  }

  return (
    <Modal titulo={`Pagar: ${conta.descricao}`} aoFechar={aoFechar}>
      <form onSubmit={confirmar} className="space-y-4">
        <div className="rounded-lg border border-slate-200 bg-slate-50 p-3 text-sm">
          <div className="grid gap-2 sm:grid-cols-3">
            <div>
              <div className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">Vencimento</div>
              <div className="font-medium text-slate-900">{formatarData(conta.data_vencimento)}</div>
            </div>
            <div>
              <div className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">Valor da conta</div>
              <div className="font-medium text-slate-900 tabular-nums">{formatarBRL(conta.valor)}</div>
            </div>
            {conta.fornecedor_nome && (
              <div>
                <div className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">Fornecedor</div>
                <div className="font-medium text-slate-900 truncate">{conta.fornecedor_nome}</div>
              </div>
            )}
          </div>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <Campo rotulo="Data do pagamento" obrigatorio>
            <input
              type="date"
              required
              value={form.data_pagamento}
              onChange={(e) => setForm((f) => ({ ...f, data_pagamento: e.target.value }))}
              className={inputClasses}
            />
          </Campo>

          <Campo rotulo="Valor pago" obrigatorio ajuda={diferenteDoOriginal ? 'Diferente do valor da conta.' : null}>
            <input
              type="number"
              min="0"
              step="0.01"
              required
              value={form.valor_pago}
              onChange={(e) => setForm((f) => ({ ...f, valor_pago: e.target.value }))}
              className={inputClasses}
            />
          </Campo>

          <Campo rotulo="Forma de pagamento">
            <select
              value={form.forma_pagamento}
              onChange={(e) => setForm((f) => ({ ...f, forma_pagamento: e.target.value }))}
              className={inputClasses}
            >
              {FORMAS_PAGAMENTO.map((f) => (
                <option key={f.valor} value={f.valor}>{f.rotulo}</option>
              ))}
            </select>
          </Campo>

          <Campo rotulo="Saiu da conta" ajuda="Se escolher, o saldo da conta é atualizado automaticamente.">
            <select
              value={form.conta_bancaria_id}
              onChange={(e) => setForm((f) => ({ ...f, conta_bancaria_id: e.target.value }))}
              className={inputClasses}
            >
              <option value="">Não informar</option>
              {contasBancarias.filter((c) => c.ativo).map((c) => (
                <option key={c.id} value={c.id}>
                  {c.apelido} — {formatarBRL(c.saldo_atual)}
                </option>
              ))}
            </select>
          </Campo>
        </div>

        <Campo rotulo="Link do comprovante">
          <input
            type="url"
            value={form.comprovante_url}
            onChange={(e) => setForm((f) => ({ ...f, comprovante_url: e.target.value }))}
            className={inputClasses}
            placeholder="https://..."
          />
        </Campo>

        <Campo rotulo="Anexar comprovante" ajuda="Arquivo guardado no servidor (PDF ou imagem). Você pode anexar antes ou depois de confirmar o pagamento.">
          <CampoComprovante
            recurso="contas-pagar"
            id={conta.id}
            comprovante={comprovanteAnexo}
            podeEditar
            aoMudar={setComprovanteAnexo}
          />
        </Campo>

        <Campo rotulo="Observações do pagamento">
          <textarea
            rows={2}
            value={form.observacoes}
            onChange={(e) => setForm((f) => ({ ...f, observacoes: e.target.value }))}
            className={inputClasses}
          />
        </Campo>

        {erro && (
          <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
            {erro}
          </div>
        )}

        <div className="flex justify-end gap-2 pt-2">
          <button type="button" onClick={aoFechar} className={botaoSecundario}>Cancelar</button>
          <button
            type="submit"
            disabled={enviando}
            className="inline-flex items-center gap-2 rounded-lg bg-emerald-600 px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-60"
          >
            <CheckCircle2 size={14} />
            {enviando ? 'Registrando...' : 'Confirmar pagamento'}
          </button>
        </div>
      </form>
    </Modal>
  );
}

function ModalCancelar({ conta, aoFechar, aoConfirmar }) {
  const [motivo, setMotivo] = useState('');
  const [erro, setErro] = useState('');
  const [enviando, setEnviando] = useState(false);

  async function confirmar(e) {
    e.preventDefault();
    setErro('');
    if (motivo.trim().length < 3) {
      setErro('Informe um motivo com pelo menos 3 caracteres.');
      return;
    }
    setEnviando(true);
    try { await aoConfirmar(motivo.trim()); }
    catch (err) {
      setErro(mensagemDeErro(err, 'Não foi possível cancelar.'));
      setEnviando(false);
    }
  }

  return (
    <Modal titulo="Cancelar conta" aoFechar={aoFechar}>
      <form onSubmit={confirmar} className="space-y-4">
        <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
          <div className="flex gap-2">
            <AlertTriangle size={16} className="mt-0.5 shrink-0 text-amber-700" />
            <div>
              Cancelar remove a conta do fluxo de caixa mas mantém o registro histórico.
              Use quando a conta foi lançada por engano, duplicada, ou não precisa mais
              ser paga.
            </div>
          </div>
        </div>

        <div className="rounded-lg border border-slate-200 bg-slate-50 p-3 text-sm">
          <div className="font-medium text-slate-900">{conta.descricao}</div>
          <div className="text-xs text-slate-600 mt-1">
            Vence em {formatarData(conta.data_vencimento)} · {formatarBRL(conta.valor)}
          </div>
        </div>

        <Campo rotulo="Motivo do cancelamento" obrigatorio ajuda="Fica registrado para auditoria.">
          <textarea
            rows={3}
            required
            minLength={3}
            maxLength={500}
            value={motivo}
            onChange={(e) => setMotivo(e.target.value)}
            placeholder="Ex: duplicada, lançada em valor errado, não será mais paga..."
            className={inputClasses}
          />
        </Campo>

        {erro && (
          <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
            {erro}
          </div>
        )}

        <div className="flex justify-end gap-2 pt-2">
          <button type="button" onClick={aoFechar} className={botaoSecundario}>Voltar</button>
          <button
            type="submit"
            disabled={enviando}
            className="inline-flex items-center gap-2 rounded-lg bg-red-600 px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-red-700 disabled:cursor-not-allowed disabled:opacity-60"
          >
            <Ban size={14} />
            {enviando ? 'Cancelando...' : 'Confirmar cancelamento'}
          </button>
        </div>
      </form>
    </Modal>
  );
}

/**
 * Sprint 13 — cancela TODA a série recorrente. Diferente do ModalCancelar:
 *   - Mostra aviso forte de que afeta várias contas
 *   - Só cancela as PENDENTES (preserva pagas e já canceladas)
 *   - Depois de confirmar, mostra alert com a quantidade real cancelada
 */
function ModalCancelarSerie({ conta, aoFechar, aoConfirmar }) {
  const [motivo, setMotivo] = useState('');
  const [erro, setErro] = useState('');
  const [enviando, setEnviando] = useState(false);

  async function confirmar(e) {
    e.preventDefault();
    setErro('');
    if (motivo.trim().length < 3) {
      setErro('Informe um motivo com pelo menos 3 caracteres.');
      return;
    }
    setEnviando(true);
    try {
      const r = await aoConfirmar(motivo.trim());
      // r vem do backend: { canceladas: N }
      if (r?.canceladas != null) {
        alert(`Série cancelada. ${r.canceladas} conta${r.canceladas === 1 ? '' : 's'} pendente${r.canceladas === 1 ? '' : 's'} ${r.canceladas === 1 ? 'foi marcada' : 'foram marcadas'} como cancelada${r.canceladas === 1 ? '' : 's'}.`);
      }
    } catch (err) {
      setErro(mensagemDeErro(err, 'Não foi possível cancelar a série.'));
      setEnviando(false);
    }
  }

  return (
    <Modal titulo="Cancelar SÉRIE inteira" aoFechar={aoFechar}>
      <form onSubmit={confirmar} className="space-y-4">
        <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-900">
          <div className="flex gap-2">
            <AlertTriangle size={16} className="mt-0.5 shrink-0 text-red-700" />
            <div>
              <div className="font-medium">Atenção: isto cancela TODAS as ocorrências pendentes desta série.</div>
              <div className="mt-1 text-xs">
                Contas já <strong>pagas</strong> ou já <strong>canceladas</strong> não serão afetadas — histórico
                preservado. Só as pendentes (presentes e futuras) serão marcadas como canceladas.
              </div>
            </div>
          </div>
        </div>

        <div className="rounded-lg border border-slate-200 bg-slate-50 p-3 text-sm">
          <div className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">
            Série
          </div>
          <div className="font-medium text-slate-900 inline-flex items-center gap-1.5">
            <Repeat size={12} className="text-nexus-700" />
            {conta.descricao}
          </div>
          <div className="text-xs text-slate-600 mt-1">
            {ROTULO_RECORRENCIA[conta.recorrencia_tipo]}
            {conta.recorrencia_qtd != null && ` · ${conta.recorrencia_qtd}×`}
            {conta.recorrencia_qtd == null && conta.recorrencia_ate && ` · até ${formatarData(conta.recorrencia_ate)}`}
            {conta.recorrencia_qtd == null && !conta.recorrencia_ate && ` · sem término`}
            {' · '}{formatarBRL(conta.valor)} cada
          </div>
        </div>

        <Campo rotulo="Motivo do cancelamento da série" obrigatorio ajuda="Fica registrado em todas as contas afetadas.">
          <textarea
            rows={3}
            required
            minLength={3}
            maxLength={500}
            value={motivo}
            onChange={(e) => setMotivo(e.target.value)}
            placeholder="Ex: contrato encerrado, fornecedor trocado, serviço cancelado..."
            className={inputClasses}
          />
        </Campo>

        {erro && (
          <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
            {erro}
          </div>
        )}

        <div className="flex justify-end gap-2 pt-2">
          <button type="button" onClick={aoFechar} className={botaoSecundario}>Voltar</button>
          <button
            type="submit"
            disabled={enviando}
            className="inline-flex items-center gap-2 rounded-lg bg-red-600 px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-red-700 disabled:cursor-not-allowed disabled:opacity-60"
          >
            <Layers size={14} />
            {enviando ? 'Cancelando série...' : 'Cancelar série inteira'}
          </button>
        </div>
      </form>
    </Modal>
  );
}

/**
 * Modal dedicado a gerenciar os múltiplos anexos de uma conta a pagar.
 * Reusa o componente <MultiplosAnexos> que faz todo o trabalho.
 */
function ModalAnexos({ conta, souAdmin, aoFechar }) {
  return (
    <Modal titulo={`Anexos — ${conta.descricao}`} aoFechar={aoFechar}>
      <div className="space-y-3">
        <div className="rounded-lg border border-slate-200 bg-slate-50 p-3 text-sm">
          <div className="flex flex-wrap items-baseline gap-3">
            <div>
              <div className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">Vencimento</div>
              <div className="font-medium text-slate-900">{formatarData(conta.data_vencimento)}</div>
            </div>
            <div>
              <div className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">Valor</div>
              <div className="font-medium text-slate-900 tabular-nums">{formatarBRL(conta.valor)}</div>
            </div>
            {conta.fornecedor_nome && (
              <div>
                <div className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">Fornecedor</div>
                <div className="font-medium text-slate-900">{conta.fornecedor_nome}</div>
              </div>
            )}
          </div>
        </div>

        <p className="text-xs text-slate-600">
          Anexe quantos arquivos precisar: boleto, comprovante de pagamento, nota fiscal do
          fornecedor, etc. Cada arquivo pode ter um <strong>tipo</strong> pra organizar a busca.
        </p>

        <MultiplosAnexos
          recurso="contas-pagar"
          id={conta.id}
          podeEditar={souAdmin}
        />

        <div className="flex justify-end pt-2">
          <button
            type="button"
            onClick={aoFechar}
            className={botaoPrimario}
          >
            Fechar
          </button>
        </div>
      </div>
    </Modal>
  );
}

function Modal({ titulo, aoFechar, children }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <button type="button" aria-label="Fechar" onClick={aoFechar} className="absolute inset-0 bg-slate-900/60" />
      <div className="relative z-10 w-full max-w-2xl rounded-xl bg-white shadow-xl max-h-[90vh] overflow-y-auto">
        <div className="sticky top-0 flex items-center justify-between border-b border-slate-200 bg-white px-5 py-3">
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
