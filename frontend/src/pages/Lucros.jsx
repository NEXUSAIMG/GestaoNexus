import { useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  TrendingDown, TrendingUp, Users, Wallet, PieChart as PieIcon,
  Plus, Printer, ArrowRight, CheckCircle2, XCircle, Clock, AlertCircle,
  ChevronDown, ChevronUp, ChevronLeft, ChevronRight,
} from 'lucide-react';
import { api, mensagemDeErro } from '../api/client.js';
import { useAuth } from '../context/AuthContext.jsx';
import CampoComprovante from '../components/CampoComprovante.jsx';

/**
 * Sócios & Lucros — Sprint 5.
 *
 * Página principal para acompanhar pró-labore, distribuições de lucros
 * e aportes. Estrutura:
 *
 *   1. Header com seletor de ano + botão imprimir
 *   2. Cards de totais do ano
 *   3. Tabela "Por sócio" (cada linha leva ao extrato individual)
 *   4. Seção Distribuições (lista + Nova)
 *   5. Seção Pró-labore (lista + Registrar)
 *   6. Seção Aportes (lista + Registrar)
 *
 * Leitura: todos os autenticados.
 * Escrita: admin.
 */

function formatarBRL(n) {
  return Number(n ?? 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}
function formatarPct(n, casas = 2) {
  if (n === null || n === undefined) return '—';
  return `${Number(n).toFixed(casas).replace('.', ',')}%`;
}
function formatarData(d) {
  if (!d) return '—';
  try { return new Date(d).toLocaleDateString('pt-BR'); } catch { return '—'; }
}
function formatarMes(d) {
  if (!d) return '—';
  try {
    const dt = new Date(String(d).slice(0, 10) + 'T12:00:00');
    return dt.toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' });
  } catch { return '—'; }
}

const FORMAS_PAGAMENTO = [
  { valor: 'pix', rotulo: 'PIX' },
  { valor: 'ted', rotulo: 'TED' },
  { valor: 'boleto', rotulo: 'Boleto' },
  { valor: 'dinheiro', rotulo: 'Dinheiro' },
  { valor: 'debito_automatico', rotulo: 'Débito automático' },
  { valor: 'cartao', rotulo: 'Cartão' },
  { valor: 'outro', rotulo: 'Outro' },
];

const anoAtual = new Date().getFullYear();

export default function Lucros() {
  const { pessoa } = useAuth();
  const admin = !!pessoa?.administrador;

  const [ano, setAno] = useState(anoAtual);
  const [resumo, setResumo] = useState(null);
  const [distribuicoes, setDistribuicoes] = useState([]);
  const [proLabores, setProLabores] = useState([]);
  const [aportes, setAportes] = useState([]);
  const [socios, setSocios] = useState([]);
  const [contas, setContas] = useState([]);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState('');

  // Sprint 30 — gate de versão pra evitar race condition em mudanças rápidas
  // de ano + operações (efetivar/cancelar movimento).
  const carregaIdRef = useRef(0);

  // Estado dos modais
  const [modal, setModal] = useState(null);
  // modal: { tipo: 'novo_prolabore' | 'novo_aporte' | 'nova_distribuicao'
  //              | 'efetivar_movimento' | 'efetivar_distribuicao'
  //              | 'cancelar_movimento' | 'cancelar_distribuicao',
  //          contexto: {...} }

  async function carregarTudo() {
    const meuId = ++carregaIdRef.current;
    setCarregando(true);
    setErro('');
    try {
      const [resumoR, distR, proLR, aportesR, sociosR, contasR] = await Promise.all([
        api.get('/movimentos-socios/resumo', { params: { ano } }),
        api.get('/distribuicoes', { params: { ano } }),
        api.get('/movimentos-socios', { params: { ano, tipo: 'pro_labore' } }),
        api.get('/movimentos-socios', { params: { ano, tipo: 'aporte' } }),
        api.get('/socios'),
        api.get('/contas-bancarias'),
      ]);
      if (meuId !== carregaIdRef.current) return;
      setResumo(resumoR.data);
      setDistribuicoes(distR.data);
      setProLabores(proLR.data);
      setAportes(aportesR.data);
      setSocios(sociosR.data.filter((s) => s.ativo));
      setContas(contasR.data.filter((c) => c.ativo));
    } catch (err) {
      if (meuId === carregaIdRef.current) {
        setErro(mensagemDeErro(err, 'Não foi possível carregar a página de sócios & lucros.'));
      }
    } finally {
      if (meuId === carregaIdRef.current) {
        setCarregando(false);
      }
    }
  }

  useEffect(() => { carregarTudo(); /* eslint-disable-next-line */ }, [ano]);

  return (
    <div className="max-w-6xl">
      {/* Header */}
      <header className="mb-6 flex flex-wrap items-start justify-between gap-4 no-print">
        <div>
          <h1 className="text-2xl font-semibold text-slate-900">Sócios & Lucros</h1>
          <p className="mt-1 text-slate-600">
            Pró-labore, distribuições de lucros e aportes — por sócio e por ano.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <NavegadorAno ano={ano} setAno={setAno} />

          <button
            type="button"
            onClick={() => window.print()}
            className="inline-flex items-center gap-2 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-700 shadow-sm hover:bg-slate-50"
          >
            <Printer size={16} /> Imprimir / PDF
          </button>
        </div>
      </header>

      {/* Cabeçalho de impressão */}
      <header className="mb-6 hidden print-only">
        <div className="text-xs uppercase tracking-widest text-nexus-700">Gestão Nexus</div>
        <h1 className="mt-1 text-2xl font-semibold text-slate-900">
          Sócios & Lucros — {ano}
        </h1>
        <div className="mt-1 text-sm text-slate-600">
          Gerado em {new Date().toLocaleDateString('pt-BR')} por {pessoa?.nome ?? '—'}
        </div>
        <div className="mt-2 h-px bg-slate-300" />
      </header>

      {erro && (
        <div className="mb-4 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700 no-print">
          {erro}
        </div>
      )}

      {/* Cards de totais */}
      <section className="mb-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <CartaoTotal
          titulo="Pró-labore pago"
          valor={resumo?.totais.pro_labore.total_efetivado}
          subtitulo={`${resumo?.totais.pro_labore.qtd_efetivado ?? 0} pagamento${resumo?.totais.pro_labore.qtd_efetivado === 1 ? '' : 's'}`}
          previsto={resumo?.totais.pro_labore.total_previsto}
          icone={Wallet}
          cor="indigo"
          carregando={carregando}
        />
        <CartaoTotal
          titulo="Lucros distribuídos"
          valor={resumo?.totais.distribuicao.total_efetivado}
          subtitulo={`${resumo?.totais.distribuicao.qtd_efetivado ?? 0} movimento${resumo?.totais.distribuicao.qtd_efetivado === 1 ? '' : 's'}`}
          previsto={resumo?.totais.distribuicao.total_previsto}
          icone={PieIcon}
          cor="emerald"
          carregando={carregando}
        />
        <CartaoTotal
          titulo="Aportes recebidos"
          valor={resumo?.totais.aporte.total_efetivado}
          subtitulo={`${resumo?.totais.aporte.qtd_efetivado ?? 0} aporte${resumo?.totais.aporte.qtd_efetivado === 1 ? '' : 's'}`}
          previsto={resumo?.totais.aporte.total_previsto}
          icone={TrendingUp}
          cor="sky"
          carregando={carregando}
        />
        <CartaoTotal
          titulo="Total para sócios"
          valor={(resumo?.totais.pro_labore.total_efetivado ?? 0) + (resumo?.totais.distribuicao.total_efetivado ?? 0)}
          subtitulo="Pró-labore + distribuições"
          icone={Users}
          cor="nexus"
          carregando={carregando}
        />
      </section>

      {/* Tabela de sócios */}
      <SecaoTituloEBotao titulo="Por sócio" descricao={`Totais efetivados em ${ano}. Clique em um sócio para ver o extrato completo.`} />
      <div className="mb-8 overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
            <tr>
              <th className="px-4 py-3">Sócio</th>
              <th className="px-4 py-3">Participação</th>
              <th className="px-4 py-3 text-right">Pró-labore</th>
              <th className="px-4 py-3 text-right">Distribuições</th>
              <th className="px-4 py-3 text-right">Aportes</th>
              <th className="px-4 py-3 text-right">Total recebido</th>
              <th className="px-4 py-3 w-10"></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {carregando && (
              <tr><td colSpan={7} className="px-4 py-8 text-center text-slate-500">Carregando...</td></tr>
            )}
            {!carregando && (resumo?.por_socio ?? []).length === 0 && (
              <tr><td colSpan={7} className="px-4 py-8 text-center text-slate-500">
                Nenhum sócio ativo.
              </td></tr>
            )}
            {!carregando && (resumo?.por_socio ?? []).map((s) => (
              <tr key={s.socio_id} className="hover:bg-slate-50">
                <td className="px-4 py-3 font-medium text-slate-900">
                  <Link to={`/socios/${s.socio_id}/extrato?ano=${ano}`} className="hover:text-nexus-700">
                    {s.socio_nome}
                  </Link>
                </td>
                <td className="px-4 py-3 text-slate-600">
                  {s.percentual_participacao != null ? formatarPct(s.percentual_participacao) : '—'}
                </td>
                <td className="px-4 py-3 text-right tabular-nums text-slate-900">
                  {formatarBRL(s.pro_labore)}
                </td>
                <td className="px-4 py-3 text-right tabular-nums text-slate-900">
                  {formatarBRL(s.distribuicao)}
                </td>
                <td className="px-4 py-3 text-right tabular-nums text-slate-900">
                  {formatarBRL(s.aporte)}
                </td>
                <td className="px-4 py-3 text-right tabular-nums font-semibold text-slate-900">
                  {formatarBRL(s.total_recebido)}
                </td>
                <td className="px-4 py-3 text-right no-print">
                  <Link to={`/socios/${s.socio_id}/extrato?ano=${ano}`} className="inline-flex text-slate-400 hover:text-nexus-700">
                    <ArrowRight size={16} />
                  </Link>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Seção Distribuições */}
      <SecaoTituloEBotao
        titulo="Distribuições de lucros"
        descricao={`Rodadas de distribuição em ${ano}. Admin pode criar novas rodadas.`}
        botao={admin && (
          <button
            type="button"
            onClick={() => setModal({ tipo: 'nova_distribuicao' })}
            className="inline-flex items-center gap-2 rounded-lg bg-nexus-700 px-3 py-1.5 text-sm font-medium text-white hover:bg-nexus-800 no-print"
          >
            <Plus size={14} /> Nova distribuição
          </button>
        )}
      />
      <div className="mb-8 space-y-3">
        {carregando && <div className="text-sm text-slate-500">Carregando...</div>}
        {!carregando && distribuicoes.length === 0 && (
          <div className="rounded-xl border border-dashed border-slate-300 bg-white p-8 text-center text-sm text-slate-500">
            Nenhuma distribuição em {ano} ainda.
          </div>
        )}
        {!carregando && distribuicoes.map((d) => (
          <CartaoDistribuicao
            key={d.id}
            distribuicao={d}
            admin={admin}
            onEfetivar={() => setModal({ tipo: 'efetivar_distribuicao', contexto: d })}
            onCancelar={() => setModal({ tipo: 'cancelar_distribuicao', contexto: d })}
            onAtualizado={carregarTudo}
          />
        ))}
      </div>

      {/* Seção Pró-labore */}
      <SecaoTituloEBotao
        titulo="Pró-labore"
        descricao={`Pagamentos de pró-labore por sócio, referentes a ${ano}.`}
        botao={admin && (
          <button
            type="button"
            onClick={() => setModal({ tipo: 'novo_prolabore' })}
            className="inline-flex items-center gap-2 rounded-lg bg-nexus-700 px-3 py-1.5 text-sm font-medium text-white hover:bg-nexus-800 no-print"
          >
            <Plus size={14} /> Registrar pró-labore
          </button>
        )}
      />
      <div className="mb-8">
        <TabelaMovimentos
          movimentos={proLabores}
          carregando={carregando}
          admin={admin}
          colunaExtra="Referência"
          colunaExtraValor={(m) => formatarMes(m.referencia_mes)}
          vazioTexto="Nenhum pró-labore registrado neste ano."
          onEfetivar={(m) => setModal({ tipo: 'efetivar_movimento', contexto: m })}
          onCancelar={(m) => setModal({ tipo: 'cancelar_movimento', contexto: m })}
        />
      </div>

      {/* Seção Aportes */}
      <SecaoTituloEBotao
        titulo="Aportes dos sócios"
        descricao={`Dinheiro colocado pelos sócios na empresa em ${ano}.`}
        botao={admin && (
          <button
            type="button"
            onClick={() => setModal({ tipo: 'novo_aporte' })}
            className="inline-flex items-center gap-2 rounded-lg bg-nexus-700 px-3 py-1.5 text-sm font-medium text-white hover:bg-nexus-800 no-print"
          >
            <Plus size={14} /> Registrar aporte
          </button>
        )}
      />
      <div className="mb-8">
        <TabelaMovimentos
          movimentos={aportes}
          carregando={carregando}
          admin={admin}
          vazioTexto="Nenhum aporte registrado neste ano."
          onEfetivar={(m) => setModal({ tipo: 'efetivar_movimento', contexto: m })}
          onCancelar={(m) => setModal({ tipo: 'cancelar_movimento', contexto: m })}
        />
      </div>

      {/* Modais */}
      {modal?.tipo === 'novo_prolabore' && (
        <ModalMovimentoSocio
          tipo="pro_labore"
          socios={socios}
          onFechar={() => setModal(null)}
          onSalvo={() => { setModal(null); carregarTudo(); }}
        />
      )}
      {modal?.tipo === 'novo_aporte' && (
        <ModalMovimentoSocio
          tipo="aporte"
          socios={socios}
          onFechar={() => setModal(null)}
          onSalvo={() => { setModal(null); carregarTudo(); }}
        />
      )}
      {modal?.tipo === 'nova_distribuicao' && (
        <ModalNovaDistribuicao
          socios={socios}
          onFechar={() => setModal(null)}
          onSalvo={() => { setModal(null); carregarTudo(); }}
        />
      )}
      {modal?.tipo === 'efetivar_movimento' && (
        <ModalEfetivar
          titulo={`Efetivar ${modal.contexto.tipo === 'pro_labore' ? 'pró-labore' : 'aporte'}`}
          info={`${modal.contexto.socio_nome} · ${formatarBRL(modal.contexto.valor)}`}
          contas={contas}
          url={`/movimentos-socios/${modal.contexto.id}/efetivar`}
          comprovanteRecurso="movimentos-socios"
          comprovanteId={modal.contexto.id}
          comprovanteInicial={
            modal.contexto.comprovante_nome
              ? {
                  nome: modal.contexto.comprovante_nome,
                  tamanho: modal.contexto.comprovante_tamanho,
                  mime: modal.contexto.comprovante_mime,
                }
              : null
          }
          onFechar={() => setModal(null)}
          onSalvo={() => { setModal(null); carregarTudo(); }}
        />
      )}
      {modal?.tipo === 'efetivar_distribuicao' && (
        <ModalEfetivar
          titulo="Efetivar distribuição"
          info={`${modal.contexto.descricao} · ${formatarBRL(modal.contexto.valor_total)} (${modal.contexto.qtd_socios} sócios)`}
          contas={contas}
          url={`/distribuicoes/${modal.contexto.id}/efetivar`}
          onFechar={() => setModal(null)}
          onSalvo={() => { setModal(null); carregarTudo(); }}
        />
      )}
      {modal?.tipo === 'cancelar_movimento' && (
        <ModalCancelar
          titulo={`Cancelar ${modal.contexto.tipo === 'pro_labore' ? 'pró-labore' : 'aporte'}`}
          info={`${modal.contexto.socio_nome} · ${formatarBRL(modal.contexto.valor)}`}
          url={`/movimentos-socios/${modal.contexto.id}/cancelar`}
          onFechar={() => setModal(null)}
          onSalvo={() => { setModal(null); carregarTudo(); }}
        />
      )}
      {modal?.tipo === 'cancelar_distribuicao' && (
        <ModalCancelar
          titulo="Cancelar distribuição"
          info={`${modal.contexto.descricao} · ${formatarBRL(modal.contexto.valor_total)}`}
          url={`/distribuicoes/${modal.contexto.id}/cancelar`}
          onFechar={() => setModal(null)}
          onSalvo={() => { setModal(null); carregarTudo(); }}
        />
      )}
    </div>
  );
}

/* ========== Componentes auxiliares ========== */

function NavegadorAno({ ano, setAno }) {
  return (
    <div className="inline-flex items-center gap-1 rounded-lg border border-slate-300 bg-white shadow-sm">
      <button
        type="button"
        onClick={() => setAno(ano - 1)}
        className="rounded-l-lg p-2 text-slate-600 hover:bg-slate-100"
        title="Ano anterior"
      ><ChevronLeft size={16} /></button>
      <div className="px-3 py-2 text-sm font-medium text-slate-900 tabular-nums">{ano}</div>
      <button
        type="button"
        onClick={() => setAno(ano + 1)}
        disabled={ano >= anoAtual + 1}
        className="rounded-r-lg p-2 text-slate-600 hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-30"
        title="Próximo ano"
      ><ChevronRight size={16} /></button>
    </div>
  );
}

function SecaoTituloEBotao({ titulo, descricao, botao }) {
  return (
    <div className="mb-3 flex flex-wrap items-end justify-between gap-2">
      <div>
        <h2 className="text-base font-semibold text-slate-900">{titulo}</h2>
        {descricao && <p className="mt-0.5 text-xs text-slate-500">{descricao}</p>}
      </div>
      {botao}
    </div>
  );
}

function CartaoTotal({ titulo, valor, subtitulo, previsto, icone: Icone, cor = 'slate', carregando }) {
  const cores = {
    slate:   { iconeBg: 'bg-slate-100',   iconeTxt: 'text-slate-600' },
    nexus:   { iconeBg: 'bg-nexus-100',   iconeTxt: 'text-nexus-700' },
    indigo:  { iconeBg: 'bg-indigo-100',  iconeTxt: 'text-indigo-700' },
    emerald: { iconeBg: 'bg-emerald-100', iconeTxt: 'text-emerald-700' },
    sky:     { iconeBg: 'bg-sky-100',     iconeTxt: 'text-sky-700' },
  }[cor];
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
      <div className="flex items-start gap-3">
        <div className={`rounded-lg p-2 ${cores.iconeBg} ${cores.iconeTxt}`}>
          <Icone size={16} />
        </div>
        <div className="flex-1 min-w-0">
          <div className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">{titulo}</div>
          <div className="mt-0.5 text-xl font-semibold tabular-nums text-slate-900">
            {carregando ? (
              <span className="inline-block h-5 w-24 animate-pulse rounded bg-slate-200" />
            ) : formatarBRL(valor)}
          </div>
          {!carregando && subtitulo && <div className="mt-1 text-xs text-slate-600">{subtitulo}</div>}
          {!carregando && previsto > 0 && (
            <div className="mt-1 text-[11px] text-amber-700">
              <Clock size={10} className="inline" /> previsto: {formatarBRL(previsto)}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function BadgeStatus({ status }) {
  const config = {
    previsto:   { cor: 'bg-amber-100 text-amber-700',   rotulo: 'Previsto',  Icone: Clock },
    efetivado:  { cor: 'bg-emerald-100 text-emerald-700', rotulo: 'Efetivado', Icone: CheckCircle2 },
    cancelado:  { cor: 'bg-slate-200 text-slate-600',     rotulo: 'Cancelado', Icone: XCircle },
    prevista:   { cor: 'bg-amber-100 text-amber-700',   rotulo: 'Prevista',  Icone: Clock },
    efetivada:  { cor: 'bg-emerald-100 text-emerald-700', rotulo: 'Efetivada', Icone: CheckCircle2 },
    cancelada:  { cor: 'bg-slate-200 text-slate-600',     rotulo: 'Cancelada', Icone: XCircle },
  }[status] ?? { cor: 'bg-slate-100 text-slate-600', rotulo: status, Icone: AlertCircle };
  const I = config.Icone;
  return (
    <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide ${config.cor}`}>
      <I size={10} /> {config.rotulo}
    </span>
  );
}

function TabelaMovimentos({ movimentos, carregando, admin, colunaExtra, colunaExtraValor, vazioTexto, onEfetivar, onCancelar }) {
  return (
    <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
      <table className="w-full text-sm">
        <thead className="bg-slate-50 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
          <tr>
            <th className="px-4 py-3">Sócio / Descrição</th>
            {colunaExtra && <th className="px-4 py-3">{colunaExtra}</th>}
            <th className="px-4 py-3">Data</th>
            <th className="px-4 py-3">Status</th>
            <th className="px-4 py-3 text-right">Valor</th>
            {admin && <th className="px-4 py-3 w-32 text-right no-print">Ações</th>}
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {carregando && (
            <tr><td colSpan={admin ? 6 : 5} className="px-4 py-8 text-center text-slate-500">Carregando...</td></tr>
          )}
          {!carregando && movimentos.length === 0 && (
            <tr><td colSpan={admin ? 6 : 5} className="px-4 py-8 text-center text-slate-500">{vazioTexto}</td></tr>
          )}
          {!carregando && movimentos.map((m) => (
            <tr key={m.id}>
              <td className="px-4 py-3">
                <div className="font-medium text-slate-900">{m.socio_nome}</div>
                <div className="text-xs text-slate-500">{m.descricao}</div>
              </td>
              {colunaExtra && <td className="px-4 py-3 text-xs text-slate-600 capitalize">{colunaExtraValor(m)}</td>}
              <td className="px-4 py-3 text-xs text-slate-600 whitespace-nowrap">
                {formatarData(m.data_efetivada ?? m.data_prevista)}
                {m.data_efetivada == null && m.data_prevista && (
                  <div className="text-[10px] text-slate-400">previsto</div>
                )}
              </td>
              <td className="px-4 py-3"><BadgeStatus status={m.status} /></td>
              <td className="px-4 py-3 text-right tabular-nums font-medium text-slate-900">
                {formatarBRL(m.valor)}
              </td>
              {admin && (
                <td className="px-4 py-3 text-right no-print">
                  {m.status === 'previsto' && (
                    <div className="flex justify-end gap-1">
                      <button
                        type="button"
                        onClick={() => onEfetivar(m)}
                        className="rounded border border-emerald-200 bg-emerald-50 px-2 py-1 text-xs text-emerald-700 hover:bg-emerald-100"
                      >Efetivar</button>
                      <button
                        type="button"
                        onClick={() => onCancelar(m)}
                        className="rounded border border-slate-200 bg-white px-2 py-1 text-xs text-slate-600 hover:bg-slate-50"
                      >Cancelar</button>
                    </div>
                  )}
                </td>
              )}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function CartaoDistribuicao({ distribuicao: d, admin, onEfetivar, onCancelar }) {
  const [aberto, setAberto] = useState(false);
  const [movimentos, setMovimentos] = useState(null);
  const [carregando, setCarregando] = useState(false);

  async function carregarMovimentos() {
    if (movimentos !== null) { setAberto((v) => !v); return; }
    setCarregando(true);
    try {
      const r = await api.get(`/distribuicoes/${d.id}`);
      setMovimentos(r.data.movimentos || []);
      setAberto(true);
    } catch {
      setMovimentos([]);
      setAberto(true);
    } finally {
      setCarregando(false);
    }
  }

  return (
    <div className="rounded-xl border border-slate-200 bg-white shadow-sm">
      <div className="flex flex-wrap items-start justify-between gap-3 p-4">
        <div className="flex-1 min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-medium text-slate-900">{d.descricao}</span>
            <BadgeStatus status={d.status} />
            {d.referencia_periodo && (
              <span className="text-xs text-slate-500">· {d.referencia_periodo}</span>
            )}
          </div>
          <div className="mt-1 text-xs text-slate-500">
            {d.qtd_socios} sócios · Prevista {formatarData(d.data_prevista)}
            {d.data_efetivada && <> · Efetivada {formatarData(d.data_efetivada)}</>}
          </div>
        </div>

        <div className="flex items-center gap-4">
          <div className="text-right">
            <div className="text-[10px] uppercase tracking-wide text-slate-500">Total</div>
            <div className="text-lg font-semibold tabular-nums text-slate-900">
              {formatarBRL(d.valor_total)}
            </div>
          </div>

          <div className="flex items-center gap-1 no-print">
            {admin && d.status === 'prevista' && (
              <>
                <button
                  type="button"
                  onClick={onEfetivar}
                  className="rounded border border-emerald-200 bg-emerald-50 px-2 py-1 text-xs text-emerald-700 hover:bg-emerald-100"
                >Efetivar</button>
                <button
                  type="button"
                  onClick={onCancelar}
                  className="rounded border border-slate-200 bg-white px-2 py-1 text-xs text-slate-600 hover:bg-slate-50"
                >Cancelar</button>
              </>
            )}
            <button
              type="button"
              onClick={carregarMovimentos}
              disabled={carregando}
              className="rounded p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700 disabled:opacity-50"
              title={aberto ? 'Fechar detalhes' : 'Ver detalhes'}
            >
              {aberto ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
            </button>
          </div>
        </div>
      </div>

      {aberto && movimentos && (
        <div className="border-t border-slate-100 p-4">
          <div className="text-xs font-semibold uppercase tracking-wide text-slate-500 mb-2">
            Divisão por sócio
          </div>
          <table className="w-full text-sm">
            <tbody className="divide-y divide-slate-100">
              {movimentos.map((m) => (
                <tr key={m.id}>
                  <td className="py-2 font-medium text-slate-900">{m.socio_nome}</td>
                  <td className="py-2 text-xs text-slate-500">
                    {m.socio_percentual != null ? formatarPct(m.socio_percentual) : '—'}
                  </td>
                  <td className="py-2"><BadgeStatus status={m.status} /></td>
                  <td className="py-2 text-right tabular-nums font-medium text-slate-900">
                    {formatarBRL(m.valor)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

/* ========== Modais ========== */

function ModalBase({ titulo, onFechar, children }) {
  return (
    <div className="fixed inset-0 z-40 flex items-end justify-center bg-slate-900/50 p-2 sm:items-center sm:p-4 no-print">
      <div className="w-full max-w-lg rounded-t-2xl bg-white shadow-xl sm:rounded-2xl max-h-[90vh] overflow-y-auto">
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

function Campo({ rotulo, children, hint }) {
  return (
    <label className="block mb-3">
      <span className="block text-xs font-medium text-slate-700 mb-1">{rotulo}</span>
      {children}
      {hint && <span className="block text-[11px] text-slate-500 mt-0.5">{hint}</span>}
    </label>
  );
}

const inputCls = 'w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-nexus-500 focus:ring-1 focus:ring-nexus-500';

function ModalMovimentoSocio({ tipo, socios, onFechar, onSalvo }) {
  const [socioId, setSocioId] = useState(socios[0]?.id || '');
  const [descricao, setDescricao] = useState(tipo === 'pro_labore' ? 'Pró-labore' : 'Aporte');
  const [valor, setValor] = useState('');
  const [dataPrevista, setDataPrevista] = useState(new Date().toISOString().slice(0, 10));
  const [referenciaMes, setReferenciaMes] = useState(
    new Date().toISOString().slice(0, 7),
  );
  const [observacao, setObservacao] = useState('');
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState('');

  async function submeter(e) {
    e.preventDefault();
    setErro('');
    setSalvando(true);
    try {
      const body = {
        socio_id: socioId,
        tipo,
        descricao,
        valor: Number(valor),
        data_prevista: dataPrevista,
        observacao: observacao || null,
      };
      if (tipo === 'pro_labore') body.referencia_mes = referenciaMes;
      await api.post('/movimentos-socios', body);
      onSalvo();
    } catch (err) {
      setErro(mensagemDeErro(err, 'Não foi possível registrar.'));
    } finally {
      setSalvando(false);
    }
  }

  return (
    <ModalBase
      titulo={tipo === 'pro_labore' ? 'Registrar pró-labore' : 'Registrar aporte'}
      onFechar={onFechar}
    >
      <form onSubmit={submeter}>
        <Campo rotulo="Sócio">
          <select className={inputCls} value={socioId} onChange={(e) => setSocioId(e.target.value)} required>
            {socios.map((s) => (
              <option key={s.id} value={s.id}>{s.nome}</option>
            ))}
          </select>
        </Campo>

        <Campo rotulo="Descrição">
          <input className={inputCls} value={descricao} onChange={(e) => setDescricao(e.target.value)} maxLength={255} required />
        </Campo>

        <Campo rotulo="Valor (R$)">
          <input
            className={inputCls} type="number" step="0.01" min="0.01"
            value={valor} onChange={(e) => setValor(e.target.value)} required
          />
        </Campo>

        <Campo rotulo="Data prevista">
          <input className={inputCls} type="date" value={dataPrevista} onChange={(e) => setDataPrevista(e.target.value)} required />
        </Campo>

        {tipo === 'pro_labore' && (
          <Campo rotulo="Mês de referência" hint="Ex: pró-labore de outubro pago em 05/nov → outubro.">
            <input className={inputCls} type="month" value={referenciaMes} onChange={(e) => setReferenciaMes(e.target.value)} required />
          </Campo>
        )}

        <Campo rotulo="Observação (opcional)">
          <textarea className={inputCls} rows={2} value={observacao} onChange={(e) => setObservacao(e.target.value)} maxLength={2000} />
        </Campo>

        {erro && <div className="mb-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{erro}</div>}

        <div className="flex items-center justify-end gap-2 mt-4">
          <button type="button" onClick={onFechar}
            className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
          >Cancelar</button>
          <button type="submit" disabled={salvando}
            className="rounded-lg bg-nexus-700 px-4 py-2 text-sm font-medium text-white hover:bg-nexus-800 disabled:opacity-50"
          >{salvando ? 'Salvando...' : 'Registrar como previsto'}</button>
        </div>
      </form>
    </ModalBase>
  );
}

function ModalNovaDistribuicao({ socios, onFechar, onSalvo }) {
  const [descricao, setDescricao] = useState('');
  const [referencia, setReferencia] = useState('');
  const [valorTotal, setValorTotal] = useState('');
  const [dataPrevista, setDataPrevista] = useState(new Date().toISOString().slice(0, 10));
  const [observacao, setObservacao] = useState('');
  const [usarSugestao, setUsarSugestao] = useState(true);
  const [splits, setSplits] = useState(() =>
    socios.map((s) => ({ socio_id: s.id, socio_nome: s.nome, percentual: s.percentual_participacao, valor: 0 })),
  );
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState('');

  // Calcula automaticamente o split quando usarSugestao=true e valor muda.
  const splitsCalculados = useMemo(() => {
    const total = Number(valorTotal) || 0;
    if (!usarSugestao) return splits;
    const somaPct = splits.reduce((a, s) => a + Number(s.percentual ?? 0), 0);
    if (somaPct <= 0) {
      const fatia = Math.floor((total * 100) / splits.length) / 100;
      return splits.map((s, i) => ({
        ...s,
        valor: i === splits.length - 1
          ? Number((total - fatia * (splits.length - 1)).toFixed(2))
          : fatia,
      }));
    }
    let acum = 0;
    return splits.map((s, i) => {
      const pct = Number(s.percentual ?? 0);
      if (i === splits.length - 1) {
        return { ...s, valor: Number((total - acum).toFixed(2)) };
      }
      const v = Math.floor((total * pct / somaPct) * 100) / 100;
      acum += v;
      return { ...s, valor: v };
    });
  // eslint-disable-next-line
  }, [valorTotal, usarSugestao, splits.length]);

  function atualizarValorIndividual(socioId, novoValor) {
    setUsarSugestao(false);
    setSplits((atuais) =>
      atuais.map((s) => (s.socio_id === socioId ? { ...s, valor: Number(novoValor) } : s)),
    );
  }

  const splitsFinais = usarSugestao ? splitsCalculados : splits;
  const somaSplits = splitsFinais.reduce((a, s) => a + Number(s.valor ?? 0), 0);
  const diferenca = Number(valorTotal) - somaSplits;

  async function submeter(e) {
    e.preventDefault();
    setErro('');

    // Validação local — evita pedir ao backend pra explicar
    if (Math.abs(diferenca) > 0.01) {
      setErro(`A soma dos valores (${formatarBRL(somaSplits)}) não bate com o total (${formatarBRL(Number(valorTotal))}). Diferença: ${formatarBRL(diferenca)}.`);
      return;
    }

    setSalvando(true);
    try {
      const body = {
        descricao,
        referencia_periodo: referencia || null,
        valor_total: Number(valorTotal),
        data_prevista: dataPrevista,
        observacao: observacao || null,
        splits: splitsFinais.map((s) => ({ socio_id: s.socio_id, valor: Number(s.valor) })),
      };
      await api.post('/distribuicoes', body);
      onSalvo();
    } catch (err) {
      setErro(mensagemDeErro(err, 'Não foi possível criar a distribuição.'));
    } finally {
      setSalvando(false);
    }
  }

  return (
    <ModalBase titulo="Nova distribuição de lucros" onFechar={onFechar}>
      <form onSubmit={submeter}>
        <Campo rotulo="Descrição">
          <input className={inputCls} value={descricao} onChange={(e) => setDescricao(e.target.value)} maxLength={255} required
            placeholder="Ex: Distribuição 3º trimestre 2025" />
        </Campo>

        <div className="grid grid-cols-2 gap-3">
          <Campo rotulo="Período (opcional)">
            <input className={inputCls} value={referencia} onChange={(e) => setReferencia(e.target.value)} maxLength={50}
              placeholder="Ex: 3T 2025" />
          </Campo>
          <Campo rotulo="Data prevista">
            <input className={inputCls} type="date" value={dataPrevista} onChange={(e) => setDataPrevista(e.target.value)} required />
          </Campo>
        </div>

        <Campo rotulo="Valor total (R$)">
          <input className={inputCls} type="number" step="0.01" min="0.01"
            value={valorTotal}
            onChange={(e) => { setValorTotal(e.target.value); setUsarSugestao(true); }}
            required />
        </Campo>

        <div className="mb-3">
          <div className="mb-2 flex items-center justify-between">
            <div className="text-xs font-medium text-slate-700">Divisão por sócio</div>
            {!usarSugestao && (
              <button
                type="button"
                onClick={() => setUsarSugestao(true)}
                className="text-[11px] text-nexus-700 hover:underline"
              >Recalcular por participação</button>
            )}
          </div>
          <div className="rounded-lg border border-slate-200">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 text-left text-[10px] font-semibold uppercase text-slate-500">
                <tr>
                  <th className="px-3 py-2">Sócio</th>
                  <th className="px-3 py-2">%</th>
                  <th className="px-3 py-2 text-right">Valor (R$)</th>
                </tr>
              </thead>
              <tbody>
                {splitsFinais.map((s) => (
                  <tr key={s.socio_id} className="border-t border-slate-100">
                    <td className="px-3 py-2 text-slate-900">{s.socio_nome}</td>
                    <td className="px-3 py-2 text-xs text-slate-600">
                      {s.percentual != null ? formatarPct(s.percentual) : '—'}
                    </td>
                    <td className="px-3 py-2 text-right">
                      <input
                        type="number" step="0.01" min="0"
                        className="w-28 rounded border border-slate-300 px-2 py-1 text-right text-sm tabular-nums focus:border-nexus-500 focus:ring-1 focus:ring-nexus-500"
                        value={s.valor ?? 0}
                        onChange={(e) => atualizarValorIndividual(s.socio_id, e.target.value)}
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot className="bg-slate-50">
                <tr>
                  <td colSpan={2} className="px-3 py-2 text-xs font-medium text-slate-600">Soma</td>
                  <td className={`px-3 py-2 text-right text-sm tabular-nums ${Math.abs(diferenca) > 0.01 ? 'text-red-700 font-semibold' : 'text-slate-900 font-medium'}`}>
                    {formatarBRL(somaSplits)}
                    {Math.abs(diferenca) > 0.01 && (
                      <div className="text-[10px] font-normal">
                        {diferenca > 0 ? 'Falta' : 'Excede'}: {formatarBRL(Math.abs(diferenca))}
                      </div>
                    )}
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>
        </div>

        <Campo rotulo="Observação (opcional)">
          <textarea className={inputCls} rows={2} value={observacao} onChange={(e) => setObservacao(e.target.value)} maxLength={2000} />
        </Campo>

        {erro && <div className="mb-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{erro}</div>}

        <div className="flex items-center justify-end gap-2 mt-4">
          <button type="button" onClick={onFechar}
            className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
          >Cancelar</button>
          <button type="submit" disabled={salvando}
            className="rounded-lg bg-nexus-700 px-4 py-2 text-sm font-medium text-white hover:bg-nexus-800 disabled:opacity-50"
          >{salvando ? 'Criando...' : 'Criar como prevista'}</button>
        </div>
      </form>
    </ModalBase>
  );
}

function ModalEfetivar({ titulo, info, contas, url, onFechar, onSalvo, comprovanteRecurso, comprovanteId, comprovanteInicial }) {
  const [dataEfetivada, setDataEfetivada] = useState(new Date().toISOString().slice(0, 10));
  const [contaId, setContaId] = useState('');
  const [formaPagamento, setFormaPagamento] = useState('');
  const [observacao, setObservacao] = useState('');
  const [comprovanteAnexo, setComprovanteAnexo] = useState(comprovanteInicial ?? null);
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState('');

  async function submeter(e) {
    e.preventDefault();
    setErro('');
    setSalvando(true);
    try {
      await api.post(url, {
        data_efetivada: dataEfetivada,
        conta_bancaria_id: contaId || null,
        forma_pagamento: formaPagamento || null,
        observacao: observacao || null,
      });
      onSalvo();
    } catch (err) {
      setErro(mensagemDeErro(err, 'Não foi possível efetivar.'));
    } finally {
      setSalvando(false);
    }
  }

  return (
    <ModalBase titulo={titulo} onFechar={onFechar}>
      <div className="mb-3 rounded-lg bg-slate-50 px-3 py-2 text-sm text-slate-700">{info}</div>
      <form onSubmit={submeter}>
        <Campo rotulo="Data efetivada">
          <input className={inputCls} type="date" value={dataEfetivada} onChange={(e) => setDataEfetivada(e.target.value)} required />
        </Campo>

        <Campo rotulo="Conta bancária (opcional)" hint="Se informada, o saldo da conta é ajustado automaticamente.">
          <select className={inputCls} value={contaId} onChange={(e) => setContaId(e.target.value)}>
            <option value="">— Não ajustar saldo —</option>
            {contas.map((c) => (
              <option key={c.id} value={c.id}>{c.apelido || c.banco_nome}</option>
            ))}
          </select>
        </Campo>

        <Campo rotulo="Forma de pagamento (opcional)">
          <select className={inputCls} value={formaPagamento} onChange={(e) => setFormaPagamento(e.target.value)}>
            <option value="">—</option>
            {FORMAS_PAGAMENTO.map((f) => (
              <option key={f.valor} value={f.valor}>{f.rotulo}</option>
            ))}
          </select>
        </Campo>

        <Campo rotulo="Observação (opcional)">
          <textarea className={inputCls} rows={2} value={observacao} onChange={(e) => setObservacao(e.target.value)} maxLength={2000} />
        </Campo>

        {comprovanteRecurso && comprovanteId && (
          <Campo rotulo="Anexar comprovante" hint="PDF ou imagem do banco. Sai junto no extrato impresso.">
            <CampoComprovante
              recurso={comprovanteRecurso}
              id={comprovanteId}
              comprovante={comprovanteAnexo}
              podeEditar
              aoMudar={setComprovanteAnexo}
            />
          </Campo>
        )}

        {erro && <div className="mb-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{erro}</div>}

        <div className="flex items-center justify-end gap-2 mt-4">
          <button type="button" onClick={onFechar}
            className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
          >Cancelar</button>
          <button type="submit" disabled={salvando}
            className="rounded-lg bg-emerald-700 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-800 disabled:opacity-50"
          >{salvando ? 'Efetivando...' : 'Efetivar'}</button>
        </div>
      </form>
    </ModalBase>
  );
}

function ModalCancelar({ titulo, info, url, onFechar, onSalvo }) {
  const [motivo, setMotivo] = useState('');
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState('');

  async function submeter(e) {
    e.preventDefault();
    setErro('');
    setSalvando(true);
    try {
      await api.post(url, { motivo_cancelamento: motivo });
      onSalvo();
    } catch (err) {
      setErro(mensagemDeErro(err, 'Não foi possível cancelar.'));
    } finally {
      setSalvando(false);
    }
  }

  return (
    <ModalBase titulo={titulo} onFechar={onFechar}>
      <div className="mb-3 rounded-lg bg-slate-50 px-3 py-2 text-sm text-slate-700">{info}</div>
      <form onSubmit={submeter}>
        <Campo rotulo="Motivo do cancelamento" hint="Fica no histórico. Mínimo 3 caracteres.">
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
          >{salvando ? 'Cancelando...' : 'Cancelar'}</button>
        </div>
      </form>
    </ModalBase>
  );
}
