import { useEffect, useState, useRef } from 'react';
import { Link, useParams, useNavigate } from 'react-router-dom';
import {
  ArrowLeft, Pencil, X, Plus, Save, Trash2, AlertCircle,
  Paperclip, Download, FileText, Image as ImageIcon, Wrench,
  ArrowRight, RefreshCw, CheckCircle2, Calendar, MapPin, User,
  ShieldCheck, ShieldAlert, History, Send, Upload, FileBox,
  Receipt, Box,
} from 'lucide-react';
import { api, mensagemDeErro } from '../api/client.js';
import { useAuth } from '../context/AuthContext.jsx';

/**
 * Detalhe do item de inventário — Sprint 17.
 *
 * Três tabs:
 *   - Geral: identificação, NF, garantia, responsável, localização (editável)
 *   - Anexos: lista de NFs/fotos/manuais com upload
 *   - Histórico: lista cronológica de movimentos
 *
 * Atalhos: Transferir (mudar responsável/localização), Manutenção, Descartar
 */

const STATUS_INFO = {
  em_uso:       { rotulo: 'Em uso',       cor: 'bg-emerald-100 text-emerald-800' },
  em_estoque:   { rotulo: 'Em estoque',   cor: 'bg-blue-100 text-blue-800' },
  manutencao:   { rotulo: 'Manutenção',   cor: 'bg-amber-100 text-amber-800' },
  descartado:   { rotulo: 'Descartado',   cor: 'bg-slate-200 text-slate-700' },
  vendido:      { rotulo: 'Vendido',      cor: 'bg-violet-100 text-violet-800' },
  perdido:      { rotulo: 'Perdido',      cor: 'bg-red-100 text-red-800' },
};

const FORMA_PAG_LABEL = {
  cartao_credito: 'Cartão de crédito',
  cartao_debito: 'Cartão de débito',
  pix: 'PIX',
  boleto: 'Boleto',
  transferencia: 'Transferência',
  dinheiro: 'Dinheiro',
  outro: 'Outro',
};

const TIPO_ANEXO_LABEL = {
  nf: 'Nota Fiscal',
  foto: 'Foto',
  manual: 'Manual',
  outro: 'Outro',
};

// Movimentos têm tipo descritivo
const TIPO_MOV_LABEL = {
  cadastro:      { rotulo: 'Cadastro',         cor: 'bg-blue-100 text-blue-800',       icone: Plus },
  edicao:        { rotulo: 'Edição',           cor: 'bg-slate-100 text-slate-700',     icone: Pencil },
  transferencia: { rotulo: 'Transferência',    cor: 'bg-violet-100 text-violet-800',   icone: ArrowRight },
  troca_status:  { rotulo: 'Troca de status',  cor: 'bg-amber-100 text-amber-800',     icone: RefreshCw },
  descarte:      { rotulo: 'Baixa',            cor: 'bg-red-100 text-red-800',         icone: Trash2 },
  manutencao:    { rotulo: 'Manutenção',       cor: 'bg-amber-100 text-amber-800',     icone: Wrench },
  anexo:         { rotulo: 'Anexo',            cor: 'bg-emerald-100 text-emerald-800', icone: Paperclip },
};

function fmtBRL(n) {
  return Number(n || 0).toLocaleString('pt-BR', {
    style: 'currency', currency: 'BRL',
    minimumFractionDigits: 2, maximumFractionDigits: 2,
  });
}

function fmtData(iso) {
  if (!iso) return '—';
  return new Date(`${String(iso).slice(0, 10)}T12:00:00`)
    .toLocaleDateString('pt-BR');
}

function fmtDataHora(iso) {
  if (!iso) return '—';
  return new Date(iso).toLocaleString('pt-BR');
}

function fmtTamanho(bytes) {
  if (!bytes) return '';
  const kb = bytes / 1024;
  if (kb < 1000) return `${kb.toFixed(0)} KB`;
  return `${(kb / 1024).toFixed(1)} MB`;
}

// =============================================================================
// Página
// =============================================================================

export default function InventarioItem() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { pessoa } = useAuth();
  const souAdmin = !!pessoa?.administrador;

  const [item, setItem] = useState(null);
  const [anexos, setAnexos] = useState([]);
  const [movimentos, setMovimentos] = useState([]);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState('');
  const [tab, setTab] = useState('geral');

  // Modais
  const [modalEditar, setModalEditar] = useState(false);
  const [modalTransferir, setModalTransferir] = useState(false);
  const [modalDescartar, setModalDescartar] = useState(false);

  async function carregar() {
    setCarregando(true);
    setErro('');
    try {
      const [r1, r2, r3] = await Promise.all([
        api.get(`/inventario/${id}`),
        api.get(`/inventario/${id}/anexos`),
        api.get(`/inventario/${id}/movimentos`),
      ]);
      setItem(r1.data);
      setAnexos(r2.data);
      setMovimentos(r3.data);
    } catch (err) {
      setErro(mensagemDeErro(err, 'Não consegui carregar o item.'));
    } finally {
      setCarregando(false);
    }
  }

  useEffect(() => { carregar(); /* eslint-disable-next-line */ }, [id]);

  if (carregando) return <div className="p-4 text-sm text-slate-500">Carregando...</div>;
  if (erro) return (
    <div className="max-w-3xl">
      <Link to="/inventario" className="inline-flex items-center gap-1 text-sm text-slate-600 hover:text-nexus-700 mb-3">
        <ArrowLeft size={14} /> Voltar
      </Link>
      <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{erro}</div>
    </div>
  );
  if (!item) return null;

  const status = STATUS_INFO[item.status] || STATUS_INFO.em_uso;
  const baixado = ['descartado', 'vendido', 'perdido'].includes(item.status);

  // Garantia: vencida / vencendo / ok
  let garantiaInfo = null;
  if (item.garantia_fim) {
    const fim = new Date(`${String(item.garantia_fim).slice(0, 10)}T12:00:00`);
    const hoje = new Date();
    const diasRestantes = Math.floor((fim - hoje) / 86400000);
    if (diasRestantes < 0) {
      garantiaInfo = { texto: `Vencida em ${fmtData(item.garantia_fim)}`, cor: 'text-red-700', icone: ShieldAlert };
    } else if (diasRestantes <= 60) {
      garantiaInfo = { texto: `Vencendo em ${diasRestantes} dia${diasRestantes === 1 ? '' : 's'}`, cor: 'text-amber-700', icone: ShieldAlert };
    } else {
      garantiaInfo = { texto: `Válida até ${fmtData(item.garantia_fim)}`, cor: 'text-emerald-700', icone: ShieldCheck };
    }
  }

  return (
    <div className="max-w-7xl">
      <Link to="/inventario" className="inline-flex items-center gap-1 text-xs text-slate-600 hover:text-nexus-700 mb-3">
        <ArrowLeft size={11} /> Voltar ao inventário
      </Link>

      {/* Cabeçalho */}
      <div className="rounded-xl border border-slate-200 bg-white p-5 mb-4 shadow-sm">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="flex items-center gap-2 text-xs font-mono text-slate-500 mb-1">
              <Box size={11} /> {item.codigo}
              {item.patrimonio_etiqueta && (
                <span className="text-slate-400">· etiqueta #{item.patrimonio_etiqueta}</span>
              )}
            </div>
            <h1 className="text-2xl font-semibold text-slate-900">{item.nome}</h1>
            <div className="mt-1.5 flex items-center gap-2 flex-wrap text-sm">
              <span className={`inline-flex items-center rounded px-2 py-0.5 text-xs font-medium uppercase ${status.cor}`}>
                {status.rotulo}
              </span>
              <span className="inline-flex items-center gap-1 text-slate-700">
                <span className="text-slate-400">categoria:</span>
                {item.categoria_nome}
              </span>
              {item.responsavel_nome && (
                <span className="inline-flex items-center gap-1 text-slate-700">
                  <User size={11} /> {item.responsavel_nome}
                </span>
              )}
            </div>
          </div>

          {souAdmin && !baixado && (
            <div className="flex flex-wrap gap-1.5">
              <button type="button" onClick={() => setModalTransferir(true)}
                className="inline-flex items-center gap-1 rounded-lg border border-slate-300 bg-white px-2.5 py-1 text-xs font-medium text-slate-700 hover:bg-slate-50">
                <ArrowRight size={11} /> Transferir
              </button>
              <button type="button" onClick={() => setModalDescartar(true)}
                className="inline-flex items-center gap-1 rounded-lg border border-red-300 bg-white px-2.5 py-1 text-xs font-medium text-red-700 hover:bg-red-50">
                <Trash2 size={11} /> Dar baixa
              </button>
              <button type="button" onClick={() => setModalEditar(true)}
                className="inline-flex items-center gap-1 rounded-lg bg-nexus-700 px-2.5 py-1 text-xs font-medium text-white hover:bg-nexus-800">
                <Pencil size={11} /> Editar
              </button>
            </div>
          )}
        </div>

        {/* Cards de info rápida */}
        <div className="mt-4 grid grid-cols-2 lg:grid-cols-4 gap-3">
          <CardInfo icone={FileBox} titulo="Quantidade">
            <span className="text-lg font-semibold tabular-nums">{item.qtd}</span>
            {item.qtd > 1 && <span className="text-xs text-slate-500"> unidades</span>}
          </CardInfo>
          <CardInfo icone={Receipt} titulo="Valor total">
            <span className="text-lg font-semibold tabular-nums text-slate-900">
              {fmtBRL(item.valor_total)}
            </span>
            {item.qtd > 1 && (
              <div className="text-[10px] text-slate-500">
                {fmtBRL(item.valor_unitario)} cada
              </div>
            )}
          </CardInfo>
          <CardInfo icone={MapPin} titulo="Localização">
            <span className="text-sm text-slate-700">
              {item.localizacao || <span className="italic text-slate-400">não informada</span>}
            </span>
          </CardInfo>
          {garantiaInfo && (
            <CardInfo icone={garantiaInfo.icone} titulo="Garantia" cor={garantiaInfo.cor}>
              <span className={`text-sm font-medium ${garantiaInfo.cor}`}>
                {garantiaInfo.texto}
              </span>
            </CardInfo>
          )}
        </div>

        {baixado && item.motivo_descarte && (
          <div className="mt-4 rounded-lg border border-slate-300 bg-slate-50 p-3">
            <div className="text-xs font-semibold text-slate-700 mb-1">
              Motivo da baixa ({fmtData(item.data_descarte)}):
            </div>
            <div className="text-sm text-slate-700 whitespace-pre-wrap">
              {item.motivo_descarte}
            </div>
          </div>
        )}
      </div>

      {/* Tabs */}
      <div className="flex border-b border-slate-200 mb-4 overflow-x-auto">
        {[
          { v: 'geral',     l: 'Geral',     i: FileText },
          { v: 'anexos',    l: `Anexos (${anexos.length})`,    i: Paperclip },
          { v: 'historico', l: `Histórico (${movimentos.length})`, i: History },
        ].map((t) => (
          <button
            key={t.v} type="button" onClick={() => setTab(t.v)}
            className={[
              'inline-flex items-center gap-1.5 px-3 py-2 text-sm font-medium transition-colors whitespace-nowrap',
              tab === t.v
                ? 'border-b-2 border-nexus-700 text-nexus-800'
                : 'text-slate-600 hover:text-slate-900',
            ].join(' ')}
          >
            <t.i size={13} /> {t.l}
          </button>
        ))}
      </div>

      {/* Conteúdo das tabs */}
      {tab === 'geral' && <TabGeral item={item} />}
      {tab === 'anexos' && (
        <TabAnexos item={item} anexos={anexos} souAdmin={souAdmin} aoMudou={carregar} />
      )}
      {tab === 'historico' && <TabHistorico movimentos={movimentos} />}

      {/* Modais */}
      {modalEditar && (
        <ModalEditar
          item={item}
          aoFechar={() => setModalEditar(false)}
          aoSalvo={() => { setModalEditar(false); carregar(); }}
        />
      )}
      {modalTransferir && (
        <ModalTransferir
          item={item}
          aoFechar={() => setModalTransferir(false)}
          aoSalvo={() => { setModalTransferir(false); carregar(); }}
        />
      )}
      {modalDescartar && (
        <ModalDescartar
          item={item}
          aoFechar={() => setModalDescartar(false)}
          aoSalvo={() => { setModalDescartar(false); carregar(); }}
        />
      )}
    </div>
  );
}

// =============================================================================
// Card de info no cabeçalho
// =============================================================================

function CardInfo({ icone: Icone, titulo, children, cor = 'text-slate-500' }) {
  return (
    <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
      <div className={`flex items-center gap-1 text-[10px] uppercase tracking-wide font-medium ${cor}`}>
        {Icone && <Icone size={10} />}
        {titulo}
      </div>
      <div className="mt-1">
        {children}
      </div>
    </div>
  );
}

// =============================================================================
// Tab: Geral
// =============================================================================

function TabGeral({ item }) {
  return (
    <div className="space-y-4">
      <Bloco titulo="Identificação">
        <Linha label="Categoria">{item.categoria_nome}</Linha>
        <Linha label="Quantidade">{item.qtd}</Linha>
        <Linha label="Valor unitário">{fmtBRL(item.valor_unitario)}</Linha>
        <Linha label="Valor total">{fmtBRL(item.valor_total)}</Linha>
        {item.numero_serie && <Linha label="Nº de série"><span className="font-mono">{item.numero_serie}</span></Linha>}
        {item.descricao && (
          <Linha label="Descrição">
            <p className="whitespace-pre-wrap">{item.descricao}</p>
          </Linha>
        )}
      </Bloco>

      <Bloco titulo="Aquisição">
        <Linha label="Data de aquisição">{fmtData(item.data_aquisicao)}</Linha>
        {item.fornecedor && <Linha label="Fornecedor">{item.fornecedor}</Linha>}
        {item.forma_pagamento && (
          <Linha label="Forma de pagamento">{FORMA_PAG_LABEL[item.forma_pagamento] || item.forma_pagamento}</Linha>
        )}
        {item.nf_numero && (
          <Linha label="Nota Fiscal">
            Nº {item.nf_numero}
            {item.nf_serie && <span className="text-slate-500"> · série {item.nf_serie}</span>}
            {item.nf_data && <span className="text-slate-500"> · {fmtData(item.nf_data)}</span>}
            {item.nf_valor != null && <span className="text-slate-500"> · {fmtBRL(item.nf_valor)}</span>}
          </Linha>
        )}
      </Bloco>

      <Bloco titulo="Localização e responsável">
        <Linha label="Localização">{item.localizacao || <span className="italic text-slate-400">não informada</span>}</Linha>
        <Linha label="Responsável">{item.responsavel_nome || <span className="italic text-slate-400">área comum</span>}</Linha>
        {item.responsavel_email && <Linha label="Email do responsável">{item.responsavel_email}</Linha>}
      </Bloco>

      {(item.garantia_meses || item.garantia_fim) && (
        <Bloco titulo="Garantia">
          {item.garantia_meses && <Linha label="Período">{item.garantia_meses} meses</Linha>}
          {item.garantia_fim && <Linha label="Vence em">{fmtData(item.garantia_fim)}</Linha>}
        </Bloco>
      )}

      <Bloco titulo="Auditoria">
        <Linha label="Cadastrado em">{fmtDataHora(item.criado_em)}</Linha>
        {item.registrado_por_nome && <Linha label="Cadastrado por">{item.registrado_por_nome}</Linha>}
        <Linha label="Última atualização">{fmtDataHora(item.atualizado_em)}</Linha>
      </Bloco>
    </div>
  );
}

function Bloco({ titulo, children }) {
  return (
    <section className="rounded-xl border border-slate-200 bg-white shadow-sm">
      <header className="border-b border-slate-100 px-4 py-2">
        <h3 className="text-xs font-semibold text-slate-700 uppercase tracking-wide">{titulo}</h3>
      </header>
      <div className="px-4 py-3 divide-y divide-slate-50">{children}</div>
    </section>
  );
}

function Linha({ label, children }) {
  return (
    <div className="flex flex-wrap items-baseline gap-2 py-1.5 text-sm">
      <span className="text-slate-500 w-44 flex-shrink-0">{label}</span>
      <span className="text-slate-900 flex-1">{children}</span>
    </div>
  );
}

// =============================================================================
// Tab: Anexos
// =============================================================================

function TabAnexos({ item, anexos, souAdmin, aoMudou }) {
  const inputRef = useRef(null);
  const [tipoEscolhido, setTipoEscolhido] = useState('nf');
  const [enviando, setEnviando] = useState(false);
  const [erro, setErro] = useState('');

  async function aoEscolher(e) {
    const arquivo = e.target.files?.[0];
    if (!arquivo) return;
    setEnviando(true);
    setErro('');
    try {
      const fd = new FormData();
      fd.append('arquivo', arquivo);
      fd.append('tipo', tipoEscolhido);
      await api.post(`/inventario/${item.id}/anexos`, fd, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
      aoMudou();
    } catch (err) {
      setErro(mensagemDeErro(err, 'Falha ao enviar arquivo.'));
    } finally {
      setEnviando(false);
      if (inputRef.current) inputRef.current.value = '';
    }
  }

  async function excluir(anexo) {
    if (!confirm(`Excluir anexo "${anexo.nome_original}"?`)) return;
    try {
      await api.delete(`/inventario/${item.id}/anexos/${anexo.id}`);
      aoMudou();
    } catch (err) {
      alert(mensagemDeErro(err, 'Falha ao excluir.'));
    }
  }

  function urlBaixar(anexo) {
    return `${api.defaults.baseURL}/inventario/${item.id}/anexos/${anexo.id}/baixar`;
  }

  function iconeArquivo(mime) {
    if (mime?.startsWith('image/')) return ImageIcon;
    return FileText;
  }

  return (
    <div className="space-y-3">
      {souAdmin && (
        <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
          <h3 className="text-sm font-semibold text-slate-900 mb-2 inline-flex items-center gap-1.5">
            <Upload size={14} /> Adicionar anexo
          </h3>
          <p className="text-xs text-slate-600 mb-3">
            PDF, imagens (PNG/JPG/WebP) ou Word. Máx 10 MB por arquivo.
          </p>
          <div className="flex items-center gap-2 flex-wrap">
            <select
              value={tipoEscolhido} onChange={(e) => setTipoEscolhido(e.target.value)}
              className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm"
              disabled={enviando}
            >
              {Object.entries(TIPO_ANEXO_LABEL).map(([v, l]) => (
                <option key={v} value={v}>{l}</option>
              ))}
            </select>
            <input
              ref={inputRef}
              type="file"
              accept=".pdf,.png,.jpg,.jpeg,.webp,.docx,.doc,application/pdf,image/*"
              onChange={aoEscolher}
              disabled={enviando}
              className="block text-sm file:mr-3 file:rounded-lg file:border-0 file:bg-nexus-700 file:px-3 file:py-1.5 file:text-sm file:font-medium file:text-white hover:file:bg-nexus-800 file:cursor-pointer file:disabled:opacity-50"
            />
            {enviando && <span className="text-xs text-slate-500">Enviando...</span>}
          </div>
          {erro && (
            <div className="mt-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">{erro}</div>
          )}
        </div>
      )}

      {anexos.length === 0 ? (
        <div className="rounded-xl border border-dashed border-slate-300 bg-white p-8 text-center text-sm text-slate-500">
          Nenhum anexo ainda.
        </div>
      ) : (
        <ul className="space-y-2">
          {anexos.map((a) => {
            const Icone = iconeArquivo(a.mime_type);
            return (
              <li key={a.id} className="rounded-xl border border-slate-200 bg-white p-3 shadow-sm flex items-center gap-3">
                <div className="rounded-lg bg-slate-100 p-2 text-slate-600">
                  <Icone size={18} />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium text-slate-900 truncate">
                      {a.nome_original}
                    </span>
                    <span className="text-[10px] uppercase rounded bg-slate-100 px-1.5 py-0.5 text-slate-700 font-medium">
                      {TIPO_ANEXO_LABEL[a.tipo] || a.tipo}
                    </span>
                  </div>
                  <div className="text-xs text-slate-500">
                    {fmtTamanho(a.tamanho_bytes)} · enviado por {a.enviado_por_nome || '—'} em {fmtDataHora(a.criado_em)}
                  </div>
                  {a.descricao && (
                    <div className="text-xs text-slate-600 mt-0.5">{a.descricao}</div>
                  )}
                </div>
                <div className="flex gap-1">
                  <a
                    href={urlBaixar(a)}
                    target="_blank" rel="noreferrer"
                    className="rounded p-1.5 text-slate-500 hover:bg-slate-100 hover:text-slate-700"
                    title="Baixar / abrir"
                  >
                    <Download size={14} />
                  </a>
                  {souAdmin && (
                    <button onClick={() => excluir(a)} type="button"
                      className="rounded p-1.5 text-red-500 hover:bg-red-50"
                      title="Excluir"
                    >
                      <Trash2 size={14} />
                    </button>
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

// =============================================================================
// Tab: Histórico
// =============================================================================

function TabHistorico({ movimentos }) {
  if (movimentos.length === 0) {
    return (
      <div className="rounded-xl border border-dashed border-slate-300 bg-white p-8 text-center text-sm text-slate-500">
        Sem movimentações ainda.
      </div>
    );
  }

  return (
    <ol className="relative border-l-2 border-slate-200 ml-3 space-y-4">
      {movimentos.map((m) => {
        const info = TIPO_MOV_LABEL[m.tipo] || { rotulo: m.tipo, cor: 'bg-slate-100 text-slate-700', icone: History };
        const Icone = info.icone;
        return (
          <li key={m.id} className="ml-6">
            <span className={`absolute -left-3 inline-flex h-6 w-6 items-center justify-center rounded-full ${info.cor}`}>
              <Icone size={11} />
            </span>
            <div className="rounded-lg border border-slate-200 bg-white p-3 shadow-sm">
              <div className="flex flex-wrap items-baseline gap-2">
                <span className={`text-[10px] uppercase font-medium rounded px-1.5 py-0.5 ${info.cor}`}>
                  {info.rotulo}
                </span>
                <span className="text-xs text-slate-500">
                  {fmtDataHora(m.criado_em)}
                </span>
                {m.feito_por_nome && (
                  <span className="text-xs text-slate-700">por {m.feito_por_nome}</span>
                )}
              </div>

              {/* Detalhes específicos por tipo */}
              {m.tipo === 'transferencia' && (
                <div className="mt-2 text-sm text-slate-700 space-y-0.5">
                  {(m.de_responsavel_nome || m.para_responsavel_nome) && (
                    <div>
                      <span className="text-slate-500">Responsável: </span>
                      {m.de_responsavel_nome || <em className="text-slate-400">área comum</em>}
                      <ArrowRight size={12} className="inline mx-1.5 text-slate-400" />
                      {m.para_responsavel_nome || <em className="text-slate-400">área comum</em>}
                    </div>
                  )}
                  {(m.de_localizacao || m.para_localizacao) && m.de_localizacao !== m.para_localizacao && (
                    <div>
                      <span className="text-slate-500">Local: </span>
                      {m.de_localizacao || <em className="text-slate-400">—</em>}
                      <ArrowRight size={12} className="inline mx-1.5 text-slate-400" />
                      {m.para_localizacao || <em className="text-slate-400">—</em>}
                    </div>
                  )}
                </div>
              )}

              {m.tipo === 'troca_status' && (
                <div className="mt-2 text-sm text-slate-700">
                  {STATUS_INFO[m.de_status]?.rotulo || m.de_status}
                  <ArrowRight size={12} className="inline mx-1.5 text-slate-400" />
                  <strong>{STATUS_INFO[m.para_status]?.rotulo || m.para_status}</strong>
                </div>
              )}

              {m.tipo === 'descarte' && (
                <div className="mt-2 text-sm text-slate-700">
                  Status: <strong>{STATUS_INFO[m.para_status]?.rotulo || m.para_status}</strong>
                </div>
              )}

              {m.observacao && (
                <div className="mt-2 text-sm text-slate-700 whitespace-pre-wrap">
                  {m.observacao}
                </div>
              )}
            </div>
          </li>
        );
      })}
    </ol>
  );
}

// =============================================================================
// Modal: Editar
// =============================================================================

function ModalEditar({ item, aoFechar, aoSalvo }) {
  const [pessoas, setPessoas] = useState([]);
  const [categorias, setCategorias] = useState([]);
  const [d, setD] = useState({
    nome: item.nome || '',
    descricao: item.descricao || '',
    categoria_id: item.categoria_id,
    qtd: item.qtd,
    valor_unitario: item.valor_unitario,
    nf_numero: item.nf_numero || '',
    nf_serie: item.nf_serie || '',
    nf_data: item.nf_data?.slice(0, 10) || '',
    nf_valor: item.nf_valor || '',
    fornecedor: item.fornecedor || '',
    data_aquisicao: item.data_aquisicao?.slice(0, 10) || '',
    forma_pagamento: item.forma_pagamento || '',
    localizacao: item.localizacao || '',
    responsavel_id: item.responsavel_id || '',
    status: item.status,
    garantia_meses: item.garantia_meses || '',
    numero_serie: item.numero_serie || '',
    patrimonio_etiqueta: item.patrimonio_etiqueta || '',
  });
  const [erro, setErro] = useState('');
  const [salvando, setSalvando] = useState(false);

  useEffect(() => {
    Promise.all([
      api.get('/pessoas'),
      api.get('/inventario/categorias'),
    ]).then(([p, c]) => {
      setPessoas(p.data);
      setCategorias(c.data);
    }).catch(() => {});
  }, []);

  function setField(k, v) { setD((s) => ({ ...s, [k]: v })); }

  async function submeter(e) {
    e.preventDefault();
    setErro('');
    setSalvando(true);
    try {
      const body = {
        ...d,
        qtd: Number(d.qtd) || 1,
        valor_unitario: Number(d.valor_unitario) || 0,
        nf_valor: d.nf_valor === '' ? null : Number(d.nf_valor),
        garantia_meses: d.garantia_meses === '' ? null : Number(d.garantia_meses),
        nf_data: d.nf_data || null,
        data_aquisicao: d.data_aquisicao || null,
        responsavel_id: d.responsavel_id || null,
        forma_pagamento: d.forma_pagamento || null,
      };
      // limpa strings vazias
      for (const k of Object.keys(body)) {
        if (body[k] === '') body[k] = null;
      }
      await api.put(`/inventario/${item.id}`, body);
      aoSalvo();
    } catch (err) {
      setErro(mensagemDeErro(err, 'Não consegui salvar.'));
      setSalvando(false);
    }
  }

  const cats = categorias.filter((c) => !c.arquivada_em || c.id === item.categoria_id);

  return (
    <Modal titulo="Editar item" aoFechar={aoFechar}>
      <form onSubmit={submeter} className="p-5 space-y-3">
        <Campo label="Nome" requerido>
          <input required value={d.nome} onChange={(e) => setField('nome', e.target.value)} className={inputCls} />
        </Campo>

        <div className="grid grid-cols-2 gap-3">
          <Campo label="Categoria" requerido>
            <select required value={d.categoria_id} onChange={(e) => setField('categoria_id', e.target.value)} className={inputCls}>
              {cats.map((c) => <option key={c.id} value={c.id}>{c.nome}</option>)}
            </select>
          </Campo>
          <Campo label="Status">
            <select value={d.status} onChange={(e) => setField('status', e.target.value)} className={inputCls}>
              <option value="em_uso">Em uso</option>
              <option value="em_estoque">Em estoque</option>
              <option value="manutencao">Manutenção</option>
            </select>
          </Campo>
        </div>

        <Campo label="Descrição">
          <textarea rows={2} value={d.descricao} onChange={(e) => setField('descricao', e.target.value)} className={inputCls} />
        </Campo>

        <div className="grid grid-cols-3 gap-3">
          <Campo label="Quantidade">
            <input type="number" min="1" value={d.qtd} onChange={(e) => setField('qtd', e.target.value)} className={inputCls} />
          </Campo>
          <Campo label="Valor unitário">
            <input type="number" step="0.01" value={d.valor_unitario} onChange={(e) => setField('valor_unitario', e.target.value)} className={inputCls} />
          </Campo>
          <Campo label="Total">
            <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-700 tabular-nums">
              {fmtBRL((Number(d.valor_unitario) || 0) * (Number(d.qtd) || 0))}
            </div>
          </Campo>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <Campo label="Localização">
            <input value={d.localizacao} onChange={(e) => setField('localizacao', e.target.value)} className={inputCls} />
          </Campo>
          <Campo label="Responsável">
            <select value={d.responsavel_id} onChange={(e) => setField('responsavel_id', e.target.value)} className={inputCls}>
              <option value="">— área comum —</option>
              {pessoas.map((p) => <option key={p.id} value={p.id}>{p.nome}</option>)}
            </select>
          </Campo>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <Campo label="Nº de série"><input value={d.numero_serie} onChange={(e) => setField('numero_serie', e.target.value)} className={`${inputCls} font-mono`} /></Campo>
          <Campo label="Etiqueta"><input value={d.patrimonio_etiqueta} onChange={(e) => setField('patrimonio_etiqueta', e.target.value)} className={`${inputCls} font-mono`} /></Campo>
        </div>

        <Campo label="Fornecedor">
          <input value={d.fornecedor} onChange={(e) => setField('fornecedor', e.target.value)} className={inputCls} />
        </Campo>

        <div className="grid grid-cols-2 gap-3">
          <Campo label="Data de aquisição">
            <input type="date" value={d.data_aquisicao} onChange={(e) => setField('data_aquisicao', e.target.value)} className={inputCls} />
          </Campo>
          <Campo label="Forma de pagamento">
            <select value={d.forma_pagamento} onChange={(e) => setField('forma_pagamento', e.target.value)} className={inputCls}>
              <option value="">—</option>
              <option value="cartao_credito">Cartão de crédito</option>
              <option value="cartao_debito">Cartão de débito</option>
              <option value="pix">PIX</option>
              <option value="boleto">Boleto</option>
              <option value="transferencia">Transferência</option>
              <option value="dinheiro">Dinheiro</option>
              <option value="outro">Outro</option>
            </select>
          </Campo>
        </div>

        <div className="grid grid-cols-3 gap-3">
          <Campo label="Nº NF"><input value={d.nf_numero} onChange={(e) => setField('nf_numero', e.target.value)} className={inputCls} /></Campo>
          <Campo label="Série"><input value={d.nf_serie} onChange={(e) => setField('nf_serie', e.target.value)} className={inputCls} /></Campo>
          <Campo label="Data NF"><input type="date" value={d.nf_data} onChange={(e) => setField('nf_data', e.target.value)} className={inputCls} /></Campo>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <Campo label="Valor NF">
            <input type="number" step="0.01" value={d.nf_valor} onChange={(e) => setField('nf_valor', e.target.value)} className={inputCls} />
          </Campo>
          <Campo label="Garantia (meses)">
            <input type="number" min="0" value={d.garantia_meses} onChange={(e) => setField('garantia_meses', e.target.value)} className={inputCls} />
          </Campo>
        </div>

        {erro && <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{erro}</div>}

        <div className="flex justify-end gap-2 pt-2">
          <button type="button" onClick={aoFechar} className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50">Cancelar</button>
          <button type="submit" disabled={salvando} className="rounded-lg bg-nexus-700 px-4 py-2 text-sm font-medium text-white hover:bg-nexus-800 disabled:opacity-50">
            {salvando ? 'Salvando...' : 'Salvar'}
          </button>
        </div>
      </form>
    </Modal>
  );
}

// =============================================================================
// Modal: Transferir
// =============================================================================

function ModalTransferir({ item, aoFechar, aoSalvo }) {
  const [pessoas, setPessoas] = useState([]);
  const [responsavelId, setResponsavelId] = useState(item.responsavel_id || '');
  const [localizacao, setLocalizacao] = useState(item.localizacao || '');
  const [observacao, setObservacao] = useState('');
  const [erro, setErro] = useState('');
  const [salvando, setSalvando] = useState(false);

  useEffect(() => {
    api.get('/pessoas').then((r) => setPessoas(r.data)).catch(() => {});
  }, []);

  async function submeter(e) {
    e.preventDefault();
    setErro('');
    setSalvando(true);
    try {
      await api.post(`/inventario/${item.id}/transferir`, {
        responsavel_id: responsavelId || null,
        localizacao: localizacao.trim() || null,
        observacao: observacao.trim() || null,
      });
      aoSalvo();
    } catch (err) {
      setErro(mensagemDeErro(err, 'Não consegui transferir.'));
      setSalvando(false);
    }
  }

  return (
    <Modal titulo="Transferir item" aoFechar={aoFechar}>
      <form onSubmit={submeter} className="p-5 space-y-3">
        <p className="text-sm text-slate-600">
          Mude o responsável e/ou localização. A mudança fica registrada
          no histórico do item.
        </p>

        <Campo label="Responsável">
          <select value={responsavelId} onChange={(e) => setResponsavelId(e.target.value)} className={inputCls}>
            <option value="">— área comum —</option>
            {pessoas.map((p) => <option key={p.id} value={p.id}>{p.nome}</option>)}
          </select>
        </Campo>

        <Campo label="Localização">
          <input value={localizacao} onChange={(e) => setLocalizacao(e.target.value)} className={inputCls} placeholder="Ex: Sala 3, mesa do João" />
        </Campo>

        <Campo label="Observação (opcional)">
          <textarea rows={3} value={observacao} onChange={(e) => setObservacao(e.target.value)}
            className={inputCls}
            placeholder="Por que está sendo transferido?" />
        </Campo>

        {erro && <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{erro}</div>}

        <div className="flex justify-end gap-2 pt-2">
          <button type="button" onClick={aoFechar} className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50">Cancelar</button>
          <button type="submit" disabled={salvando} className="rounded-lg bg-nexus-700 px-4 py-2 text-sm font-medium text-white hover:bg-nexus-800 disabled:opacity-50">
            {salvando ? 'Transferindo...' : 'Transferir'}
          </button>
        </div>
      </form>
    </Modal>
  );
}

// =============================================================================
// Modal: Descartar (dar baixa)
// =============================================================================

function ModalDescartar({ item, aoFechar, aoSalvo }) {
  const [tipo, setTipo] = useState('descartado');
  const [data, setData] = useState(new Date().toISOString().slice(0, 10));
  const [motivo, setMotivo] = useState('');
  const [erro, setErro] = useState('');
  const [salvando, setSalvando] = useState(false);

  async function submeter(e) {
    e.preventDefault();
    if (motivo.trim().length < 3) {
      setErro('Descreva brevemente o motivo da baixa.');
      return;
    }
    setErro('');
    setSalvando(true);
    try {
      await api.post(`/inventario/${item.id}/descartar`, {
        status: tipo,
        data_descarte: data,
        motivo_descarte: motivo.trim(),
      });
      aoSalvo();
    } catch (err) {
      setErro(mensagemDeErro(err, 'Não consegui registrar.'));
      setSalvando(false);
    }
  }

  return (
    <Modal titulo="Dar baixa do item" aoFechar={aoFechar}>
      <form onSubmit={submeter} className="p-5 space-y-3">
        <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
          ⚠️ Esta ação é definitiva. O item ficará marcado como baixado e não poderá ser
          transferido ou ter o status alterado novamente.
        </div>

        <Campo label="Tipo de baixa">
          <div className="grid grid-cols-3 gap-2">
            {[
              { v: 'descartado', l: 'Descartado' },
              { v: 'vendido',    l: 'Vendido' },
              { v: 'perdido',    l: 'Perdido' },
            ].map((o) => (
              <label key={o.v}
                className={[
                  'cursor-pointer rounded-lg border-2 px-3 py-2 text-center text-sm transition',
                  tipo === o.v ? 'border-nexus-600 bg-nexus-50 text-nexus-800 font-medium' : 'border-slate-200 hover:border-slate-300',
                ].join(' ')}
              >
                <input type="radio" name="tipo" value={o.v} checked={tipo === o.v}
                  onChange={(e) => setTipo(e.target.value)} className="sr-only" />
                {o.l}
              </label>
            ))}
          </div>
        </Campo>

        <Campo label="Data da baixa">
          <input type="date" value={data} onChange={(e) => setData(e.target.value)} required className={inputCls} />
        </Campo>

        <Campo label="Motivo" requerido>
          <textarea rows={3} value={motivo} onChange={(e) => setMotivo(e.target.value)}
            required minLength={3}
            placeholder="Ex: Equipamento danificado sem reparo viável; doado para ONG; furtado em 12/04..."
            className={inputCls} />
        </Campo>

        {erro && <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{erro}</div>}

        <div className="flex justify-end gap-2 pt-2">
          <button type="button" onClick={aoFechar} className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50">Cancelar</button>
          <button type="submit" disabled={salvando} className="rounded-lg bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-700 disabled:opacity-50">
            {salvando ? 'Registrando...' : 'Confirmar baixa'}
          </button>
        </div>
      </form>
    </Modal>
  );
}

// =============================================================================
// Modal genérico
// =============================================================================

function Modal({ titulo, aoFechar, children }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4">
      <div className="w-full max-w-2xl rounded-xl bg-white shadow-xl max-h-[92vh] overflow-y-auto">
        <header className="flex items-center justify-between border-b border-slate-200 px-5 py-3 sticky top-0 bg-white z-10">
          <h2 className="text-base font-semibold text-slate-900">{titulo}</h2>
          <button onClick={aoFechar} className="rounded p-1 text-slate-400 hover:bg-slate-100">
            <X size={18} />
          </button>
        </header>
        {children}
      </div>
    </div>
  );
}

// =============================================================================
// Helpers visuais
// =============================================================================

const inputCls = 'w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm shadow-sm outline-none focus:border-nexus-500 focus:ring-2 focus:ring-nexus-200';

function Campo({ label, requerido, children }) {
  return (
    <div>
      <label className="block text-sm font-medium text-slate-900 mb-1">
        {label}
        {requerido && <span className="text-red-600 ml-0.5">*</span>}
      </label>
      {children}
    </div>
  );
}
