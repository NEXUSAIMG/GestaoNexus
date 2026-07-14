import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import {
  Calendar, CheckCircle2, MessageSquare, Paperclip, CheckSquare, AlignLeft,
  Ban, GitBranch, Link2, Clock, ListTree,
} from 'lucide-react';
import {
  COR_CHIP, corForte, formatarPrazo, iniciais, prioridadeDe, formatarMinutos,
} from './ui.js';

/**
 * Card do board.
 *
 * Sprint 34 — selos novos, todos derivados do payload de /quadros/:id:
 *   prioridade (só quando foge do normal), bloqueado, subtarefas n/N,
 *   nº de vínculos de negócio e horas apontadas.
 *
 * Regra de ouro dos selos: só aparece o que é excepcional. Um card
 * "normal, sem nada" continua limpo como era antes.
 */

export function CardSortable({ card, etiquetas, aoClicar }) {
  const {
    attributes, listeners, setNodeRef, transform, transition, isDragging,
  } = useSortable({ id: card.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.4 : 1,
  };

  return (
    <div ref={setNodeRef} style={style} {...attributes} {...listeners}>
      <Card card={card} etiquetas={etiquetas} aoClicar={aoClicar} />
    </div>
  );
}

export default function Card({ card, etiquetas, aoClicar, arrastando }) {
  const prazo = formatarPrazo(card.data_prazo);
  const etqs = (card.etiqueta_ids || [])
    .map((id) => etiquetas.find((e) => e.id === id))
    .filter(Boolean);
  const resps = card.responsaveis || [];

  // Sprint 32
  const totalChk = Number(card.n_checklist_total || 0);
  const feitosChk = Number(card.n_checklist_concluido || 0);
  const nComent = Number(card.n_comentarios || 0);
  const nAnexos = Number(card.n_anexos || 0);
  const temDescricao = !!(card.descricao && String(card.descricao).trim());
  const chkCompleto = totalChk > 0 && feitosChk === totalChk;

  // Sprint 34
  const prio = prioridadeDe(card.prioridade);
  const mostraPrio = Number(card.prioridade ?? 2) !== 2;
  const bloqueado = !!card.bloqueado || Number(card.n_bloqueadores || 0) > 0;
  const nBloqueia = Number(card.n_bloqueia || 0);
  const nSub = Number(card.n_subtarefas || 0);
  const nSubOk = Number(card.n_subtarefas_ok || 0);
  const nVinculos = Number(card.n_vinculos || 0);
  const minutos = Number(card.minutos_apontados || 0);
  const ehSubtarefa = !!card.card_pai_id;

  const temRodape = prazo || resps.length > 0 || totalChk > 0 || nComent > 0
    || nAnexos > 0 || temDescricao || nSub > 0 || nVinculos > 0 || minutos > 0
    || nBloqueia > 0;

  return (
    <div
      onClick={(e) => {
        if (aoClicar && !arrastando) {
          e.stopPropagation();
          aoClicar();
        }
      }}
      className={[
        'rounded-lg border bg-white p-2.5 shadow-sm transition-shadow',
        arrastando
          ? 'rotate-1 shadow-lg ring-2 ring-nexus-300 cursor-grabbing'
          : 'cursor-pointer hover:shadow-md hover:border-nexus-200',
        // Card bloqueado ganha borda vermelha — é o sinal mais importante
        // do board: alguém vai tentar tocar nisso sem poder.
        !arrastando && bloqueado ? 'border-red-300' : '',
        !arrastando && !bloqueado ? 'border-slate-200' : '',
      ].join(' ')}
    >
      {card.capa_cor && (
        <div className={'mb-2 -mx-2.5 -mt-2.5 h-2 rounded-t-lg ' + corForte(card.capa_cor)} />
      )}

      {(etqs.length > 0 || mostraPrio || bloqueado || ehSubtarefa) && (
        <div className="mb-1.5 flex flex-wrap items-center gap-1">
          {mostraPrio && (
            <span
              className={'inline-flex items-center rounded px-1.5 py-0.5 text-[10px] font-bold border ' + prio.chip}
              title={'Prioridade ' + prio.nome}
            >
              {prio.sigla}
            </span>
          )}
          {bloqueado && (
            <span
              className="inline-flex items-center gap-0.5 rounded border border-red-300 bg-red-50 px-1.5 py-0.5 text-[10px] font-semibold text-red-700"
              title="Bloqueado por outro card em aberto"
            >
              <Ban size={9} /> Bloqueado
            </span>
          )}
          {ehSubtarefa && (
            <span
              className="inline-flex items-center gap-0.5 rounded border border-slate-200 bg-slate-50 px-1 py-0.5 text-[10px] font-medium text-slate-500"
              title="É subtarefa de outro card"
            >
              <ListTree size={9} />
            </span>
          )}
          {etqs.map((e) => (
            <span
              key={e.id}
              className={'inline-flex items-center rounded px-1.5 py-0.5 text-[10px] font-medium border ' + (COR_CHIP[e.cor] || COR_CHIP.slate)}
            >
              {e.nome}
            </span>
          ))}
        </div>
      )}

      <div className="text-sm font-medium text-slate-900 leading-snug">{card.titulo}</div>

      {temRodape && (
        <div className="mt-2 space-y-1.5">
          <div className="flex flex-wrap items-center gap-1.5 text-[10px] font-medium text-slate-500">
            {temDescricao && (
              <span title="Tem descrição"><AlignLeft size={12} className="text-slate-400" /></span>
            )}
            {prazo && (
              <span
                className={'inline-flex items-center gap-1 rounded border px-1.5 py-0.5 ' + (card.prazo_concluido ? 'text-emerald-700 bg-emerald-50 border-emerald-200' : prazo.cor)}
                title={card.prazo_concluido ? 'Prazo concluído' : prazo.dataCompleta}
              >
                {card.prazo_concluido ? <CheckCircle2 size={10} /> : <Calendar size={9} />} {prazo.label}
              </span>
            )}
            {nSub > 0 && (
              <span
                className={'inline-flex items-center gap-0.5 rounded px-1 py-0.5 ' + (nSubOk === nSub ? 'text-emerald-700 bg-emerald-50' : 'text-slate-500')}
                title="Subtarefas concluídas"
              >
                <ListTree size={11} /> {nSubOk}/{nSub}
              </span>
            )}
            {totalChk > 0 && (
              <span
                className={'inline-flex items-center gap-0.5 rounded px-1 py-0.5 ' + (chkCompleto ? 'text-emerald-700 bg-emerald-50' : 'text-slate-500')}
                title="Itens de checklist"
              >
                <CheckSquare size={11} /> {feitosChk}/{totalChk}
              </span>
            )}
            {nBloqueia > 0 && (
              <span
                className="inline-flex items-center gap-0.5 text-amber-700"
                title={'Este card trava outros ' + nBloqueia}
              >
                <GitBranch size={11} /> {nBloqueia}
              </span>
            )}
            {nVinculos > 0 && (
              <span className="inline-flex items-center gap-0.5" title="Vínculos de negócio">
                <Link2 size={11} /> {nVinculos}
              </span>
            )}
            {minutos > 0 && (
              <span className="inline-flex items-center gap-0.5" title="Horas apontadas">
                <Clock size={11} /> {formatarMinutos(minutos)}
              </span>
            )}
            {nComent > 0 && (
              <span className="inline-flex items-center gap-0.5" title="Comentários">
                <MessageSquare size={11} /> {nComent}
              </span>
            )}
            {nAnexos > 0 && (
              <span className="inline-flex items-center gap-0.5" title="Anexos">
                <Paperclip size={11} /> {nAnexos}
              </span>
            )}
          </div>

          {resps.length > 0 && (
            <div className="flex justify-end -space-x-1.5" title={resps.map((r) => r.nome).join(', ')}>
              {resps.slice(0, 3).map((r) => (
                <span
                  key={r.id}
                  className="inline-flex h-5 w-5 items-center justify-center rounded-full bg-nexus-100 text-[9px] font-semibold text-nexus-800 ring-1 ring-white"
                  title={r.nome}
                >
                  {iniciais(r.nome)}
                </span>
              ))}
              {resps.length > 3 && (
                <span
                  className="inline-flex h-5 w-5 items-center justify-center rounded-full bg-slate-200 text-[9px] font-semibold text-slate-700 ring-1 ring-white"
                  title={resps.slice(3).map((r) => r.nome).join(', ')}
                >
                  +{resps.length - 3}
                </span>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
