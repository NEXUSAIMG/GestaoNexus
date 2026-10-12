import { useState } from 'react';
import {
  ArrowRight, ArrowDown, Phone, MessageCircle, Mail, CalendarCheck, Rocket, FileSignature,
  BadgeCheck, XCircle, UserPlus, Search, Wallet, Sun, Coffee, Moon, Users,
} from 'lucide-react';
import { GUIA_ETAPAS } from './guia.js';

/**
 * Processo comercial desenhado (Sprint 42C).
 *
 *   <MapaProcesso />  — as etapas como um fluxo, com o que faz passar de uma
 *                       para a outra, quantos cartórios há em cada uma agora e,
 *                       ao clicar, o que fazer naquela etapa.
 *   <LinhaCadencia /> — os 8 toques em 12 dias úteis
 *   <LinhaTrial />    — os 14 dias do trial com os marcos
 *   <DiaDaEquipe />   — a rotina do dia e da semana
 *   <OndeEsta etapa/> — "você está aqui", dentro da ficha do cartório
 */

const PASSOS = [
  { k: 'prospect', icone: UserPlus, cor: 'slate' },
  { k: 'cadencia', icone: Phone, cor: 'sky', porta: 'começou os contatos' },
  { k: 'diagnostico', icone: Search, cor: 'indigo', porta: 'agendou a reunião' },
  { k: 'qualificado', icone: CalendarCheck, cor: 'violet', porta: 'reunião feita + diagnóstico preenchido' },
  { k: 'trial', icone: Rocket, cor: 'amber', porta: 'meta de sucesso + ativação agendada' },
  { k: 'proposta', icone: FileSignature, cor: 'orange', porta: 'proposta registrada' },
  { k: 'ganho', icone: BadgeCheck, cor: 'emerald', porta: 'cliente assinou' },
];

const COR = {
  slate: 'border-slate-300 bg-slate-50 text-slate-700',
  sky: 'border-sky-300 bg-sky-50 text-sky-800',
  indigo: 'border-indigo-300 bg-indigo-50 text-indigo-800',
  violet: 'border-violet-300 bg-violet-50 text-violet-800',
  amber: 'border-amber-300 bg-amber-50 text-amber-800',
  orange: 'border-orange-300 bg-orange-50 text-orange-800',
  emerald: 'border-emerald-300 bg-emerald-50 text-emerald-800',
};
const ANEL = {
  slate: 'ring-slate-400', sky: 'ring-sky-500', indigo: 'ring-indigo-500', violet: 'ring-violet-500',
  amber: 'ring-amber-500', orange: 'ring-orange-500', emerald: 'ring-emerald-500',
};

function Porta({ texto, vertical = false }) {
  return (
    <div className={`flex shrink-0 items-center justify-center ${vertical ? 'flex-col py-1' : 'w-24 flex-col px-1'}`}>
      {vertical ? <ArrowDown size={18} className="text-slate-400" /> : <ArrowRight size={18} className="text-slate-400" />}
      <span className={`text-center text-[10px] leading-tight text-slate-500 ${vertical ? 'mt-0.5' : 'mt-1'}`}>{texto}</span>
    </div>
  );
}

export function MapaProcesso({ cfg, porEtapa = null, compacto = false }) {
  const [sel, setSel] = useState(null);
  const nome = (k) => cfg.etapas.find((e) => e.k === k)?.n || k;
  const sla = (k) => cfg.etapas.find((e) => e.k === k)?.sla;
  const g = sel ? GUIA_ETAPAS[sel] : null;
  const selPasso = PASSOS.find((p) => p.k === sel);

  const No = ({ p }) => {
    const Icone = p.icone;
    const ativo = sel === p.k;
    return (
      <button type="button" onClick={() => setSel(ativo ? null : p.k)} aria-pressed={ativo}
        className={`flex h-full w-full flex-col items-start gap-1 rounded-lg border-2 p-2.5 text-left transition hover:shadow-md ${COR[p.cor]} ${ativo ? 'ring-2 ring-offset-2 ' + ANEL[p.cor] : ''}`}>
        <span className="flex w-full items-center justify-between">
          <Icone size={18} />
          {porEtapa && <span className="rounded-full bg-white/80 px-1.5 text-xs font-semibold tabular-nums">{porEtapa[p.k] ?? 0}</span>}
        </span>
        <b className="text-sm leading-tight">{nome(p.k)}</b>
        {sla(p.k) ? <span className="text-[11px] opacity-80">até {sla(p.k)} dias</span> : <span className="text-[11px] opacity-80">&nbsp;</span>}
        {p.porta && <span className="mt-auto border-t border-current/20 pt-1 text-[10px] leading-tight opacity-90"><b>entra quando:</b> {p.porta}</span>}
      </button>
    );
  };

  return (
    <div className="space-y-3">
      {/* Telas largas: fluxo horizontal (as caixas dividem a largura) */}
      <div className="hidden items-stretch gap-0.5 md:flex">
        {PASSOS.map((p, i) => (
          <div key={p.k} className="flex min-w-0 flex-1 items-center gap-0.5">
            {i > 0 && <ArrowRight size={16} className="shrink-0 text-slate-400" />}
            <div className="h-full min-w-0 flex-1"><No p={p} /></div>
          </div>
        ))}
        <div className="flex min-w-0 flex-1 items-center gap-0.5">
          <ArrowRight size={16} className="shrink-0 text-slate-400" />
          <div className="flex h-full min-w-0 flex-1 flex-col items-start gap-1 rounded-lg border-2 border-emerald-600 bg-emerald-600 p-2.5 text-white">
            <Wallet size={18} />
            <b className="text-sm leading-tight">Cliente pago</b>
            <span className="text-[11px] opacity-90">conta na meta</span>
            <span className="mt-auto border-t border-white/30 pt-1 text-[10px] leading-tight"><b>entra quando:</b> o 1º pagamento entrou</span>
          </div>
        </div>
      </div>
      {/* Celular: fluxo vertical */}
      <div className="md:hidden">
        {PASSOS.map((p, i) => (
          <div key={p.k}>
            {i > 0 && <div className="flex justify-center py-1"><ArrowDown size={16} className="text-slate-400" /></div>}
            <No p={p} />
          </div>
        ))}
        <Porta texto="1º pagamento entrou" vertical />
        <div className="rounded-lg border-2 border-emerald-600 bg-emerald-600 p-3 text-white"><b className="text-sm">Cliente pago</b> — conta na meta</div>
      </div>

      <div className="flex items-start gap-2 rounded-md border border-dashed border-red-200 bg-red-50/50 px-3 py-2 text-xs text-red-800">
        <XCircle size={15} className="mt-0.5 shrink-0" />
        <span><b>Perdido</b> pode acontecer em qualquer etapa — sempre com o motivo. {porEtapa ? `Hoje: ${porEtapa.perdido ?? 0}.` : ''} Para reabrir, mude a etapa e justifique.</span>
      </div>

      {!compacto && (
        g ? (
          <div className={`rounded-lg border-2 p-4 text-sm ${COR[selPasso?.cor || 'slate']}`}>
            <p className="text-base font-semibold">{nome(sel)}</p>
            <p className="mt-1 text-slate-700">{g.objetivo}</p>
            <p className="mt-3 text-xs font-semibold uppercase tracking-wide text-slate-500">O que fazer</p>
            <ol className="ml-5 mt-1 list-decimal space-y-1 text-slate-800">{g.fazer.map((f) => <li key={f}>{f}</li>)}</ol>
            <p className="mt-3 text-slate-700"><b>Avança quando:</b> {g.avancar}</p>
            {g.prazo !== '—' && <p className="text-slate-700"><b>Prazo:</b> {g.prazo}</p>}
          </div>
        ) : (
          <p className="text-sm text-slate-500">Clique numa etapa para ver o que fazer nela. {porEtapa ? 'O número em cada caixa é quantos cartórios estão lá agora.' : ''}</p>
        )
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Linhas do tempo
// ---------------------------------------------------------------------------
const ICONE_CANAL = (canal) => (/e-?mail/i.test(canal) ? Mail : /whats/i.test(canal) && !/liga/i.test(canal) ? MessageCircle : Phone);

export function LinhaCadencia({ cfg }) {
  const dias = Array.from({ length: 12 }, (_, i) => i + 1);
  return (
    <div className="space-y-2">
      <div className="overflow-x-auto pb-1">
        <div className="relative grid min-w-[420px] grid-cols-12 gap-0.5">
          <div className="absolute left-0 right-0 top-[14px] h-0.5 bg-slate-200" />
          {dias.map((d) => {
            const t = cfg.cadencia.find((c) => c.d === d);
            const Icone = t ? ICONE_CANAL(t.canal) : null;
            return (
              <div key={d} className="relative flex flex-col items-center gap-1 text-center">
                <span className={`z-10 flex h-7 w-7 items-center justify-center rounded-full border-2 ${t ? 'border-sky-500 bg-white text-sky-700' : 'border-slate-200 bg-slate-50 text-slate-300'}`}>
                  {Icone ? <Icone size={13} /> : <span className="text-[9px]">·</span>}
                </span>
                <span className="text-[10px] font-semibold text-slate-600">{d}</span>
                {t && <span className="break-words text-[9px] leading-tight text-slate-500">{t.canal.replace('Ligação + WhatsApp', 'Lig. + Whats').replace('Ligação', 'Ligação').replace('WhatsApp', 'Whats')}</span>}
              </div>
            );
          })}
        </div>
      </div>
      <p className="text-xs text-slate-500">Dias úteis (feriados não contam). Um toque por dia marcado; o sistema mostra cada um em Hoje. Atendeu e topou conversar em qualquer dia? Registre “Agendou reunião” e a cadência para.</p>
    </div>
  );
}

export function LinhaTrial({ cfg }) {
  return (
    <div className="space-y-2">
      <div className="overflow-x-auto pb-1">
        <div className="relative min-w-[420px] pt-2">
          <div className="absolute left-6 right-6 top-[26px] h-1 rounded bg-gradient-to-r from-amber-200 via-amber-300 to-emerald-300" />
          <div className="relative grid grid-cols-6 gap-1">
            {cfg.marcos_trial.map((m) => (
              <div key={m.d} className="flex flex-col items-center gap-1 text-center">
                <span className="z-10 flex h-9 w-9 items-center justify-center rounded-full border-2 border-amber-500 bg-white text-xs font-bold text-amber-700">D{m.d}</span>
                <span className="text-[11px] font-semibold leading-tight text-slate-700">{m.n}</span>
                <span className="text-[10px] leading-tight text-slate-500">{m.acao}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
      <p className="text-xs text-slate-500">Dias corridos a partir da ativação. No D3 confira a pontuação de uso: 60+ no caminho, abaixo de 40 ligue no mesmo dia. No D7 a reunião de resultado vira proposta.</p>
    </div>
  );
}

export function DiaDaEquipe() {
  const dia = [
    { h: '8h30', icone: Sun, t: 'Abertura', d: 'Cada pessoa abre o Hoje. A gestão faz a 1ª checagem.' },
    { h: 'manhã', icone: Phone, t: 'Bloco de contatos', d: 'Reuniões e desfechos primeiro; depois marcos de trial e toques de cadência.' },
    { h: '12h30', icone: Coffee, t: 'Meio do dia', d: '2ª checagem. Quem está no amarelo ou vermelho combina o que destravar.' },
    { h: 'tarde', icone: MessageCircle, t: 'Reuniões e retornos', d: 'Diagnósticos, ativações, propostas e próximos passos do dia.' },
    { h: '17h', icone: Moon, t: 'Fechamento', d: '3ª checagem. Meta: lista do Hoje vazia e todo cartório em negociação com próximo passo datado.' },
  ];
  return (
    <div className="space-y-3">
      <ol className="relative space-y-3 border-l-2 border-nexus-200 pl-5">
        {dia.map((x) => {
          const Icone = x.icone;
          return (
            <li key={x.t} className="relative">
              <span className="absolute -left-[31px] flex h-6 w-6 items-center justify-center rounded-full border-2 border-nexus-300 bg-white text-nexus-700"><Icone size={12} /></span>
              <p className="text-sm"><b className="mr-2 font-mono text-nexus-800">{x.h}</b><b>{x.t}</b></p>
              <p className="text-xs text-slate-600">{x.d}</p>
            </li>
          );
        })}
      </ol>
      <p className="flex items-start gap-2 rounded-md bg-slate-50 p-2 text-xs text-slate-600"><Users size={14} className="mt-0.5 shrink-0" /><span><b>Sexta-feira:</b> 1:1 de cada pessoa com a gestão — números da semana (Placar), bloqueios e plano de ação com prazo.</span></p>
    </div>
  );
}

/** Mini-mapa dentro da ficha: mostra onde o cartório está no processo. */
export function OndeEsta({ cfg, etapa }) {
  const idx = PASSOS.findIndex((p) => p.k === etapa);
  if (etapa === 'perdido') {
    return <p className="flex items-center gap-1.5 text-xs text-red-700"><XCircle size={14} /> Negociação encerrada (perdido).</p>;
  }
  return (
    <div aria-label="Onde este cartório está no processo">
      <div className="flex items-center gap-0.5">
        {PASSOS.map((p, i) => (
          <div key={p.k} title={cfg.etapas.find((e) => e.k === p.k)?.n}
            className={`h-1.5 flex-1 rounded-full ${i < idx ? 'bg-nexus-400' : i === idx ? 'bg-nexus-700' : 'bg-slate-200'}`} />
        ))}
      </div>
      <p className="mt-1 text-[11px] text-slate-500">
        Etapa {idx + 1} de {PASSOS.length}: <b className="text-slate-700">{cfg.etapas.find((e) => e.k === etapa)?.n}</b>
        {idx < PASSOS.length - 1 && <> · próxima: {cfg.etapas.find((e) => e.k === PASSOS[idx + 1].k)?.n}</>}
      </p>
    </div>
  );
}

/** Aba "Processo": o mapa + as linhas do tempo + a rotina. */
export function VistaProcesso({ cfg, painel }) {
  return (
    <div className="space-y-6">
      <section className="space-y-3 rounded-lg border border-slate-200 bg-white p-4">
        <h2 className="text-base font-semibold text-slate-900">O caminho de um cartório até virar cliente</h2>
        <p className="text-sm text-slate-600">Cada caixa é uma etapa. Em cada caixa, “entra quando” mostra o que faz o cartório chegar ali — o sistema só deixa avançar quando isso foi registrado.</p>
        <MapaProcesso cfg={cfg} porEtapa={painel?.numeros?.por_etapa} />
      </section>
      <div className="grid gap-4 xl:grid-cols-2">
        <section className="space-y-3 rounded-lg border border-slate-200 bg-white p-4">
          <h2 className="text-base font-semibold text-slate-900">Cadência: 8 toques em 12 dias úteis</h2>
          <p className="text-sm text-slate-600">Etapa “Em cadência”. Objetivo: conseguir a reunião de diagnóstico.</p>
          <LinhaCadencia cfg={cfg} />
        </section>
        <section className="space-y-3 rounded-lg border border-slate-200 bg-white p-4">
          <h2 className="text-base font-semibold text-slate-900">Trial guiado: 14 dias</h2>
          <p className="text-sm text-slate-600">Etapa “Trial guiado”. Objetivo: o cartório usar de verdade e ver resultado.</p>
          <LinhaTrial cfg={cfg} />
        </section>
      </div>
      <section className="space-y-3 rounded-lg border border-slate-200 bg-white p-4">
        <h2 className="text-base font-semibold text-slate-900">O dia da equipe</h2>
        <DiaDaEquipe />
      </section>
    </div>
  );
}
