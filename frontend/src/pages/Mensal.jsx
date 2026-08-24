import { useEffect, useMemo, useState } from 'react';
import {
  TrendingUp, TrendingDown, DollarSign, Percent, Printer,
  ChevronLeft, ChevronRight, Receipt, Calendar, ArrowUpRight, ArrowDownRight, Minus,
} from 'lucide-react';
import { api, mensagemDeErro } from '../api/client.js';
import { useAuth } from '../context/AuthContext.jsx';
import GraficoMensal from '../components/GraficoMensal.jsx';
import { BadgeCategoria } from './CategoriasDespesa.jsx';

/**
 * Mês a mês — Sprint 4.
 *
 * Mostra o resumo financeiro de um mês escolhido + comparativo com o
 * mês anterior + histórico em barras dos últimos 6 meses + saídas por
 * categoria + lista das contas pagas no mês. Todo o conjunto é pensado
 * pra ser impresso (Ctrl+P) com layout próprio em @media print.
 */

function mesAtualISO() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

function somarMeses(mesISO, n) {
  const [ano, mes] = mesISO.split('-').map(Number);
  const d = new Date(ano, mes - 1 + n, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

function formatarMesLongo(mesISO) {
  if (!mesISO) return '';
  try {
    const d = new Date(`${mesISO.slice(0, 7)}-01T12:00:00`);
    return d.toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' });
  } catch { return mesISO; }
}

function formatarMesCurto(mesISO) {
  if (!mesISO) return '';
  try {
    const d = new Date(`${mesISO.slice(0, 7)}-01T12:00:00`);
    return d.toLocaleDateString('pt-BR', { month: 'short', year: 'numeric' }).replace('.', '');
  } catch { return mesISO; }
}

function formatarBRL(n) {
  return Number(n ?? 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

function formatarPct(n, casas = 1) {
  if (n === null || n === undefined) return '—';
  const sinal = n > 0 ? '+' : '';
  return `${sinal}${n.toFixed(casas)}%`;
}

function formatarData(d) {
  if (!d) return '—';
  try { return new Date(d).toLocaleDateString('pt-BR'); } catch { return '—'; }
}

const FORMA_PAGAMENTO_ROTULO = {
  pix: 'PIX',
  boleto: 'Boleto',
  ted: 'TED',
  cartao: 'Cartão',
  dinheiro: 'Dinheiro',
  debito_automatico: 'Déb. automático',
  outro: 'Outro',
};

export default function Mensal() {
  const { pessoa } = useAuth();

  const [mes, setMes] = useState(mesAtualISO());
  const [resumo, setResumo] = useState(null);
  const [historico, setHistorico] = useState(null);
  const [carregandoResumo, setCarregandoResumo] = useState(true);
  const [carregandoHistorico, setCarregandoHistorico] = useState(true);
  const [erro, setErro] = useState('');

  async function carregarResumo() {
    setCarregandoResumo(true);
    setErro('');
    try {
      const res = await api.get('/mensal/resumo', { params: { mes } });
      setResumo(res.data);
    } catch (err) {
      setErro(mensagemDeErro(err, 'Não foi possível carregar o resumo do mês.'));
    } finally {
      setCarregandoResumo(false);
    }
  }

  async function carregarHistorico() {
    setCarregandoHistorico(true);
    try {
      // Sempre puxa 6 meses terminando no mês selecionado.
      const res = await api.get('/mensal/historico', { params: { mes, meses: 6 } });
      setHistorico(res.data);
    } catch {
      setHistorico(null);
    } finally {
      setCarregandoHistorico(false);
    }
  }

  useEffect(() => {
    carregarResumo();
    carregarHistorico();
    // eslint-disable-next-line
  }, [mes]);

  const podeAvancar = mes < mesAtualISO();
  const dataAtual = new Date();
  const dataLimite = `${dataAtual.getFullYear() - 5}-01`; // 5 anos atrás

  return (
    <div className="max-w-6xl">
      {/* Cabeçalho — não imprime */}
      <header className="mb-6 flex flex-wrap items-start justify-between gap-4 no-print">
        <div>
          <h1 className="text-2xl font-semibold text-slate-900">Mês a mês</h1>
          <p className="mt-1 text-slate-600">
            Resumo financeiro do mês para apoiar a reunião de sócios.
            Use o botão <em>Imprimir / PDF</em> para gerar uma versão pronta pra reunião.
          </p>
        </div>

        <div className="flex flex-wrap gap-2">
          <NavegadorMes mes={mes} setMes={setMes} podeAvancar={podeAvancar} dataLimite={dataLimite} />

          <button
            type="button"
            onClick={() => window.print()}
            className="inline-flex items-center gap-2 rounded-lg bg-nexus-700 px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-nexus-800"
          >
            <Printer size={16} />
            Imprimir / PDF
          </button>
        </div>
      </header>

      {erro && (
        <div className="mb-4 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700 no-print">
          {erro}
        </div>
      )}

      {/* Cabeçalho de impressão — só aparece no PDF */}
      <header className="mb-6 hidden print-only">
        <div className="text-xs uppercase tracking-widest text-nexus-700">Gestão Ayio</div>
        <h1 className="mt-1 text-2xl font-semibold text-slate-900">
          Resumo de {formatarMesLongo(mes)}
        </h1>
        <div className="mt-1 text-sm text-slate-600">
          Gerado em {new Date().toLocaleDateString('pt-BR')} por {pessoa?.nome ?? '—'}
        </div>
        <div className="mt-2 h-px bg-slate-300" />
      </header>

      {/* Cards de resumo */}
      <section className="mb-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <CartaoMes
          titulo="Faturado"
          valor={resumo?.atual.entradas}
          variacao={resumo?.variacao.entradas_pct}
          subtitulo={
            resumo?.atual.entradas_qtd
              ? `${resumo.atual.entradas_qtd} recebimento${resumo.atual.entradas_qtd === 1 ? '' : 's'}`
              : null
          }
          rodape={`Mês anterior: ${formatarBRL(resumo?.anterior.entradas ?? 0)}`}
          icone={TrendingUp}
          cor="emerald"
          variacaoBoaPositiva
          carregando={carregandoResumo}
        />
        <CartaoMes
          titulo="Gastos"
          valor={resumo?.atual.saidas}
          variacao={resumo?.variacao.saidas_pct}
          subtitulo={
            resumo?.atual.saidas_qtd
              ? `${resumo.atual.saidas_qtd} pagamento${resumo.atual.saidas_qtd === 1 ? '' : 's'}`
              : null
          }
          rodape={`Mês anterior: ${formatarBRL(resumo?.anterior.saidas ?? 0)}`}
          icone={TrendingDown}
          cor="red"
          /* Aqui pra cima é ruim, pra baixo é bom — invertido. */
          carregando={carregandoResumo}
        />
        <CartaoMes
          titulo="Sobra"
          valor={resumo?.atual.sobra}
          variacaoAbsoluta={resumo?.variacao.sobra_abs}
          rodape={`Mês anterior: ${formatarBRL(resumo?.anterior.sobra ?? 0)}`}
          icone={DollarSign}
          cor={resumo?.atual.sobra >= 0 ? 'nexus' : 'amber'}
          variacaoBoaPositiva
          carregando={carregandoResumo}
        />
        <CartaoMes
          titulo="Margem"
          valorPct={resumo?.atual.margem_pct}
          rodape={
            resumo?.anterior.margem_pct != null
              ? `Mês anterior: ${formatarPct(resumo.anterior.margem_pct)}`
              : 'Mês anterior: sem entradas'
          }
          icone={Percent}
          cor="slate"
          carregando={carregandoResumo}
        />
      </section>

      {/* Gráfico do histórico */}
      <section className="mb-6">
        {carregandoHistorico ? (
          <div className="rounded-xl border border-slate-200 bg-white p-10 text-center text-sm text-slate-500 shadow-sm no-print">
            Carregando histórico...
          </div>
        ) : (
          <GraficoMensal
            pontos={historico?.pontos ?? []}
            mesAtivo={mes}
            aoSelecionarMes={setMes}
          />
        )}
        <div className="mt-2 text-xs text-slate-500 no-print">
          Clique numa barra do gráfico para ver o resumo daquele mês.
        </div>
      </section>

      {/* Saídas por categoria */}
      <section className="mb-6 grid gap-6 lg:grid-cols-2">
        <SaidasPorCategoria
          itens={resumo?.saidas_por_categoria ?? []}
          carregando={carregandoResumo}
          totalSaidas={resumo?.atual.saidas ?? 0}
        />

        {/* Espaço pra contexto do mês + nota pra impressão */}
        <ResumoExecutivo resumo={resumo} carregando={carregandoResumo} />
      </section>

      {/* Tabela detalhada */}
      <ContasPagasMes
        contas={resumo?.contas_pagas ?? []}
        carregando={carregandoResumo}
      />

      {/* Rodapé de impressão */}
      <footer className="hidden print-only mt-8 pt-4 border-t border-slate-300 text-[10px] text-slate-500">
        Gestão Ayio · Resumo de {formatarMesLongo(mes)} · Página gerada via ferramenta interna.
      </footer>
    </div>
  );
}

function NavegadorMes({ mes, setMes, podeAvancar, dataLimite }) {
  const [editando, setEditando] = useState(false);

  return (
    <div className="inline-flex items-center gap-1 rounded-lg border border-slate-300 bg-white shadow-sm">
      <button
        type="button"
        onClick={() => setMes(somarMeses(mes, -1))}
        disabled={mes <= dataLimite}
        className="rounded-l-lg p-2 text-slate-600 hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-30"
        title="Mês anterior"
      >
        <ChevronLeft size={16} />
      </button>

      {editando ? (
        <input
          type="month"
          autoFocus
          value={mes}
          onChange={(e) => setMes(e.target.value)}
          onBlur={() => setEditando(false)}
          max={mesAtualISO()}
          className="border-0 px-2 py-1 text-sm font-medium text-slate-900 focus:outline-none focus:ring-0 bg-transparent"
        />
      ) : (
        <button
          type="button"
          onClick={() => setEditando(true)}
          className="inline-flex items-center gap-2 px-3 py-2 text-sm font-medium text-slate-900 hover:bg-slate-50"
        >
          <Calendar size={14} className="text-slate-500" />
          {formatarMesLongo(mes)}
        </button>
      )}

      <button
        type="button"
        onClick={() => setMes(somarMeses(mes, 1))}
        disabled={!podeAvancar}
        className="rounded-r-lg p-2 text-slate-600 hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-30"
        title="Próximo mês"
      >
        <ChevronRight size={16} />
      </button>
    </div>
  );
}

function CartaoMes({
  titulo, valor, valorPct, subtitulo, rodape, icone: Icone, cor = 'slate',
  variacao, variacaoAbsoluta, variacaoBoaPositiva = false, carregando,
}) {
  const cores = {
    slate:   { fundo: 'bg-white',          iconeBg: 'bg-slate-100',    iconeTxt: 'text-slate-600',   valor: 'text-slate-900' },
    nexus:   { fundo: 'bg-nexus-50',       iconeBg: 'bg-nexus-100',    iconeTxt: 'text-nexus-700',   valor: 'text-nexus-900' },
    emerald: { fundo: 'bg-emerald-50/40',  iconeBg: 'bg-emerald-100',  iconeTxt: 'text-emerald-700', valor: 'text-slate-900' },
    red:     { fundo: 'bg-red-50/40',      iconeBg: 'bg-red-100',      iconeTxt: 'text-red-700',     valor: 'text-slate-900' },
    amber:   { fundo: 'bg-amber-50',       iconeBg: 'bg-amber-100',    iconeTxt: 'text-amber-700',   valor: 'text-amber-900' },
  }[cor];

  // Direção da setinha + se a cor é "positiva" (verde) ou "negativa" (vermelha)
  let SetinhaIcone = Minus;
  let setinhaCor = 'text-slate-500';
  let textoVar = '—';

  if (variacao !== undefined && variacao !== null) {
    if (variacao > 0) {
      SetinhaIcone = ArrowUpRight;
      setinhaCor = variacaoBoaPositiva ? 'text-emerald-700' : 'text-red-700';
    } else if (variacao < 0) {
      SetinhaIcone = ArrowDownRight;
      setinhaCor = variacaoBoaPositiva ? 'text-red-700' : 'text-emerald-700';
    }
    textoVar = formatarPct(variacao);
  } else if (variacaoAbsoluta !== undefined && variacaoAbsoluta !== null) {
    if (variacaoAbsoluta > 0) {
      SetinhaIcone = ArrowUpRight;
      setinhaCor = 'text-emerald-700';
    } else if (variacaoAbsoluta < 0) {
      SetinhaIcone = ArrowDownRight;
      setinhaCor = 'text-red-700';
    }
    const sinal = variacaoAbsoluta > 0 ? '+' : '';
    textoVar = `${sinal}${formatarBRL(variacaoAbsoluta)}`;
  }

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
            {carregando ? (
              <span className="inline-block h-5 w-24 animate-pulse rounded bg-slate-200" />
            ) : valorPct !== undefined ? (
              valorPct === null ? '—' : formatarPct(valorPct)
            ) : (
              formatarBRL(valor)
            )}
          </div>

          {!carregando && (variacao !== undefined || variacaoAbsoluta !== undefined) && (
            <div className={`mt-1 inline-flex items-center gap-1 text-xs font-medium ${setinhaCor}`}>
              <SetinhaIcone size={12} />
              <span className="tabular-nums">{textoVar}</span>
              <span className="text-slate-400 font-normal">vs. mês anterior</span>
            </div>
          )}

          {subtitulo && <div className="mt-1 text-xs text-slate-600">{subtitulo}</div>}
          {rodape && <div className="mt-1 text-[11px] text-slate-500">{rodape}</div>}
        </div>
      </div>
    </div>
  );
}

function SaidasPorCategoria({ itens, carregando, totalSaidas }) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
      <h2 className="text-sm font-semibold text-slate-900 mb-3">Para onde foi o dinheiro</h2>

      {carregando ? (
        <div className="py-6 text-center text-sm text-slate-500">Carregando...</div>
      ) : itens.length === 0 ? (
        <div className="py-6 text-center text-sm text-slate-500">
          Nenhuma despesa paga neste mês.
        </div>
      ) : (
        <ul className="space-y-2.5">
          {itens.map((it) => (
            <li key={it.categoria_id ?? 'sem-categoria'}>
              <div className="flex items-center justify-between gap-3 text-sm">
                <BadgeCategoria nome={it.categoria_nome} cor={it.categoria_cor} pequeno />
                <div className="flex items-center gap-3 tabular-nums">
                  <span className="text-slate-500 text-xs">{it.qtd} pgto{it.qtd === 1 ? '' : 's'}</span>
                  <span className="font-medium text-slate-900">{formatarBRL(it.total)}</span>
                  <span className="text-slate-500 text-xs w-12 text-right">{it.pct.toFixed(0)}%</span>
                </div>
              </div>
              <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-slate-100">
                <div
                  className="h-full bg-nexus-500"
                  style={{ width: `${Math.max(2, it.pct)}%` }}
                />
              </div>
            </li>
          ))}
          {totalSaidas > 0 && (
            <li className="pt-2 mt-2 border-t border-slate-100 text-sm font-semibold text-slate-900 flex justify-between">
              <span>Total</span>
              <span className="tabular-nums">{formatarBRL(totalSaidas)}</span>
            </li>
          )}
        </ul>
      )}
    </div>
  );
}

function ResumoExecutivo({ resumo, carregando }) {
  const interpretacao = useMemo(() => {
    if (!resumo || carregando) return null;
    const { atual, anterior, variacao } = resumo;

    const linhas = [];

    // Resultado do mês
    if (atual.entradas === 0 && atual.saidas === 0) {
      linhas.push('Mês sem movimentação registrada.');
    } else if (atual.sobra > 0) {
      linhas.push(`O mês fechou com sobra de ${formatarBRL(atual.sobra)} (margem de ${formatarPct(atual.margem_pct, 0)}).`);
    } else if (atual.sobra < 0) {
      linhas.push(`O mês fechou com déficit de ${formatarBRL(Math.abs(atual.sobra))}: as saídas superaram as entradas.`);
    } else {
      linhas.push('O mês fechou no zero a zero — entradas e saídas iguais.');
    }

    // Comparativo
    if (anterior.entradas === 0 && anterior.saidas === 0) {
      linhas.push('Sem dados do mês anterior para comparar.');
    } else {
      if (variacao.entradas_pct !== null) {
        const v = variacao.entradas_pct;
        if (v === 0) linhas.push('Entradas ficaram praticamente estáveis em relação ao mês anterior.');
        else {
          const dir = v > 0 ? 'aumentaram' : 'caíram';
          linhas.push(`Entradas ${dir} ${Math.abs(v).toFixed(0)}% em relação ao mês anterior.`);
        }
      }
      if (variacao.saidas_pct !== null) {
        const v = variacao.saidas_pct;
        if (v === 0) linhas.push('Saídas ficaram praticamente estáveis.');
        else {
          const dir = v > 0 ? 'aumentaram' : 'caíram';
          linhas.push(`Saídas ${dir} ${Math.abs(v).toFixed(0)}%.`);
        }
      }
    }

    return linhas;
  }, [resumo, carregando]);

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
      <h2 className="text-sm font-semibold text-slate-900 mb-3">Resumo executivo</h2>
      {carregando ? (
        <div className="py-6 text-center text-sm text-slate-500">Carregando...</div>
      ) : (
        <ul className="space-y-2 text-sm text-slate-700">
          {interpretacao?.map((linha, i) => (
            <li key={i} className="flex gap-2">
              <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-nexus-500" />
              <span>{linha}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function ContasPagasMes({ contas, carregando }) {
  return (
    <section className="mb-6">
      <h2 className="text-sm font-semibold text-slate-900 mb-3 flex items-center gap-2">
        <Receipt size={14} className="text-slate-500" />
        Contas pagas no mês {contas.length > 0 && (
          <span className="text-xs font-normal text-slate-500">
            ({contas.length} {contas.length === 1 ? 'conta' : 'contas'})
          </span>
        )}
      </h2>

      <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white shadow-sm">
        <table className="w-full min-w-[38rem] text-sm">
          <thead className="bg-slate-50 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
            <tr>
              <th className="px-4 py-3">Descrição / Fornecedor</th>
              <th className="px-4 py-3">Categoria</th>
              <th className="px-4 py-3">Pago em</th>
              <th className="px-4 py-3">Forma</th>
              <th className="px-4 py-3 text-right">Valor</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {carregando && (
              <tr><td colSpan={5} className="px-4 py-8 text-center text-slate-500">Carregando...</td></tr>
            )}
            {!carregando && contas.length === 0 && (
              <tr><td colSpan={5} className="px-4 py-8 text-center text-slate-500">
                Nenhuma conta paga neste mês.
              </td></tr>
            )}
            {!carregando && contas.map((c) => (
              <tr key={c.id}>
                <td className="px-4 py-3">
                  <div className="font-medium text-slate-900">{c.descricao}</div>
                  {c.fornecedor_nome && (
                    <div className="text-xs text-slate-500">{c.fornecedor_nome}</div>
                  )}
                </td>
                <td className="px-4 py-3">
                  {c.categoria_nome
                    ? <BadgeCategoria nome={c.categoria_nome} cor={c.categoria_cor || 'slate'} pequeno />
                    : <span className="text-xs text-slate-400">—</span>
                  }
                </td>
                <td className="px-4 py-3 text-xs text-slate-600 whitespace-nowrap">
                  {formatarData(c.data_pagamento)}
                </td>
                <td className="px-4 py-3 text-xs text-slate-600">
                  {FORMA_PAGAMENTO_ROTULO[c.forma_pagamento] ?? c.forma_pagamento ?? '—'}
                </td>
                <td className="px-4 py-3 text-right tabular-nums font-medium text-slate-900">
                  {formatarBRL(c.valor_pago ?? c.valor)}
                </td>
              </tr>
            ))}
          </tbody>
          {!carregando && contas.length > 0 && (
            <tfoot className="bg-slate-50">
              <tr>
                <td colSpan={4} className="px-4 py-2 text-xs font-medium text-slate-600">
                  Total pago no mês
                </td>
                <td className="px-4 py-2 text-right tabular-nums font-semibold text-slate-900">
                  {formatarBRL(contas.reduce((a, c) => a + Number(c.valor_pago ?? c.valor ?? 0), 0))}
                </td>
              </tr>
            </tfoot>
          )}
        </table>
      </div>
    </section>
  );
}
