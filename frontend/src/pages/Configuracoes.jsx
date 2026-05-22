import { useEffect, useState } from 'react';
import { Save, Bell, Mail, Clock } from 'lucide-react';
import { api, mensagemDeErro } from '../api/client.js';
import { useAuth } from '../context/AuthContext.jsx';

/**
 * Configurações de notificações — Sprint 7.
 *
 * Página admin-only. Permite ligar/desligar avisos por e-mail e ajustar
 * a janela de antecedência (em dias) para alertas de vencimento.
 *
 * Notificações in-app (sino) NÃO podem ser desligadas — sempre rolam.
 * O que se desliga aqui é só o e-mail correspondente.
 */
export default function Configuracoes() {
  const { pessoa } = useAuth();
  const admin = !!pessoa?.administrador;

  const [config, setConfig] = useState(null);
  const [carregando, setCarregando] = useState(true);
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState('');
  const [ok, setOk] = useState('');

  useEffect(() => {
    let ativo = true;
    setCarregando(true);
    api.get('/configuracoes-notificacoes')
      .then((r) => { if (ativo) setConfig(r.data); })
      .catch((err) => { if (ativo) setErro(mensagemDeErro(err, 'Não consegui carregar.')); })
      .finally(() => { if (ativo) setCarregando(false); });
    return () => { ativo = false; };
  }, []);

  function alterar(campo, valor) {
    setOk('');
    setConfig((c) => ({ ...c, [campo]: valor }));
  }

  async function salvar() {
    if (!admin) return;
    setSalvando(true);
    setErro('');
    setOk('');
    try {
      const r = await api.put('/configuracoes-notificacoes', config);
      setConfig(r.data);
      setOk('Configurações salvas.');
    } catch (err) {
      setErro(mensagemDeErro(err, 'Não consegui salvar.'));
    } finally {
      setSalvando(false);
    }
  }

  if (carregando) {
    return <div className="text-sm text-slate-500">Carregando…</div>;
  }
  if (!config) {
    return <div className="text-sm text-red-600">{erro || 'Erro ao carregar configurações.'}</div>;
  }

  return (
    <div className="max-w-3xl">
      <header className="mb-6">
        <div className="text-xs uppercase tracking-widest text-nexus-700">Configurações</div>
        <h1 className="mt-1 text-2xl font-semibold text-slate-900">Notificações</h1>
        <p className="mt-1 text-slate-600">
          Controle quais avisos a Gestão Nexus envia por e-mail. As notificações dentro
          do app (sino) ficam sempre ligadas — só o e-mail correspondente é controlado aqui.
        </p>
      </header>

      {!admin && (
        <div className="mb-6 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
          Você está vendo como leitura apenas. Apenas administradores podem alterar.
        </div>
      )}

      <section className="rounded-xl border border-slate-200 bg-white p-5">
        <h2 className="flex items-center gap-2 text-sm font-semibold uppercase tracking-wide text-slate-500">
          <Mail size={14} /> E-mails
        </h2>
        <div className="mt-3 divide-y divide-slate-100">
          <Toggle
            label="Voto pendente"
            descricao="Avisa sócios com poder de aprovação quando uma ata ou decisão é colocada em votação."
            valor={config.email_voto_pendente}
            onChange={(v) => alterar('email_voto_pendente', v)}
            disabled={!admin}
          />
          <Toggle
            label="Documento finalizado"
            descricao="Avisa o criador quando uma ata, contrato ou decisão é aprovada ou rejeitada."
            valor={config.email_documento_finalizado}
            onChange={(v) => alterar('email_documento_finalizado', v)}
            disabled={!admin}
          />
          <Toggle
            label="Movimento criado"
            descricao="Avisa o sócio quando um pró-labore ou aporte é registrado em seu nome."
            valor={config.email_movimento_socio_criado}
            onChange={(v) => alterar('email_movimento_socio_criado', v)}
            disabled={!admin}
          />
          <Toggle
            label="Distribuição criada"
            descricao="Avisa cada sócio quando uma rodada de distribuição de lucros é proposta."
            valor={config.email_distribuicao_criada}
            onChange={(v) => alterar('email_distribuicao_criada', v)}
            disabled={!admin}
          />
          <Toggle
            label="Resumo diário do administrador"
            descricao="Resumo das contas a pagar vencendo, movimentos previstos e votações pendentes."
            valor={config.email_resumo_diario_admin}
            onChange={(v) => alterar('email_resumo_diario_admin', v)}
            disabled={!admin}
          />
          <Toggle
            label="Card atribuído (Tarefas)"
            descricao="Avisa o responsável quando alguém o atribui a uma tarefa em algum quadro."
            valor={config.email_card_atribuido}
            onChange={(v) => alterar('email_card_atribuido', v)}
            disabled={!admin}
          />
          <Toggle
            label="Tarefa com prazo hoje"
            descricao="Aviso diário (8h) com a lista de tarefas que você precisa concluir hoje."
            valor={config.email_card_prazo_amanha}
            onChange={(v) => alterar('email_card_prazo_amanha', v)}
            disabled={!admin}
          />
          <Toggle
            label="Contrato vencendo / vencido (Governança)"
            descricao="Aviso semanal aos admins sobre contratos vigentes próximos do vencimento ou já vencidos. Cada contrato re-alerta a cada 7 dias enquanto continuar na janela."
            valor={config.email_contrato_vencendo}
            onChange={(v) => alterar('email_contrato_vencendo', v)}
            disabled={!admin}
          />
        </div>
      </section>

      <section className="mt-6 rounded-xl border border-slate-200 bg-white p-5">
        <h2 className="flex items-center gap-2 text-sm font-semibold uppercase tracking-wide text-slate-500">
          <Clock size={14} /> Antecedência dos avisos
        </h2>
        <div className="mt-4 grid gap-4 md:grid-cols-2">
          <CampoNumero
            label="Dias antes do vencimento de contas"
            descricao="No resumo diário, quantos dias antes começam a aparecer."
            valor={config.dias_aviso_conta_vencendo}
            onChange={(v) => alterar('dias_aviso_conta_vencendo', v)}
            min={1} max={30}
            disabled={!admin}
          />
          <CampoNumero
            label="Dias antes do pró-labore/distribuição"
            descricao="Para movimentos de sócios ainda previstos."
            valor={config.dias_aviso_movimento_socio_vencendo}
            onChange={(v) => alterar('dias_aviso_movimento_socio_vencendo', v)}
            min={1} max={30}
            disabled={!admin}
          />
        </div>
      </section>

      {erro && (
        <div className="mt-4 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
          {erro}
        </div>
      )}
      {ok && (
        <div className="mt-4 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-700">
          {ok}
        </div>
      )}

      {admin && (
        <div className="mt-6 flex justify-end">
          <button
            type="button"
            onClick={salvar}
            disabled={salvando}
            className="inline-flex items-center gap-2 rounded-lg bg-nexus-700 px-4 py-2 text-sm font-medium text-white shadow-sm transition-colors hover:bg-nexus-800 disabled:opacity-60"
          >
            <Save size={16} />
            {salvando ? 'Salvando…' : 'Salvar configurações'}
          </button>
        </div>
      )}

      <div className="mt-10 rounded-xl border border-slate-200 bg-slate-50 p-4 text-xs text-slate-600">
        <div className="mb-1 flex items-center gap-2 font-medium text-slate-700">
          <Bell size={12} /> Sobre o envio de e-mails
        </div>
        Os e-mails saem pelo provedor configurado no servidor (Resend). Se a integração
        não estiver ligada, o aviso ainda aparece no sino, mas o e-mail não é enviado —
        e ficamos com um registro de "pulado" na auditoria.
      </div>
    </div>
  );
}

function Toggle({ label, descricao, valor, onChange, disabled }) {
  return (
    <div className="flex items-start justify-between gap-4 py-3">
      <div className="flex-1 min-w-0">
        <div className="text-sm font-medium text-slate-900">{label}</div>
        {descricao && <div className="mt-0.5 text-xs text-slate-500">{descricao}</div>}
      </div>
      <button
        type="button"
        role="switch"
        aria-checked={!!valor}
        disabled={disabled}
        onClick={() => onChange(!valor)}
        className={[
          'relative inline-flex h-6 w-11 shrink-0 cursor-pointer items-center rounded-full transition-colors',
          valor ? 'bg-nexus-700' : 'bg-slate-300',
          disabled ? 'opacity-50 cursor-not-allowed' : '',
        ].join(' ')}
      >
        <span
          className={[
            'inline-block h-5 w-5 transform rounded-full bg-white shadow transition-transform',
            valor ? 'translate-x-5' : 'translate-x-0.5',
          ].join(' ')}
        />
      </button>
    </div>
  );
}

function CampoNumero({ label, descricao, valor, onChange, min, max, disabled }) {
  return (
    <div>
      <label className="block text-sm font-medium text-slate-900">{label}</label>
      {descricao && <p className="mt-0.5 text-xs text-slate-500">{descricao}</p>}
      <input
        type="number"
        min={min}
        max={max}
        value={valor ?? ''}
        disabled={disabled}
        onChange={(e) => {
          const v = parseInt(e.target.value, 10);
          if (!Number.isNaN(v)) onChange(Math.max(min, Math.min(max, v)));
        }}
        className="mt-2 w-32 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm shadow-sm outline-none focus:border-nexus-500 focus:ring-2 focus:ring-nexus-200 disabled:bg-slate-50 disabled:text-slate-500"
      />
    </div>
  );
}
