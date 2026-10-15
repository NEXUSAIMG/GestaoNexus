import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  Phone, MessageCircle, UserPlus, CalendarCheck, Trophy, Radio, Maximize2, X,
  CalendarClock, Activity, Target, CalendarDays, LayoutDashboard, CheckCircle2, UserX, Sparkles,
  FlaskConical, AlertTriangle, Hourglass, Gauge, FileText, CalendarRange, Pause, Play,
  Map as MapIcon, Flame, Thermometer,
} from 'lucide-react';
import { api, BASE_URL, mensagemDeErro } from '../api/client.js';
// Mapa do Brasil: @svg-maps/brazil (CC BY 4.0) — crédito exibido na tela do mapa
import mapaBrasil from '@svg-maps/brazil';

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
 * pela URL: /comercial/tv?painel=40&funil=30&mapa=30&mes=30&trial=25&reunioes=25 · ?fixo=mapa trava numa tela.
 * Na própria TV: botão Pausar no rodapé ou barra de espaço (fica guardado no navegador).
 */
const TELAS = [
  { k: 'painel', nome: 'Painel do dia', icone: LayoutDashboard, padrao: 40 },
  { k: 'funil', nome: 'Funil quente', icone: Flame, padrao: 30 },
  { k: 'mapa', nome: 'Mapa', icone: MapIcon, padrao: 30 },
  { k: 'mes', nome: 'Visão do mês', icone: CalendarRange, padrao: 30 },
  { k: 'trial', nome: 'Trials', icone: FlaskConical, padrao: 25 },
  { k: 'reunioes', nome: 'Reuniões marcadas', icone: CalendarDays, padrao: 25 },
];
/** Tela de trials só entra na roda se houver trial em andamento ou no mês. */
const telaDisponivel = (k, dados) => k !== 'trial'
  || !!(dados?.trial && (dados.trial.resumo.em_andamento > 0 || dados.trial.mes.iniciados > 0));
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
  const [tela, setTela] = useState(() => {
    if (config.fixo) return config.fixo;
    try { return localStorage.getItem('tv_pausado') === '1' ? (localStorage.getItem('tv_tela') || 'painel') : 'painel'; } catch { return 'painel'; }
  });
  const [giro, setGiro] = useState(0); // muda a cada troca (reinicia a barrinha de progresso)
  // Pausa da alternância: guardada no navegador da TV (sobrevive à recarga das 3h)
  const [pausado, setPausado] = useState(() => {
    try { return localStorage.getItem('tv_pausado') === '1'; } catch { return false; }
  });
  const alternarPausa = useCallback(() => {
    setPausado((p) => {
      try { localStorage.setItem('tv_pausado', p ? '0' : '1'); } catch { /* sem storage */ }
      return !p;
    });
    setGiro((g) => g + 1);
  }, []);
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
  const dadosRef = useRef(null);
  dadosRef.current = dados;
  const proxima = useCallback((passo = 1) => {
    setTela((atual) => {
      let i = TELAS.findIndex((t) => t.k === atual);
      for (let n = 0; n < TELAS.length; n++) {
        i = (i + passo + TELAS.length) % TELAS.length;
        if (telaDisponivel(TELAS[i].k, dadosRef.current)) return TELAS[i].k;
      }
      return 'painel';
    });
    setGiro((g) => g + 1);
  }, []);
  useEffect(() => {
    try { localStorage.setItem('tv_tela', tela); } catch { /* sem storage */ }
    if (config.fixo || celebrar || pausado) return undefined;
    const id = setTimeout(() => proxima(1), config.dur[tela] * 1000);
    return () => clearTimeout(id);
  }, [tela, giro, celebrar, pausado, config, proxima]);

  // Esconde o cursor parado; F = tela cheia
  useEffect(() => {
    let id;
    const mexeu = () => { setCursor(true); clearTimeout(id); id = setTimeout(() => setCursor(false), 3000); };
    const tecla = (e) => {
      if (e.key === 'f' || e.key === 'F') telaCheia();
      else if (e.key === 'ArrowRight') proxima(1);
      else if (e.key === 'ArrowLeft') proxima(-1);
      else if (e.key === ' ' || e.code === 'Space') { e.preventDefault(); alternarPausa(); }
    };
    mexeu();
    window.addEventListener('mousemove', mexeu);
    window.addEventListener('keydown', tecla);
    return () => { clearTimeout(id); window.removeEventListener('mousemove', mexeu); window.removeEventListener('keydown', tecla); };
  }, [proxima, alternarPausa]);

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
            ) : tela === 'mapa' && dados.mapa ? (
              <TelaMapa m={dados.mapa} />
            ) : tela === 'funil' && dados.funil_quente ? (
              <TelaFunilQuente f={dados.funil_quente} />
            ) : tela === 'mes' && dados.mes_visao ? (
              <TelaMes v={dados.mes_visao} esperado={esperadoMes} />
            ) : tela === 'trial' && dados.trial ? (
              <TelaTrial tr={dados.trial} hoje={dados.hoje} />
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
          <Indicador tela={tela} giro={giro} config={config} parado={!!celebrar || pausado} pausado={pausado} onPausa={alternarPausa} onIr={irPara} dados={dados} />
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
function Indicador({ tela, giro, config, parado, pausado, onPausa, onIr, dados }) {
  return (
    <div className="absolute inset-x-0 bottom-[0.35em] flex items-center justify-center gap-[0.8em]">
      {!config.fixo && (
        <button type="button" onClick={onPausa} title={pausado ? 'Retomar a alternância (espaço)' : 'Parar nesta tela (espaço)'}
          className={`flex items-center gap-[0.4em] rounded-full px-[0.9em] py-[0.3em] text-[0.95em] font-semibold ${pausado ? 'bg-amber-400 text-slate-950' : 'bg-slate-800/70 text-slate-300 hover:text-white'}`}>
          {pausado ? <Play className="h-[1em] w-[1em]" /> : <Pause className="h-[1em] w-[1em]" />}
          {pausado ? 'Pausado · retomar' : 'Pausar'}
        </button>
      )}
      {TELAS.filter((t) => telaDisponivel(t.k, dados)).map((t) => {
        const ativa = t.k === tela;
        const Icone = t.icone;
        return (
          <button key={t.k} type="button" onClick={() => onIr(t.k)}
            className={`relative flex items-center gap-[0.45em] overflow-hidden rounded-full px-[0.9em] py-[0.3em] text-[0.95em] transition-colors ${ativa ? 'bg-slate-800 text-slate-100' : 'text-slate-500 hover:text-slate-300'}`}>
            <Icone className="h-[1em] w-[1em]" /> {t.nome}
            {ativa && !config.fixo && !pausado && (
              <span key={giro} className="tv-progresso absolute bottom-0 left-0 h-[2px] bg-sky-400"
                style={{ animationDuration: `${config.dur[t.k]}s`, animationPlayState: parado ? 'paused' : 'running' }} />
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

// ─────────────────────────────────────────────────────────────────────────
// Sprint 42O — Controle do trial
// ─────────────────────────────────────────────────────────────────────────
const NIVEL_TRIAL = {
  crit: { faixa: 'bg-rose-500', pill: 'bg-rose-500/15 text-rose-300 ring-rose-500/40' },
  warn: { faixa: 'bg-amber-400', pill: 'bg-amber-400/15 text-amber-200 ring-amber-400/40' },
  ok: { faixa: 'bg-emerald-400', pill: 'bg-emerald-400/10 text-emerald-300 ring-emerald-400/30' },
};
const dataCurta = (iso) => (iso ? `${iso.slice(8, 10)}/${iso.slice(5, 7)}` : '—');
const diasAte = (de, ate) => Math.round((new Date(ate + 'T12:00:00') - new Date(de + 'T12:00:00')) / 864e5);

function TelaTrial({ tr, hoje }) {
  const { resumo: r, mes: m, ativos } = tr;
  const visiveis = ativos.slice(0, 5);
  const resto = ativos.length - visiveis.length;
  const tiles = [
    { icone: FlaskConical, rotulo: 'Em andamento', valor: r.em_andamento },
    { icone: AlertTriangle, rotulo: 'Precisam de ação', valor: r.criticos, cor: r.criticos ? 'text-rose-300' : '' },
    { icone: Hourglass, rotulo: 'Marcos atrasados', valor: r.marcos_atrasados, cor: r.marcos_atrasados ? 'text-amber-300' : '' },
    { icone: CalendarClock, rotulo: 'Decidem em 7 dias', valor: r.decidem_semana, cor: 'text-sky-300' },
    { icone: Gauge, rotulo: 'Uso médio', valor: r.uso_medio == null ? '—' : `${r.uso_medio}`, sufixo: r.uso_medio == null ? '' : 'pts',
      cor: r.uso_medio == null ? '' : r.uso_medio < 40 ? 'text-rose-300' : r.uso_medio < 60 ? 'text-amber-300' : 'text-emerald-300' },
  ];
  return (
    <div className="grid min-h-0 flex-1 grid-cols-12 gap-[1.1em]">
      <section className="col-span-9 flex min-h-0 flex-col gap-[0.8em] rounded-xl border border-slate-800 bg-slate-900/70 p-[1em]">
        <div className="flex items-center justify-between">
          <h2 className="flex items-center gap-[0.5em] text-[1.5em] font-semibold text-slate-100">
            <FlaskConical className="h-[1.1em] w-[1.1em] text-amber-300" /> Trials em andamento
            <span className="text-[0.65em] font-normal text-slate-400">14 dias guiados até a decisão</span>
          </h2>
        </div>
        <div className="grid grid-cols-5 gap-[0.6em]">
          {tiles.map((t) => (
            <div key={t.rotulo} className="rounded-lg bg-slate-800/60 px-[0.8em] py-[0.5em]">
              <div className="flex items-center gap-[0.4em] text-[0.9em] text-slate-400"><t.icone className="h-[1em] w-[1em]" /> {t.rotulo}</div>
              <div className={`text-[2.2em] font-bold leading-tight tabular-nums ${t.cor || ''}`}>{t.valor}<span className="text-[0.5em] font-medium text-slate-400"> {t.sufixo}</span></div>
            </div>
          ))}
        </div>
        {ativos.length === 0 ? (
          <div className="grid flex-1 place-items-center text-[1.4em] text-slate-500">Nenhum trial em andamento agora.</div>
        ) : (
          <ul className="flex min-h-0 flex-1 flex-col gap-[0.55em] overflow-hidden">
            {visiveis.map((t) => <LinhaTrialTv key={t.id} t={t} hoje={hoje} />)}
            {resto > 0 && <li className="text-center text-[0.95em] text-slate-400">+{resto} trial{resto === 1 ? '' : 's'} em andamento (veja a aba Trial no Comercial)</li>}
          </ul>
        )}
      </section>

      <div className="col-span-3 flex min-h-0 flex-col gap-[1.1em]">
        <Painel titulo="Trials do mês" icone={Target}>
          <div className="mb-[0.3em] flex items-baseline justify-between">
            <span className="text-[1.05em] text-slate-300">Iniciados</span>
            <span className="tabular-nums"><span className="text-[1.9em] font-bold">{m.iniciados}</span>{m.meta_iniciados > 0 && <span className="text-[1.1em] text-slate-500"> / {m.meta_iniciados}</span>}</span>
          </div>
          {m.meta_iniciados > 0 && <BarraMeta feito={m.iniciados} meta={m.meta_iniciados} nivel={nivel(m.iniciados, m.meta_iniciados, null)} grossa />}
          <dl className="mt-[0.8em] grid grid-cols-2 gap-[0.5em]">
            {[['Viraram cliente', m.ganhos, 'text-emerald-300'], ['Já pagaram', m.pagos, 'text-emerald-300'], ['Pensando', m.pensando, 'text-sky-300'], ['Perdidos', m.perdidos, 'text-rose-300']].map(([rot, v, cor]) => (
              <div key={rot} className="rounded-lg bg-slate-800/50 px-[0.6em] py-[0.4em]">
                <dt className="text-[0.85em] text-slate-400">{rot}</dt>
                <dd className={`text-[1.7em] font-bold leading-tight tabular-nums ${v ? cor : 'text-slate-500'}`}>{v}</dd>
              </div>
            ))}
          </dl>
          <div className="mt-[0.7em] text-[1em] text-slate-300">
            Conversão do trial: <b className="text-[1.3em] tabular-nums text-slate-100">{m.conversao == null ? '—' : `${m.conversao}%`}</b>
            <span className="text-slate-500"> dos que decidiram</span>
          </div>
        </Painel>
        <Painel titulo="Por que perdemos" icone={UserX} className="flex-1">
          {m.motivos_perda.length === 0 ? (
            <div className="text-[1em] text-slate-500">Nenhum trial perdido este mês.</div>
          ) : (
            <ul className="flex flex-col gap-[0.4em]">
              {m.motivos_perda.slice(0, 4).map((x) => (
                <li key={x.motivo} className="flex items-center justify-between text-[1.02em]">
                  <span className="truncate text-slate-300">{x.motivo}</span>
                  <span className="font-semibold tabular-nums text-rose-300">{x.n}</span>
                </li>
              ))}
            </ul>
          )}
          <div className="mt-auto border-t border-slate-800 pt-[0.6em] text-[0.88em] leading-snug text-slate-400">
            Uso abaixo de 40 pts a partir do D3: <b className="text-slate-200">ligar no mesmo dia</b>. Prorrogar só pela gestão, uma vez, até 7 dias.
          </div>
        </Painel>
      </div>
    </div>
  );
}

function LinhaTrialTv({ t, hoje }) {
  const nv = NIVEL_TRIAL[t.nivel] || NIVEL_TRIAL.ok;
  const faltam = diasAte(hoje, t.fim);
  const posHoje = Math.max(0, Math.min(100, (t.dia / 14) * 100));
  return (
    <li className="relative flex min-h-0 flex-1 items-stretch gap-[0.9em] overflow-hidden rounded-lg bg-slate-800/50 py-[0.55em] pl-[1em] pr-[0.8em]">
      <span className={`absolute inset-y-0 left-0 w-[0.35em] ${nv.faixa}`} />
      {/* identificação */}
      <div className="flex w-[19em] shrink-0 flex-col justify-center">
        <div className="truncate text-[1.3em] font-semibold" title={t.nome}>{t.nome}</div>
        <div className="truncate text-[0.9em] text-slate-400">{t.dono || 'sem dono'}{t.local ? ` · ${t.local}` : ''}</div>
        <div className="mt-[0.25em] flex flex-wrap items-center gap-[0.35em]">
          <span className={`rounded-full px-[0.6em] py-[0.05em] text-[0.8em] font-semibold ring-1 ${nv.pill}`}>{t.texto}</span>
          {t.prorrogado && <span className="rounded-full bg-violet-400/15 px-[0.5em] text-[0.75em] text-violet-300">prorrogado</span>}
          {t.tem_proposta && <span className="inline-flex items-center gap-[0.2em] rounded-full bg-sky-400/10 px-[0.5em] text-[0.75em] text-sky-300"><FileText className="h-[0.9em] w-[0.9em]" />proposta</span>}
        </div>
      </div>
      {/* linha do tempo D0–D14 */}
      <div className="flex min-w-0 flex-1 flex-col justify-center">
        <div className="mb-[0.2em] flex items-baseline justify-between text-[0.85em]">
          <span className="font-semibold text-slate-200">{t.dia <= 14 ? `Dia ${Math.max(0, t.dia)} de 14` : `Dia ${t.dia} · ${t.dia - 14} além dos 14`}</span>
          <span className={t.vencido ? 'font-semibold text-rose-300' : faltam <= 2 ? 'font-semibold text-amber-300' : 'text-slate-400'}>
            {t.vencido ? `decisão venceu em ${dataCurta(t.fim)}` : faltam === 0 ? 'decide hoje' : `decide ${dataCurta(t.fim)} · em ${faltam} dia${faltam === 1 ? '' : 's'}`}
          </span>
        </div>
        <div className="relative mx-[0.6em] h-[2.6em]">
          <div className="absolute inset-x-0 top-[0.75em] h-[3px] rounded bg-slate-700" />
          <div className="absolute left-0 top-[0.75em] h-[3px] rounded bg-sky-500/70" style={{ width: `${posHoje}%` }} />
          {!t.vencido && <div className="absolute top-[0.2em] h-[1.4em] w-[2px] bg-white/80" style={{ left: `${posHoje}%` }} title="hoje" />}
          {t.marcos.map((mk) => {
            const left = (mk.d / 14) * 100;
            const est = {
              feito: 'bg-emerald-400 border-emerald-400',
              atrasado: 'bg-rose-500 border-rose-400 animate-pulse',
              hoje: 'bg-amber-400 border-amber-300',
              futuro: 'bg-slate-900 border-slate-500',
            }[mk.estado];
            return (
              <div key={mk.d} className="absolute flex -translate-x-1/2 flex-col items-center" style={{ left: `${left}%` }} title={`D${mk.d} · ${mk.n} · ${dataCurta(mk.previsto)}`}>
                <span className={`mt-[0.35em] h-[0.85em] w-[0.85em] rounded-full border-2 ${est}`} />
                <span className={`mt-[0.15em] text-[0.72em] tabular-nums ${mk.estado === 'atrasado' ? 'font-bold text-rose-300' : mk.estado === 'hoje' ? 'font-bold text-amber-300' : 'text-slate-500'}`}>D{mk.d}</span>
              </div>
            );
          })}
        </div>
        <div className="truncate text-[0.88em]">
          {t.proximo ? (
            <span className={t.proximo.atrasado ? 'text-rose-300' : 'text-slate-300'}>
              <b>Próximo: D{t.proximo.d} · {t.proximo.n}</b> {t.proximo.atrasado ? `— atrasado desde ${dataCurta(t.proximo.previsto)}` : `— ${t.proximo.previsto === hoje ? 'hoje' : dataCurta(t.proximo.previsto)}`}
            </span>
          ) : <span className="text-emerald-300">Todos os marcos feitos — registrar a decisão</span>}
        </div>
      </div>
      {/* uso */}
      <div className="flex w-[9.5em] shrink-0 flex-col justify-center">
        <div className="flex items-baseline gap-[0.3em]">
          <span className={`text-[2em] font-bold leading-none tabular-nums ${t.pontos < 40 ? 'text-rose-300' : t.pontos < 60 ? 'text-amber-300' : 'text-emerald-300'}`}>{t.pontos}</span>
          <span className="text-[0.85em] text-slate-400">pts de uso</span>
        </div>
        <div className="mt-[0.35em] flex gap-[0.25em]">
          {t.sinais.map((x) => (
            <span key={x.k} title={x.n} className={`h-[0.5em] flex-1 rounded-full ${x.ok ? 'bg-emerald-400' : 'bg-slate-700'}`} />
          ))}
        </div>
        <div className="mt-[0.3em] truncate text-[0.78em] text-slate-500">
          {t.reuniao_resultado ? `resultado ${dataCurta(t.reuniao_resultado.slice(0, 10))} ${t.reuniao_resultado.slice(11)}` : 'sem reunião de resultado'}
        </div>
      </div>
    </li>
  );
}

// ─────────────────────────────────────────────────────────────────────────
// Sprint 42O — Visão do mês
// ─────────────────────────────────────────────────────────────────────────
const fmtNum = (n, moeda) => (moeda ? brl(n) : Number(n || 0).toLocaleString('pt-BR'));

function TelaMes({ v, esperado }) {
  const nomeMes = new Date(v.inicio + 'T12:00:00').toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' });
  return (
    <div className="flex min-h-0 flex-1 flex-col gap-[1.1em]">
      <div className="grid grid-cols-5 gap-[1.1em]">
        {v.indicadores.map((i) => {
          const nv = nivel(i.feito, i.meta, esperado);
          const batera = i.meta > 0 && i.projecao >= i.meta;
          return (
            <div key={i.k} className="flex flex-col gap-[0.4em] rounded-xl border border-slate-800 bg-slate-900/70 p-[1em]">
              <div className="text-[1.05em] text-slate-400">{i.nome}</div>
              <div className="flex items-baseline gap-[0.35em]">
                <span className={`font-bold leading-none tabular-nums ${i.moeda ? 'text-[2.4em]' : 'text-[3.2em]'}`}>{fmtNum(i.feito, i.moeda)}</span>
                {i.meta > 0 && <span className="text-[1.2em] text-slate-500 tabular-nums">/ {fmtNum(i.meta, i.moeda)}</span>}
              </div>
              {i.meta > 0 && <BarraMeta feito={i.feito} meta={i.meta} nivel={nv} esperado={esperado} grossa />}
              <div className="flex items-baseline justify-between text-[0.95em]">
                <span className="text-slate-400">{i.meta > 0 ? `${pct(i.feito, i.meta)}% da meta` : 'sem meta'}</span>
                <span className={batera ? 'font-semibold text-emerald-300' : 'font-semibold text-amber-300'} title="Projeção de fechamento no ritmo atual">
                  projeção {fmtNum(i.projecao, i.moeda)}
                </span>
              </div>
            </div>
          );
        })}
      </div>
      <div className="grid min-h-0 flex-1 grid-cols-12 gap-[1.1em]">
        <div className="col-span-8 flex min-h-0 flex-col gap-[1.1em]">
          <Painel titulo={`Contatos por dia útil · ${nomeMes}`} icone={Activity} className="flex-1"
            extra={<span className="text-[0.95em] text-slate-400">dia útil {v.dia_util.n} de {v.dia_util.de} · ritmo esperado {esperado ?? '—'}%</span>}>
            <GraficoDias dias={v.dias.filter((d) => d.util)} metaDia={v.meta_dia_toques} />
          </Painel>
          <FunilMes f={v.funil} />
        </div>
        <Painel titulo="Ranking do mês" icone={Trophy} className="col-span-4"
          extra={<span className="text-[0.9em] text-slate-400">pago › fechado › reunião</span>}>
          {v.ranking.length === 0 ? (
            <div className="text-[1.1em] text-slate-500">Sem atividade no mês ainda.</div>
          ) : (
            <div className="flex min-h-0 flex-1 flex-col gap-[0.45em] overflow-hidden">
              <div className="grid grid-cols-[2em_1fr_3.2em_3.2em_3.6em_4em] gap-[0.4em] px-[0.4em] text-[0.82em] uppercase tracking-wide text-slate-500">
                <span /><span>Vendedor</span><span className="text-center">Pago</span><span className="text-center">Fech.</span><span className="text-center">Reun.</span><span className="text-right">Cont.</span>
              </div>
              {v.ranking.slice(0, 8).map((r, i) => (
                <div key={r.id} className={`grid grid-cols-[2em_1fr_3.2em_3.2em_3.6em_4em] items-center gap-[0.4em] rounded-lg px-[0.4em] py-[0.5em] ${i === 0 && (r.pagos || r.ganhos) ? 'bg-amber-400/10 ring-1 ring-amber-400/40' : 'bg-slate-800/50'}`}>
                  <span className={`grid h-[1.7em] w-[1.7em] place-items-center rounded-full text-[0.95em] font-bold ${MEDALHA[i] || 'bg-slate-700 text-slate-200'}`}>{i + 1}</span>
                  <div className="min-w-0">
                    <div className="truncate text-[1.25em] font-semibold">{r.nome}</div>
                    <div className="truncate text-[0.82em] text-slate-400">{r.receita ? `${brl(r.receita)}/mês` : `${r.propostas} proposta${r.propostas === 1 ? '' : 's'}`}</div>
                  </div>
                  <span className={`text-center text-[1.4em] font-bold tabular-nums ${r.pagos ? 'text-emerald-300' : 'text-slate-500'}`}>{r.pagos}</span>
                  <span className="text-center text-[1.25em] tabular-nums">{r.ganhos}</span>
                  <span className="text-center text-[1.25em] tabular-nums">{r.reunioes}</span>
                  <span className="text-right text-[1.1em] tabular-nums text-slate-300">{r.toques}</span>
                </div>
              ))}
            </div>
          )}
        </Painel>
      </div>
    </div>
  );
}

/** Barras dos dias úteis do mês com a linha da meta diária de contatos. */
function GraficoDias({ dias, metaDia }) {
  const max = Math.max(metaDia || 0, ...dias.map((d) => d.toques), 1) * 1.12;
  const yMeta = metaDia ? (metaDia / max) * 100 : null;
  return (
    <div className="relative flex min-h-0 flex-1 flex-col">
      <div className="relative flex min-h-0 flex-1 items-end gap-[0.35em] border-b border-slate-700 pb-0">
        {yMeta != null && (
          <div className="pointer-events-none absolute inset-x-0 border-t-2 border-dashed border-amber-300/70" style={{ bottom: `${yMeta}%` }}>
            <span className="absolute -top-[1.5em] right-0 rounded bg-slate-900 px-[0.4em] text-[0.82em] font-semibold text-amber-200">meta {metaDia}/dia</span>
          </div>
        )}
        {dias.map((d) => {
          const h = d.futuro ? 0 : (d.toques / max) * 100;
          const bateu = metaDia && d.toques >= metaDia;
          return (
            <div key={d.dia} className="flex h-full min-w-0 flex-1 flex-col items-center justify-end">
              {!d.futuro && <span className={`mb-[0.15em] text-[0.8em] tabular-nums ${d.hoje ? 'font-bold text-amber-200' : 'text-slate-400'}`}>{d.toques}</span>}
              <div className={`w-full rounded-t ${d.futuro ? 'h-[3px] bg-slate-800' : bateu ? 'bg-emerald-400/85' : 'bg-sky-500/75'} ${d.hoje ? 'ring-2 ring-amber-300' : ''}`}
                style={d.futuro ? undefined : { height: `${Math.max(h, 1.5)}%` }} title={`${d.dia}: ${d.toques} contatos, ${d.reunioes} reuniões`} />
            </div>
          );
        })}
      </div>
      <div className="mt-[0.3em] flex gap-[0.35em]">
        {dias.map((d) => (
          <span key={d.dia} className={`min-w-0 flex-1 text-center text-[0.78em] tabular-nums ${d.hoje ? 'font-bold text-amber-200' : d.futuro ? 'text-slate-600' : 'text-slate-400'}`}>{Number(d.dia.slice(8))}</span>
        ))}
      </div>
      <div className="mt-[0.4em] flex items-center gap-[1.2em] text-[0.85em] text-slate-400">
        <span className="flex items-center gap-[0.35em]"><span className="h-[0.8em] w-[0.8em] rounded-sm bg-emerald-400/85" />bateu a meta do dia</span>
        <span className="flex items-center gap-[0.35em]"><span className="h-[0.8em] w-[0.8em] rounded-sm bg-sky-500/75" />abaixo da meta</span>
        <span className="flex items-center gap-[0.35em]"><span className="h-[0.8em] w-[0.8em] rounded-sm ring-2 ring-amber-300" />hoje (em andamento)</span>
      </div>
    </div>
  );
}

function FunilMes({ f }) {
  const passos = [
    { rot: 'Contato → reunião', ...f.contato_reuniao },
    { rot: 'Reunião → trial', ...f.reuniao_trial },
    { rot: 'Trial → pago', ...f.trial_pago },
  ];
  return (
    <div className="grid grid-cols-4 gap-[0.8em]">
      {passos.map((p) => {
        const ok = p.real != null && p.meta != null && p.real >= p.meta;
        return (
          <div key={p.rot} className="rounded-xl border border-slate-800 bg-slate-900/70 px-[1em] py-[0.7em]">
            <div className="text-[0.95em] text-slate-400">{p.rot}</div>
            <div className="flex items-baseline gap-[0.4em]">
              <span className={`text-[2.1em] font-bold tabular-nums ${p.real == null ? 'text-slate-500' : ok ? 'text-emerald-300' : 'text-amber-300'}`}>{p.real == null ? '—' : `${Math.min(p.real, 999).toLocaleString('pt-BR')}%`}</span>
              {p.meta != null && <span className="text-[1em] text-slate-500">meta {p.meta}%</span>}
            </div>
          </div>
        );
      })}
      <div className="rounded-xl border border-slate-800 bg-slate-900/70 px-[1em] py-[0.7em]">
        <div className="text-[0.95em] text-slate-400">Conexão (atenderam)</div>
        <div className="text-[2.1em] font-bold tabular-nums text-slate-100">{f.conexao == null ? '—' : `${f.conexao.toLocaleString('pt-BR')}%`}</div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────
// Sprint 42P — Mapa da presença
// ─────────────────────────────────────────────────────────────────────────
// Do frio ao quente; cliente fecha em verde. Mesmas chaves de ESTAGIOS_MAPA (backend).
const COR_ESTAGIO = {
  cliente: '#10b981', trial: '#f97316', negociacao: '#f59e0b', reuniao: '#0ea5e9', contato: '#2563a8', prospeccao: '#3b4a5e',
};
const SEM_PRESENCA = '#1a2536';
const CALLOUT = ['RN', 'PB', 'PE', 'AL', 'SE', 'DF', 'ES', 'RJ'];
const COL_CHAMADA = 640;

function TelaMapa({ m }) {
  const porUf = useMemo(() => Object.fromEntries(m.estados.map((u) => [u.uf, u])), [m.estados]);
  const svgRef = useRef(null);
  const [centros, setCentros] = useState({});
  useEffect(() => {
    const el = svgRef.current;
    if (!el) return;
    const c = {};
    el.querySelectorAll('path[data-uf]').forEach((p) => {
      const b = p.getBBox();
      c[p.dataset.uf] = { x: b.x + b.width / 2, y: b.y + b.height / 2, w: b.width, h: b.height };
    });
    setCentros(c);
  }, []);
  // Ajustes finos de rótulo onde o centro do retângulo cai fora do estado
  const AJUSTE = { PA: { x: 0, y: 10 }, AM: { x: 0, y: 6 }, MG: { x: 6, y: 0 }, BA: { x: -6, y: 4 }, GO: { x: 0, y: 6 }, PI: { x: 4, y: 16 }, MA: { x: -6, y: -4 }, CE: { x: 0, y: -2 } };
  // Estados pequenos ou estreitos: rótulo fora do mapa, empilhado na coluna do mar
  const chamadas = useMemo(() => {
    const lista = CALLOUT.filter((uf) => centros[uf]).map((uf) => ({ uf, x: centros[uf].x, y: centros[uf].y }))
      .sort((a, b) => a.y - b.y);
    let ult = -Infinity;
    lista.forEach((c) => { c.ly = Math.max(c.y, ult + 23); ult = c.ly; });
    return lista;
  }, [centros]);
  const presentes = m.estados.length;
  const kpis = [
    { rot: 'Estados com cliente', v: m.estados_com.cliente, cor: COR_ESTAGIO.cliente },
    { rot: 'Negociando (trial, proposta, reunião)', v: m.estados.filter((u) => u.trial || u.negociacao || u.reuniao).length, cor: COR_ESTAGIO.negociacao },
    { rot: 'Com alguma presença', v: presentes, sufixo: '/ 27', cor: '#cbd5e1' },
  ];
  return (
    <div className="grid min-h-0 flex-1 grid-cols-12 gap-[1.1em]">
      <section className="relative col-span-7 flex min-h-0 flex-col rounded-xl border border-slate-800 bg-slate-900/70 p-[1em]">
        <h2 className="flex items-center gap-[0.5em] text-[1.5em] font-semibold text-slate-100">
          <MapIcon className="h-[1.1em] w-[1.1em] text-sky-400" /> Nossa presença no Brasil
        </h2>
        <div className="relative min-h-0 flex-1">
          <svg ref={svgRef} viewBox="0 0 715 639" className="absolute inset-0 h-full w-full" role="img" aria-label="Mapa do Brasil colorido pelo estágio mais avançado em cada estado">
            {mapaBrasil.locations.map((loc) => {
              const uf = loc.id.toUpperCase();
              const u = porUf[uf];
              return (
                <path key={loc.id} data-uf={uf} d={loc.path}
                  fill={u ? COR_ESTAGIO[u.melhor] : SEM_PRESENCA}
                  stroke="#0b1220" strokeWidth="1.2" strokeLinejoin="round">
                  <title>{loc.name}</title>
                </path>
              );
            })}
            {Object.entries(centros).filter(([uf]) => !CALLOUT.includes(uf)).map(([uf, c]) => {
              const u = porUf[uf];
              const aj = AJUSTE[uf] || { x: 0, y: 0 };
              const x = c.x + aj.x; const y = c.y + aj.y;
              const destaque = u && u.melhor !== 'prospeccao';
              const fundoClaro = u && ['cliente', 'trial', 'negociacao', 'reuniao'].includes(u.melhor);
              return (
                <g key={uf} pointerEvents="none">
                  <text x={x} y={y + (destaque ? -2 : 4)} textAnchor="middle" fontSize="13" fontWeight="700"
                    fill={fundoClaro ? '#0b1220' : '#e2e8f0'}>{uf}</text>
                  {destaque && (
                    <text x={x} y={y + 13} textAnchor="middle" fontSize="11" fontWeight="600"
                      fill={fundoClaro ? '#0b1220' : '#cbd5e1'}>
                      {u.cliente ? `${u.cliente} cliente${u.cliente === 1 ? '' : 's'}` : `${u.ativos} ativo${u.ativos === 1 ? '' : 's'}`}
                    </text>
                  )}
                </g>
              );
            })}
            {chamadas.map(({ uf, x, y, ly }) => {
              const u = porUf[uf];
              const destaque = u && u.melhor !== 'prospeccao';
              return (
                <g key={uf} pointerEvents="none">
                  <circle cx={x} cy={y} r="2.2" fill="#94a3b8" />
                  <polyline points={`${x},${y} ${COL_CHAMADA - 30},${ly} ${COL_CHAMADA - 6},${ly}`} fill="none" stroke="#64748b" strokeWidth="0.8" />
                  <rect x={COL_CHAMADA - 4} y={ly - 9} width="10" height="10" rx="2" fill={u ? COR_ESTAGIO[u.melhor] : SEM_PRESENCA} stroke="#475569" strokeWidth="0.6" />
                  <text x={COL_CHAMADA + 11} y={ly + 0.5} fontSize="12.5" fontWeight="700" fill={destaque ? '#f8fafc' : '#94a3b8'}>{uf}</text>
                  {destaque && (
                    <text x={COL_CHAMADA + 33} y={ly + 0.5} fontSize="11" fontWeight="600" fill={COR_ESTAGIO[u.melhor] === '#2563a8' ? '#7cb4ee' : COR_ESTAGIO[u.melhor]}>
                      {u.cliente ? `${u.cliente} cli.` : `${u.ativos} at.`}
                    </text>
                  )}
                </g>
              );
            })}
          </svg>
        </div>
        <div className="mt-[0.5em] flex flex-wrap items-center gap-x-[1.2em] gap-y-[0.3em] text-[0.95em] text-slate-300">
          {m.estagios.map((e) => (
            <span key={e.k} className="flex items-center gap-[0.4em]">
              <span className="h-[0.9em] w-[0.9em] rounded-sm" style={{ background: COR_ESTAGIO[e.k] }} />{e.n}
            </span>
          ))}
          <span className="flex items-center gap-[0.4em] text-slate-500"><span className="h-[0.9em] w-[0.9em] rounded-sm" style={{ background: SEM_PRESENCA }} />sem presença</span>
        </div>
        <div className="absolute bottom-[0.6em] right-[1em] text-[0.7em] text-slate-600">Mapa: svg-maps/brazil · CC BY 4.0</div>
      </section>

      <div className="col-span-5 flex min-h-0 flex-col gap-[1.1em]">
        <div className="grid grid-cols-3 gap-[0.8em]">
          {kpis.map((k) => (
            <div key={k.rot} className="rounded-xl border border-slate-800 bg-slate-900/70 px-[0.9em] py-[0.7em]">
              <div className="text-[0.9em] leading-tight text-slate-400">{k.rot}</div>
              <div className="text-[2.6em] font-bold leading-tight tabular-nums" style={{ color: k.cor }}>{k.v}<span className="text-[0.45em] font-medium text-slate-500"> {k.sufixo || ''}</span></div>
            </div>
          ))}
        </div>
        <Painel titulo="Por estado" icone={Target} className="flex-1"
          extra={<span className="text-[0.85em] text-slate-400">do mais avançado ao mais frio</span>}>
          <div className="grid grid-cols-[3em_1fr_4.1em_4.1em_4.1em_4.1em_4.1em_4.4em] items-end gap-x-[0.3em] px-[0.3em] pb-[0.3em] text-[1.05em]">
            {['UF', '', 'Cliente', 'Trial', 'Prop.', 'Reun.', 'Contato', 'Prosp.'].map((t, i) => (
              <span key={i} className={`text-[0.7em] uppercase tracking-wide text-slate-500 ${i === 0 ? '' : i === 7 ? 'text-right' : 'text-center'}`}>{t}</span>
            ))}
          </div>
          <div className="flex min-h-0 flex-1 flex-col gap-[0.25em] overflow-hidden">
            {m.estados.filter((u) => u.melhor !== 'prospeccao').slice(0, 12).map((u) => (
              <div key={u.uf} className="grid grid-cols-[3em_1fr_4.1em_4.1em_4.1em_4.1em_4.1em_4.4em] items-center gap-x-[0.3em] rounded-md bg-slate-800/40 px-[0.3em] py-[0.25em] text-[1.05em] tabular-nums">
                <span className="flex items-center gap-[0.35em] font-bold"><span className="h-[0.75em] w-[0.75em] rounded-sm" style={{ background: COR_ESTAGIO[u.melhor] }} />{u.uf}</span>
                <span />
                {['cliente', 'trial', 'negociacao', 'reuniao', 'contato'].map((k) => (
                  <span key={k} className="text-center font-semibold" style={{ color: u[k] ? COR_ESTAGIO[k] === '#2563a8' ? '#7cb4ee' : COR_ESTAGIO[k] : '#334155' }}>{u[k] || '·'}</span>
                ))}
                <span className="text-right text-slate-400">{u.prospeccao || '·'}</span>
              </div>
            ))}
            {m.estados.filter((u) => u.melhor === 'prospeccao').length > 0 && (
              <div className="mt-[0.3em] text-[0.9em] text-slate-400">
                Só prospecção: {m.estados.filter((u) => u.melhor === 'prospeccao').map((u) => u.uf).join(', ')}
              </div>
            )}
          </div>
          {(m.sem_uf_ativos > 0 || m.uf_inferida > 0) && (
            <div className="mt-[0.5em] border-t border-slate-800 pt-[0.5em] text-[0.85em] leading-snug text-slate-400">
              {m.sem_uf_ativos > 0 && <><b className="text-amber-300">{m.sem_uf_ativos}</b> em negociação sem estado no cadastro (fora do mapa). </>}
              {m.uf_inferida > 0 && <>{m.uf_inferida} com estado deduzido pelo nome.</>}
            </div>
          )}
        </Painel>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────
// Sprint 42P — Funil quente
// ─────────────────────────────────────────────────────────────────────────
const COR_ETAPA_FUNIL = {
  cadencia: '#2563a8', diagnostico: '#0ea5e9', trial: '#f97316', proposta: '#f59e0b', corregedoria: '#eab308', ganho: '#10b981',
};
const corTemp = (t) => (t >= 75 ? '#f43f5e' : t >= 60 ? '#f97316' : t >= 35 ? '#f59e0b' : '#64748b');

function TelaFunilQuente({ f }) {
  const fila = f.funil.find((e) => e.k === 'prospect');
  const etapas = f.funil.filter((e) => e.k !== 'prospect');
  return (
    <div className="grid min-h-0 flex-1 grid-cols-12 gap-[1.1em]">
      <section className="col-span-6 flex min-h-0 flex-col gap-[0.6em] rounded-xl border border-slate-800 bg-slate-900/70 p-[1em]">
        <div className="flex items-baseline justify-between">
          <h2 className="flex items-center gap-[0.5em] text-[1.5em] font-semibold text-slate-100">
            <Flame className="h-[1.1em] w-[1.1em] text-orange-400" /> Onde estão os cartórios hoje
          </h2>
          {fila && <span className="text-[1em] text-slate-400">+ <b className="text-slate-200 tabular-nums">{fila.total.toLocaleString('pt-BR')}</b> na fila de prospecção</span>}
        </div>
        <div className="flex min-h-0 flex-1 flex-col gap-[0.4em] py-[0.4em]">
          {etapas.map((e, i) => {
            // Formato de funil: a largura vem da posição (de cima pra baixo), o número diz o volume
            const n = etapas.length;
            const passo = 52 / Math.max(1, n - 1);
            const topo = 100 - i * passo;
            const base = topo - (i === n - 1 ? passo * 0.6 : passo);
            const recuo = ((topo - base) / 2 / topo) * 100;
            const cor = COR_ETAPA_FUNIL[e.k] || '#475569';
            const escuro = ['trial', 'proposta', 'corregedoria', 'ganho', 'diagnostico'].includes(e.k);
            return (
              <div key={e.k} className="flex min-h-[3em] flex-1 items-stretch">
                <div className="flex flex-1 justify-center">
                  <div className="relative flex flex-col items-center justify-center px-[1.2em] text-center transition-all duration-700"
                    style={{ width: `${topo}%`, background: cor, clipPath: `polygon(0 0, 100% 0, ${100 - recuo}% 100%, ${recuo}% 100%)` }}>
                    <span className={`text-[2.3em] font-extrabold leading-none tabular-nums ${escuro ? 'text-slate-950' : 'text-white'}`}>{e.total}</span>
                    <span className={`mt-[0.15em] text-[1.1em] font-semibold leading-tight ${escuro ? 'text-slate-900' : 'text-white/90'}`}>{e.nome}</span>
                  </div>
                </div>
                <div className="flex w-[5.5em] shrink-0 items-center pl-[0.6em]">
                  {e.quentes > 0 && (
                    <span className="inline-flex items-center gap-[0.2em] rounded-full bg-rose-500/15 px-[0.55em] py-[0.15em] text-[1.25em] font-bold text-rose-300">
                      <Flame className="h-[0.85em] w-[0.85em]" />{e.quentes}
                    </span>
                  )}
                </div>
              </div>
            );
          })}
        </div>
        <div className="flex items-center justify-center gap-[1.4em] text-[1em]">
          <span className="text-slate-400">Temperatura de quem está em negociação:</span>
          <span className="font-bold text-rose-300">{f.resumo.quentes} quentes</span>
          <span className="font-bold text-amber-300">{f.resumo.mornos} mornos</span>
          <span className="font-bold text-slate-400">{f.resumo.frios} frios</span>
        </div>
      </section>

      <section className="col-span-6 flex min-h-0 flex-col gap-[0.6em] rounded-xl border border-slate-800 bg-slate-900/70 p-[1em]">
        <h2 className="flex items-center gap-[0.5em] text-[1.5em] font-semibold text-slate-100">
          <Thermometer className="h-[1.1em] w-[1.1em] text-rose-400" /> Mais quentes agora
        </h2>
        {f.quentes.length === 0 ? (
          <div className="grid flex-1 place-items-center text-[1.3em] text-slate-500">Nenhum cartório em negociação ainda.</div>
        ) : (
          <ul className="flex min-h-0 flex-1 flex-col gap-[0.45em] overflow-hidden">
            {f.quentes.slice(0, 8).map((q, i) => (
              <li key={q.id} className="flex min-h-0 flex-1 items-center gap-[0.8em] rounded-lg bg-slate-800/50 px-[0.8em] py-[0.35em]">
                <span className="w-[1.4em] text-center text-[1.2em] font-bold text-slate-500">{i + 1}</span>
                <div className="flex w-[4.4em] shrink-0 flex-col items-center">
                  <span className="text-[1.7em] font-extrabold leading-none tabular-nums" style={{ color: corTemp(q.temperatura) }}>{q.temperatura}°</span>
                  <div className="mt-[0.25em] h-[0.35em] w-full overflow-hidden rounded-full bg-slate-700">
                    <div className="h-full rounded-full" style={{ width: `${q.temperatura}%`, background: corTemp(q.temperatura) }} />
                  </div>
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-baseline gap-[0.5em]">
                    <span className="truncate text-[1.2em] font-semibold">{q.nome}</span>
                  </div>
                  <div className="flex items-center gap-[0.4em] text-[0.88em] text-slate-400">
                    <span className="rounded px-[0.4em] font-semibold text-slate-950" style={{ background: COR_ETAPA_FUNIL[q.etapa] || '#64748b' }}>{q.etapa_nome}</span>
                    <span className="truncate">{[q.dono, q.local].filter(Boolean).join(' · ')}</span>
                  </div>
                  <div className="truncate text-[0.88em] text-slate-300">{q.motivos.join(' · ')}</div>
                </div>
              </li>
            ))}
          </ul>
        )}
        <div className="text-[0.82em] leading-snug text-slate-500">
          Temperatura (0–100): estágio + reunião marcada nos próximos dias + resposta recente + proposta na mesa + uso no trial − dias sem contato. Quente a partir de {f.limiar}°.
        </div>
      </section>
    </div>
  );
}
