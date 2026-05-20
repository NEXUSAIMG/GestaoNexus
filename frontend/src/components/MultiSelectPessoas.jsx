import { useMemo, useState } from 'react';
import { Plus, X } from 'lucide-react';

/**
 * Multi-seleção de pessoas com busca por nome/email.
 *
 * Sprint 18: criado pra atribuir múltiplos responsáveis a um card.
 * Sprint 24: também usado em eventos do calendário.
 *
 * Props:
 *   pessoas: Array<{ id: string, nome: string, email?: string }>
 *     Fonte das opções (idealmente já filtradas por `ativo`).
 *
 *   selecionadosIds: string[]
 *     IDs selecionados, controlado pelo pai. A ORDEM aqui determina
 *     a ordem dos chips e dos avatares no card/evento (primeiro = principal).
 *
 *   onChange: (novosIds: string[]) => void
 *     Chamado quando o usuário adiciona ou remove uma pessoa.
 */
export default function MultiSelectPessoas({ pessoas, selecionadosIds, onChange }) {
  const [busca, setBusca] = useState('');
  const [aberto, setAberto] = useState(false);

  const filtradas = useMemo(() => {
    const b = busca.trim().toLowerCase();
    if (!b) return pessoas;
    return pessoas.filter((p) =>
      (p.nome || '').toLowerCase().includes(b)
      || (p.email || '').toLowerCase().includes(b),
    );
  }, [pessoas, busca]);

  // Mantém os chips na ordem dos selecionadosIds (= ordem de adição)
  const selecionados = selecionadosIds
    .map((id) => pessoas.find((p) => p.id === id))
    .filter(Boolean);

  function alternar(id) {
    if (selecionadosIds.includes(id)) {
      onChange(selecionadosIds.filter((x) => x !== id));
    } else {
      onChange([...selecionadosIds, id]);
    }
  }

  return (
    <div className="relative">
      {selecionados.length > 0 && (
        <div className="mb-1.5 flex flex-wrap gap-1">
          {selecionados.map((p) => (
            <span key={p.id}
              className="inline-flex items-center gap-1 rounded-full bg-nexus-100 px-2 py-0.5 text-xs font-medium text-nexus-800"
            >
              {p.nome}
              <button type="button" onClick={() => alternar(p.id)}
                className="rounded-full p-0.5 hover:bg-nexus-200" aria-label="Remover"
              >
                <X size={10} />
              </button>
            </span>
          ))}
        </div>
      )}

      {!aberto ? (
        <button type="button" onClick={() => setAberto(true)}
          className="inline-flex items-center gap-1 rounded-md border border-dashed border-slate-300 bg-white px-2 py-1 text-xs text-slate-500 hover:border-nexus-300 hover:text-nexus-700"
        >
          <Plus size={11} /> Adicionar pessoa
        </button>
      ) : (
        <div className="rounded-lg border border-slate-200 bg-white shadow-sm">
          <input
            autoFocus
            type="text"
            placeholder="Buscar por nome ou email…"
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
            className="w-full rounded-t-lg border-b border-slate-200 px-3 py-2 text-sm outline-none focus:bg-slate-50"
          />
          <div className="max-h-48 overflow-y-auto py-1">
            {filtradas.length === 0 ? (
              <div className="px-3 py-2 text-xs text-slate-500">Ninguém encontrado.</div>
            ) : (
              filtradas.map((p) => {
                const ativo = selecionadosIds.includes(p.id);
                return (
                  <button key={p.id} type="button"
                    onClick={() => alternar(p.id)}
                    className={[
                      'flex w-full items-center gap-2 px-3 py-1.5 text-left text-sm hover:bg-slate-50',
                      ativo && 'bg-nexus-50',
                    ].filter(Boolean).join(' ')}
                  >
                    <input type="checkbox" checked={ativo} readOnly className="pointer-events-none" />
                    <span className="flex-1 min-w-0 truncate">{p.nome}</span>
                    {p.email && <span className="text-xs text-slate-400 truncate hidden sm:inline">{p.email}</span>}
                  </button>
                );
              })
            )}
          </div>
          <div className="border-t border-slate-200 px-2 py-1 flex justify-end">
            <button type="button" onClick={() => { setAberto(false); setBusca(''); }}
              className="rounded px-2 py-0.5 text-xs text-slate-500 hover:bg-slate-100 hover:text-slate-700"
            >Fechar</button>
          </div>
        </div>
      )}
    </div>
  );
}
