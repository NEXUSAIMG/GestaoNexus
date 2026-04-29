import { useMemo } from 'react';

/**
 * Gráfico de barras agrupadas por mês — Sprint 4.
 *
 * Para cada mês, mostra duas barras lado a lado (entradas em verde,
 * saídas em vermelho) e uma linha pontilhada com a "sobra" (entrada − saída)
 * em cima. Não usa biblioteca de chart — SVG puro pra alinhar com o
 * GraficoFluxo da Sprint 3.
 *
 * Recebe pontos no formato:
 *   [{ mes: '2025-08-01', entradas: 12000, saidas: 9000, sobra: 3000 }, ...]
 *
 * O click numa barra dispara `aoSelecionarMes(mesISO)` (formato YYYY-MM).
 */
export default function GraficoMensal({ pontos = [], mesAtivo, aoSelecionarMes }) {
  const altura = 240;
  const largura = 800;
  const margemEsq = 56;
  const margemDir = 16;
  const margemCima = 20;
  const margemBaixo = 36;

  const dados = useMemo(() => {
    if (!pontos.length) return null;

    const valores = pontos.flatMap((p) => [p.entradas, p.saidas, p.sobra]);
    const maxV = Math.max(...valores, 0);
    const minV = Math.min(...valores, 0);

    const span = Math.max(1, maxV - minV);
    const folga = span * 0.1;
    const topo = maxV + folga;
    const base = Math.min(0, minV - folga); // sempre inclui o zero

    const plotW = largura - margemEsq - margemDir;
    const plotH = altura - margemCima - margemBaixo;

    const passoX = plotW / pontos.length;
    const larguraGrupo = passoX * 0.7;
    const larguraBarra = larguraGrupo / 2 - 2;

    const escalaY = (v) => margemCima + ((topo - v) / (topo - base)) * plotH;
    const yZero = escalaY(0);

    const grupos = pontos.map((p, i) => {
      const xCentro = margemEsq + passoX * i + passoX / 2;
      const xEntrada = xCentro - larguraBarra - 1;
      const xSaida = xCentro + 1;

      const yEntrada = escalaY(Math.max(0, p.entradas));
      const hEntrada = Math.abs(escalaY(p.entradas) - yZero);

      const ySaida = escalaY(Math.max(0, p.saidas));
      const hSaida = Math.abs(escalaY(p.saidas) - yZero);

      const ySobra = escalaY(p.sobra);

      return { ponto: p, xCentro, xEntrada, xSaida, larguraBarra,
               yEntrada, hEntrada, ySaida, hSaida, ySobra };
    });

    // Ticks de Y: 4 níveis distribuídos.
    const ticks = [topo, (topo * 2 + base) / 3, (topo + base * 2) / 3, base].map((v) => ({
      y: escalaY(v),
      rotulo: formatarCompacto(v),
    }));

    // Linha conectando as sobras (linha pontilhada cinza).
    const linhaSobra = grupos
      .map((g, i) => `${i === 0 ? 'M' : 'L'}${g.xCentro.toFixed(1)},${g.ySobra.toFixed(1)}`)
      .join(' ');

    return { grupos, ticks, yZero, linhaSobra };
  }, [pontos]);

  if (!dados) {
    return (
      <div className="rounded-xl border border-slate-200 bg-white p-10 text-center text-sm text-slate-500 shadow-sm">
        Sem dados nos meses selecionados.
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
        <h3 className="text-sm font-semibold text-slate-900">Histórico mensal</h3>
        <div className="flex items-center gap-3 text-[11px] text-slate-600">
          <Legenda cor="#10b981" rotulo="Entradas" />
          <Legenda cor="#ef4444" rotulo="Saídas" />
          <Legenda cor="#475569" rotulo="Sobra" tracejada />
        </div>
      </div>

      <svg viewBox={`0 0 ${largura} ${altura}`} className="w-full" preserveAspectRatio="none" style={{ maxHeight: 280 }}>
        {/* Grid Y */}
        {dados.ticks.map((t, i) => (
          <g key={i}>
            <line
              x1={margemEsq} x2={largura - margemDir}
              y1={t.y} y2={t.y}
              stroke="#e2e8f0" strokeWidth="1" strokeDasharray="2 4"
            />
            <text
              x={margemEsq - 6} y={t.y}
              textAnchor="end" dominantBaseline="middle"
              fontSize="10" fill="#64748b"
            >
              {t.rotulo}
            </text>
          </g>
        ))}

        {/* Linha do zero (mais forte) */}
        <line
          x1={margemEsq} x2={largura - margemDir}
          y1={dados.yZero} y2={dados.yZero}
          stroke="#94a3b8" strokeWidth="1"
        />

        {/* Barras */}
        {dados.grupos.map((g, i) => {
          const mesISO = g.ponto.mes ? String(g.ponto.mes).slice(0, 7) : null;
          const ativo = mesISO && mesAtivo === mesISO;
          return (
            <g
              key={i}
              className={aoSelecionarMes ? 'cursor-pointer' : ''}
              onClick={() => aoSelecionarMes && mesISO && aoSelecionarMes(mesISO)}
            >
              {/* Faixa de hover invisível pra facilitar o click */}
              <rect
                x={g.xCentro - (largura - margemEsq - margemDir) / dados.grupos.length / 2}
                y={margemCima}
                width={(largura - margemEsq - margemDir) / dados.grupos.length}
                height={altura - margemCima - margemBaixo}
                fill={ativo ? 'rgba(11, 135, 240, 0.06)' : 'transparent'}
              />

              <rect
                x={g.xEntrada} y={g.yEntrada}
                width={g.larguraBarra} height={g.hEntrada}
                fill="#10b981" opacity={ativo ? 1 : 0.85}
                rx="2"
              >
                <title>Entradas em {formatarMesLongo(g.ponto.mes)}: {formatarBRL(g.ponto.entradas)}</title>
              </rect>

              <rect
                x={g.xSaida} y={g.ySaida}
                width={g.larguraBarra} height={g.hSaida}
                fill="#ef4444" opacity={ativo ? 1 : 0.85}
                rx="2"
              >
                <title>Saídas em {formatarMesLongo(g.ponto.mes)}: {formatarBRL(g.ponto.saidas)}</title>
              </rect>

              <text
                x={g.xCentro} y={altura - 18}
                textAnchor="middle" fontSize="11"
                fill={ativo ? '#0c3f72' : '#475569'}
                fontWeight={ativo ? 600 : 400}
              >
                {formatarMesCurto(g.ponto.mes)}
              </text>
              <text
                x={g.xCentro} y={altura - 6}
                textAnchor="middle" fontSize="9"
                fill={g.ponto.sobra >= 0 ? '#16a34a' : '#dc2626'}
                fontWeight="500"
              >
                {formatarSobraCurta(g.ponto.sobra)}
              </text>
            </g>
          );
        })}

        {/* Linha pontilhada das sobras */}
        <path
          d={dados.linhaSobra}
          fill="none" stroke="#475569"
          strokeWidth="1.5" strokeDasharray="3 3"
        />
        {dados.grupos.map((g, i) => (
          <circle key={`s${i}`} cx={g.xCentro} cy={g.ySobra} r="2.5" fill="#475569" />
        ))}
      </svg>
    </div>
  );
}

function Legenda({ cor, rotulo, tracejada }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <span
        className="inline-block h-2 w-4 rounded-sm"
        style={tracejada
          ? { borderTop: `1.5px dashed ${cor}`, background: 'transparent' }
          : { background: cor }
        }
      />
      {rotulo}
    </span>
  );
}

function formatarBRL(n) {
  return Number(n ?? 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

function formatarMesCurto(dataISO) {
  if (!dataISO) return '';
  try {
    const d = new Date(String(dataISO).slice(0, 10) + 'T12:00:00');
    return d.toLocaleDateString('pt-BR', { month: 'short' }).replace('.', '');
  } catch { return ''; }
}

function formatarMesLongo(dataISO) {
  if (!dataISO) return '';
  try {
    const d = new Date(String(dataISO).slice(0, 10) + 'T12:00:00');
    return d.toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' });
  } catch { return ''; }
}

function formatarCompacto(n) {
  const v = Number(n ?? 0);
  const abs = Math.abs(v);
  if (abs >= 1_000_000) return `${(v / 1_000_000).toFixed(1)}M`;
  if (abs >= 1_000)     return `${(v / 1_000).toFixed(0)}k`;
  return v.toFixed(0);
}

function formatarSobraCurta(n) {
  const v = Number(n ?? 0);
  const abs = Math.abs(v);
  const sinal = v >= 0 ? '+' : '−';
  if (abs >= 1_000_000) return `${sinal}${(abs / 1_000_000).toFixed(1)}M`;
  if (abs >= 1_000)     return `${sinal}${(abs / 1_000).toFixed(1)}k`;
  return `${sinal}${abs.toFixed(0)}`;
}
