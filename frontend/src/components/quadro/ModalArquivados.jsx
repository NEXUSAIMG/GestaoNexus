import { useEffect, useState } from 'react';
import {
  Archive, Columns3, Loader2, RotateCcw, SquareKanban,
} from 'lucide-react';
import { api, mensagemDeErro } from '../../api/client.js';
import ModalFrame from './ModalFrame.jsx';

/**
 * Gaveta de arquivados do quadro.
 *
 * Arquivar era um caminho sem volta pela interface: não havia tela que
 * listasse coluna ou card arquivado, nem rota de desarquivar. Quem arquivava
 * por engano — ou arquivava uma coluna só para poder corrigir o nome — não
 * tinha como trazer de volta.
 *
 * Aqui os dois voltam. Nada é excluído de verdade em lugar nenhum: arquivar
 * continua sendo a única saída do board, e agora tem retorno.
 */

function dataHora(iso) {
  if (!iso) return '';
  return new Date(iso).toLocaleString('pt-BR', {
    day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit',
  });
}

export default function ModalArquivados({ quadro, onFechar, onMudou }) {
  const [dados, setDados] = useState(null);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState('');
  const [restaurandoId, setRestaurandoId] = useState(null);
  const [aba, setAba] = useState('cards');

  async function carregar() {
    setCarregando(true);
    setErro('');
    try {
      const r = await api.get(`/quadros/${quadro.id}/arquivados`);
      setDados(r.data);
    } catch (err) {
      setErro(mensagemDeErro(err, 'Não consegui carregar os arquivados.'));
    } finally {
      setCarregando(false);
    }
  }

  useEffect(() => { carregar(); /* eslint-disable-next-line */ }, [quadro.id]);

  async function restaurarCard(card) {
    setRestaurandoId(card.id);
    try {
      const r = await api.post(`/cards/${card.id}/desarquivar`);
      if (r.data?.coluna_trocada) {
        alert(
          `A coluna original deste card foi arquivada, então ele voltou para a primeira `
          + `coluna do quadro. Arraste para o lugar certo.`,
        );
      }
      await carregar();
      onMudou?.();
    } catch (err) {
      alert(mensagemDeErro(err, 'Não consegui restaurar o card.'));
    } finally {
      setRestaurandoId(null);
    }
  }

  async function restaurarColuna(col) {
    setRestaurandoId(col.id);
    try {
      await api.post(`/colunas/${col.id}/desarquivar`);
      await carregar();
      onMudou?.();
    } catch (err) {
      alert(mensagemDeErro(err, 'Não consegui restaurar a coluna.'));
    } finally {
      setRestaurandoId(null);
    }
  }

  const cards = dados?.cards || [];
  const colunas = dados?.colunas || [];
  const podeEditar = !!quadro.pode_editar;

  const ABAS = [
    { id: 'cards', nome: 'Cards', n: cards.length, icone: SquareKanban },
    { id: 'colunas', nome: 'Colunas', n: colunas.length, icone: Columns3 },
  ];

  return (
    <ModalFrame titulo="Arquivados" onFechar={onFechar} largura="max-w-lg">
      <div className="space-y-3">
        <div className="flex gap-1 border-b border-slate-200 pb-2">
          {ABAS.map((a) => {
            const Icone = a.icone;
            return (
              <button
                key={a.id}
                type="button"
                onClick={() => setAba(a.id)}
                className={[
                  'inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1 text-xs font-medium transition-colors',
                  aba === a.id ? 'bg-nexus-700 text-white' : 'text-slate-600 hover:bg-slate-100',
                ].join(' ')}
              >
                <Icone size={12} /> {a.nome}
                <span className={[
                  'rounded-full px-1.5 text-[10px] tabular-nums',
                  aba === a.id ? 'bg-white/20' : 'bg-slate-200 text-slate-600',
                ].join(' ')}
                >
                  {a.n}
                </span>
              </button>
            );
          })}
        </div>

        {carregando && (
          <div className="flex items-center gap-2 py-6 text-xs text-slate-400">
            <Loader2 size={14} className="animate-spin" /> Carregando…
          </div>
        )}

        {erro && (
          <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">{erro}</div>
        )}

        {!carregando && !erro && aba === 'cards' && (
          cards.length === 0 ? (
            <div className="py-8 text-center text-xs text-slate-400">
              <Archive size={20} className="mx-auto mb-1.5 text-slate-300" />
              Nenhum card arquivado neste quadro.
            </div>
          ) : (
            <ul className="space-y-1.5">
              {cards.map((c) => (
                <li
                  key={c.id}
                  className="flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-2.5 py-2"
                >
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-sm font-medium text-slate-800" title={c.titulo}>
                      {c.titulo}
                    </div>
                    <div className="text-[10px] text-slate-400">
                      Estava em <strong className="font-medium text-slate-500">{c.coluna_nome}</strong>
                      {c.coluna_arquivada_em && ' (coluna também arquivada)'}
                      {' · '}arquivado em {dataHora(c.arquivado_em)}
                    </div>
                  </div>
                  {podeEditar && (
                    <button
                      type="button"
                      onClick={() => restaurarCard(c)}
                      disabled={restaurandoId === c.id}
                      className="inline-flex shrink-0 items-center gap-1 rounded-lg border border-slate-300 bg-white px-2 py-1 text-[11px] font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50"
                    >
                      {restaurandoId === c.id
                        ? <Loader2 size={11} className="animate-spin" />
                        : <RotateCcw size={11} />}
                      Restaurar
                    </button>
                  )}
                </li>
              ))}
            </ul>
          )
        )}

        {!carregando && !erro && aba === 'colunas' && (
          colunas.length === 0 ? (
            <div className="py-8 text-center text-xs text-slate-400">
              <Archive size={20} className="mx-auto mb-1.5 text-slate-300" />
              Nenhuma coluna arquivada neste quadro.
            </div>
          ) : (
            <ul className="space-y-1.5">
              {colunas.map((c) => (
                <li
                  key={c.id}
                  className="flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-2.5 py-2"
                >
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-sm font-medium text-slate-800">{c.nome}</div>
                    <div className="text-[10px] text-slate-400">
                      {c.n_cards} card(s) dentro · arquivada em {dataHora(c.arquivada_em)}
                    </div>
                  </div>
                  {podeEditar && (
                    <button
                      type="button"
                      onClick={() => restaurarColuna(c)}
                      disabled={restaurandoId === c.id}
                      className="inline-flex shrink-0 items-center gap-1 rounded-lg border border-slate-300 bg-white px-2 py-1 text-[11px] font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50"
                    >
                      {restaurandoId === c.id
                        ? <Loader2 size={11} className="animate-spin" />
                        : <RotateCcw size={11} />}
                      Restaurar
                    </button>
                  )}
                </li>
              ))}
            </ul>
          )
        )}

        <p className="border-t border-slate-100 pt-2 text-[10px] leading-relaxed text-slate-400">
          Coluna restaurada volta para o fim do quadro. Card cujo destino original foi arquivado
          volta para a primeira coluna. Nada é excluído em definitivo por aqui.
        </p>
      </div>
    </ModalFrame>
  );
}
