import { useEffect, useState, useCallback } from 'react';
import { Cloud, RefreshCw, AlertTriangle } from 'lucide-react';
import { api, mensagemDeErro } from '../api/client.js';
import { useAuth } from '../context/AuthContext.jsx';

/**
 * Sprint 40 -- Custos Cloud (Fase 1).
 * Dashboard do mes, fechamento (valores por servico) e catalogo de servicos.
 */

const fmtBRL = (n) => Number(n || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
const fmtPct = (x) => (x == null ? '—' : (x * 100).toFixed(1) + '%');

function mesAtual() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

const ABAS = [
  { id: 'dashboard', rotulo: 'Dashboard' },
  { id: 'fechamento', rotulo: 'Fechamento do mês' },
  { id: 'rateio', rotulo: 'Rateio por cartório' },
  { id: 'alertas', rotulo: 'Alertas' },
  { id: 'catalogo', rotulo: 'Catálogo de serviços' },
];

export default function CustosCloud() {
  const { pessoa } = useAuth();
  const admin = !!pessoa?.administrador;
  const [aba, setAba] = useState('dashboard');
  const [mes, setMes] = useState(mesAtual());

  return (
    <div className="mx-auto max-w-5xl">
      <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <h1 className="flex items-center gap-2 text-xl font-semibold text-slate-900">
          <Cloud size={22} className="text-nexus-700" /> Custos Cloud
        </h1>
        <label className="flex items-center gap-2 text-sm text-slate-600">
          Mês:
          <input
            type="month"
            value={mes}
            onChange={(e) => setMes(e.target.value || mesAtual())}
            className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm outline-none focus:border-nexus-500"
          />
        </label>
      </div>

      <div className="mb-4 flex gap-1 border-b border-slate-200">
        {ABAS.map((a) => (
          <button
            key={a.id}
            type="button"
            onClick={() => setAba(a.id)}
            className={[
              'px-4 py-2 text-sm font-medium -mb-px border-b-2',
              aba === a.id
                ? 'border-nexus-700 text-nexus-800'
                : 'border-transparent text-slate-500 hover:text-slate-800',
            ].join(' ')}
          >
            {a.rotulo}
          </button>
        ))}
      </div>

      {aba === 'dashboard' && <Dashboard mes={mes} admin={admin} />}
      {aba === 'fechamento' && <Fechamento mes={mes} admin={admin} />}
      {aba === 'rateio' && <Rateio mes={mes} admin={admin} />}
      {aba === 'alertas' && <Alertas mes={mes} />}
      {aba === 'catalogo' && <Catalogo admin={admin} />}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Dashboard
// ---------------------------------------------------------------------------

function Dashboard({ mes, admin }) {
  const [d, setD] = useState(null);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState('');

  const carregar = useCallback(() => {
    setCarregando(true);
    api.get('/custos-cloud/dashboard', { params: { mes } })
      .then((r) => setD(r.data))
      .catch((e) => setErro(mensagemDeErro(e)))
      .finally(() => setCarregando(false));
  }, [mes]);

  useEffect(() => { carregar(); }, [carregar]);

  async function salvar(servicoId, texto) {
    if (!admin) return;
    const valor = texto.trim() === '' ? 0 : Number(texto.replace(',', '.'));
    if (Number.isNaN(valor) || valor < 0) return;
    try {
      await api.put('/custos-cloud/mensal', { mes, servico_id: servicoId, valor });
      carregar();
    } catch (e) { alert(mensagemDeErro(e)); }
  }

  async function salvarCotacao(texto) {
    if (!admin) return;
    const v = texto.trim() === '' ? 0 : Number(texto.replace(',', '.'));
    if (Number.isNaN(v) || v < 0) return;
    try {
      await api.put('/custos-cloud/cotacao', { mes, usd_brl: v });
      carregar();
    } catch (e) { alert(mensagemDeErro(e)); }
  }

  if (carregando) return <p className="text-sm text-slate-500">Carregando…</p>;
  if (erro) return <ErroBox texto={erro} />;
  if (!d) return null;

  const varCor = d.variacao_reais > 0 ? 'text-red-600' : d.variacao_reais < 0 ? 'text-emerald-600' : 'text-slate-600';
  const margemCor = d.margem >= 0 ? 'text-emerald-600' : 'text-red-600';

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Cartao titulo="Custo total da nuvem" valor={fmtBRL(d.custo_total)} />
        <Cartao titulo="Receita recebida (Asaas)" valor={fmtBRL(d.receita_recebida)} />
        <Cartao titulo="Margem bruta" valor={fmtBRL(d.margem)} cor={margemCor} sub={'Margem: ' + fmtPct(d.margem_pct)} />
        <Cartao
          titulo="Variação vs mês anterior"
          valor={(d.variacao_reais >= 0 ? '+' : '') + fmtBRL(d.variacao_reais)}
          cor={varCor}
          sub={d.variacao_pct != null ? fmtPct(d.variacao_pct) : 'sem base anterior'}
        />
      </div>

      <div className="flex flex-wrap items-center gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm">
        <span className="font-medium text-amber-900">Cotação do dólar (US$ → R$) neste mês:</span>
        {admin ? (
          <input
            key={'cot:' + d.cotacao_usd}
            type="text"
            inputMode="decimal"
            defaultValue={d.cotacao_usd ? String(d.cotacao_usd) : ''}
            onBlur={(e) => salvarCotacao(e.target.value)}
            placeholder="ex: 5,40"
            className="w-24 rounded-md border border-amber-300 bg-white px-2 py-1 text-right text-sm outline-none focus:border-amber-500"
          />
        ) : (
          <span className="font-semibold text-amber-900">{d.cotacao_usd ? Number(d.cotacao_usd).toFixed(4) : '—'}</span>
        )}
        <span className="text-xs text-amber-700">Serviços em US$ são convertidos por esta cotação.</span>
      </div>

      <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
        <div className="border-b border-slate-200 px-4 py-2">
          <span className="text-sm font-semibold text-slate-800">Custo por serviço no mês</span>
          {admin && (
            <span className="ml-2 text-xs font-normal text-slate-400">
              digite o valor da fatura de cada serviço na coluna &quot;Custo&quot; — salva ao sair do campo
            </span>
          )}
        </div>
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-xs uppercase tracking-wide text-slate-400">
              <th className="px-4 py-2 font-medium">Serviço</th>
              <th className="px-4 py-2 font-medium">Tipo</th>
              <th className="px-4 py-2 text-right font-medium">Custo</th>
              <th className="px-4 py-2 text-right font-medium">% do total</th>
              <th className="px-4 py-2 text-right font-medium">Teto</th>
            </tr>
          </thead>
          <tbody>
            {d.por_servico.map((s) => (
              <tr key={s.id} className="border-t border-slate-100">
                <td className="px-4 py-2 font-medium text-slate-800">{s.nome}</td>
                <td className="px-4 py-2 text-slate-500">{s.tipo}</td>
                <td className="px-4 py-2 text-right">
                  {admin ? (
                    <div className="flex items-center justify-end gap-1">
                      <span className="text-xs text-slate-400">{s.moeda === 'USD' ? 'US$' : 'R$'}</span>
                      <input
                        key={s.id + ':' + (s.moeda === 'USD' ? s.valor_origem : s.valor_reais)}
                        type="text"
                        inputMode="decimal"
                        defaultValue={(() => { const v = s.moeda === 'USD' ? s.valor_origem : s.valor_reais; return v ? String(v) : ''; })()}
                        onBlur={(e) => salvar(s.id, e.target.value)}
                        placeholder="0,00"
                        className="w-24 rounded-md border border-slate-300 px-2 py-1 text-right text-sm outline-none focus:border-nexus-500"
                      />
                    </div>
                  ) : (
                    <span className="tabular-nums">{s.moeda === 'USD' && s.valor_origem ? 'US$ ' + Number(s.valor_origem).toFixed(2) : fmtBRL(s.valor_reais)}</span>
                  )}
                  {s.moeda === 'USD' && <div className="text-[10px] text-slate-400">= {fmtBRL(s.valor_reais)}</div>}
                </td>
                <td className="px-4 py-2 text-right tabular-nums text-slate-500">
                  {d.custo_total > 0 ? ((s.valor_reais / d.custo_total) * 100).toFixed(0) + '%' : '—'}
                </td>
                <td className={'px-4 py-2 text-right tabular-nums ' + (s.estourou_teto ? 'font-semibold text-red-600' : 'text-slate-500')}>
                  {s.teto_reais != null ? fmtBRL(s.teto_reais) : '—'}
                  {s.estourou_teto && <AlertTriangle size={12} className="ml-1 inline text-red-600" />}
                </td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr className="border-t-2 border-slate-200 font-semibold text-slate-900">
              <td className="px-4 py-2" colSpan={2}>Total</td>
              <td className="px-4 py-2 text-right tabular-nums">{fmtBRL(d.custo_total)}</td>
              <td className="px-4 py-2" colSpan={2} />
            </tr>
          </tfoot>
        </table>
      </div>
    </div>
  );
}

function Cartao({ titulo, valor, cor = 'text-slate-900', sub }) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4">
      <div className="text-xs font-medium uppercase tracking-wide text-slate-400">{titulo}</div>
      <div className={'mt-1 text-xl font-bold tabular-nums ' + cor}>{valor}</div>
      {sub && <div className="mt-0.5 text-xs text-slate-400">{sub}</div>}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Fechamento mensal
// ---------------------------------------------------------------------------

function Fechamento({ mes, admin }) {
  const [dados, setDados] = useState(null);
  const [erro, setErro] = useState('');
  const [carregando, setCarregando] = useState(true);
  const [salvandoId, setSalvandoId] = useState(null);

  const carregar = useCallback(() => {
    setCarregando(true);
    api.get('/custos-cloud/fechamento', { params: { mes } })
      .then((r) => setDados(r.data))
      .catch((e) => setErro(mensagemDeErro(e)))
      .finally(() => setCarregando(false));
  }, [mes]);

  useEffect(() => { carregar(); }, [carregar]);

  async function salvar(servicoId, valorTexto) {
    const valor = valorTexto.trim() === '' ? 0 : Number(valorTexto.replace(',', '.'));
    if (Number.isNaN(valor) || valor < 0) return;
    setSalvandoId(servicoId);
    try {
      await api.put('/custos-cloud/mensal', { mes, servico_id: servicoId, valor });
      carregar();
    } catch (e) {
      alert(mensagemDeErro(e, 'Não consegui salvar o valor.'));
    } finally {
      setSalvandoId(null);
    }
  }

  async function salvarCotacao(texto) {
    if (!admin) return;
    const v = texto.trim() === '' ? 0 : Number(texto.replace(',', '.'));
    if (Number.isNaN(v) || v < 0) return;
    try {
      await api.put('/custos-cloud/cotacao', { mes, usd_brl: v });
      carregar();
    } catch (e) { alert(mensagemDeErro(e)); }
  }

  if (carregando) return <p className="text-sm text-slate-500">Carregando…</p>;
  if (erro) return <ErroBox texto={erro} />;
  if (!dados) return null;

  const total = dados.itens.reduce((s, i) => s + i.valor_reais, 0);

  return (
    <div className="space-y-3">
      <p className="text-xs text-slate-500">
        Digite a fatura de cada serviço na sua moeda (US$ para serviços em dólar, R$ para os demais) e informe a cotação do mês para converter os que são em dólar.
        {!admin && ' Somente administradores editam.'}
      </p>
      <div className="flex flex-wrap items-center gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm">
        <span className="font-medium text-amber-900">Cotação do dólar (US$ → R$) neste mês:</span>
        {admin ? (
          <input
            key={'cotf:' + dados.cotacao_usd}
            type="text"
            inputMode="decimal"
            defaultValue={dados.cotacao_usd ? String(dados.cotacao_usd) : ''}
            onBlur={(e) => salvarCotacao(e.target.value)}
            placeholder="ex: 5,40"
            className="w-24 rounded-md border border-amber-300 bg-white px-2 py-1 text-right text-sm outline-none focus:border-amber-500"
          />
        ) : (
          <span className="font-semibold text-amber-900">{dados.cotacao_usd ? Number(dados.cotacao_usd).toFixed(4) : '—'}</span>
        )}
      </div>
      <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-xs uppercase tracking-wide text-slate-400">
              <th className="px-4 py-2 font-medium">Serviço</th>
              <th className="px-4 py-2 font-medium">Tipo</th>
              <th className="px-4 py-2 text-right font-medium">Teto</th>
              <th className="px-4 py-2 text-right font-medium">Valor no mês</th>
            </tr>
          </thead>
          <tbody>
            {dados.itens.map((it) => (
              <tr key={it.servico_id} className="border-t border-slate-100">
                <td className="px-4 py-2 font-medium text-slate-800">{it.nome}</td>
                <td className="px-4 py-2 text-slate-500">{it.tipo}</td>
                <td className="px-4 py-2 text-right tabular-nums text-slate-400">
                  {it.teto_reais != null ? fmtBRL(it.teto_reais) : '—'}
                </td>
                <td className="px-4 py-2 text-right">
                  <div className="flex items-center justify-end gap-1">
                    <span className="text-xs text-slate-400">{it.moeda === 'USD' ? 'US$' : 'R$'}</span>
                    <input
                      key={it.servico_id + ':' + (it.moeda === 'USD' ? it.valor_origem : it.valor_reais)}
                      type="text"
                      inputMode="decimal"
                      disabled={!admin}
                      defaultValue={(() => { const v = it.moeda === 'USD' ? it.valor_origem : it.valor_reais; return v ? String(v) : ''; })()}
                      onBlur={(e) => admin && salvar(it.servico_id, e.target.value)}
                      placeholder="0,00"
                      className="w-28 rounded-md border border-slate-300 px-2 py-1 text-right text-sm outline-none focus:border-nexus-500 disabled:bg-slate-50 disabled:text-slate-400"
                    />
                  </div>
                  {it.moeda === 'USD' && <div className="text-[10px] text-slate-400">= {fmtBRL(it.valor_reais)}</div>}
                  {salvandoId === it.servico_id && <span className="text-[10px] text-slate-400">salvando…</span>}
                </td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr className="border-t-2 border-slate-200 font-semibold text-slate-900">
              <td className="px-4 py-2" colSpan={3}>Total do mês</td>
              <td className="px-4 py-2 text-right tabular-nums">{fmtBRL(total)}</td>
            </tr>
          </tfoot>
        </table>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Catalogo de servicos
// ---------------------------------------------------------------------------

function Catalogo({ admin }) {
  const [servicos, setServicos] = useState([]);
  const [erro, setErro] = useState('');
  const [carregando, setCarregando] = useState(true);

  const carregar = useCallback(() => {
    setCarregando(true);
    api.get('/custos-cloud/servicos', { params: { todos: admin ? 1 : 0 } })
      .then((r) => setServicos(r.data))
      .catch((e) => setErro(mensagemDeErro(e)))
      .finally(() => setCarregando(false));
  }, [admin]);

  useEffect(() => { carregar(); }, [carregar]);

  async function salvarTeto(id, valorTexto) {
    const teto = valorTexto.trim() === '' ? null : Number(valorTexto.replace(',', '.'));
    if (teto != null && (Number.isNaN(teto) || teto < 0)) return;
    try {
      await api.put('/custos-cloud/servicos/' + id, { teto_reais: teto });
    } catch (e) { alert(mensagemDeErro(e)); }
  }

  async function alternarAtivo(s) {
    try {
      await api.put('/custos-cloud/servicos/' + s.id, { ativo: !s.ativo });
      carregar();
    } catch (e) { alert(mensagemDeErro(e)); }
  }

  if (carregando) return <p className="text-sm text-slate-500">Carregando…</p>;
  if (erro) return <ErroBox texto={erro} />;

  return (
    <div className="space-y-3">
      <p className="text-xs text-slate-500">
        A lista de tudo que pagamos na nuvem. {admin ? 'Você pode ajustar o teto e ativar/desativar serviços.' : 'Somente leitura.'}
      </p>
      <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-xs uppercase tracking-wide text-slate-400">
              <th className="px-4 py-2 font-medium">Serviço</th>
              <th className="px-4 py-2 font-medium">Para que serve</th>
              <th className="px-4 py-2 font-medium">Tipo</th>
              <th className="px-4 py-2 text-right font-medium">Teto (R$)</th>
              <th className="px-4 py-2 text-center font-medium">Ativo</th>
            </tr>
          </thead>
          <tbody>
            {servicos.map((s) => (
              <tr key={s.id} className={'border-t border-slate-100 ' + (s.ativo ? '' : 'opacity-50')}>
                <td className="px-4 py-2 font-medium text-slate-800">{s.nome}</td>
                <td className="px-4 py-2 text-slate-500">{s.para_que}</td>
                <td className="px-4 py-2 text-slate-500">{s.tipo}</td>
                <td className="px-4 py-2 text-right">
                  <input
                    type="text"
                    inputMode="decimal"
                    disabled={!admin}
                    defaultValue={s.teto_reais != null ? String(s.teto_reais) : ''}
                    onBlur={(e) => admin && salvarTeto(s.id, e.target.value)}
                    placeholder="—"
                    className="w-24 rounded-md border border-slate-300 px-2 py-1 text-right text-sm outline-none focus:border-nexus-500 disabled:bg-slate-50 disabled:text-slate-400"
                  />
                </td>
                <td className="px-4 py-2 text-center">
                  <button
                    type="button"
                    disabled={!admin}
                    onClick={() => alternarAtivo(s)}
                    className={[
                      'rounded-full px-2 py-0.5 text-xs font-medium',
                      s.ativo ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-200 text-slate-500',
                      admin ? 'cursor-pointer hover:opacity-80' : 'cursor-default',
                    ].join(' ')}
                  >
                    {s.ativo ? 'Ativo' : 'Inativo'}
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Rateio por cartorio
// ---------------------------------------------------------------------------

function Rateio({ mes, admin }) {
  const [d, setD] = useState(null);
  const [erro, setErro] = useState('');
  const [carregando, setCarregando] = useState(true);

  const carregar = useCallback(() => {
    setCarregando(true);
    api.get('/custos-cloud/rateio', { params: { mes } })
      .then((r) => setD(r.data))
      .catch((e) => setErro(mensagemDeErro(e)))
      .finally(() => setCarregando(false));
  }, [mes]);
  useEffect(() => { carregar(); }, [carregar]);

  async function salvar(cartorioId, mensalidade, mensagens) {
    try {
      await api.put('/custos-cloud/rateio', {
        mes, cartorio_id: cartorioId, mensalidade_reais: mensalidade, mensagens_mes: mensagens,
      });
      carregar();
    } catch (e) { alert(mensagemDeErro(e)); }
  }

  if (carregando) return <p className="text-sm text-slate-500">Carregando…</p>;
  if (erro) return <ErroBox texto={erro} />;
  if (!d) return null;

  return (
    <div className="space-y-3">
      <p className="text-xs text-slate-500">
        Custo variável ({fmtBRL(d.variavel_total)}) rateado por % de mensagens; custo fixo ({fmtBRL(d.fixo_total)})
        {' '}dividido igualmente entre {d.empresas} cartório(s).{!admin && ' Somente administradores editam.'}
      </p>
      <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-xs uppercase tracking-wide text-slate-400">
              <th className="px-3 py-2 font-medium">Cartório</th>
              <th className="px-3 py-2 text-right font-medium">Mensalidade (R$)</th>
              <th className="px-3 py-2 text-right font-medium">Mensagens</th>
              <th className="px-3 py-2 text-right font-medium">Custo total</th>
              <th className="px-3 py-2 text-right font-medium">Margem</th>
              <th className="px-3 py-2 text-center font-medium">Situação</th>
            </tr>
          </thead>
          <tbody>
            {d.itens.map((it) => (
              <LinhaRateio key={it.cartorio_id} it={it} admin={admin} onSalvar={salvar} />
            ))}
            {d.itens.length === 0 && (
              <tr><td colSpan={6} className="px-3 py-4 text-center text-slate-400">Nenhum cartório ativo cadastrado.</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function LinhaRateio({ it, admin, onSalvar }) {
  const [mens, setMens] = useState(it.mensalidade_reais ? String(it.mensalidade_reais) : '');
  const [msgs, setMsgs] = useState(it.mensagens_mes ? String(it.mensagens_mes) : '');

  function commit() {
    if (!admin) return;
    const m = mens.trim() === '' ? 0 : Number(mens.replace(',', '.'));
    const q = msgs.trim() === '' ? 0 : parseInt(msgs, 10);
    if (Number.isNaN(m) || Number.isNaN(q)) return;
    onSalvar(it.cartorio_id, m, q);
  }

  return (
    <tr className="border-t border-slate-100">
      <td className="px-3 py-2 font-medium text-slate-800">{it.nome}</td>
      <td className="px-3 py-2 text-right">
        <input
          type="text" inputMode="decimal" disabled={!admin} value={mens}
          onChange={(e) => setMens(e.target.value)} onBlur={commit} placeholder="0,00"
          className="w-24 rounded-md border border-slate-300 px-2 py-1 text-right text-sm outline-none focus:border-nexus-500 disabled:bg-slate-50 disabled:text-slate-400"
        />
      </td>
      <td className="px-3 py-2 text-right">
        <input
          type="text" inputMode="numeric" disabled={!admin} value={msgs}
          onChange={(e) => setMsgs(e.target.value)} onBlur={commit} placeholder="0"
          className="w-20 rounded-md border border-slate-300 px-2 py-1 text-right text-sm outline-none focus:border-nexus-500 disabled:bg-slate-50 disabled:text-slate-400"
        />
      </td>
      <td className="px-3 py-2 text-right tabular-nums text-slate-600">{fmtBRL(it.custo_total)}</td>
      <td className={'px-3 py-2 text-right tabular-nums ' + (it.margem >= 0 ? 'text-emerald-600' : 'text-red-600')}>{fmtBRL(it.margem)}</td>
      <td className="px-3 py-2 text-center">
        <span className={'rounded-full px-2 py-0.5 text-xs font-medium ' + (it.situacao === 'OK' ? 'bg-emerald-100 text-emerald-700' : 'bg-red-100 text-red-700')}>
          {it.situacao === 'OK' ? 'OK' : 'Prejuízo'}
        </span>
      </td>
    </tr>
  );
}

// ---------------------------------------------------------------------------
// Alertas
// ---------------------------------------------------------------------------

function Alertas({ mes }) {
  const [lista, setLista] = useState(null);
  const [erro, setErro] = useState('');
  const [carregando, setCarregando] = useState(true);

  useEffect(() => {
    setCarregando(true);
    api.get('/custos-cloud/alertas', { params: { mes } })
      .then((r) => setLista(r.data.alertas))
      .catch((e) => setErro(mensagemDeErro(e)))
      .finally(() => setCarregando(false));
  }, [mes]);

  if (carregando) return <p className="text-sm text-slate-500">Carregando…</p>;
  if (erro) return <ErroBox texto={erro} />;
  if (!lista || lista.length === 0) {
    return (
      <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-3 text-sm text-emerald-800">
        Nenhum alerta neste mês. Tudo dentro dos tetos.
      </div>
    );
  }
  return (
    <div className="space-y-2">
      {lista.map((a, i) => (
        <div
          key={i}
          className={'flex items-start gap-2 rounded-lg border px-3 py-2 ' + (a.severidade === 'alta' ? 'border-red-200 bg-red-50' : 'border-amber-200 bg-amber-50')}
        >
          <AlertTriangle size={16} className={'mt-0.5 ' + (a.severidade === 'alta' ? 'text-red-600' : 'text-amber-600')} />
          <div>
            <div className={'text-sm font-semibold ' + (a.severidade === 'alta' ? 'text-red-800' : 'text-amber-800')}>{a.titulo}</div>
            <div className="text-xs text-slate-600">{a.detalhe}</div>
          </div>
        </div>
      ))}
    </div>
  );
}

function ErroBox({ texto }) {
  return (
    <div className="flex items-center gap-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
      <RefreshCw size={14} /> {texto}
    </div>
  );
}
