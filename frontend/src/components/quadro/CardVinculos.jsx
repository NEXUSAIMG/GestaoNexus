import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  Plus, X, Link2, Building2, FileText, Workflow, Package, Receipt, Lock,
} from 'lucide-react';
import { api, mensagemDeErro } from '../../api/client.js';
import { TIPOS_VINCULO } from './ui.js';

/**
 * Sprint 34 — Vínculos de negócio.
 *
 * O diferencial da ferramenta: o card deixa de ser post-it e aponta pro
 * objeto real do Nexus (cartório, contrato, processo em andamento, produto,
 * conta a pagar).
 *
 * Pessoas com acesso restrito (Sprint 31) não enxergam nem criam vínculo
 * com contrato / conta a pagar / produto — o backend devolve `restrito: true`
 * e o rótulo vem nulo. Aqui a gente só respeita isso na UI.
 */

const ICONE = {
  cartorio: Building2,
  contrato: FileText,
  processo_instancia: Workflow,
  produto: Package,
  conta_pagar: Receipt,
};

// Onde buscar os candidatos de cada tipo. Rotas que a pessoa não pode ver
// devolvem 403 — nesse caso simplesmente escondemos o tipo do seletor.
const FONTE = {
  cartorio: '/cartorios',
  contrato: '/contratos',
  processo_instancia: '/instancias',
  produto: '/produtos',
  conta_pagar: '/contas-pagar',
};

function rotuloDe(obj) {
  return obj?.nome || obj?.titulo || obj?.descricao || obj?.razao_social || '(sem título)';
}

export default function CardVinculos({ cardId, podeEditar, onMudou }) {
  const [itens, setItens] = useState([]);
  const [carregando, setCarregando] = useState(true);
  const [adicionando, setAdicionando] = useState(false);
  const [tipo, setTipo] = useState('cartorio');
  const [opcoes, setOpcoes] = useState([]);
  const [carregandoOpcoes, setCarregandoOpcoes] = useState(false);
  const [semAcesso, setSemAcesso] = useState(false);
  const [busca, setBusca] = useState('');

  async function carregar() {
    try {
      const r = await api.get('/cards/' + cardId + '/vinculos');
      setItens(r.data || []);
    } catch {
      setItens([]);
    } finally {
      setCarregando(false);
    }
  }

  useEffect(() => { carregar(); /* eslint-disable-next-line */ }, [cardId]);

  // Busca os candidatos do tipo selecionado.
  useEffect(() => {
    if (!adicionando) return;
    let vivo = true;
    setCarregandoOpcoes(true);
    setSemAcesso(false);
    api.get(FONTE[tipo])
      .then((r) => {
        if (!vivo) return;
        const lista = Array.isArray(r.data) ? r.data : (r.data?.itens || r.data?.dados || []);
        setOpcoes(lista);
      })
      .catch(() => {
        if (!vivo) return;
        setOpcoes([]);
        setSemAcesso(true);
      })
      .finally(() => { if (vivo) setCarregandoOpcoes(false); });
    return () => { vivo = false; };
  }, [tipo, adicionando]);

  async function adicionar(alvoId) {
    try {
      await api.post('/cards/' + cardId + '/vinculos', { tipo, alvo_id: alvoId });
      setAdicionando(false);
      setBusca('');
      await carregar();
      onMudou?.();
    } catch (err) {
      alert(mensagemDeErro(err, 'Não consegui criar o vínculo.'));
    }
  }

  async function remover(vinculoId) {
    try {
      await api.delete('/cards/' + cardId + '/vinculos/' + vinculoId);
      await carregar();
      onMudou?.();
    } catch (err) {
      alert(mensagemDeErro(err));
    }
  }

  if (carregando) return <p className="text-xs text-slate-400">Carregando…</p>;

  const termo = busca.trim().toLowerCase();
  const filtradas = opcoes
    .filter((o) => !termo || rotuloDe(o).toLowerCase().includes(termo))
    .slice(0, 10);

  return (
    <div className="space-y-2">
      {itens.length === 0 ? (
        <p className="text-xs text-slate-400">
          Nenhum vínculo. Ligue este card ao cartório, contrato ou processo que
          ele representa — o trabalho passa a aparecer também na ficha daquele objeto.
        </p>
      ) : (
        <ul className="space-y-1">
          {itens.map((v) => {
            const Icone = ICONE[v.tipo] || Link2;
            const meta = TIPOS_VINCULO.find((t) => t.valor === v.tipo);
            return (
              <li key={v.id} className="flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-2 py-1.5">
                <Icone size={13} className="shrink-0 text-nexus-700" />
                <span className="shrink-0 rounded bg-slate-100 px-1.5 py-0.5 text-[9px] font-medium uppercase text-slate-500">
                  {meta?.nome || v.tipo}
                </span>
                {v.restrito ? (
                  <span className="flex flex-1 items-center gap-1 truncate text-xs italic text-slate-400">
                    <Lock size={10} /> restrito
                  </span>
                ) : (
                  <Link
                    to={(meta?.rota || '') + '/' + v.alvo_id}
                    className="flex-1 truncate text-xs text-slate-800 hover:text-nexus-700 hover:underline"
                  >
                    {v.rotulo || '(registro removido)'}
                  </Link>
                )}
                {podeEditar && (
                  <button
                    type="button"
                    onClick={() => remover(v.id)}
                    className="shrink-0 rounded p-0.5 text-slate-400 hover:bg-slate-100 hover:text-red-600"
                    title="Remover vínculo"
                  >
                    <X size={12} />
                  </button>
                )}
              </li>
            );
          })}
        </ul>
      )}

      {podeEditar && (
        adicionando ? (
          <div className="rounded-lg border border-slate-300 bg-white p-2 space-y-1.5">
            <select
              value={tipo}
              onChange={(e) => { setTipo(e.target.value); setBusca(''); }}
              className="w-full rounded-md border border-slate-300 px-2 py-1 text-xs outline-none focus:border-nexus-500"
            >
              {TIPOS_VINCULO.map((t) => (
                <option key={t.valor} value={t.valor}>{t.nome}</option>
              ))}
            </select>

            {semAcesso ? (
              <p className="flex items-center gap-1 text-xs text-amber-700">
                <Lock size={11} /> Você não tem acesso a este tipo de registro.
              </p>
            ) : (
              <>
                <input
                  value={busca}
                  onChange={(e) => setBusca(e.target.value)}
                  onKeyDown={(e) => { if (e.key === 'Escape') setAdicionando(false); }}
                  placeholder="Buscar…"
                  className="w-full rounded-md border border-slate-300 px-2 py-1 text-xs outline-none focus:border-nexus-500"
                />
                <ul className="max-h-40 space-y-0.5 overflow-y-auto">
                  {carregandoOpcoes && <li className="px-2 py-1 text-xs text-slate-400">Carregando…</li>}
                  {!carregandoOpcoes && filtradas.map((o) => (
                    <li key={o.id}>
                      <button
                        type="button"
                        onClick={() => adicionar(o.id)}
                        className="w-full truncate rounded px-2 py-1 text-left text-xs text-slate-700 hover:bg-nexus-50"
                      >
                        {rotuloDe(o)}
                      </button>
                    </li>
                  ))}
                  {!carregandoOpcoes && filtradas.length === 0 && (
                    <li className="px-2 py-1 text-xs text-slate-400">Nada encontrado.</li>
                  )}
                </ul>
              </>
            )}

            <button
              type="button"
              onClick={() => { setAdicionando(false); setBusca(''); }}
              className="text-xs text-slate-500 hover:text-slate-800"
            >
              Cancelar
            </button>
          </div>
        ) : (
          <button
            type="button"
            onClick={() => setAdicionando(true)}
            className="inline-flex items-center gap-1 rounded-md border border-dashed border-slate-300 bg-white px-2 py-1 text-xs text-slate-500 hover:border-nexus-300 hover:text-nexus-700"
          >
            <Plus size={11} /> <Link2 size={11} /> Vincular a um registro
          </button>
        )
      )}
    </div>
  );
}
