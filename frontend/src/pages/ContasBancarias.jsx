import { useEffect, useMemo, useState } from 'react';
import {
  Plus, Edit2, Wallet, PiggyBank, TrendingUp, Banknote,
  CheckCircle2, XCircle, X, AlertCircle,
} from 'lucide-react';
import { api, mensagemDeErro } from '../api/client.js';
import { useAuth } from '../context/AuthContext.jsx';

/**
 * Cadastro de contas bancárias — Sprint 2.
 *
 * Sistema simples: cada conta tem um apelido, dados bancários opcionais e
 * um saldo que é digitado manualmente (sem conciliação automática ainda).
 *
 * Um endpoint dedicado (/saldo) separa a ação de "atualizar cadastro" de
 * "registrar saldo do dia" — isso garante que o carimbo de quem/quando
 * sempre reflita só o saldo.
 */

const ICONE_TIPO = {
  corrente: Wallet,
  poupanca: PiggyBank,
  investimento: TrendingUp,
  caixa: Banknote,
};

const ROTULO_TIPO = {
  corrente: 'Conta corrente',
  poupanca: 'Poupança',
  investimento: 'Investimento',
  caixa: 'Caixa / Espécie',
};

function formatarBRL(n) {
  return Number(n ?? 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

function formatarDataHora(d) {
  if (!d) return null;
  try { return new Date(d).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' }); }
  catch { return null; }
}

function tempoDesde(d) {
  if (!d) return null;
  const agora = new Date();
  const antes = new Date(d);
  const horas = Math.floor((agora - antes) / 3600000);
  if (horas < 1) return 'há poucos minutos';
  if (horas < 24) return `há ${horas}h`;
  const dias = Math.floor(horas / 24);
  return `há ${dias}d`;
}

export default function ContasBancarias() {
  const { pessoa } = useAuth();
  const souAdmin = !!pessoa?.administrador;

  const [contas, setContas] = useState([]);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState('');
  const [modal, setModal] = useState(null);
  // modal = { tipo: 'nova' | 'editar' | 'saldo', conta?: {} }

  async function carregar() {
    setCarregando(true);
    setErro('');
    try {
      const res = await api.get('/contas-bancarias');
      setContas(res.data);
    } catch (err) {
      setErro(mensagemDeErro(err, 'Não foi possível carregar as contas.'));
    } finally {
      setCarregando(false);
    }
  }

  useEffect(() => { carregar(); }, []);

  const resumo = useMemo(() => {
    const ativas = contas.filter((c) => c.ativo);
    const total = ativas.reduce((acc, c) => acc + Number(c.saldo_atual || 0), 0);
    const maisAntigo = ativas.reduce((acc, c) => {
      if (!c.saldo_atualizado_em) return acc;
      if (!acc) return c.saldo_atualizado_em;
      return new Date(c.saldo_atualizado_em) < new Date(acc) ? c.saldo_atualizado_em : acc;
    }, null);
    return { total, qtdAtivas: ativas.length, maisAntigo };
  }, [contas]);

  return (
    <div className="max-w-6xl">
      <div className="flex flex-wrap items-start justify-between gap-4 mb-6">
        <div>
          <h1 className="text-2xl font-semibold text-slate-900">Contas bancárias</h1>
          <p className="mt-1 text-slate-600">
            Registre o saldo de cada conta ao fim do expediente. Esse valor é o que
            aparece como <em>Saldo nas contas</em> no painel de Caixa.
          </p>
        </div>

        {souAdmin && (
          <button
            type="button"
            onClick={() => setModal({ tipo: 'nova' })}
            className="inline-flex items-center gap-2 rounded-lg bg-nexus-700 px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-nexus-800"
          >
            <Plus size={16} />
            Nova conta
          </button>
        )}
      </div>

      <div className="mb-6 grid gap-3 sm:grid-cols-3">
        <Cartao rotulo="Saldo consolidado" valor={formatarBRL(resumo.total)} destaque />
        <Cartao rotulo="Contas ativas" valor={resumo.qtdAtivas} />
        <Cartao
          rotulo="Registro mais antigo"
          valor={resumo.maisAntigo ? tempoDesde(resumo.maisAntigo) : '—'}
          rodape={resumo.maisAntigo ? 'Considere atualizar' : 'Sem saldos registrados'}
          alerta={
            !!resumo.maisAntigo &&
            (Date.now() - new Date(resumo.maisAntigo).getTime()) > 3 * 24 * 3600 * 1000
          }
        />
      </div>

      {erro && (
        <div className="mb-4 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
          {erro}
        </div>
      )}

      <div className="grid gap-3 md:grid-cols-2">
        {carregando && (
          <div className="col-span-full rounded-xl border border-slate-200 bg-white p-8 text-center text-slate-500">
            Carregando...
          </div>
        )}
        {!carregando && contas.length === 0 && (
          <div className="col-span-full rounded-xl border border-slate-200 bg-white p-8 text-center text-slate-500">
            Nenhuma conta cadastrada.
            {souAdmin && <> Clique em <em>Nova conta</em> pra começar.</>}
          </div>
        )}
        {!carregando && contas.map((c) => (
          <CardConta
            key={c.id}
            conta={c}
            souAdmin={souAdmin}
            onAtualizarSaldo={() => setModal({ tipo: 'saldo', conta: c })}
            onEditar={() => setModal({ tipo: 'editar', conta: c })}
          />
        ))}
      </div>

      {modal?.tipo === 'nova' && (
        <ModalConta
          aoFechar={() => setModal(null)}
          aoSalvar={async (dados) => {
            await api.post('/contas-bancarias', dados);
            setModal(null);
            carregar();
          }}
        />
      )}

      {modal?.tipo === 'editar' && (
        <ModalConta
          conta={modal.conta}
          aoFechar={() => setModal(null)}
          aoSalvar={async (dados) => {
            // saldo_atual não vai por esta rota; é editado pelo modal de saldo
            const { saldo_atual: _s, ...semSaldo } = dados;
            await api.put(`/contas-bancarias/${modal.conta.id}`, semSaldo);
            setModal(null);
            carregar();
          }}
        />
      )}

      {modal?.tipo === 'saldo' && (
        <ModalSaldo
          conta={modal.conta}
          aoFechar={() => setModal(null)}
          aoSalvar={async (saldo) => {
            await api.post(`/contas-bancarias/${modal.conta.id}/saldo`, { saldo_atual: saldo });
            setModal(null);
            carregar();
          }}
        />
      )}
    </div>
  );
}

function CardConta({ conta, souAdmin, onAtualizarSaldo, onEditar }) {
  const Icone = ICONE_TIPO[conta.tipo] ?? Wallet;
  const velho = conta.saldo_atualizado_em
    ? (Date.now() - new Date(conta.saldo_atualizado_em).getTime()) > 3 * 24 * 3600 * 1000
    : false;

  return (
    <div className={[
      'rounded-xl border p-4 shadow-sm',
      conta.ativo ? 'border-slate-200 bg-white' : 'border-slate-200 bg-slate-50',
    ].join(' ')}>
      <div className="flex items-start gap-3">
        <div className={[
          'rounded-lg p-2.5',
          conta.ativo ? 'bg-nexus-50 text-nexus-700' : 'bg-slate-100 text-slate-400',
        ].join(' ')}>
          <Icone size={18} />
        </div>

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <div className="font-semibold text-slate-900 truncate">{conta.apelido}</div>
            {!conta.ativo && (
              <span className="inline-flex items-center gap-1 rounded-full bg-slate-200 px-2 py-0.5 text-[10px] font-medium text-slate-600">
                <XCircle size={10} /> Inativa
              </span>
            )}
          </div>

          <div className="mt-0.5 text-xs text-slate-600">
            {ROTULO_TIPO[conta.tipo] ?? conta.tipo}
            {(conta.banco || conta.agencia || conta.conta) && ' · '}
            {conta.banco}
            {conta.agencia && ` · Ag. ${conta.agencia}`}
            {conta.conta && ` · Cc. ${conta.conta}`}
          </div>

          <div className="mt-3 flex items-end justify-between gap-3">
            <div>
              <div className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">
                Saldo atual
              </div>
              <div className="text-xl font-semibold tabular-nums text-slate-900">
                {formatarBRL(conta.saldo_atual)}
              </div>
            </div>
            <div className="text-right text-[11px] text-slate-500">
              {conta.saldo_atualizado_em ? (
                <>
                  <div className={velho ? 'text-amber-700 font-medium' : ''}>
                    {velho && <AlertCircle size={11} className="inline mr-0.5" />}
                    atualizado {tempoDesde(conta.saldo_atualizado_em)}
                  </div>
                  {conta.saldo_atualizado_por_nome && (
                    <div className="truncate max-w-[10rem]">por {conta.saldo_atualizado_por_nome}</div>
                  )}
                </>
              ) : (
                <div className="italic">saldo nunca foi registrado</div>
              )}
            </div>
          </div>

          {souAdmin && conta.ativo && (
            <div className="mt-3 flex gap-2">
              <button
                type="button"
                onClick={onAtualizarSaldo}
                className="flex-1 inline-flex items-center justify-center gap-1 rounded-lg bg-nexus-700 px-3 py-1.5 text-xs font-medium text-white hover:bg-nexus-800"
              >
                <CheckCircle2 size={13} />
                Registrar saldo
              </button>
              <button
                type="button"
                onClick={onEditar}
                className="inline-flex items-center justify-center rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50"
                title="Editar cadastro"
              >
                <Edit2 size={13} />
              </button>
            </div>
          )}
          {souAdmin && !conta.ativo && (
            <div className="mt-3">
              <button
                type="button"
                onClick={onEditar}
                className="inline-flex items-center gap-1 rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50"
              >
                <Edit2 size={13} />
                Editar
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function Cartao({ rotulo, valor, rodape, alerta, destaque }) {
  return (
    <div className={[
      'rounded-xl border p-4 shadow-sm',
      alerta ? 'border-amber-200 bg-amber-50' : destaque ? 'border-nexus-200 bg-nexus-50' : 'border-slate-200 bg-white',
    ].join(' ')}>
      <div className="flex items-center gap-2">
        <div className="text-xs font-medium uppercase tracking-wide text-slate-500">{rotulo}</div>
        {alerta && <AlertCircle size={12} className="text-amber-600" />}
      </div>
      <div className={[
        'mt-1 text-2xl font-semibold tabular-nums',
        destaque ? 'text-nexus-900' : alerta ? 'text-amber-900' : 'text-slate-900',
      ].join(' ')}>
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

function ModalConta({ conta, aoFechar, aoSalvar }) {
  const ehNova = !conta;
  const [form, setForm] = useState({
    apelido: conta?.apelido ?? '',
    banco: conta?.banco ?? '',
    agencia: conta?.agencia ?? '',
    conta: conta?.conta ?? '',
    tipo: conta?.tipo ?? 'corrente',
    saldo_atual: conta?.saldo_atual ?? 0,
    ordem: conta?.ordem ?? 0,
    observacoes: conta?.observacoes ?? '',
    ativo: conta?.ativo ?? true,
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
      const payload = {
        apelido: form.apelido.trim(),
        banco: form.banco?.trim() || null,
        agencia: form.agencia?.trim() || null,
        conta: form.conta?.trim() || null,
        tipo: form.tipo,
        ordem: Number(form.ordem) || 0,
        observacoes: form.observacoes?.trim() || null,
      };
      if (ehNova) {
        payload.saldo_atual = Number(form.saldo_atual) || 0;
      } else {
        payload.ativo = !!form.ativo;
      }
      await aoSalvar(payload);
    } catch (err) {
      setErro(mensagemDeErro(err, 'Não foi possível salvar.'));
    } finally {
      setSalvando(false);
    }
  }

  return (
    <Modal titulo={ehNova ? 'Nova conta bancária' : `Editar ${conta.apelido}`} aoFechar={aoFechar}>
      <form onSubmit={enviar} className="space-y-4">
        <Campo rotulo="Apelido" obrigatorio ajuda="Como você chama esta conta internamente.">
          <input
            type="text"
            required
            value={form.apelido}
            onChange={(e) => atualizar('apelido', e.target.value)}
            placeholder="Ex: Conta Itaú principal"
            className={inputClasses}
          />
        </Campo>

        <Campo rotulo="Tipo" obrigatorio>
          <div className="grid gap-2 sm:grid-cols-4">
            {Object.keys(ROTULO_TIPO).map((t) => {
              const Icone = ICONE_TIPO[t];
              const ativo = form.tipo === t;
              return (
                <button
                  key={t}
                  type="button"
                  onClick={() => atualizar('tipo', t)}
                  className={[
                    'inline-flex items-center justify-center gap-2 rounded-lg border px-2 py-2 text-xs',
                    ativo
                      ? 'border-nexus-500 bg-nexus-50 text-nexus-800'
                      : 'border-slate-300 bg-white text-slate-700 hover:bg-slate-50',
                  ].join(' ')}
                >
                  <Icone size={13} />
                  {ROTULO_TIPO[t]}
                </button>
              );
            })}
          </div>
        </Campo>

        <div className="grid gap-4 sm:grid-cols-3">
          <Campo rotulo="Banco">
            <input
              type="text"
              value={form.banco}
              onChange={(e) => atualizar('banco', e.target.value)}
              placeholder="Ex: Itaú"
              className={inputClasses}
            />
          </Campo>

          <Campo rotulo="Agência">
            <input
              type="text"
              value={form.agencia}
              onChange={(e) => atualizar('agencia', e.target.value)}
              className={inputClasses}
            />
          </Campo>

          <Campo rotulo="Conta">
            <input
              type="text"
              value={form.conta}
              onChange={(e) => atualizar('conta', e.target.value)}
              className={inputClasses}
            />
          </Campo>
        </div>

        {ehNova && (
          <Campo rotulo="Saldo inicial" ajuda="Pode deixar 0 e registrar depois em 'Registrar saldo'.">
            <input
              type="number"
              step="0.01"
              value={form.saldo_atual}
              onChange={(e) => atualizar('saldo_atual', e.target.value)}
              className={inputClasses}
            />
          </Campo>
        )}

        <Campo rotulo="Ordem de exibição" ajuda="Menor primeiro. Use pra organizar o painel.">
          <input
            type="number"
            min="0"
            max="999"
            value={form.ordem}
            onChange={(e) => atualizar('ordem', e.target.value)}
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

        {!ehNova && (
          <label className="inline-flex items-center gap-2 text-sm text-slate-700">
            <input
              type="checkbox"
              checked={form.ativo}
              onChange={(e) => atualizar('ativo', e.target.checked)}
              className="h-4 w-4 rounded border-slate-300 text-nexus-700 focus:ring-nexus-500"
            />
            Conta ativa
          </label>
        )}

        {erro && (
          <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
            {erro}
          </div>
        )}

        <div className="flex justify-end gap-2 pt-2">
          <button type="button" onClick={aoFechar} className={botaoSecundario}>Cancelar</button>
          <button type="submit" disabled={salvando} className={botaoPrimario}>
            {salvando ? 'Salvando...' : (ehNova ? 'Criar conta' : 'Salvar alterações')}
          </button>
        </div>
      </form>
    </Modal>
  );
}

function ModalSaldo({ conta, aoFechar, aoSalvar }) {
  const [saldo, setSaldo] = useState(conta.saldo_atual ?? 0);
  const [erro, setErro] = useState('');
  const [salvando, setSalvando] = useState(false);

  async function enviar(e) {
    e.preventDefault();
    setErro('');
    setSalvando(true);
    try {
      await aoSalvar(Number(saldo));
    } catch (err) {
      setErro(mensagemDeErro(err, 'Não foi possível salvar.'));
      setSalvando(false);
    }
  }

  return (
    <Modal titulo={`Registrar saldo — ${conta.apelido}`} aoFechar={aoFechar}>
      <form onSubmit={enviar} className="space-y-4">
        <div className="rounded-lg border border-slate-200 bg-slate-50 p-3 text-sm text-slate-600">
          Informe o saldo <strong>atual</strong> desta conta. O momento e seu nome ficam
          registrados automaticamente — facilita conferir depois se o número está fresco.
        </div>

        <Campo rotulo="Saldo atual (R$)" obrigatorio>
          <input
            type="number"
            step="0.01"
            required
            value={saldo}
            onChange={(e) => setSaldo(e.target.value)}
            className={inputClasses + ' text-lg font-semibold tabular-nums'}
            autoFocus
          />
        </Campo>

        {conta.saldo_atualizado_em && (
          <div className="text-xs text-slate-500">
            Último registro: <strong>{formatarBRL(conta.saldo_atual)}</strong>
            {' em '}{formatarDataHora(conta.saldo_atualizado_em)}
            {conta.saldo_atualizado_por_nome && <> por {conta.saldo_atualizado_por_nome}</>}.
          </div>
        )}

        {erro && (
          <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
            {erro}
          </div>
        )}

        <div className="flex justify-end gap-2 pt-2">
          <button type="button" onClick={aoFechar} className={botaoSecundario}>Cancelar</button>
          <button type="submit" disabled={salvando} className={botaoPrimario}>
            {salvando ? 'Registrando...' : 'Registrar saldo'}
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

const botaoPrimario =
  'inline-flex items-center justify-center rounded-lg bg-nexus-700 px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-nexus-800 disabled:cursor-not-allowed disabled:opacity-60';

const botaoSecundario =
  'inline-flex items-center justify-center rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 shadow-sm hover:bg-slate-50';
