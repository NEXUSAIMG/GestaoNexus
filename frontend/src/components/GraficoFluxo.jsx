import { useMemo } from 'react';

/**
 * Gráfico SVG puro do fluxo de caixa diário — Sprint 3.
 *
 * Recebe os pontos do endpoint /api/caixa/fluxo (um por dia) e desenha:
 *   - Linha do saldo projetado ao longo do tempo
 *   - Área preenchida abaixo da linha quando positivo
 *   - Linha tracejada no nível do caixa mínimo
 *   - Barras discretas de entradas (cima) e saídas (baixo) por dia
 *
 * Propositalmente sem dependência de biblioteca de charts: isso é
 * suficiente para o volume e dá um visual alinhado ao resto do app.
 */
export default function GraficoFluxo({ pontos, caixaMinimo = 0 }) {
  const altura = 220;
  const largura = 800; // viewBox, escala por CSS
  const margemEsq = 56;
  const margemDir = 16;
  const margemCima = 16;
  const margemBaixo = 32;

  const { linha, areaPositiva, zeroY, minimoY, maxY, minY, marcos, barras, ranges } = useMemo(() => {
    if (!pontos || pontos.length === 0) {
      return { linha: '', areaPositiva: '', zeroY: 0, minimoY: null, maxY: 0, minY: 0, marcos: [], barras: [], ranges: [] };
    }

    const saldos = pontos.map((p) => p.saldo);
    const maxSaldo = Math.max(...saldos, caixaMinimo, 0);
    const minSaldo = Math.min(...saldos, 0);

    // Deixa uma folga visual pra não colar nas bordas.
    const span = Math.max(1, maxSaldo - minSaldo);
    const folga = span * 0.1;
    const topo = maxSaldo + folga;
    const base = minSaldo - folga;

    const plotW = largura - margemEsq - margemDir;
    const plotH = altura - margemCima - margemBaixo;

    const escalaX = (i) => margemEsq + (i / Math.max(1, pontos.length - 1)) * plotW;
    const escalaY = (v) => margemCima + ((topo - v) / (topo - base)) * plotH;

    // Linha do saldo
    const linhaSaldo = pontos.map((p, i) => `${i === 0 ? 'M' : 'L'}${escalaX(i).toFixed(1)},${escalaY(p.saldo).toFixed(1)}`).join(' ');

    // Área positiva (entre saldo e zero, onde saldo > 0)
    const primeiro = escalaX(0).toFixed(1);
    const ultimo = escalaX(pontos.length - 1).toFixed(1);
    const zeroEscalado = escalaY(0).toFixed(1);
    const areaPos = [
      `M ${primeiro},${zeroEscalado}`,
      ...pontos.map((p, i) => `L ${escalaX(i).toFixed(1)},${escalaY(p.saldo).toFixed(1)}`),
      `L ${ultimo},${zeroEscalado}`,
      'Z',
    ].join(' ');

    // Barras de entrada (cima) e saída (baixo) — pequenas, pra não competir com a linha.
    const maxMovimento = Math.max(
      1,
      ...pontos.map((p) => Math.max(p.entrada || 0, p.saida || 0)),
    );
    const alturaMaxBarra = 18;
    const barrasArr = [];
    for (let i = 0; i < pontos.length; i++) {
      const p = pontos[i];
      const x = escalaX(i);
      const larguraBarra = Math.max(1.5, (plotW / pontos.length) * 0.6);
      if (p.entrada > 0) {
        const h = Math.max(1.5, (p.entrada / maxMovimento) * alturaMaxBarra);
        barrasArr.push({
          tipo: 'entrada',
          x: x - larguraBarra / 2,
          y: altura - margemBaixo - h,
          w: larguraBarra,
          h,
          valor: p.entrada,
          data: p.data,
        });
      }
      if (p.saida > 0) {
        const h = Math.max(1.5, (p.saida / maxMovimento) * alturaMaxBarra);
        barrasArr.push({
          tipo: 'saida',
          x: x - larguraBarra / 2,
          y: altura - margemBaixo,
          w: larguraBarra,
          h,
          valor: p.saida,
          data: p.data,
        });
      }
    }

    // Marcos de texto no eixo X: hoje, +30, +60, +90.
    const nMarcos = Math.min(5, pontos.length);
    const marcosArr = [];
    for (let m = 0; m < nMarcos; m++) {
      const i = Math.floor((m / (nMarcos - 1)) * (pontos.length - 1));
      const p = pontos[i];
      marcosArr.push({
        x: escalaX(i),
        rotulo: formatarMarco(p.data, i),
      });
    }

    // Ticks do eixo Y: 3 valores distribuídos.
    const rangesY = [
      topo,
      (topo + base) / 2,
      base,
    ].map((v) => ({
      y: escalaY(v),
      rotulo: formatarCompacto(v),
    }));

    return {
      linha: linhaSaldo,
      areaPositiva: areaPos,
      zeroY: escalaY(0),
      minimoY: caixaMinimo > 0 && caixaMinimo <= topo && caixaMinimo >= base ? escalaY(caixaMinimo) : null,
      maxY: topo,
      minY: base,
      marcos: marcosArr,
      barras: barrasArr,
      ranges: rangesY,
    };
  }, [pontos, caixaMinimo]);

  if (!pontos || pontos.length === 0) {
    return (
      <div className="rounded-xl border border-slate-200 bg-white p-6 text-center text-sm text-slate-500">
        Sem dados para exibir o fluxo.
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
      <div className="mb-3 flex items-center justify-between">
        <h3 className="text-sm font-semibold text-slate-900">Fluxo de caixa projetado</h3>
        <div className="flex items-center gap-3 text-[11px] text-slate-600">
          <Legenda cor="bg-nexus-500" rotulo="Saldo projetado" />
          <Legenda cor="bg-emerald-500" rotulo="Entradas" />
          <Legenda cor="bg-red-500" rotulo="Saídas" />
          {caixaMinimo > 0 && <Legenda cor="bg-amber-500" rotulo="Caixa mínimo" tracejada />}
        </div>
      </div>

      <svg viewBox={`0 0 ${largura} ${altura}`} className="w-full" preserveAspectRatio="none" style={{ maxHeight: 260 }}>
        {/* Grid Y */}
        {ranges.map((r, i) => (
          <g key={i}>
            <line
              x1={margemEsq}
              x2={largura - margemDir}
              y1={r.y}
              y2={r.y}
              stroke="#e2e8f0"
              strokeWidth="1"
              strokeDasharray="2 4"
            />
            <text
              x={margemEsq - 6}
              y={r.y}
              textAnchor="end"
              dominantBaseline="middle"
              fontSize="10"
              fill="#64748b"
            >
              {r.rotulo}
            </text>
          </g>
        ))}

        {/* Linha do zero */}
        <line
          x1={margemEsq}
          x2={largura - margemDir}
          y1={zeroY}
          y2={zeroY}
          stroke="#94a3b8"
          strokeWidth="1"
        />

        {/* Linha do caixa mínimo */}
        {minimoY !== null && (
          <line
            x1={margemEsq}
            x2={largura - margemDir}
            y1={minimoY}
            y2={minimoY}
            stroke="#f59e0b"
            strokeWidth="1.5"
            strokeDasharray="4 3"
          />
        )}

        {/* Área positiva do saldo */}
        <path d={areaPositiva} fill="rgb(11 135 240 / 0.10)" stroke="none" />

        {/* Linha do saldo */}
        <path d={linha} fill="none" stroke="rgb(6 108 206)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />

        {/* Barras de entradas e saídas */}
        {barras.map((b, i) => (
          <rect
            key={i}
            x={b.x}
            y={b.y}
            width={b.w}
            height={b.h}
            fill={b.tipo === 'entrada' ? '#10b981' : '#ef4444'}
            opacity="0.55"
          >
            <title>
              {b.tipo === 'entrada' ? 'Entrada' : 'Saída'} em {b.data}: {formatarCompleto(b.valor)}
            </title>
          </rect>
        ))}

        {/* Marcos no eixo X */}
        {marcos.map((m, i) => (
          <text
            key={i}
            x={m.x}
            y={altura - 10}
            textAnchor="middle"
            fontSize="10"
            fill="#64748b"
          >
            {m.rotulo}
          </text>
        ))}
      </svg>
    </div>
  );
}

function Legenda({ cor, rotulo, tracejada }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <span className={['inline-block h-2 w-4 rounded-sm', cor].join(' ')} style={tracejada ? { borderTop: '1.5px dashed #f59e0b', background: 'transparent' } : {}} />
      {rotulo}
    </span>
  );
}

function formatarMarco(dataISO, indice) {
  try {
    const d = new Date(dataISO + 'T12:00:00');
    if (indice === 0) return 'hoje';
    return d.toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' });
  } catch {
    return '';
  }
}

function formatarCompacto(n) {
  const v = Number(n ?? 0);
  const abs = Math.abs(v);
  if (abs >= 1_000_000) return `${(v / 1_000_000).toFixed(1)}M`;
  if (abs >= 1_000)     return `${(v / 1_000).toFixed(0)}k`;
  return v.toFixed(0);
}

function formatarCompleto(n) {
  return Number(n ?? 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}
