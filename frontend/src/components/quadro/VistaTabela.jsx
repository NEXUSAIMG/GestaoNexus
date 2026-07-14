import { useMemo, useState } from 'react';
import { ChevronUp, ChevronDown, Search, Ban } from 'lucide-react';
import { api, mensagemDeErro } from '../../api/client.js';
import {
  COR_CHIP, formatarPrazo, iniciais, prioridadeDe, PRIORIDADES, formatarMinutos,
} from './ui.js';

/**
 * Sprint 35 — Vista Tabela.
 *
 * A mesma verdade do board, em formato de planilha. Serve pro que o kanban
 * é ruim: ver 80 cards de uma vez, ordenar por prazo, editar prioridade em
 * série sem abrir modal.
 *
 * Edição inline é otimista: muda na tela na hora, PUT em background, e
 * chama onMudou pra reconciliar com o servidor. Sem lib de tabela — o
 * projeto não tem e não vale puxar uma.
 */

const COLUNAS = [
  { id: 'titulo', nome: 'Título', ordenavel: true },
  { id: 'coluna', nome: 'Coluna', ordenavel: true },
  { id: 'prioridade', nome: 'Prioridade', ordenavel: true, largura: 'w-28' },
  { id: 'responsaveis', nome: 'Responsáveis' },
  { id: 'data_prazo', nome: 'Prazo', ordenavel: true, largura: 'w-28' },
  { id: 'selos', nome: '', largura: 'w-24' },
];

export default function VistaTabela({ quadro, onAbrirCard, onMudou }) {
  const [ordem, setOrdem] = useState({ campo: 'coluna', dir: 1 });
  const [busca, setBusca] = useState('');
  const [salvando, setSalvando] = useState(null);

  const colunaPorId = useMemo(
    () => Object.fromEntries((quadro.colunas || []).map((c) => [c.id, c])),
    [quadro.colunas],
  );

  const linhas = useMemo(() => {
    const termo = busca.trim().toLowerCase();
    const arr = (quadro.cards || []).filter(
      (c) => !termo || c.titulo.toLowerCase().includes(termo),
    );
    const col = (id) => colunaPorId[id]?.ordem ?? 0;
    arr.sort((a, b) => {
      let va; let vb;
      switch (ordem.campo) {
        case 'titulo': va = a.titulo.toLowerCase(); vb = b.titulo.toLowerCase(); break;
        case 'coluna': va = col(a.coluna_id); vb = col(b.coluna_id); break;
        case 'prioridade': va = Number(a.prioridade ?? 2); vb = Number(b.prioridade ?? 2); break;
        case 'data_prazo':
          va = a.data_prazo || '9999'; vb = b.data_prazo || '9999'; break;
        default: va = 0; vb = 0;
      }
      if (va < vb) return -1 * ordem.dir;
      if (va > vb) return 1 * ordem.dir;
      return 0;
    });
    return arr;
  }, [quadro.cards, colunaPorId, ordem, busca]);

  function alternarOrdem(campo) {
    setOrdem((o) => (o.campo === campo ? { campo, dir: -o.dir } : { campo, dir: 1 }));
  }

  async function salvar(cardId, patch) {
    setSalvando(cardId);
    try {
      await api.put('/cards/' + cardId, patch);
      onMudou?.();
    } catch (err) {
      alert(mensagemDeErro(err, 'Não consegui salvar.'));
    } finally {
      setSalvando(null);
    }
  }

  return (
    <div className="p-4">
      <div className="mb-3 flex items-center gap-2">
        <div className="relative">
          <Search size={13} className="absolute left-2 top-2 text-slate-400" />
          <input
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
            placeholder="Buscar card…"
            className="rounded-lg border border-slate-300 bg-white py-1.5 pl-7 pr-2 text-xs text-slate-700 outline-none focus:border-nexus-500"
          />
        </div>
        <span className="text-xs text-slate-500">{linhas.length} cards</span>
      </div>

      <div className="overflow-x-auto rounded-lg border border-slate-200">
        <table className="w-full text-xs">
          <thead className="bg-slate-50 text-slate-500">
            <tr>
              {COLUNAS.map((c) => (
                <th
                  key={c.id}
                  className={'px-3 py-2 text-left font-medium ' + (c.largura || '')}
                >
                  {c.ordenavel ? (
                    <button
                      type="button"
                      onClick={() => alternarOrdem(c.id)}
                      className="inline-flex items-center gap-0.5 hover:text-slate-800"
                    >
                      {c.nome}
                      {ordem.campo === c.id && (
                        ordem.dir === 1 ? <ChevronUp size={11} /> : <ChevronDown size={11} />
                      )}
                    </button>
                  ) : c.nome}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 bg-white">
            {linhas.map((c) => {
              const prazo = formatarPrazo(c.data_prazo);
              const bloqueado = c.bloqueado || Number(c.n_bloqueadores || 0) > 0;
              return (
                <tr key={c.id} className={salvando === c.id ? 'opacity-50' : ''}>
                  <td className="px-3 py-1.5">
                    <button
                      type="button"
                      onClick={() => onAbrirCard(c.id)}
                      className="flex items-center gap-1.5 text-left text-slate-800 hover:text-nexus-700"
                    >
                      {bloqueado && <Ban size={11} className="shrink-0 text-red-500" />}
                      <span className="truncate">{c.titulo}</span>
                    </button>
                  </td>
                  <td className="px-3 py-1.5 text-slate-500">
                    {colunaPorId[c.coluna_id]?.nome || '—'}
                  </td>
                  <td className="px-3 py-1.5">
                    <select
                      value={Number(c.prioridade ?? 2)}
                      onChange={(e) => salvar(c.id, { prioridade: Number(e.target.value) })}
                      className={'rounded border px-1 py-0.5 text-[10px] font-bold ' + prioridadeDe(c.prioridade).chip}
                    >
                      {PRIORIDADES.map((p) => (
                        <option key={p.valor} value={p.valor}>{p.sigla}</option>
                      ))}
                    </select>
                  </td>
                  <td className="px-3 py-1.5">
                    <div className="flex -space-x-1.5">
                      {(c.responsaveis || []).slice(0, 4).map((r) => (
                        <span
                          key={r.id}
                          title={r.nome}
                          className="inline-flex h-5 w-5 items-center justify-center rounded-full bg-nexus-100 text-[9px] font-semibold text-nexus-800 ring-1 ring-white"
                        >
                          {iniciais(r.nome)}
                        </span>
                      ))}
                      {(c.responsaveis || []).length === 0 && (
                        <span className="text-slate-300">—</span>
                      )}
                    </div>
                  </td>
                  <td className="px-3 py-1.5">
                    <input
                      type="date"
                      value={c.data_prazo ? String(c.data_prazo).slice(0, 10) : ''}
                      onChange={(e) => salvar(c.id, { data_prazo: e.target.value || null })}
                      className={'rounded border border-slate-200 px-1 py-0.5 text-[11px] ' + (prazo && !c.prazo_concluido ? prazo.cor : 'text-slate-600')}
                    />
                  </td>
                  <td className="px-3 py-1.5">
                    <div className="flex items-center gap-1.5 text-[10px] text-slate-400">
                      {(c.etiqueta_ids || []).slice(0, 3).map((eid) => {
                        const e = (quadro.etiquetas || []).find((x) => x.id === eid);
                        if (!e) return null;
                        return (
                          <span key={eid} className={'h-2 w-2 rounded-full ' + (COR_CHIP[e.cor] || COR_CHIP.slate).split(' ')[0].replace('-100', '-400')} title={e.nome} />
                        );
                      })}
                      {Number(c.minutos_apontados || 0) > 0 && (
                        <span title="Horas apontadas">{formatarMinutos(c.minutos_apontados)}</span>
                      )}
                    </div>
                  </td>
                </tr>
              );
            })}
            {linhas.length === 0 && (
              <tr>
                <td colSpan={COLUNAS.length} className="px-3 py-6 text-center text-slate-400">
                  Nenhum card.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
