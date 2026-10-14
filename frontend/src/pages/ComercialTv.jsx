import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  Phone, MessageCircle, UserPlus, CalendarCheck, Trophy, Radio, Maximize2, X,
  CalendarClock, Activity, Target,
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

  // Esconde o cursor parado; F = tela cheia
  useEffect(() => {
    let id;
    const mexeu = () => { setCursor(true); clearTimeout(id); id = setTimeout(() => setCursor(false), 3000); };
    const tecla = (e) => { if (e.key === 'f' || e.key === 'F') telaCheia(); };
    mexeu();
    window.addEventListener('mousemove', mexeu);
    window.addEventListener('keydown', tecla);
    return () => { clearTimeout(id); window.removeEventListener('mousemove', mexeu); window.removeEventListener('keydown', tecla); };
  }, []);

  const esperadoDia = esperadoAgora(agora);
  const esperadoMes = dados
    ? pct(dados.dia_util.util_hoje ? Math.max(0, dados.dia_util.n - 1) + esperadoDia / 100 : dados.dia_util.n, dados.dia_util.de)
    : null;

  return (
    <div className={`fixed inset-0 overflow-hidden bg-[#0b1220] text-slate-100 ${cursor ? '' : 'cursor-none'}`}
      style={{ fontSize: 'clamp(12px, 0.95vw, 22px)' }}>
      <div className="flex h-full flex-col gap-[1.1em] p-[1.4em]">
        <Cabecalho agora={agora} dados={dados} aoVivo={aoVivo} cursor={cursor} />

        {erro && (
          <div className="rounded-lg border border-amber-500/40 bg-amber-500/10 px-4 py-2 text-[1.1em] text-amber-200">{erro}</div>
        )}

        {!dados ? (
          <div className="grid flex-1 place-items-center text-[2em] text-slate-500">Carregando o painel…</div>
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
    <Painel titulo="Funil agora" icone={Activity} className="flex-1">
      <div className="flex min-h-0 flex-1 flex-col justify-around gap-[0.4em]">
        {funil.map((e) => (
          <div key={e.k} className="grid grid-cols-[12.5em_1fr_3em] items-center gap-[0.6em]">
            <span className="truncate text-[1em] text-slate-300" title={e.nome}>{e.nome}</span>
            <div className="h-[1.1em] overflow-hidden rounded bg-slate-800">
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
                  {r.novos}{r.meta_novos ? `/${r.meta_novos}` : ''} novos · mês: {r.mes_pagos} pago{r.mes_pagos === 1 ? '' : 's'}
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
