import { useEffect, useMemo, useState } from 'react';
import Card from './Card.jsx';
import { COR_CHIP, PRIORIDADES, prioridadeDe } from './ui.js';
import { api } from '../../api/client.js';

/**
 * Sprint 35 — Swimlanes (vista agrupada).
 *
 * Agrupa os cards em faixas por responsável / etiqueta / prioridade, e
 * dentro de cada faixa mostra as colunas do quadro. É a vista de reunião
 * de status: "o que cada um tem", "o que está em cada prioridade".
 *
 * Read-only de propósito: o drag & drop mora no kanban normal. Reimplementar
 * DnD entre faixas (arrastar muda o agrupador?) seria fonte de bug — aqui a
 * pessoa clica no card e edita no modal. Mantém o board de arrastar intacto.
 */

const AGRUPADORES = [
  { id: 'sprint', nome: 'Sprint' },
  { id: 'responsavel', nome: 'Responsável' },
  { id: 'etiqueta', nome: 'Etiqueta' },
  { id: 'prioridade', nome: 'Prioridade' },
];

export default function VistaAgrupada({ quadro, onAbrirCard }) {
  const [por, setPor] = useState('responsavel');
  const [sprints, setSprints] = useState([]);

  // Sprint 41 — carrega as sprints do quadro (não vêm no payload do board).
  useEffect(() => {
    let vivo = true;
    api.get('/sprints', { params: { quadro_id: quadro.id } })
      .then((r) => { if (vivo) setSprints(r.data); })
      .catch(() => { if (vivo) setSprints([]); });
    return () => { vivo = false; };
  }, [quadro.id]);

  const colunas = useMemo(
    () => [...(quadro.colunas || [])].sort((a, b) => a.ordem - b.ordem),
    [quadro.colunas],
  );

  const grupos = useMemo(() => montarGrupos(por, quadro, sprints), [por, quadro, sprints]);

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center gap-2 border-b border-slate-200 bg-white px-4 py-2">
        <span className="text-xs text-slate-500">Agrupar por:</span>
        <div className="inline-flex rounded-lg border border-slate-300 bg-white p-0.5">
          {AGRUPADORES.map((a) => (
            <button
              key={a.id}
              type="button"
              onClick={() => setPor(a.id)}
              className={[
                'rounded-md px-2.5 py-1 text-xs font-medium',
                por === a.id ? 'bg-nexus-700 text-white' : 'text-slate-600 hover:bg-slate-50',
              ].join(' ')}
            >
              {a.nome}
            </button>
          ))}
        </div>
      </div>

      <div className="flex-1 overflow-auto p-4">
        <div className="space-y-4">
          {grupos.map((g) => (
            <div key={g.chave} className="rounded-xl border border-slate-200 bg-slate-50/60">
              <div className="flex items-center gap-2 border-b border-slate-200 px-3 py-2">
                {g.badge}
                <span className="text-sm font-semibold text-slate-800">{g.nome}</span>
                <span className="rounded-full bg-slate-200 px-2 py-0.5 text-[10px] font-semibold text-slate-600">
                  {g.cards.length}
                </span>
              </div>

              <div className="flex gap-3 overflow-x-auto p-3">
                {colunas.map((col) => {
                  const cds = g.cards
                    .filter((c) => c.coluna_id === col.id)
                    .sort((a, b) => a.ordem - b.ordem);
                  if (cds.length === 0) return null;
                  return (
                    <div key={col.id} className="w-64 shrink-0">
                      <div className="mb-1.5 flex items-center gap-1 px-1 text-[10px] font-semibold uppercase tracking-wide text-slate-400">
                        {col.nome}
                        <span className="text-slate-300">·</span>
                        {cds.length}
                      </div>
                      <div className="space-y-2">
                        {cds.map((card) => (
                          <Card
                            key={card.id}
                            card={card}
                            etiquetas={quadro.etiquetas}
                            aoClicar={() => onAbrirCard(card.id)}
                          />
                        ))}
                      </div>
                    </div>
                  );
                })}
                {g.cards.length === 0 && (
                  <div className="px-2 py-3 text-xs text-slate-400">Sem cards.</div>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function montarGrupos(por, quadro, sprints = []) {
  const cards = quadro.cards || [];

  if (por === 'sprint') {
    const rank = (s) => (s.estado === 'ativa' ? 0 : s.estado === 'planejamento' ? 1 : 2);
    const ordenadas = [...sprints].sort(
      (a, b) => rank(a) - rank(b) || String(b.data_inicio).localeCompare(String(a.data_inicio)),
    );
    const badgeCls = (estado) => (
      estado === 'ativa' ? 'bg-emerald-100 text-emerald-800 border-emerald-300'
        : estado === 'encerrada' ? 'bg-slate-50 text-slate-400 border-slate-200'
          : 'bg-slate-100 text-slate-600 border-slate-200'
    );
    const badgeTxt = (estado) => (estado === 'ativa' ? 'ativa' : estado === 'encerrada' ? 'encerrada' : 'plan.');
    const grupos = ordenadas.map((s) => ({
      chave: s.id,
      nome: s.nome,
      badge: <span className={'rounded-full border px-2 py-0.5 text-[10px] font-medium ' + badgeCls(s.estado)}>{badgeTxt(s.estado)}</span>,
      cards: cards.filter((c) => c.sprint_id === s.id),
    })).filter((g) => g.cards.length > 0);
    const backlog = cards.filter((c) => c.fluxo === 'projeto' && !c.sprint_id);
    if (backlog.length > 0) grupos.push({ chave: '__backlog__', nome: 'Backlog do produto', badge: null, cards: backlog });
    const sust = cards.filter((c) => c.fluxo === 'sustentacao');
    if (sust.length > 0) grupos.push({ chave: '__sust__', nome: 'Sustentação', badge: null, cards: sust });
    return grupos;
  }

  if (por === 'prioridade') {
    return PRIORIDADES.map((p) => ({
      chave: 'p' + p.valor,
      nome: p.sigla + ' · ' + p.nome,
      badge: <span className={'rounded px-1.5 py-0.5 text-[10px] font-bold border ' + p.chip}>{p.sigla}</span>,
      cards: cards.filter((c) => Number(c.prioridade ?? 2) === p.valor),
    })).filter((g) => g.cards.length > 0);
  }

  if (por === 'etiqueta') {
    const grupos = (quadro.etiquetas || []).map((e) => ({
      chave: e.id,
      nome: e.nome,
      badge: <span className={'h-3 w-3 rounded-full ' + (COR_CHIP[e.cor] || COR_CHIP.slate).split(' ')[0].replace('-100', '-400')} />,
      cards: cards.filter((c) => (c.etiqueta_ids || []).includes(e.id)),
    })).filter((g) => g.cards.length > 0);
    const semEtq = cards.filter((c) => (c.etiqueta_ids || []).length === 0);
    if (semEtq.length > 0) {
      grupos.push({ chave: '__sem__', nome: 'Sem etiqueta', badge: null, cards: semEtq });
    }
    return grupos;
  }

  // responsável
  const map = new Map();
  const semResp = [];
  for (const c of cards) {
    const resps = c.responsaveis || [];
    if (resps.length === 0) { semResp.push(c); continue; }
    for (const r of resps) {
      if (!map.has(r.id)) map.set(r.id, { pessoa: r, cards: [] });
      map.get(r.id).cards.push(c);
    }
  }
  const grupos = [...map.values()]
    .sort((a, b) => a.pessoa.nome.localeCompare(b.pessoa.nome))
    .map((x) => ({
      chave: x.pessoa.id,
      nome: x.pessoa.nome,
      badge: <span className="inline-flex h-5 w-5 items-center justify-center rounded-full bg-nexus-100 text-[9px] font-semibold text-nexus-800">{inic(x.pessoa.nome)}</span>,
      cards: x.cards,
    }));
  if (semResp.length > 0) {
    grupos.push({ chave: '__sem__', nome: 'Sem responsável', badge: null, cards: semResp });
  }
  return grupos;
}

function inic(nome) {
  return (nome || '?').split(' ').filter(Boolean).slice(0, 2).map((p) => p[0]?.toUpperCase()).join('');
}
