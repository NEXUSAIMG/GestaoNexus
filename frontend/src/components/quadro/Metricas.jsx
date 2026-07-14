import { useEffect, useState } from 'react';
import {
  TrendingUp, Timer, Layers, AlertTriangle, Camera, Info,
} from 'lucide-react';
import { api, mensagemDeErro } from '../../api/client.js';
import { prioridadeDe } from './ui.js';

/**
 * Sprint 37 — Métricas de fluxo do quadro.
 *
 * Gráficos em SVG na mão, seguindo o precedente do GraficoFluxo.jsx —
 * o projeto não tem lib de chart e não vale puxar uma só por isso.
 *
 * A tela é ordenada por utilidade, não por vaidade:
 *   1. Aging WIP  — o que exige ação HOJE
 *   2. Resumo     — os números que você repete em reunião
 *   3. Throughput — a tendência
 *   4. Cycle time — a distribuição (e a promessa que dá pra fazer)
 *   5. CFD        — o gráfico bonito, que só fica útil com semanas de dado
 */

const PERIODOS = [
  { dias: 30, nome: '30 dias' },
  { dias: 90, nome: '90 dias' },
  { dias: 180, nome: '6 meses' },
];

// Faixas de aging. Não são arbitrárias: o corte é relativo ao p85 do próprio
// quadro quando existe (um card "velho" num quadro pode ser normal em outro).
function corDoAging(dias, p85) {
  const limite = p85 && p85 > 0 ? p85 : 14;
  if (dias > limite * 2) return 'bg-red-100 text-red-800 border-red-200';
  if (dias > limite) return 'bg-amber-100 text-amber-800 border-amber-200';
  return 'bg-slate-100 text-slate-600 border-slate-200';
}

export default function Metricas({ quadroId, ehAdmin }) {
  const [dados, setDados] = useState(null);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState('');
  const [dias, setDias] = useState(90);
  const [tirandoFoto, setTirandoFoto] = useState(false);

  async function carregar(d = dias) {
    setCarregando(true);
    setErro('');
    try {
      const r = await api.get('/quadros/' + quadroId + '/metricas?dias=' + d);
      setDados(r.data);
    } catch (err) {
      setErro(mensagemDeErro(err, 'Não consegui carregar as métricas.'));
    } finally {
      setCarregando(false);
    }
  }

  useEffect(() => { carregar(dias); /* eslint-disable-next-line */ }, [quadroId, dias]);

  async function forcarSnapshot() {
    setTirandoFoto(true);
    try {
      const r = await api.post('/quadros/' + quadroId + '/metricas/snapshot');
      await carregar();
      alert('Snapshot tirado: ' + r.data.cards_fotografados + ' cards fotografados.');
    } catch (err) {
      alert(mensagemDeErro(err));
    } finally {
      setTirandoFoto(false);
    }
  }

  if (carregando) return <div className="p-6 text-sm text-slate-500">Calculando métricas…</div>;
  if (erro) {
    return (
      <div className="m-6 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
        {erro}
      </div>
    );
  }
  if (!dados) return null;

  const r = dados.resumo;

  return (
    <div className="space-y-6 p-6">
      {/* Período */}
      <div className="flex items-center justify-between gap-2">
        <div className="inline-flex rounded-lg border border-slate-300 bg-white p-0.5">
          {PERIODOS.map((p) => (
            <button
              key={p.dias}
              type="button"
              onClick={() => setDias(p.dias)}
              className={[
                'rounded-md px-2.5 py-1 text-xs font-medium transition-colors',
                dias === p.dias ? 'bg-nexus-700 text-white' : 'text-slate-600 hover:bg-slate-50',
              ].join(' ')}
            >
              {p.nome}
            </button>
          ))}
        </div>
        {ehAdmin && (
          <button
            type="button"
            onClick={forcarSnapshot}
            disabled={tirandoFoto}
            className="inline-flex items-center gap-1 rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50"
            title="Tira a foto de hoje pro CFD sem esperar as 23:50"
          >
            <Camera size={12} /> {tirandoFoto ? 'Tirando…' : 'Tirar foto agora'}
          </button>
        )}
      </div>

      {/* 1. Aging WIP — o número que exige ação */}
      <Secao
        icone={AlertTriangle}
        titulo="Aging WIP"
        ajuda="Cards em andamento, do mais parado pro menos. É o dado mais acionável do conjunto: card esquecido não grita, só envelhece."
      >
        {dados.aging.length === 0 ? (
          <Vazio texto="Nenhum card em coluna do tipo “em andamento”." />
        ) : (
          <div className="overflow-hidden rounded-lg border border-slate-200">
            <table className="w-full text-xs">
              <thead className="bg-slate-50 text-slate-500">
                <tr>
                  <th className="px-3 py-2 text-left font-medium">Card</th>
                  <th className="px-3 py-2 text-left font-medium">Coluna</th>
                  <th className="px-3 py-2 text-left font-medium">Responsável</th>
                  <th className="px-3 py-2 text-right font-medium">Parado há</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 bg-white">
                {dados.aging.slice(0, 15).map((c) => {
                  const prio = prioridadeDe(c.prioridade);
                  return (
                    <tr key={c.id}>
                      <td className="px-3 py-1.5">
                        <div className="flex items-center gap-1.5">
                          {Number(c.prioridade ?? 2) !== 2 && (
                            <span className={'rounded px-1 py-0.5 text-[9px] font-bold border ' + prio.chip}>
                              {prio.sigla}
                            </span>
                          )}
                          <span className="truncate text-slate-800">{c.titulo}</span>
                        </div>
                      </td>
                      <td className="px-3 py-1.5 text-slate-500">{c.coluna_nome}</td>
                      <td className="px-3 py-1.5 text-slate-500">
                        {(c.responsaveis || []).map((p) => p.nome.split(' ')[0]).join(', ') || '—'}
                      </td>
                      <td className="px-3 py-1.5 text-right">
                        <span className={'inline-block rounded border px-1.5 py-0.5 font-semibold tabular-nums ' + corDoAging(c.dias_parado, r.cycle_p85)}>
                          {c.dias_parado}d
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Secao>

      {/* 2. Resumo */}
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Kpi
          icone={Timer}
          rotulo="Cycle time (p85)"
          valor={r.cycle_p85 != null ? r.cycle_p85 + 'd' : '—'}
          detalhe={r.cycle_p50 != null ? 'metade sai em ' + r.cycle_p50 + 'd' : 'sem entregas ainda'}
        />
        <Kpi
          icone={TrendingUp}
          rotulo="Vazão semanal"
          valor={r.throughput_semanal}
          detalhe={r.entregues + ' entregues no período'}
        />
        <Kpi
          icone={Layers}
          rotulo="Em andamento"
          valor={r.wip_andamento}
          detalhe={r.wip_backlog + ' no backlog'}
        />
        <Kpi
          icone={Timer}
          rotulo="Lead time (p85)"
          valor={r.lead_p85 != null ? r.lead_p85 + 'd' : '—'}
          detalhe="da criação à entrega"
        />
      </div>

      {r.cycle_p85 != null && (
        <p className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs text-emerald-900">
          <strong>A promessa que dá pra fazer:</strong> 85% dos cards deste quadro
          são entregues em até <strong>{r.cycle_p85} dias</strong> depois que o
          trabalho começa. Use esse número em prazo com cliente — não a média.
        </p>
      )}

      {/* 3. Throughput */}
      <Secao
        icone={TrendingUp}
        titulo="Vazão por semana"
        ajuda="Quantos cards foram concluídos a cada semana. Tendência importa mais que o valor absoluto."
      >
        {dados.throughput.length === 0
          ? <Vazio texto="Nenhuma entrega no período." />
          : <Barras dados={dados.throughput} />}
      </Secao>

      {/* 4. Cycle time */}
      <Secao
        icone={Timer}
        titulo="Distribuição do cycle time"
        ajuda="Cada barra é uma faixa de dias. A cauda longa à direita é onde mora o problema."
      >
        {dados.cycle_times.length === 0
          ? <Vazio texto="Nenhum card concluído no período." />
          : <Histograma valores={dados.cycle_times.map((c) => c.cycle_dias)} p85={r.cycle_p85} />}
      </Secao>

      {/* 5. CFD */}
      <Secao
        icone={Layers}
        titulo="Fluxo acumulado (CFD)"
        ajuda="Onde os cards estavam em cada dia. As faixas que engordam mostram onde o trabalho empoça."
      >
        {dados.cfd_dias < 2 ? (
          <div className="flex items-start gap-2 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-600">
            <Info size={14} className="mt-0.5 shrink-0 text-slate-400" />
            <span>
              O CFD precisa de histórico e ele só começa a existir agora — a foto
              diária roda às 23:50. Hoje há <strong>{dados.cfd_dias}</strong> dia(s)
              registrado(s). Em uma semana esse gráfico começa a dizer alguma coisa.
              {ehAdmin && ' Você pode adiantar o primeiro ponto com "Tirar foto agora".'}
            </span>
          </div>
        ) : (
          <CFD linhas={dados.cfd} />
        )}
      </Secao>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Peças de UI
// ---------------------------------------------------------------------------

function Secao({ icone: Icone, titulo, ajuda, children }) {
  return (
    <section>
      <h3 className="mb-1 flex items-center gap-1.5 text-sm font-semibold text-slate-900">
        <Icone size={14} /> {titulo}
      </h3>
      <p className="mb-2 text-xs text-slate-500">{ajuda}</p>
      {children}
    </section>
  );
}

function Kpi({ icone: Icone, rotulo, valor, detalhe }) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-3">
      <div className="flex items-center gap-1 text-[10px] font-medium uppercase tracking-wide text-slate-400">
        <Icone size={11} /> {rotulo}
      </div>
      <div className="mt-1 text-2xl font-semibold tabular-nums text-slate-900">{valor}</div>
      <div className="text-[11px] text-slate-500">{detalhe}</div>
    </div>
  );
}

function Vazio({ texto }) {
  return (
    <div className="rounded-lg border border-dashed border-slate-300 bg-white px-3 py-6 text-center text-xs text-slate-400">
      {texto}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Gráficos (SVG na mão — precedente: GraficoFluxo.jsx / GraficoMensal.jsx)
// ---------------------------------------------------------------------------

const L = 34;   // margem esquerda (eixo Y)
const B = 22;   // margem inferior (eixo X)
const H = 160;  // altura útil

/** Barras — vazão por semana. */
function Barras({ dados }) {
  const W = Math.max(320, dados.length * 46);
  const max = Math.max(1, ...dados.map((d) => d.entregues));
  const larg = (W - L - 8) / dados.length;

  return (
    <div className="overflow-x-auto rounded-lg border border-slate-200 bg-white p-2">
      <svg width={W} height={H + B + 12} role="img" aria-label="Vazão por semana">
        {[0, 0.5, 1].map((f) => {
          const y = 8 + H - f * H;
          return (
            <g key={f}>
              <line x1={L} y1={y} x2={W - 4} y2={y} stroke="#e2e8f0" strokeWidth="1" />
              <text x={L - 6} y={y + 3} textAnchor="end" fontSize="9" fill="#94a3b8">
                {Math.round(f * max)}
              </text>
            </g>
          );
        })}

        {dados.map((d, i) => {
          const h = (d.entregues / max) * H;
          const x = L + i * larg + 4;
          const y = 8 + H - h;
          return (
            <g key={d.semana}>
              <rect
                x={x}
                y={y}
                width={Math.max(6, larg - 10)}
                height={Math.max(1, h)}
                rx="3"
                fill="#0e7490"
              >
                <title>{d.semana}: {d.entregues} entregues</title>
              </rect>
              <text
                x={x + Math.max(6, larg - 10) / 2}
                y={y - 3}
                textAnchor="middle"
                fontSize="9"
                fill="#334155"
                fontWeight="600"
              >
                {d.entregues}
              </text>
              <text
                x={x + Math.max(6, larg - 10) / 2}
                y={H + 22}
                textAnchor="middle"
                fontSize="8"
                fill="#94a3b8"
              >
                {d.semana.slice(5).replace('-', '/')}
              </text>
            </g>
          );
        })}
      </svg>
    </div>
  );
}

/** Histograma do cycle time, com marca do p85. */
function Histograma({ valores, p85 }) {
  if (!valores.length) return null;

  const max = Math.max(...valores);
  // Faixas: 0-1, 1-2, 2-3, 3-5, 5-8, 8-13, 13-21, 21+ (fibonacci — respeita
  // a escala logarítmica com que a gente percebe demora).
  const cortes = [1, 2, 3, 5, 8, 13, 21];
  const rotulos = ['<1d', '1-2d', '2-3d', '3-5d', '5-8d', '8-13d', '13-21d', '21d+'];
  const baldes = new Array(cortes.length + 1).fill(0);

  for (const v of valores) {
    let i = cortes.findIndex((c) => v < c);
    if (i === -1) i = cortes.length;
    baldes[i] += 1;
  }

  const maxN = Math.max(1, ...baldes);
  const W = 460;
  const larg = (W - L - 8) / baldes.length;

  return (
    <div className="overflow-x-auto rounded-lg border border-slate-200 bg-white p-2">
      <svg width={W} height={H + B + 12} role="img" aria-label="Distribuição do cycle time">
        <line x1={L} y1={8 + H} x2={W - 4} y2={8 + H} stroke="#e2e8f0" />

        {baldes.map((n, i) => {
          const h = (n / maxN) * H;
          const x = L + i * larg + 3;
          const y = 8 + H - h;
          // Faixa que contém o p85 vira âmbar: é ali que a promessa se paga.
          const faixaP85 = p85 != null
            && (i === 0 ? p85 < cortes[0]
              : i === cortes.length ? p85 >= cortes[cortes.length - 1]
                : p85 >= cortes[i - 1] && p85 < cortes[i]);
          return (
            <g key={rotulos[i]}>
              <rect
                x={x}
                y={y}
                width={Math.max(6, larg - 8)}
                height={Math.max(1, h)}
                rx="3"
                fill={faixaP85 ? '#d97706' : '#0e7490'}
              >
                <title>{rotulos[i]}: {n} cards</title>
              </rect>
              {n > 0 && (
                <text
                  x={x + Math.max(6, larg - 8) / 2}
                  y={y - 3}
                  textAnchor="middle"
                  fontSize="9"
                  fill="#334155"
                  fontWeight="600"
                >
                  {n}
                </text>
              )}
              <text
                x={x + Math.max(6, larg - 8) / 2}
                y={H + 22}
                textAnchor="middle"
                fontSize="8"
                fill="#94a3b8"
              >
                {rotulos[i]}
              </text>
            </g>
          );
        })}

        <text x={L - 6} y={12} textAnchor="end" fontSize="9" fill="#94a3b8">{maxN}</text>
      </svg>
      <p className="px-1 pb-1 text-[10px] text-slate-400">
        Pico mais longo: {Math.round(max)}d. A barra âmbar é a faixa onde cai o p85.
      </p>
    </div>
  );
}

/** CFD — área empilhada a partir do snapshot diário. */
function CFD({ linhas }) {
  // linhas: [{ data, coluna_id, coluna_nome, ordem, n }]
  const datas = [...new Set(linhas.map((l) => l.data))].sort();
  const colunas = [...new Map(
    linhas.map((l) => [l.coluna_id, { id: l.coluna_id, nome: l.coluna_nome, ordem: l.ordem }]),
  ).values()].sort((a, b) => a.ordem - b.ordem);

  // mapa[data][coluna_id] = n
  const mapa = {};
  for (const l of linhas) {
    if (!mapa[l.data]) mapa[l.data] = {};
    mapa[l.data][l.coluna_id] = l.n;
  }

  const totais = datas.map((d) => colunas.reduce((s, c) => s + (mapa[d]?.[c.id] || 0), 0));
  const max = Math.max(1, ...totais);

  const W = Math.max(360, datas.length * 26);
  const px = (i) => L + (datas.length === 1 ? 0 : (i * (W - L - 8)) / (datas.length - 1));
  const py = (v) => 8 + H - (v / max) * H;

  // Paleta fria → quente conforme avança no fluxo (mesma lógica do board).
  const CORES = ['#94a3b8', '#38bdf8', '#0e7490', '#0d9488', '#10b981', '#65a30d', '#ca8a04'];

  // Empilhamento acumulado (de baixo pra cima, na ordem das colunas).
  const areas = [];
  const acumulado = new Array(datas.length).fill(0);
  colunas.forEach((c, ci) => {
    const base = [...acumulado];
    datas.forEach((d, i) => { acumulado[i] += mapa[d]?.[c.id] || 0; });
    const topo = datas.map((d, i) => px(i) + ',' + py(acumulado[i])).join(' ');
    const fundo = datas.map((d, i) => px(i) + ',' + py(base[i])).reverse().join(' ');
    areas.push({
      nome: c.nome,
      cor: CORES[ci % CORES.length],
      pontos: topo + ' ' + fundo,
    });
  });

  return (
    <div className="rounded-lg border border-slate-200 bg-white p-2">
      <div className="overflow-x-auto">
        <svg width={W} height={H + B + 12} role="img" aria-label="Fluxo acumulado">
          {[0, 0.5, 1].map((f) => (
            <line
              key={f}
              x1={L}
              y1={8 + H - f * H}
              x2={W - 4}
              y2={8 + H - f * H}
              stroke="#e2e8f0"
            />
          ))}
          <text x={L - 6} y={12} textAnchor="end" fontSize="9" fill="#94a3b8">{max}</text>
          <text x={L - 6} y={11 + H} textAnchor="end" fontSize="9" fill="#94a3b8">0</text>

          {areas.map((a) => (
            <polygon key={a.nome} points={a.pontos} fill={a.cor} fillOpacity="0.85">
              <title>{a.nome}</title>
            </polygon>
          ))}

          {datas.map((d, i) => (
            (i === 0 || i === datas.length - 1 || i % Math.ceil(datas.length / 6) === 0) && (
              <text
                key={d}
                x={px(i)}
                y={H + 22}
                textAnchor="middle"
                fontSize="8"
                fill="#94a3b8"
              >
                {d.slice(5).replace('-', '/')}
              </text>
            )
          ))}
        </svg>
      </div>

      <div className="mt-1 flex flex-wrap gap-2 px-1 pb-1">
        {areas.map((a) => (
          <span key={a.nome} className="inline-flex items-center gap-1 text-[10px] text-slate-600">
            <span className="h-2 w-2 rounded-sm" style={{ background: a.cor }} />
            {a.nome}
          </span>
        ))}
      </div>
    </div>
  );
}
