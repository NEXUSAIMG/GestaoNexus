import { useEffect, useMemo, useState } from 'react';
import {
  Wallet, TrendingUp, TrendingDown, RefreshCw, AlertCircle, CheckCircle2, Clock,
  Link2Off, Search, ExternalLink, Calendar, Info, DollarSign, Settings, AlertTriangle,
  X,
} from 'lucide-react';
import { api, mensagemDeErro } from '../api/client.js';
import { useAuth } from '../context/AuthContext.jsx';
import GraficoFluxo from '../components/GraficoFluxo.jsx';

/**
 * Painel de Caixa.
 *
 * Sprint 2: entradas do ASAAS.
 * Sprint 3: saídas (contas_pagar), fluxo diário, alerta de caixa mínimo
 *           e configuração do mínimo.
 */

const STATUS_ASAAS = {
  PENDING: { rotulo: 'Pendente', cor: 'amber' },
  CONFIRMED: { rotulo: 'Confirmada', cor: 'emerald' },
  RECEIVED: { rotulo: 'Recebida', cor: 'emerald' },
  RECEIVED_IN_CASH: { rotulo: 'Recebida (caixa)', cor: 'emerald' },
  OVERDUE: { rotulo: 'Vencida', cor: 'red' },
  REFUNDED: { rotulo: 'Reembolsada', cor: 'slate' },
  REFUND_REQUESTED: { rotulo: 'Reembolso solicitado', cor: 'slate' },
  CHARGEBACK_REQUESTED: { rotulo: 'Chargeback', cor: 'red' },
  CHARGEBACK_DISPUTE: { rotulo: 'Chargeback em disputa', cor: 'red' },
  AWAITING_CHARGEBACK_REVERSAL: { rotulo: 'Aguardando reversão', cor: 'amber' },
  DUNNING_REQUESTED: { rotulo: 'Em negativação', cor: 'amber' },
  DUNNING_RECEIVED: { rotulo: 'Recebida (negativada)', cor: 'emerald' },
  AWAITING_RISK_ANALYSIS: { rotulo: 'Em análise de risco', cor: 'amber' },
};

const TIPO_COBRANCA = {
  BOLETO: 'Boleto', CREDIT_CARD: 'Cartão', PIX: 'PIX', UNDEFINED: '—',
};

function formatarBRL(n) {
  const v = Number(n ?? 0);
  return v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}
function formatarData(d) {
  if (!d) return '—';
  try { return new Date(d).toLocaleDateString('pt-BR'); } catch { return '—'; }
}
function formatarDataHora(d) {
  if (!d) return '—';
  try {
    return new Date(d).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' });
  } catch { return '—'; }
}
function tempoDesde(d) {
  if (!d) return null;
  const agora = new Date(), antes = new Date(d);
  const minutos = Math.floor((agora - antes) / 60000);
  if (minutos < 1) return 'agora';
  if (minutos < 60) return `${minutos} min atrás`;
  const horas = Math.floor(minutos / 60);
  if (horas < 24) return `${horas}h atrás`;
  const dias = Math.floor(horas / 24);
  return `${dias}d atrás`;
}

export default function Caixa() {
  const { pessoa } = useAuth();
  const souAdmin = !!pessoa?.administrador;

  const [resumo, setResumo] = useState(null);
  const [fluxoDados, setFluxoDados] = useState(null);
  const [cobrancas, setCobrancas] = useState([]);

  const [carregandoResumo, setCarregandoResumo] = useState(true);
  const [carregandoFluxo, setCarregandoFluxo] = useState(true);
  const [carregandoLista, setCarregandoLista] = useState(true);

  const [erro, setErro] = useState('');
  const [sincronizando, setSincronizando] = useState(false);
  const [resultadoSync, setResultadoSync] = useState(null);

  const [statusFiltro, setStatusFiltro] = useState('previstas');
  const [busca, setBusca] = useState('');
  const [buscaAtiva, setBuscaAtiva] = useState('');

  const [modalConfig, setModalConfig] = useState(false);

  async function carregarResumo() {
    setCarregandoResumo(true);
    setErro('');
    try {
      const res = await api.get('/caixa/resumo');
      setResumo(res.data);
    } catch (err) {
      setErro(mensagemDeErro(err, 'Não foi possível carregar o resumo do caixa.'));
    } finally { setCarregandoResumo(false); }
  }

  async function carregarFluxo() {
    setCarregandoFluxo(true);
    try {
      const res = await api.get('/caixa/fluxo', { params: { dias: 90 } });
      setFluxoDados(res.data);
    } catch {
      // sem fluxo ainda não é bloqueante
      setFluxoDados(null);
    } finally { setCarregandoFluxo(false); }
  }

  async function carregarLista() {
    setCarregandoLista(true);
    try {
      const res = await api.get('/caixa/entradas', {
        params: { status: statusFiltro, q: buscaAtiva || undefined, dias: 90 },
      });
      setCobrancas(res.data);
    } catch (err) {
      if (!erro) setErro(mensagemDeErro(err, 'Não foi possível carregar as cobranças.'));
    } finally { setCarregandoLista(false); }
  }

  useEffect(() => { carregarResumo(); carregarFluxo(); }, []);
  useEffect(() => { carregarLista(); /* eslint-disable-next-line */ }, [statusFiltro, buscaAtiva]);

  async function sincronizarAgora() {
    setSincronizando(true);
    setResultadoSync(null);
    try {
      const res = await api.post('/caixa/sincronizar');
      setResultadoSync({ tipo: 'ok', ...res.data });
      await Promise.all([carregarResumo(), carregarLista(), carregarFluxo()]);
    } catch (err) {
      setResultadoSync({ tipo: 'erro', mensagem: mensagemDeErro(err, 'Não foi possível sincronizar.') });
    } finally { setSincronizando(false); }
  }

  const integracao = resumo?.integracao_asaas;
  const ultima = integracao?.ultima_sincronizacao;
  const projecao = resumo?.projecao;

  return (
    <div className="max-w-6xl">
      <header className="mb-6 flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold text-slate-900">Caixa</h1>
          <p className="mt-1 text-slate-600">
            Saldo atual das contas, entradas do ASAAS, contas a pagar e fluxo projetado.
          </p>
        </div>

        <div className="flex flex-wrap gap-2">
          {souAdmin && (
            <>
              <button
                type="button"
                onClick={() => setModalConfig(true)}
                className="inline-flex items-center gap-2 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-700 shadow-sm hover:bg-slate-50"
                title="Configurar caixa mínimo"
              >
                <Settings size={14} />
                Configurações
              </button>
              <button
                type="button"
                onClick={sincronizarAgora}
                disabled={sincronizando || !integracao?.configurada}
                className="inline-flex items-center gap-2 rounded-lg bg-nexus-700 px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-nexus-800 disabled:cursor-not-allowed disabled:opacity-60"
                title={!integracao?.configurada ? 'Configure ASAAS_API_KEY' : ''}
              >
                <RefreshCw size={16} className={sincronizando ? 'animate-spin' : ''} />
                {sincronizando ? 'Sincronizando...' : 'Sincronizar ASAAS'}
              </button>
            </>
          )}
        </div>
      </header>

      {/* Alerta crítico: saldo projetado abaixo do mínimo ou atrasadas */}
      {projecao?.abaixo_do_minimo && (
        <AlertaCaixaMinimo projecao={projecao} />
      )}
      {resumo?.contas_atrasadas?.qtd > 0 && (
        <AlertaAtrasadas total={resumo.contas_atrasadas.total} qtd={resumo.contas_atrasadas.qtd} />
      )}

      <IntegracaoStatus integracao={integracao} ultima={ultima} resultadoSync={resultadoSync} />

      {erro && (
        <div className="mb-4 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
          {erro}
        </div>
      )}

      {/* Cards: saldo, entradas 30/60/90, saídas 30 */}
      <div className="mb-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <CartaoValor
          titulo="Saldo nas contas"
          valor={resumo?.saldos_contas.total}
          subtitulo={
            resumo?.saldos_contas.qtd_contas
              ? `${resumo.saldos_contas.qtd_contas} conta${resumo.saldos_contas.qtd_contas === 1 ? '' : 's'} ativa${resumo.saldos_contas.qtd_contas === 1 ? '' : 's'}`
              : 'Nenhuma conta cadastrada'
          }
          rodape={
            resumo?.saldos_contas.atualizado_mais_recente_em
              ? `Último registro: ${tempoDesde(resumo.saldos_contas.atualizado_mais_recente_em)}`
              : 'Saldo ainda não registrado'
          }
          icone={Wallet}
          carregando={carregandoResumo}
          acento="slate"
        />
        <CartaoValor
          titulo="Entradas em 30 dias"
          valor={resumo?.previsao_entradas.em_30}
          subtitulo="Previstas (ASAAS)"
          icone={TrendingUp}
          carregando={carregandoResumo}
          acento="emerald"
        />
        <CartaoValor
          titulo="Saídas em 30 dias"
          valor={resumo?.previsao_saidas.em_30}
          subtitulo="A pagar (pendentes)"
          rodape={
            resumo?.previsao_saidas.qtd_contas
              ? `${resumo.previsao_saidas.qtd_contas} conta${resumo.previsao_saidas.qtd_contas === 1 ? '' : 's'}`
              : null
          }
          icone={TrendingDown}
          carregando={carregandoResumo}
          acento="red"
        />
        <CartaoValor
          titulo="Saldo projetado (30 dias)"
          valor={projecao?.saldo_projetado_30_dias}
          subtitulo={
            projecao?.caixa_minimo
              ? `Mínimo configurado: ${formatarBRL(projecao.caixa_minimo)}`
              : 'Sem mínimo configurado'
          }
          rodape={
            projecao?.abaixo_do_minimo
              ? `Faltam ${formatarBRL(Math.abs(projecao.diferenca))} para o mínimo`
              : projecao?.caixa_minimo
                ? `Folga de ${formatarBRL(projecao.diferenca)}`
                : null
          }
          icone={DollarSign}
          carregando={carregandoResumo}
          acento={projecao?.abaixo_do_minimo ? 'amber' : 'nexus'}
        />
      </div>

      {/* Gráfico de fluxo */}
      <div className="mb-6">
        {carregandoFluxo ? (
          <div className="rounded-xl border border-slate-200 bg-white p-10 text-center text-sm text-slate-500 shadow-sm">
            Carregando gráfico...
          </div>
        ) : fluxoDados ? (
          <GraficoFluxo pontos={fluxoDados.pontos} caixaMinimo={projecao?.caixa_minimo ?? 0} />
        ) : null}
      </div>

      {/* Recebido últimos 30 dias */}
      {!carregandoResumo && resumo && (
        <div className="mb-6 rounded-xl border border-emerald-100 bg-emerald-50 p-4">
          <div className="flex items-center gap-3">
            <DollarSign size={20} className="text-emerald-700" />
            <div className="flex-1">
              <div className="text-[10px] font-semibold uppercase tracking-wide text-emerald-800">
                Recebido nos últimos 30 dias
              </div>
              <div className="text-xl font-semibold text-emerald-900 tabular-nums">
                {formatarBRL(resumo.recebido_ultimos_30_dias.total)}
              </div>
            </div>
            <div className="text-xs text-emerald-800">
              {resumo.recebido_ultimos_30_dias.qtd} pagamento{resumo.recebido_ultimos_30_dias.qtd === 1 ? '' : 's'}
            </div>
          </div>
        </div>
      )}

      {/* Lista de cobranças (entradas) */}
      <section>
        <div className="mb-3 flex flex-wrap items-center gap-3">
          <h2 className="text-lg font-semibold text-slate-900">Entradas (ASAAS)</h2>

          <div className="flex items-center gap-1 rounded-lg border border-slate-200 bg-white p-1">
            {[
              { v: 'previstas', r: 'Previstas' },
              { v: 'recebidas', r: 'Recebidas' },
              { v: 'todas', r: 'Todas' },
            ].map((o) => (
              <button
                key={o.v}
                type="button"
                onClick={() => setStatusFiltro(o.v)}
                className={[
                  'rounded-md px-3 py-1 text-xs font-medium transition-colors',
                  statusFiltro === o.v ? 'bg-nexus-700 text-white' : 'text-slate-600 hover:bg-slate-100',
                ].join(' ')}
              >
                {o.r}
              </button>
            ))}
          </div>

          <form onSubmit={(e) => { e.preventDefault(); setBuscaAtiva(busca.trim()); }} className="relative ml-auto">
            <Search size={14} className="pointer-events-none absolute left-2 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              type="search"
              placeholder="Buscar cliente, descrição..."
              value={busca}
              onChange={(e) => setBusca(e.target.value)}
              onBlur={() => setBuscaAtiva(busca.trim())}
              className="w-64 rounded-lg border border-slate-300 bg-white py-1.5 pl-7 pr-3 text-sm shadow-sm outline-none focus:border-nexus-500 focus:ring-2 focus:ring-nexus-200"
            />
          </form>
        </div>

        <TabelaCobrancas cobrancas={cobrancas} carregando={carregandoLista} statusFiltro={statusFiltro} />
      </section>

      {modalConfig && (
        <ModalConfiguracoes
          aoFechar={() => setModalConfig(false)}
          aoSalvar={async () => {
            setModalConfig(false);
            await carregarResumo();
          }}
        />
      )}
    </div>
  );
}

function AlertaCaixaMinimo({ projecao }) {
  return (
    <div className="mb-4 rounded-xl border-2 border-amber-300 bg-amber-50 p-4">
      <div className="flex items-start gap-3">
        <AlertTriangle size={22} className="mt-0.5 shrink-0 text-amber-600" />
        <div className="flex-1">
          <div className="font-semibold text-amber-900">
            Atenção: caixa projetado abaixo do mínimo
          </div>
          <div className="mt-1 text-sm text-amber-800">
            Em 30 dias, o saldo projetado é de <strong>{formatarBRL(projecao.saldo_projetado_30_dias)}</strong>{' '}
            — ficando <strong>{formatarBRL(Math.abs(projecao.diferenca))}</strong> abaixo do mínimo
            definido (<strong>{formatarBRL(projecao.caixa_minimo)}</strong>).
            Reveja as saídas previstas ou priorize entradas.
          </div>
        </div>
      </div>
    </div>
  );
}

function AlertaAtrasadas({ total, qtd }) {
  return (
    <div className="mb-4 rounded-xl border border-red-300 bg-red-50 p-4">
      <div className="flex items-start gap-3">
        <AlertCircle size={20} className="mt-0.5 shrink-0 text-red-600" />
        <div className="flex-1">
          <div className="font-semibold text-red-900">
            {qtd} conta{qtd === 1 ? ' atrasada' : 's atrasadas'}, totalizando {formatarBRL(total)}
          </div>
          <div className="mt-1 text-sm text-red-800">
            Verifique em <strong>Contas a pagar → Atrasadas</strong>.
          </div>
        </div>
      </div>
    </div>
  );
}

function IntegracaoStatus({ integracao, ultima, resultadoSync }) {
  if (!integracao) return null;

  if (!integracao.configurada) {
    return (
      <div className="mb-6 rounded-xl border border-amber-200 bg-amber-50 p-4">
        <div className="flex items-start gap-3">
          <Link2Off size={18} className="mt-0.5 shrink-0 text-amber-700" />
          <div className="flex-1">
            <div className="font-semibold text-amber-900">Integração com ASAAS não configurada</div>
            <div className="mt-0.5 text-sm text-amber-800">
              Defina <code className="rounded bg-amber-100 px-1 py-0.5 text-xs">ASAAS_API_KEY</code> no
              <code className="mx-1 rounded bg-amber-100 px-1 py-0.5 text-xs">.env</code> do backend
              e reinicie o servidor. Enquanto isso os valores de previsão de entrada ficam em zero.
            </div>
          </div>
        </div>
      </div>
    );
  }

  const cor = ultima?.status === 'erro'
    ? { borda: 'border-red-200', fundo: 'bg-red-50', texto: 'text-red-800', titulo: 'text-red-900', icone: 'text-red-700' }
    : { borda: 'border-slate-200', fundo: 'bg-white', texto: 'text-slate-600', titulo: 'text-slate-900', icone: 'text-emerald-600' };

  return (
    <div className={`mb-6 rounded-xl border ${cor.borda} ${cor.fundo} p-4`}>
      <div className="flex items-start gap-3">
        {ultima?.status === 'erro'
          ? <AlertCircle size={18} className={`mt-0.5 shrink-0 ${cor.icone}`} />
          : <CheckCircle2 size={18} className={`mt-0.5 shrink-0 ${cor.icone}`} />}
        <div className="flex-1">
          <div className={`font-semibold ${cor.titulo}`}>
            {ultima?.status === 'erro' ? 'Última sincronização falhou' : 'Integração ASAAS ativa'}
          </div>
          <div className={`mt-0.5 text-sm ${cor.texto}`}>
            {ultima ? (
              <>
                Última execução <span className="font-medium">{tempoDesde(ultima.iniciado_em) || formatarDataHora(ultima.iniciado_em)}</span>
                {ultima.status === 'sucesso' && (
                  <> · {ultima.cobrancas_inseridas} nova{ultima.cobrancas_inseridas === 1 ? '' : 's'},{' '}
                  {ultima.cobrancas_atualizadas} atualizada{ultima.cobrancas_atualizadas === 1 ? '' : 's'}</>
                )}
                {ultima.status === 'erro' && ultima.mensagem_erro && (
                  <>: <span className="font-mono text-xs">{ultima.mensagem_erro}</span></>
                )}
                {ultima.origem === 'automatica' && (
                  <span className="ml-2 rounded bg-slate-100 px-1.5 py-0.5 text-[10px] font-medium text-slate-600">
                    automática
                  </span>
                )}
              </>
            ) : (
              <>Nenhuma sincronização ainda. Clique em <em>Sincronizar ASAAS</em>.</>
            )}
          </div>

          {resultadoSync && (
            <div className={[
              'mt-2 rounded-md px-2 py-1 text-xs',
              resultadoSync.tipo === 'ok' ? 'bg-emerald-100 text-emerald-800' : 'bg-red-100 text-red-800',
            ].join(' ')}>
              {resultadoSync.tipo === 'ok'
                ? `Sincronização concluída: ${resultadoSync.inseridas} inseridas, ${resultadoSync.atualizadas} atualizadas.`
                : resultadoSync.mensagem}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function CartaoValor({ titulo, valor, subtitulo, rodape, icone: Icone, carregando, acento = 'slate' }) {
  const cores = {
    slate:   { fundo: 'bg-white',     iconeBg: 'bg-slate-100',   iconeTxt: 'text-slate-600',   valor: 'text-slate-900' },
    nexus:   { fundo: 'bg-nexus-50',  iconeBg: 'bg-nexus-100',   iconeTxt: 'text-nexus-700',   valor: 'text-nexus-900' },
    emerald: { fundo: 'bg-emerald-50/50', iconeBg: 'bg-emerald-100', iconeTxt: 'text-emerald-700', valor: 'text-slate-900' },
    red:     { fundo: 'bg-red-50/40', iconeBg: 'bg-red-100',     iconeTxt: 'text-red-700',     valor: 'text-slate-900' },
    amber:   { fundo: 'bg-amber-50',  iconeBg: 'bg-amber-100',   iconeTxt: 'text-amber-700',   valor: 'text-amber-900' },
  }[acento] ?? { fundo: 'bg-white', iconeBg: 'bg-slate-100', iconeTxt: 'text-slate-600', valor: 'text-slate-900' };

  return (
    <div className={`rounded-xl border border-slate-200 ${cores.fundo} p-4 shadow-sm`}>
      <div className="flex items-start gap-3">
        <div className={`rounded-lg p-2 ${cores.iconeBg} ${cores.iconeTxt}`}>
          <Icone size={16} />
        </div>
        <div className="flex-1 min-w-0">
          <div className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">
            {titulo}
          </div>
          <div className={`mt-0.5 text-xl font-semibold tabular-nums ${cores.valor}`}>
            {carregando ? <span className="inline-block h-5 w-24 animate-pulse rounded bg-slate-200" /> : formatarBRL(valor)}
          </div>
          {subtitulo && <div className="mt-0.5 text-xs text-slate-600">{subtitulo}</div>}
          {rodape && <div className="mt-1 text-[11px] text-slate-500">{rodape}</div>}
        </div>
      </div>
    </div>
  );
}

function TabelaCobrancas({ cobrancas, carregando, statusFiltro }) {
  const totalMostrado = useMemo(() => cobrancas.reduce(
    (acc, c) => acc + Number(c.valor_liquido ?? c.valor ?? 0), 0,
  ), [cobrancas]);

  return (
    <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
      <table className="w-full text-sm">
        <thead className="bg-slate-50 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
          <tr>
            <th className="px-4 py-3">Cliente / Descrição</th>
            <th className="px-4 py-3">Vencimento</th>
            <th className="px-4 py-3">Pagamento</th>
            <th className="px-4 py-3 text-right">Valor</th>
            <th className="px-4 py-3">Meio</th>
            <th className="px-4 py-3">Status</th>
            <th className="px-4 py-3"></th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {carregando && (<tr><td colSpan={7} className="px-4 py-8 text-center text-slate-500">Carregando...</td></tr>)}
          {!carregando && cobrancas.length === 0 && (
            <tr>
              <td colSpan={7} className="px-4 py-10 text-center text-slate-500">
                <Info size={18} className="mx-auto mb-2 text-slate-400" />
                Nenhuma cobrança {statusFiltro === 'previstas' ? 'prevista' : statusFiltro === 'recebidas' ? 'recebida' : ''} na janela atual.
              </td>
            </tr>
          )}
          {!carregando && cobrancas.map((c) => {
            const info = STATUS_ASAAS[c.status] ?? { rotulo: c.status, cor: 'slate' };
            return (
              <tr key={c.asaas_id}>
                <td className="px-4 py-3">
                  <div className="font-medium text-slate-900">
                    {c.cliente_nome || <span className="italic text-slate-400">Sem nome</span>}
                  </div>
                  {c.descricao && <div className="text-xs text-slate-500 truncate max-w-md">{c.descricao}</div>}
                  {c.referencia_externa && <div className="text-[10px] text-slate-400 font-mono">ref: {c.referencia_externa}</div>}
                </td>
                <td className="px-4 py-3 whitespace-nowrap text-slate-700 text-xs">
                  <Calendar size={11} className="inline-block mr-1 text-slate-400" />
                  {formatarData(c.data_vencimento)}
                </td>
                <td className="px-4 py-3 whitespace-nowrap text-slate-700 text-xs">
                  {c.data_pagamento
                    ? (<><Clock size={11} className="inline-block mr-1 text-emerald-600" />{formatarData(c.data_pagamento)}</>)
                    : <span className="text-slate-400">—</span>}
                </td>
                <td className="px-4 py-3 text-right tabular-nums font-medium text-slate-900">
                  {formatarBRL(c.valor_liquido ?? c.valor)}
                  {c.valor_liquido != null && c.valor_liquido !== c.valor && (
                    <div className="text-[10px] text-slate-400 line-through">{formatarBRL(c.valor)}</div>
                  )}
                </td>
                <td className="px-4 py-3 text-xs text-slate-600">{TIPO_COBRANCA[c.tipo] ?? c.tipo ?? '—'}</td>
                <td className="px-4 py-3">
                  <BadgeStatus rotulo={info.rotulo} cor={info.cor} />
                </td>
                <td className="px-4 py-3 text-right">
                  {c.fatura_url && (
                    <a href={c.fatura_url} target="_blank" rel="noopener noreferrer"
                       className="inline-flex items-center gap-1 rounded-md p-1.5 text-slate-500 hover:bg-slate-100 hover:text-slate-700"
                       title="Abrir fatura">
                      <ExternalLink size={13} />
                    </a>
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
        {!carregando && cobrancas.length > 0 && (
          <tfoot className="bg-slate-50">
            <tr>
              <td colSpan={3} className="px-4 py-2 text-xs font-medium text-slate-600">
                {cobrancas.length} cobrança{cobrancas.length === 1 ? '' : 's'}
              </td>
              <td className="px-4 py-2 text-right tabular-nums font-semibold text-slate-900">
                {formatarBRL(totalMostrado)}
              </td>
              <td colSpan={3} />
            </tr>
          </tfoot>
        )}
      </table>
    </div>
  );
}

function BadgeStatus({ rotulo, cor }) {
  const cores = {
    emerald: 'bg-emerald-100 text-emerald-800',
    amber:   'bg-amber-100 text-amber-800',
    red:     'bg-red-100 text-red-800',
    slate:   'bg-slate-100 text-slate-700',
  }[cor] ?? 'bg-slate-100 text-slate-700';
  return (
    <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide ${cores}`}>
      {rotulo}
    </span>
  );
}

function ModalConfiguracoes({ aoFechar, aoSalvar }) {
  const [carregando, setCarregando] = useState(true);
  const [caixaMinimo, setCaixaMinimo] = useState('');
  const [observacao, setObservacao] = useState('');
  const [erro, setErro] = useState('');
  const [salvando, setSalvando] = useState(false);

  useEffect(() => {
    api.get('/configuracoes-financeiras')
      .then((res) => {
        setCaixaMinimo(String(res.data.caixa_minimo ?? 0));
        setObservacao(res.data.caixa_minimo_observacao ?? '');
      })
      .catch((err) => setErro(mensagemDeErro(err, 'Não foi possível carregar as configurações.')))
      .finally(() => setCarregando(false));
  }, []);

  async function enviar(e) {
    e.preventDefault();
    setErro('');
    setSalvando(true);
    try {
      await api.put('/configuracoes-financeiras', {
        caixa_minimo: Number(caixaMinimo) || 0,
        caixa_minimo_observacao: observacao?.trim() || null,
      });
      aoSalvar();
    } catch (err) {
      setErro(mensagemDeErro(err, 'Não foi possível salvar.'));
    } finally { setSalvando(false); }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <button type="button" aria-label="Fechar" onClick={aoFechar} className="absolute inset-0 bg-slate-900/60" />
      <div className="relative z-10 w-full max-w-lg rounded-xl bg-white shadow-xl">
        <div className="flex items-center justify-between border-b border-slate-200 px-5 py-3">
          <h2 className="font-semibold text-slate-900">Configurações financeiras</h2>
          <button type="button" onClick={aoFechar} className="rounded-md p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-600">
            <X size={18} />
          </button>
        </div>
        <form onSubmit={enviar} className="p-5 space-y-4">
          {carregando ? (
            <div className="py-6 text-center text-sm text-slate-500">Carregando...</div>
          ) : (
            <>
              <div>
                <label className="block text-sm font-medium text-slate-700">
                  Caixa mínimo (alerta)
                </label>
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  value={caixaMinimo}
                  onChange={(e) => setCaixaMinimo(e.target.value)}
                  className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm shadow-sm outline-none focus:border-nexus-500 focus:ring-2 focus:ring-nexus-200"
                  placeholder="0,00"
                />
                <p className="mt-1 text-xs text-slate-500">
                  Quando o saldo projetado em 30 dias ficar abaixo desse valor, o painel
                  mostra um alerta. Deixe em zero para desativar.
                </p>
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700">
                  Observação (opcional)
                </label>
                <textarea
                  rows={2}
                  maxLength={500}
                  value={observacao}
                  onChange={(e) => setObservacao(e.target.value)}
                  className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm shadow-sm outline-none focus:border-nexus-500 focus:ring-2 focus:ring-nexus-200"
                  placeholder="Ex.: mínimo combinado entre os sócios para manter 1 mês de operação"
                />
              </div>

              {erro && (
                <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
                  {erro}
                </div>
              )}

              <div className="flex justify-end gap-2 pt-2">
                <button type="button" onClick={aoFechar}
                  className="inline-flex items-center justify-center rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 shadow-sm hover:bg-slate-50">
                  Cancelar
                </button>
                <button type="submit" disabled={salvando}
                  className="inline-flex items-center justify-center rounded-lg bg-nexus-700 px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-nexus-800 disabled:cursor-not-allowed disabled:opacity-60">
                  {salvando ? 'Salvando...' : 'Salvar'}
                </button>
              </div>
            </>
          )}
        </form>
      </div>
    </div>
  );
}
