import { useEffect, useState } from 'react';
import {
  Plus, Vote, ChevronDown, ChevronUp, Calendar as CalIcon,
  MessageSquare, AlertTriangle, X,
} from 'lucide-react';
import { api, mensagemDeErro } from '../api/client.js';
import { useAuth } from '../context/AuthContext.jsx';
import {
  ModalBase, Campo, inputCls, BadgeStatus, PainelVotacao, ListaVotos,
  formatarData,
} from '../components/GovernancaUI.jsx';

/**
 * Decisões societárias — Sprint 6.
 *
 * Cada decisão é um texto formal a ser aprovado ou rejeitado pelos
 * sócios. Sem arquivo (diferente das atas).
 *
 * Quem cria: admin.
 * Quem vota: sócio com `pode_votar` (ou admin) no contexto ativo.
 */

export default function Decisoes() {
  const { pessoa, representacaoAtual, temPoder } = useAuth();
  const admin = !!pessoa?.administrador;

  const [filtroStatus, setFiltroStatus] = useState('todas');
  const [decisoes, setDecisoes] = useState([]);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState('');
  const [modalNova, setModalNova] = useState(false);
  const [decisaoCancelar, setDecisaoCancelar] = useState(null);

  async function carregar() {
    setCarregando(true);
    setErro('');
    try {
      const params = {};
      if (filtroStatus !== 'todas') params.status = filtroStatus;
      const r = await api.get('/governanca/decisoes', { params });
      setDecisoes(r.data);
    } catch (err) {
      setErro(mensagemDeErro(err, 'Não foi possível carregar as decisões.'));
    } finally {
      setCarregando(false);
    }
  }

  useEffect(() => { carregar(); /* eslint-disable-next-line */ }, [filtroStatus]);

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap gap-1">
          {['todas', 'em_aprovacao', 'aprovada', 'rejeitada', 'cancelada'].map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => setFiltroStatus(s)}
              className={[
                'rounded-lg border px-3 py-1.5 text-xs font-medium',
                filtroStatus === s
                  ? 'border-nexus-700 bg-nexus-700 text-white'
                  : 'border-slate-300 bg-white text-slate-600 hover:bg-slate-50',
              ].join(' ')}
            >
              {s === 'todas' ? 'Todas'
                : s === 'em_aprovacao' ? 'Em aprovação'
                : s === 'aprovada' ? 'Aprovadas'
                : s === 'rejeitada' ? 'Rejeitadas'
                : 'Canceladas'}
            </button>
          ))}
        </div>

        {admin && (
          <button
            type="button"
            onClick={() => setModalNova(true)}
            className="inline-flex items-center gap-2 rounded-lg bg-nexus-700 px-3 py-1.5 text-sm font-medium text-white hover:bg-nexus-800"
          >
            <Plus size={14} /> Nova decisão
          </button>
        )}
      </div>

      {erro && (
        <div className="mb-4 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
          {erro}
        </div>
      )}

      <div className="space-y-3">
        {carregando && <div className="text-sm text-slate-500">Carregando...</div>}
        {!carregando && decisoes.length === 0 && (
          <div className="rounded-xl border border-dashed border-slate-300 bg-white p-8 text-center text-sm text-slate-500">
            Nenhuma decisão encontrada.
          </div>
        )}
        {!carregando && decisoes.map((d) => (
          <CartaoDecisao
            key={d.id}
            decisao={d}
            admin={admin}
            podeVotar={temPoder('votar')}
            temContexto={!!representacaoAtual}
            socioIdAtual={representacaoAtual?.socio_id}
            onAtualizado={carregar}
            onCancelar={() => setDecisaoCancelar(d)}
          />
        ))}
      </div>

      {modalNova && (
        <ModalNovaDecisao
          onFechar={() => setModalNova(false)}
          onSalvo={() => { setModalNova(false); carregar(); }}
        />
      )}

      {decisaoCancelar && (
        <ModalCancelarDecisao
          decisao={decisaoCancelar}
          onFechar={() => setDecisaoCancelar(null)}
          onSalvo={() => { setDecisaoCancelar(null); carregar(); }}
        />
      )}
    </div>
  );
}

function CartaoDecisao({ decisao: d, admin, podeVotar, temContexto, socioIdAtual, onAtualizado, onCancelar }) {
  const [aberto, setAberto] = useState(false);
  const [detalhes, setDetalhes] = useState(null);
  const [carregando, setCarregando] = useState(false);

  async function abrir() {
    if (aberto) { setAberto(false); return; }
    if (!detalhes) {
      setCarregando(true);
      try {
        const r = await api.get(`/governanca/decisoes/${d.id}`);
        setDetalhes(r.data);
      } catch {
        // ignora
      } finally {
        setCarregando(false);
      }
    }
    setAberto(true);
  }

  async function recarregarDetalhes() {
    try {
      const r = await api.get(`/governanca/decisoes/${d.id}`);
      setDetalhes(r.data);
    } catch {}
    onAtualizado && onAtualizado();
  }

  // Voto do sócio do contexto ativo, se houver, pra destacar no painel.
  const votoAtual = detalhes?.aprovacoes?.find(
    (a) => a.socio_id === socioIdAtual,
  )?.voto;

  return (
    <div className="rounded-xl border border-slate-200 bg-white shadow-sm">
      <div className="flex flex-wrap items-start justify-between gap-3 p-4">
        <div className="flex-1 min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <Vote size={14} className="text-slate-500 shrink-0" />
            <span className="font-medium text-slate-900 truncate">{d.titulo}</span>
            <BadgeStatus status={d.status} />
            {d.quorum === 'unanimidade' && (
              <span className="rounded-full bg-purple-100 px-2 py-0.5 text-[10px] font-medium uppercase text-purple-700">
                Unanimidade
              </span>
            )}
            <span className="rounded bg-slate-100 px-1.5 py-0.5 text-[10px] font-medium text-slate-600">
              {d.tipo}
            </span>
          </div>
          <div className="mt-1 flex flex-wrap items-center gap-3 text-xs text-slate-500">
            <span className="inline-flex items-center gap-1">
              <CalIcon size={11} /> Proposta em {formatarData(d.data_proposta)}
            </span>
            {d.prazo_aprovacao && (
              <span className="inline-flex items-center gap-1 text-amber-700">
                <AlertTriangle size={11} /> Prazo: {formatarData(d.prazo_aprovacao)}
              </span>
            )}
            <span className="inline-flex items-center gap-1">
              <MessageSquare size={11} />
              {d.qtd_aprovado} aprovações · {d.qtd_rejeitado} rejeições
            </span>
          </div>
        </div>

        <div className="flex items-center gap-1 no-print">
          {admin && d.status === 'em_aprovacao' && (
            <button
              type="button"
              onClick={onCancelar}
              className="rounded border border-red-200 bg-white px-2 py-1 text-xs text-red-700 hover:bg-red-50"
              title="Cancelar decisão"
            >
              <X size={12} className="inline mr-1" />Cancelar
            </button>
          )}
          <button
            type="button"
            onClick={abrir}
            className="rounded p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700"
            title={aberto ? 'Fechar' : 'Ver detalhes'}
          >
            {aberto ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
          </button>
        </div>
      </div>

      {aberto && (
        <div className="border-t border-slate-100 p-4 space-y-4">
          <div className="rounded-lg bg-slate-50 p-3 text-sm text-slate-800 whitespace-pre-wrap">
            {d.descricao}
          </div>

          {d.referencia_externa && (
            <div className="text-xs text-slate-500">
              <strong>Referência:</strong> {d.referencia_externa}
            </div>
          )}

          {d.status === 'cancelada' && d.motivo_cancelamento && (
            <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-800">
              <strong>Cancelada:</strong> {d.motivo_cancelamento}
            </div>
          )}

          {d.status === 'em_aprovacao' && (
            <PainelVotacao
              urlVotar={`/governanca/decisoes/${d.id}/votar`}
              votoAtual={votoAtual}
              desabilitado={!podeVotar || !temContexto}
              mensagemBloqueio={
                !temContexto
                  ? 'Escolha um contexto de sócio (no menu lateral) para votar.'
                  : 'Você não tem o poder "Votar" no contexto atual.'
              }
              aoVotar={recarregarDetalhes}
            />
          )}

          {carregando ? (
            <div className="text-xs text-slate-500">Carregando histórico...</div>
          ) : (
            <ListaVotos
              aprovacoes={detalhes?.aprovacoes ?? []}
              totalSocios={detalhes?.total_socios_elegiveis ?? 0}
            />
          )}
        </div>
      )}
    </div>
  );
}

function ModalNovaDecisao({ onFechar, onSalvo }) {
  const [titulo, setTitulo] = useState('');
  const [descricao, setDescricao] = useState('');
  const [tipo, setTipo] = useState('geral');
  const [referenciaExterna, setReferenciaExterna] = useState('');
  const [dataProposta, setDataProposta] = useState(new Date().toISOString().slice(0, 10));
  const [prazoAprovacao, setPrazoAprovacao] = useState('');
  const [quorum, setQuorum] = useState('maioria_simples');
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState('');

  async function submeter(e) {
    e.preventDefault();
    setErro('');
    setSalvando(true);
    try {
      await api.post('/governanca/decisoes', {
        titulo,
        descricao,
        tipo: tipo || 'geral',
        referencia_externa: referenciaExterna || null,
        data_proposta: dataProposta,
        prazo_aprovacao: prazoAprovacao || null,
        quorum,
      });
      onSalvo();
    } catch (err) {
      setErro(mensagemDeErro(err, 'Não foi possível criar a decisão.'));
    } finally {
      setSalvando(false);
    }
  }

  return (
    <ModalBase titulo="Nova decisão societária" onFechar={onFechar} largura="max-w-2xl">
      <form onSubmit={submeter}>
        <Campo rotulo="Título" obrigatorio>
          <input className={inputCls} value={titulo} onChange={(e) => setTitulo(e.target.value)} maxLength={255} required
            placeholder="Ex: Aprovação de distribuição extraordinária 2025" />
        </Campo>

        <Campo rotulo="Descrição completa" obrigatorio
          hint="Texto formal da decisão. Os sócios vão votar baseados nisso.">
          <textarea className={inputCls} rows={8} value={descricao} onChange={(e) => setDescricao(e.target.value)} maxLength={10000} required
            placeholder="Descreva em detalhes o que está sendo proposto, valores, prazos, condições..." />
        </Campo>

        <div className="grid grid-cols-2 gap-3">
          <Campo rotulo="Tipo">
            <input className={inputCls} value={tipo} onChange={(e) => setTipo(e.target.value)} maxLength={50}
              placeholder="Ex: distribuicao, mudanca_capital" />
          </Campo>
          <Campo rotulo="Referência externa">
            <input className={inputCls} value={referenciaExterna} onChange={(e) => setReferenciaExterna(e.target.value)} maxLength={255}
              placeholder="Ex: ID de distribuição relacionada" />
          </Campo>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <Campo rotulo="Data da proposta" obrigatorio>
            <input className={inputCls} type="date" value={dataProposta} onChange={(e) => setDataProposta(e.target.value)} required />
          </Campo>
          <Campo rotulo="Prazo de aprovação (opcional)">
            <input className={inputCls} type="date" value={prazoAprovacao} onChange={(e) => setPrazoAprovacao(e.target.value)} />
          </Campo>
        </div>

        <Campo rotulo="Tipo de quorum">
          <select className={inputCls} value={quorum} onChange={(e) => setQuorum(e.target.value)}>
            <option value="maioria_simples">Maioria simples (mais de 50% dos sócios)</option>
            <option value="unanimidade">Unanimidade (todos precisam aprovar)</option>
          </select>
        </Campo>

        {erro && <div className="mb-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{erro}</div>}

        <div className="flex items-center justify-end gap-2 mt-4">
          <button type="button" onClick={onFechar}
            className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
          >Cancelar</button>
          <button type="submit" disabled={salvando}
            className="rounded-lg bg-nexus-700 px-4 py-2 text-sm font-medium text-white hover:bg-nexus-800 disabled:opacity-50"
          >{salvando ? 'Criando...' : 'Submeter para aprovação'}</button>
        </div>
      </form>
    </ModalBase>
  );
}

function ModalCancelarDecisao({ decisao, onFechar, onSalvo }) {
  const [motivo, setMotivo] = useState('');
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState('');

  async function submeter(e) {
    e.preventDefault();
    setErro('');
    setSalvando(true);
    try {
      await api.post(`/governanca/decisoes/${decisao.id}/cancelar`, { motivo_cancelamento: motivo });
      onSalvo();
    } catch (err) {
      setErro(mensagemDeErro(err, 'Não foi possível cancelar.'));
    } finally {
      setSalvando(false);
    }
  }

  return (
    <ModalBase titulo="Cancelar decisão" onFechar={onFechar}>
      <div className="mb-3 rounded-lg bg-slate-50 px-3 py-2 text-sm text-slate-700">
        <strong>{decisao.titulo}</strong>
      </div>
      <form onSubmit={submeter}>
        <Campo rotulo="Motivo do cancelamento" obrigatorio hint="Mínimo 3 caracteres. Fica no histórico.">
          <textarea
            className={inputCls} rows={3}
            value={motivo} onChange={(e) => setMotivo(e.target.value)}
            required minLength={3} maxLength={500}
          />
        </Campo>

        {erro && <div className="mb-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{erro}</div>}

        <div className="flex items-center justify-end gap-2 mt-4">
          <button type="button" onClick={onFechar}
            className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
          >Voltar</button>
          <button type="submit" disabled={salvando}
            className="rounded-lg bg-red-700 px-4 py-2 text-sm font-medium text-white hover:bg-red-800 disabled:opacity-50"
          >{salvando ? 'Cancelando...' : 'Cancelar decisão'}</button>
        </div>
      </form>
    </ModalBase>
  );
}
