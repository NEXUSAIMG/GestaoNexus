import { useState } from 'react';
import { Copy, Check, MapPin } from 'lucide-react';

/** Peças visuais da frente AdaptAI (Sprint 43). Cor da frente: violeta. */

export const COR_PRIO = {
  A: 'bg-violet-600 text-white',
  B: 'bg-violet-100 text-violet-800 ring-1 ring-inset ring-violet-200',
  C: 'bg-slate-100 text-slate-600 ring-1 ring-inset ring-slate-200',
};

export function Prioridade({ p, pontos, preliminar }) {
  if (!p) return null;
  return (
    <span title={`Nota ${pontos ?? '—'} de 10${preliminar ? ' (preliminar do plano)' : ''}`}
      className={`inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[11px] font-bold tabular-nums ${COR_PRIO[p]}`}>
      {p}<span className="font-medium opacity-80">{pontos ?? ''}</span>{preliminar ? <span className="font-normal opacity-70">*</span> : null}
    </span>
  );
}

const COR_ETAPA = {
  lista: 'bg-slate-100 text-slate-700', contato: 'bg-sky-50 text-sky-800', decisor: 'bg-sky-100 text-sky-900',
  qualificada: 'bg-indigo-50 text-indigo-800', demo: 'bg-violet-100 text-violet-900', proposta: 'bg-fuchsia-100 text-fuchsia-900',
  negociacao: 'bg-amber-100 text-amber-900', ganho: 'bg-emerald-100 text-emerald-800', parceiro_ativo: 'bg-emerald-100 text-emerald-800',
  perdido: 'bg-red-50 text-red-700', nutricao: 'bg-teal-50 text-teal-800',
  mapeamento: 'bg-slate-100 text-slate-700', apresentacao: 'bg-sky-100 text-sky-900', piloto_rede: 'bg-fuchsia-100 text-fuchsia-900',
  parecer: 'bg-indigo-50 text-indigo-800', contratacao: 'bg-amber-100 text-amber-900', oficina_parceiro: 'bg-violet-100 text-violet-900',
};
export function Etapa({ k, nome }) {
  return <span className={`inline-flex whitespace-nowrap rounded-full px-2 py-0.5 text-[11px] font-medium ${COR_ETAPA[k] || 'bg-slate-100 text-slate-700'}`}>{nome || k}</span>;
}

export function Rota({ r }) {
  if (!r) return null;
  return <span className="inline-flex items-center gap-0.5 rounded bg-white px-1.5 py-0.5 text-[11px] font-semibold text-slate-600 ring-1 ring-inset ring-slate-300"><MapPin size={10} />Rota {r}</span>;
}

export function linkMaps(e) {
  const q = [e.endereco, e.bairro, e.cidade || 'Belém', e.uf || 'PA'].filter(Boolean).join(', ');
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(q)}`;
}
/** Rota no Google Maps passando pelos endereços (até 10). */
export function linkRota(escolas) {
  const pontos = escolas.slice(0, 10).map((e) => [e.endereco, e.bairro, 'Belém, PA'].filter(Boolean).join(', '));
  return 'https://www.google.com/maps/dir/' + pontos.map(encodeURIComponent).join('/');
}

export function Copiar({ texto, rotulo = 'Copiar' }) {
  const [ok, setOk] = useState(false);
  return (
    <button type="button" onClick={() => { navigator.clipboard?.writeText(texto).then(() => { setOk(true); setTimeout(() => setOk(false), 1500); }); }}
      className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs font-medium text-violet-700 hover:bg-violet-50">
      {ok ? <Check size={13} /> : <Copy size={13} />}{ok ? 'Copiado' : rotulo}
    </button>
  );
}

/** Barra de meta da semana. */
export function MetaSemana({ rotulo, feito, meta, sub, faixa }) {
  const pct = meta ? Math.min(100, Math.round((feito / meta) * 100)) : 0;
  const cor = feito >= meta ? 'bg-emerald-500' : pct >= 60 ? 'bg-violet-500' : 'bg-amber-500';
  return (
    <div className="flex flex-col gap-1.5 rounded-xl border border-slate-200 bg-white p-3.5">
      <span className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">{rotulo}</span>
      <span className="text-2xl font-semibold tabular-nums text-slate-900">
        {feito}<small className="ml-1 text-sm font-normal text-slate-400">/ {faixa || meta}</small>
      </span>
      <div className="h-1.5 w-full overflow-hidden rounded-full bg-slate-100"><div className={`h-full rounded-full ${cor}`} style={{ width: `${pct}%` }} /></div>
      {sub && <span className="text-xs text-slate-500">{sub}</span>}
    </div>
  );
}

export function Secao({ titulo, sub, extra, children, className = '' }) {
  return (
    <section className={`rounded-xl border border-slate-200 bg-white p-4 ${className}`}>
      {(titulo || extra) && (
        <div className="mb-3 flex flex-wrap items-start justify-between gap-2">
          <div>
            {titulo && <h2 className="text-sm font-semibold text-slate-900">{titulo}</h2>}
            {sub && <p className="text-xs text-slate-500">{sub}</p>}
          </div>
          {extra}
        </div>
      )}
      {children}
    </section>
  );
}

export function AvisoLgpd({ className = '' }) {
  return (
    <p className={`rounded-md border border-violet-200 bg-violet-50 px-3 py-2 text-xs text-violet-900 ${className}`}>
      <b>LGPD:</b> registre só situações e processos da escola. Nunca nomes de alunos, laudos ou dados de saúde.
    </p>
  );
}

export const dataBr = (s) => { if (!s) return ''; const [, m, d] = String(s).slice(0, 10).split('-'); return `${d}/${m}`; };
export const horaBr = (iso) => (iso ? new Date(iso).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }) : '');
export const DIA_SEMANA = ['domingo', 'segunda', 'terça', 'quarta', 'quinta', 'sexta', 'sábado'];
