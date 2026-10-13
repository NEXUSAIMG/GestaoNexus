import { Link } from 'react-router-dom';
import { Handshake, ArrowRight } from 'lucide-react';
import ModalFrame from './ModalFrame.jsx';

/**
 * Sprint 42F — o card é de um lead do Comercial e o Comercial não deixa
 * a etapa mudar ainda (portão pendente, ou voltar etapa, que exige
 * justificativa). Mostra o que falta e leva para a ficha do lead.
 * Não há "mover mesmo assim": quadro e Comercial ficariam diferentes.
 */
export default function ModalComercial({ dados, onFechar }) {
  const c = dados?.comercial || {};
  return (
    <ModalFrame titulo="O Comercial ainda não deixa este card andar" onFechar={onFechar}>
      <div className="space-y-4">
        <div className="flex items-start gap-2 rounded-lg border border-indigo-200 bg-indigo-50 px-3 py-2 text-sm text-indigo-900">
          <Handshake size={16} className="mt-0.5 shrink-0" />
          <p>
            <strong>{c.lead_nome}</strong> está em <strong>{c.etapa_nome}</strong> no Comercial.
            {' '}Este quadro e o Comercial andam juntos, então o card volta para onde estava.
          </p>
        </div>
        {c.pendencias?.length > 0 ? (
          <div>
            <p className="mb-1 text-sm font-medium text-slate-800">O que falta registrar:</p>
            <ul className="list-disc space-y-0.5 pl-5 text-sm text-slate-700">
              {c.pendencias.map((p) => <li key={p}>{p}</li>)}
            </ul>
          </div>
        ) : (
          <p className="text-sm text-slate-700">{c.mensagem}</p>
        )}
        <div className="flex items-center justify-between gap-2 border-t border-slate-200 pt-4">
          <button type="button" onClick={onFechar}
            className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50">
            Deixar onde está
          </button>
          {c.lead_id && (
            <Link to={'/comercial?lead=' + c.lead_id}
              className="inline-flex items-center gap-1 rounded-lg bg-nexus-600 px-4 py-2 text-sm font-medium text-white hover:bg-nexus-700">
              Abrir no Comercial <ArrowRight size={13} />
            </Link>
          )}
        </div>
      </div>
    </ModalFrame>
  );
}
