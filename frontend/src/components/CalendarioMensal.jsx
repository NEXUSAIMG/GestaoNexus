import { useMemo, useState } from 'react';
import { Repeat } from 'lucide-react';

/**
 * Calendário mensal estilo Google Calendar — Sprint 6.
 *
 * Grid 7 colunas (dom-sáb) × 6 linhas. Cada célula é um dia, com:
 *   - Número do dia no canto superior
 *   - Lista de eventos (chips coloridos)
 *   - Dias do mês anterior/próximo aparecem cinzas
 *   - Hoje é destacado
 *   - Click numa célula chama `aoClicarDia(dataISO)` (criar evento no dia)
 *   - Click num evento chama `aoClicarEvento(evento)`
 *
 * Sprint 9: drag & drop opcional. Se `aoMoverEvento` é passado, cada chip
 * vira arrastável e cada célula vira drop target. O callback recebe
 * `(evento, novaDataYMD)` e o pai decide o que fazer (PUT, etc).
 *
 * Sprint 24: cada evento pode ter `cor` customizada (token da paleta).
 * Se presente, ganha precedência sobre a cor por tipo.
 */

const NOMES_DIAS = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];

const CORES_TIPO = {
  reuniao:               { bg: 'bg-sky-100',     texto: 'text-sky-800',     barra: 'bg-sky-500' },
  vencimento_legal:      { bg: 'bg-red-100',     texto: 'text-red-800',     barra: 'bg-red-500' },
  pagamento_importante:  { bg: 'bg-amber-100',   texto: 'text-amber-800',   barra: 'bg-amber-500' },
  // Sprint 11 — tipos do calendário do quadro
  deadline:              { bg: 'bg-red-100',     texto: 'text-red-800',     barra: 'bg-red-500' },
  marco:                 { bg: 'bg-violet-100',  texto: 'text-violet-800',  barra: 'bg-violet-500' },
  card:                  { bg: 'bg-emerald-100', texto: 'text-emerald-800', barra: 'bg-emerald-500' },
  outro:                 { bg: 'bg-slate-100',   texto: 'text-slate-800',   barra: 'bg-slate-400' },
};

// Sprint 24 — cor customizada por evento (e.cor). Tem precedência sobre o tipo.
const CORES_CUSTOM = {
  slate:   { bg: 'bg-slate-100',   texto: 'text-slate-800',   barra: 'bg-slate-500' },
  red:     { bg: 'bg-red-100',     texto: 'text-red-800',     barra: 'bg-red-500' },
  orange:  { bg: 'bg-orange-100',  texto: 'text-orange-800',  barra: 'bg-orange-500' },
  amber:   { bg: 'bg-amber-100',   texto: 'text-amber-800',   barra: 'bg-amber-500' },
  yellow:  { bg: 'bg-yellow-100',  texto: 'text-yellow-800',  barra: 'bg-yellow-500' },
  lime:    { bg: 'bg-lime-100',    texto: 'text-lime-800',    barra: 'bg-lime-500' },
  emerald: { bg: 'bg-emerald-100', texto: 'text-emerald-800', barra: 'bg-emerald-500' },
  teal:    { bg: 'bg-teal-100',    texto: 'text-teal-800',    barra: 'bg-teal-500' },
  cyan:    { bg: 'bg-cyan-100',    texto: 'text-cyan-800',    barra: 'bg-cyan-500' },
  blue:    { bg: 'bg-blue-100',    texto: 'text-blue-800',    barra: 'bg-blue-500' },
  indigo:  { bg: 'bg-indigo-100',  texto: 'text-indigo-800',  barra: 'bg-indigo-500' },
  violet:  { bg: 'bg-violet-100',  texto: 'text-violet-800',  barra: 'bg-violet-500' },
  fuchsia: { bg: 'bg-fuchsia-100', texto: 'text-fuchsia-800', barra: 'bg-fuchsia-500' },
  pink:    { bg: 'bg-pink-100',    texto: 'text-pink-800',    barra: 'bg-pink-500' },
  rose:    { bg: 'bg-rose-100',    texto: 'text-rose-800',    barra: 'bg-rose-500' },
};

function ymd(d) {
  const ano = d.getFullYear();
  const mes = String(d.getMonth() + 1).padStart(2, '0');
  const dia = String(d.getDate()).padStart(2, '0');
  return `${ano}-${mes}-${dia}`;
}

export default function CalendarioMensal({
  ano, mes,
  eventos = [],
  aoClicarDia,
  aoClicarEvento,
  aoMoverEvento,    // Sprint 9 — ativa drag & drop quando presente
}) {
  const hojeISO = ymd(new Date());

  // Mapa id → evento, pra recuperar o evento completo no drop
  const eventosPorId = useMemo(() => {
    const m = new Map();
    for (const e of eventos) m.set(e.id, e);
    return m;
  }, [eventos]);

  const grid = useMemo(() => {
    const primeiro = new Date(ano, mes - 1, 1);
    const diaSemanaInicio = primeiro.getDay();
    const inicioGrid = new Date(primeiro);
    inicioGrid.setDate(primeiro.getDate() - diaSemanaInicio);

    const dias = [];
    for (let i = 0; i < 42; i++) {
      const d = new Date(inicioGrid);
      d.setDate(inicioGrid.getDate() + i);
      const iso = ymd(d);
      dias.push({
        data: d,
        iso,
        dia: d.getDate(),
        noMes: d.getMonth() === mes - 1,
        ehHoje: iso === hojeISO,
        ehFimDeSemana: d.getDay() === 0 || d.getDay() === 6,
      });
    }

    const porDia = new Map();
    for (const e of eventos) {
      const chave = String(e.data_inicio).slice(0, 10);
      if (!porDia.has(chave)) porDia.set(chave, []);
      porDia.get(chave).push(e);
    }
    for (const lista of porDia.values()) {
      lista.sort((a, b) => String(a.data_inicio).localeCompare(String(b.data_inicio)));
    }

    return dias.map((d) => ({
      ...d,
      eventos: porDia.get(d.iso) ?? [],
    }));
  }, [ano, mes, eventos, hojeISO]);

  return (
    <div className="rounded-xl border border-slate-200 bg-white shadow-sm overflow-hidden">
      {/* Cabeçalho dos dias da semana */}
      <div className="grid grid-cols-7 border-b border-slate-200 bg-slate-50">
        {NOMES_DIAS.map((nome, i) => (
          <div
            key={nome}
            className={[
              'px-2 py-2 text-center text-[10px] font-semibold uppercase tracking-wider',
              i === 0 || i === 6 ? 'text-slate-500' : 'text-slate-600',
            ].join(' ')}
          >
            {nome}
          </div>
        ))}
      </div>

      {/* Grid de dias */}
      <div className="grid grid-cols-7 grid-rows-6 border-l border-t border-slate-100">
        {grid.map((d) => (
          <CelulaDia
            key={d.iso}
            dia={d}
            aoClicarDia={aoClicarDia}
            aoClicarEvento={aoClicarEvento}
            aoMoverEvento={aoMoverEvento}
            eventosPorId={eventosPorId}
          />
        ))}
      </div>
    </div>
  );
}

function CelulaDia({ dia, aoClicarDia, aoClicarEvento, aoMoverEvento, eventosPorId }) {
  const visiveis = dia.eventos.slice(0, 3);
  const restantes = dia.eventos.length - visiveis.length;

  // Estado local pra destacar a célula durante o hover de drag
  const [arrastandoSobre, setArrastandoSobre] = useState(false);

  // Drag handlers da CÉLULA (drop target)
  function aoArrastarSobre(e) {
    if (!aoMoverEvento) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    if (!arrastandoSobre) setArrastandoSobre(true);
  }
  function aoSair() {
    if (arrastandoSobre) setArrastandoSobre(false);
  }
  function aoSoltar(e) {
    setArrastandoSobre(false);
    if (!aoMoverEvento) return;
    e.preventDefault();
    const id = e.dataTransfer.getData('text/eventoId');
    if (!id) return;
    const evento = eventosPorId.get(id);
    if (!evento) return;
    // Se a data não mudou, não faz nada
    if (String(evento.data_inicio).slice(0, 10) === dia.iso) return;
    aoMoverEvento(evento, dia.iso);
  }

  return (
    <div
      onClick={() => aoClicarDia && aoClicarDia(dia.iso)}
      onDragOver={aoArrastarSobre}
      onDragLeave={aoSair}
      onDrop={aoSoltar}
      className={[
        'group relative min-h-[110px] border-r border-b border-slate-100 p-1.5 transition-colors',
        aoClicarDia ? 'cursor-pointer hover:bg-slate-50' : '',
        !dia.noMes ? 'bg-slate-50/50' : '',
        arrastandoSobre ? 'ring-2 ring-nexus-400 ring-inset bg-nexus-50/60' : '',
      ].join(' ')}
    >
      <div className="flex items-start justify-between">
        <div
          className={[
            'inline-flex h-6 w-6 items-center justify-center text-xs font-medium tabular-nums',
            dia.ehHoje
              ? 'rounded-full bg-nexus-700 text-white'
              : !dia.noMes
                ? 'text-slate-300'
                : dia.ehFimDeSemana
                  ? 'text-slate-500'
                  : 'text-slate-700',
          ].join(' ')}
        >
          {dia.dia}
        </div>
      </div>

      <div className="mt-1 space-y-0.5">
        {visiveis.map((e) => {
          // Sprint 24: e.cor (customizado) ganha de e.tipo. Fallback final é 'outro'.
          const cor = (e.cor && CORES_CUSTOM[e.cor])
            || CORES_TIPO[e.tipo]
            || CORES_TIPO.outro;
          return (
            <button
              key={`${e.id}-${e.data_inicio}`}
              type="button"
              draggable={!!aoMoverEvento}
              onDragStart={(ev) => {
                if (!aoMoverEvento) return;
                ev.dataTransfer.setData('text/eventoId', e.id);
                ev.dataTransfer.effectAllowed = 'move';
              }}
              onClick={(ev) => {
                ev.stopPropagation();
                aoClicarEvento && aoClicarEvento(e);
              }}
              className={[
                'group/event w-full truncate rounded px-1.5 py-0.5 text-left text-[11px] font-medium',
                cor.bg, cor.texto,
                'hover:brightness-95',
                aoMoverEvento ? 'cursor-grab active:cursor-grabbing' : '',
              ].join(' ')}
              title={e.titulo}
            >
              {!e.dia_inteiro && (
                <span className="mr-1 tabular-nums opacity-70">
                  {formatarHora(e.data_inicio)}
                </span>
              )}
              {e.titulo}
              {e.recorrencia_tipo && (
                <Repeat
                  size={9}
                  className="ml-1 inline opacity-60"
                  aria-label="Evento recorrente"
                />
              )}
            </button>
          );
        })}
        {restantes > 0 && (
          <div className="px-1.5 text-[10px] text-slate-500 font-medium">
            +{restantes} mais
          </div>
        )}
      </div>
    </div>
  );
}

function formatarHora(dataIso) {
  if (!dataIso) return '';
  try {
    const d = new Date(dataIso);
    return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
  } catch { return ''; }
}
