import { useEffect, useMemo, useState } from 'react';
import {
  Plus, Edit2, Ban, X, Filter, UserCircle2, Briefcase, Shield,
  CheckCircle2, XCircle, FileText, Calendar, AlertTriangle, Clock,
} from 'lucide-react';
import { api, mensagemDeErro } from '../api/client.js';
import { useAuth } from '../context/AuthContext.jsx';

/**
 * CRUD de representações — Sprint 1.5.
 *
 * Uma representação liga uma pessoa de acesso a um sócio, indicando
 * com qual papel (titular / representante / procurador), quais poderes
 * e por qual vigência ela pode agir em nome daquele sócio.
 *
 * Regra fundamental:
 *   - Só pode existir UMA representação ATIVA entre a mesma pessoa e
 *     o mesmo sócio. Para trocar algo, você revoga a atual (com motivo)
 *     e cria uma nova. O histórico é preservado.
 */

const papeisInfo = {
  titular:       { rotulo: 'Titular',       icone: UserCircle2, descricao: 'É o próprio sócio.' },
  representante: { rotulo: 'Representante', icone: Briefcase,   descricao: 'Age em nome do sócio por vínculo legal (ex.: diretor de uma PJ sócia).' },
  procurador:    { rotulo: 'Procurador',    icone: Shield,      descricao: 'Age em nome do sócio por procuração específica.' },
};

const poderesInfo = [
  { chave: 'pode_ver_financeiro',        leitura: 'ver_financeiro',        rotulo: 'Ver financeiro' },
  { chave: 'pode_votar',                 leitura: 'votar',                 rotulo: 'Votar em decisões' },
  { chave: 'pode_aprovar_atas',          leitura: 'aprovar_atas',          rotulo: 'Aprovar atas' },
  { chave: 'pode_aprovar_distribuicoes', leitura: 'aprovar_distribuicoes', rotulo: 'Aprovar distribuições' },
];

function formatarData(d) {
  if (!d) return '—';
  try { return new Date(d).toLocaleDateString('pt-BR'); } catch { return '—'; }
}

/**
 * Uma representação pode estar com `ativo=true` no banco mas com `data_fim`
 * já no passado — o middleware de autenticação não a enxerga mais, mas
 * do ponto de vista operacional ela segue registrada. Marcamos como "expirada"
 * para o admin saber que precisa renovar a vigência ou revogar.
 */
function estaExpirada(r) {
  if (!r.ativo || !r.data_fim) return false;
  const hoje = new Date();
  hoje.setHours(0, 0, 0, 0);
  const fim = new Date(r.data_fim);
  return fim < hoje;
}

export default function Representacoes() {
  const { recarregar } = useAuth();
  const [representacoes, setRepresentacoes] = useState([]);
  const [pessoas, setPessoas] = useState([]);
  const [socios, setSocios] = useState([]);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState('');

  // Filtros locais (feitos no cliente para simplicidade)
  const [filtroPessoa, setFiltroPessoa] = useState('');
  const [filtroSocio, setFiltroSocio] = useState('');
  const [somenteAtivas, setSomenteAtivas] = useState(true);

  const [modal, setModal] = useState(null);
  // modal = { tipo: 'novo' | 'editar' | 'revogar', representacao?: {} }

  async function carregarTudo() {
    setCarregando(true);
    setErro('');
    try {
      const [resR, resP, resS] = await Promise.all([
        api.get('/representacoes'),
        api.get('/pessoas'),
        api.get('/socios'),
      ]);
      setRepresentacoes(resR.data);
      setPessoas(resP.data);
      setSocios(resS.data);
    } catch (err) {
      setErro(mensagemDeErro(err, 'Não foi possível carregar as representações.'));
    } finally {
      setCarregando(false);
    }
  }

  useEffect(() => { carregarTudo(); }, []);

  const filtradas = useMemo(() => {
    return representacoes.filter((r) => {
      if (somenteAtivas && !r.ativo) return false;
      if (filtroPessoa && r.pessoa_acesso_id !== filtroPessoa) return false;
      if (filtroSocio && r.socio_id !== filtroSocio) return false;
      return true;
    });
  }, [representacoes, filtroPessoa, filtroSocio, somenteAtivas]);

  const resumo = useMemo(() => ({
    total: representacoes.length,
    ativas: representacoes.filter((r) => r.ativo).length,
    revogadas: representacoes.filter((r) => !r.ativo).length,
  }), [representacoes]);

  return (
    <div className="max-w-6xl">
      <div className="flex flex-wrap items-start justify-between gap-4 mb-6">
        <div>
          <h1 className="text-2xl font-semibold text-slate-900">Representações</h1>
          <p className="mt-1 text-slate-600">
            Quem representa quem, com qual papel e quais poderes. Revogar mantém
            o registro histórico — não apaga.
          </p>
        </div>

        <button
          type="button"
          onClick={() => setModal({ tipo: 'novo' })}
          className="inline-flex items-center gap-2 rounded-lg bg-nexus-700 px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-nexus-800"
        >
          <Plus size={16} />
          Nova representação
        </button>
      </div>

      <div className="mb-6 grid gap-3 sm:grid-cols-3">
        <Cartao rotulo="Total registradas" valor={resumo.total} />
        <Cartao rotulo="Ativas" valor={resumo.ativas} destaque="emerald" />
        <Cartao rotulo="Revogadas" valor={resumo.revogadas} destaque="slate" />
      </div>

      {/* Filtros */}
      <div className="mb-4 rounded-xl border border-slate-200 bg-white p-3">
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-1.5 text-xs font-medium uppercase tracking-wide text-slate-500">
            <Filter size={13} />
            Filtros:
          </div>

          <select
            value={filtroPessoa}
            onChange={(e) => setFiltroPessoa(e.target.value)}
            className={selectClassesCompacto}
          >
            <option value="">Qualquer pessoa</option>
            {pessoas.map((p) => (
              <option key={p.id} value={p.id}>{p.nome}</option>
            ))}
          </select>

          <select
            value={filtroSocio}
            onChange={(e) => setFiltroSocio(e.target.value)}
            className={selectClassesCompacto}
          >
            <option value="">Qualquer sócio</option>
            {socios.map((s) => (
              <option key={s.id} value={s.id}>{s.nome}</option>
            ))}
          </select>

          <label className="inline-flex items-center gap-2 text-sm text-slate-700">
            <input
              type="checkbox"
              checked={somenteAtivas}
              onChange={(e) => setSomenteAtivas(e.target.checked)}
              className="h-4 w-4 rounded border-slate-300 text-nexus-700 focus:ring-nexus-500"
            />
            Só ativas
          </label>

          {(filtroPessoa || filtroSocio || !somenteAtivas) && (
            <button
              type="button"
              onClick={() => { setFiltroPessoa(''); setFiltroSocio(''); setSomenteAtivas(true); }}
              className="ml-auto text-xs text-slate-600 hover:text-slate-900 underline"
            >
              Limpar filtros
            </button>
          )}
        </div>
      </div>

      {erro && (
        <div className="mb-4 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
          {erro}
        </div>
      )}

      <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
            <tr>
              <th className="px-4 py-3">Pessoa</th>
              <th className="px-4 py-3">Sócio</th>
              <th className="px-4 py-3">Papel</th>
              <th className="px-4 py-3">Poderes</th>
              <th className="px-4 py-3">Vigência</th>
              <th className="px-4 py-3">Status</th>
              <th className="px-4 py-3"></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {carregando && (
              <tr><td colSpan={7} className="px-4 py-8 text-center text-slate-500">Carregando...</td></tr>
            )}
            {!carregando && filtradas.length === 0 && (
              <tr><td colSpan={7} className="px-4 py-8 text-center text-slate-500">
                Nenhuma representação {somenteAtivas ? 'ativa' : ''} com os filtros atuais.
              </td></tr>
            )}
            {!carregando && filtradas.map((r) => {
              const papelInfo = papeisInfo[r.papel] ?? papeisInfo.titular;
              const IconePapel = papelInfo.icone;
              return (
                <tr key={r.id} className={r.ativo ? '' : 'bg-slate-50/60 text-slate-500'}>
                  <td className="px-4 py-3">
                    <div className="font-medium text-slate-900">{r.pessoa_nome}</div>
                    <div className="text-xs text-slate-500">{r.pessoa_email}</div>
                  </td>
                  <td className="px-4 py-3">
                    <div className="font-medium text-slate-900">{r.socio_nome}</div>
                    <div className="text-xs text-slate-500">
                      {r.socio_tipo_pessoa === 'juridica' ? 'Pessoa jurídica' : 'Pessoa física'}
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    <span className="inline-flex items-center gap-1.5 rounded-full bg-nexus-50 px-2 py-0.5 text-xs font-medium text-nexus-800">
                      <IconePapel size={12} />
                      {papelInfo.rotulo}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <PoderesBadges poderes={r.poderes} />
                  </td>
                  <td className="px-4 py-3 text-xs text-slate-600 whitespace-nowrap">
                    <div className="flex items-center gap-1">
                      <Calendar size={11} className="text-slate-400" />
                      {formatarData(r.data_inicio)}
                    </div>
                    {r.data_fim && (
                      <div className="text-slate-400">até {formatarData(r.data_fim)}</div>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    {!r.ativo ? (
                      <span className="inline-flex items-center gap-1 text-xs text-slate-500" title={r.motivo_revogacao || ''}>
                        <XCircle size={14} /> Revogada
                      </span>
                    ) : estaExpirada(r) ? (
                      <span className="inline-flex items-center gap-1 text-xs text-amber-700" title={`Venceu em ${formatarData(r.data_fim)}`}>
                        <Clock size={14} /> Expirada
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 text-xs text-emerald-700">
                        <CheckCircle2 size={14} /> Ativa
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-right">
                    {r.ativo ? (
                      <div className="flex justify-end gap-1">
                        <button
                          type="button"
                          onClick={() => setModal({ tipo: 'editar', representacao: r })}
                          className="rounded-md p-1.5 text-slate-500 hover:bg-slate-100 hover:text-slate-700"
                          title="Editar"
                        >
                          <Edit2 size={15} />
                        </button>
                        <button
                          type="button"
                          onClick={() => setModal({ tipo: 'revogar', representacao: r })}
                          className="rounded-md p-1.5 text-red-500 hover:bg-red-50"
                          title="Revogar"
                        >
                          <Ban size={15} />
                        </button>
                      </div>
                    ) : r.documento_procuracao_url ? (
                      <a
                        href={r.documento_procuracao_url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1 text-xs text-slate-500 hover:text-slate-700"
                        title="Procuração anexada"
                      >
                        <FileText size={13} />
                      </a>
                    ) : null}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {modal?.tipo === 'novo' && (
        <ModalRepresentacao
          pessoas={pessoas}
          socios={socios}
          aoFechar={() => setModal(null)}
          aoSalvar={async (dados) => {
            await api.post('/representacoes', dados);
            setModal(null);
            await carregarTudo();
            // Se a mudança afetou a pessoa logada, o AuthContext pode estar stale.
            // recarregar() é barato e refresca o SeletorDeContexto e lista de poderes.
            recarregar();
          }}
        />
      )}

      {modal?.tipo === 'editar' && (
        <ModalRepresentacao
          representacao={modal.representacao}
          pessoas={pessoas}
          socios={socios}
          aoFechar={() => setModal(null)}
          aoSalvar={async (dados) => {
            await api.put(`/representacoes/${modal.representacao.id}`, dados);
            setModal(null);
            await carregarTudo();
            recarregar();
          }}
        />
      )}

      {modal?.tipo === 'revogar' && (
        <ModalRevogar
          representacao={modal.representacao}
          aoFechar={() => setModal(null)}
          aoConfirmar={async (motivo) => {
            await api.post(`/representacoes/${modal.representacao.id}/revogar`, {
              motivo_revogacao: motivo,
            });
            setModal(null);
            await carregarTudo();
            recarregar();
          }}
        />
      )}
    </div>
  );
}

function Cartao({ rotulo, valor, destaque }) {
  const cor = {
    emerald: 'text-emerald-700',
    slate: 'text-slate-500',
  }[destaque] ?? 'text-slate-900';
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
      <div className="text-xs font-medium uppercase tracking-wide text-slate-500">{rotulo}</div>
      <div className={`mt-1 text-2xl font-semibold tabular-nums ${cor}`}>{valor}</div>
    </div>
  );
}

function PoderesBadges({ poderes }) {
  // O backend sempre envia `poderes` no formato { ver_financeiro, votar,
  // aprovar_atas, aprovar_distribuicoes } (sem o prefixo `pode_`).
  const ativos = poderesInfo.filter((p) => poderes?.[p.leitura]);

  if (ativos.length === 0) {
    return <span className="text-xs text-slate-400">—</span>;
  }
  return (
    <div className="flex flex-wrap gap-1">
      {ativos.map((p) => (
        <span key={p.chave} className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-medium text-slate-700">
          {p.rotulo}
        </span>
      ))}
    </div>
  );
}

function ModalRepresentacao({ representacao, pessoas, socios, aoFechar, aoSalvar }) {
  const ehNovo = !representacao;

  const poderesIniciais = representacao?.poderes ?? {
    ver_financeiro: true, votar: false, aprovar_atas: false, aprovar_distribuicoes: false,
  };

  const [form, setForm] = useState({
    pessoa_acesso_id: representacao?.pessoa_acesso_id ?? '',
    socio_id: representacao?.socio_id ?? '',
    papel: representacao?.papel ?? 'representante',
    pode_ver_financeiro: !!poderesIniciais.ver_financeiro,
    pode_votar: !!poderesIniciais.votar,
    pode_aprovar_atas: !!poderesIniciais.aprovar_atas,
    pode_aprovar_distribuicoes: !!poderesIniciais.aprovar_distribuicoes,
    data_inicio: representacao?.data_inicio ? String(representacao.data_inicio).slice(0, 10) : '',
    data_fim: representacao?.data_fim ? String(representacao.data_fim).slice(0, 10) : '',
    documento_procuracao_url: representacao?.documento_procuracao_url ?? '',
    observacoes: representacao?.observacoes ?? '',
  });
  const [erro, setErro] = useState('');
  const [salvando, setSalvando] = useState(false);

  function atualizar(campo, valor) {
    setForm((f) => ({ ...f, [campo]: valor }));
  }

  async function enviar(e) {
    e.preventDefault();
    setErro('');
    setSalvando(true);
    try {
      const base = {
        papel: form.papel,
        pode_ver_financeiro: !!form.pode_ver_financeiro,
        pode_votar: !!form.pode_votar,
        pode_aprovar_atas: !!form.pode_aprovar_atas,
        pode_aprovar_distribuicoes: !!form.pode_aprovar_distribuicoes,
        data_inicio: form.data_inicio || null,
        data_fim: form.data_fim || null,
        documento_procuracao_url: form.documento_procuracao_url?.trim() || null,
        observacoes: form.observacoes?.trim() || null,
      };
      const payload = ehNovo
        ? {
            pessoa_acesso_id: form.pessoa_acesso_id,
            socio_id: form.socio_id,
            ...base,
          }
        : base;

      await aoSalvar(payload);
    } catch (err) {
      setErro(mensagemDeErro(err, 'Não foi possível salvar.'));
    } finally {
      setSalvando(false);
    }
  }

  const papelInfo = papeisInfo[form.papel];

  return (
    <Modal
      titulo={ehNovo ? 'Nova representação' : 'Editar representação'}
      aoFechar={aoFechar}
    >
      <form onSubmit={enviar} className="space-y-4">
        <div className="grid gap-4 sm:grid-cols-2">
          <Campo rotulo="Pessoa de acesso" obrigatorio ajuda={!ehNovo ? 'Não pode ser alterada. Revogue e crie outra se precisar trocar.' : null}>
            <select
              required
              disabled={!ehNovo}
              value={form.pessoa_acesso_id}
              onChange={(e) => atualizar('pessoa_acesso_id', e.target.value)}
              className={selectClasses}
            >
              <option value="">Selecione...</option>
              {pessoas.filter((p) => p.ativo).map((p) => (
                <option key={p.id} value={p.id}>{p.nome} — {p.email}</option>
              ))}
            </select>
          </Campo>

          <Campo rotulo="Sócio" obrigatorio ajuda={!ehNovo ? 'Não pode ser alterado. Revogue e crie outra se precisar trocar.' : null}>
            <select
              required
              disabled={!ehNovo}
              value={form.socio_id}
              onChange={(e) => atualizar('socio_id', e.target.value)}
              className={selectClasses}
            >
              <option value="">Selecione...</option>
              {socios.filter((s) => s.ativo).map((s) => (
                <option key={s.id} value={s.id}>
                  {s.nome}
                  {s.tipo_pessoa === 'juridica' ? ' (PJ)' : ''}
                </option>
              ))}
            </select>
          </Campo>
        </div>

        <Campo rotulo="Papel" obrigatorio>
          <div className="grid gap-2 sm:grid-cols-3">
            {Object.entries(papeisInfo).map(([valor, info]) => {
              const Icone = info.icone;
              const ativo = form.papel === valor;
              return (
                <button
                  key={valor}
                  type="button"
                  onClick={() => atualizar('papel', valor)}
                  className={[
                    'rounded-lg border px-3 py-2 text-left text-sm transition-colors',
                    ativo
                      ? 'border-nexus-500 bg-nexus-50 text-nexus-900'
                      : 'border-slate-300 bg-white text-slate-700 hover:bg-slate-50',
                  ].join(' ')}
                >
                  <div className="flex items-center gap-2 font-medium">
                    <Icone size={14} />
                    {info.rotulo}
                  </div>
                  <div className="mt-0.5 text-[11px] text-slate-500">{info.descricao}</div>
                </button>
              );
            })}
          </div>
          {papelInfo && (
            <div className="mt-2 text-xs text-slate-500">{papelInfo.descricao}</div>
          )}
        </Campo>

        <Campo rotulo="Poderes" ajuda="Marque o que esta pessoa pode fazer em nome do sócio.">
          <div className="grid gap-2 sm:grid-cols-2">
            {poderesInfo.map((p) => (
              <label key={p.chave} className="flex items-center gap-2 rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-700 hover:bg-slate-50">
                <input
                  type="checkbox"
                  checked={form[p.chave]}
                  onChange={(e) => atualizar(p.chave, e.target.checked)}
                  className="h-4 w-4 rounded border-slate-300 text-nexus-700 focus:ring-nexus-500"
                />
                {p.rotulo}
              </label>
            ))}
          </div>
        </Campo>

        <div className="grid gap-4 sm:grid-cols-2">
          <Campo rotulo="Início da vigência" ajuda="Se vazio, começa hoje.">
            <input
              type="date"
              value={form.data_inicio}
              onChange={(e) => atualizar('data_inicio', e.target.value)}
              className={inputClasses}
            />
          </Campo>

          <Campo rotulo="Fim da vigência" ajuda="Vazio = sem prazo para terminar.">
            <input
              type="date"
              value={form.data_fim}
              onChange={(e) => atualizar('data_fim', e.target.value)}
              className={inputClasses}
            />
          </Campo>
        </div>

        <Campo rotulo="URL do documento de procuração" ajuda="Link público ou compartilhado.">
          <input
            type="url"
            value={form.documento_procuracao_url}
            onChange={(e) => atualizar('documento_procuracao_url', e.target.value)}
            placeholder="https://..."
            className={inputClasses}
          />
        </Campo>

        <Campo rotulo="Observações">
          <textarea
            rows={2}
            value={form.observacoes}
            onChange={(e) => atualizar('observacoes', e.target.value)}
            className={inputClasses}
          />
        </Campo>

        {erro && (
          <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
            {erro}
          </div>
        )}

        <div className="flex justify-end gap-2 pt-2">
          <button type="button" onClick={aoFechar} className={botaoSecundario}>Cancelar</button>
          <button type="submit" disabled={salvando} className={botaoPrimario}>
            {salvando ? 'Salvando...' : (ehNovo ? 'Criar representação' : 'Salvar alterações')}
          </button>
        </div>
      </form>
    </Modal>
  );
}

function ModalRevogar({ representacao, aoFechar, aoConfirmar }) {
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
      await aoConfirmar(motivo.trim());
    } catch (err) {
      setErro(mensagemDeErro(err, 'Não foi possível revogar.'));
      setEnviando(false);
    }
  }

  return (
    <Modal titulo="Revogar representação" aoFechar={aoFechar}>
      <form onSubmit={confirmar} className="space-y-4">
        <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
          <div className="flex gap-2">
            <AlertTriangle size={16} className="mt-0.5 shrink-0 text-amber-700" />
            <div>
              <div className="font-medium">Esta ação desliga o acesso, mas não apaga o registro.</div>
              <div className="mt-1 text-xs">
                A pessoa deixa de poder agir em nome deste sócio a partir de agora. O histórico fica
                preservado para auditoria. Se precisar, você pode criar uma nova representação depois.
              </div>
            </div>
          </div>
        </div>

        <div className="rounded-lg border border-slate-200 bg-slate-50 p-3 text-sm">
          <div className="grid gap-2 sm:grid-cols-2">
            <div>
              <div className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">Pessoa</div>
              <div className="font-medium text-slate-900">{representacao.pessoa_nome}</div>
            </div>
            <div>
              <div className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">Sócio</div>
              <div className="font-medium text-slate-900">{representacao.socio_nome}</div>
            </div>
          </div>
        </div>

        <Campo rotulo="Motivo da revogação" obrigatorio ajuda="Fica registrado para auditoria.">
          <textarea
            rows={3}
            required
            minLength={3}
            maxLength={500}
            value={motivo}
            onChange={(e) => setMotivo(e.target.value)}
            placeholder="Ex: procuração caducou, pessoa saiu da empresa, etc."
            className={inputClasses}
          />
        </Campo>

        {erro && (
          <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
            {erro}
          </div>
        )}

        <div className="flex justify-end gap-2 pt-2">
          <button type="button" onClick={aoFechar} className={botaoSecundario}>Cancelar</button>
          <button
            type="submit"
            disabled={enviando}
            className="inline-flex items-center justify-center gap-2 rounded-lg bg-red-600 px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-red-700 disabled:cursor-not-allowed disabled:opacity-60"
          >
            <Ban size={14} />
            {enviando ? 'Revogando...' : 'Confirmar revogação'}
          </button>
        </div>
      </form>
    </Modal>
  );
}

function Modal({ titulo, aoFechar, children }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <button type="button" aria-label="Fechar" onClick={aoFechar} className="absolute inset-0 bg-slate-900/60" />
      <div className="relative z-10 w-full max-w-2xl rounded-xl bg-white shadow-xl max-h-[90vh] overflow-y-auto">
        <div className="sticky top-0 flex items-center justify-between border-b border-slate-200 bg-white px-5 py-3">
          <h2 className="font-semibold text-slate-900">{titulo}</h2>
          <button
            type="button"
            onClick={aoFechar}
            className="rounded-md p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-600"
            aria-label="Fechar"
          >
            <X size={18} />
          </button>
        </div>
        <div className="p-5">{children}</div>
      </div>
    </div>
  );
}

function Campo({ rotulo, obrigatorio, ajuda, children }) {
  return (
    <label className="block">
      <span className="block text-sm font-medium text-slate-700">
        {rotulo}
        {obrigatorio && <span className="ml-0.5 text-red-500">*</span>}
      </span>
      <div className="mt-1">{children}</div>
      {ajuda && <span className="mt-1 block text-xs text-slate-500">{ajuda}</span>}
    </label>
  );
}

const inputClasses =
  'w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm shadow-sm outline-none focus:border-nexus-500 focus:ring-2 focus:ring-nexus-200';

const selectClasses = inputClasses + ' disabled:bg-slate-100 disabled:text-slate-500';

const selectClassesCompacto =
  'rounded-lg border border-slate-300 bg-white px-2 py-1 text-sm shadow-sm outline-none focus:border-nexus-500 focus:ring-2 focus:ring-nexus-200';

const botaoPrimario =
  'inline-flex items-center justify-center rounded-lg bg-nexus-700 px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-nexus-800 disabled:cursor-not-allowed disabled:opacity-60';

const botaoSecundario =
  'inline-flex items-center justify-center rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 shadow-sm hover:bg-slate-50';
