import { useMemo, useState } from 'react';
import { corForte, prioridadeDe } from './ui.js';

/**
 * Sprint 35 — Vista Timeline (Gantt leve).
 *
 * Cada card com data vira uma barra `data_inicio → data_prazo`. Sem lib:
 * SVG na mão, mesma convenção do resto do projeto.
 *
 * Regras de exibição:
 *   - Card só com prazo (sem início): barra de 1 dia no prazo (marco).
 *   - Card sem nenhuma data: fica numa lista "sem cronograma" embaixo — o
 *     Gantt não inventa datas que não existem.
 *   - Barra vermelha = prazo no passado e card não concluído.
 */

const DIA = 86400000;
const LARGURA_DIA = 26;   // px por dia
const ALT_LINHA = 26;
const L = 220;            // largura da coluna de títulos

function soData(iso) {
  if (!iso) return null;
  return new Date(String(iso).slice(0, 10) + 'T12:00:00');
}

export default function VistaTimeline({ quadro, onAbrirCard }) {
  const [escala, setEscala] = useState(1); // 1 = dia, 0.34 ~ semana

  const colunaPorId = useMemo(
    () => Object.fromEntries((quadro.colunas || []).map((c) => [c.id, c])),
    [quadro.colunas],
  );

  const { comData, semData, inicio, totalDias } = useMemo(() => {
    const cd = [];
    const sd = [];
    for (const c of (quadro.cards || [])) {
      const ini = soData(c.data_inicio);
      const fim = soData(c.data_prazo);
      if (!ini && !fim) { sd.push(c); continue; }
      const a = ini || fim;
      const b = fim || ini;
      cd.push({ card: c, ini: a, fim: b < a ? a : b });
    }
    if (cd.length === 0) {
      return { comData: [], semData: sd, inicio: new Date(), totalDias: 30 };
    }
    let min = cd[0].ini; let max = cd[0].fim;
    for (const x of cd) {
      if (x.ini < min) min = x.ini;
      if (x.fim > max) max = x.fim;
    }
    const hoje = new Date(); hoje.setHours(12, 0, 0, 0);
    if (hoje < min) min = hoje;
    if (hoje > max) max = hoje;
    // 3 dias de folga de cada lado
    const ini0 = new Date(min.getTime() - 3 * DIA);
    const dias = Math.ceil((max.getTime() - ini0.getTime()) / DIA) + 6;
    // Ordena por início
    cd.sort((a, b) => a.ini - b.ini);
    return { comData: cd, semData: sd, inicio: ini0, totalDias: dias };
  }, [quadro.cards]);

  const larguraDia = LARGURA_DIA * escala;
  const W = L + totalDias * larguraDia;
  const H = comData.length * ALT_LINHA + 30;

  const xDe = (d) => L + ((d.getTime() - inicio.getTime()) / DIA) * larguraDia;
  const hoje = new Date(); hoje.setHours(12, 0, 0, 0);

  // Marcas de semana no eixo
  const marcas = [];
  for (let i = 0; i <= totalDias; i += 7) {
    const d = new Date(inicio.getTime() + i * DIA);
    marcas.push({ x: L + i * larguraDia, label: d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' }) });
  }

  return (
    <div className="p-4">
      <div className="mb-2 flex items-center gap-2">
        <span className="text-xs text-slate-500">Escala:</span>
        <div className="inline-flex rounded-lg border border-slate-300 bg-white p-0.5">
          {[{ v: 1, n: 'Dia' }, { v: 0.5, n: 'Semana' }, { v: 0.28, n: 'Mês' }].map((o) => (
            <button
              key={o.v}
              type="button"
              onClick={() => setEscala(o.v)}
              className={[
                'rounded-md px-2 py-0.5 text-xs font-medium',
                escala === o.v ? 'bg-nexus-700 text-white' : 'text-slate-600 hover:bg-slate-50',
              ].join(' ')}
            >
              {o.n}
            </button>
          ))}
        </div>
      </div>

      {comData.length === 0 ? (
        <div className="rounded-lg border border-dashed border-slate-300 bg-white px-3 py-6 text-center text-xs text-slate-400">
          Nenhum card tem data de início ou prazo. A timeline não inventa datas.
        </div>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-slate-200 bg-white">
          <svg width={W} height={H} role="img" aria-label="Timeline dos cards">
            {/* grade de semanas */}
            {marcas.map((m) => (
              <g key={m.x}>
                <line x1={m.x} y1={24} x2={m.x} y2={H} stroke="#f1f5f9" strokeWidth="1" />
                <text x={m.x + 2} y={16} fontSize="9" fill="#94a3b8">{m.label}</text>
              </g>
            ))}

            {/* linha de HOJE */}
            {hoje >= inicio && (
              <line
                x1={xDe(hoje)}
                y1={20}
                x2={xDe(hoje)}
                y2={H}
                stroke="#dc2626"
                strokeWidth="1.5"
                strokeDasharray="3 2"
              />
            )}

            {comData.map((x, i) => {
              const y = 30 + i * ALT_LINHA;
              const x1 = xDe(x.ini);
              const largura = Math.max(larguraDia * 0.8, xDe(x.fim) + larguraDia - x1);
              const atrasado = x.fim < hoje && !x.card.prazo_concluido
                && colunaPorId[x.card.coluna_id]?.tipo !== 'concluida';
              const concl = colunaPorId[x.card.coluna_id]?.tipo === 'concluida';
              const prio = prioridadeDe(x.card.prioridade);
              const fill = concl ? '#10b981' : atrasado ? '#dc2626' : corForteHex(x.card);

              return (
                <g key={x.card.id} className="cursor-pointer" onClick={() => onAbrirCard(x.card.id)}>
                  <text x={6} y={y + 15} fontSize="11" fill="#334155" clipPath="url(#clipTitulo)">
                    {truncar(x.card.titulo, 30)}
                  </text>
                  <rect x={0} y={y + 3} width={L - 6} height={ALT_LINHA - 6} fill="transparent" />
                  <rect
                    x={x1}
                    y={y + 4}
                    width={largura}
                    height={ALT_LINHA - 10}
                    rx="4"
                    fill={fill}
                    fillOpacity="0.9"
                  >
                    <title>
                      {x.card.titulo}
                      {'\n'}{x.ini.toLocaleDateString('pt-BR')} → {x.fim.toLocaleDateString('pt-BR')}
                      {atrasado ? '\n(atrasado)' : ''}
                    </title>
                  </rect>
                  {Number(x.card.prioridade ?? 2) <= 1 && (
                    <text x={x1 + 4} y={y + 16} fontSize="8" fontWeight="700" fill="#fff">
                      {prio.sigla}
                    </text>
                  )}
                </g>
              );
            })}
          </svg>
        </div>
      )}

      {semData.length > 0 && (
        <div className="mt-3">
          <div className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-slate-400">
            Sem cronograma ({semData.length})
          </div>
          <div className="flex flex-wrap gap-1.5">
            {semData.map((c) => (
              <button
                key={c.id}
                type="button"
                onClick={() => onAbrirCard(c.id)}
                className="truncate rounded-full border border-slate-200 bg-white px-2 py-0.5 text-[11px] text-slate-600 hover:border-nexus-300 hover:text-nexus-700"
              >
                {truncar(c.titulo, 30)}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function corForteHex(card) {
  // Usa a capa se houver; senão, um cinza-azulado neutro.
  const mapa = {
    red: '#f87171', orange: '#fb923c', amber: '#fbbf24', yellow: '#facc15',
    lime: '#a3e635', emerald: '#34d399', teal: '#2dd4bf', cyan: '#22d3ee',
    blue: '#60a5fa', indigo: '#818cf8', violet: '#a78bfa', fuchsia: '#e879f9',
    pink: '#f472b6', rose: '#fb7185', slate: '#94a3b8',
  };
  return mapa[card.capa_cor] || '#38bdf8';
}

function truncar(s, n) {
  return s.length > n ? s.slice(0, n - 1) + '…' : s;
}
