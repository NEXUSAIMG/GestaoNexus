import { useState } from 'react';
import { CheckCircle2, XCircle, Clock, MinusCircle, FileText, Vote } from 'lucide-react';
import { api, mensagemDeErro } from '../api/client.js';

/**
 * Componentes compartilhados da Sprint 6 — Governança.
 *
 * Este arquivo agrupa peças de UI que se repetem entre as páginas
 * de Atas, Decisões e Contrato (modal base, badges de status, painel
 * de votação, etc.) pra evitar duplicação.
 */

// ---------------------------------------------------------------
// Modal base
// ---------------------------------------------------------------

export function ModalBase({ titulo, onFechar, children, largura = 'max-w-lg' }) {
  return (
    <div className="fixed inset-0 z-40 flex items-end justify-center bg-slate-900/50 p-2 sm:items-center sm:p-4 no-print">
      <div className={`w-full ${largura} rounded-t-2xl bg-white shadow-xl sm:rounded-2xl max-h-[90vh] overflow-y-auto`}>
        <div className="flex items-start justify-between border-b border-slate-100 p-4">
          <h3 className="text-base font-semibold text-slate-900">{titulo}</h3>
          <button
            type="button"
            onClick={onFechar}
            className="rounded p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700"
          ><XCircle size={18} /></button>
        </div>
        <div className="p-4">{children}</div>
      </div>
    </div>
  );
}

export function Campo({ rotulo, children, hint, obrigatorio }) {
  return (
    <label className="block mb-3">
      <span className="block text-xs font-medium text-slate-700 mb-1">
        {rotulo}{obrigatorio && <span className="text-red-600 ml-0.5">*</span>}
      </span>
      {children}
      {hint && <span className="block text-[11px] text-slate-500 mt-0.5">{hint}</span>}
    </label>
  );
}

export const inputCls = 'w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-nexus-500 focus:ring-1 focus:ring-nexus-500';

// ---------------------------------------------------------------
// Badge de status (atas, decisões, contratos)
// ---------------------------------------------------------------

const STATUS_CONFIG = {
  rascunho:      { cor: 'bg-slate-200 text-slate-700',     rotulo: 'Rascunho',     Icone: FileText },
  em_aprovacao:  { cor: 'bg-amber-100 text-amber-700',     rotulo: 'Em aprovação', Icone: Clock },
  aprovado:      { cor: 'bg-emerald-100 text-emerald-700', rotulo: 'Aprovado',     Icone: CheckCircle2 },
  aprovada:      { cor: 'bg-emerald-100 text-emerald-700', rotulo: 'Aprovada',     Icone: CheckCircle2 },
  rejeitado:     { cor: 'bg-red-100 text-red-700',         rotulo: 'Rejeitado',    Icone: XCircle },
  rejeitada:     { cor: 'bg-red-100 text-red-700',         rotulo: 'Rejeitada',    Icone: XCircle },
  arquivado:     { cor: 'bg-slate-200 text-slate-600',     rotulo: 'Arquivado',    Icone: FileText },
  cancelada:     { cor: 'bg-slate-200 text-slate-600',     rotulo: 'Cancelada',    Icone: XCircle },
  vigente:       { cor: 'bg-nexus-100 text-nexus-800',     rotulo: 'Vigente',      Icone: CheckCircle2 },
};

export function BadgeStatus({ status, vigente }) {
  if (vigente) {
    const c = STATUS_CONFIG.vigente;
    const I = c.Icone;
    return (
      <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${c.cor}`}>
        <I size={10} /> {c.rotulo}
      </span>
    );
  }
  const config = STATUS_CONFIG[status] ?? { cor: 'bg-slate-100 text-slate-600', rotulo: status, Icone: FileText };
  const I = config.Icone;
  return (
    <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide ${config.cor}`}>
      <I size={10} /> {config.rotulo}
    </span>
  );
}

// ---------------------------------------------------------------
// Painel de votação (atas e decisões compartilham)
// ---------------------------------------------------------------

const VOTOS = [
  { valor: 'aprovado',  rotulo: 'Aprovo',     cor: 'bg-emerald-700 hover:bg-emerald-800', Icone: CheckCircle2 },
  { valor: 'rejeitado', rotulo: 'Rejeito',    cor: 'bg-red-700 hover:bg-red-800',         Icone: XCircle },
  { valor: 'abstencao', rotulo: 'Abstenho',   cor: 'bg-slate-600 hover:bg-slate-700',     Icone: MinusCircle },
];

/**
 * Painel para registrar voto no documento ou na decisão.
 * Props:
 *   - urlVotar: string → endpoint POST que recebe { voto, comentario }
 *   - votoAtual: opcional → string ('aprovado' | 'rejeitado' | 'abstencao' | undefined)
 *   - desabilitado: boolean → true se não pode votar (sem poder, sem contexto, etc)
 *   - mensagemBloqueio: texto explicando por que está desabilitado
 *   - aoVotar: callback após sucesso
 */
export function PainelVotacao({ urlVotar, votoAtual, desabilitado, mensagemBloqueio, aoVotar }) {
  const [comentario, setComentario] = useState('');
  const [votando, setVotando] = useState(null);
  const [erro, setErro] = useState('');

  async function votar(valor) {
    setErro('');
    setVotando(valor);
    try {
      await api.post(urlVotar, { voto: valor, comentario: comentario || null });
      setComentario('');
      aoVotar && aoVotar();
    } catch (err) {
      setErro(mensagemDeErro(err, 'Não foi possível registrar seu voto.'));
    } finally {
      setVotando(null);
    }
  }

  if (desabilitado) {
    return (
      <div className="rounded-lg border border-slate-200 bg-slate-50 p-3 text-sm text-slate-600">
        <Vote size={14} className="inline mr-1.5" />
        {mensagemBloqueio || 'Você não pode votar neste momento.'}
      </div>
    );
  }

  return (
    <div className="rounded-lg border border-slate-200 bg-white p-3">
      <div className="flex items-center gap-2 mb-2">
        <Vote size={14} className="text-slate-500" />
        <h4 className="text-sm font-semibold text-slate-900">
          {votoAtual ? 'Você já votou — pode trocar' : 'Seu voto'}
        </h4>
      </div>

      <textarea
        rows={2}
        placeholder="Comentário (opcional) — fica no histórico"
        className={`${inputCls} mb-2`}
        value={comentario}
        onChange={(e) => setComentario(e.target.value)}
        maxLength={2000}
      />

      <div className="flex flex-wrap gap-2">
        {VOTOS.map(({ valor, rotulo, cor, Icone }) => {
          const ativo = votoAtual === valor;
          return (
            <button
              key={valor}
              type="button"
              onClick={() => votar(valor)}
              disabled={!!votando}
              className={[
                'inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-medium text-white shadow-sm disabled:opacity-50',
                cor,
                ativo ? 'ring-2 ring-offset-1 ring-slate-400' : '',
              ].join(' ')}
            >
              <Icone size={14} />
              {votando === valor ? 'Salvando...' : rotulo}
              {ativo && <span className="text-[10px] opacity-80">(atual)</span>}
            </button>
          );
        })}
      </div>

      {erro && <div className="mt-2 text-xs text-red-700">{erro}</div>}
    </div>
  );
}

// ---------------------------------------------------------------
// Lista de votos já registrados
// ---------------------------------------------------------------

const ICONE_VOTO = {
  aprovado:  { Icone: CheckCircle2, cor: 'text-emerald-700' },
  rejeitado: { Icone: XCircle, cor: 'text-red-700' },
  abstencao: { Icone: MinusCircle, cor: 'text-slate-500' },
};

const ROTULO_VOTO = {
  aprovado: 'Aprovou',
  rejeitado: 'Rejeitou',
  abstencao: 'Absteve-se',
};

export function ListaVotos({ aprovacoes = [], totalSocios }) {
  const totalVotos = aprovacoes.length;
  const aprovado = aprovacoes.filter((a) => a.voto === 'aprovado').length;
  const rejeitado = aprovacoes.filter((a) => a.voto === 'rejeitado').length;
  const abstencao = aprovacoes.filter((a) => a.voto === 'abstencao').length;

  return (
    <div className="rounded-lg border border-slate-200 bg-white">
      <div className="border-b border-slate-100 p-3">
        <div className="flex items-center justify-between">
          <h4 className="text-sm font-semibold text-slate-900">
            Votos ({totalVotos} de {totalSocios} sócios)
          </h4>
          <div className="flex items-center gap-3 text-xs">
            <span className="inline-flex items-center gap-1 text-emerald-700"><CheckCircle2 size={12} /> {aprovado}</span>
            <span className="inline-flex items-center gap-1 text-red-700"><XCircle size={12} /> {rejeitado}</span>
            <span className="inline-flex items-center gap-1 text-slate-500"><MinusCircle size={12} /> {abstencao}</span>
          </div>
        </div>
        <div className="mt-2 flex h-1.5 overflow-hidden rounded-full bg-slate-100">
          {totalSocios > 0 && (
            <>
              <div className="bg-emerald-500" style={{ width: `${(aprovado / totalSocios) * 100}%` }} />
              <div className="bg-red-500" style={{ width: `${(rejeitado / totalSocios) * 100}%` }} />
              <div className="bg-slate-400" style={{ width: `${(abstencao / totalSocios) * 100}%` }} />
            </>
          )}
        </div>
      </div>

      {aprovacoes.length === 0 ? (
        <div className="p-4 text-center text-sm text-slate-500">Nenhum voto registrado ainda.</div>
      ) : (
        <ul className="divide-y divide-slate-100">
          {aprovacoes.map((a) => {
            const config = ICONE_VOTO[a.voto];
            const I = config?.Icone || MinusCircle;
            return (
              <li key={a.id} className="flex items-start gap-3 p-3">
                <I size={16} className={`mt-0.5 ${config?.cor}`} />
                <div className="flex-1 min-w-0">
                  <div className="text-sm">
                    <span className="font-medium text-slate-900">{a.socio_nome}</span>{' '}
                    <span className="text-slate-500">— {ROTULO_VOTO[a.voto] ?? a.voto}</span>
                  </div>
                  <div className="text-[11px] text-slate-500">
                    Votado por {a.pessoa_nome ?? '—'} · {formatarDataHora(a.registrado_em)}
                  </div>
                  {a.comentario && (
                    <div className="mt-1 rounded bg-slate-50 px-2 py-1 text-xs text-slate-700 italic">
                      “{a.comentario}”
                    </div>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

function formatarDataHora(d) {
  if (!d) return '';
  try {
    return new Date(d).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
  } catch { return ''; }
}

export function formatarTamanho(bytes) {
  if (!bytes) return '—';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

export function formatarData(d) {
  if (!d) return '—';
  try { return new Date(d).toLocaleDateString('pt-BR'); } catch { return '—'; }
}
