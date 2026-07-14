import { useEffect, useState } from 'react';
import { Activity } from 'lucide-react';
import { api, mensagemDeErro } from '../api/client.js';

/**
 * CardAtividades — Sprint 32 (Kanban nível Trello).
 *
 * Feed de atividades do card, lido do log de auditoria (log_acoes) filtrando
 * por card_id. Somente leitura.
 */

function iniciais(nome) {
  return (nome || '?').split(' ').filter(Boolean).slice(0, 2).map((p) => p[0]?.toUpperCase()).join('');
}

function tempoRelativo(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  const seg = Math.round((Date.now() - d.getTime()) / 1000);
  if (seg < 60) return 'agora';
  const min = Math.round(seg / 60);
  if (min < 60) return `há ${min}min`;
  const h = Math.round(min / 60);
  if (h < 24) return `há ${h}h`;
  const dias = Math.round(h / 24);
  if (dias < 7) return `há ${dias}d`;
  return d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: '2-digit' });
}

function descrever(acao, detalhes) {
  const d = detalhes || {};
  switch (acao) {
    case 'card.criou': return 'criou este card';
    case 'card.editou': {
      const campos = Array.isArray(d.campos) ? d.campos.filter((c) => c !== 'etiqueta_ids' && c !== 'responsavel_ids') : [];
      return campos.length > 0 ? `editou o card (${campos.join(', ')})` : 'editou o card';
    }
    case 'card.moveu': return 'moveu o card de coluna';
    case 'card.arquivou': return 'arquivou o card';
    case 'card.checklist.criou': return `adicionou o checklist "${d.titulo || ''}"`.trim();
    case 'card.checklist.excluiu': return 'removeu um checklist';
    case 'card.comentou': return 'comentou neste card';
    case 'card.anexo.criou': return `anexou "${d.nome || 'um arquivo'}"`;
    case 'card.anexo.excluiu': return `removeu o anexo "${d.nome || ''}"`.trim();
    default: return acao;
  }
}

export default function CardAtividades({ cardId }) {
  const [itens, setItens] = useState([]);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState('');

  useEffect(() => {
    let vivo = true;
    setCarregando(true);
    api.get(`/cards/${cardId}/atividades`)
      .then((r) => { if (vivo) setItens(r.data || []); })
      .catch((err) => { if (vivo) setErro(mensagemDeErro(err, 'Não consegui carregar as atividades.')); })
      .finally(() => { if (vivo) setCarregando(false); });
    return () => { vivo = false; };
  }, [cardId]);

  if (carregando) return <div className="text-xs text-slate-400">Carregando atividades…</div>;
  if (erro) return <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">{erro}</div>;
  if (itens.length === 0) return <div className="text-xs text-slate-400">Sem atividades registradas.</div>;

  return (
    <ul className="space-y-2.5">
      {itens.map((a) => (
        <li key={a.id} className="flex items-start gap-2">
          <span className="mt-0.5 inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-slate-200 text-[9px] font-semibold text-slate-600">
            {iniciais(a.pessoa_nome)}
          </span>
          <div className="flex-1 text-xs leading-snug text-slate-600">
            <span className="font-medium text-slate-800">{a.pessoa_nome || 'Alguém'}</span>{' '}
            {descrever(a.acao, a.detalhes)}
            <span className="ml-1 text-[10px] text-slate-400">· {tempoRelativo(a.created_at)}</span>
          </div>
        </li>
      ))}
    </ul>
  );
}
