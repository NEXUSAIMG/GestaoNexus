import { useEffect, useState } from 'react';
import {
  Plus, Download, Trash2, Archive, ScrollText, Upload, ChevronDown, ChevronUp,
  Calendar as CalIcon, MessageSquare,
} from 'lucide-react';
import { api, mensagemDeErro, BASE_URL } from '../api/client.js';
import { useAuth } from '../context/AuthContext.jsx';
import {
  ModalBase, Campo, inputCls, BadgeStatus, PainelVotacao, ListaVotos,
  formatarTamanho, formatarData,
} from '../components/GovernancaUI.jsx';

/**
 * Atas de reunião — Sprint 6.
 *
 * Lista de atas com cards expansíveis. Cada card mostra:
 *   - Cabeçalho: título, data, status, ações
 *   - Expandido: descrição, painel de votação (se em aprovação) e lista de votos
 *
 * Admin pode criar nova ata + arquivar + excluir rascunhos.
 * Sócios com pode_aprovar_atas (ou admin) podem votar.
 */

export default function Atas() {
  const { pessoa, representacaoAtual, temPoder } = useAuth();
  const admin = !!pessoa?.administrador;

  const [filtroStatus, setFiltroStatus] = useState('todas');
  const [atas, setAtas] = useState([]);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState('');
  const [modalNova, setModalNova] = useState(false);

  async function carregar() {
    setCarregando(true);
    setErro('');
    try {
      const params = { tipo: 'ata' };
      if (filtroStatus !== 'todas') params.status = filtroStatus;
      const r = await api.get('/governanca/documentos', { params });
      setAtas(r.data);
    } catch (err) {
      setErro(mensagemDeErro(err, 'Não foi possível carregar as atas.'));
    } finally {
      setCarregando(false);
    }
  }

  useEffect(() => { carregar(); /* eslint-disable-next-line */ }, [filtroStatus]);

  return (
    <div>
      {/* Filtros + ação */}
      <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap gap-1">
          {['todas', 'em_aprovacao', 'aprovado', 'rejeitado', 'arquivado'].map((s) => (
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
                : s === 'aprovado' ? 'Aprovadas'
                : s === 'rejeitado' ? 'Rejeitadas'
                : 'Arquivadas'}
            </button>
          ))}
        </div>

        {admin && (
          <button
            type="button"
            onClick={() => setModalNova(true)}
            className="inline-flex items-center gap-2 rounded-lg bg-nexus-700 px-3 py-1.5 text-sm font-medium text-white hover:bg-nexus-800"
          >
            <Plus size={14} /> Nova ata
          </button>
        )}
      </div>

      {erro && (
        <div className="mb-4 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
          {erro}
        </div>
      )}

      {/* Lista */}
      <div className="space-y-3">
        {carregando && <div className="text-sm text-slate-500">Carregando...</div>}
        {!carregando && atas.length === 0 && (
          <div className="rounded-xl border border-dashed border-slate-300 bg-white p-8 text-center text-sm text-slate-500">
            Nenhuma ata encontrada.
          </div>
        )}
        {!carregando && atas.map((ata) => (
          <CartaoAta
            key={ata.id}
            ata={ata}
            admin={admin}
            podeVotar={temPoder('aprovar_atas')}
            temContexto={!!representacaoAtual}
            socioIdAtual={representacaoAtual?.socio_id}
            onAtualizado={carregar}
          />
        ))}
      </div>

      {modalNova && (
        <ModalNovaAta
          onFechar={() => setModalNova(false)}
          onSalvo={() => { setModalNova(false); carregar(); }}
        />
      )}
    </div>
  );
}

function CartaoAta({ ata, admin, podeVotar, temContexto, socioIdAtual, onAtualizado }) {
  const [aberto, setAberto] = useState(false);
  const [detalhes, setDetalhes] = useState(null);
  const [carregando, setCarregando] = useState(false);

  async function abrir() {
    if (aberto) { setAberto(false); return; }
    if (!detalhes) {
      setCarregando(true);
      try {
        const r = await api.get(`/governanca/documentos/${ata.id}`);
        setDetalhes(r.data);
      } catch {
        // ignora — o cartão pode abrir mesmo sem detalhes carregados
      } finally {
        setCarregando(false);
      }
    }
    setAberto(true);
  }

  async function recarregarDetalhes() {
    try {
      const r = await api.get(`/governanca/documentos/${ata.id}`);
      setDetalhes(r.data);
    } catch {}
    onAtualizado && onAtualizado();
  }

  async function arquivar() {
    if (!confirm('Arquivar esta ata? Ela some das listas mas continua acessível em "Arquivadas".')) return;
    try {
      await api.post(`/governanca/documentos/${ata.id}/arquivar`);
      onAtualizado && onAtualizado();
    } catch (err) {
      alert(mensagemDeErro(err, 'Não foi possível arquivar.'));
    }
  }

  async function excluir() {
    if (!confirm('Excluir esta ata? Ação não pode ser desfeita.')) return;
    try {
      await api.delete(`/governanca/documentos/${ata.id}`);
      onAtualizado && onAtualizado();
    } catch (err) {
      alert(mensagemDeErro(err, 'Não foi possível excluir.'));
    }
  }

  function baixarUrl() {
    return `${BASE_URL}/governanca/documentos/${ata.id}/arquivo`;
  }

  // Voto do sócio do contexto ativo (se algum), pra destacar no painel.
  const votoAtual = detalhes?.aprovacoes?.find(
    (a) => a.socio_id === socioIdAtual,
  )?.voto;

  return (
    <div className="rounded-xl border border-slate-200 bg-white shadow-sm">
      <div className="flex flex-wrap items-start justify-between gap-3 p-4">
        <div className="flex-1 min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <ScrollText size={14} className="text-slate-500 shrink-0" />
            <span className="font-medium text-slate-900 truncate">{ata.titulo}</span>
            <BadgeStatus status={ata.status} />
            {ata.quorum === 'unanimidade' && (
              <span className="rounded-full bg-purple-100 px-2 py-0.5 text-[10px] font-medium uppercase text-purple-700">
                Unanimidade
              </span>
            )}
          </div>
          <div className="mt-1 flex flex-wrap items-center gap-3 text-xs text-slate-500">
            <span className="inline-flex items-center gap-1">
              <CalIcon size={11} /> Reunião em {formatarData(ata.data_referencia)}
            </span>
            {ata.tem_arquivo && (
              <span className="text-slate-600">
                {ata.arquivo_nome} ({formatarTamanho(ata.arquivo_tamanho)})
              </span>
            )}
            <span className="inline-flex items-center gap-1">
              <MessageSquare size={11} />
              {ata.qtd_aprovado} aprovações · {ata.qtd_rejeitado} rejeições
            </span>
          </div>
        </div>

        <div className="flex items-center gap-1 no-print">
          {ata.tem_arquivo && (
            <a
              href={baixarUrl()}
              target="_blank"
              rel="noreferrer"
              className="rounded border border-slate-200 bg-white px-2 py-1 text-xs text-slate-700 hover:bg-slate-50"
            >
              <Download size={12} className="inline mr-1" /> Baixar
            </a>
          )}
          {admin && ata.status !== 'arquivado' && !ata.vigente && ata.status !== 'rascunho' && (
            <button
              type="button"
              onClick={arquivar}
              className="rounded border border-slate-200 bg-white px-2 py-1 text-xs text-slate-600 hover:bg-slate-50"
              title="Arquivar"
            >
              <Archive size={12} />
            </button>
          )}
          {admin && ata.status === 'rascunho' && (
            <button
              type="button"
              onClick={excluir}
              className="rounded border border-red-200 bg-white px-2 py-1 text-xs text-red-700 hover:bg-red-50"
              title="Excluir rascunho"
            >
              <Trash2 size={12} />
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
          {ata.descricao && (
            <div className="text-sm text-slate-700 whitespace-pre-wrap">{ata.descricao}</div>
          )}

          {ata.requer_aprovacao && ata.status === 'em_aprovacao' && (
            <PainelVotacao
              urlVotar={`/governanca/documentos/${ata.id}/votar`}
              votoAtual={votoAtual}
              desabilitado={!podeVotar || !temContexto}
              mensagemBloqueio={
                !temContexto
                  ? 'Escolha um contexto de sócio (no menu lateral) para votar.'
                  : 'Você não tem o poder "Aprovar atas" no contexto atual.'
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

function ModalNovaAta({ onFechar, onSalvo }) {
  const [titulo, setTitulo] = useState('');
  const [descricao, setDescricao] = useState('');
  const [dataReferencia, setDataReferencia] = useState(new Date().toISOString().slice(0, 10));
  const [quorum, setQuorum] = useState('maioria_simples');
  const [requerAprovacao, setRequerAprovacao] = useState(true);
  const [arquivo, setArquivo] = useState(null);
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState('');

  async function submeter(e) {
    e.preventDefault();
    setErro('');
    setSalvando(true);
    try {
      const fd = new FormData();
      fd.append('tipo', 'ata');
      fd.append('titulo', titulo);
      if (descricao) fd.append('descricao', descricao);
      fd.append('data_referencia', dataReferencia);
      fd.append('quorum', quorum);
      fd.append('requer_aprovacao', String(requerAprovacao));
      if (arquivo) fd.append('arquivo', arquivo);

      await api.post('/governanca/documentos', fd, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
      onSalvo();
    } catch (err) {
      setErro(mensagemDeErro(err, 'Não foi possível criar a ata.'));
    } finally {
      setSalvando(false);
    }
  }

  return (
    <ModalBase titulo="Nova ata de reunião" onFechar={onFechar}>
      <form onSubmit={submeter}>
        <Campo rotulo="Título" obrigatorio>
          <input className={inputCls} value={titulo} onChange={(e) => setTitulo(e.target.value)} maxLength={255} required
            placeholder="Ex: Ata da reunião de outubro/2025" />
        </Campo>

        <Campo rotulo="Data da reunião" obrigatorio>
          <input className={inputCls} type="date" value={dataReferencia} onChange={(e) => setDataReferencia(e.target.value)} required />
        </Campo>

        <Campo rotulo="Resumo / decisões tomadas (opcional)">
          <textarea className={inputCls} rows={4} value={descricao} onChange={(e) => setDescricao(e.target.value)} maxLength={5000}
            placeholder="Use o campo de upload pra anexar a ata completa em PDF." />
        </Campo>

        <Campo rotulo="Arquivo (PDF/Word/imagem) — opcional" hint="Sem arquivo, a ata fica como rascunho até você anexar.">
          <input
            type="file"
            accept=".pdf,.doc,.docx,image/png,image/jpeg,image/webp"
            onChange={(e) => setArquivo(e.target.files?.[0] || null)}
            className="block w-full text-xs text-slate-600 file:mr-3 file:rounded file:border-0 file:bg-nexus-700 file:px-3 file:py-1.5 file:text-xs file:font-medium file:text-white hover:file:bg-nexus-800"
          />
        </Campo>

        <Campo rotulo="Tipo de quorum">
          <select className={inputCls} value={quorum} onChange={(e) => setQuorum(e.target.value)}>
            <option value="maioria_simples">Maioria simples (mais de 50% dos sócios)</option>
            <option value="unanimidade">Unanimidade (todos precisam aprovar)</option>
          </select>
        </Campo>

        <Campo rotulo="">
          <label className="inline-flex items-center gap-2 text-sm text-slate-700">
            <input type="checkbox" checked={requerAprovacao} onChange={(e) => setRequerAprovacao(e.target.checked)} />
            Requer aprovação dos sócios
          </label>
        </Campo>

        {erro && <div className="mb-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{erro}</div>}

        <div className="flex items-center justify-end gap-2 mt-4">
          <button type="button" onClick={onFechar}
            className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
          >Cancelar</button>
          <button type="submit" disabled={salvando}
            className="inline-flex items-center gap-2 rounded-lg bg-nexus-700 px-4 py-2 text-sm font-medium text-white hover:bg-nexus-800 disabled:opacity-50"
          >
            <Upload size={14} />
            {salvando ? 'Salvando...' : 'Criar ata'}
          </button>
        </div>
      </form>
    </ModalBase>
  );
}
