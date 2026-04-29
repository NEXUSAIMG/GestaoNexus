import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import {
  ArrowLeft, ListChecks, Play, CheckCircle2, Ban, Clock,
  ExternalLink, X, AlertTriangle,
} from 'lucide-react';
import { api, mensagemDeErro } from '../api/client.js';
import { useAuth } from '../context/AuthContext.jsx';

/**
 * Lista de instâncias de um processo — Sprint 15.
 *
 * Mostra todas as execuções (em andamento, concluídas, canceladas) com
 * progresso (X/Y nós concluídos) e link pro quadro de cada uma.
 */

const STATUS_INFO = {
  em_andamento: { rotulo: 'Em andamento', cor: 'bg-amber-100 text-amber-800', icone: Clock },
  concluida:    { rotulo: 'Concluída',    cor: 'bg-emerald-100 text-emerald-800', icone: CheckCircle2 },
  cancelada:    { rotulo: 'Cancelada',    cor: 'bg-slate-100 text-slate-600', icone: Ban },
};

function formatarDataHora(iso) {
  if (!iso) return '—';
  return new Date(iso).toLocaleString('pt-BR', {
    day: '2-digit', month: '2-digit', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  });
}

export default function InstanciasProcesso() {
  const { id } = useParams();
  const { pessoa } = useAuth();
  const souAdmin = !!pessoa?.administrador;

  const [processo, setProcesso] = useState(null);
  const [instancias, setInstancias] = useState([]);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState('');
  const [filtro, setFiltro] = useState('em_andamento');

  const [modalCancelar, setModalCancelar] = useState(null); // { instancia }

  async function carregar() {
    setCarregando(true);
    setErro('');
    try {
      const [p, ins] = await Promise.all([
        api.get(`/processos/${id}`),
        api.get(`/processos/${id}/instancias`),
      ]);
      setProcesso(p.data);
      setInstancias(ins.data);
    } catch (err) {
      setErro(mensagemDeErro(err, 'Não consegui carregar.'));
    } finally {
      setCarregando(false);
    }
  }

  useEffect(() => { carregar(); /* eslint-disable-next-line */ }, [id]);

  const instanciasFiltradas = instancias.filter(
    (i) => filtro === 'todas' ? true : i.status === filtro,
  );

  return (
    <div className="max-w-5xl">
      <header className="mb-5 flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <Link
            to={`/processos/${id}`}
            className="inline-flex items-center gap-1 text-xs text-nexus-700 hover:text-nexus-800 mb-2"
          >
            <ArrowLeft size={11} /> Voltar ao editor
          </Link>
          <h1 className="text-2xl font-semibold text-slate-900 inline-flex items-center gap-2">
            <ListChecks size={20} className="text-nexus-700" />
            Instâncias de {processo?.nome || '...'}
          </h1>
          <p className="mt-1 text-sm text-slate-600">
            Cada instância é uma execução real do processo, com seu próprio
            quadro de cards.
          </p>
        </div>
      </header>

      {erro && (
        <div className="mb-4 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{erro}</div>
      )}

      {/* Filtros */}
      <div className="mb-4 flex items-center gap-1 rounded-lg border border-slate-200 bg-slate-50 p-1 inline-flex">
        {[
          { v: 'em_andamento', r: 'Em andamento' },
          { v: 'concluida',    r: 'Concluídas' },
          { v: 'cancelada',    r: 'Canceladas' },
          { v: 'todas',        r: 'Todas' },
        ].map((o) => (
          <button
            key={o.v}
            type="button"
            onClick={() => setFiltro(o.v)}
            className={[
              'rounded-md px-3 py-1 text-xs font-medium transition-colors',
              filtro === o.v
                ? 'bg-white text-nexus-800 shadow-sm'
                : 'text-slate-600 hover:bg-slate-100',
            ].join(' ')}
          >
            {o.r}
            {' ('}
            {o.v === 'todas' ? instancias.length : instancias.filter((i) => i.status === o.v).length}
            {')'}
          </button>
        ))}
      </div>

      {carregando && (
        <div className="rounded-xl border border-slate-200 bg-white p-8 text-center text-sm text-slate-500">
          Carregando...
        </div>
      )}

      {!carregando && instanciasFiltradas.length === 0 && (
        <div className="rounded-xl border border-dashed border-slate-300 bg-white p-10 text-center">
          <Play size={28} className="mx-auto text-slate-300 mb-3" />
          <h2 className="text-base font-medium text-slate-900">Nenhuma instância {filtro !== 'todas' && filtro.replace('_', ' ')}.</h2>
          <p className="mt-1 text-sm text-slate-600">
            {filtro === 'em_andamento' || filtro === 'todas' ? (
              <>Volte ao editor e clique em <strong>Iniciar instância</strong> pra começar uma execução.</>
            ) : null}
          </p>
        </div>
      )}

      {!carregando && instanciasFiltradas.length > 0 && (
        <ul className="space-y-2">
          {instanciasFiltradas.map((i) => {
            const status = STATUS_INFO[i.status];
            const Icone = status.icone;
            const pct = i.total_nos > 0 ? Math.round((i.nos_concluidos / i.total_nos) * 100) : 0;
            return (
              <li key={i.id} className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className={`inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[10px] font-medium uppercase ${status.cor}`}>
                        <Icone size={10} /> {status.rotulo}
                      </span>
                      <span className="text-[10px] text-slate-500">v{i.versao_processo}</span>
                    </div>
                    <h3 className="mt-1.5 text-base font-semibold text-slate-900">{i.nome}</h3>
                    {i.descricao && (
                      <p className="mt-0.5 text-xs text-slate-600 line-clamp-2">{i.descricao}</p>
                    )}
                    <div className="mt-2 flex flex-wrap items-center gap-3 text-[11px] text-slate-500">
                      <span>Iniciada em {formatarDataHora(i.iniciada_em)}</span>
                      {i.iniciada_por_nome && <span>· por {i.iniciada_por_nome}</span>}
                      {i.concluida_em && <span>· concluída em {formatarDataHora(i.concluida_em)}</span>}
                      {i.cancelada_em && <span>· cancelada em {formatarDataHora(i.cancelada_em)}</span>}
                    </div>

                    {/* Barra de progresso */}
                    <div className="mt-2.5 flex items-center gap-2">
                      <div className="flex-1 max-w-[300px] h-1.5 rounded-full bg-slate-100 overflow-hidden">
                        <div
                          className={`h-full ${i.status === 'concluida' ? 'bg-emerald-500' : 'bg-nexus-600'}`}
                          style={{ width: `${pct}%` }}
                        />
                      </div>
                      <span className="text-[11px] text-slate-600 tabular-nums">
                        {i.nos_concluidos}/{i.total_nos}
                        {i.nos_ativos > 0 && (
                          <span className="text-amber-700"> · {i.nos_ativos} ativo{i.nos_ativos === 1 ? '' : 's'}</span>
                        )}
                      </span>
                    </div>

                    {i.motivo_cancelamento && (
                      <div className="mt-2 inline-flex items-start gap-1.5 rounded bg-slate-50 border border-slate-200 px-2 py-1 text-[11px] text-slate-700">
                        <Ban size={10} className="mt-0.5 text-slate-500" />
                        <span><strong>Motivo:</strong> {i.motivo_cancelamento}</span>
                      </div>
                    )}
                  </div>

                  <div className="flex items-center gap-1.5 shrink-0">
                    <Link
                      to={`/tarefas/${i.quadro_id}`}
                      className="inline-flex items-center gap-1 rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50"
                    >
                      <ExternalLink size={11} /> Abrir quadro
                    </Link>
                    {i.status === 'em_andamento' && souAdmin && (
                      <button
                        type="button"
                        onClick={() => setModalCancelar({ instancia: i })}
                        className="inline-flex items-center gap-1 rounded-lg border border-red-300 bg-white px-2 py-1.5 text-xs font-medium text-red-700 hover:bg-red-50"
                        title="Cancelar instância"
                      >
                        <Ban size={11} />
                      </button>
                    )}
                  </div>
                </div>
              </li>
            );
          })}
        </ul>
      )}

      {modalCancelar && (
        <ModalCancelar
          instancia={modalCancelar.instancia}
          aoFechar={() => setModalCancelar(null)}
          aoConfirmado={() => { setModalCancelar(null); carregar(); }}
        />
      )}
    </div>
  );
}

function ModalCancelar({ instancia, aoFechar, aoConfirmado }) {
  const [motivo, setMotivo] = useState('');
  const [erro, setErro] = useState('');
  const [enviando, setEnviando] = useState(false);

  async function confirmar(e) {
    e.preventDefault();
    setErro('');
    if (motivo.trim().length < 3) {
      setErro('Informe um motivo com pelo menos 3 caracteres.');
      return;
    }
    setEnviando(true);
    try {
      await api.post(`/instancias/${instancia.id}/cancelar`, {
        motivo_cancelamento: motivo.trim(),
      });
      aoConfirmado();
    } catch (err) {
      setErro(mensagemDeErro(err, 'Não consegui cancelar.'));
      setEnviando(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4">
      <div className="w-full max-w-md rounded-xl bg-white shadow-xl">
        <header className="flex items-center justify-between border-b border-slate-200 px-5 py-3">
          <h2 className="text-base font-semibold text-slate-900">Cancelar instância</h2>
          <button onClick={aoFechar} className="rounded p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-600">
            <X size={18} />
          </button>
        </header>

        <form onSubmit={confirmar} className="p-5 space-y-4">
          <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs text-amber-800 inline-flex items-start gap-2">
            <AlertTriangle size={14} className="mt-0.5 shrink-0" />
            <div>
              Cancelar marca a instância como cancelada e <strong>arquiva todos os
              cards pendentes</strong>. Cards já concluídos ficam intactos.
            </div>
          </div>

          <div className="rounded-lg border border-slate-200 bg-slate-50 p-3 text-sm">
            <div className="font-medium text-slate-900">{instancia.nome}</div>
            <div className="text-xs text-slate-600 mt-1">
              {instancia.nos_concluidos}/{instancia.total_nos} etapas concluídas
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-900 mb-1">
              Motivo <span className="text-red-600">*</span>
            </label>
            <textarea
              rows={3}
              required minLength={3} maxLength={2000}
              value={motivo}
              onChange={(e) => setMotivo(e.target.value)}
              placeholder="Ex: cliente desistiu, projeto cancelado..."
              className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm shadow-sm outline-none focus:border-nexus-500 focus:ring-2 focus:ring-nexus-200"
            />
          </div>

          {erro && (
            <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{erro}</div>
          )}

          <div className="flex justify-end gap-2 pt-2">
            <button type="button" onClick={aoFechar}
              className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50">
              Voltar
            </button>
            <button type="submit" disabled={enviando}
              className="inline-flex items-center gap-1.5 rounded-lg bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-700 disabled:opacity-50">
              <Ban size={14} />
              {enviando ? 'Cancelando...' : 'Confirmar cancelamento'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
