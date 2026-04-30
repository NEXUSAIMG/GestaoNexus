import { useEffect, useState, useMemo } from 'react';
import { Link } from 'react-router-dom';
import {
  Boxes, Plus, Search, Filter, Package, AlertCircle, Pencil,
  Armchair, Monitor, Tv, Car, Box, X, Trash2,
  TrendingUp, Wrench, ShieldAlert, ShieldCheck,
} from 'lucide-react';
import { api, mensagemDeErro } from '../api/client.js';
import { useAuth } from '../context/AuthContext.jsx';

/**
 * Inventário (Patrimônio) — Sprint 17.
 *
 * Lista todos os itens. Cada linha mostra: código, nome, categoria, qtd,
 * valor, responsável, status. Filtros por categoria/status/responsável + busca.
 *
 * KPIs no topo: total de itens, valor total, em uso, em manutenção,
 * garantia vencendo.
 *
 * Admin pode criar/editar/transferir/descartar. Sócios só veem.
 */

// =============================================================================
// Mapas visuais
// =============================================================================

const STATUS_INFO = {
  em_uso:       { rotulo: 'Em uso',       cor: 'bg-emerald-100 text-emerald-800' },
  em_estoque:   { rotulo: 'Em estoque',   cor: 'bg-blue-100 text-blue-800' },
  manutencao:   { rotulo: 'Manutenção',   cor: 'bg-amber-100 text-amber-800' },
  descartado:   { rotulo: 'Descartado',   cor: 'bg-slate-200 text-slate-700' },
  vendido:      { rotulo: 'Vendido',      cor: 'bg-violet-100 text-violet-800' },
  perdido:      { rotulo: 'Perdido',      cor: 'bg-red-100 text-red-800' },
};

const COR_BG = {
  slate: 'bg-slate-500', red: 'bg-red-500', orange: 'bg-orange-500',
  amber: 'bg-amber-500', yellow: 'bg-yellow-500', lime: 'bg-lime-500',
  emerald: 'bg-emerald-500', teal: 'bg-teal-500', cyan: 'bg-cyan-500',
  blue: 'bg-blue-500', indigo: 'bg-indigo-500', violet: 'bg-violet-500',
  fuchsia: 'bg-fuchsia-500', pink: 'bg-pink-500', rose: 'bg-rose-500',
};

// Mapa de ícones disponíveis pra categorias
const ICONES = { Armchair, Monitor, Tv, Car, Package, Box };

function IconeCategoria({ nome, className = '' }) {
  const Comp = ICONES[nome] || Box;
  return <Comp className={className} size={14} />;
}

// =============================================================================
// Helpers
// =============================================================================

function fmtBRL(n) {
  return Number(n || 0).toLocaleString('pt-BR', {
    style: 'currency',
    currency: 'BRL',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

function fmtData(iso) {
  if (!iso) return '—';
  return new Date(`${String(iso).slice(0, 10)}T12:00:00`)
    .toLocaleDateString('pt-BR');
}

// =============================================================================
// Página principal
// =============================================================================

export default function Inventario() {
  const { pessoa } = useAuth();
  const souAdmin = !!pessoa?.administrador;

  const [itens, setItens] = useState([]);
  const [categorias, setCategorias] = useState([]);
  const [resumo, setResumo] = useState(null);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState('');

  // Filtros
  const [busca, setBusca] = useState('');
  const [filtroCategoria, setFiltroCategoria] = useState('');
  const [filtroStatus, setFiltroStatus] = useState('');

  // Modais
  const [modalNovo, setModalNovo] = useState(false);

  async function carregar() {
    setCarregando(true);
    setErro('');
    try {
      const params = new URLSearchParams();
      if (filtroCategoria) params.set('categoria_id', filtroCategoria);
      if (filtroStatus) params.set('status', filtroStatus);
      if (busca.trim()) params.set('busca', busca.trim());
      const q = params.toString() ? `?${params}` : '';

      const [r1, r2, r3] = await Promise.all([
        api.get(`/inventario${q}`),
        api.get('/inventario/categorias'),
        api.get('/inventario/resumo'),
      ]);
      setItens(r1.data);
      setCategorias(r2.data);
      setResumo(r3.data);
    } catch (err) {
      setErro(mensagemDeErro(err, 'Não consegui carregar o inventário.'));
    } finally {
      setCarregando(false);
    }
  }

  useEffect(() => {
    carregar();
    /* eslint-disable-next-line */
  }, [filtroCategoria, filtroStatus]);

  // Busca tem debounce simples
  useEffect(() => {
    const t = setTimeout(carregar, 400);
    return () => clearTimeout(t);
    /* eslint-disable-next-line */
  }, [busca]);

  return (
    <div className="max-w-7xl">
      <header className="mb-6 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold text-slate-900 inline-flex items-center gap-2">
            <Boxes size={22} className="text-nexus-700" /> Inventário
          </h1>
          <p className="mt-1 text-sm text-slate-600">
            Bens, equipamentos e suprimentos da empresa — com nota fiscal,
            responsável e histórico de movimentação.
          </p>
        </div>

        {souAdmin && (
          <button
            type="button" onClick={() => setModalNovo(true)}
            className="inline-flex items-center gap-1.5 rounded-lg bg-nexus-700 px-3 py-2 text-sm font-medium text-white hover:bg-nexus-800"
          >
            <Plus size={14} /> Cadastrar item
          </button>
        )}
      </header>

      {/* KPIs */}
      {resumo && (
        <div className="mb-4 grid grid-cols-2 lg:grid-cols-4 gap-3">
          <Kpi titulo="Itens cadastrados" valor={Number(resumo.total_itens).toLocaleString('pt-BR')}
            icone={Package} cor="text-blue-600"
            descricao={`Em ${resumo.qtd_responsaveis} responsável${resumo.qtd_responsaveis === 1 ? '' : 'eis'}`} />
          <Kpi titulo="Valor total" valor={fmtBRL(resumo.valor_total)}
            icone={TrendingUp} cor="text-emerald-600"
            descricao="Soma de todos os itens em estoque" />
          <Kpi titulo="Em manutenção" valor={resumo.qtd_manutencao}
            icone={Wrench} cor="text-amber-600"
            descricao={`${resumo.qtd_em_uso} em uso · ${resumo.qtd_em_estoque} em estoque`} />
          <Kpi titulo="Garantias" valor={`${resumo.qtd_garantia_vencendo}`}
            icone={resumo.qtd_garantia_vencida > 0 ? ShieldAlert : ShieldCheck}
            cor={resumo.qtd_garantia_vencida > 0 ? 'text-red-600' : 'text-emerald-600'}
            descricao={`${resumo.qtd_garantia_vencendo} vencendo em 60 dias · ${resumo.qtd_garantia_vencida} vencidas`} />
        </div>
      )}

      {/* Filtros */}
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <div className="relative flex-1 min-w-[200px] max-w-md">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            type="search"
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
            placeholder="Buscar por código, nome, NF, fornecedor..."
            className="w-full rounded-lg border border-slate-300 bg-white pl-9 pr-3 py-1.5 text-sm shadow-sm outline-none focus:border-nexus-500 focus:ring-2 focus:ring-nexus-200"
          />
        </div>

        <select
          value={filtroCategoria} onChange={(e) => setFiltroCategoria(e.target.value)}
          className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm"
        >
          <option value="">Todas as categorias</option>
          {categorias.filter((c) => !c.arquivada_em).map((c) => (
            <option key={c.id} value={c.id}>{c.nome}</option>
          ))}
        </select>

        <select
          value={filtroStatus} onChange={(e) => setFiltroStatus(e.target.value)}
          className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm"
        >
          <option value="">Todos os status</option>
          {Object.entries(STATUS_INFO).map(([v, info]) => (
            <option key={v} value={v}>{info.rotulo}</option>
          ))}
        </select>

        {(filtroCategoria || filtroStatus || busca) && (
          <button
            type="button"
            onClick={() => { setFiltroCategoria(''); setFiltroStatus(''); setBusca(''); }}
            className="text-xs text-slate-600 hover:text-nexus-700 underline"
          >
            Limpar filtros
          </button>
        )}
      </div>

      {erro && (
        <div className="mb-4 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700 inline-flex items-center gap-2">
          <AlertCircle size={14} /> {erro}
        </div>
      )}

      {carregando && (
        <div className="rounded-xl border border-slate-200 bg-white p-8 text-center text-sm text-slate-500">
          Carregando...
        </div>
      )}

      {!carregando && itens.length === 0 && (
        <div className="rounded-xl border border-dashed border-slate-300 bg-white p-10 text-center">
          <Boxes size={28} className="mx-auto text-slate-300 mb-3" />
          <h2 className="text-base font-medium text-slate-900">
            {busca || filtroCategoria || filtroStatus
              ? 'Nenhum item bate com os filtros'
              : 'Inventário vazio'}
          </h2>
          {souAdmin && !busca && !filtroCategoria && !filtroStatus && (
            <p className="mt-1 text-sm text-slate-600">
              Clique em <strong>"Cadastrar item"</strong> pra começar.
            </p>
          )}
        </div>
      )}

      {!carregando && itens.length > 0 && (
        <div className="rounded-xl border border-slate-200 bg-white overflow-hidden shadow-sm">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 text-[11px] uppercase text-slate-500 font-medium">
                <tr>
                  <th className="text-left px-3 py-2">Código</th>
                  <th className="text-left px-3 py-2">Item</th>
                  <th className="text-left px-3 py-2">Categoria</th>
                  <th className="text-right px-3 py-2">Qtd</th>
                  <th className="text-right px-3 py-2">Valor total</th>
                  <th className="text-left px-3 py-2">Responsável</th>
                  <th className="text-left px-3 py-2">Status</th>
                  <th className="text-left px-3 py-2">Aquisição</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {itens.map((item) => {
                  const status = STATUS_INFO[item.status] || STATUS_INFO.em_uso;
                  return (
                    <tr key={item.id} className="hover:bg-slate-50">
                      <td className="px-3 py-2 font-mono text-xs text-slate-600">
                        <Link to={`/inventario/${item.id}`} className="hover:text-nexus-700 hover:underline">
                          {item.codigo}
                        </Link>
                      </td>
                      <td className="px-3 py-2">
                        <Link to={`/inventario/${item.id}`} className="font-medium text-slate-900 hover:text-nexus-700">
                          {item.nome}
                        </Link>
                        {item.patrimonio_etiqueta && (
                          <div className="text-[10px] text-slate-400 font-mono">
                            #{item.patrimonio_etiqueta}
                          </div>
                        )}
                      </td>
                      <td className="px-3 py-2">
                        <span className="inline-flex items-center gap-1.5">
                          <span className={`h-2 w-2 rounded-full ${COR_BG[item.categoria_cor] || COR_BG.slate}`} />
                          <span className="text-slate-700">{item.categoria_nome}</span>
                        </span>
                      </td>
                      <td className="px-3 py-2 text-right tabular-nums">
                        {item.qtd}
                      </td>
                      <td className="px-3 py-2 text-right tabular-nums text-slate-900">
                        {fmtBRL(item.valor_total)}
                      </td>
                      <td className="px-3 py-2 text-slate-700">
                        {item.responsavel_nome || (
                          <span className="text-slate-400 italic text-xs">área comum</span>
                        )}
                      </td>
                      <td className="px-3 py-2">
                        <span className={`inline-flex items-center rounded px-1.5 py-0.5 text-[10px] font-medium uppercase ${status.cor}`}>
                          {status.rotulo}
                        </span>
                      </td>
                      <td className="px-3 py-2 text-xs text-slate-600">
                        {fmtData(item.data_aquisicao)}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {modalNovo && (
        <ModalNovoItem
          categorias={categorias}
          aoFechar={() => setModalNovo(false)}
          aoCriado={() => { setModalNovo(false); carregar(); }}
        />
      )}
    </div>
  );
}

// =============================================================================
// KPI
// =============================================================================

function Kpi({ titulo, valor, descricao, icone: Icone, cor }) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-3 shadow-sm">
      <div className="flex items-center gap-1.5 text-[10px] uppercase tracking-wide text-slate-500 font-medium">
        {Icone && <Icone size={11} className={cor} />}
        {titulo}
      </div>
      <div className="mt-1 text-xl font-semibold text-slate-900 tabular-nums">{valor}</div>
      {descricao && <div className="mt-0.5 text-[11px] text-slate-500">{descricao}</div>}
    </div>
  );
}

// =============================================================================
// Modal: Novo item
// =============================================================================

function ModalNovoItem({ categorias, aoFechar, aoCriado }) {
  const [pessoas, setPessoas] = useState([]);
  const [d, setD] = useState({
    nome: '',
    descricao: '',
    categoria_id: '',
    qtd: 1,
    valor_unitario: '',
    nf_numero: '',
    nf_serie: '',
    nf_data: '',
    nf_valor: '',
    fornecedor: '',
    data_aquisicao: '',
    forma_pagamento: '',
    localizacao: '',
    responsavel_id: '',
    status: 'em_uso',
    garantia_meses: '',
    numero_serie: '',
    patrimonio_etiqueta: '',
  });
  const [erro, setErro] = useState('');
  const [salvando, setSalvando] = useState(false);

  // Carrega pessoas ao abrir
  useEffect(() => {
    api.get('/pessoas').then((r) => setPessoas(r.data)).catch(() => {});
  }, []);

  function setField(k, v) { setD((s) => ({ ...s, [k]: v })); }

  // Auto-preenche valor_unitario com nf_valor/qtd se ambos preenchidos
  // e valor_unitario ainda estiver vazio
  useEffect(() => {
    if (d.nf_valor && d.qtd > 0 && !d.valor_unitario) {
      setField('valor_unitario', (Number(d.nf_valor) / Number(d.qtd)).toFixed(2));
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [d.nf_valor]);

  async function submeter(e) {
    e.preventDefault();
    setErro('');

    if (!d.categoria_id) {
      setErro('Escolha uma categoria.');
      return;
    }

    setSalvando(true);
    try {
      const body = {
        nome: d.nome.trim(),
        descricao: d.descricao.trim() || null,
        categoria_id: d.categoria_id,
        qtd: Number(d.qtd) || 1,
        valor_unitario: Number(d.valor_unitario) || 0,
        nf_numero: d.nf_numero.trim() || null,
        nf_serie: d.nf_serie.trim() || null,
        nf_data: d.nf_data || null,
        nf_valor: d.nf_valor === '' ? null : Number(d.nf_valor),
        fornecedor: d.fornecedor.trim() || null,
        data_aquisicao: d.data_aquisicao || null,
        forma_pagamento: d.forma_pagamento || null,
        localizacao: d.localizacao.trim() || null,
        responsavel_id: d.responsavel_id || null,
        status: d.status,
        garantia_meses: d.garantia_meses === '' ? null : Number(d.garantia_meses),
        numero_serie: d.numero_serie.trim() || null,
        patrimonio_etiqueta: d.patrimonio_etiqueta.trim() || null,
      };
      await api.post('/inventario', body);
      aoCriado();
    } catch (err) {
      setErro(mensagemDeErro(err, 'Não consegui criar o item.'));
      setSalvando(false);
    }
  }

  const categoriasAtivas = categorias.filter((c) => !c.arquivada_em);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4">
      <div className="w-full max-w-2xl rounded-xl bg-white shadow-xl max-h-[92vh] overflow-y-auto">
        <header className="flex items-center justify-between border-b border-slate-200 px-5 py-3 sticky top-0 bg-white z-10">
          <h2 className="text-base font-semibold text-slate-900 inline-flex items-center gap-2">
            <Plus size={16} /> Cadastrar item de inventário
          </h2>
          <button onClick={aoFechar} className="rounded p-1 text-slate-400 hover:bg-slate-100">
            <X size={18} />
          </button>
        </header>

        <form onSubmit={submeter} className="p-5 space-y-4">
          <fieldset className="rounded-lg border border-slate-200 p-3">
            <legend className="text-xs font-semibold text-slate-700 px-1">Identificação</legend>
            <div className="space-y-3">
              <Campo label="Nome" requerido>
                <input
                  required minLength={1} maxLength={200}
                  value={d.nome} onChange={(e) => setField('nome', e.target.value)}
                  placeholder="Ex: Notebook Dell Inspiron 15"
                  autoFocus
                  className={inputCls}
                />
              </Campo>

              <div className="grid grid-cols-2 gap-3">
                <Campo label="Categoria" requerido>
                  <select
                    required
                    value={d.categoria_id} onChange={(e) => setField('categoria_id', e.target.value)}
                    className={inputCls}
                  >
                    <option value="">— escolha —</option>
                    {categoriasAtivas.map((c) => (
                      <option key={c.id} value={c.id}>{c.nome}</option>
                    ))}
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
                <textarea rows={2} maxLength={2000}
                  value={d.descricao} onChange={(e) => setField('descricao', e.target.value)}
                  placeholder="Modelo, especificações, observações..."
                  className={inputCls} />
              </Campo>

              <div className="grid grid-cols-2 gap-3">
                <Campo label="Nº de série (fabricante)">
                  <input maxLength={100}
                    value={d.numero_serie} onChange={(e) => setField('numero_serie', e.target.value)}
                    placeholder="Serial number do equipamento"
                    className={`${inputCls} font-mono`} />
                </Campo>
                <Campo label="Etiqueta de patrimônio">
                  <input maxLength={50}
                    value={d.patrimonio_etiqueta} onChange={(e) => setField('patrimonio_etiqueta', e.target.value)}
                    placeholder="Ex: NX-0042"
                    className={`${inputCls} font-mono`} />
                </Campo>
              </div>
            </div>
          </fieldset>

          <fieldset className="rounded-lg border border-slate-200 p-3">
            <legend className="text-xs font-semibold text-slate-700 px-1">Quantidade e valor</legend>
            <div className="grid grid-cols-3 gap-3">
              <Campo label="Quantidade">
                <input type="number" min="1" step="1"
                  value={d.qtd} onChange={(e) => setField('qtd', e.target.value)}
                  className={inputCls} />
              </Campo>
              <Campo label="Valor unitário (R$)">
                <input type="number" min="0" step="0.01"
                  value={d.valor_unitario} onChange={(e) => setField('valor_unitario', e.target.value)}
                  className={inputCls} />
              </Campo>
              <Campo label="Total">
                <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-700 tabular-nums">
                  {fmtBRL((Number(d.valor_unitario) || 0) * (Number(d.qtd) || 0))}
                </div>
              </Campo>
            </div>
          </fieldset>

          <fieldset className="rounded-lg border border-slate-200 p-3">
            <legend className="text-xs font-semibold text-slate-700 px-1">Aquisição</legend>
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <Campo label="Data de aquisição">
                  <input type="date"
                    value={d.data_aquisicao} onChange={(e) => setField('data_aquisicao', e.target.value)}
                    className={inputCls} />
                </Campo>
                <Campo label="Forma de pagamento">
                  <select
                    value={d.forma_pagamento} onChange={(e) => setField('forma_pagamento', e.target.value)}
                    className={inputCls}
                  >
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

              <Campo label="Fornecedor">
                <input maxLength={200}
                  value={d.fornecedor} onChange={(e) => setField('fornecedor', e.target.value)}
                  placeholder="Quem vendeu"
                  className={inputCls} />
              </Campo>

              <div className="grid grid-cols-3 gap-3">
                <Campo label="Nº da NF">
                  <input maxLength={50}
                    value={d.nf_numero} onChange={(e) => setField('nf_numero', e.target.value)}
                    className={inputCls} />
                </Campo>
                <Campo label="Série">
                  <input maxLength={20}
                    value={d.nf_serie} onChange={(e) => setField('nf_serie', e.target.value)}
                    className={inputCls} />
                </Campo>
                <Campo label="Data da NF">
                  <input type="date"
                    value={d.nf_data} onChange={(e) => setField('nf_data', e.target.value)}
                    className={inputCls} />
                </Campo>
              </div>

              <Campo label="Valor da NF (R$)">
                <input type="number" min="0" step="0.01"
                  value={d.nf_valor} onChange={(e) => setField('nf_valor', e.target.value)}
                  placeholder="Total da nota (preenche valor unitário se vazio)"
                  className={inputCls} />
              </Campo>

              <p className="text-xs text-slate-500 italic">
                💡 Dica: você pode anexar o PDF/foto da NF depois, na tela de detalhe do item.
              </p>
            </div>
          </fieldset>

          <fieldset className="rounded-lg border border-slate-200 p-3">
            <legend className="text-xs font-semibold text-slate-700 px-1">Localização e responsável</legend>
            <div className="grid grid-cols-2 gap-3">
              <Campo label="Localização">
                <input maxLength={200}
                  value={d.localizacao} onChange={(e) => setField('localizacao', e.target.value)}
                  placeholder="Ex: Sala 3, mesa do João"
                  className={inputCls} />
              </Campo>
              <Campo label="Responsável">
                <select
                  value={d.responsavel_id} onChange={(e) => setField('responsavel_id', e.target.value)}
                  className={inputCls}
                >
                  <option value="">— área comum —</option>
                  {pessoas.map((p) => (
                    <option key={p.id} value={p.id}>{p.nome}</option>
                  ))}
                </select>
              </Campo>
            </div>
          </fieldset>

          <fieldset className="rounded-lg border border-slate-200 p-3">
            <legend className="text-xs font-semibold text-slate-700 px-1">Garantia (opcional)</legend>
            <Campo label="Garantia em meses">
              <input type="number" min="0" max="600" step="1"
                value={d.garantia_meses} onChange={(e) => setField('garantia_meses', e.target.value)}
                placeholder="Ex: 12 (1 ano), 24 (2 anos)"
                className={inputCls} />
              <p className="mt-1 text-xs text-slate-500">
                Calculamos a data de fim com base na data de aquisição.
              </p>
            </Campo>
          </fieldset>

          {erro && (
            <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{erro}</div>
          )}

          <div className="flex justify-end gap-2 pt-2">
            <button type="button" onClick={aoFechar}
              className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50">
              Cancelar
            </button>
            <button type="submit" disabled={salvando}
              className="rounded-lg bg-nexus-700 px-4 py-2 text-sm font-medium text-white hover:bg-nexus-800 disabled:opacity-50">
              {salvando ? 'Cadastrando...' : 'Cadastrar item'}
            </button>
          </div>
        </form>
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
