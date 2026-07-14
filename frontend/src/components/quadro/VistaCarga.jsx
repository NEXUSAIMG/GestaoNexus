import { useMemo } from 'react';
import { iniciais } from './ui.js';

/**
 * Sprint 35 — Vista Carga (workload).
 *
 * Cards ATIVOS (não concluídos) por responsável × semana, pela data de
 * prazo. Responde a pergunta que o board esconde: "quem está afogado?".
 *
 * Sobrecarga é relativa: a célula fica quente quando passa da média do
 * quadro naquela semana, não de um número mágico. Um time de 2 pessoas e
 * um de 10 têm "muito" diferentes.
 */

const DIA = 86400000;

function inicioDaSemana(d) {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  const dow = (x.getDay() + 6) % 7; // segunda = 0
  x.setDate(x.getDate() - dow);
  return x;
}

export default function VistaCarga({ quadro, onAbrirCard }) {
  const colunaPorId = useMemo(
    () => Object.fromEntries((quadro.colunas || []).map((c) => [c.id, c])),
    [quadro.colunas],
  );

  const { semanas, pessoas, grade, semResp, mediaPorCelula } = useMemo(() => {
    const hoje = inicioDaSemana(new Date());
    // 6 semanas a partir desta
    const sems = Array.from({ length: 6 }, (_, i) => new Date(hoje.getTime() + i * 7 * DIA));

    const pmap = new Map();
    const g = {}; // g[pessoaId][semanaIdx] = [cards]
    const sr = []; // sem responsável, com prazo na janela

    for (const c of (quadro.cards || [])) {
      const tipo = colunaPorId[c.coluna_id]?.tipo;
      if (tipo === 'concluida') continue; // carga é do que falta fazer
      if (!c.data_prazo) continue;
      const prazo = new Date(String(c.data_prazo).slice(0, 10) + 'T12:00:00');
      const si = sems.findIndex((s, i) => {
        const fim = new Date(s.getTime() + 7 * DIA);
        return prazo >= s && prazo < fim;
      });
      if (si === -1) continue;

      const resps = c.responsaveis || [];
      if (resps.length === 0) { sr.push({ card: c, si }); continue; }
      for (const r of resps) {
        if (!pmap.has(r.id)) pmap.set(r.id, r);
        if (!g[r.id]) g[r.id] = {};
        if (!g[r.id][si]) g[r.id][si] = [];
        g[r.id][si].push(c);
      }
    }

    const ps = [...pmap.values()].sort((a, b) => a.nome.localeCompare(b.nome));

    // média de cards por célula ocupada (pra escala de calor)
    let soma = 0; let n = 0;
    for (const pid of Object.keys(g)) {
      for (const si of Object.keys(g[pid])) { soma += g[pid][si].length; n += 1; }
    }
    const media = n > 0 ? soma / n : 0;

    return { semanas: sems, pessoas: ps, grade: g, semResp: sr, mediaPorCelula: media };
  }, [quadro.cards, colunaPorId]);

  function corCelula(n) {
    if (n === 0) return 'bg-white text-slate-300';
    const limite = Math.max(2, mediaPorCelula);
    if (n > limite * 1.5) return 'bg-red-100 text-red-800 font-semibold';
    if (n > limite) return 'bg-amber-100 text-amber-800 font-medium';
    return 'bg-emerald-50 text-emerald-800';
  }

  return (
    <div className="p-4">
      <p className="mb-3 text-xs text-slate-500">
        Cards não concluídos com prazo, por responsável e semana. Vermelho = acima
        da média deste quadro — alguém para ajudar.
      </p>

      <div className="overflow-x-auto rounded-lg border border-slate-200">
        <table className="w-full border-collapse text-xs">
          <thead>
            <tr className="bg-slate-50 text-slate-500">
              <th className="sticky left-0 z-10 bg-slate-50 px-3 py-2 text-left font-medium">
                Pessoa
              </th>
              {semanas.map((s, i) => (
                <th key={i} className="px-2 py-2 text-center font-medium">
                  {i === 0 ? 'Esta sem.' : s.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' })}
                </th>
              ))}
              <th className="px-2 py-2 text-center font-medium">Total</th>
            </tr>
          </thead>
          <tbody>
            {pessoas.map((p) => {
              const total = Object.values(grade[p.id] || {}).reduce((s, arr) => s + arr.length, 0);
              return (
                <tr key={p.id} className="border-t border-slate-100">
                  <td className="sticky left-0 z-10 bg-white px-3 py-1.5">
                    <span className="inline-flex items-center gap-1.5">
                      <span className="inline-flex h-5 w-5 items-center justify-center rounded-full bg-nexus-100 text-[9px] font-semibold text-nexus-800">
                        {iniciais(p.nome)}
                      </span>
                      <span className="text-slate-700">{p.nome}</span>
                    </span>
                  </td>
                  {semanas.map((s, i) => {
                    const cards = grade[p.id]?.[i] || [];
                    return (
                      <td key={i} className={'px-2 py-1.5 text-center ' + corCelula(cards.length)}>
                        {cards.length > 0 ? (
                          <span
                            className="cursor-default"
                            title={cards.map((c) => c.titulo).join('\n')}
                          >
                            {cards.length}
                          </span>
                        ) : '·'}
                      </td>
                    );
                  })}
                  <td className="px-2 py-1.5 text-center font-semibold text-slate-700">{total}</td>
                </tr>
              );
            })}
            {pessoas.length === 0 && (
              <tr>
                <td colSpan={semanas.length + 2} className="px-3 py-6 text-center text-slate-400">
                  Nenhum card com prazo e responsável nas próximas 6 semanas.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {semResp.length > 0 && (
        <div className="mt-3 rounded-lg border border-amber-200 bg-amber-50 p-2">
          <div className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-amber-700">
            Com prazo, sem responsável ({semResp.length})
          </div>
          <div className="flex flex-wrap gap-1.5">
            {semResp.map(({ card }) => (
              <button
                key={card.id}
                type="button"
                onClick={() => onAbrirCard(card.id)}
                className="truncate rounded-full border border-amber-300 bg-white px-2 py-0.5 text-[11px] text-amber-900 hover:bg-amber-100"
              >
                {card.titulo}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
