import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  ChevronLeft, ChevronRight, X, Maximize2, Minimize2,
  Lock, Shuffle, Layers, PieChart, LineChart, Sparkles, ArrowRight,
} from 'lucide-react';
import { api, mensagemDeErro } from '../api/client.js';
import { useAuth } from '../context/AuthContext.jsx';

/**
 * Modo Apresentação — visão de estrutura de custos.
 *
 * Pega as contas a pagar já lançadas e as separa em:
 *   - CUSTOS FIXOS    → contas recorrentes (eh_recorrente). Normalizadas
 *                       para um valor MENSAL (trimestral /3, anual /12, etc).
 *   - CUSTOS VARIÁVEIS → contas avulsas (sem recorrência). Somadas pelo valor
 *                       lançado e também transformadas numa média mensal,
 *                       dividindo pelo período coberto pelos lançamentos.
 *
 * É uma tela cheia, navegável por teclado (← →), clique ou toque (swipe),
 * pensada pra projetar numa reunião. Nada aqui grava no banco — é só leitura.
 *
 * ── Como mudar a regra de fixo/variável ──────────────────────────────
 * Toda a classificação passa por `classificar(conta)` lá embaixo. Hoje ela
 * usa a recorrência. Se um dia quiser separar por categoria, ou por um campo
 * próprio "tipo_custo", basta trocar essa única função.
 */

// ── Helpers de formatação ────────────────────────────────────────────
function formatarBRL(n) {
  return Number(n ?? 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

function formatarBRLcurto(n) {
  const v = Number(n ?? 0);
  if (Math.abs(v) >= 1_000_000) return 'R$ ' + (v / 1_000_000).toLocaleString('pt-BR', { maximumFractionDigits: 1 }) + ' mi';
  if (Math.abs(v) >= 1_000) return 'R$ ' + (v / 1_000).toLocaleString('pt-BR', { maximumFractionDigits: 1 }) + ' mil';
  return formatarBRL(v);
}

// Cores nomeadas das categorias → hex (espelha a paleta usada nos badges).
const COR_HEX = {
  slate: '#64748b', red: '#ef4444', orange: '#f97316', amber: '#f59e0b',
  yellow: '#eab308', lime: '#84cc16', emerald: '#10b981', teal: '#14b8a6',
  cyan: '#06b6d4', blue: '#3b82f6', indigo: '#6366f1', violet: '#8b5cf6',
  fuchsia: '#d946ef', pink: '#ec4899', rose: '#f43f5e',
};
const corDe = (nome) => COR_HEX[nome] || COR_HEX.slate;

// Cores narrativas: fixo = frio/estável; variável = quente/oscila.
const COR_FIXO = '#36a6ff';     // nexus-400
const COR_VARIAVEL = '#f59e0b'; // amber-500

// Janela da linha do tempo: meses pra trás (real) e pra frente (projetado).
const MESES_PASSADO = 6;
const MESES_FUTURO = 6;

const FREQ_MESES = { mensal: 1, trimestral: 3, semestral: 6, anual: 12 };
const FREQ_ROTULO = { mensal: '/mês', trimestral: '/trimestre', semestral: '/semestre', anual: '/ano' };

function paraMensal(valor, tipo) {
  return Number(valor || 0) / (FREQ_MESES[tipo] || 1);
}

// Conta meses cobertos por uma lista de datas 'YYYY-MM-DD'. Mínimo 1.
function mesesCobertos(datas) {
  const validas = datas.filter(Boolean).map((d) => d.slice(0, 7));
  if (validas.length === 0) return 1;
  validas.sort();
  const [aMin, mMin] = validas[0].split('-').map(Number);
  const [aMax, mMax] = validas[validas.length - 1].split('-').map(Number);
  return Math.max(1, (aMax - aMin) * 12 + (mMax - mMin) + 1);
}

// Gera a sequência 'YYYY-MM' centrada num mês, com N antes e M depois.
function listaMeses(centro, antes, depois) {
  const [a, m] = centro.split('-').map(Number);
  const out = [];
  for (let off = -antes; off <= depois; off++) {
    const d = new Date(a, m - 1 + off, 1);
    out.push(d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0'));
  }
  return out;
}

// 'YYYY-MM' -> 'jan/26'
function rotuloMes(m) {
  try {
    const d = new Date(m + '-01T12:00:00');
    return d.toLocaleDateString('pt-BR', { month: 'short' }).replace('.', '') + '/' + String(d.getFullYear()).slice(2);
  } catch { return m; }
}

// ── A regra: o que é fixo, o que é variável ──────────────────────────
function classificar(conta) {
  return conta.eh_recorrente ? 'fixo' : 'variavel';
}

// ── Contagem animada (count-up) ──────────────────────────────────────
function useContagem(alvo, ativo, duracao = 1000) {
  const [valor, setValor] = useState(0);
  useEffect(() => {
    if (!ativo) { setValor(0); return undefined; }
    let raf;
    const t0 = performance.now();
    const passo = (t) => {
      const p = Math.min(1, (t - t0) / duracao);
      const ease = 1 - Math.pow(1 - p, 3);
      setValor(alvo * ease);
      if (p < 1) raf = requestAnimationFrame(passo);
    };
    raf = requestAnimationFrame(passo);
    return () => cancelAnimationFrame(raf);
  }, [alvo, ativo, duracao]);
  return valor;
}

// Dispara um "montado" logo após o slide aparecer, pra animar barras.
function useMontado(delay = 80) {
  const [pronto, setPronto] = useState(false);
  useEffect(() => {
    const t = setTimeout(() => setPronto(true), delay);
    return () => clearTimeout(t);
  }, [delay]);
  return pronto;
}

export default function Apresentacao() {
  const navigate = useNavigate();
  const { pessoa } = useAuth();

  const [contas, setContas] = useState([]);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState('');
  const [slide, setSlide] = useState(0);
  const [tela, setTela] = useState(false); // fullscreen nativo
  const containerRef = useRef(null);
  const toqueX = useRef(null);

  // ── Carrega as contas (todas, pra classificar fixo/variável) ──
  useEffect(() => {
    let vivo = true;
    (async () => {
      setCarregando(true);
      setErro('');
      try {
        const res = await api.get('/contas-pagar', { params: { status: 'todas' } });
        if (vivo) setContas(Array.isArray(res.data) ? res.data : []);
      } catch (err) {
        if (vivo) setErro(mensagemDeErro(err, 'Não foi possível carregar os custos.'));
      } finally {
        if (vivo) setCarregando(false);
      }
    })();
    return () => { vivo = false; };
  }, []);

  // ── Deriva fixos, variáveis e composição ──
  const dados = useMemo(() => {
    const ativas = contas.filter((c) => c.status !== 'cancelada');

    // FIXOS: recorrentes, deduplicados por série (grupo_recorrencia_id).
    // Por série, fica a ocorrência de vencimento mais recente (valor "atual").
    const porGrupo = new Map();
    for (const c of ativas) {
      if (classificar(c) !== 'fixo') continue;
      const chave = c.grupo_recorrencia_id || c.id;
      const atual = porGrupo.get(chave);
      if (!atual || (c.data_vencimento || '') > (atual.data_vencimento || '')) {
        porGrupo.set(chave, c);
      }
    }
    const fixos = [...porGrupo.values()]
      .map((c) => ({
        id: c.id,
        descricao: c.descricao,
        categoria_nome: c.categoria_nome || 'Sem categoria',
        categoria_cor: c.categoria_cor || 'slate',
        tipo: c.recorrencia_tipo || 'mensal',
        valor: Number(c.valor || 0),
        mensal: paraMensal(c.valor, c.recorrencia_tipo),
      }))
      .sort((a, b) => b.mensal - a.mensal);

    // VARIÁVEIS: avulsas, agrupadas por categoria.
    const variaveisRaw = ativas.filter((c) => classificar(c) === 'variavel');
    const porCat = new Map();
    for (const c of variaveisRaw) {
      const chave = c.categoria_id || 'sem';
      const linha = porCat.get(chave) || {
        categoria_nome: c.categoria_nome || 'Sem categoria',
        categoria_cor: c.categoria_cor || 'slate',
        total: 0,
        qtd: 0,
      };
      linha.total += Number(c.valor_pago ?? c.valor ?? 0);
      linha.qtd += 1;
      porCat.set(chave, linha);
    }
    const variaveis = [...porCat.values()].sort((a, b) => b.total - a.total);

    const totalFixoMensal = fixos.reduce((s, f) => s + f.mensal, 0);
    const totalVariavel = variaveis.reduce((s, v) => s + v.total, 0);
    const meses = mesesCobertos(variaveisRaw.map((c) => c.data_vencimento));
    const mediaVariavelMensal = totalVariavel / meses;

    // ── Série temporal: real (até o mês atual) + projeção pra frente ──
    // Passado/mês atual: valores reais lançados, separados por fixo/variável.
    // Futuro: fixo = compromisso mensal normalizado; variável = média histórica.
    const agora = new Date();
    const mesAtual = agora.getFullYear() + '-' + String(agora.getMonth() + 1).padStart(2, '0');
    const balde = {};
    for (const c of ativas) {
      const ref = (c.data_vencimento || '').slice(0, 7);
      if (!ref) continue;
      const v = Number(c.valor_pago ?? c.valor ?? 0);
      const b = balde[ref] || { fixo: 0, variavel: 0 };
      if (classificar(c) === 'fixo') b.fixo += v; else b.variavel += v;
      balde[ref] = b;
    }
    const seqMeses = listaMeses(mesAtual, MESES_PASSADO, MESES_FUTURO);
    const serie = seqMeses.map((m) => {
      const futuro = m > mesAtual;
      const b = balde[m] || { fixo: 0, variavel: 0 };
      const fixo = futuro ? totalFixoMensal : b.fixo;
      const variavel = futuro ? mediaVariavelMensal : b.variavel;
      return { mes: m, fixo, variavel, total: fixo + variavel, projetado: futuro };
    });
    const idxHoje = seqMeses.indexOf(mesAtual);
    const futuros = serie.filter((p) => p.projetado);
    const totalProjetado = futuros.reduce((s, p) => s + p.total, 0);
    const mediaProjetada = futuros.length ? totalProjetado / futuros.length : 0;

    const totalMensal = totalFixoMensal + mediaVariavelMensal;
    const pctFixo = totalMensal > 0 ? (totalFixoMensal / totalMensal) * 100 : 0;
    const pctVariavel = totalMensal > 0 ? (mediaVariavelMensal / totalMensal) * 100 : 0;

    return {
      fixos, variaveis,
      totalFixoMensal, totalVariavel, mediaVariavelMensal,
      meses, totalMensal, pctFixo, pctVariavel,
      serie, idxHoje, mediaProjetada, totalProjetado,
      maiorFixo: fixos[0]?.mensal || 0,
      maiorVariavel: variaveis[0]?.total || 0,
      vazio: fixos.length === 0 && variaveis.length === 0,
    };
  }, [contas]);

  // ── Slides ──
  const slides = useMemo(() => ([
    { id: 'capa', render: () => <SlideCapa dados={dados} pessoa={pessoa} /> },
    { id: 'fixos', render: () => <SlideFixos dados={dados} /> },
    { id: 'variaveis', render: () => <SlideVariaveis dados={dados} /> },
    { id: 'tempo', render: () => <SlideLinhaTempo dados={dados} /> },
    { id: 'composicao', render: () => <SlideComposicao dados={dados} /> },
    { id: 'fim', render: () => <SlideFim dados={dados} aoFechar={() => navigate('/mensal')} /> },
  ]), [dados, pessoa, navigate]);

  const total = slides.length;
  const irPara = (i) => setSlide((s) => Math.max(0, Math.min(total - 1, typeof i === 'function' ? i(s) : i)));
  const proximo = () => irPara((s) => s + 1);
  const anterior = () => irPara((s) => s - 1);

  // ── Teclado ──
  useEffect(() => {
    const onKey = (e) => {
      if (e.key === 'ArrowRight' || e.key === ' ' || e.key === 'PageDown') { e.preventDefault(); proximo(); }
      else if (e.key === 'ArrowLeft' || e.key === 'PageUp') { e.preventDefault(); anterior(); }
      else if (e.key === 'Escape') { sairTela(); navigate('/mensal'); }
      else if (e.key === 'f' || e.key === 'F') { alternarTela(); }
      else if (e.key === 'Home') irPara(0);
      else if (e.key === 'End') irPara(total - 1);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
    // eslint-disable-next-line
  }, [total]);

  // ── Fullscreen nativo ──
  function alternarTela() {
    const el = containerRef.current;
    if (!document.fullscreenElement && el?.requestFullscreen) {
      el.requestFullscreen().then(() => setTela(true)).catch(() => {});
    } else if (document.fullscreenElement) {
      document.exitFullscreen?.().then(() => setTela(false)).catch(() => {});
    }
  }
  function sairTela() {
    if (document.fullscreenElement) document.exitFullscreen?.().catch(() => {});
  }
  useEffect(() => {
    const onFs = () => setTela(!!document.fullscreenElement);
    document.addEventListener('fullscreenchange', onFs);
    return () => document.removeEventListener('fullscreenchange', onFs);
  }, []);

  // ── Toque (swipe) ──
  const onTouchStart = (e) => { toqueX.current = e.touches[0].clientX; };
  const onTouchEnd = (e) => {
    if (toqueX.current == null) return;
    const dx = e.changedTouches[0].clientX - toqueX.current;
    if (Math.abs(dx) > 50) (dx < 0 ? proximo : anterior)();
    toqueX.current = null;
  };

  return (
    <div
      ref={containerRef}
      onTouchStart={onTouchStart}
      onTouchEnd={onTouchEnd}
      className="fixed inset-0 z-50 flex flex-col overflow-hidden text-white select-none"
      style={{ background: 'radial-gradient(120% 120% at 80% 0%, #0c3f72 0%, #08284c 45%, #061b35 100%)' }}
    >
      <style>{ESTILO}</style>

      {/* textura sutil + brilho */}
      <div className="pointer-events-none absolute inset-0 opacity-[0.06]"
        style={{ backgroundImage: 'radial-gradient(circle at 1px 1px, #fff 1px, transparent 0)', backgroundSize: '28px 28px' }} />
      <div className="pointer-events-none absolute -top-40 -right-40 h-[40rem] w-[40rem] rounded-full blur-3xl"
        style={{ background: 'radial-gradient(circle, rgba(54,166,255,0.25), transparent 60%)' }} />

      {/* Barra topo */}
      <header className="relative z-10 flex items-center justify-between px-6 py-4 sm:px-10">
        <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.25em] text-nexus-200/80">
          <Sparkles size={14} /> Gestão Ayio
        </div>
        <div className="flex items-center gap-2">
          <button onClick={alternarTela} title="Tela cheia (F)"
            className="rounded-lg p-2 text-nexus-200/80 transition hover:bg-white/10 hover:text-white">
            {tela ? <Minimize2 size={18} /> : <Maximize2 size={18} />}
          </button>
          <button onClick={() => { sairTela(); navigate('/mensal'); }} title="Sair (Esc)"
            className="rounded-lg p-2 text-nexus-200/80 transition hover:bg-white/10 hover:text-white">
            <X size={18} />
          </button>
        </div>
      </header>

      {/* Palco */}
      <main className="relative z-10 flex flex-1 items-center justify-center overflow-hidden px-6 sm:px-12">
        {carregando ? (
          <div className="animate-pulse text-nexus-200/70">Preparando a apresentação…</div>
        ) : erro ? (
          <div className="max-w-md rounded-2xl border border-red-400/30 bg-red-500/10 p-6 text-center text-red-100">
            {erro}
          </div>
        ) : dados.vazio ? (
          <div className="max-w-lg text-center">
            <Layers className="mx-auto mb-4 text-nexus-300" size={40} />
            <h2 className="text-2xl font-semibold">Ainda não há custos lançados</h2>
            <p className="mt-2 text-nexus-200/70">
              Cadastre contas a pagar (recorrentes viram custos fixos; avulsas, variáveis)
              e a apresentação se monta sozinha.
            </p>
          </div>
        ) : (
          <div key={slides[slide].id} className="anim-entrada w-full max-w-6xl">
            {slides[slide].render()}
          </div>
        )}
      </main>

      {/* Rodapé / navegação */}
      <footer className="relative z-10 flex items-center justify-between px-6 py-5 sm:px-10">
        <button onClick={anterior} disabled={slide === 0}
          className="rounded-full p-2 text-nexus-200/70 transition hover:bg-white/10 hover:text-white disabled:opacity-20">
          <ChevronLeft size={22} />
        </button>

        <div className="flex items-center gap-2">
          {slides.map((s, i) => (
            <button key={s.id} onClick={() => irPara(i)}
              className={'h-1.5 rounded-full transition-all ' +
                (i === slide ? 'w-7 bg-nexus-300' : 'w-1.5 bg-white/25 hover:bg-white/50')} />
          ))}
        </div>

        <button onClick={proximo} disabled={slide === total - 1}
          className="rounded-full p-2 text-nexus-200/70 transition hover:bg-white/10 hover:text-white disabled:opacity-20">
          <ChevronRight size={22} />
        </button>
      </footer>
    </div>
  );
}

// ════════════════════════════════════════════════════════════════════
// SLIDES
// ════════════════════════════════════════════════════════════════════

function SlideCapa({ dados, pessoa }) {
  const ativo = useMontado();
  const total = useContagem(dados.totalMensal, ativo, 1100);
  return (
    <div className="text-center">
      <div className="anim-sobe text-sm font-medium uppercase tracking-[0.3em] text-nexus-200/70">
        Estrutura de custos
      </div>
      <h1 className="anim-sobe mt-4 text-5xl font-bold leading-tight sm:text-6xl"
        style={{ animationDelay: '80ms' }}>
        Para onde vai o<br />dinheiro, todo mês
      </h1>
      <p className="anim-sobe mx-auto mt-6 max-w-xl text-lg text-nexus-200/70"
        style={{ animationDelay: '160ms' }}>
        Custo mensal recorrente estimado
      </p>
      <div className="anim-sobe mt-4 text-6xl font-bold tabular-nums sm:text-7xl"
        style={{ animationDelay: '160ms' }}>
        {formatarBRL(total)}
      </div>
      <div className="anim-sobe mt-10 flex items-center justify-center gap-2 text-sm text-nexus-200/50"
        style={{ animationDelay: '320ms' }}>
        Use <kbd className="rounded bg-white/10 px-2 py-0.5">←</kbd>
        <kbd className="rounded bg-white/10 px-2 py-0.5">→</kbd> para navegar
        <ArrowRight size={14} className="ml-1 animate-pulse" />
      </div>
      {pessoa?.nome && (
        <div className="anim-sobe mt-8 text-xs text-nexus-200/40" style={{ animationDelay: '400ms' }}>
          Apresentado por {pessoa.nome} · {new Date().toLocaleDateString('pt-BR')}
        </div>
      )}
    </div>
  );
}

function SlideFixos({ dados }) {
  const ativo = useMontado();
  const pronto = useMontado(120);
  const total = useContagem(dados.totalFixoMensal, ativo, 900);
  const topo = dados.fixos.slice(0, 7);
  return (
    <div>
      <CabecalhoSlide
        icone={Lock} cor={COR_FIXO}
        titulo="Custos fixos"
        legenda="Compromissos recorrentes, normalizados por mês"
      />
      <div className="mt-2 text-4xl font-bold tabular-nums sm:text-5xl" style={{ color: COR_FIXO }}>
        {formatarBRL(total)} <span className="text-lg font-medium text-nexus-200/50">/ mês</span>
      </div>

      <ul className="mt-8 space-y-3">
        {topo.map((f, i) => {
          const pct = dados.maiorFixo > 0 ? (f.mensal / dados.maiorFixo) * 100 : 0;
          return (
            <li key={f.id} className="anim-sobe" style={{ animationDelay: (i * 70) + 'ms' }}>
              <div className="flex items-baseline justify-between gap-4 text-sm">
                <span className="flex items-center gap-2 truncate font-medium">
                  <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: corDe(f.categoria_cor) }} />
                  <span className="truncate">{f.descricao}</span>
                  <span className="shrink-0 text-xs text-nexus-200/40">
                    {formatarBRL(f.valor)}{FREQ_ROTULO[f.tipo] || ''}
                  </span>
                </span>
                <span className="shrink-0 font-semibold tabular-nums">{formatarBRL(f.mensal)}</span>
              </div>
              <div className="mt-1.5 h-2 overflow-hidden rounded-full bg-white/10">
                <div className="h-full rounded-full transition-[width] duration-700 ease-out"
                  style={{ width: (pronto ? Math.max(3, pct) : 0) + '%', background: COR_FIXO }} />
              </div>
            </li>
          );
        })}
      </ul>
      {dados.fixos.length > topo.length && (
        <div className="mt-4 text-xs text-nexus-200/40">
          + {dados.fixos.length - topo.length} outros compromissos recorrentes
        </div>
      )}
    </div>
  );
}

function SlideVariaveis({ dados }) {
  const ativo = useMontado();
  const pronto = useMontado(120);
  const total = useContagem(dados.totalVariavel, ativo, 900);
  return (
    <div>
      <CabecalhoSlide
        icone={Shuffle} cor={COR_VARIAVEL}
        titulo="Custos variáveis"
        legenda={`Gastos avulsos · ${dados.meses} ${dados.meses === 1 ? 'mês' : 'meses'} de lançamentos`}
      />
      <div className="mt-2 flex flex-wrap items-baseline gap-x-6 gap-y-1">
        <div className="text-4xl font-bold tabular-nums sm:text-5xl" style={{ color: COR_VARIAVEL }}>
          {formatarBRL(total)}
        </div>
        <div className="text-sm text-nexus-200/50">
          ~ {formatarBRL(dados.mediaVariavelMensal)} / mês em média
        </div>
      </div>

      <ul className="mt-8 space-y-3">
        {dados.variaveis.slice(0, 7).map((v, i) => {
          const pct = dados.maiorVariavel > 0 ? (v.total / dados.maiorVariavel) * 100 : 0;
          return (
            <li key={v.categoria_nome + i} className="anim-sobe" style={{ animationDelay: (i * 70) + 'ms' }}>
              <div className="flex items-baseline justify-between gap-4 text-sm">
                <span className="flex items-center gap-2 truncate font-medium">
                  <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: corDe(v.categoria_cor) }} />
                  <span className="truncate">{v.categoria_nome}</span>
                  <span className="shrink-0 text-xs text-nexus-200/40">
                    {v.qtd} {v.qtd === 1 ? 'lançamento' : 'lançamentos'}
                  </span>
                </span>
                <span className="shrink-0 font-semibold tabular-nums">{formatarBRL(v.total)}</span>
              </div>
              <div className="mt-1.5 h-2 overflow-hidden rounded-full bg-white/10">
                <div className="h-full rounded-full transition-[width] duration-700 ease-out"
                  style={{ width: (pronto ? Math.max(3, pct) : 0) + '%', background: corDe(v.categoria_cor) }} />
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

function SlideLinhaTempo({ dados }) {
  const ativo = useMontado();
  const media = useContagem(dados.mediaProjetada, ativo, 900);
  const qtdFuturo = dados.serie.length - dados.idxHoje - 1;
  return (
    <div>
      <CabecalhoSlide
        icone={LineChart} cor={COR_FIXO}
        titulo="Linha do tempo"
        legenda={'Custo real dos últimos meses + projeção dos próximos ' + qtdFuturo}
      />
      <div className="mt-2 flex flex-wrap items-baseline gap-x-6 gap-y-1">
        <div className="text-3xl font-bold tabular-nums sm:text-4xl" style={{ color: COR_FIXO }}>
          {formatarBRL(media)}
        </div>
        <div className="text-sm text-nexus-200/50">/ mês projetado em média</div>
      </div>
      <div className="mt-6">
        <GraficoLinha serie={dados.serie} idxHoje={dados.idxHoje} />
      </div>
      <div className="mt-4 flex flex-wrap items-center gap-x-6 gap-y-2 text-xs text-nexus-200/60">
        <Legenda cor={COR_FIXO} texto="Fixos" />
        <Legenda cor={COR_VARIAVEL} texto="Variáveis" />
        <span className="flex items-center gap-2">
          <span className="inline-block h-0 w-6 border-t border-dashed border-white/60" /> projetado (depois do marco "hoje")
        </span>
      </div>
    </div>
  );
}

function Legenda({ cor, texto }) {
  return (
    <span className="flex items-center gap-2">
      <span className="h-2.5 w-2.5 rounded-sm" style={{ background: cor }} /> {texto}
    </span>
  );
}

function GraficoLinha({ serie, idxHoje }) {
  const pronto = useMontado(150);
  const W = 960, H = 360;
  const ml = 60, mr = 16, mt = 20, mb = 34;
  const x0 = ml, x1 = W - mr, y0 = mt, y1 = H - mb;
  const plotW = x1 - x0, plotH = y1 - y0;
  const n = serie.length;
  const step = n > 1 ? plotW / (n - 1) : 0;
  const xAt = (i) => x0 + i * step;
  const maxV = Math.max(1, ...serie.map((p) => p.total));
  const yAt = (v) => y1 - (v / maxV) * plotH;

  const yFixo = serie.map((p) => yAt(p.fixo));
  const yTotal = serie.map((p) => yAt(p.total));

  let areaFixo = 'M ' + x0 + ' ' + y1;
  serie.forEach((p, i) => { areaFixo += ' L ' + xAt(i) + ' ' + yFixo[i]; });
  areaFixo += ' L ' + x1 + ' ' + y1 + ' Z';

  let areaVar = '';
  serie.forEach((p, i) => { areaVar += (i === 0 ? 'M ' : ' L ') + xAt(i) + ' ' + yFixo[i]; });
  for (let i = n - 1; i >= 0; i--) { areaVar += ' L ' + xAt(i) + ' ' + yTotal[i]; }
  areaVar += ' Z';

  let linhaTotal = '';
  serie.forEach((p, i) => { linhaTotal += (i === 0 ? 'M ' : ' L ') + xAt(i) + ' ' + yTotal[i]; });

  const xHoje = xAt(Math.max(0, idxHoje));
  const larguraRevela = pronto ? plotW : 0;
  const ticks = [0, maxV / 2, maxV];

  return (
    <svg viewBox={'0 0 ' + W + ' ' + H} className="w-full">
      <defs>
        <clipPath id="revelaTempo">
          <rect x={x0} y="0" height={H} width={larguraRevela} style={{ transition: 'width 1100ms ease-out' }} />
        </clipPath>
      </defs>

      {ticks.map((t, i) => (
        <g key={i}>
          <line x1={x0} y1={yAt(t)} x2={x1} y2={yAt(t)} stroke="rgba(255,255,255,0.08)" />
          <text x={x0 - 8} y={yAt(t) + 4} textAnchor="end" className="fill-nexus-200" style={{ fontSize: 11, opacity: 0.5 }}>
            {formatarBRLcurto(t)}
          </text>
        </g>
      ))}

      <rect x={xHoje} y={y0} width={Math.max(0, x1 - xHoje)} height={plotH} fill="rgba(255,255,255,0.035)" />

      <g clipPath="url(#revelaTempo)">
        <path d={areaFixo} fill={COR_FIXO} opacity="0.32" />
        <path d={areaVar} fill={COR_VARIAVEL} opacity="0.28" />
        <path d={linhaTotal} fill="none" stroke="rgba(255,255,255,0.85)" strokeWidth="2" />
        {serie.map((p, i) => (
          <circle key={i} cx={xAt(i)} cy={yTotal[i]} r="3.5"
            fill={p.projetado ? '#0c3f72' : '#ffffff'} stroke="#ffffff" strokeWidth={p.projetado ? 1.5 : 0} />
        ))}
      </g>

      <line x1={xHoje} y1={y0} x2={xHoje} y2={y1} stroke="rgba(255,255,255,0.5)" strokeDasharray="4 4" />
      <text x={xHoje} y={y0 - 6} textAnchor="middle" className="fill-white" style={{ fontSize: 11, opacity: 0.75 }}>hoje</text>

      {serie.map((p, i) => (i % 2 === 0 ? (
        <text key={'x' + i} x={xAt(i)} y={H - 12} textAnchor="middle" className="fill-nexus-200" style={{ fontSize: 11, opacity: 0.55 }}>
          {rotuloMes(p.mes)}
        </text>
      ) : null))}
    </svg>
  );
}

function SlideComposicao({ dados }) {
  const ativo = useMontado();
  const fixo = useContagem(dados.totalFixoMensal, ativo, 900);
  const variavel = useContagem(dados.mediaVariavelMensal, ativo, 900);

  // Donut em SVG — dois arcos sobre um círculo.
  const R = 88, C = 2 * Math.PI * R;
  const pronto = useMontado(150);
  const dashFixo = pronto ? (dados.pctFixo / 100) * C : 0;

  return (
    <div className="grid items-center gap-10 lg:grid-cols-2">
      <div>
        <CabecalhoSlide
          icone={PieChart} cor={COR_FIXO}
          titulo="Composição mensal"
          legenda="Quanto do custo é compromisso fixo vs. gasto que oscila"
        />
        <div className="mt-6 space-y-4">
          <LinhaComposicao cor={COR_FIXO} rotulo="Custos fixos" valor={fixo} pct={dados.pctFixo} sufixo="/ mês" />
          <LinhaComposicao cor={COR_VARIAVEL} rotulo="Custos variáveis" valor={variavel} pct={dados.pctVariavel} sufixo="/ mês (média)" />
          <div className="border-t border-white/10 pt-4">
            <LinhaComposicao cor="#fff" rotulo="Total mensal" valor={fixo + variavel} pct={100} sufixo="/ mês" forte />
          </div>
        </div>
      </div>

      <div className="flex justify-center">
        <svg viewBox="0 0 220 220" className="w-64 max-w-full">
          <circle cx="110" cy="110" r={R} fill="none" stroke={COR_VARIAVEL} strokeWidth="26" opacity="0.85" />
          <circle cx="110" cy="110" r={R} fill="none" stroke={COR_FIXO} strokeWidth="26"
            strokeDasharray={`${dashFixo} ${C}`} strokeLinecap="round"
            transform="rotate(-90 110 110)"
            style={{ transition: 'stroke-dasharray 900ms ease-out' }} />
          <text x="110" y="100" textAnchor="middle" className="fill-white" style={{ fontSize: 30, fontWeight: 700 }}>
            {Math.round(dados.pctFixo)}%
          </text>
          <text x="110" y="124" textAnchor="middle" className="fill-nexus-200" style={{ fontSize: 12, opacity: 0.7 }}>
            fixo
          </text>
        </svg>
      </div>
    </div>
  );
}

function SlideFim({ dados, aoFechar }) {
  const ativo = useMontado();
  const total = useContagem(dados.totalMensal, ativo, 1000);
  const anual = useContagem(dados.totalMensal * 12, ativo, 1000);
  return (
    <div className="text-center">
      <div className="anim-sobe text-sm font-medium uppercase tracking-[0.3em] text-nexus-200/70">
        Em resumo
      </div>
      <div className="anim-sobe mt-8 grid gap-6 sm:grid-cols-2" style={{ animationDelay: '80ms' }}>
        <Destaque rotulo="Custo mensal" valor={formatarBRL(total)} cor={COR_FIXO} />
        <Destaque rotulo="Projeção em 12 meses" valor={formatarBRLcurto(anual)} cor={COR_VARIAVEL} />
      </div>
      <p className="anim-sobe mx-auto mt-10 max-w-xl text-nexus-200/70" style={{ animationDelay: '200ms' }}>
        {Math.round(dados.pctFixo)}% do custo mensal é compromisso fixo e
        {' '}{Math.round(dados.pctVariavel)}% oscila conforme a operação.
      </p>
      <button onClick={aoFechar}
        className="anim-sobe mt-10 inline-flex items-center gap-2 rounded-xl bg-white px-6 py-3 text-sm font-semibold text-nexus-900 shadow-lg transition hover:bg-nexus-50"
        style={{ animationDelay: '300ms' }}>
        Ver o mês a mês <ArrowRight size={16} />
      </button>
    </div>
  );
}

// ── Pedaços reutilizados ─────────────────────────────────────────────
function CabecalhoSlide({ icone: Icone, cor, titulo, legenda }) {
  return (
    <div className="anim-sobe">
      <div className="flex items-center gap-3">
        <span className="grid h-11 w-11 place-items-center rounded-xl" style={{ background: cor + '22', color: cor }}>
          <Icone size={22} />
        </span>
        <h2 className="text-3xl font-bold sm:text-4xl">{titulo}</h2>
      </div>
      <p className="mt-2 text-nexus-200/60">{legenda}</p>
    </div>
  );
}

function LinhaComposicao({ cor, rotulo, valor, pct, sufixo, forte }) {
  return (
    <div className="flex items-center justify-between gap-4">
      <span className="flex items-center gap-2">
        <span className="h-3 w-3 rounded-full" style={{ background: cor }} />
        <span className={forte ? 'font-semibold' : 'text-nexus-100/90'}>{rotulo}</span>
      </span>
      <span className="text-right">
        <span className={'tabular-nums ' + (forte ? 'text-xl font-bold' : 'font-semibold')}>{formatarBRL(valor)}</span>
        <span className="ml-2 text-xs text-nexus-200/50">{Math.round(pct)}% · {sufixo}</span>
      </span>
    </div>
  );
}

function Destaque({ rotulo, valor, cor }) {
  return (
    <div className="rounded-2xl border border-white/10 bg-white/5 p-8">
      <div className="text-xs font-semibold uppercase tracking-wider text-nexus-200/50">{rotulo}</div>
      <div className="mt-2 text-4xl font-bold tabular-nums sm:text-5xl" style={{ color: cor }}>{valor}</div>
    </div>
  );
}

const ESTILO = `
  @keyframes nexusEntrada { from { opacity: 0; transform: translateY(12px) scale(0.99); } to { opacity: 1; transform: none; } }
  @keyframes nexusSobe { from { opacity: 0; transform: translateY(16px); } to { opacity: 1; transform: none; } }
  .anim-entrada { animation: nexusEntrada 420ms cubic-bezier(0.16,1,0.3,1) both; }
  .anim-sobe { animation: nexusSobe 520ms cubic-bezier(0.16,1,0.3,1) both; }
`;
