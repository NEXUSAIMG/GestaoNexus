import { useEffect, useMemo, useRef, useState } from 'react';
import {
  UserPlus, Edit2, CheckCircle2, XCircle, X, Building2, User as UserIcon, AlertCircle,
} from 'lucide-react';
import { api, mensagemDeErro } from '../api/client.js';
import { useAuth } from '../context/AuthContext.jsx';

/**
 * Cadastro de sócios — Sprint 1.5.
 *
 * Agora a tabela "socios" representa APENAS a participação societária.
 * Login e credenciais viraram "pessoas de acesso", e o elo entre pessoa
 * e sócio é feito por "representações".
 *
 * Esta tela não gerencia mais senhas nem o marcador de administrador —
 * isso fica em /pessoas e /representacoes.
 */

function formatarPercentual(v) {
  return `${Number(v || 0).toFixed(2).replace('.', ',')}%`;
}

function formatarData(d) {
  if (!d) return '—';
  try { return new Date(d).toLocaleDateString('pt-BR'); } catch { return '—'; }
}

const rotuloTipo = { fisica: 'Pessoa física', juridica: 'Pessoa jurídica' };
const iconeTipo = { fisica: UserIcon, juridica: Building2 };

export default function Socios() {
  const { pessoa } = useAuth();
  const [socios, setSocios] = useState([]);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState('');
  const [modal, setModal] = useState(null); // { tipo: 'novo' | 'editar', socio?: {} }

  // Sprint 30 — gate de versão pra evitar race condition em operações rápidas.
  const carregaIdRef = useRef(0);

  async function carregar() {
    const meuId = ++carregaIdRef.current;
    setCarregando(true);
    setErro('');
    try {
      const res = await api.get('/socios');
      if (meuId !== carregaIdRef.current) return;
      setSocios(res.data);
    } catch (err) {
      if (meuId === carregaIdRef.current) {
        setErro(mensagemDeErro(err, 'Não foi possível carregar os sócios.'));
      }
    } finally {
      if (meuId === carregaIdRef.current) {
        setCarregando(false);
      }
    }
  }

  useEffect(() => { carregar(); }, []);

  const souAdmin = !!pessoa?.administrador;

  const { totalPercentual, ativos } = useMemo(() => {
    const ativosLocal = socios.filter((s) => s.ativo);
    const total = ativosLocal.reduce(
      (acc, s) => acc + Number(s.percentual_participacao || 0),
      0,
    );
    return { totalPercentual: total, ativos: ativosLocal.length };
  }, [socios]);

  const somaFora100 = socios.length > 0 && Math.abs(totalPercentual - 100) > 0.01;

  return (
    <div className="max-w-6xl">
      <div className="flex flex-wrap items-start justify-between gap-4 mb-6">
        <div>
          <h1 className="text-2xl font-semibold text-slate-900">Sócios</h1>
          <p className="mt-1 text-slate-600">
            Quem compõe a sociedade, participação de cada um e dados de contato.
            O acesso à ferramenta é definido em <em>Pessoas de acesso</em> e <em>Representações</em>.
          </p>
        </div>

        {souAdmin && (
          <button
            type="button"
            onClick={() => setModal({ tipo: 'novo' })}
            className="inline-flex items-center gap-2 rounded-lg bg-nexus-700 px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-nexus-800"
          >
            <UserPlus size={16} />
            Novo sócio
          </button>
        )}
      </div>

      <div className="mb-6 grid gap-3 sm:grid-cols-3">
        <Cartao rotulo="Sócios ativos" valor={ativos} />
        <Cartao rotulo="Total cadastrado" valor={socios.length} />
        <Cartao
          rotulo="Participação total (ativos)"
          valor={formatarPercentual(totalPercentual)}
          alerta={somaFora100}
          rodape={
            somaFora100
              ? 'A soma dos percentuais deve fechar em 100%.'
              : socios.length === 0 ? 'Nenhum sócio cadastrado.' : 'Soma OK.'
          }
        />
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
              <th className="px-4 py-3">Nome</th>
              <th className="px-4 py-3">Tipo</th>
              <th className="px-4 py-3">Documento</th>
              <th className="px-4 py-3">E-mail</th>
              <th className="px-4 py-3 text-right">Participação</th>
              <th className="px-4 py-3">Entrada</th>
              <th className="px-4 py-3">Status</th>
              <th className="px-4 py-3"></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {carregando && (
              <tr>
                <td colSpan={8} className="px-4 py-8 text-center text-slate-500">
                  Carregando...
                </td>
              </tr>
            )}
            {!carregando && socios.length === 0 && (
              <tr>
                <td colSpan={8} className="px-4 py-8 text-center text-slate-500">
                  Nenhum sócio cadastrado.
                </td>
              </tr>
            )}
            {!carregando && socios.map((s) => {
              const IconeT = iconeTipo[s.tipo_pessoa] ?? UserIcon;
              return (
                <tr key={s.id} className={s.ativo ? '' : 'bg-slate-50/60 text-slate-500'}>
                  <td className="px-4 py-3 font-medium text-slate-900">{s.nome}</td>
                  <td className="px-4 py-3">
                    <span className="inline-flex items-center gap-1.5 text-xs text-slate-600">
                      <IconeT size={13} />
                      {rotuloTipo[s.tipo_pessoa] ?? '—'}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-slate-600">{s.documento || '—'}</td>
                  <td className="px-4 py-3 text-slate-600">{s.email || '—'}</td>
                  <td className="px-4 py-3 text-right tabular-nums">
                    {formatarPercentual(s.percentual_participacao)}
                  </td>
                  <td className="px-4 py-3 text-slate-600">{formatarData(s.data_entrada)}</td>
                  <td className="px-4 py-3">
                    {s.ativo ? (
                      <span className="inline-flex items-center gap-1 text-xs text-emerald-700">
                        <CheckCircle2 size={14} /> Ativo
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 text-xs text-slate-500">
                        <XCircle size={14} /> Inativo
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-right">
                    {souAdmin && (
                      <button
                        type="button"
                        onClick={() => setModal({ tipo: 'editar', socio: s })}
                        className="rounded-md p-1.5 text-slate-500 hover:bg-slate-100 hover:text-slate-700"
                        title="Editar"
                      >
                        <Edit2 size={15} />
                      </button>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {!souAdmin && socios.length > 0 && (
        <p className="mt-3 text-xs text-slate-500">
          Apenas administradores podem cadastrar e editar sócios.
        </p>
      )}

      {modal?.tipo === 'novo' && (
        <ModalSocio
          aoFechar={() => setModal(null)}
          aoSalvar={async (dados) => {
            await api.post('/socios', dados);
            setModal(null);
            carregar();
          }}
        />
      )}

      {modal?.tipo === 'editar' && (
        <ModalSocio
          socio={modal.socio}
          aoFechar={() => setModal(null)}
          aoSalvar={async (dados) => {
            await api.put(`/socios/${modal.socio.id}`, dados);
            setModal(null);
            carregar();
          }}
        />
      )}
    </div>
  );
}

function Cartao({ rotulo, valor, rodape, alerta }) {
  return (
    <div
      className={[
        'rounded-xl border bg-white p-4 shadow-sm',
        alerta ? 'border-amber-200' : 'border-slate-200',
      ].join(' ')}
    >
      <div className="flex items-center gap-2">
        <div className="text-xs font-medium uppercase tracking-wide text-slate-500">
          {rotulo}
        </div>
        {alerta && <AlertCircle size={13} className="text-amber-600" />}
      </div>
      <div className="mt-1 text-2xl font-semibold tabular-nums text-slate-900">
        {valor}
      </div>
      {rodape && (
        <div className={['mt-1 text-xs', alerta ? 'text-amber-700' : 'text-slate-500'].join(' ')}>
          {rodape}
        </div>
      )}
    </div>
  );
}

function ModalSocio({ socio, aoFechar, aoSalvar }) {
  const ehNovo = !socio;
  const [form, setForm] = useState({
    nome: socio?.nome ?? '',
    tipo_pessoa: socio?.tipo_pessoa ?? 'fisica',
    documento: socio?.documento ?? '',
    email: socio?.email ?? '',
    telefone: socio?.telefone ?? '',
    percentual_participacao: socio?.percentual_participacao ?? 0,
    data_entrada: socio?.data_entrada ? String(socio.data_entrada).slice(0, 10) : '',
    ativo: socio?.ativo ?? true,
  });
  const [erro, setErro] = useState('');
  const [salvando, setSalvando] = useState(false);

  function atualizar(campo, valor) {
    setForm((f) => ({ ...f, [campo]: valor }));
  }

  const docRotulo = form.tipo_pessoa === 'juridica' ? 'CNPJ' : 'CPF';
  const docPlaceholder = form.tipo_pessoa === 'juridica' ? '00.000.000/0000-00' : '000.000.000-00';

  async function enviar(e) {
    e.preventDefault();
    setErro('');
    setSalvando(true);
    try {
      const payload = {
        nome: form.nome.trim(),
        tipo_pessoa: form.tipo_pessoa,
        documento: form.documento?.trim() || null,
        email: form.email?.trim() || null,
        telefone: form.telefone?.trim() || null,
        percentual_participacao: Number(form.percentual_participacao) || 0,
        data_entrada: form.data_entrada || null,
      };
      if (!ehNovo) payload.ativo = !!form.ativo;

      await aoSalvar(payload);
    } catch (err) {
      setErro(mensagemDeErro(err, 'Não foi possível salvar.'));
    } finally {
      setSalvando(false);
    }
  }

  return (
    <Modal titulo={ehNovo ? 'Novo sócio' : `Editar ${socio.nome}`} aoFechar={aoFechar}>
      <form onSubmit={enviar} className="space-y-4">
        <Campo rotulo="Tipo de pessoa" obrigatorio>
          <div className="flex gap-2">
            {['fisica', 'juridica'].map((t) => {
              const Icone = iconeTipo[t];
              const ativo = form.tipo_pessoa === t;
              return (
                <button
                  key={t}
                  type="button"
                  onClick={() => atualizar('tipo_pessoa', t)}
                  className={[
                    'flex-1 inline-flex items-center justify-center gap-2 rounded-lg border px-3 py-2 text-sm',
                    ativo
                      ? 'border-nexus-500 bg-nexus-50 text-nexus-800'
                      : 'border-slate-300 bg-white text-slate-700 hover:bg-slate-50',
                  ].join(' ')}
                >
                  <Icone size={15} />
                  {rotuloTipo[t]}
                </button>
              );
            })}
          </div>
        </Campo>

        <div className="grid gap-4 sm:grid-cols-2">
          <Campo rotulo={form.tipo_pessoa === 'juridica' ? 'Razão social' : 'Nome completo'} obrigatorio>
            <input
              type="text"
              required
              value={form.nome}
              onChange={(e) => atualizar('nome', e.target.value)}
              className={inputClasses}
            />
          </Campo>

          <Campo rotulo={docRotulo}>
            <input
              type="text"
              value={form.documento}
              onChange={(e) => atualizar('documento', e.target.value)}
              placeholder={docPlaceholder}
              className={inputClasses}
            />
          </Campo>

          <Campo rotulo="E-mail de contato">
            <input
              type="email"
              value={form.email}
              onChange={(e) => atualizar('email', e.target.value)}
              className={inputClasses}
            />
          </Campo>

          <Campo rotulo="Telefone">
            <input
              type="text"
              value={form.telefone}
              onChange={(e) => atualizar('telefone', e.target.value)}
              placeholder="(00) 00000-0000"
              className={inputClasses}
            />
          </Campo>

          <Campo rotulo="Participação (%)" obrigatorio>
            <input
              type="number"
              min="0"
              max="100"
              step="0.01"
              required
              value={form.percentual_participacao}
              onChange={(e) => atualizar('percentual_participacao', e.target.value)}
              className={inputClasses}
            />
          </Campo>

          <Campo rotulo="Data de entrada">
            <input
              type="date"
              value={form.data_entrada}
              onChange={(e) => atualizar('data_entrada', e.target.value)}
              className={inputClasses}
            />
          </Campo>
        </div>

        {!ehNovo && (
          <label className="inline-flex items-center gap-2 text-sm text-slate-700">
            <input
              type="checkbox"
              checked={form.ativo}
              onChange={(e) => atualizar('ativo', e.target.checked)}
              className="h-4 w-4 rounded border-slate-300 text-nexus-700 focus:ring-nexus-500"
            />
            Sócio ativo
          </label>
        )}

        <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-600">
          <strong className="text-slate-700">Login e senha:</strong> sócios não fazem login diretamente.
          Para dar acesso à ferramenta, cadastre uma pessoa em <em>Pessoas de acesso</em> e
          crie uma <em>Representação</em> ligando essa pessoa a este sócio.
        </div>

        {erro && (
          <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
            {erro}
          </div>
        )}

        <div className="flex justify-end gap-2 pt-2">
          <button type="button" onClick={aoFechar} className={botaoSecundario}>
            Cancelar
          </button>
          <button type="submit" disabled={salvando} className={botaoPrimario}>
            {salvando ? 'Salvando...' : (ehNovo ? 'Criar sócio' : 'Salvar alterações')}
          </button>
        </div>
      </form>
    </Modal>
  );
}

function Modal({ titulo, aoFechar, children }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <button
        type="button"
        aria-label="Fechar"
        onClick={aoFechar}
        className="absolute inset-0 bg-slate-900/60"
      />
      <div className="relative z-10 w-full max-w-2xl rounded-xl bg-white shadow-xl">
        <div className="flex items-center justify-between border-b border-slate-200 px-5 py-3">
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

const botaoPrimario =
  'inline-flex items-center justify-center rounded-lg bg-nexus-700 px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-nexus-800 disabled:cursor-not-allowed disabled:opacity-60';

const botaoSecundario =
  'inline-flex items-center justify-center rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 shadow-sm hover:bg-slate-50';
