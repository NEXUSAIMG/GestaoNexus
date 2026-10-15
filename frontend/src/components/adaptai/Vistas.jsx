import { useEffect, useMemo, useState } from 'react';
import {
  CalendarClock, Route, PhoneCall, FlaskConical, AlertTriangle, RotateCcw, Navigation, Search, Download, Sparkles,
  CheckCircle2, Circle, Target, Users, School, Landmark, HeartHandshake,
} from 'lucide-react';
import { api, mensagemDeErro } from '../../api/client.js';
import { inputCls, btnCls, Campo, Erro } from '../comercial/ui.jsx';
import { btnViol } from './Acoes.jsx';
import {
  Prioridade, Etapa, Rota, MetaSemana, Secao, Copiar, linkMaps, linkRota, dataBr, horaBr, DIA_SEMANA,
} from './ui.jsx';
import * as M from './metodo.js';

const nomeAtiv = (cfg, k) => cfg.tipos_atividade.find((t) => t.k === k)?.n || k;

function LinhaEscola({ e, cfg, onAbrir, direita, children }) {
  return (
    <li className="flex items-center justify-between gap-3 border-b border-slate-100 py-2 last:border-0">
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-1.5">
          <button type="button" onClick={() => onAbrir(e.id)} className="truncate text-left text-sm font-medium text-slate-900 hover:text-violet-700 hover:underline">{e.nome}</button>
          <Prioridade p={e.prioridade} pontos={e.pontos} />
          <Etapa k={e.etapa} nome={cfg.nomes_etapa[e.etapa]} />
        </div>
        <p className="text-xs text-slate-500">{[e.bairro, e.dono_nome].filter(Boolean).join(' · ')}{children}</p>
      </div>
      {direita && <div className="shrink-0">{direita}</div>}
    </li>
  );
}

// ---------------------------------------------------------------------------
// Faixa da semana (topo do Hoje e da Semana)
// ---------------------------------------------------------------------------
export function FaixaSemana({ painel, cfg }) {
  const n = painel.semana.numeros; const m = painel.semana.metas;
  const faixas = { visitas: '12–16', demos: '3–5', propostas: '1–2' };
  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
      {cfg.metas_def.map((d) => (
        <MetaSemana key={d.k} rotulo={d.n} feito={n[d.k]} meta={m[d.k]} faixa={faixas[d.k] && m[d.k] === d.padrao ? faixas[d.k] : null}
          sub={d.k === 'demos' && n.demos_agendadas ? `+${n.demos_agendadas} agendadas` : null} />
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------
// HOJE
// ---------------------------------------------------------------------------
export function VistaHoje({ painel, cfg, onAbrir, onPasso, onDesfecho, onMarcoPiloto, onCarregarLista }) {
  const h = painel.hoje_listas;
  const dia = DIA_SEMANA[new Date(cfg.hoje + 'T12:00:00').getDay()];
  const rota = cfg.rotas.find((r) => r.k === painel.rota_hoje);
  const total = painel.totais.escolas + painel.totais.redes + painel.totais.parceiros;
  const rotina = M.ROTINA.find((r) => r[0].toLowerCase().startsWith(dia.slice(0, 3)));

  if (!total) {
    return (
      <div className="rounded-2xl border border-violet-200 bg-gradient-to-br from-violet-50 to-fuchsia-50 p-8 text-center">
        <Sparkles className="mx-auto text-violet-600" />
        <h2 className="mt-2 text-lg font-semibold text-slate-900">Comece pela lista de Belém</h2>
        <p className="mx-auto mt-1 max-w-xl text-sm text-slate-600">O plano comercial já traz 31 escolas e as 3 portas das redes públicas (SEMEC, SEDUC e CAEE), com bairro, endereço, telefone e a nota preliminar. Os dados vieram de diretórios públicos: confirme por telefone antes de visitar.</p>
        {cfg.eu.gestor
          ? <button type="button" className={btnViol + ' mt-4'} onClick={onCarregarLista}><Download size={15} />Carregar as 34 escolas do plano</button>
          : <p className="mt-4 text-sm text-slate-500">Peça à gestão comercial para carregar a lista.</p>}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <FaixaSemana painel={painel} cfg={cfg} />
      {rotina && (
        <div className="rounded-xl border border-violet-200 bg-violet-50/60 px-4 py-3 text-sm text-violet-950">
          <b className="capitalize">{rotina[0]}.</b> Manhã: {rotina[1]}. Tarde: {rotina[2]}. <span className="text-violet-700">Entregável: {rotina[3]}.</span>
          <p className="mt-1 text-xs text-violet-700">{M.BLOCOS_FIXOS}</p>
        </div>
      )}

      <div className="grid gap-4 lg:grid-cols-2">
        <Secao titulo={<span className="inline-flex items-center gap-1.5"><CalendarClock size={16} className="text-violet-600" />Agenda de hoje</span>}
          sub="Diagnósticos, oficinas, demos e visitas marcadas.">
          {!h.agenda_hoje.length && !h.agenda_atrasada.length && <p className="text-sm text-slate-500">Nada marcado para hoje.</p>}
          <ul>
            {[...h.agenda_atrasada, ...h.agenda_hoje].map((a) => (
              <li key={a.id} className="flex items-center justify-between gap-2 border-b border-slate-100 py-2 last:border-0">
                <div className="min-w-0">
                  <p className="text-sm"><b className="tabular-nums">{a.data < cfg.hoje ? dataBr(a.data) : horaBr(a.quando)}</b> · {nomeAtiv(cfg, a.tipo)}</p>
                  <button type="button" onClick={() => onAbrir(a.escola_id)} className="text-xs text-slate-600 hover:text-violet-700 hover:underline">{a.escola_nome}{a.bairro ? ` · ${a.bairro}` : ''}{a.pessoa_nome ? ` · ${a.pessoa_nome}` : ''}</button>
                </div>
                <button type="button" className={btnCls} onClick={() => onDesfecho(a)}>{a.data < cfg.hoje ? 'Atrasada: como foi?' : 'Como foi?'}</button>
              </li>
            ))}
          </ul>
        </Secao>

        <Secao titulo={<span className="inline-flex items-center gap-1.5"><Route size={16} className="text-violet-600" />{rota ? `Rota de hoje: ${rota.n}` : 'Rota de visitas'}</span>}
          sub={rota ? `${rota.obs} Confirme o horário por telefone antes de sair.` : 'Rota A na terça, rota B na quarta. Hoje é dia de ligações, demos e follow-up.'}
          extra={rota && h.rota.length > 0 && <a href={linkRota(h.rota.filter((e) => e.endereco))} target="_blank" rel="noreferrer" className={btnCls}><Navigation size={14} />Abrir rota</a>}>
          {rota && !h.rota.length && <p className="text-sm text-slate-500">Nenhuma escola da rota {rota.k} esperando visita.</p>}
          <ul>
            {h.rota.slice(0, 10).map((e) => (
              <LinhaEscola key={e.id} e={e} cfg={cfg} onAbrir={onAbrir}
                direita={<a href={linkMaps(e)} target="_blank" rel="noreferrer" className="text-xs text-violet-700 hover:underline">mapa</a>}>
                {e.endereco ? ` · ${e.endereco}` : ''}
              </LinhaEscola>
            ))}
          </ul>
        </Secao>

        <Secao titulo={<span className="inline-flex items-center gap-1.5"><PhoneCall size={16} className="text-violet-600" />Cadência do dia</span>}
          sub="Passos devidos da cadência de 20 dias, das escolas A para as C.">
          {!h.cadencia.length && <p className="text-sm text-slate-500">Nenhum passo devido hoje.</p>}
          <ul>
            {h.cadencia.slice(0, 15).map((e) => (
              <LinhaEscola key={e.id} e={e} cfg={cfg} onAbrir={onAbrir}
                direita={<button type="button" className={btnCls} onClick={() => onPasso(e, e.passo.k)}>D{e.passo.dia} · {e.passo.canal}{e.passo.atrasado ? ' (atrasado)' : ''}</button>} />
            ))}
          </ul>
          {h.cadencia.length > 15 && <p className="mt-1 text-xs text-slate-500">+{h.cadencia.length - 15} na aba Escolas (filtro “passo devido”).</p>}
        </Secao>

        <Secao titulo={<span className="inline-flex items-center gap-1.5"><FlaskConical size={16} className="text-fuchsia-600" />Pilotos e próximos passos</span>}>
          {!h.pilotos.length && !h.passos_hoje.length && <p className="text-sm text-slate-500">Nada vencendo hoje.</p>}
          <ul>
            {h.pilotos.map((e) => (
              <LinhaEscola key={'p' + e.id} e={e} cfg={cfg} onAbrir={onAbrir}
                direita={<button type="button" className={btnCls} onClick={() => onMarcoPiloto(e)}>Piloto D{e.marco.dia}: {e.marco.n}</button>} />
            ))}
            {h.passos_hoje.map((e) => (
              <LinhaEscola key={'s' + e.id} e={e} cfg={cfg} onAbrir={onAbrir}
                direita={<span className="text-xs text-slate-500">{e.proxima_data < cfg.hoje ? `atrasado ${dataBr(e.proxima_data)}` : 'hoje'}</span>}>
                {e.proximo_passo ? ` · ${e.proximo_passo}` : ''}
              </LinhaEscola>
            ))}
          </ul>
        </Secao>
      </div>

      {(h.parados.length > 0 || h.nutricao.length > 0 || h.sem_passo.length > 0) && (
        <div className="grid gap-4 lg:grid-cols-3">
          <Secao titulo={<span className="inline-flex items-center gap-1.5"><AlertTriangle size={16} className="text-amber-600" />Parados além do prazo</span>}>
            {!h.parados.length && <p className="text-sm text-slate-500">Nenhum.</p>}
            <ul>{h.parados.slice(0, 8).map((e) => <LinhaEscola key={e.id} e={e} cfg={cfg} onAbrir={onAbrir}> · {e.prazo.dias} dias (prazo {e.prazo.sla})</LinhaEscola>)}</ul>
          </Secao>
          <Secao titulo={<span className="inline-flex items-center gap-1.5"><RotateCcw size={16} className="text-teal-600" />Voltam da nutrição</span>}>
            {!h.nutricao.length && <p className="text-sm text-slate-500">Nenhuma.</p>}
            <ul>{h.nutricao.map((e) => <LinhaEscola key={e.id} e={e} cfg={cfg} onAbrir={onAbrir} />)}</ul>
          </Secao>
          <Secao titulo="Sem próximo passo" sub="Toda conversa termina com a data da próxima.">
            {!h.sem_passo.length && <p className="text-sm text-slate-500">Nenhuma.</p>}
            <ul>{h.sem_passo.slice(0, 8).map((e) => <LinhaEscola key={e.id} e={e} cfg={cfg} onAbrir={onAbrir} />)}</ul>
          </Secao>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// FUNIL (kanban por trilha)
// ---------------------------------------------------------------------------
export function VistaFunil({ escolas, cfg, onAbrir }) {
  const [trilha, setTrilha] = useState('escola');
  const colunas = [...(cfg.etapas[trilha] || []).map((e) => e.k), ...(cfg.finais_trilha[trilha] || [])];
  const ordem = { A: 0, B: 1, C: 2 };
  const icones = { escola: School, rede: Landmark, parceiro: HeartHandshake };
  const nomes = { escola: 'Escolas', rede: 'Redes públicas', parceiro: 'Canais indicadores' };
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-2">
        {Object.keys(cfg.etapas).map((t) => {
          const I = icones[t];
          const n = escolas.filter((e) => e.trilha === t).length;
          return (
            <button key={t} type="button" onClick={() => setTrilha(t)}
              className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-sm font-medium ${trilha === t ? 'bg-violet-700 text-white' : 'bg-white text-slate-600 ring-1 ring-slate-300 hover:bg-slate-50'}`}>
              <I size={15} />{nomes[t]} <span className="opacity-70">{n}</span>
            </button>
          );
        })}
      </div>
      <div className="flex gap-3 overflow-x-auto pb-2">
        {colunas.map((k) => {
          const info = (cfg.etapas[trilha] || []).find((x) => x.k === k);
          const lista = escolas.filter((e) => e.trilha === trilha && e.etapa === k)
            .sort((a, b) => (ordem[a.prioridade] ?? 3) - (ordem[b.prioridade] ?? 3) || (b.pontos_calc ?? 0) - (a.pontos_calc ?? 0));
          return (
            <div key={k} className="flex w-64 shrink-0 flex-col rounded-xl bg-slate-100/80 p-2">
              <div className="mb-2 px-1">
                <div className="flex items-center justify-between"><span className="text-xs font-semibold text-slate-700">{cfg.nomes_etapa[k]}</span><span className="text-xs tabular-nums text-slate-500">{lista.length}</span></div>
                {info && <p className="text-[10px] leading-tight text-slate-500">prazo {info.sla} dias · {info.acao}</p>}
              </div>
              <div className="flex flex-col gap-1.5">
                {lista.map((e) => (
                  <button key={e.id} type="button" onClick={() => onAbrir(e.id)}
                    className={`rounded-lg border bg-white p-2 text-left shadow-sm hover:border-violet-300 ${e.prazo?.nivel === 'estourado' ? 'border-amber-300' : 'border-slate-200'}`}>
                    <div className="flex items-start justify-between gap-1">
                      <span className="text-xs font-medium leading-snug text-slate-900">{e.nome}</span>
                      <Prioridade p={e.prioridade} pontos={e.pontos_calc} preliminar={e.pontos_preliminar} />
                    </div>
                    <div className="mt-1 flex flex-wrap items-center gap-1 text-[10px] text-slate-500">
                      {e.bairro && <span>{e.bairro}</span>}
                      {e.passo?.devido && <span className="rounded bg-violet-100 px-1 font-semibold text-violet-800">D{e.passo.dia}</span>}
                      {e.proxima_reuniao && <span className="rounded bg-fuchsia-100 px-1 font-semibold text-fuchsia-800">{dataBr(e.proxima_reuniao.data)}</span>}
                      {e.piloto_sit && !e.piloto_sit.encerrado && <span className="rounded bg-fuchsia-600 px-1 font-semibold text-white">piloto D{e.piloto_sit.dia}</span>}
                      {e.prazo?.nivel === 'estourado' && <span className="text-amber-700">{e.prazo.dias}d</span>}
                    </div>
                  </button>
                ))}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// ESCOLAS (tabela com filtros)
// ---------------------------------------------------------------------------
export function VistaEscolas({ escolas, cfg, onAbrir, onNova }) {
  const [q, setQ] = useState('');
  const [fil, setFil] = useState({ prio: '', rota: '', tipo: '', extra: '' });
  const lista = useMemo(() => {
    const t = q.trim().toLowerCase();
    return escolas.filter((e) => (!t || [e.nome, e.bairro, e.endereco, e.decisor_nome].filter(Boolean).join(' ').toLowerCase().includes(t))
      && (!fil.prio || e.prioridade === fil.prio) && (!fil.rota || e.rota === fil.rota) && (!fil.tipo || e.tipo === fil.tipo)
      && (!fil.extra || (fil.extra === 'confirmar' ? !e.dados_confirmados : fil.extra === 'sem_tel' ? !e.telefone : fil.extra === 'passo' ? e.passo?.devido : fil.extra === 'sem_decisor' ? !e.decisor_nome : true)))
      .sort((a, b) => ({ A: 0, B: 1, C: 2 }[a.prioridade] ?? 3) - ({ A: 0, B: 1, C: 2 }[b.prioridade] ?? 3) || (b.pontos_calc ?? 0) - (a.pontos_calc ?? 0));
  }, [escolas, q, fil]);
  const sel = (k, opcoes) => (
    <select className={inputCls.replace('w-full', 'w-auto')} value={fil[k]} onChange={(ev) => setFil({ ...fil, [k]: ev.target.value })}>{opcoes}</select>
  );
  return (
    <Secao titulo={`${lista.length} de ${escolas.length} escolas e contas`} sub="Os dados da lista vieram de diretórios públicos: confirme por telefone e marque “confirmados” na ficha."
      extra={<button type="button" className={btnViol} onClick={onNova}>+ Nova escola</button>}>
      <div className="mb-3 flex flex-wrap gap-2">
        <div className="relative"><Search size={14} className="absolute left-2 top-2.5 text-slate-400" /><input className={inputCls + ' w-56 pl-7'} placeholder="Buscar nome, bairro, decisor" value={q} onChange={(ev) => setQ(ev.target.value)} /></div>
        {sel('prio', <><option value="">Prioridade</option><option>A</option><option>B</option><option>C</option></>)}
        {sel('rota', <><option value="">Rota</option>{cfg.rotas.map((r) => <option key={r.k} value={r.k}>{r.n}</option>)}</>)}
        {sel('tipo', <><option value="">Tipo</option>{cfg.tipos.map((t) => <option key={t.k} value={t.k}>{t.n}</option>)}</>)}
        {sel('extra', <><option value="">Situação</option><option value="passo">Passo da cadência devido</option><option value="confirmar">Dados a confirmar</option><option value="sem_tel">Sem telefone (buscar)</option><option value="sem_decisor">Sem decisor mapeado</option></>)}
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead><tr className="border-b border-slate-200 text-left text-[11px] uppercase tracking-wide text-slate-500">
            <th className="py-2 pr-2">Escola</th><th className="pr-2">Prio</th><th className="pr-2">Etapa</th><th className="pr-2">Bairro / rota</th><th className="pr-2">Contato</th><th className="pr-2">Decisor</th><th>Próximo passo</th>
          </tr></thead>
          <tbody>
            {lista.map((e) => (
              <tr key={e.id} className="cursor-pointer border-b border-slate-100 hover:bg-violet-50/40" onClick={() => onAbrir(e.id)}>
                <td className="py-2 pr-2"><p className="font-medium text-slate-900">{e.nome}</p><p className="text-xs text-slate-500">{cfg.tipos.find((t) => t.k === e.tipo)?.n}{e.etapas_ensino ? ` · ${e.etapas_ensino}` : ''}</p></td>
                <td className="pr-2"><Prioridade p={e.prioridade} pontos={e.pontos_calc} preliminar={e.pontos_preliminar} /></td>
                <td className="pr-2"><Etapa k={e.etapa} nome={cfg.nomes_etapa[e.etapa]} /></td>
                <td className="pr-2 text-xs text-slate-600">{e.bairro || '—'} <Rota r={e.rota} /></td>
                <td className="pr-2 text-xs">{e.telefone ? <span className="text-slate-700">{e.telefone}</span> : <span className="font-medium text-amber-700">buscar</span>}{!e.dados_confirmados && <span className="ml-1 text-[10px] text-amber-600">a confirmar</span>}</td>
                <td className="pr-2 text-xs text-slate-600">{e.decisor_nome || <span className="text-slate-400">—</span>}</td>
                <td className="text-xs text-slate-600">{e.passo?.devido ? <b className="text-violet-700">D{e.passo.dia} · {e.passo.canal}</b> : e.proximo_passo ? `${e.proximo_passo}${e.proxima_data ? ' · ' + dataBr(e.proxima_data) : ''}` : '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {cfg.vagas_a_completar?.length > 0 && <p className="mt-3 text-xs text-slate-500">Para completar 40: escolas de {cfg.vagas_a_completar.join(', ')}. Priorize quem tem AEE ativo (o Censo Escolar informa sala de recursos).</p>}
    </Secao>
  );
}

// ---------------------------------------------------------------------------
// ROTAS
// ---------------------------------------------------------------------------
export function VistaRotas({ escolas, cfg, onAbrir }) {
  const [sel, setSel] = useState({});
  const abertas = escolas.filter((e) => e.trilha === 'escola' && !['ganho', 'perdido'].includes(e.etapa));
  return (
    <div className="grid gap-4 lg:grid-cols-3">
      {[...cfg.rotas, { k: null, n: 'Sem rota', quando: 'Defina o bairro', obs: 'Escolas sem bairro conhecido.' }].map((r) => {
        const lista = abertas.filter((e) => (e.rota || null) === r.k);
        if (r.k === null && !lista.length) return null;
        const porBairro = {};
        for (const e of lista) (porBairro[e.bairro || '—'] ??= []).push(e);
        const marcadas = lista.filter((e) => sel[e.id] && e.endereco);
        return (
          <Secao key={r.k || 'sem'} titulo={<span className="inline-flex items-center gap-1.5"><Route size={16} className="text-violet-600" />{r.k ? `Rota ${r.n}` : r.n}</span>}
            sub={`${r.quando} · ${r.obs}`}
            extra={marcadas.length > 0 && <a href={linkRota(marcadas)} target="_blank" rel="noreferrer" className={btnViol}><Navigation size={14} />Rota com {marcadas.length}</a>}>
            <p className="mb-2 text-xs text-slate-500">{lista.length} escolas · marque as que vai visitar e abra a rota no Google Maps (até 10).</p>
            {Object.entries(porBairro).sort().map(([b, es]) => (
              <div key={b} className="mb-2">
                <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">{b}</p>
                <ul>
                  {es.sort((a, z) => (z.pontos_calc ?? 0) - (a.pontos_calc ?? 0)).map((e) => (
                    <li key={e.id} className="flex items-start gap-2 py-1">
                      <input type="checkbox" className="mt-1" checked={!!sel[e.id]} onChange={(ev) => setSel({ ...sel, [e.id]: ev.target.checked })} disabled={!e.endereco} />
                      <div className="min-w-0">
                        <button type="button" onClick={() => onAbrir(e.id)} className="text-left text-sm font-medium text-slate-900 hover:text-violet-700 hover:underline">{e.nome}</button>
                        <div className="flex flex-wrap items-center gap-1"><Prioridade p={e.prioridade} pontos={e.pontos_calc} /><Etapa k={e.etapa} nome={cfg.nomes_etapa[e.etapa]} /></div>
                        {e.endereco && <a href={linkMaps(e)} target="_blank" rel="noreferrer" className="text-xs text-slate-500 hover:text-violet-700">{e.endereco}</a>}
                      </div>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </Secao>
        );
      })}
    </div>
  );
}

// ---------------------------------------------------------------------------
// PILOTOS
// ---------------------------------------------------------------------------
export function VistaPilotos({ painel, cfg, onAbrir }) {
  const pilotos = painel.pilotos;
  return (
    <div className="space-y-4">
      <Secao titulo="Piloto de 30 dias: como funciona" sub="Escopo de 3 a 5 professores e 1 profissional do AEE. Métricas e critério de sucesso combinados por escrito antes do início.">
        <div className="grid gap-2 sm:grid-cols-3">
          {cfg.marcos_piloto.map((m) => (
            <div key={m.k} className="rounded-lg bg-fuchsia-50 p-3"><p className="text-xs font-bold text-fuchsia-800">D{m.dia} · {m.n}</p><p className="text-sm text-slate-700">{m.acao}</p></div>
          ))}
        </div>
        <p className="mt-2 text-xs text-slate-500">Métricas: {cfg.metricas_piloto.map((m) => m.n.toLowerCase()).join(' · ')}. Saída: relatório de 1 página e proposta de expansão.</p>
      </Secao>
      {!pilotos.length && <p className="text-sm text-slate-500">Nenhum piloto ainda. O piloto começa na ficha da escola (bloco “Piloto de 30 dias”).</p>}
      <div className="grid gap-3 md:grid-cols-2">
        {pilotos.map((p) => {
          const s = p.piloto_sit;
          const pct = s ? Math.min(100, Math.round((s.dia / (s.de || 30)) * 100)) : 0;
          const reducao = p.piloto?.tempo_antes && p.piloto?.tempo_depois ? Math.round((1 - Number(p.piloto.tempo_depois) / Number(p.piloto.tempo_antes)) * 100) : null;
          return (
            <button key={p.id} type="button" onClick={() => onAbrir(p.id)} className="rounded-xl border border-slate-200 bg-white p-4 text-left hover:border-fuchsia-300">
              <div className="flex items-start justify-between gap-2">
                <div><p className="font-medium text-slate-900">{p.nome}</p><p className="text-xs text-slate-500">{p.bairro} · início {dataBr(p.piloto_inicio)} · fim {dataBr(p.piloto_fim)}</p></div>
                {s?.encerrado ? <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-semibold text-emerald-800">encerrado</span>
                  : s?.vencido ? <span className="rounded-full bg-red-100 px-2 py-0.5 text-xs font-semibold text-red-700">vencido</span>
                    : <span className="rounded-full bg-fuchsia-100 px-2 py-0.5 text-xs font-semibold text-fuchsia-800">dia {s?.dia}</span>}
              </div>
              <div className="mt-2 h-2 overflow-hidden rounded-full bg-slate-100"><div className="h-full rounded-full bg-fuchsia-500" style={{ width: `${pct}%` }} /></div>
              <p className="mt-2 text-xs text-slate-600"><b>Critério:</b> {p.piloto?.criterio || '—'}</p>
              <div className="mt-1 flex flex-wrap gap-3 text-xs text-slate-600">
                {p.piloto?.professores && <span>{p.piloto.professores} professores</span>}
                {p.piloto?.adaptacoes && <span>{p.piloto.adaptacoes} adaptações</span>}
                {reducao != null && <span className="font-semibold text-emerald-700">−{reducao}% de tempo por adaptação</span>}
                {p.marco && !s?.encerrado && <span className="text-fuchsia-700">próximo: D{p.marco.dia} {p.marco.n} ({dataBr(p.marco.data)})</span>}
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// SEMANA (painel de sexta)
// ---------------------------------------------------------------------------
export function VistaSemana({ painel, cfg, onRecarregar, semana, setSemana }) {
  const [metas, setMetas] = useState(painel.semana.metas);
  const [erro, setErro] = useState('');
  const [editar, setEditar] = useState(false);
  useEffect(() => setMetas(painel.semana.metas), [painel]);
  const mx = Math.max(1, ...painel.serie.map((s) => Math.max(s.contatos, painel.semana.metas.contatos)));
  const funil = painel.funil.escola.filter((e) => !['perdido', 'nutricao'].includes(e.k));
  const maxF = Math.max(1, ...funil.map((f) => f.qtd));
  const mudarSemana = (d) => { const x = new Date((semana || painel.semana.inicio) + 'T12:00:00'); x.setDate(x.getDate() + d); setSemana(x.toISOString().slice(0, 10)); };
  async function salvarMetas() {
    try { await api.put('/comercial/adaptai/metas', Object.fromEntries(Object.entries(metas).map(([k, v]) => [k, Number(v)]))); setEditar(false); onRecarregar(); } catch (err) { setErro(mensagemDeErro(err)); }
  }
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <button type="button" className={btnCls} onClick={() => mudarSemana(-7)}>‹</button>
          <span className="text-sm font-medium text-slate-800">Semana de {dataBr(painel.semana.inicio)} a {dataBr(painel.semana.fim)}</span>
          <button type="button" className={btnCls} onClick={() => mudarSemana(7)} disabled={painel.semana.inicio >= painel.hoje.slice(0, 10) && false}>›</button>
          {semana && <button type="button" className="text-xs text-violet-700 hover:underline" onClick={() => setSemana(null)}>esta semana</button>}
        </div>
        {cfg.eu.gestor && <button type="button" className={btnCls} onClick={() => setEditar(!editar)}><Target size={14} />Ajustar metas</button>}
      </div>
      {editar && (
        <Secao titulo="Metas semanais" sub="Hipóteses de partida: ajuste a conversão por etapa depois de 4 a 8 semanas de dados reais.">
          <div className="grid grid-cols-3 gap-2 sm:grid-cols-6">
            {cfg.metas_def.map((d) => <Campo key={d.k} rotulo={d.n}><input type="number" min="0" className={inputCls} value={metas[d.k]} onChange={(ev) => setMetas({ ...metas, [d.k]: ev.target.value })} /></Campo>)}
          </div>
          <div className="mt-2 flex gap-2"><button type="button" className={btnViol} onClick={salvarMetas}>Salvar metas</button></div>
          <Erro>{erro}</Erro>
        </Secao>
      )}
      <FaixaSemana painel={painel} cfg={cfg} />
      <div className="grid gap-4 lg:grid-cols-2">
        <Secao titulo="Funil das escolas" sub="Quantas escolas em cada etapa agora.">
          <div className="space-y-1.5">
            {funil.map((f) => (
              <div key={f.k} className="flex items-center gap-2">
                <span className="w-36 shrink-0 text-xs text-slate-600">{f.n}</span>
                <div className="h-5 flex-1 rounded bg-slate-100"><div className="flex h-5 items-center rounded bg-gradient-to-r from-violet-600 to-fuchsia-500 px-1.5 text-[11px] font-semibold text-white" style={{ width: `${Math.max(f.qtd ? 8 : 0, (f.qtd / maxF) * 100)}%` }}>{f.qtd || ''}</div></div>
              </div>
            ))}
          </div>
        </Secao>
        <Secao titulo="Conversão por etapa" sub="Passagem de uma etapa para a seguinte (todas as escolas). Referência do plano: decisor 25% dos contatos, diagnóstico 50% dos decisores, proposta ~40% das demos.">
          <table className="w-full text-sm">
            <tbody>
              {painel.conversao.map((c) => (
                <tr key={c.para} className="border-b border-slate-100 last:border-0">
                  <td className="py-1.5 text-xs text-slate-600">{c.de_n} → {c.para_n}</td>
                  <td className="text-right text-xs tabular-nums text-slate-500">{c.foram}/{c.base}</td>
                  <td className="w-16 text-right font-semibold tabular-nums text-slate-900">{c.pct == null ? '—' : c.pct + '%'}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="mt-2 text-xs text-slate-500">Ciclo médio (contato → ganho): {painel.ciclo_medio == null ? 'ainda sem ganhos' : `${painel.ciclo_medio} dias`}.</p>
        </Secao>
        <Secao titulo="Últimas 8 semanas" sub="Contatos feitos (barra) contra a meta (linha).">
          <div className="flex items-end gap-2">
            {painel.serie.map((s) => (
              <div key={s.inicio} className="flex flex-1 flex-col items-center gap-1">
                <span className="text-[10px] font-semibold tabular-nums text-slate-600">{s.contatos || ''}</span>
                <div className="relative flex h-32 w-full items-end">
                  <div className="absolute inset-x-0 border-t border-dashed border-amber-400" style={{ bottom: `${(painel.semana.metas.contatos / mx) * 100}%` }} />
                  <div className="w-full rounded-t bg-violet-500" style={{ height: `${(s.contatos / mx) * 100}%` }} title={`${s.contatos} contatos · ${s.diagnosticos} diagnósticos · ${s.demos} demos`} />
                </div>
                <span className="text-[10px] tabular-nums text-slate-500">{dataBr(s.inicio)}</span>
              </div>
            ))}
          </div>
        </Secao>
        <Secao titulo="Prioridades e perdas">
          <div className="grid grid-cols-3 gap-2">
            {['A', 'B', 'C'].map((p) => {
              const x = painel.prioridades[p];
              return (
                <div key={p} className="rounded-lg bg-slate-50 p-3 text-center">
                  <Prioridade p={p} />
                  <p className="mt-1 text-xl font-semibold tabular-nums text-slate-900">{x.tocadas}<span className="text-sm font-normal text-slate-400">/{x.total}</span></p>
                  <p className="text-[11px] text-slate-500">já contatadas</p>
                </div>
              );
            })}
          </div>
          <p className="mt-3 text-xs font-semibold uppercase tracking-wide text-slate-500">Motivos de perda</p>
          {!Object.keys(painel.motivos).length && <p className="text-sm text-slate-500">Nenhuma perda registrada.</p>}
          <ul className="mt-1 space-y-1">{Object.entries(painel.motivos).sort((a, b) => b[1] - a[1]).map(([m, n]) => <li key={m} className="flex justify-between text-sm"><span className="text-slate-700">{m}</span><b className="tabular-nums">{n}</b></li>)}</ul>
        </Secao>
      </div>
      <Placar painel={painel} cfg={cfg} />
    </div>
  );
}

function Placar({ painel, cfg }) {
  const pp = painel.semana.numeros.por_pessoa || {};
  const linhas = Object.entries(pp).map(([id, v]) => ({ id, nome: cfg.pessoas.find((p) => p.id === id)?.nome || '—', ...v })).sort((a, b) => b.contatos - a.contatos);
  if (!linhas.length) return null;
  return (
    <Secao titulo={<span className="inline-flex items-center gap-1.5"><Users size={16} className="text-violet-600" />Por pessoa na semana</span>}>
      <table className="w-full text-sm">
        <thead><tr className="text-left text-[11px] uppercase tracking-wide text-slate-500"><th className="py-1">Pessoa</th><th className="text-right">Contatos</th><th className="text-right">Visitas</th><th className="text-right">Reuniões</th></tr></thead>
        <tbody>{linhas.map((l) => <tr key={l.id} className="border-t border-slate-100"><td className="py-1.5">{l.nome}</td><td className="text-right tabular-nums">{l.contatos}</td><td className="text-right tabular-nums">{l.visitas}</td><td className="text-right tabular-nums">{l.reunioes}</td></tr>)}</tbody>
      </table>
    </Secao>
  );
}

// ---------------------------------------------------------------------------
// PLANO (4 semanas, kit, decisões)
// ---------------------------------------------------------------------------
export function VistaPlano({ cfg }) {
  const [itens, setItens] = useState({});
  const [erro, setErro] = useState('');
  const carregar = () => api.get('/comercial/adaptai/checklist').then((r) => setItens(r.data.itens)).catch((err) => setErro(mensagemDeErro(err)));
  useEffect(() => { carregar(); }, []);
  async function marcar(chave, tipo, feito) {
    setItens((x) => ({ ...x, [chave]: { ...(x[chave] || {}), feito } }));
    try { await api.put(`/comercial/adaptai/checklist/${chave}`, { tipo, feito }); } catch (err) { setErro(mensagemDeErro(err)); carregar(); }
  }
  const Item = ({ chave, tipo, texto, sub, bloqueado }) => {
    const feito = !!itens[chave]?.feito;
    return (
      <li className="flex items-start gap-2 py-1.5">
        <button type="button" disabled={bloqueado} onClick={() => marcar(chave, tipo, !feito)} className="mt-0.5 disabled:opacity-40" aria-label={feito ? 'Desmarcar' : 'Marcar'}>
          {feito ? <CheckCircle2 size={17} className="text-emerald-600" /> : <Circle size={17} className="text-slate-300" />}
        </button>
        <div><p className={`text-sm ${feito ? 'text-slate-400 line-through' : 'text-slate-800'}`}>{texto}</p>{sub && <p className="text-xs text-slate-500">{sub}</p>}</div>
      </li>
    );
  };
  return (
    <div className="space-y-4">
      <Erro>{erro}</Erro>
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        {M.PLANO.map((s) => {
          const feitos = s.itens.filter(([k]) => itens[k]?.feito).length;
          return (
            <Secao key={s.semana} titulo={`Semana ${s.semana}`} sub={s.foco}
              extra={<span className="rounded-full bg-violet-100 px-2 py-0.5 text-xs font-semibold text-violet-800">{feitos}/{s.itens.length}</span>}>
              <ul>{s.itens.map(([k, t]) => <Item key={k} chave={k} tipo="plano" texto={t} />)}</ul>
              <p className="mt-2 rounded-md bg-slate-50 px-2 py-1.5 text-xs text-slate-600"><b>Resultado esperado:</b> {s.resultado}</p>
            </Secao>
          );
        })}
      </div>
      <div className="grid gap-4 lg:grid-cols-2">
        <Secao titulo="Kit de curadoria" sub="O que ter pronto antes das visitas. Útil na sala vence genérico.">
          <ul>{M.KIT.map(([k, t, para]) => <Item key={k} chave={k} tipo="kit" texto={t} sub={`Para: ${para}`} />)}</ul>
        </Secao>
        <Secao titulo="Decisões pedidas à diretoria" sub={cfg.eu.gestor ? 'Marque quando a diretoria decidir.' : 'Só a gestão marca.'}>
          <ul>{M.DECISOES.map(([k, t]) => <Item key={k} chave={k} tipo="decisao" texto={t} bloqueado={!cfg.eu.gestor} />)}</ul>
          <p className="mt-2 text-xs text-slate-500">Enquanto a tabela de preços não estiver definida, a proposta sai sem valor e o caminho é o piloto.</p>
        </Secao>
      </div>
      <Secao titulo="Rotina semanal" sub={M.BLOCOS_FIXOS}>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead><tr className="text-left text-[11px] uppercase tracking-wide text-slate-500"><th className="py-1 pr-2">Dia</th><th className="pr-2">Manhã</th><th className="pr-2">Tarde</th><th>Entregável</th></tr></thead>
            <tbody>{M.ROTINA.map((r) => <tr key={r[0]} className="border-t border-slate-100 align-top"><td className="py-2 pr-2 font-medium text-slate-900">{r[0]}</td><td className="pr-2 text-slate-600">{r[1]}</td><td className="pr-2 text-slate-600">{r[2]}</td><td className="text-violet-800">{r[3]}</td></tr>)}</tbody>
          </table>
        </div>
        <ul className="mt-3 list-disc space-y-1 pl-5 text-xs text-slate-600">{M.COMPLEMENTARES.map((c) => <li key={c}>{c}</li>)}</ul>
      </Secao>
    </div>
  );
}

// ---------------------------------------------------------------------------
// MÉTODO (consulta)
// ---------------------------------------------------------------------------
export function VistaMetodo({ cfg }) {
  return (
    <div className="space-y-4">
      <div className="rounded-2xl bg-gradient-to-br from-violet-800 via-violet-700 to-fuchsia-700 p-6 text-white">
        <p className="text-[11px] font-semibold uppercase tracking-widest text-violet-200">Método AdaptAI · escolas de Belém · foco em TEA</p>
        <h2 className="mt-1 text-xl font-semibold">{M.RESUMO.frase}</h2>
        <p className="mt-3 rounded-lg bg-white/10 px-3 py-2 text-sm">Pergunta que abre qualquer porta: <b>“{M.RESUMO.pergunta}”</b></p>
        <div className="mt-4 grid gap-2 sm:grid-cols-5">
          {M.RESUMO.itens.map(([t, d]) => <div key={t} className="rounded-lg bg-white/10 p-3"><p className="text-xs font-bold text-violet-200">{t}</p><p className="text-xs">{d}</p></div>)}
        </div>
      </div>

      <Secao titulo="Jornada de reuniões" sub="Toda reunião termina com a data da próxima.">
        <ol className="grid gap-2 md:grid-cols-4">
          {M.JORNADA.map((j, i) => (
            <li key={j.n} className="rounded-lg border border-violet-200 bg-violet-50/50 p-3">
              <p className="text-xs font-bold text-violet-700">{i + 1}. {j.n} · {j.t}</p>
              <p className="text-[11px] text-slate-500">{j.com}</p>
              <p className="mt-1 text-sm text-slate-700">{j.o}</p>
            </li>
          ))}
        </ol>
      </Secao>

      <div className="grid gap-4 lg:grid-cols-2">
        <Secao titulo="Abordagem por público">
          <ul className="space-y-2">
            {cfg.tipos.map((t) => (
              <li key={t.k} className="border-b border-slate-100 pb-2 last:border-0">
                <p className="text-sm font-medium text-slate-900">{t.n} <span className="text-xs font-normal text-slate-500">· ciclo {t.ciclo}</span></p>
                <p className="text-xs text-slate-600"><b>Decide:</b> {t.decide}. <b>Argumento:</b> {t.argumento}.</p>
              </li>
            ))}
          </ul>
          <p className="mt-2 text-xs text-slate-500">Prazos de referência para planejar; calibre com dados reais. Contratação pública segue a Lei 14.133/2021: valide a modalidade com o jurídico.</p>
        </Secao>
        <Secao titulo="Cinco caminhos até a direção">
          <ol className="space-y-2">{M.CAMINHOS.map(([c, d], i) => <li key={c} className="text-sm"><b className="text-violet-800">{i + 1}. {c}.</b> <span className="text-slate-700">{d}</span></li>)}</ol>
          <p className="mt-3 text-xs font-semibold uppercase tracking-wide text-slate-500">Onde achar escolas</p>
          <ul className="mt-1 list-disc space-y-1 pl-5 text-xs text-slate-600">{M.FONTES_CAPTACAO.map((x) => <li key={x}>{x}</li>)}</ul>
        </Secao>
      </div>

      <Secao titulo="Cadência multicanal de 20 dias e modelos de mensagem" sub={`Regra de ouro: ${M.REGRA_OURO}`}>
        <div className="space-y-2">
          {cfg.cadencia.map((c) => {
            const m = M.MODELOS[c.modelo];
            return (
              <div key={c.k} className="grid gap-2 rounded-lg border border-slate-200 p-3 md:grid-cols-[110px_1fr]">
                <div><p className="text-lg font-bold text-violet-700">D{c.dia}</p><p className="text-xs text-slate-500">{c.canal}</p></div>
                <div>
                  <p className="text-sm text-slate-800">{c.acao} <span className="text-xs text-slate-500">· {c.objetivo}</span></p>
                  {m && <div className="mt-1 rounded bg-slate-50 p-2 text-xs text-slate-600"><div className="flex justify-between"><span className="font-semibold">{m.canal}</span><Copiar texto={(m.assunto ? 'Assunto: ' + m.assunto + '\n\n' : '') + m.texto} /></div><p className="whitespace-pre-line">{m.texto}</p></div>}
                </div>
              </div>
            );
          })}
          {['whatsapp_direcao', 'secretaria_publica'].map((k) => (
            <div key={k} className="rounded-lg border border-dashed border-slate-300 p-3 text-xs text-slate-600">
              <div className="flex justify-between"><span className="font-semibold">{M.MODELOS[k].canal}</span><Copiar texto={M.MODELOS[k].texto} /></div>
              <p>{M.MODELOS[k].texto}</p>
            </div>
          ))}
        </div>
      </Secao>

      <div className="grid gap-4 lg:grid-cols-3">
        <Secao titulo="Diagnóstico (20 a 30 min)">
          <ul className="space-y-2">{cfg.diagnostico.map((d) => <li key={d.k} className="text-sm"><b className="text-violet-800">{d.n}.</b> <span className="text-slate-600">{d.perguntas}</span></li>)}</ul>
          <p className="mt-2 text-xs text-slate-500">Ao final: “Entendi que o maior problema é X, que custa Y horas. Correto?”</p>
        </Secao>
        <Secao titulo="Oficina gratuita (30 min)">
          <ul className="space-y-2">{M.OFICINA.map(([t, d]) => <li key={t} className="text-sm"><b className="tabular-nums text-violet-800">{t}</b> <span className="text-slate-600">{d}</span></li>)}</ul>
        </Secao>
        <Secao titulo="Demo para decisor (20 a 30 min)">
          <ul className="space-y-2">{M.DEMO.map(([t, d]) => <li key={t} className="text-sm"><b className="tabular-nums text-violet-800">{t}</b> <span className="text-slate-600">{d}</span></li>)}</ul>
        </Secao>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Secao titulo="Apresentação de 20 minutos" sub="5 slides, no máximo 20 palavras cada.">
          <ol className="space-y-1.5">{M.SLIDES.map(([s, o], i) => <li key={s} className="text-sm"><b className="text-violet-800">{i + 1}. {s}.</b> <span className="text-slate-600">{o}</span></li>)}</ol>
          <p className="mt-3 text-xs font-semibold uppercase tracking-wide text-slate-500">Proposta: itens obrigatórios</p>
          <ul className="mt-1 list-disc space-y-1 pl-5 text-xs text-slate-600">{M.PROPOSTA_ITENS.map((x) => <li key={x}>{x}</li>)}</ul>
        </Secao>
        <Secao titulo="A lei como argumento" sub="“A lei diz o quê. Ninguém ensina o como. É aí que entramos.” Tom de apoio, nunca de ameaça. Confirmar os artigos com o jurídico antes de imprimir.">
          <ul className="space-y-2">{M.LEIS.map(([l, d]) => <li key={l} className="text-sm"><b className="text-slate-900">{l}.</b> <span className="text-slate-600">{d}</span></li>)}</ul>
        </Secao>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Secao titulo="Objeções mais comuns">
          <ul className="space-y-2">{M.OBJECOES.map(([o, r]) => <li key={o} className="text-sm"><b className="text-slate-900">{o}</b><p className="text-slate-600">{r}</p></li>)}</ul>
        </Secao>
        <Secao titulo="Riscos e cuidados" sub="O que protege a marca.">
          <ul className="space-y-2">{M.RISCOS.map(([r, c]) => <li key={r} className="text-sm"><b className="text-red-700">{r}.</b> <span className="text-slate-600">{c}</span></li>)}</ul>
          <p className="mt-3 text-xs font-semibold uppercase tracking-wide text-slate-500">Realidade de Belém</p>
          <ul className="mt-1 list-disc space-y-1 pl-5 text-xs text-slate-600">{M.BELEM.map((x) => <li key={x}>{x}</li>)}</ul>
          <p className="mt-3 text-xs font-semibold uppercase tracking-wide text-slate-500">Brindes</p>
          <p className="text-xs text-slate-600"><b className="text-emerald-700">Funciona:</b> {M.BRINDES.funciona.join('; ')}. <b className="text-red-700">Não funciona:</b> {M.BRINDES.nao.join('; ')}.</p>
        </Secao>
      </div>

      <Secao titulo="Pilares da venda">
        <div className="grid gap-2 md:grid-cols-3">
          {M.PILARES.map(([p, d, m], i) => <div key={p} className="rounded-lg bg-slate-50 p-3"><p className="text-sm font-semibold text-slate-900">{i + 1}. {p}</p><p className="text-xs text-slate-600">{d}</p><p className="mt-1 text-[11px] text-violet-700">Medir: {m}</p></div>)}
        </div>
      </Secao>
    </div>
  );
}
