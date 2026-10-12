/**
 * Peças visuais do módulo Comercial (Sprint 42).
 * Semáforo: ok = verde, warn = âmbar, crit = vermelho, neu = neutro.
 */

const PILL = {
  ok: 'bg-emerald-50 text-emerald-700 ring-emerald-200',
  warn: 'bg-amber-50 text-amber-800 ring-amber-200',
  crit: 'bg-red-50 text-red-700 ring-red-200',
  neu: 'bg-slate-100 text-slate-700 ring-slate-200',
  line: 'bg-white text-slate-600 ring-slate-300',
  info: 'bg-nexus-50 text-nexus-800 ring-nexus-200',
};

export function Pill({ nivel = 'neu', children, title }) {
  return (
    <span title={title} className={`inline-flex items-center gap-1 whitespace-nowrap rounded-full px-2 py-0.5 text-[11px] font-medium ring-1 ring-inset ${PILL[nivel] || PILL.neu}`}>
      {children}
    </span>
  );
}

const BARRA = { ok: 'bg-emerald-500', warn: 'bg-amber-500', crit: 'bg-red-500', neu: 'bg-nexus-500' };

export function Barra({ pct = 0, nivel = 'neu' }) {
  const w = Math.max(0, Math.min(100, pct));
  return (
    <div className="h-1.5 w-full overflow-hidden rounded-full bg-slate-100">
      <div className={`h-full rounded-full ${BARRA[nivel] || BARRA.neu}`} style={{ width: `${w}%` }} />
    </div>
  );
}

export function Painel({ titulo, extra, children, className = '' }) {
  return (
    <section className={`flex flex-col gap-3 rounded-lg border border-slate-200 bg-white p-4 ${className}`}>
      {(titulo || extra) && (
        <div className="flex items-center justify-between gap-2">
          {titulo && <h2 className="text-sm font-semibold text-slate-900">{titulo}</h2>}
          {extra}
        </div>
      )}
      {children}
    </section>
  );
}

export function Vazio({ children }) {
  return <p className="text-sm text-slate-500">{children}</p>;
}

export function Kpi({ rotulo, valor, meta, sub }) {
  const pct = meta ? (Number(valor) / meta) * 100 : 0;
  const nivel = !meta ? 'neu' : pct >= 100 ? 'ok' : pct >= 60 ? 'neu' : 'warn';
  return (
    <div className="flex flex-col gap-1.5 rounded-lg border border-slate-200 bg-white p-4">
      <span className="text-[11px] font-medium uppercase tracking-wide text-slate-500">{rotulo}</span>
      <span className="text-2xl font-semibold tabular-nums text-slate-900">
        {valor}
        {meta != null && <small className="ml-1 text-sm font-normal text-slate-400">/ {meta}</small>}
      </span>
      {meta != null && <Barra pct={pct} nivel={nivel} />}
      {sub && <span className="text-xs text-slate-500">{sub}</span>}
    </div>
  );
}

export const brl = (n) => Number(n || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 });
export const pct = (n) => (n == null || !isFinite(n) ? '—' : `${(Math.round(n * 10) / 10).toLocaleString('pt-BR')}%`);
export function dataBr(s) {
  if (!s) return '';
  const [, m, d] = String(s).slice(0, 10).split('-');
  return `${d}/${m}`;
}
export const nivelPontos = (p) => (p >= 60 ? 'ok' : p >= 40 ? 'warn' : 'crit');

export function linhaLocal(l) {
  return [l.cidade && (l.cidade + (l.uf ? '/' + l.uf : '')), l.segmento].filter(Boolean).join(' · ');
}

export const inputCls = 'w-full rounded-md border border-slate-300 bg-white px-2.5 py-1.5 text-sm text-slate-800 outline-none focus:border-nexus-500 focus:ring-2 focus:ring-nexus-200 disabled:bg-slate-50';
export const btnCls = 'inline-flex items-center justify-center gap-1.5 rounded-md border border-slate-300 bg-white px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50';
export const btnPrimCls = 'inline-flex items-center justify-center gap-1.5 rounded-md bg-nexus-700 px-3 py-1.5 text-sm font-medium text-white hover:bg-nexus-800 disabled:opacity-50';

export function Campo({ rotulo, children, className = '' }) {
  return (
    <label className={`flex flex-col gap-1 text-xs font-medium text-slate-600 ${className}`}>
      <span className="inline-flex items-center gap-1">{rotulo}</span>
      {children}
    </label>
  );
}

export function NomeLead({ lead, onAbrir }) {
  return (
    <button type="button" onClick={() => onAbrir(lead.id)} className="truncate text-left text-sm font-medium text-slate-900 hover:text-nexus-700 hover:underline">
      {lead.nome}
    </button>
  );
}

// ---------------------------------------------------------------------------
// Modal genérico + campos de data/hora
// ---------------------------------------------------------------------------
export function Modal({ titulo, onFechar, children, rodape, largura = 'max-w-lg' }) {
  return (
    <div className="fixed inset-0 z-[60] flex items-start justify-center overflow-y-auto bg-slate-900/40 p-4 pt-16">
      <div className={`w-full ${largura} rounded-lg bg-white shadow-xl`} role="dialog" aria-modal="true" aria-label={titulo}>
        <div className="flex items-center justify-between border-b border-slate-200 px-5 py-3">
          <h2 className="text-base font-semibold text-slate-900">{titulo}</h2>
          <button type="button" onClick={onFechar} className="rounded p-1 text-slate-500 hover:bg-slate-100" aria-label="Fechar">✕</button>
        </div>
        <div className="space-y-3 px-5 py-4">{children}</div>
        {rodape && <div className="flex justify-end gap-2 border-t border-slate-200 px-5 py-3">{rodape}</div>}
      </div>
    </div>
  );
}

export function Erro({ children }) {
  if (!children) return null;
  return <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">{children}</div>;
}

/** 'YYYY-MM-DDTHH:mm' local → ISO com fuso */
export function localParaIso(v) { return v ? new Date(v).toISOString() : null; }
export function isoParaLocal(iso) {
  if (!iso) return '';
  const d = new Date(iso); const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
}
export function dataHoraBr(iso) {
  if (!iso) return '';
  return new Date(iso).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
}
export const horaBr = (iso) => new Date(iso).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
