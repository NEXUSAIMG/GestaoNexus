import { useEffect, useMemo, useRef } from 'react';
import { Repeat } from 'lucide-react';

/**
 * Timeline diária/semanal — Sprint 24B.
 *
 * Componente unificado que renderiza 1 dia ou 7 dias (semana) com
 * eixo vertical de hora (0h–23h). Estilo Google Agenda.
 *
 * Props:
 *   dias: Date[] — array de 1 a 7 datas (cada uma representa um dia).
 *   eventos: lista no mesmo formato do CalendarioMensal.
 *   aoClicarSlot: (dataISO, hora, minutos) => void — click em slot vazio.
 *   aoClicarEvento: (evento) => void.
 *
 * Decisões:
 *   - 24h visíveis, scroll automático pra 8h ao montar.
 *   - Eventos "dia inteiro" ficam numa faixa no topo (igual Google).
 *   - Cor: e.cor (custom) > e.tipo > fallback 'outro' (mesma lógica do mensal).
 *   - Click em slot vazio faz snap pra 15min mais próximo.
 *   - Sem detecção de overlap (eventos sobrepostos ficam empilhados via z-index).
 */

const ALTURA_HORA = 48; // px
const HORAS_VISIVEIS = 24;

const NOMES_DIAS_CURTOS = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];
const NOMES_MES_CURTOS = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'];

const CORES_TIPO = {
  reuniao:               { bg: 'bg-sky-100',     texto: 'text-sky-800',     barra: 'bg-sky-500',     border: 'border-sky-500' },
  vencimento_legal:      { bg: 'bg-red-100',     texto: 'text-red-800',     barra: 'bg-red-500',     border: 'border-red-500' },
  pagamento_importante:  { bg: 'bg-amber-100',   texto: 'text-amber-800',   barra: 'bg-amber-500',   border: 'border-amber-500' },
  deadline:              { bg: 'bg-red-100',     texto: 'text-red-800',     barra: 'bg-red-500',     border: 'border-red-500' },
  marco:                 { bg: 'bg-violet-100',  texto: 'text-violet-800',  barra: 'bg-violet-500',  border: 'border-violet-500' },
  card:                  { bg: 'bg-emerald-100', texto: 'text-emerald-800', barra: 'bg-emerald-500', border: 'border-emerald-500' },
  outro:                 { bg: 'bg-slate-100',   texto: 'text-slate-800',   barra: 'bg-slate-400',   border: 'border-slate-400' },
};

const CORES_CUSTOM = {
  slate:   { bg: 'bg-slate-100',   texto: 'text-slate-800',   barra: 'bg-slate-500',   border: 'border-slate-500' },
  red:     { bg: 'bg-red-100',     texto: 'text-red-800',     barra: 'bg-red-500',     border: 'border-red-500' },
  orange:  { bg: 'bg-orange-100',  texto: 'text-orange-800',  barra: 'bg-orange-500',  border: 'border-orange-500' },
  amber:   { bg: 'bg-amber-100',   texto: 'text-amber-800',   barra: 'bg-amber-500',   border: 'border-amber-500' },
  yellow:  { bg: 'bg-yellow-100',  texto: 'text-yellow-800',  barra: 'bg-yellow-500',  border: 'border-yellow-500' },
  lime:    { bg: 'bg-lime-100',    texto: 'text-lime-800',    barra: 'bg-lime-500',    border: 'border-lime-500' },
  emerald: { bg: 'bg-emerald-100', texto: 'text-emerald-800', barra: 'bg-emerald-500', border: 'border-emerald-500' },
  teal:    { bg: 'bg-teal-100',    texto: 'text-teal-800',    barra: 'bg-teal-500',    border: 'border-teal-500' },
  cyan:    { bg: 'bg-cyan-100',    texto: 'text-cyan-800',    barra: 'bg-cyan-500',    border: 'border-cyan-500' },
  blue:    { bg: 'bg-blue-100',    texto: 'text-blue-800',    barra: 'bg-blue-500',    border: 'border-blue-500' },
  indigo:  { bg: 'bg-indigo-100',  texto: 'text-indigo-800',  barra: 'bg-indigo-500',  border: 'border-indigo-500' },
  violet:  { bg: 'bg-violet-100',  texto: 'text-violet-800',  barra: 'bg-violet-500',  border: 'border-violet-500' },
  fuchsia: { bg: 'bg-fuchsia-100', texto: 'text-fuchsia-800', barra: 'bg-fuchsia-500', border: 'border-fuchsia-500' },
  pink:    { bg: 'bg-pink-100',    texto: 'text-pink-800',    barra: 'bg-pink-500',    border: 'border-pink-500' },
  rose:    { bg: 'bg-rose-100',    texto: 'text-rose-800',    barra: 'bg-rose-500',    border: 'border-rose-500' },
};

function ymd(d) {
  const ano = d.getFullYear();
  const mes = String(d.getMonth() + 1).padStart(2, '0');
  const dia = String(d.getDate()).padStart(2, '0');
  return `${ano}-${mes}-${dia}`;
}

function getCor(evento) {
  return (evento.cor && CORES_CUSTOM[evento.cor])
    || CORES_TIPO[evento.tipo]
    || CORES_TIPO.outro;
}

function formatarHora(d) {
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

export default function CalendarioTimeline({ dias, eventos = [], aoClicarSlot, aoClicarEvento }) {
  const scrollRef = useRef(null);
  const hojeISO = ymd(new Date());

  // Auto-scroll pra 8h ao montar (uma vez só)
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = 8 * ALTURA_HORA;
    }
  }, []);

  // Agrupa eventos por dia, separando dia-inteiro de com-hora
  const porDia = useMemo(() => {
    const m = new Map();
    for (const d of dias) m.set(ymd(d), { diaInteiro: [], comHora: [] });
    for (const e of eventos) {
      const iso = String(e.data_inicio).slice(0, 10);
      const bucket = m.get(iso);
      if (!bucket) continue;
      if (e.dia_inteiro) bucket.diaInteiro.push(e);
      else bucket.comHora.push(e);
    }
    return m;
  }, [dias, eventos]);

  const temAlgumDiaInteiro = useMemo(() => {
    for (const val of porDia.values()) {
      if (val.diaInteiro.length > 0) return true;
    }
    return false;
  }, [porDia]);

  return (
    <div className="rounded-xl border border-slate-200 bg-white shadow-sm overflow-hidden">
      {/* Header dos dias */}
      <div className="flex border-b border-slate-200 bg-slate-50">
        <div className="w-14 shrink-0" /> {/* gutter da coluna de hora */}
        {dias.map((d) => {
          const iso = ymd(d);
          const ehHoje = iso === hojeISO;
          const ehFimDeSemana = d.getDay() === 0 || d.getDay() === 6;
          return (
            <div key={iso} className="flex-1 min-w-0 border-l border-slate-200 px-2 py-2 text-center">
              <div className="text-[10px] uppercase font-semibold text-slate-500 tracking-wider">
                {NOMES_DIAS_CURTOS[d.getDay()]}
              </div>
              <div className={[
                'mt-0.5 inline-flex h-7 min-w-7 items-center justify-center px-1 text-sm font-medium tabular-nums',
                ehHoje
                  ? 'rounded-full bg-nexus-700 text-white'
                  : ehFimDeSemana
                    ? 'text-slate-500'
                    : 'text-slate-900',
              ].join(' ')}
                title={`${d.getDate()} de ${NOMES_MES_CURTOS[d.getMonth()]}`}
              >
                {d.getDate()}
              </div>
            </div>
          );
        })}
      </div>

      {/* Faixa Dia inteiro */}
      {temAlgumDiaInteiro && (
        <div className="flex border-b border-slate-200 bg-slate-50/50">
          <div className="w-14 shrink-0 flex items-center justify-center px-1 py-1 text-[9px] uppercase text-slate-500 font-semibold leading-tight text-center">
            Dia<br />inteiro
          </div>
          {dias.map((d) => {
            const iso = ymd(d);
            const lista = porDia.get(iso)?.diaInteiro || [];
            return (
              <div key={iso} className="flex-1 min-w-0 border-l border-slate-200 px-1 py-1 space-y-0.5">
                {lista.map((e) => {
                  const cor = getCor(e);
                  return (
                    <button
                      key={`${e.id}-${e.data_inicio}-allday`}
                      type="button"
                      onClick={() => aoClicarEvento && aoClicarEvento(e)}
                      className={[
                        'w-full truncate rounded px-1.5 py-0.5 text-left text-[11px] font-medium hover:brightness-95',
                        cor.bg, cor.texto,
                      ].join(' ')}
                      title={e.titulo}
                    >
                      {e.titulo}
                      {e.recorrencia_tipo && <Repeat size={9} className="ml-1 inline opacity-60" />}
                    </button>
                  );
                })}
              </div>
            );
          })}
        </div>
      )}

      {/* Timeline scrollável */}
      <div
        ref={scrollRef}
        className="flex overflow-y-auto"
        style={{ maxHeight: '60vh' }}
      >
        {/* Coluna de horas (gutter esquerdo) */}
        <div className="w-14 shrink-0">
          {Array.from({ length: HORAS_VISIVEIS }).map((_, h) => (
            <div
              key={h}
              className="relative border-b border-slate-100"
              style={{ height: ALTURA_HORA }}
            >
              {h > 0 && (
                <span className="absolute -top-2 right-2 text-[10px] text-slate-400 tabular-nums">
                  {String(h).padStart(2, '0')}h
                </span>
              )}
            </div>
          ))}
        </div>

        {/* Colunas dos dias */}
        {dias.map((d) => {
          const iso = ymd(d);
          const ehHoje = iso === hojeISO;
          const eventosDoDia = porDia.get(iso)?.comHora || [];
          return (
            <ColunaTimeline
              key={iso}
              dataISO={iso}
              ehHoje={ehHoje}
              eventos={eventosDoDia}
              aoClicarSlot={aoClicarSlot}
              aoClicarEvento={aoClicarEvento}
            />
          );
        })}
      </div>
    </div>
  );
}

function ColunaTimeline({ dataISO, ehHoje, eventos, aoClicarSlot, aoClicarEvento }) {
  function aoClicarVazio(e) {
    if (!aoClicarSlot) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const y = e.clientY - rect.top;
    const horaDecimal = y / ALTURA_HORA;
    const hora = Math.max(0, Math.min(23, Math.floor(horaDecimal)));
    // snap pra 15 min
    const minutosBruto = (horaDecimal - hora) * 60;
    const minutos = Math.max(0, Math.min(45, Math.floor(minutosBruto / 15) * 15));
    aoClicarSlot(dataISO, hora, minutos);
  }

  return (
    <div
      className={[
        'relative flex-1 min-w-0 border-l border-slate-200',
        ehHoje ? 'bg-nexus-50/30' : '',
        aoClicarSlot ? 'cursor-pointer hover:bg-slate-50/30' : '',
      ].join(' ')}
      style={{ height: HORAS_VISIVEIS * ALTURA_HORA }}
      onClick={aoClicarVazio}
    >
      {/* Linhas horizontais de hora (fundo) */}
      {Array.from({ length: HORAS_VISIVEIS }).map((_, h) => (
        <div
          key={h}
          className="border-b border-slate-100"
          style={{ height: ALTURA_HORA }}
        />
      ))}

      {/* Eventos posicionados absolutamente */}
      {eventos.map((e) => {
        const inicio = new Date(e.data_inicio);
        const fim = e.data_fim ? new Date(e.data_fim) : null;
        const horaInicio = inicio.getHours() + inicio.getMinutes() / 60;
        // Default 1h se sem fim
        const horaFim = fim ? (fim.getHours() + fim.getMinutes() / 60) : horaInicio + 1;
        const duracaoH = Math.max(0.4, horaFim - horaInicio); // mínimo pra ficar clicável
        const top = horaInicio * ALTURA_HORA;
        const altura = duracaoH * ALTURA_HORA;
        const cor = getCor(e);
        return (
          <button
            key={`${e.id}-${e.data_inicio}`}
            type="button"
            onClick={(ev) => {
              ev.stopPropagation();
              aoClicarEvento && aoClicarEvento(e);
            }}
            className={[
              'absolute left-0.5 right-0.5 rounded px-1.5 py-0.5 text-left text-[11px] font-medium overflow-hidden border-l-2 hover:brightness-95 hover:z-10',
              cor.bg, cor.texto, cor.border,
            ].join(' ')}
            style={{ top, height: altura }}
            title={`${e.titulo}${fim ? ` (${formatarHora(inicio)} – ${formatarHora(fim)})` : ` (${formatarHora(inicio)})`}`}
          >
            <div className="flex items-center gap-1 tabular-nums text-[10px] opacity-70 leading-tight">
              {formatarHora(inicio)}{fim ? ` – ${formatarHora(fim)}` : ''}
              {e.recorrencia_tipo && <Repeat size={9} className="inline opacity-60" />}
            </div>
            <div className="truncate font-semibold leading-tight">{e.titulo}</div>
          </button>
        );
      })}
    </div>
  );
}
