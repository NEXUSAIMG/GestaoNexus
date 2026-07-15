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

      {aba === 'dashboard' && <Dashboard mes={mes} />}
      {aba === 'fechamento' && <Fechamento mes={mes} admin={admin} />}
      {aba === 'catalogo' && <Catalogo admin={admin} />}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Dashboard
// ---------------------------------------------------------------------------

function Dashboard({ mes }) {
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

      <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
        <div className="border-b border-slate-200 px-4 py-2 text-sm font-semibold text-slate-800">
          Custo por serviço no mês
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
                <td className="px-4 py-2 text-right tabular-nums">{fmtBRL(s.valor_reais)}</td>
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
      await api.put('/custos-cloud/mensal', { mes, servico_id: servicoId, valor_reais: valor });
    } catch (e) {
      alert(mensagemDeErro(e, 'Não consegui salvar o valor.'));
    } finally {
      setSalvandoId(null);
    }
  }

  if (carregando) return <p className="text-sm text-slate-500">Carregando…</p>;
  if (erro) return <ErroBox texto={erro} />;
  if (!dados) return null;

  const total = dados.itens.reduce((s, i) => s + i.valor_reais, 0);

  return (
    <div className="space-y-3">
      <p className="text-xs text-slate-500">
        Digite o valor da fatura de cada serviço (em R$). Converta faturas em dólar pela cotação do dia do débito.
        {!admin && ' (Somente administradores podem editar.)'}
      </p>
      <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-xs uppercase tracking-wide text-slate-400">
              <th className="px-4 py-2 font-medium">Serviço</th>
              <th className="px-4 py-2 font-medium">Tipo</th>
              <th className="px-4 py-2 text-right font-medium">Teto</th>
              <th className="px-4 py-2 text-right font-medium">Valor no mês (R$)</th>
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
                  <input
                    type="text"
                    inputMode="decimal"
                    disabled={!admin}
                    defaultValue={it.valor_reais ? String(it.valor_reais) : ''}
                    onBlur={(e) => admin && salvar(it.servico_id, e.target.value)}
                    placeholder="0,00"
                    className="w-32 rounded-md border border-slate-300 px-2 py-1 text-right text-sm outline-none focus:border-nexus-500 disabled:bg-slate-50 disabled:text-slate-400"
                  />
                  {salvandoId === it.servico_id && <span className="ml-1 text-[10px] text-slate-400">salvando…</span>}
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

function ErroBox({ texto }) {
  return (
    <div className="flex items-center gap-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
      <RefreshCw size={14} /> {texto}
    </div>
  );
}
