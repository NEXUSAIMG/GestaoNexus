import { useEffect, useMemo, useState } from 'react';
import { Printer, AlertTriangle, TrendingUp, Lock, Shuffle, Banknote, ChevronRight, Repeat, Loader2 } from 'lucide-react';
import { api, mensagemDeErro } from '../api/client.js';

// ── Helpers ──────────────────────────────────────────────────────────
function formatarBRL(n) {
  return Number(n ?? 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

const MES_ABREV = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];
function formatarMes(mes) {
  const [a, m] = (mes || '').split('-');
  const i = Number(m) - 1;
  return `${MES_ABREV[i] || '??'}/${a || '????'}`;
}

function dataCurta(d) {
  if (!d) return '—';
  const s = typeof d === 'string' ? d.slice(0, 10) : new Date(d).toISOString().slice(0, 10);
  const [, m, dia] = s.split('-');
  return `${dia}/${m}`;
}

const COR_HEX = {
  slate: '#64748b', red: '#ef4444', orange: '#f97316', amber: '#f59e0b',
  yellow: '#eab308', lime: '#84cc16', emerald: '#10b981', teal: '#14b8a6',
  cyan: '#06b6d4', blue: '#3b82f6', indigo: '#6366f1', violet: '#8b5cf6',
  fuchsia: '#d946ef', pink: '#ec4899', rose: '#f43f5e',
};
const corDe = (nome) => COR_HEX[nome] || COR_HEX.slate;

const STATUS_CLASSE = {
  paga: 'bg-emerald-100 text-emerald-700',
  pendente: 'bg-slate-100 text-slate-600',
  agendada: 'bg-blue-100 text-blue-700',
  vencida: 'bg-red-100 text-red-700',
  atrasada: 'bg-red-100 text-red-700',
};
const statusClasse = (s) => STATUS_CLASSE[s] || 'bg-slate-100 text-slate-600';

function dataSuspeita(mes) {
  const ano = Number((mes || '').slice(0, 4));
  return ano > 0 && ano < new Date().getFullYear() - 5;
}

export default function Relatorios() {
  const [dados, setDados] = useState(null);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState('');

  useEffect(() => {
    let vivo = true;
    (async () => {
      setCarregando(true);
      setErro('');
      try {
        const res = await api.get('/relatorios/custos-mensais');
        if (vivo) setDados(res.data);
      } catch (err) {
        if (vivo) setErro(mensagemDeErro(err, 'Não foi possível gerar o relatório.'));
      } finally {
        if (vivo) setCarregando(false);
      }
    })();
    return () => { vivo = false; };
  }, []);

  const avisos = useMemo(() => {
    if (!dados) return [];
    const lista = [];
    const suspeitos = dados.realizado.meses.filter((m) => dataSuspeita(m.mes));
    for (const m of suspeitos) {
      lista.push(`Competência ${formatarMes(m.mes)} (${formatarBRL(m.despesas_total)}) tem ano improvável — possível data de vencimento digitada errada.`);
    }
    if (dados.realizado.totais.investimento === 0 && dados.projetado.totais.investimento === 0) {
      lista.push('Nenhum aporte de sócio efetivado no período (investimento = R$ 0,00).');
    }
    return lista;
  }, [dados]);

  if (carregando) {
    return <div className="p-6 text-slate-500">Gerando relatório…</div>;
  }
  if (erro) {
    return <div className="m-6 rounded-xl border border-red-200 bg-red-50 p-4 text-red-700">{erro}</div>;
  }
  if (!dados) return null;

  const { resumo, realizado, projetado, mes_atual, gerado_em } = dados;

  return (
    <div className="mx-auto max-w-5xl p-6 print:p-0">
      <style>{ESTILO_PRINT}</style>

      {/* Cabeçalho */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-800">Relatório de custos</h1>
          <p className="mt-1 max-w-2xl text-sm text-slate-500">{dados.base}</p>
          <p className="mt-1 text-xs text-slate-400">
            Gerado em {new Date(gerado_em).toLocaleString('pt-BR')} · mês atual: {formatarMes(mes_atual)}
          </p>
        </div>
        <button onClick={() => window.print()}
          className="no-print inline-flex shrink-0 items-center gap-2 rounded-lg bg-nexus-700 px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-nexus-800">
          <Printer size={16} /> Imprimir / PDF
        </button>
      </div>

      {/* Resumo executivo */}
      <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <CardResumo icone={TrendingUp} cor="#0b87f0" rotulo="Run-rate mensal"
          valor={formatarBRL(resumo.run_rate_mensal)}
          nota={resumo.meses_run_rate.length ? `média de ${resumo.meses_run_rate.map(formatarMes).join(', ')}` : 'sem meses fechados'} />
        <CardResumo icone={Lock} cor="#36a6ff" rotulo="Fixo recorrente (est.)"
          valor={resumo.fixo_recorrente_estimado != null ? formatarBRL(resumo.fixo_recorrente_estimado) : '—'}
          nota="mediana das competências projetadas" />
        <CardResumo icone={Shuffle} cor="#f59e0b" rotulo="Variável (est.)"
          valor={resumo.variavel_estimado != null ? formatarBRL(resumo.variavel_estimado) : '—'}
          nota="run-rate menos o fixo" />
        <CardResumo icone={Banknote} cor="#10b981" rotulo="Investimento (realizado)"
          valor={formatarBRL(realizado.totais.investimento)}
          nota="aportes de sócios efetivados" />
      </div>

      {/* Avisos */}
      {avisos.length > 0 && (
        <div className="mt-6 rounded-xl border border-amber-200 bg-amber-50 p-4">
          <div className="flex items-center gap-2 text-sm font-semibold text-amber-800">
            <AlertTriangle size={16} /> Pontos de atenção
          </div>
          <ul className="mt-2 list-disc space-y-1 pl-6 text-sm text-amber-800">
            {avisos.map((a, i) => <li key={i}>{a}</li>)}
          </ul>
        </div>
      )}

      {/* Realizado */}
      <Secao titulo="Realizado" subtitulo="Despesas por competência até o mês atual (o mês corrente é parcial). Clique num mês para carregar os lançamentos daquele mês.">
        <TabelaMeses meses={realizado.meses} totais={realizado.totais} mesAtual={mes_atual} />

        {realizado.categorias.length > 0 && (
          <div className="mt-6">
            <h3 className="mb-3 text-sm font-semibold text-slate-700">Despesas por categoria (todo o período realizado)</h3>
            <BarrasCategorias categorias={realizado.categorias} />
          </div>
        )}
      </Secao>

      {/* Projetado */}
      <Secao titulo="Projetado"
        subtitulo="Meses futuros — reflete só os compromissos recorrentes já cadastrados. É um piso de custo, não uma previsão completa (despesas variáveis não são projetadas). Clique num mês para os lançamentos.">
        {projetado.meses.length === 0 ? (
          <p className="text-sm text-slate-500">Sem compromissos futuros cadastrados.</p>
        ) : (
          <TabelaMeses meses={projetado.meses} totais={projetado.totais} mesAtual={mes_atual} projetado />
        )}
      </Secao>
    </div>
  );
}

// ── Componentes ──────────────────────────────────────────────────────
function CardResumo({ icone: Icone, cor, rotulo, valor, nota }) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4">
      <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-slate-500">
        <Icone size={15} style={{ color: cor }} /> {rotulo}
      </div>
      <div className="mt-2 text-xl font-bold tabular-nums text-slate-800">{valor}</div>
      {nota && <div className="mt-1 text-xs text-slate-400">{nota}</div>}
    </div>
  );
}

function Secao({ titulo, subtitulo, children }) {
  return (
    <section className="mt-8 break-inside-avoid">
      <h2 className="text-lg font-bold text-slate-800">{titulo}</h2>
      {subtitulo && <p className="mt-0.5 mb-3 max-w-2xl text-sm text-slate-500">{subtitulo}</p>}
      {children}
    </section>
  );
}

function BarrasCategorias({ categorias }) {
  return (
    <div className="space-y-2.5">
      {categorias.map((c) => (
        <div key={c.categoria_nome}>
          <div className="flex items-baseline justify-between gap-3 text-sm">
            <span className="flex items-center gap-2 truncate">
              <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: corDe(c.categoria_cor) }} />
              <span className="truncate text-slate-700">{c.categoria_nome}</span>
              <span className="shrink-0 text-xs text-slate-400">{c.qtd} lanç.</span>
            </span>
            <span className="shrink-0 font-medium tabular-nums text-slate-800">
              {formatarBRL(c.total)} <span className="text-xs text-slate-400">· {Math.round(c.pct)}%</span>
            </span>
          </div>
          <div className="mt-1 h-2 overflow-hidden rounded-full bg-slate-100">
            <div className="h-full rounded-full" style={{ width: Math.max(2, c.pct) + '%', background: corDe(c.categoria_cor) }} />
          </div>
        </div>
      ))}
    </div>
  );
}

function TabelaMeses({ meses, totais, mesAtual, projetado }) {
  const [abertos, setAbertos] = useState(() => new Set());
  // mes -> { loading, erro, data }
  const [detalhes, setDetalhes] = useState({});

  const carregar = async (mes) => {
    setDetalhes((d) => ({ ...d, [mes]: { loading: true, erro: '', data: d[mes]?.data || null } }));
    try {
      const res = await api.get('/relatorios/detalhe-mes', { params: { mes } });
      setDetalhes((d) => ({ ...d, [mes]: { loading: false, erro: '', data: res.data } }));
    } catch (err) {
      setDetalhes((d) => ({ ...d, [mes]: { loading: false, erro: mensagemDeErro(err, 'Falha ao carregar o detalhamento.'), data: null } }));
    }
  };

  const alternar = (mes) => {
    const estavaAberto = abertos.has(mes);
    setAbertos((s) => {
      const n = new Set(s);
      if (n.has(mes)) n.delete(mes); else n.add(mes);
      return n;
    });
    if (!estavaAberto) {
      const atual = detalhes[mes];
      if (!atual || (!atual.data && !atual.loading)) carregar(mes);
    }
  };

  return (
    <div className="overflow-x-auto rounded-xl border border-slate-200">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-slate-200 bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
            <th className="px-4 py-2 font-semibold">Mês</th>
            <th className="px-4 py-2 text-right font-semibold">Despesas</th>
            <th className="px-4 py-2 text-right font-semibold">Investimento</th>
            <th className="px-4 py-2 text-right font-semibold">Resultado</th>
          </tr>
        </thead>
        <tbody>
          {meses.map((m) => (
            <FragmentoMes
              key={m.mes}
              m={m}
              aberto={abertos.has(m.mes)}
              atual={m.mes === mesAtual}
              suspeito={dataSuspeita(m.mes)}
              detalhe={detalhes[m.mes]}
              aoAlternar={() => alternar(m.mes)}
            />
          ))}
        </tbody>
        <tfoot>
          <tr className="border-t-2 border-slate-200 bg-slate-50 font-semibold text-slate-800">
            <td className="px-4 py-2">{projetado ? 'Total projetado' : 'Total realizado'}</td>
            <td className="px-4 py-2 text-right tabular-nums">{formatarBRL(totais.despesas)}</td>
            <td className="px-4 py-2 text-right tabular-nums">{formatarBRL(totais.investimento)}</td>
            <td className={'px-4 py-2 text-right tabular-nums ' + (totais.resultado < 0 ? 'text-red-600' : 'text-emerald-600')}>
              {formatarBRL(totais.resultado)}
            </td>
          </tr>
        </tfoot>
      </table>
    </div>
  );
}

function FragmentoMes({ m, aberto, atual, suspeito, detalhe, aoAlternar }) {
  return (
    <>
      <tr onClick={aoAlternar}
        className="cursor-pointer border-b border-slate-100 transition-colors hover:bg-slate-50 last:border-0">
        <td className="px-4 py-2 text-slate-700">
          <span className="inline-flex items-center gap-1.5">
            <ChevronRight size={14} className={'text-slate-400 transition-transform ' + (aberto ? 'rotate-90' : '')} />
            {formatarMes(m.mes)}
          </span>
          {atual && <span className="ml-2 rounded bg-nexus-100 px-1.5 py-0.5 text-[10px] font-medium text-nexus-700">parcial</span>}
          {suspeito && <span className="ml-2 rounded bg-amber-100 px-1.5 py-0.5 text-[10px] font-medium text-amber-700">⚠ data?</span>}
        </td>
        <td className="px-4 py-2 text-right tabular-nums text-slate-800">{formatarBRL(m.despesas_total)}</td>
        <td className="px-4 py-2 text-right tabular-nums text-slate-500">{formatarBRL(m.investimento_total)}</td>
        <td className={'px-4 py-2 text-right tabular-nums font-medium ' + (m.resultado < 0 ? 'text-red-600' : 'text-emerald-600')}>
          {formatarBRL(m.resultado)}
        </td>
      </tr>
      {aberto && (
        <tr className="border-b border-slate-100 bg-slate-50/60">
          <td colSpan={4} className="px-4 py-4 sm:px-6">
            {!detalhe || detalhe.loading ? (
              <div className="flex items-center gap-2 text-sm text-slate-500">
                <Loader2 size={15} className="animate-spin" /> Carregando lançamentos…
              </div>
            ) : detalhe.erro ? (
              <span className="text-sm text-red-600">{detalhe.erro}</span>
            ) : (
              <DetalheMes mes={m.mes} data={detalhe.data} />
            )}
          </td>
        </tr>
      )}
    </>
  );
}

function DetalheMes({ mes, data }) {
  const itens = data?.itens || [];
  const categorias = data?.categorias || [];
  return (
    <div>
      <div className="mb-3 text-xs font-semibold uppercase tracking-wide text-slate-500">
        Detalhamento de {formatarMes(mes)} — {itens.length} {itens.length === 1 ? 'lançamento' : 'lançamentos'}
      </div>

      {itens.length === 0 ? (
        <span className="text-sm text-slate-400">Sem lançamentos de despesa neste mês.</span>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-slate-200 bg-white">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-200 text-left text-[11px] uppercase tracking-wide text-slate-400">
                <th className="px-3 py-1.5 font-semibold">Descrição</th>
                <th className="px-3 py-1.5 font-semibold">Categoria</th>
                <th className="px-3 py-1.5 text-center font-semibold">Venc.</th>
                <th className="px-3 py-1.5 text-right font-semibold">Valor</th>
              </tr>
            </thead>
            <tbody>
              {itens.map((it) => (
                <tr key={it.id} className="border-b border-slate-100 last:border-0">
                  <td className="px-3 py-2 align-top">
                    <div className="flex items-center gap-2">
                      <span className="font-medium text-slate-700">{it.descricao}</span>
                      {it.recorrente && (
                        <span className="inline-flex items-center gap-0.5 rounded bg-nexus-50 px-1 py-0.5 text-[10px] font-medium text-nexus-700">
                          <Repeat size={10} /> fixo
                        </span>
                      )}
                    </div>
                    {it.fornecedor && <div className="text-xs text-slate-400">{it.fornecedor}</div>}
                  </td>
                  <td className="px-3 py-2 align-top">
                    <span className="inline-flex items-center gap-1.5 text-slate-600">
                      <span className="h-2 w-2 rounded-full" style={{ background: corDe(it.categoria_cor) }} />
                      {it.categoria_nome}
                    </span>
                  </td>
                  <td className="px-3 py-2 text-center align-top text-slate-500">{dataCurta(it.vencimento)}</td>
                  <td className="px-3 py-2 text-right align-top">
                    <div className="font-medium tabular-nums text-slate-800">{formatarBRL(it.valor)}</div>
                    {it.status && (
                      <span className={'mt-0.5 inline-block rounded px-1.5 py-0.5 text-[10px] font-medium ' + statusClasse(it.status)}>
                        {it.status}
                      </span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {categorias.length > 1 && (
        <div className="mt-4">
          <div className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-slate-400">Resumo por categoria</div>
          <BarrasCategorias categorias={categorias} />
        </div>
      )}
    </div>
  );
}

const ESTILO_PRINT = `
  @media print {
    .no-print { display: none !important; }
    body { background: #fff; }
  }
`;
