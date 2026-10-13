import { useEffect, useRef, useState } from 'react';
import { HelpCircle, Lightbulb, ChevronDown, ChevronUp, Search, X } from 'lucide-react';
import { GLOSSARIO, COMO_FUNCIONA, FAQ, TOUR, GUIA_ETAPAS } from './guia.js';
import { btnCls, btnPrimCls, inputCls } from './ui.jsx';

/**
 * Ajuda embutida do módulo Comercial (Sprint 42C).
 *   <Dica termo="conexao" />   — ícone (?) com a explicação do termo
 *   <ComoFunciona aba="hoje" /> — faixa recolhível no topo de cada aba
 *   <Tour />                    — boas-vindas na primeira visita
 *   <VistaAjuda />              — aba "Ajuda": etapas, regras, FAQ, glossário
 */

const lerLS = (k, padrao) => { try { const v = localStorage.getItem(k); return v == null ? padrao : v; } catch { return padrao; } };
const gravarLS = (k, v) => { try { localStorage.setItem(k, v); } catch { /* sem storage: tudo bem */ } };

export function Dica({ termo, texto, className = '' }) {
  const [aberta, setAberta] = useState(false);
  const ref = useRef(null);
  const conteudo = texto || GLOSSARIO[termo];
  useEffect(() => {
    if (!aberta) return undefined;
    const fora = (e) => { if (ref.current && !ref.current.contains(e.target)) setAberta(false); };
    document.addEventListener('mousedown', fora);
    return () => document.removeEventListener('mousedown', fora);
  }, [aberta]);
  if (!conteudo) return null;
  return (
    <span ref={ref} className={`relative inline-flex align-middle ${className}`}>
      <button type="button" aria-label="O que é isto?" onClick={(e) => { e.stopPropagation(); setAberta(!aberta); }}
        className="rounded-full text-slate-400 hover:text-nexus-700 focus:outline-none focus:ring-2 focus:ring-nexus-200">
        <HelpCircle size={14} />
      </button>
      {aberta && (
        <span role="tooltip" className="absolute left-1/2 top-5 z-[70] w-64 -translate-x-1/2 rounded-md border border-slate-200 bg-white p-3 text-left text-xs font-normal normal-case leading-relaxed tracking-normal text-slate-700 shadow-lg">
          {conteudo}
        </span>
      )}
    </span>
  );
}

export function ComoFunciona({ aba }) {
  const info = COMO_FUNCIONA[aba];
  const chave = 'comercial-ajuda-' + aba;
  const [aberto, setAberto] = useState(() => lerLS(chave, '1') === '1');
  if (!info) return null;
  const alternar = () => { const n = !aberto; setAberto(n); gravarLS(chave, n ? '1' : '0'); };
  return (
    <div className="rounded-lg border border-nexus-100 bg-nexus-50/60 text-sm text-slate-700">
      <button type="button" onClick={alternar} className="flex w-full items-center gap-2 px-3 py-2 text-left font-medium text-nexus-900">
        <Lightbulb size={15} className="text-nexus-700" />
        <span className="flex-1">{info.titulo}</span>
        <span className="text-xs font-normal text-nexus-700">{aberto ? 'esconder' : 'como funciona'}</span>
        {aberto ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
      </button>
      {aberto && (
        <ul className="ml-9 list-disc space-y-0.5 px-3 pb-3 text-[13px]">
          {info.itens.map((t) => <li key={t}>{t}</li>)}
        </ul>
      )}
    </div>
  );
}

export function Tour({ forcar = false, onFechar }) {
  const chave = 'comercial-tour-visto';
  const [visivel, setVisivel] = useState(() => forcar || lerLS(chave, '') !== '1');
  const [i, setI] = useState(0);
  useEffect(() => { if (forcar) { setVisivel(true); setI(0); } }, [forcar]);
  if (!visivel) return null;
  const fechar = () => { gravarLS(chave, '1'); setVisivel(false); onFechar?.(); };
  const passo = TOUR[i];
  const ultimo = i === TOUR.length - 1;
  return (
    <div className="fixed inset-0 z-[80] flex items-center justify-center bg-slate-900/50 p-4">
      <div role="dialog" aria-modal="true" aria-label={passo.titulo} className="w-full max-w-md rounded-xl bg-white p-6 shadow-2xl">
        <div className="mb-4 flex items-center justify-between">
          <div className="flex gap-1">
            {TOUR.map((_, k) => <span key={k} className={`h-1.5 w-6 rounded-full ${k <= i ? 'bg-nexus-600' : 'bg-slate-200'}`} />)}
          </div>
          <button type="button" onClick={fechar} className="text-xs text-slate-500 hover:underline">pular</button>
        </div>
        <h2 className="text-lg font-semibold text-slate-900">{passo.titulo}</h2>
        <p className="mt-2 text-sm leading-relaxed text-slate-600">{passo.texto}</p>
        <div className="mt-6 flex justify-between">
          <button type="button" className={btnCls} disabled={i === 0} onClick={() => setI(i - 1)}>Voltar</button>
          <button type="button" className={btnPrimCls} onClick={() => (ultimo ? fechar() : setI(i + 1))}>{ultimo ? 'Começar' : 'Próximo'}</button>
        </div>
      </div>
    </div>
  );
}

export function VistaAjuda({ cfg, onTour, onProcesso }) {
  const [busca, setBusca] = useState('');
  const q = busca.trim().toLowerCase();
  const faq = FAQ.filter((f) => !q || (f.p + ' ' + f.r).toLowerCase().includes(q));
  const glos = Object.entries(GLOSSARIO).filter(([k, v]) => !q || (k + ' ' + v).toLowerCase().includes(q));
  const nomeTermo = (k) => ({
    cadencia: 'Cadência', toque: 'Toque', conexao: 'Conexão', sla: 'Prazo da etapa', portao: 'Critério para avançar (portão)',
    pontos: 'Pontos de uso', estorno: 'Estorno', semaforo: 'Semáforo', assinado_pago: 'Assinado × pago',
    nao_contatar: 'Não contatar', duplicidade: 'Duplicidade', cns: 'CNS', checagem: 'Checagem', um_a_um: '1:1',
    proximo_passo: 'Próximo passo', origem: 'Origem', campanha: 'Campanha', insistencia: 'Insistência com método',
  }[k] || k);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center gap-3">
        <div className="relative min-w-[240px] flex-1">
          <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
          <input type="search" className={inputCls + ' pl-8'} placeholder="Procure uma dúvida: desconto, estorno, reunião, meta…" value={busca} onChange={(e) => setBusca(e.target.value)} />
        </div>
        {onProcesso && <button type="button" className={btnPrimCls} onClick={onProcesso}>Ver o processo desenhado</button>}
        <button type="button" className={btnCls} onClick={onTour}>Rever o tour de 1 minuto</button>
      </div>

      {!q && (
        <section className="space-y-3">
          <h2 className="text-base font-semibold text-slate-900">O caminho de um cartório</h2>
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
            {cfg.etapas.map((e, idx) => {
              const g = GUIA_ETAPAS[e.k];
              return (
                <article key={e.k} className="flex flex-col gap-2 rounded-lg border border-slate-200 bg-white p-4 text-sm">
                  <header className="flex items-center gap-2">
                    <span className="flex h-6 w-6 items-center justify-center rounded-full bg-nexus-100 text-xs font-semibold text-nexus-800">{idx + 1}</span>
                    <b className="text-slate-900">{e.n}</b>
                  </header>
                  <p className="text-slate-600">{g.objetivo}</p>
                  <ul className="ml-4 list-disc space-y-1 text-[13px] text-slate-700">{g.fazer.map((f) => <li key={f}>{f}</li>)}</ul>
                  <p className="mt-auto rounded-md bg-slate-50 p-2 text-xs text-slate-600"><b>Avança quando:</b> {g.avancar}</p>
                  {g.prazo !== '—' && <p className="text-xs text-slate-500"><b>Prazo:</b> {g.prazo}</p>}
                </article>
              );
            })}
          </div>
        </section>
      )}

      <section className="space-y-2">
        <h2 className="text-base font-semibold text-slate-900">Perguntas frequentes {q && <span className="text-sm font-normal text-slate-500">({faq.length})</span>}</h2>
        {faq.length ? faq.map((f) => (
          <details key={f.p} className="group rounded-lg border border-slate-200 bg-white px-4 py-3 text-sm" open={!!q}>
            <summary className="cursor-pointer list-none font-medium text-slate-900">
              <span className="mr-2 inline-block text-nexus-700 transition group-open:rotate-90">›</span>{f.p}
            </summary>
            <p className="mt-2 pl-4 leading-relaxed text-slate-700">{f.r}</p>
          </details>
        )) : <p className="text-sm text-slate-500">Nenhuma pergunta com “{busca}”. Tente outra palavra ou pergunte à gestão.</p>}
      </section>

      <section className="space-y-2">
        <h2 className="text-base font-semibold text-slate-900">Glossário</h2>
        <dl className="grid gap-x-6 gap-y-3 rounded-lg border border-slate-200 bg-white p-4 text-sm md:grid-cols-2">
          {glos.map(([k, v]) => (
            <div key={k}>
              <dt className="font-medium text-slate-900">{nomeTermo(k)}</dt>
              <dd className="text-slate-600">{v}</dd>
            </div>
          ))}
        </dl>
      </section>
    </div>
  );
}

/** Mensagem de erro com o que fazer: usada quando o servidor recusa algo. */
export function ErroComSolucao({ erro, onFechar }) {
  if (!erro) return null;
  return (
    <div className="flex items-start gap-2 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
      <span className="flex-1">{erro}</span>
      {onFechar && <button type="button" onClick={onFechar} aria-label="Fechar"><X size={14} /></button>}
    </div>
  );
}
