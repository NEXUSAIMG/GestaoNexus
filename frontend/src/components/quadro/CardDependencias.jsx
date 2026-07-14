import { useEffect, useMemo, useState } from 'react';
import { Plus, X, Ban, GitBranch, CheckCircle2 } from 'lucide-react';
import { api, mensagemDeErro } from '../../api/client.js';

/**
 * Sprint 34 — Dependências entre cards.
 *
 * Semântica: "este card está BLOQUEADO POR X" e "este card BLOQUEIA Y".
 * O backend recusa ciclos (CTE recursiva) e devolve 409 no /mover quando
 * há bloqueador em aberto.
 *
 * O bloqueador só é considerado resolvido quando entra numa coluna do
 * tipo "concluída" — por isso o tipo da coluna importa tanto.
 */
export default function CardDependencias({ cardId, podeEditar, cardsDoQuadro = [], onMudou }) {
  const [dados, setDados] = useState({ bloqueado_por: [], bloqueia: [] });
  const [carregando, setCarregando] = useState(true);
  const [adicionando, setAdicionando] = useState(false);
  const [busca, setBusca] = useState('');

  async function carregar() {
    try {
      const r = await api.get('/cards/' + cardId + '/dependencias');
      setDados(r.data || { bloqueado_por: [], bloqueia: [] });
    } catch {
      setDados({ bloqueado_por: [], bloqueia: [] });
    } finally {
      setCarregando(false);
    }
  }

  useEffect(() => { carregar(); /* eslint-disable-next-line */ }, [cardId]);

  const jaVinculados = useMemo(() => new Set([
    cardId,
    ...dados.bloqueado_por.map((c) => c.id),
  ]), [cardId, dados]);

  const candidatos = useMemo(() => {
    const termo = busca.trim().toLowerCase();
    return cardsDoQuadro
      .filter((c) => !jaVinculados.has(c.id))
      .filter((c) => !termo || c.titulo.toLowerCase().includes(termo))
      .slice(0, 8);
  }, [cardsDoQuadro, jaVinculados, busca]);

  async function adicionar(alvoId) {
    try {
      await api.post('/cards/' + cardId + '/dependencias', { depende_de_id: alvoId });
      setBusca('');
      setAdicionando(false);
      await carregar();
      onMudou?.();
    } catch (err) {
      alert(mensagemDeErro(err, 'Não consegui criar a dependência.'));
    }
  }

  async function remover(alvoId) {
    try {
      await api.delete('/cards/' + cardId + '/dependencias/' + alvoId);
      await carregar();
      onMudou?.();
    } catch (err) {
      alert(mensagemDeErro(err));
    }
  }

  if (carregando) return <p className="text-xs text-slate-400">Carregando…</p>;

  const abertos = dados.bloqueado_por.filter((c) => !c.concluido);

  return (
    <div className="space-y-3">
      {abertos.length > 0 && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-2.5 py-1.5 text-xs text-red-800">
          <span className="inline-flex items-center gap-1 font-medium">
            <Ban size={12} /> Este card está travado
          </span>
          {' '}até {abertos.length === 1 ? 'o card abaixo ser concluído' : 'os cards abaixo serem concluídos'}.
        </div>
      )}

      <div>
        <div className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-slate-400">
          Bloqueado por
        </div>
        {dados.bloqueado_por.length === 0 ? (
          <p className="text-xs text-slate-400">Nada travando este card.</p>
        ) : (
          <ul className="space-y-1">
            {dados.bloqueado_por.map((c) => (
              <li
                key={c.id}
                className={[
                  'flex items-center gap-2 rounded-lg border px-2 py-1.5',
                  c.concluido ? 'border-emerald-200 bg-emerald-50' : 'border-red-200 bg-white',
                ].join(' ')}
              >
                {c.concluido
                  ? <CheckCircle2 size={13} className="shrink-0 text-emerald-600" />
                  : <Ban size={13} className="shrink-0 text-red-500" />}
                <span className={'flex-1 truncate text-xs ' + (c.concluido ? 'text-slate-500 line-through' : 'text-slate-800')}>
                  {c.titulo}
                </span>
                <span className="shrink-0 rounded bg-slate-100 px-1.5 py-0.5 text-[9px] font-medium text-slate-500">
                  {c.coluna_nome}
                </span>
                {podeEditar && (
                  <button
                    type="button"
                    onClick={() => remover(c.id)}
                    className="shrink-0 rounded p-0.5 text-slate-400 hover:bg-slate-100 hover:text-red-600"
                    title="Remover dependência"
                  >
                    <X size={12} />
                  </button>
                )}
              </li>
            ))}
          </ul>
        )}

        {podeEditar && (
          adicionando ? (
            <div className="mt-1.5 rounded-lg border border-slate-300 bg-white p-2">
              <input
                autoFocus
                value={busca}
                onChange={(e) => setBusca(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Escape') { setAdicionando(false); setBusca(''); } }}
                placeholder="Buscar card que trava este…"
                className="w-full rounded-md border border-slate-300 px-2 py-1 text-xs outline-none focus:border-nexus-500"
              />
              <ul className="mt-1 max-h-40 space-y-0.5 overflow-y-auto">
                {candidatos.map((c) => (
                  <li key={c.id}>
                    <button
                      type="button"
                      onClick={() => adicionar(c.id)}
                      className="w-full truncate rounded px-2 py-1 text-left text-xs text-slate-700 hover:bg-nexus-50"
                    >
                      {c.titulo}
                    </button>
                  </li>
                ))}
                {candidatos.length === 0 && (
                  <li className="px-2 py-1 text-xs text-slate-400">Nenhum card encontrado.</li>
                )}
              </ul>
              <button
                type="button"
                onClick={() => { setAdicionando(false); setBusca(''); }}
                className="mt-1 text-xs text-slate-500 hover:text-slate-800"
              >
                Cancelar
              </button>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => setAdicionando(true)}
              className="mt-1.5 inline-flex items-center gap-1 rounded-md border border-dashed border-slate-300 bg-white px-2 py-1 text-xs text-slate-500 hover:border-nexus-300 hover:text-nexus-700"
            >
              <Plus size={11} /> Adicionar bloqueador
            </button>
          )
        )}
      </div>

      {dados.bloqueia.length > 0 && (
        <div>
          <div className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-slate-400">
            Este card bloqueia
          </div>
          <ul className="space-y-1">
            {dados.bloqueia.map((c) => (
              <li key={c.id} className="flex items-center gap-2 rounded-lg border border-amber-200 bg-amber-50/60 px-2 py-1.5">
                <GitBranch size={13} className="shrink-0 text-amber-600" />
                <span className="flex-1 truncate text-xs text-slate-800">{c.titulo}</span>
                <span className="shrink-0 rounded bg-white px-1.5 py-0.5 text-[9px] font-medium text-slate-500">
                  {c.coluna_nome}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
