import { useEffect, useState } from 'react';
import {
  Plus, Download, Trash2, Archive, FileText, Upload, ChevronDown, ChevronUp,
  Calendar as CalIcon, CheckCircle2, ShieldCheck,
} from 'lucide-react';
import { api, mensagemDeErro, BASE_URL } from '../api/client.js';
import { useAuth } from '../context/AuthContext.jsx';
import {
  ModalBase, Campo, inputCls, BadgeStatus, PainelVotacao, ListaVotos,
  formatarTamanho, formatarData,
} from '../components/GovernancaUI.jsx';

/**
 * Contrato Social — Sprint 6.
 *
 * Mostra com destaque o contrato VIGENTE no topo, e abaixo o histórico
 * de versões (aprovados, em aprovação, rejeitados, arquivados).
 *
 * Quando admin sobe um novo contrato e ele é aprovado, admin pode
 * "marcar como vigente" — o atual perde a flag.
 */

export default function ContratoSocial() {
  const { pessoa, representacaoAtual, temPoder } = useAuth();
  const admin = !!pessoa?.administrador;

  const [vigente, setVigente] = useState(null);
  const [historico, setHistorico] = useState([]);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState('');
  const [modalNovo, setModalNovo] = useState(false);

  async function carregar() {
    setCarregando(true);
    setErro('');
    try {
      const [vR, hR] = await Promise.all([
        api.get('/governanca/contrato-vigente'),
        api.get('/governanca/documentos', { params: { tipo: 'contrato_social' } }),
      ]);
      setVigente(vR.data);
      // Histórico = todos exceto o vigente (que já fica em destaque no topo)
      setHistorico(hR.data.filter((d) => !d.vigente));
    } catch (err) {
      setErro(mensagemDeErro(err, 'Não foi possível carregar o contrato.'));
    } finally {
      setCarregando(false);
    }
  }

  useEffect(() => { carregar(); }, []);

  // Próxima versão sugerida = última versão + 1, ou 1 se não houver
  const proximaVersao = (() => {
    const todasVersoes = [
      ...(vigente?.versao ? [vigente.versao] : []),
      ...historico.map((h) => h.versao || 0),
    ];
    return todasVersoes.length > 0 ? Math.max(...todasVersoes) + 1 : 1;
  })();

  return (
    <div>
      {erro && (
        <div className="mb-4 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
          {erro}
        </div>
      )}

      {/* Cabeçalho com ação */}
      {admin && (
        <div className="mb-4 flex justify-end">
          <button
            type="button"
            onClick={() => setModalNovo(true)}
            className="inline-flex items-center gap-2 rounded-lg bg-nexus-700 px-3 py-1.5 text-sm font-medium text-white hover:bg-nexus-800"
          >
            <Plus size={14} /> Nova versão do contrato
          </button>
        </div>
      )}

      {carregando && <div className="text-sm text-slate-500">Carregando...</div>}

      {/* Vigente em destaque */}
      {!carregando && vigente && (
        <section className="mb-8">
          <div className="mb-3 flex items-center gap-2">
            <ShieldCheck size={18} className="text-nexus-700" />
            <h2 className="text-base font-semibold text-slate-900">Contrato vigente</h2>
          </div>
          <CartaoContratoDestaque
            contrato={vigente}
            admin={admin}
            podeVotar={temPoder('votar')}
            temContexto={!!representacaoAtual}
            socioIdAtual={representacaoAtual?.socio_id}
            onAtualizado={carregar}
          />
        </section>
      )}

      {!carregando && !vigente && (
        <section className="mb-8 rounded-xl border border-amber-200 bg-amber-50 p-4">
          <div className="flex items-start gap-3">
            <ShieldCheck size={18} className="text-amber-700 mt-0.5" />
            <div>
              <h3 className="text-sm font-semibold text-amber-900">Nenhum contrato vigente</h3>
              <p className="mt-1 text-xs text-amber-800">
                Faça upload do contrato social atual e aprove para registrar oficialmente.
              </p>
            </div>
          </div>
        </section>
      )}

      {/* Histórico */}
      {!carregando && historico.length > 0 && (
        <section>
          <h2 className="mb-3 text-base font-semibold text-slate-900">Histórico</h2>
          <div className="space-y-3">
            {historico.map((c) => (
              <CartaoContratoHistorico
                key={c.id}
                contrato={c}
                admin={admin}
                podeVotar={temPoder('votar')}
                temContexto={!!representacaoAtual}
                socioIdAtual={representacaoAtual?.socio_id}
                onAtualizado={carregar}
              />
            ))}
          </div>
        </section>
      )}

      {modalNovo && (
        <ModalNovoContrato
          versaoSugerida={proximaVersao}
          onFechar={() => setModalNovo(false)}
          onSalvo={() => { setModalNovo(false); carregar(); }}
        />
      )}
    </div>
  );
}

function CartaoContratoDestaque({ contrato, admin, podeVotar, temContexto, onAtualizado }) {
  function baixarUrl() {
    return `${BASE_URL}/governanca/documentos/${contrato.id}/arquivo`;
  }

  return (
    <div className="rounded-xl border-2 border-nexus-200 bg-nexus-50 p-5 shadow-sm">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex-1 min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <FileText size={16} className="text-nexus-700" />
            <span className="font-semibold text-slate-900">{contrato.titulo}</span>
            <BadgeStatus vigente />
            {contrato.versao && (
              <span className="rounded-full bg-white px-2 py-0.5 text-[10px] font-semibold uppercase text-nexus-800">
                Versão {contrato.versao}
              </span>
            )}
          </div>
          <div className="mt-2 flex flex-wrap items-center gap-3 text-sm text-slate-700">
            <span className="inline-flex items-center gap-1">
              <CalIcon size={12} /> Data de vigência: {formatarData(contrato.data_referencia)}
            </span>
            {contrato.tem_arquivo && (
              <span className="text-slate-600">
                {contrato.arquivo_nome} ({formatarTamanho(contrato.arquivo_tamanho)})
              </span>
            )}
          </div>
          {contrato.descricao && (
            <div className="mt-3 text-sm text-slate-700">{contrato.descricao}</div>
          )}
        </div>

        <div className="flex items-center gap-2 no-print">
          {contrato.tem_arquivo && (
            <a
              href={baixarUrl()}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-2 rounded-lg bg-white px-3 py-1.5 text-sm font-medium text-nexus-800 shadow-sm hover:bg-slate-50"
            >
              <Download size={14} /> Baixar contrato
            </a>
          )}
        </div>
      </div>
    </div>
  );
}

function CartaoContratoHistorico({ contrato, admin, podeVotar, temContexto, socioIdAtual, onAtualizado }) {
  const [aberto, setAberto] = useState(false);
  const [detalhes, setDetalhes] = useState(null);
  const [carregando, setCarregando] = useState(false);

  async function abrir() {
    if (aberto) { setAberto(false); return; }
    if (!detalhes) {
      setCarregando(true);
      try {
        const r = await api.get(`/governanca/documentos/${contrato.id}`);
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
      const r = await api.get(`/governanca/documentos/${contrato.id}`);
      setDetalhes(r.data);
    } catch {}
    onAtualizado && onAtualizado();
  }

  async function marcarVigente() {
    if (!confirm(`Marcar este contrato como vigente? Vai substituir o atual.`)) return;
    try {
      await api.post(`/governanca/documentos/${contrato.id}/marcar-vigente`);
      onAtualizado && onAtualizado();
    } catch (err) {
      alert(mensagemDeErro(err, 'Não foi possível marcar como vigente.'));
    }
  }

  async function arquivar() {
    if (!confirm('Arquivar este contrato?')) return;
    try {
      await api.post(`/governanca/documentos/${contrato.id}/arquivar`);
      onAtualizado && onAtualizado();
    } catch (err) {
      alert(mensagemDeErro(err, 'Não foi possível arquivar.'));
    }
  }

  async function excluir() {
    if (!confirm('Excluir este rascunho?')) return;
    try {
      await api.delete(`/governanca/documentos/${contrato.id}`);
      onAtualizado && onAtualizado();
    } catch (err) {
      alert(mensagemDeErro(err, 'Não foi possível excluir.'));
    }
  }

  function baixarUrl() {
    return `${BASE_URL}/governanca/documentos/${contrato.id}/arquivo`;
  }

  return (
    <div className="rounded-xl border border-slate-200 bg-white shadow-sm">
      <div className="flex flex-wrap items-start justify-between gap-3 p-4">
        <div className="flex-1 min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <FileText size={14} className="text-slate-500 shrink-0" />
            <span className="font-medium text-slate-900 truncate">{contrato.titulo}</span>
            <BadgeStatus status={contrato.status} />
            {contrato.versao && (
              <span className="rounded bg-slate-100 px-1.5 py-0.5 text-[10px] font-medium text-slate-600">
                v{contrato.versao}
              </span>
            )}
          </div>
          <div className="mt-1 flex flex-wrap items-center gap-3 text-xs text-slate-500">
            <span className="inline-flex items-center gap-1">
              <CalIcon size={11} /> {formatarData(contrato.data_referencia)}
            </span>
            {contrato.tem_arquivo && (
              <span>{contrato.arquivo_nome} ({formatarTamanho(contrato.arquivo_tamanho)})</span>
            )}
          </div>
        </div>

        <div className="flex items-center gap-1 no-print">
          {contrato.tem_arquivo && (
            <a
              href={baixarUrl()}
              target="_blank"
              rel="noreferrer"
              className="rounded border border-slate-200 bg-white px-2 py-1 text-xs text-slate-700 hover:bg-slate-50"
            >
              <Download size={12} className="inline mr-1" /> Baixar
            </a>
          )}
          {admin && contrato.status === 'aprovado' && !contrato.vigente && (
            <button
              type="button"
              onClick={marcarVigente}
              className="rounded border border-emerald-200 bg-emerald-50 px-2 py-1 text-xs text-emerald-700 hover:bg-emerald-100"
              title="Marcar como vigente"
            >
              <CheckCircle2 size={12} className="inline mr-1" />Tornar vigente
            </button>
          )}
          {admin && contrato.status !== 'arquivado' && contrato.status !== 'rascunho' && !contrato.vigente && (
            <button
              type="button"
              onClick={arquivar}
              className="rounded border border-slate-200 bg-white px-2 py-1 text-xs text-slate-600 hover:bg-slate-50"
              title="Arquivar"
            >
              <Archive size={12} />
            </button>
          )}
          {admin && contrato.status === 'rascunho' && (
            <button
              type="button"
              onClick={excluir}
              className="rounded border border-red-200 bg-white px-2 py-1 text-xs text-red-700 hover:bg-red-50"
              title="Excluir"
            >
              <Trash2 size={12} />
            </button>
          )}
          <button
            type="button"
            onClick={abrir}
            className="rounded p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700"
          >
            {aberto ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
          </button>
        </div>
      </div>

      {aberto && (
        <div className="border-t border-slate-100 p-4 space-y-4">
          {contrato.descricao && (
            <div className="text-sm text-slate-700 whitespace-pre-wrap">{contrato.descricao}</div>
          )}

          {contrato.requer_aprovacao && contrato.status === 'em_aprovacao' && (
            <PainelVotacao
              urlVotar={`/governanca/documentos/${contrato.id}/votar`}
              votoAtual={detalhes?.aprovacoes?.find((a) => a.socio_id === socioIdAtual)?.voto}
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

function ModalNovoContrato({ versaoSugerida, onFechar, onSalvo }) {
  const [titulo, setTitulo] = useState(`Contrato Social — versão ${versaoSugerida}`);
  const [descricao, setDescricao] = useState('');
  const [dataReferencia, setDataReferencia] = useState(new Date().toISOString().slice(0, 10));
  const [versao, setVersao] = useState(String(versaoSugerida));
  const [quorum, setQuorum] = useState('unanimidade');  // contrato social geralmente exige unanimidade
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
      fd.append('tipo', 'contrato_social');
      fd.append('titulo', titulo);
      if (descricao) fd.append('descricao', descricao);
      fd.append('data_referencia', dataReferencia);
      if (versao) fd.append('versao', versao);
      fd.append('quorum', quorum);
      fd.append('requer_aprovacao', String(requerAprovacao));
      if (arquivo) fd.append('arquivo', arquivo);

      await api.post('/governanca/documentos', fd, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
      onSalvo();
    } catch (err) {
      setErro(mensagemDeErro(err, 'Não foi possível criar o contrato.'));
    } finally {
      setSalvando(false);
    }
  }

  return (
    <ModalBase titulo="Nova versão do contrato social" onFechar={onFechar}>
      <form onSubmit={submeter}>
        <Campo rotulo="Título" obrigatorio>
          <input className={inputCls} value={titulo} onChange={(e) => setTitulo(e.target.value)} maxLength={255} required />
        </Campo>

        <div className="grid grid-cols-2 gap-3">
          <Campo rotulo="Data de vigência" obrigatorio>
            <input className={inputCls} type="date" value={dataReferencia} onChange={(e) => setDataReferencia(e.target.value)} required />
          </Campo>
          <Campo rotulo="Versão" obrigatorio>
            <input className={inputCls} type="number" min="1" value={versao} onChange={(e) => setVersao(e.target.value)} required />
          </Campo>
        </div>

        <Campo rotulo="Resumo das mudanças (opcional)">
          <textarea className={inputCls} rows={4} value={descricao} onChange={(e) => setDescricao(e.target.value)} maxLength={5000}
            placeholder="O que mudou em relação à versão anterior?" />
        </Campo>

        <Campo rotulo="Arquivo (PDF/Word)" hint="Faça upload do contrato. Sem arquivo, fica como rascunho.">
          <input
            type="file"
            accept=".pdf,.doc,.docx,image/png,image/jpeg,image/webp"
            onChange={(e) => setArquivo(e.target.files?.[0] || null)}
            className="block w-full text-xs text-slate-600 file:mr-3 file:rounded file:border-0 file:bg-nexus-700 file:px-3 file:py-1.5 file:text-xs file:font-medium file:text-white hover:file:bg-nexus-800"
          />
        </Campo>

        <Campo rotulo="Tipo de quorum">
          <select className={inputCls} value={quorum} onChange={(e) => setQuorum(e.target.value)}>
            <option value="unanimidade">Unanimidade (recomendado para contrato social)</option>
            <option value="maioria_simples">Maioria simples</option>
          </select>
        </Campo>

        <Campo rotulo="">
          <label className="inline-flex items-center gap-2 text-sm text-slate-700">
            <input type="checkbox" checked={requerAprovacao} onChange={(e) => setRequerAprovacao(e.target.checked)} />
            Requer aprovação dos sócios antes de virar vigente
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
            {salvando ? 'Salvando...' : 'Criar versão'}
          </button>
        </div>
      </form>
    </ModalBase>
  );
}
