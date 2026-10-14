import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  Phone, MessageCircle, UserPlus, CalendarCheck, Trophy, Radio, Maximize2, X,
  CalendarClock, Activity, Target, CalendarDays, LayoutDashboard, CheckCircle2, UserX, Sparkles,
} from 'lucide-react';
import { api, BASE_URL, mensagemDeErro } from '../api/client.js';

/**
 * Sprint 42M — Comercial · modo TV.
 *
 * Tela cheia, fundo escuro, letra grande: feita para ficar aberta o dia todo
 * numa TV da sala. Atualiza sozinha:
 *   - SSE /comercial/stream avisa "mudou" a cada escrita no Comercial → recarrega;
 *   - polling de 60 s como rede de segurança (pagamento via ASAAS, rede caiu...);
 *   - recarrega a página inteira de madrugada (pega deploy novo e troca o dia).
 * Só leitura. Não mostra telefone/e-mail de lead.
 */

const POLL_MS = 60_000;
const DEBOUNCE_MS = 1200;
const CELEBRACAO_MS = 12_000;

/**
 * Sprint 42N — telas que se alternam na TV. Tempos em segundos, ajustáveis
 * pela URL: /comercial/tv?painel=40&reunioes=25 · ?fixo=reunioes trava numa tela.
 */
const TELAS = [
  { k: 'painel', nome: 'Painel do dia', icone: LayoutDashboard, padrao: 40 },
  { k: 'reunioes', nome: 'Reuniões marcadas', icone: CalendarDays, padrao: 25 },
];
function lerConfigTelas() {
  const q = new URLSearchParams(window.location.search);
  const dur = Object.fromEntries(TELAS.map((t) => {
    const v = Number(q.get(t.k));
    return [t.k, Number.isFinite(v) && v >= 5 ? v : t.padrao];
  }));
  const fixo = TELAS.some((t) => t.k === q.get('fixo')) ? q.get('fixo') : null;
  return { dur, fixo };
}

const brl = (n) => Number(n || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 });
const pct = (a, b) => (b > 0 ? Math.round((a / b) * 100) : 0);
const hora = (iso) => new Date(iso).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', timeZone: 'America/Sao_Paulo' });
const chaveEvento = (f) => `${f.tipo}|${f.em}|${f.lead}`;

/** Cor da barra conforme o ritmo: atingiu = verde, no ritmo = azul, atrás = âmbar. */
function nivel(feito, meta, esperadoPct) {
  if (!meta) return 'neu';
  const p = (feito / meta) * 100;
  if (p >= 100) return 'ok';
  if (esperadoPct == null || p >= esperadoPct * 0.9) return 'ritmo';
  return 'atras';
}
const COR_NIVEL = {
  ok: 'bg-emerald-400', ritmo: 'bg-sky-400', atras: 'bg-amber-400', neu: 'bg-slate-500',
};
const TOM = {
  otimo: 'border-emerald-400/60 bg-emerald-400/10',
  bom: 'border-sky-400/50 bg-sky-400/5',
  info: 'border-slate-600 bg-slate-800/40',
  neutro: 'border-slate-700/60 bg-transparent',
  ruim: 'border-rose-500/40 bg-rose-500/5',
};

/** % esperado do dia pelo relógio: 8h → 0 %, 18h → 100 % (para "no ritmo"). */
function esperadoAgora(agora) {
  const h = agora.getHours() + agora.getMinutes() / 60;
  return Math.max(0, Math.min(100, ((h - 8) / 10) * 100));
}

export default function ComercialTv() {
  const [dados, setDados] = useState(null);
  const [erro, setErro] = useState('');
  const [aoVivo, setAoVivo] = useState(false);
  const [agora, setAgora] = useState(() => new Date());
  const [celebrar, setCelebrar] = useState(null);
  const [cursor, setCursor] = useState(true);
  const config = useMemo(lerConfigTelas, []);
  const [tela, setTela] = useState(config.fixo || 'painel');
  const [giro, setGiro] = useState(0); // muda a cada troca (reinicia a barrinha de progresso)
  const vistos = useRef(null);
  const timer = useRef(null);

  const carregar = useCallback(() => {
    api.get('/comercial/tv')
      .then((r) => {
        const d = r.data;
        // Celebração: evento "ótimo" (fechou / pagou) que ainda não tínhamos visto.
        const chaves = new Set(d.feed.map(chaveEvento));
        if (vistos.current) {
          const novo = d.feed.find((f) => f.tom === 'otimo' && !vistos.current.has(chaveEvento(f)));
          if (novo) setCelebrar(novo);
        }
        vistos.current = chaves;
        setDados(d);
        setErro('');
      })
      .catch((err) => setErro(mensagemDeErro(err, 'Sem conexão com o servidor — tentando de novo...')));
  }, []);

  const agendarCarga = useCallback(() => {
    clearTimeout(timer.current);
    timer.current = setTimeout(carregar, DEBOUNCE_MS);
  }, [carregar]);

  // Carga inicial + polling de segurança
  useEffect(() => {
    carregar();
    const id = setInterval(carregar, POLL_MS);
    return () => { clearInterval(id); clearTimeout(timer.current); };
  }, [carregar]);

  // Tempo real (SSE). O EventSource reconecta sozinho se a conexão cair.
  useEffect(() => {
    const token = localStorage.getItem('nexus_token');
    if (!token || typeof EventSource === 'undefined') return undefined;
    const es = new EventSource(`${BASE_URL}/comercial/stream?token=${encodeURIComponent(token)}`);
    es.addEventListener('conectado', () => { setAoVivo(true); agendarCarga(); });
    es.addEventListener('mudou', agendarCarga);
    es.onerror = () => setAoVivo(false);
    return () => es.close();
  }, [agendarCarga]);

  // Relógio + recarga diária de madrugada (3h)
  useEffect(() => {
    const id = setInterval(() => {
      const d = new Date();
      setAgora(d);
      if (d.getHours() === 3 && d.getMinutes() === 0 && d.getSeconds() < 2) window.location.reload();
    }, 1000);
    return () => clearInterval(id);
  }, []);

  // Celebração some sozinha
  useEffect(() => {
    if (!celebrar) return undefined;
    const id = setTimeout(() => setCelebrar(null), CELEBRACAO_MS);
    return () => clearTimeout(id);
  }, [celebrar]);

  // Mantém a tela acesa (onde o navegador da TV suportar)
  useEffect(() => {
    let lock = null;
    const pedir = async () => {
      try { lock = await navigator.wakeLock?.request('screen'); } catch { /* sem suporte */ }
    };
    pedir();
    const vis = () => { if (document.visibilityState === 'visible') pedir(); };
    document.addEventListener('visibilitychange', vis);
    return () => { document.removeEventListener('visibilitychange', vis); lock?.release?.().catch(() => {}); };
  }, []);

  // Alterna as telas sozinho (pausa durante a celebração)
  const irPara = useCallback((k) => { setTela(k); setGiro((g) => g + 1); }, []);
  const proxima = useCallback((passo = 1) => {
    setTela((atual) => {
      const i = TELAS.findIndex((t) => t.k === atual);
      return TELAS[(i + passo + TELAS.length) % TELAS.length].k;
    });
    setGiro((g) => g + 1);
  }, []);
  useEffect(() => {
    if (config.fixo || celebrar) return undefined;
    const id = setTimeout(() => proxima(1), config.dur[tela] * 1000);
    return () => clearTimeout(id);
  }, [tela, giro, celebrar, config, proxima]);

  // Esconde o cursor parado; F = tela cheia
  useEffect(() => {
    let id;
    const mexeu = () => { setCursor(true); clearTimeout(id); id = setTimeout(() => setCursor(false), 3000); };
    const tecla = (e) => {
      if (e.key === 'f' || e.key === 'F') telaCheia();
      else if (e.key === 'ArrowRight') proxima(1);
      else if (e.key === 'ArrowLeft') proxima(-1);
    };
    mexeu();
    window.addEventListener('mousemove', mexeu);
    window.addEventListener('keydown', tecla);
    return () => { clearTimeout(id); window.removeEventListener('mousemove', mexeu); window.removeEventListener('keydown', tecla); };
  }, [proxima]);

  const esperadoDia = esperadoAgora(agora);
  const esperadoMes = dados
    ? pct(dados.dia_util.util_hoje ? Math.max(0, dados.dia_util.n - 1) + esperadoDia / 100 : dados.dia_util.n, dados.dia_util.de)
    : null;

  return (
    <div className={`fixed inset-0 overflow-hidden bg-[#0b1220] text-slate-100 ${cursor ? '' : 'cursor-none'}`}
      style={{ fontSize: 'clamp(12px, 0.95vw, 22px)' }}>
      <div className="flex h-full flex-col gap-[1.1em] px-[1.4em] pb-[2.5em] pt-[1.4em]">
        <Cabecalho agora={agora} dados={dados} aoVivo={aoVivo} cursor={cursor} />

        {erro && (
          <div className="rounded-lg border border-amber-500/40 bg-amber-500/10 px-4 py-2 text-[1.1em] text-amber-200">{erro}</div>
        )}

        {!dados ? (
          <div className="grid flex-1 place-items-center text-[2em] text-slate-500">Carregando o painel…</div>
        ) : (
          <div key={tela} className="tv-trocar flex min-h-0 flex-1 flex-col gap-[1.1em]">
            {tela === 'reunioes' && dados.calendario ? (
              <TelaReunioes cal={dados.calendario} agora={agora} />
            ) : (
              <>
                <Kpis dados={dados} esperado={esperadoDia} />
                <div className="grid min-h-0 flex-1 grid-cols-12 gap-[1.1em]">
                  <div className="col-span-4 flex min-h-0 flex-col gap-[1.1em]">
                    <MetaMes dados={dados} esperado={esperadoMes} />
                    <Funil funil={dados.funil} />
                  </div>
                  <div className="col-span-5 min-h-0">
                    <Ranking ranking={dados.ranking} esperado={esperadoDia} />
                  </div>
                  <div className="col-span-3 flex min-h-0 flex-col gap-[1.1em]">
                    <Agenda agenda={dados.agenda} agora={agora} />
                    <Feed feed={dados.feed} />
                  </div>
                </div>
              </>
            )}
          </div>
        )}

        {dados && (
          <Indicador tela={tela} giro={giro} config={config} pausado={!!celebrar} onIr={irPara} />
        )}
      </div>

      {celebrar && <Celebracao evento={celebrar} onFechar={() => setCelebrar(null)} />}
    </div>
  );
}

function telaCheia() {
  if (document.fullscreenElement) document.exitFullscreen?.();
  else document.documentElement.requestFullscreen?.().catch(() => {});
}

// ─────────────────────────────────────────────────────────────────────────
function Cabecalho({ agora, dados, aoVivo, cursor }) {
  const d = agora.toLocaleDateString('pt-BR', { weekday: 'long', day: 'numeric', month: 'long' });
  const data = d.charAt(0).toUpperCase() + d.slice(1);
  const relogio = agora.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
  return (
    <header className="flex items-center justify-between">
      <div className="flex items-baseline gap-[0.8em]">
        <h1 className="text-[2.2em] font-bold tracking-tight">Comercial <span className="text-sky-400">ao vivo</span></h1>
        <span className="text-[1.25em] text-slate-400">{data}</span>
        {dados && (
          <span className="rounded-full bg-slate-800 px-[0.8em] py-[0.2em] text-[1em] text-slate-300">
            {dados.dia_util.util_hoje ? `dia útil ${dados.dia_util.n} de ${dados.dia_util.de}` : 'hoje não é dia útil'}
          </span>
        )}
      </div>
      <div className="flex items-center gap-[1.2em]">
        <span className={`inline-flex items-center gap-[0.4em] text-[1.05em] ${aoVivo ? 'text-emerald-400' : 'text-slate-500'}`}
          title={aoVivo ? 'Recebendo atualizações na hora' : 'Atualizando a cada minuto'}>
          <Radio className={`h-[1.1em] w-[1.1em] ${aoVivo ? 'animate-pulse' : ''}`} />
          {aoVivo ? 'AO VIVO' : 'a cada 1 min'}
        </span>
        <span className="font-mono text-[2.6em] font-semibold tabular-nums leading-none">{relogio}</span>
        <div className={`flex gap-2 transition-opacity ${cursor ? 'opacity-100' : 'opacity-0'}`}>
          <button type="button" onClick={telaCheia} className="rounded-md p-2 text-slate-400 hover:bg-slate-800 hover:text-white" title="Tela cheia (F)">
            <Maximize2 className="h-5 w-5" />
          </button>
          <Link to="/comercial" className="rounded-md p-2 text-slate-400 hover:bg-slate-800 hover:text-white" title="Sair do modo TV">
            <X className="h-5 w-5" />
          </Link>
        </div>
      </div>
    </header>
  );
}

// ─────────────────────────────────────────────────────────────────────────
function Kpis({ dados, esperado }) {
  const { dia, metas_dia: m } = dados;
  const taxa = dia.toques ? Math.round((dia.conexoes / dia.toques) * 100) : 0;
  const itens = [
    { icone: Phone, rotulo: 'Contatos hoje', valor: dia.toques, meta: m.toques, esperado },
    { icone: MessageCircle, rotulo: 'Conversas (conexões)', valor: dia.conexoes, sub: `${taxa}% dos contatos atenderam` },
    { icone: UserPlus, rotulo: 'Novos em contato', valor: dia.novos, meta: m.novos, esperado },
    { icone: CalendarCheck, rotulo: 'Reuniões agendadas', valor: dia.reunioes_agendadas, meta: m.reunioes,
      sub: `${dia.reunioes_realizadas} realizada${dia.reunioes_realizadas === 1 ? '' : 's'} hoje` },
    { icone: Trophy, rotulo: 'Fechados hoje', valor: dia.ganhos, destaque: dia.ganhos > 0 || dia.pagos > 0,
      sub: dia.pagos ? `${dia.pagos} pago${dia.pagos === 1 ? '' : 's'} · ${brl(dia.receita)}/mês` : `${dia.propostas} proposta${dia.propostas === 1 ? '' : 's'} enviada${dia.propostas === 1 ? '' : 's'}` },
  ];
  return (
    <div className="grid grid-cols-5 gap-[1.1em]">
      {itens.map((k) => <Kpi key={k.rotulo} {...k} />)}
    </div>
  );
}

function Kpi({ icone: Icone, rotulo, valor, meta, sub, esperado, destaque }) {
  const nv = nivel(valor, meta, esperado);
  return (
    <div className={`flex flex-col gap-[0.5em] rounded-xl border p-[1em] ${destaque ? 'border-emerald-400/50 bg-emerald-400/10' : 'border-slate-800 bg-slate-900/70'}`}>
      <div className="flex items-center gap-[0.5em] text-[1.1em] text-slate-400">
        <Icone className="h-[1.2em] w-[1.2em]" /> {rotulo}
      </div>
      <div className="flex items-baseline gap-[0.4em]">
        <span className={`text-[3.6em] font-bold leading-none tabular-nums ${destaque ? 'text-emerald-300' : ''}`}>{valor}</span>
        {meta > 0 && <span className="text-[1.5em] text-slate-500 tabular-nums">/ {meta}</span>}
      </div>
      {meta > 0 ? (
        <div className="mt-auto">
          <BarraMeta feito={valor} meta={meta} nivel={nv} esperado={esperado} />
          <div className="mt-[0.3em] text-[0.95em] text-slate-400">
            {valor >= meta ? 'Meta do dia batida! ✅' : `faltam ${meta - valor}`}
          </div>
        </div>
      ) : (
        <div className="mt-auto text-[1em] text-slate-400">{sub}</div>
      )}
      {meta > 0 && sub && <div className="text-[0.95em] text-slate-400">{sub}</div>}
    </div>
  );
}

/** Barra com marcador do "onde deveríamos estar agora". */
function BarraMeta({ feito, meta, nivel: nv, esperado, grossa }) {
  const w = Math.min(100, pct(feito, meta));
  return (
    <div className={`relative w-full overflow-hidden rounded-full bg-slate-800 ${grossa ? 'h-[0.9em]' : 'h-[0.55em]'}`}>
      <div className={`h-full rounded-full transition-all duration-700 ${COR_NIVEL[nv]}`} style={{ width: `${w}%` }} />
      {esperado != null && esperado > 0 && esperado < 100 && (
        <div className="absolute inset-y-0 w-[2px] bg-white/70" style={{ left: `${esperado}%` }} title="Ritmo esperado agora" />
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────
function Painel({ titulo, icone: Icone, extra, children, className = '' }) {
  return (
    <section className={`flex min-h-0 flex-col rounded-xl border border-slate-800 bg-slate-900/70 p-[1em] ${className}`}>
      <div className="mb-[0.7em] flex items-center justify-between">
        <h2 className="flex items-center gap-[0.5em] text-[1.3em] font-semibold text-slate-200">
          {Icone && <Icone className="h-[1.1em] w-[1.1em] text-sky-400" />} {titulo}
        </h2>
        {extra}
      </div>
      {children}
    </section>
  );
}

function MetaMes({ dados, esperado }) {
  const { mes_acum: a, metas_mes: m } = dados;
  const nomeMes = new Date(dados.hoje + 'T12:00:00').toLocaleDateString('pt-BR', { month: 'long' });
  const linhas = [
    { rotulo: 'Clientes pagos', feito: a.pagos, meta: m.clientes, fmt: (v) => v },
    { rotulo: 'Receita nova (mensal)', feito: a.receita, meta: m.receita, fmt: brl },
    { rotulo: 'Reuniões realizadas', feito: a.reunioes_realizadas, meta: m.reunioes, fmt: (v) => v },
  ];
  return (
    <Painel titulo={`Meta de ${nomeMes}`} icone={Target}
      extra={esperado != null && <span className="text-[0.95em] text-slate-400">ritmo esperado: {esperado}%</span>}>
      <div className="flex flex-col gap-[1em]">
        {linhas.map((l) => (
          <div key={l.rotulo}>
            <div className="mb-[0.3em] flex items-baseline justify-between">
              <span className="text-[1.1em] text-slate-300">{l.rotulo}</span>
              <span className="tabular-nums">
                <span className="text-[1.9em] font-bold">{l.fmt(l.feito)}</span>
                {l.meta > 0 && <span className="text-[1.15em] text-slate-500"> / {l.fmt(l.meta)}</span>}
              </span>
            </div>
            {l.meta > 0 && <BarraMeta feito={l.feito} meta={l.meta} nivel={nivel(l.feito, l.meta, esperado)} esperado={esperado} grossa />}
          </div>
        ))}
      </div>
    </Painel>
  );
}

function Funil({ funil }) {
  const max = Math.max(1, ...funil.map((e) => e.total));
  return (
    <Painel titulo="Funil agora" icone={Activity} className="flex-1 overflow-hidden">
      <div className="flex min-h-0 flex-1 flex-col justify-around gap-[0.25em]">
        {funil.map((e) => (
          <div key={e.k} className="grid grid-cols-[12.5em_1fr_3em] items-center gap-[0.6em]">
            <span className="truncate text-[1em] text-slate-300" title={e.nome}>{e.nome}</span>
            <div className="h-[0.95em] overflow-hidden rounded bg-slate-800">
              <div className={`h-full rounded transition-all duration-700 ${e.k === 'ganho' ? 'bg-emerald-400' : 'bg-sky-500/80'}`}
                style={{ width: `${(e.total / max) * 100}%` }} />
            </div>
            <span className="text-right text-[1.2em] font-semibold tabular-nums">{e.total}</span>
          </div>
        ))}
      </div>
    </Painel>
  );
}

// ─────────────────────────────────────────────────────────────────────────
const MEDALHA = ['bg-amber-400 text-amber-950', 'bg-slate-300 text-slate-900', 'bg-orange-400 text-orange-950'];

function Ranking({ ranking, esperado }) {
  return (
    <Painel titulo="Quem está vendendo hoje" icone={Trophy} className="h-full"
      extra={<span className="text-[0.95em] text-slate-400">fechado › reunião › conversa › contato</span>}>
      {ranking.length === 0 ? (
        <div className="grid flex-1 place-items-center text-[1.4em] text-slate-500">Ninguém registrou atividade ainda hoje.</div>
      ) : (
        <div className="flex min-h-0 flex-1 flex-col gap-[0.55em] overflow-hidden">
          <div className="grid grid-cols-[2.4em_1fr_9em_4.5em_4.5em_5em] items-end gap-[0.6em] px-[0.5em] text-[0.9em] uppercase tracking-wide text-slate-500">
            <span /><span>Vendedor</span><span>Contatos</span>
            <span className="text-center">Conv.</span><span className="text-center">Reun.</span><span className="text-center">Fech.</span>
          </div>
          {ranking.slice(0, 8).map((r, i) => (
            <div key={r.id}
              className={`grid grid-cols-[2.4em_1fr_9em_4.5em_4.5em_5em] items-center gap-[0.6em] rounded-lg px-[0.5em] py-[0.55em] ${i === 0 && r.pontos > 0 ? 'bg-amber-400/10 ring-1 ring-amber-400/40' : 'bg-slate-800/50'}`}>
              <span className={`grid h-[1.9em] w-[1.9em] place-items-center rounded-full text-[1.1em] font-bold ${MEDALHA[i] || 'bg-slate-700 text-slate-200'}`}>{i + 1}</span>
              <div className="min-w-0">
                <div className="truncate text-[1.45em] font-semibold">{r.nome}</div>
                <div className="truncate text-[0.9em] text-slate-400">
                  {r.novos}{r.meta_novos ? `/${r.meta_novos}` : ''} novos · {r.mes_pagos} no mês
                </div>
              </div>
              <div>
                <div className="text-[1.3em] font-semibold tabular-nums">
                  {r.toques}{r.meta_toques ? <span className="text-[0.75em] text-slate-500"> /{r.meta_toques}</span> : null}
                </div>
                {r.meta_toques > 0 && <BarraMeta feito={r.toques} meta={r.meta_toques} nivel={nivel(r.toques, r.meta_toques, esperado)} esperado={esperado} />}
              </div>
              <span className="text-center text-[1.4em] tabular-nums">{r.conexoes}</span>
              <span className="text-center text-[1.4em] tabular-nums">{r.reunioes}</span>
              <span className={`text-center text-[1.6em] font-bold tabular-nums ${r.ganhos || r.pagos ? 'text-emerald-300' : 'text-slate-500'}`}>
                {r.ganhos || r.pagos ? `${Math.max(r.ganhos, r.pagos)} 🏆` : '0'}
              </span>
            </div>
          ))}
        </div>
      )}
    </Painel>
  );
}

// ─────────────────────────────────────────────────────────────────────────
function Agenda({ agenda, agora }) {
  const hhmm = agora.toTimeString().slice(0, 5);
  const proximas = agenda.filter((a) => a.status === 'agendada' && a.hora >= hhmm);
  const lista = (proximas.length ? proximas : agenda).slice(0, 3);
  return (
    <Painel titulo="Reuniões de hoje" icone={CalendarClock}
      extra={<span className="text-[0.95em] text-slate-400">{agenda.length} no dia</span>}>
      {agenda.length === 0 ? (
        <div className="py-[0.6em] text-[1.05em] text-slate-500">Nenhuma reunião marcada para hoje.</div>
      ) : (
        <ul className="flex flex-col gap-[0.45em]">
          {lista.map((a) => (
            <li key={a.id} className="flex items-center gap-[0.7em]">
              <span className={`font-mono text-[1.35em] font-semibold tabular-nums ${a.status === 'agendada' ? 'text-sky-300' : 'text-slate-500'}`}>{a.hora}</span>
              <div className="min-w-0">
                <div className="truncate text-[1.05em]">{a.lead}</div>
                <div className="truncate text-[0.88em] text-slate-400">
                  {a.pessoa || '—'} · {a.status === 'realizada' ? 'realizada ✓' : a.status === 'faltou' ? 'não compareceu' : a.tipo.split(' (')[0]}
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}
    </Painel>
  );
}

function Feed({ feed }) {
  return (
    <Painel titulo="Acontecendo agora" icone={Radio} className="flex-1">
      {feed.length === 0 ? (
        <div className="text-[1.05em] text-slate-500">Assim que alguém registrar um contato, aparece aqui.</div>
      ) : (
        <ul className="flex min-h-0 flex-1 flex-col gap-[0.45em] overflow-hidden [mask-image:linear-gradient(to_bottom,black_80%,transparent)]">
          {feed.map((f, i) => (
            <li key={chaveEvento(f)}
              className={`rounded-lg border-l-4 px-[0.7em] py-[0.45em] ${TOM[f.tom] || TOM.neutro} ${i === 0 ? 'tv-entrar' : ''}`}>
              <div className="flex items-baseline justify-between gap-2">
                <span className="truncate text-[1.05em] font-semibold">{f.pessoa || 'Equipe'}</span>
                <span className="shrink-0 font-mono text-[0.9em] text-slate-400">{hora(f.em)}</span>
              </div>
              <div className="truncate text-[0.98em] text-slate-300">
                {f.texto}{f.valor ? ` · ${brl(f.valor)}` : ''}
              </div>
              <div className="truncate text-[0.88em] text-slate-500">{f.lead}</div>
            </li>
          ))}
        </ul>
      )}
    </Painel>
  );
}

// ─────────────────────────────────────────────────────────────────────────
function Celebracao({ evento, onFechar }) {
  const pagou = evento.tipo === 'pagamento';
  return (
    <button type="button" onClick={onFechar}
      className="tv-celebrar absolute inset-0 grid place-items-center bg-[#0b1220]/80 backdrop-blur-sm">
      <div className="mx-[4em] rounded-3xl border-2 border-emerald-400/70 bg-emerald-950/80 px-[4em] py-[3em] text-center shadow-[0_0_120px_rgba(52,211,153,0.35)]">
        <div className="text-[6em] leading-none">{pagou ? '💰' : '🎉'}</div>
        <div className="mt-[0.4em] text-[3.4em] font-extrabold text-emerald-300">
          {pagou ? 'Pagamento confirmado!' : 'Negócio fechado!'}
        </div>
        <div className="mt-[0.4em] text-[2.2em] font-semibold text-white">{evento.pessoa || 'Equipe'}</div>
        <div className="mt-[0.2em] text-[1.6em] text-emerald-100/90">{evento.lead}</div>
        {evento.valor ? <div className="mt-[0.5em] text-[2.4em] font-bold tabular-nums text-emerald-300">{brl(evento.valor)}/mês</div> : null}
      </div>
    </button>
  );
}

// ─────────────────────────────────────────────────────────────────────────
// Sprint 42N — alternância de telas + calendário das reuniões
// ─────────────────────────────────────────────────────────────────────────

/** Abas no rodapé: qual tela está no ar e quanto falta para trocar. */
function Indicador({ tela, giro, config, pausado, onIr }) {
  return (
    <div className="absolute inset-x-0 bottom-[0.35em] flex items-center justify-center gap-[0.8em]">
      {TELAS.map((t) => {
        const ativa = t.k === tela;
        const Icone = t.icone;
        return (
          <button key={t.k} type="button" onClick={() => onIr(t.k)}
            className={`relative flex items-center gap-[0.45em] overflow-hidden rounded-full px-[0.9em] py-[0.3em] text-[0.95em] transition-colors ${ativa ? 'bg-slate-800 text-slate-100' : 'text-slate-500 hover:text-slate-300'}`}>
            <Icone className="h-[1em] w-[1em]" /> {t.nome}
            {ativa && !config.fixo && (
              <span key={giro} className="tv-progresso absolute bottom-0 left-0 h-[2px] bg-sky-400"
                style={{ animationDuration: `${config.dur[t.k]}s`, animationPlayState: pausado ? 'paused' : 'running' }} />
            )}
          </button>
        );
      })}
    </div>
  );
}

// Cor fixa por pessoa (mesma pessoa = mesma cor em todos os cartões)
const CORES_PESSOA = [
  { ponto: 'bg-sky-400', texto: 'text-sky-300', borda: 'border-sky-400' },
  { ponto: 'bg-violet-400', texto: 'text-violet-300', borda: 'border-violet-400' },
  { ponto: 'bg-amber-400', texto: 'text-amber-300', borda: 'border-amber-400' },
  { ponto: 'bg-pink-400', texto: 'text-pink-300', borda: 'border-pink-400' },
  { ponto: 'bg-teal-400', texto: 'text-teal-300', borda: 'border-teal-400' },
  { ponto: 'bg-orange-400', texto: 'text-orange-300', borda: 'border-orange-400' },
  { ponto: 'bg-lime-400', texto: 'text-lime-300', borda: 'border-lime-400' },
  { ponto: 'bg-indigo-400', texto: 'text-indigo-300', borda: 'border-indigo-400' },
];
const SEM_COR = { ponto: 'bg-slate-500', texto: 'text-slate-400', borda: 'border-slate-600' };

const DIA_SEMANA = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];
const rotuloDia = (iso) => {
  const [, m, d] = iso.split('-');
  return { semana: DIA_SEMANA[new Date(iso + 'T12:00:00').getDay()], data: `${d}/${m}` };
};

function TelaReunioes({ cal, agora }) {
  // Cores pela ordem do placar (quem marcou mais pega a primeira cor)
  const corDe = useMemo(() => {
    const m = new Map(cal.marcadores.map((p, i) => [p.id, CORES_PESSOA[i % CORES_PESSOA.length]]));
    return (id) => m.get(id) || SEM_COR;
  }, [cal.marcadores]);
  const porDia = useMemo(() => {
    const m = new Map(cal.dias.map((d) => [d.dia, []]));
    cal.reunioes.forEach((r) => m.get(r.dia)?.push(r));
    return m;
  }, [cal]);
  const semanas = [cal.dias.slice(0, 5), cal.dias.slice(5, 10)];
  const hhmm = agora.toTimeString().slice(0, 5);
  const futuras = cal.reunioes.filter((r) => r.status === 'agendada' && (r.dia > cal.dias.find((d) => d.hoje)?.dia || (cal.dias.find((d) => d.hoje)?.dia === r.dia && r.hora >= hhmm)));
  const marcadasHoje = cal.reunioes.filter((r) => r.marcada_hoje).length;

  return (
    <div className="grid min-h-0 flex-1 grid-cols-12 gap-[1.1em]">
      <section className="col-span-9 flex min-h-0 flex-col gap-[0.8em] rounded-xl border border-slate-800 bg-slate-900/70 p-[1em]">
        <div className="flex items-center justify-between">
          <h2 className="flex items-center gap-[0.5em] text-[1.5em] font-semibold text-slate-100">
            <CalendarDays className="h-[1.1em] w-[1.1em] text-sky-400" /> Reuniões marcadas
          </h2>
          <div className="flex items-center gap-[1.2em] text-[1em] text-slate-400">
            <span><b className="text-[1.3em] text-slate-100 tabular-nums">{cal.reunioes.length}</b> nas duas semanas</span>
            <span><b className="text-[1.3em] text-sky-300 tabular-nums">{futuras.length}</b> por vir</span>
            <span className="inline-flex items-center gap-[0.3em] rounded-full bg-emerald-400/15 px-[0.7em] py-[0.15em] text-emerald-300">
              <Sparkles className="h-[1em] w-[1em]" /> {marcadasHoje} marcada{marcadasHoje === 1 ? '' : 's'} hoje
            </span>
          </div>
        </div>
        {semanas.map((dias, i) => (
          <div key={i} className="flex min-h-0 flex-1 flex-col gap-[0.4em]">
            <div className="text-[0.9em] font-medium uppercase tracking-wide text-slate-500">{i === 0 ? 'Esta semana' : 'Próxima semana'}</div>
            <div className="grid min-h-0 flex-1 grid-cols-5 gap-[0.6em]">
              {dias.map((d) => (
                <DiaCalendario key={d.dia} d={d} reunioes={porDia.get(d.dia) || []} corDe={corDe} hhmm={hhmm} />
              ))}
            </div>
          </div>
        ))}
      </section>

      <div className="col-span-3 flex min-h-0 flex-col gap-[1.1em]">
        <Painel titulo="Quem marcou" icone={Trophy}
          extra={<span className="text-[0.9em] text-slate-400">nas duas semanas</span>}>
          {cal.marcadores.length === 0 ? (
            <div className="text-[1.05em] text-slate-500">Nenhuma reunião marcada no período.</div>
          ) : (
            <ul className="flex flex-col gap-[0.5em]">
              {cal.marcadores.slice(0, 8).map((p, i) => {
                const cor = corDe(p.id);
                return (
                  <li key={p.id} className={`flex items-center gap-[0.7em] rounded-lg px-[0.6em] py-[0.5em] ${i === 0 ? 'bg-amber-400/10 ring-1 ring-amber-400/40' : 'bg-slate-800/50'}`}>
                    <span className={`h-[0.9em] w-[0.9em] shrink-0 rounded-full ${cor.ponto}`} />
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-[1.35em] font-semibold">{p.nome}</div>
                      <div className="text-[0.9em] text-slate-400">
                        {p.realizadas} realizada{p.realizadas === 1 ? '' : 's'}
                        {p.hoje > 0 && <span className="text-emerald-300"> · +{p.hoje} hoje</span>}
                      </div>
                    </div>
                    <span className="text-[2.2em] font-bold leading-none tabular-nums">{p.total}</span>
                  </li>
                );
              })}
            </ul>
          )}
        </Painel>
        <Painel titulo="Como ler" icone={CalendarClock} className="flex-1">
          <ul className="flex flex-col gap-[0.55em] text-[0.98em] text-slate-300">
            <li className="flex items-center gap-[0.5em]"><span className="rounded bg-sky-400/15 px-[0.4em] font-mono text-sky-300">14:00</span> agendada</li>
            <li className="flex items-center gap-[0.5em]"><CheckCircle2 className="h-[1.1em] w-[1.1em] text-emerald-400" /> realizada</li>
            <li className="flex items-center gap-[0.5em]"><UserX className="h-[1.1em] w-[1.1em] text-rose-400" /> cliente não compareceu</li>
            <li className="flex items-center gap-[0.5em]"><span className="rounded bg-emerald-400/20 px-[0.4em] text-[0.8em] font-bold text-emerald-300">NOVA</span> marcada hoje</li>
            <li className="text-slate-400">A cor é de quem <b className="text-slate-200">marcou</b>; “→ nome” é quem vai conduzir.</li>
          </ul>
        </Painel>
      </div>
    </div>
  );
}

function DiaCalendario({ d, reunioes, corDe, hhmm }) {
  const { semana, data } = rotuloDia(d.dia);
  const visiveis = reunioes.slice(0, 3);
  const resto = reunioes.length - visiveis.length;
  return (
    <div className={`flex min-h-0 flex-col gap-[0.4em] rounded-lg border p-[0.55em] ${d.hoje ? 'border-sky-400/70 bg-sky-400/5' : 'border-slate-800 bg-slate-950/40'} ${d.passado ? 'opacity-60' : ''}`}>
      <div className="flex items-baseline justify-between">
        <span className={`text-[1.1em] font-semibold ${d.hoje ? 'text-sky-300' : 'text-slate-200'}`}>
          {semana} <span className="font-normal text-slate-400">{data}</span>
        </span>
        {d.hoje ? <span className="rounded-full bg-sky-400 px-[0.5em] text-[0.75em] font-bold text-slate-950">HOJE</span>
          : reunioes.length > 0 && <span className="text-[0.85em] text-slate-500">{reunioes.length}</span>}
      </div>
      {!d.util ? (
        <div className="grid flex-1 place-items-center text-[0.95em] text-slate-500">Feriado</div>
      ) : reunioes.length === 0 ? (
        <div className="grid flex-1 place-items-center text-[0.9em] text-slate-600">—</div>
      ) : (
        <ul className="flex min-h-0 flex-1 flex-col gap-[0.35em] overflow-hidden">
          {visiveis.map((r) => <CartaoReuniao key={r.id} r={r} cor={corDe(r.marcou_id)} jaPassou={d.hoje && r.hora < hhmm} />)}
          {resto > 0 && <li className="text-center text-[0.85em] text-slate-400">+{resto} {resto === 1 ? 'reunião' : 'reuniões'}</li>}
        </ul>
      )}
    </div>
  );
}

function CartaoReuniao({ r, cor, jaPassou }) {
  const realizada = r.status === 'realizada';
  const faltou = r.status === 'faltou';
  return (
    <li className={`rounded-md border-l-4 bg-slate-800/60 px-[0.5em] py-[0.3em] ${cor.borda} ${faltou ? 'opacity-60' : ''}`}>
      <div className="flex items-center gap-[0.4em]">
        <span className={`font-mono text-[0.95em] font-semibold tabular-nums ${realizada ? 'text-emerald-300' : faltou ? 'text-rose-300 line-through' : jaPassou ? 'text-slate-400' : 'text-sky-300'}`}>{r.hora}</span>
        {realizada && <CheckCircle2 className="h-[0.95em] w-[0.95em] text-emerald-400" />}
        {faltou && <UserX className="h-[0.95em] w-[0.95em] text-rose-400" />}
        {r.marcada_hoje && <span className="rounded bg-emerald-400/20 px-[0.35em] text-[0.7em] font-bold text-emerald-300">NOVA</span>}
        <span className="ml-auto truncate text-[0.78em] text-slate-500">{r.tipo}</span>
      </div>
      <div className="truncate text-[0.92em] text-slate-200" title={r.lead}>{r.lead}</div>
      <div className="truncate text-[0.82em]">
        <span className={cor.texto}>{r.marcou || 'sem registro'}</span>
        {r.conduz && <span className="text-slate-400"> → {r.conduz}</span>}
      </div>
    </li>
  );
}
