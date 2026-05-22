import { useEffect, useMemo, useRef, useState } from 'react';
import {
  UserPlus, Edit2, KeyRound, Shield, CheckCircle2, XCircle, X, Mail, Link2,
  Eye, EyeOff, Lock,
} from 'lucide-react';
import { api, mensagemDeErro } from '../api/client.js';
import { useAuth } from '../context/AuthContext.jsx';

/**
 * CRUD de pessoas de acesso — Sprint 1.5.
 *
 * "Pessoa de acesso" é quem efetivamente loga na ferramenta.
 * Pode ser um sócio titular, um representante/procurador, ou apenas
 * um administrador do sistema sem vínculo societário.
 *
 * Só administradores veem esta tela. A rota é protegida em dois níveis:
 * AdminRoute no frontend e exigirAdmin no backend.
 */

function formatarData(d) {
  if (!d) return '—';
  try {
    return new Date(d).toLocaleString('pt-BR', {
      dateStyle: 'short',
      timeStyle: 'short',
    });
  } catch { return '—'; }
}

export default function Pessoas() {
  const { pessoa: eu } = useAuth();
  const [pessoas, setPessoas] = useState([]);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState('');
  const [modal, setModal] = useState(null);
  // modal = { tipo: 'novo' | 'editar' | 'senha', pessoa?: {} }

  // Sprint 30 — gate de versão pra evitar race condition em operações rápidas.
  const carregaIdRef = useRef(0);

  async function carregar() {
    const meuId = ++carregaIdRef.current;
    setCarregando(true);
    setErro('');
    try {
      const res = await api.get('/pessoas');
      if (meuId !== carregaIdRef.current) return;
      setPessoas(res.data);
    } catch (err) {
      if (meuId === carregaIdRef.current) {
        setErro(mensagemDeErro(err, 'Não foi possível carregar as pessoas.'));
      }
    } finally {
      if (meuId === carregaIdRef.current) {
        setCarregando(false);
      }
    }
  }

  useEffect(() => { carregar(); }, []);

  const resumo = useMemo(() => ({
    total: pessoas.length,
    ativas: pessoas.filter((p) => p.ativo).length,
    administradoras: pessoas.filter((p) => p.administrador && p.ativo).length,
    comRepresentacoes: pessoas.filter((p) => (p.qtd_representacoes ?? 0) > 0).length,
  }), [pessoas]);

  return (
    <div className="max-w-6xl">
      <div className="flex flex-wrap items-start justify-between gap-4 mb-6">
        <div>
          <h1 className="text-2xl font-semibold text-slate-900">Pessoas de acesso</h1>
          <p className="mt-1 text-slate-600">
            Quem pode entrar na ferramenta. Para dar a uma pessoa o direito de agir
            em nome de um sócio, cadastre uma <em>representação</em>.
          </p>
        </div>

        <button
          type="button"
          onClick={() => setModal({ tipo: 'novo' })}
          className="inline-flex items-center gap-2 rounded-lg bg-nexus-700 px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-nexus-800"
        >
          <UserPlus size={16} />
          Nova pessoa
        </button>
      </div>

      <div className="mb-6 grid gap-3 sm:grid-cols-4">
        <Cartao rotulo="Total cadastradas" valor={resumo.total} />
        <Cartao rotulo="Ativas" valor={resumo.ativas} />
        <Cartao rotulo="Administradoras" valor={resumo.administradoras} />
        <Cartao rotulo="Com representação" valor={resumo.comRepresentacoes} />
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
              <th className="px-4 py-3">E-mail</th>
              <th className="px-4 py-3">Papel</th>
              <th className="px-4 py-3 text-center">Representações</th>
              <th className="px-4 py-3">Status</th>
              <th className="px-4 py-3">Último acesso</th>
              <th className="px-4 py-3"></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {carregando && (
              <tr>
                <td colSpan={7} className="px-4 py-8 text-center text-slate-500">
                  Carregando...
                </td>
              </tr>
            )}
            {!carregando && pessoas.length === 0 && (
              <tr>
                <td colSpan={7} className="px-4 py-8 text-center text-slate-500">
                  Nenhuma pessoa cadastrada.
                </td>
              </tr>
            )}
            {!carregando && pessoas.map((p) => (
              <tr key={p.id} className={p.ativo ? '' : 'bg-slate-50/60 text-slate-500'}>
                <td className="px-4 py-3 font-medium text-slate-900">
                  {p.nome}
                  {p.id === eu?.id && (
                    <span className="ml-2 rounded bg-nexus-100 px-1.5 py-0.5 text-[10px] font-medium text-nexus-700">
                      você
                    </span>
                  )}
                </td>
                <td className="px-4 py-3 text-slate-600">
                  <span className="inline-flex items-center gap-1.5">
                    <Mail size={13} className="text-slate-400" />
                    {p.email}
                  </span>
                </td>
                <td className="px-4 py-3">
                  {p.administrador ? (
                    <span className="inline-flex items-center gap-1 rounded-full bg-nexus-50 px-2 py-0.5 text-xs font-medium text-nexus-700">
                      <Shield size={12} />
                      Administrador
                    </span>
                  ) : p.acesso_restrito ? (
                    <span className="inline-flex items-center gap-1 rounded-full bg-amber-50 px-2 py-0.5 text-xs font-medium text-amber-700" title="Só vê Tarefas, Processos, Em andamento e Cartórios">
                      <Lock size={12} />
                      Acesso restrito
                    </span>
                  ) : (
                    <span className="text-xs text-slate-500">Pessoa de acesso</span>
                  )}
                </td>
                <td className="px-4 py-3 text-center">
                  {(p.qtd_representacoes ?? 0) > 0 ? (
                    <span className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-700">
                      <Link2 size={12} />
                      {p.qtd_representacoes}
                    </span>
                  ) : (
                    <span className="text-xs text-slate-400">—</span>
                  )}
                </td>
                <td className="px-4 py-3">
                  {p.ativo ? (
                    <span className="inline-flex items-center gap-1 text-xs text-emerald-700">
                      <CheckCircle2 size={14} /> Ativa
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-1 text-xs text-slate-500">
                      <XCircle size={14} /> Inativa
                    </span>
                  )}
                </td>
                <td className="px-4 py-3 text-slate-600 text-xs">
                  {formatarData(p.ultimo_login_em)}
                </td>
                <td className="px-4 py-3 text-right">
                  <div className="flex justify-end gap-1">
                    <button
                      type="button"
                      onClick={() => setModal({ tipo: 'senha', pessoa: p })}
                      className="rounded-md p-1.5 text-slate-500 hover:bg-slate-100 hover:text-slate-700"
                      title={p.id === eu?.id ? 'Trocar minha senha' : 'Resetar senha'}
                    >
                      <KeyRound size={15} />
                    </button>
                    <button
                      type="button"
                      onClick={() => setModal({ tipo: 'editar', pessoa: p })}
                      className="rounded-md p-1.5 text-slate-500 hover:bg-slate-100 hover:text-slate-700"
                      title="Editar"
                    >
                      <Edit2 size={15} />
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {modal?.tipo === 'novo' && (
        <ModalPessoa
          aoFechar={() => setModal(null)}
          aoSalvar={async (dados) => {
            await api.post('/pessoas', dados);
            setModal(null);
            carregar();
          }}
        />
      )}

      {modal?.tipo === 'editar' && (
        <ModalPessoa
          pessoa={modal.pessoa}
          aoFechar={() => setModal(null)}
          aoSalvar={async (dados) => {
            await api.put(`/pessoas/${modal.pessoa.id}`, dados);
            setModal(null);
            carregar();
          }}
        />
      )}

      {modal?.tipo === 'senha' && (
        <ModalSenha
          pessoa={modal.pessoa}
          eu={eu}
          aoFechar={() => setModal(null)}
          aoSalvar={async (payload) => {
            await api.post(`/pessoas/${modal.pessoa.id}/senha`, payload);
            setModal(null);
          }}
        />
      )}
    </div>
  );
}

function Cartao({ rotulo, valor }) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
      <div className="text-xs font-medium uppercase tracking-wide text-slate-500">{rotulo}</div>
      <div className="mt-1 text-2xl font-semibold tabular-nums text-slate-900">{valor}</div>
    </div>
  );
}

function ModalPessoa({ pessoa, aoFechar, aoSalvar }) {
  const ehNovo = !pessoa;
  const [form, setForm] = useState({
    nome: pessoa?.nome ?? '',
    email: pessoa?.email ?? '',
    senha: '',
    telefone: pessoa?.telefone ?? '',
    cpf: pessoa?.cpf ?? '',
    administrador: pessoa?.administrador ?? false,
    acesso_restrito: pessoa?.acesso_restrito ?? false,
    ativo: pessoa?.ativo ?? true,
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
        nome: form.nome.trim(),
        email: form.email.trim(),
        telefone: form.telefone?.trim() || null,
        cpf: form.cpf?.trim() || null,
        administrador: !!form.administrador,
        // Sprint 31 — acesso restrito (só aplica se não for admin; backend
        // também valida, mas garantimos consistência aqui)
        acesso_restrito: !!form.administrador ? false : !!form.acesso_restrito,
      };
      if (ehNovo) payload.senha = form.senha;
      else payload.ativo = !!form.ativo;

      await aoSalvar(payload);
    } catch (err) {
      setErro(mensagemDeErro(err, 'Não foi possível salvar.'));
    } finally {
      setSalvando(false);
    }
  }

  return (
    <Modal titulo={ehNovo ? 'Nova pessoa de acesso' : `Editar ${pessoa.nome}`} aoFechar={aoFechar}>
      <form onSubmit={enviar} className="space-y-4">
        <div className="grid gap-4 sm:grid-cols-2">
          <Campo rotulo="Nome completo" obrigatorio>
            <input
              type="text"
              required
              value={form.nome}
              onChange={(e) => atualizar('nome', e.target.value)}
              className={inputClasses}
            />
          </Campo>

          <Campo rotulo="E-mail" obrigatorio>
            <input
              type="email"
              required
              value={form.email}
              onChange={(e) => atualizar('email', e.target.value)}
              className={inputClasses}
            />
          </Campo>

          {ehNovo && (
            <Campo
              rotulo="Senha inicial"
              obrigatorio
              ajuda="Mínimo de 8 caracteres. A pessoa pode trocar depois."
            >
              <input
                type="text"
                required
                minLength={8}
                value={form.senha}
                onChange={(e) => atualizar('senha', e.target.value)}
                className={inputClasses}
              />
            </Campo>
          )}

          <Campo rotulo="Telefone">
            <input
              type="text"
              value={form.telefone}
              onChange={(e) => atualizar('telefone', e.target.value)}
              placeholder="(00) 00000-0000"
              className={inputClasses}
            />
          </Campo>

          <Campo rotulo="CPF">
            <input
              type="text"
              value={form.cpf}
              onChange={(e) => atualizar('cpf', e.target.value)}
              placeholder="000.000.000-00"
              className={inputClasses}
            />
          </Campo>
        </div>

        <div className="flex flex-wrap gap-5 pt-1">
          <label className="inline-flex items-center gap-2 text-sm text-slate-700">
            <input
              type="checkbox"
              checked={form.administrador}
              onChange={(e) => {
                atualizar('administrador', e.target.checked);
                // Se virou admin, automaticamente desliga acesso restrito
                if (e.target.checked) atualizar('acesso_restrito', false);
              }}
              className="h-4 w-4 rounded border-slate-300 text-nexus-700 focus:ring-nexus-500"
            />
            <Shield size={14} className="text-slate-500" />
            É administrador do sistema
          </label>

          {!ehNovo && (
            <label className="inline-flex items-center gap-2 text-sm text-slate-700">
              <input
                type="checkbox"
                checked={form.ativo}
                onChange={(e) => atualizar('ativo', e.target.checked)}
                className="h-4 w-4 rounded border-slate-300 text-nexus-700 focus:ring-nexus-500"
              />
              Ativa
            </label>
          )}
        </div>

        {/* Sprint 31 — Acesso restrito */}
        {!form.administrador && (
          <div className="rounded-lg border border-amber-200 bg-amber-50/60 p-3">
            <label className="flex items-start gap-2 text-sm text-amber-900">
              <input
                type="checkbox"
                checked={form.acesso_restrito}
                onChange={(e) => atualizar('acesso_restrito', e.target.checked)}
                className="mt-0.5 h-4 w-4 rounded border-amber-300 text-amber-600 focus:ring-amber-500"
              />
              <div>
                <span className="font-medium inline-flex items-center gap-1.5">
                  <Lock size={13} /> Acesso restrito
                </span>
                <div className="mt-0.5 text-xs text-amber-800">
                  Quando ligado, a pessoa só vê <strong>Tarefas</strong>, <strong>Processos</strong>,{' '}
                  <strong>Em andamento</strong> e <strong>Cartórios</strong>. Não aparecem os módulos
                  financeiros, de governança, cadastros nem configurações.
                  Reversivél a qualquer momento.
                </div>
              </div>
            </label>
          </div>
        )}

        <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-600">
          <strong className="text-slate-700">Vínculo com sócios:</strong> esta tela só
          cria a credencial. Para permitir que a pessoa aja em nome de um sócio,
          cadastre uma entrada em <em>Representações</em>.
        </div>

        {erro && (
          <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
            {erro}
          </div>
        )}

        <div className="flex justify-end gap-2 pt-2">
          <button type="button" onClick={aoFechar} className={botaoSecundario}>Cancelar</button>
          <button type="submit" disabled={salvando} className={botaoPrimario}>
            {salvando ? 'Salvando...' : (ehNovo ? 'Criar pessoa' : 'Salvar alterações')}
          </button>
        </div>
      </form>
    </Modal>
  );
}

function CampoSenha({ rotulo, obrigatorio, ajuda, value, onChange, autoComplete, minLength = 8 }) {
  const [mostrar, setMostrar] = useState(false);
  return (
    <label className="block">
      <span className="block text-sm font-medium text-slate-700">
        {rotulo}
        {obrigatorio && <span className="ml-0.5 text-red-500">*</span>}
      </span>
      <div className="relative mt-1">
        <input
          type={mostrar ? 'text' : 'password'}
          required={obrigatorio}
          minLength={minLength}
          value={value}
          onChange={onChange}
          autoComplete={autoComplete}
          className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 pr-10 text-sm shadow-sm outline-none focus:border-nexus-500 focus:ring-2 focus:ring-nexus-200"
        />
        <button
          type="button"
          onClick={() => setMostrar((v) => !v)}
          className="absolute inset-y-0 right-0 flex items-center px-3 text-slate-400 hover:text-slate-600"
          aria-label={mostrar ? 'Ocultar senha' : 'Mostrar senha'}
          tabIndex={-1}
        >
          {mostrar ? <EyeOff size={16} /> : <Eye size={16} />}
        </button>
      </div>
      {ajuda && <span className="mt-1 block text-xs text-slate-500">{ajuda}</span>}
    </label>
  );
}

function ModalSenha({ pessoa, eu, aoFechar, aoSalvar }) {
  const souEu = pessoa.id === eu?.id;
  const [senhaAtual, setSenhaAtual] = useState('');
  const [senhaNova, setSenhaNova] = useState('');
  const [confirmar, setConfirmar] = useState('');
  const [erro, setErro] = useState('');
  const [salvando, setSalvando] = useState(false);

  async function enviar(e) {
    e.preventDefault();
    setErro('');
    if (senhaNova !== confirmar) {
      setErro('A confirmação não confere com a nova senha.');
      return;
    }
    if (senhaNova.length < 8) {
      setErro('A nova senha deve ter pelo menos 8 caracteres.');
      return;
    }
    setSalvando(true);
    try {
      await aoSalvar({
        // Quando admin reseta de outra pessoa, o backend ignora senha_atual.
        senha_atual: souEu ? senhaAtual : 'n/a',
        senha_nova: senhaNova,
      });
    } catch (err) {
      setErro(mensagemDeErro(err, 'Não foi possível alterar a senha.'));
    } finally {
      setSalvando(false);
    }
  }

  return (
    <Modal
      titulo={souEu ? 'Trocar minha senha' : `Resetar senha — ${pessoa.nome}`}
      aoFechar={aoFechar}
    >
      <form onSubmit={enviar} className="space-y-4">
        {souEu && (
          <CampoSenha
            rotulo="Senha atual"
            obrigatorio
            value={senhaAtual}
            onChange={(e) => setSenhaAtual(e.target.value)}
            autoComplete="current-password"
            minLength={1}
          />
        )}

        {!souEu && (
          <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">
            Você está redefinindo a senha de outra pessoa. Informe a nova senha abaixo
            e avise-a por um canal seguro. Use o ícone do olho para conferir o valor
            antes de enviar.
          </div>
        )}

        <CampoSenha
          rotulo="Nova senha"
          obrigatorio
          ajuda="Mínimo de 8 caracteres."
          value={senhaNova}
          onChange={(e) => setSenhaNova(e.target.value)}
          autoComplete="new-password"
        />

        <CampoSenha
          rotulo="Confirmar nova senha"
          obrigatorio
          value={confirmar}
          onChange={(e) => setConfirmar(e.target.value)}
          autoComplete="new-password"
        />

        {erro && (
          <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
            {erro}
          </div>
        )}

        <div className="flex justify-end gap-2">
          <button type="button" onClick={aoFechar} className={botaoSecundario}>Cancelar</button>
          <button type="submit" disabled={salvando} className={botaoPrimario}>
            {salvando ? 'Salvando...' : (souEu ? 'Trocar senha' : 'Resetar senha')}
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
