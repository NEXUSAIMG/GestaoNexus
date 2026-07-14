import { useState } from 'react';
import {
  X, ArrowRightLeft, Tag, Flag, Archive, Loader2,
} from 'lucide-react';
import { api, mensagemDeErro } from '../../api/client.js';
import { COR_CHIP, PRIORIDADES } from './ui.js';

/**
 * Sprint 38 — Barra de ações em massa.
 *
 * Aparece quando há cards selecionados. Aplica a mesma ação a N cards de uma
 * vez, reusando os endpoints que já existem (PUT /cards/:id, /mover,
 * /arquivar) em sequência. Sem endpoint de lote no backend: o volume aqui é
 * de dezenas, não milhares, e a transação por card mantém o resto do sistema
 * (trigger de responsável, gate de dependência, log de movimento) intacto.
 *
 * Cada operação é otimista-por-recarga: dispara tudo, depois um único
 * `onConcluido()` que recarrega o board. Erros são contados e reportados
 * no fim, sem interromper os demais.
 */
export default function BarraSelecao({ quadro, ids, onLimpar, onConcluido }) {
  const [ocupado, setOcupado] = useState(false);
  const [menu, setMenu] = useState(null); // 'coluna' | 'etiqueta' | 'prioridade'

  async function emLote(fn, rotulo) {
    setOcupado(true);
    setMenu(null);
    let erros = 0;
    for (const id of ids) {
      try {
        await fn(id);
      } catch {
        erros += 1;
      }
    }
    setOcupado(false);
    onConcluido();
    if (erros > 0) {
      alert(erros + ' de ' + ids.length + ' cards falharam em "' + rotulo + '".');
    }
  }

  const moverPara = (colunaId) => emLote(
    (id) => api.post('/cards/' + id + '/mover', { coluna_id: colunaId, posicao: 0, forcar: true }),
    'mover',
  );

  const etiquetar = (etiquetaId) => emLote(async (id) => {
    // Lê as etiquetas atuais do card no board e adiciona a nova (sem duplicar).
    const card = quadro.cards.find((c) => c.id === id);
    const atuais = new Set(card?.etiqueta_ids || []);
    atuais.add(etiquetaId);
    await api.put('/cards/' + id, { etiqueta_ids: [...atuais] });
  }, 'etiquetar');

  const prioridade = (p) => emLote(
    (id) => api.put('/cards/' + id, { prioridade: p }),
    'prioridade',
  );

  const arquivar = () => {
    if (!confirm('Arquivar ' + ids.length + ' cards? Eles saem do board mas ficam no histórico.')) return;
    emLote((id) => api.post('/cards/' + id + '/arquivar'), 'arquivar');
  };

  return (
    <div className="fixed bottom-4 left-1/2 z-40 -translate-x-1/2">
      <div className="flex items-center gap-1 rounded-xl border border-slate-300 bg-white px-2 py-1.5 shadow-lg">
        <span className="px-2 text-xs font-semibold text-slate-700">
          {ids.length} selecionado{ids.length === 1 ? '' : 's'}
        </span>
        <div className="mx-1 h-5 w-px bg-slate-200" />

        {ocupado ? (
          <span className="inline-flex items-center gap-1 px-3 py-1 text-xs text-slate-500">
            <Loader2 size={13} className="animate-spin" /> Aplicando…
          </span>
        ) : (
          <>
            <BotaoMenu
              icone={ArrowRightLeft}
              rotulo="Mover"
              aberto={menu === 'coluna'}
              onToggle={() => setMenu(menu === 'coluna' ? null : 'coluna')}
            >
              {(quadro.colunas || []).map((c) => (
                <ItemMenu key={c.id} onClick={() => moverPara(c.id)}>{c.nome}</ItemMenu>
              ))}
            </BotaoMenu>

            <BotaoMenu
              icone={Tag}
              rotulo="Etiquetar"
              aberto={menu === 'etiqueta'}
              onToggle={() => setMenu(menu === 'etiqueta' ? null : 'etiqueta')}
            >
              {(quadro.etiquetas || []).length === 0 && (
                <div className="px-3 py-1.5 text-xs text-slate-400">Sem etiquetas.</div>
              )}
              {(quadro.etiquetas || []).map((e) => (
                <ItemMenu key={e.id} onClick={() => etiquetar(e.id)}>
                  <span className={'mr-1.5 inline-block h-2 w-2 rounded-full ' + (COR_CHIP[e.cor] || COR_CHIP.slate).split(' ')[0].replace('-100', '-400')} />
                  {e.nome}
                </ItemMenu>
              ))}
            </BotaoMenu>

            <BotaoMenu
              icone={Flag}
              rotulo="Prioridade"
              aberto={menu === 'prioridade'}
              onToggle={() => setMenu(menu === 'prioridade' ? null : 'prioridade')}
            >
              {PRIORIDADES.map((p) => (
                <ItemMenu key={p.valor} onClick={() => prioridade(p.valor)}>
                  <span className={'mr-1.5 rounded px-1 py-0.5 text-[9px] font-bold border ' + p.chip}>{p.sigla}</span>
                  {p.nome}
                </ItemMenu>
              ))}
            </BotaoMenu>

            <button
              type="button"
              onClick={arquivar}
              className="inline-flex items-center gap-1 rounded-lg px-2.5 py-1 text-xs font-medium text-amber-700 hover:bg-amber-50"
            >
              <Archive size={13} /> Arquivar
            </button>
          </>
        )}

        <div className="mx-1 h-5 w-px bg-slate-200" />
        <button
          type="button"
          onClick={onLimpar}
          className="rounded-lg p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700"
          title="Limpar seleção (Esc)"
        >
          <X size={15} />
        </button>
      </div>
    </div>
  );
}

function BotaoMenu({ icone: Icone, rotulo, aberto, onToggle, children }) {
  return (
    <div className="relative">
      <button
        type="button"
        onClick={onToggle}
        className={[
          'inline-flex items-center gap-1 rounded-lg px-2.5 py-1 text-xs font-medium',
          aberto ? 'bg-nexus-50 text-nexus-800' : 'text-slate-700 hover:bg-slate-100',
        ].join(' ')}
      >
        <Icone size={13} /> {rotulo}
      </button>
      {aberto && (
        <div className="absolute bottom-full left-0 z-10 mb-1 max-h-64 w-48 overflow-y-auto rounded-lg border border-slate-200 bg-white py-1 shadow-lg">
          {children}
        </div>
      )}
    </div>
  );
}

function ItemMenu({ onClick, children }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex w-full items-center px-3 py-1.5 text-left text-xs text-slate-700 hover:bg-slate-50"
    >
      {children}
    </button>
  );
}
