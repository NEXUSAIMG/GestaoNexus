import { useEffect, useState } from 'react';
import { useParams, useSearchParams, Link } from 'react-router-dom';
import {
  ArrowLeft, Printer, User, Wallet, PieChart, TrendingUp,
  CheckCircle2, Clock, ChevronLeft, ChevronRight,
} from 'lucide-react';
import { api, mensagemDeErro } from '../api/client.js';
import { useAuth } from '../context/AuthContext.jsx';

/**
 * Extrato de um sócio — Sprint 5.
 *
 * Visão consolidada de um sócio específico num ano:
 *   - Cabeçalho com identificação (nome, documento, %, data de entrada)
 *   - Cards de totais: pró-labore, distribuições, aportes
 *   - Timeline completa dos movimentos do ano
 *
 * Pensada para impressão (comprovante para IR, por exemplo). Usa o CSS
 * @media print da Sprint 4 — classes .no-print e .print-only.
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
function formatarDocumento(doc, tipo) {
  if (!doc) return '—';
  const s = String(doc).replace(/\D/g, '');
  if (tipo === 'pj' || s.length === 14) {
    // CNPJ
    return s.replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/, '$1.$2.$3/$4-$5');
  }
  // CPF
  return s.replace(/^(\d{3})(\d{3})(\d{3})(\d{2})$/, '$1.$2.$3-$4');
}

const ROTULO_TIPO = {
  pro_labore: 'Pró-labore',
  distribuicao: 'Distribuição de lucros',
  aporte: 'Aporte',
};

const COR_TIPO_CLASSES = {
  pro_labore:   'bg-indigo-100 text-indigo-700',
  distribuicao: 'bg-emerald-100 text-emerald-700',
  aporte:       'bg-sky-100 text-sky-700',
};

const anoAtual = new Date().getFullYear();

export default function ExtratoSocio() {
  const { id } = useParams();
  const { pessoa } = useAuth();
  const [searchParams, setSearchParams] = useSearchParams();

  const anoParam = Number(searchParams.get('ano')) || anoAtual;
  const [ano, setAno] = useState(anoParam);
  const [dados, setDados] = useState(null);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState('');

  function mudarAno(novo) {
    setAno(novo);
    setSearchParams({ ano: String(novo) });
  }

  async function carregar() {
    setCarregando(true);
    setErro('');
    try {
      const r = await api.get(`/socios/${id}/extrato`, { params: { ano } });
      setDados(r.data);
    } catch (err) {
      setErro(mensagemDeErro(err, 'Não foi possível carregar o extrato.'));
    } finally {
      setCarregando(false);
    }
  }

  useEffect(() => { carregar(); /* eslint-disable-next-line */ }, [id, ano]);

  const socio = dados?.socio;
  const totais = dados?.totais;
  const movimentos = dados?.movimentos ?? [];
  const totalRecebido = (totais?.pro_labore?.efetivado ?? 0) + (totais?.distribuicao?.efetivado ?? 0);

  return (
    <div className="max-w-4xl">
      {/* Header (fora da impressão) */}
      <header className="mb-4 flex flex-wrap items-center justify-between gap-3 no-print">
        <Link to="/lucros" className="inline-flex items-center gap-1 text-sm text-slate-600 hover:text-nexus-700">
          <ArrowLeft size={14} /> Voltar para Sócios &amp; Lucros
        </Link>
        <div className="flex items-center gap-2">
          <div className="inline-flex items-center gap-1 rounded-lg border border-slate-300 bg-white shadow-sm">
            <button
              type="button"
              onClick={() => mudarAno(ano - 1)}
              className="rounded-l-lg p-2 text-slate-600 hover:bg-slate-100"
            ><ChevronLeft size={16} /></button>
            <div className="px-3 py-2 text-sm font-medium text-slate-900 tabular-nums">{ano}</div>
            <button
              type="button"
              onClick={() => mudarAno(ano + 1)}
              disabled={ano >= anoAtual + 1}
              className="rounded-r-lg p-2 text-slate-600 hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-30"
            ><ChevronRight size={16} /></button>
          </div>
          <button
            type="button"
            onClick={() => window.print()}
            className="inline-flex items-center gap-2 rounded-lg bg-nexus-700 px-4 py-2 text-sm font-medium text-white hover:bg-nexus-800"
          ><Printer size={16} /> Imprimir / PDF</button>
        </div>
      </header>

      {erro && (
        <div className="mb-4 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700 no-print">
          {erro}
        </div>
      )}

      {carregando ? (
        <div className="rounded-xl border border-slate-200 bg-white p-10 text-center text-sm text-slate-500 shadow-sm">
          Carregando extrato...
        </div>
      ) : !socio ? null : (
        <>
          {/* Cabeçalho impresso */}
          <header className="mb-6 hidden print-only">
            <div className="text-xs uppercase tracking-widest text-nexus-700">Gestão Ayio</div>
            <h1 className="mt-1 text-2xl font-semibold text-slate-900">
              Extrato do sócio — {ano}
            </h1>
            <div className="mt-1 text-sm text-slate-600">
              Gerado em {new Date().toLocaleDateString('pt-BR')} por {pessoa?.nome ?? '—'}
            </div>
            <div className="mt-2 h-px bg-slate-300" />
          </header>

          {/* Dados do sócio */}
          <section className="mb-6 rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div className="flex items-start gap-3">
                <div className="rounded-lg bg-nexus-100 p-2 text-nexus-700">
                  <User size={18} />
                </div>
                <div>
                  <h1 className="text-xl font-semibold text-slate-900 no-print">{socio.nome}</h1>
                  <h2 className="text-lg font-semibold text-slate-900 hidden print-only">{socio.nome}</h2>
                  <div className="mt-1 text-sm text-slate-600">
                    {socio.tipo_pessoa === 'pj' ? 'Pessoa Jurídica' : 'Pessoa Física'}
                    {socio.documento && <> · {formatarDocumento(socio.documento, socio.tipo_pessoa)}</>}
                    {socio.email && <> · {socio.email}</>}
                  </div>
                </div>
              </div>

              <div className="text-right">
                <div className="text-[10px] uppercase tracking-wide text-slate-500">Participação</div>
                <div className="text-xl font-semibold tabular-nums text-slate-900">
                  {formatarPct(socio.percentual_participacao)}
                </div>
                {socio.data_entrada && (
                  <div className="mt-1 text-xs text-slate-500">
                    Sócio desde {formatarData(socio.data_entrada)}
                  </div>
                )}
              </div>
            </div>
          </section>

          {/* Cards de totais do ano */}
          <section className="mb-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <CartaoExtrato
              titulo="Pró-labore"
              valor={totais?.pro_labore?.efetivado ?? 0}
              previsto={totais?.pro_labore?.previsto ?? 0}
              icone={Wallet}
              cor="indigo"
            />
            <CartaoExtrato
              titulo="Distribuições"
              valor={totais?.distribuicao?.efetivado ?? 0}
              previsto={totais?.distribuicao?.previsto ?? 0}
              icone={PieChart}
              cor="emerald"
            />
            <CartaoExtrato
              titulo="Aportes"
              valor={totais?.aporte?.efetivado ?? 0}
              previsto={totais?.aporte?.previsto ?? 0}
              icone={TrendingUp}
              cor="sky"
            />
            <CartaoExtrato
              titulo="Total recebido"
              valor={totalRecebido}
              subtitulo="Pró-labore + distribuições"
              icone={User}
              cor="nexus"
              destaque
            />
          </section>

          {/* Timeline de movimentos */}
          <section className="mb-6">
            <h2 className="mb-3 text-sm font-semibold text-slate-900">
              Movimentos do ano {movimentos.length > 0 && (
                <span className="text-xs font-normal text-slate-500">({movimentos.length})</span>
              )}
            </h2>

            <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white shadow-sm">
              <table className="w-full min-w-[38rem] text-sm">
                <thead className="bg-slate-50 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
                  <tr>
                    <th className="px-4 py-3">Tipo</th>
                    <th className="px-4 py-3">Descrição</th>
                    <th className="px-4 py-3">Referência</th>
                    <th className="px-4 py-3">Data</th>
                    <th className="px-4 py-3">Status</th>
                    <th className="px-4 py-3 text-right">Valor</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {movimentos.length === 0 && (
                    <tr><td colSpan={6} className="px-4 py-8 text-center text-slate-500">
                      Nenhum movimento em {ano}.
                    </td></tr>
                  )}
                  {movimentos.map((m) => (
                    <tr key={m.id}>
                      <td className="px-4 py-3">
                        <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-medium ${COR_TIPO_CLASSES[m.tipo] || 'bg-slate-100 text-slate-700'}`}>
                          {ROTULO_TIPO[m.tipo]}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <div className="font-medium text-slate-900">{m.descricao}</div>
                        {m.distribuicao_descricao && (
                          <div className="text-xs text-slate-500">{m.distribuicao_descricao}</div>
                        )}
                      </td>
                      <td className="px-4 py-3 text-xs text-slate-600 capitalize">
                        {m.referencia_mes ? formatarMes(m.referencia_mes) : '—'}
                      </td>
                      <td className="px-4 py-3 text-xs text-slate-600 whitespace-nowrap">
                        {m.status === 'efetivado' ? (
                          <>
                            <CheckCircle2 size={10} className="inline text-emerald-600" />{' '}
                            {formatarData(m.data_efetivada)}
                          </>
                        ) : (
                          <>
                            <Clock size={10} className="inline text-amber-600" />{' '}
                            {formatarData(m.data_prevista)}
                          </>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        <BadgeStatus status={m.status} />
                      </td>
                      <td className="px-4 py-3 text-right tabular-nums font-medium text-slate-900">
                        {m.tipo === 'aporte' ? '+' : ''}{formatarBRL(m.valor)}
                      </td>
                    </tr>
                  ))}
                </tbody>
                {movimentos.length > 0 && (
                  <tfoot className="bg-slate-50">
                    <tr>
                      <td colSpan={5} className="px-4 py-2 text-xs font-medium text-slate-600">
                        Total efetivado (pró-labore + distribuições)
                      </td>
                      <td className="px-4 py-2 text-right tabular-nums font-semibold text-slate-900">
                        {formatarBRL(totalRecebido)}
                      </td>
                    </tr>
                  </tfoot>
                )}
              </table>
            </div>
          </section>

          {/* Rodapé de impressão */}
          <footer className="hidden print-only mt-8 pt-4 border-t border-slate-300 text-[10px] text-slate-500">
            Gestão Ayio · Extrato de {socio.nome} em {ano} · Este documento tem caráter
            informativo interno. Para fins fiscais, consulte os comprovantes originais.
          </footer>
        </>
      )}
    </div>
  );
}

function CartaoExtrato({ titulo, valor, subtitulo, previsto, icone: Icone, cor = 'slate', destaque }) {
  const cores = {
    slate:   { iconeBg: 'bg-slate-100',   iconeTxt: 'text-slate-600' },
    nexus:   { iconeBg: 'bg-nexus-100',   iconeTxt: 'text-nexus-700' },
    indigo:  { iconeBg: 'bg-indigo-100',  iconeTxt: 'text-indigo-700' },
    emerald: { iconeBg: 'bg-emerald-100', iconeTxt: 'text-emerald-700' },
    sky:     { iconeBg: 'bg-sky-100',     iconeTxt: 'text-sky-700' },
  }[cor];
  return (
    <div className={`rounded-xl border p-4 shadow-sm ${destaque ? 'border-nexus-200 bg-nexus-50' : 'border-slate-200 bg-white'}`}>
      <div className="flex items-start gap-3">
        <div className={`rounded-lg p-2 ${cores.iconeBg} ${cores.iconeTxt}`}>
          <Icone size={16} />
        </div>
        <div className="flex-1 min-w-0">
          <div className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">{titulo}</div>
          <div className="mt-0.5 text-xl font-semibold tabular-nums text-slate-900">
            {formatarBRL(valor)}
          </div>
          {subtitulo && <div className="mt-1 text-xs text-slate-600">{subtitulo}</div>}
          {previsto > 0 && (
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
    previsto:  { cor: 'bg-amber-100 text-amber-700',     rotulo: 'Previsto' },
    efetivado: { cor: 'bg-emerald-100 text-emerald-700', rotulo: 'Efetivado' },
    cancelado: { cor: 'bg-slate-200 text-slate-600',     rotulo: 'Cancelado' },
  }[status] ?? { cor: 'bg-slate-100 text-slate-600', rotulo: status };
  return (
    <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide ${config.cor}`}>
      {config.rotulo}
    </span>
  );
}
