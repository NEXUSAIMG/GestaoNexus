import { createContext, useContext, useEffect, useState, useCallback } from 'react';
import { api } from '../api/client.js';

/**
 * Contexto de autenticação — Sprint 1.5
 *
 * Agora quem loga é uma "pessoa de acesso", e essa pessoa pode
 * representar múltiplos sócios (titular de si mesma, procuradora de outra
 * pessoa/empresa, representante legal, etc).
 *
 * Estado exposto:
 *   - pessoa               → { id, nome, email, administrador } — quem está logada
 *   - representacoes       → lista de representações ativas da pessoa
 *   - representacaoAtual   → a representação em uso no momento (ou null)
 *   - contextoSocioId      → id do sócio "em nome de quem" estamos agindo
 *   - precisaEscolherContexto → true se a pessoa tem >1 representação e ainda não escolheu
 *
 * Ações:
 *   - login(email, senha)
 *   - escolherContexto(socio_id)  → troca o token para agir em nome desse sócio
 *   - sair()
 *   - recarregar()                → busca /auth/eu novamente (após edição de representações)
 */

const AuthContext = createContext(null);

const CHAVE_TOKEN = 'nexus_token';
const CHAVE_SESSAO = 'nexus_sessao';

function salvarSessao(dados) {
  try {
    localStorage.setItem(CHAVE_SESSAO, JSON.stringify(dados));
  } catch { /* ignora QuotaExceeded */ }
}

function lerSessaoSalva() {
  try {
    const raw = localStorage.getItem(CHAVE_SESSAO);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function sessaoVazia() {
  return {
    pessoa: null,
    representacoes: [],
    representacaoAtual: null,
    contextoSocioId: null,
  };
}

export function AuthProvider({ children }) {
  const [sessao, setSessao] = useState(() => lerSessaoSalva() || sessaoVazia());
  const [carregando, setCarregando] = useState(true);

  // Ao montar, valida o token chamando /auth/eu. Se estiver inválido,
  // o interceptor do axios limpa tudo e redireciona.
  useEffect(() => {
    const token = localStorage.getItem(CHAVE_TOKEN);
    if (!token) {
      setCarregando(false);
      return;
    }
    api.get('/auth/eu')
      .then((res) => {
        const nova = {
          pessoa: res.data.pessoa,
          representacoes: res.data.representacoes ?? [],
          representacaoAtual: res.data.representacao_atual ?? null,
          contextoSocioId: res.data.contexto_socio_id ?? null,
        };
        setSessao(nova);
        salvarSessao(nova);
      })
      .catch(() => setSessao(sessaoVazia()))
      .finally(() => setCarregando(false));
  }, []);

  const login = useCallback(async (email, senha) => {
    const res = await api.post('/auth/login', { email, senha });
    const { token, pessoa, representacoes, contexto_definido, precisa_escolher_contexto } = res.data;

    localStorage.setItem(CHAVE_TOKEN, token);

    // Se o backend já definiu um contexto (única representação ou admin puro),
    // já temos a representacaoAtual. Caso contrário, fica null e o App redireciona
    // para /escolher-contexto.
    const representacaoAtual = (contexto_definido && representacoes.length === 1)
      ? representacoes[0]
      : null;

    const nova = {
      pessoa,
      representacoes: representacoes ?? [],
      representacaoAtual,
      contextoSocioId: representacaoAtual ? representacaoAtual.socio_id : null,
    };
    setSessao(nova);
    salvarSessao(nova);

    // Admin nunca é obrigado a escolher contexto — ele pode alternar pelo dropdown
    // do menu a qualquer momento e também opera em "modo administração" sem contexto.
    const precisaEscolher = !!precisa_escolher_contexto && !pessoa?.administrador;
    return { precisaEscolherContexto: precisaEscolher };
  }, []);

  const escolherContexto = useCallback(async (socio_id) => {
    const res = await api.post('/auth/trocar-contexto', { socio_id });
    localStorage.setItem(CHAVE_TOKEN, res.data.token);

    // Reconsulta /auth/eu para pegar representacaoAtual completa com os poderes.
    const eu = await api.get('/auth/eu');
    const nova = {
      pessoa: eu.data.pessoa,
      representacoes: eu.data.representacoes ?? [],
      representacaoAtual: eu.data.representacao_atual ?? null,
      contextoSocioId: eu.data.contexto_socio_id ?? null,
    };
    setSessao(nova);
    salvarSessao(nova);
  }, []);

  const sair = useCallback(() => {
    localStorage.removeItem(CHAVE_TOKEN);
    localStorage.removeItem(CHAVE_SESSAO);
    setSessao(sessaoVazia());
  }, []);

  const recarregar = useCallback(async () => {
    try {
      const eu = await api.get('/auth/eu');
      const nova = {
        pessoa: eu.data.pessoa,
        representacoes: eu.data.representacoes ?? [],
        representacaoAtual: eu.data.representacao_atual ?? null,
        contextoSocioId: eu.data.contexto_socio_id ?? null,
      };
      setSessao(nova);
      salvarSessao(nova);
    } catch { /* interceptor cuida de 401 */ }
  }, []);

  const autenticado = !!sessao.pessoa;
  const precisaEscolherContexto =
    autenticado
    && sessao.representacoes.length > 1
    && !sessao.representacaoAtual
    && !sessao.pessoa.administrador; // admin pode circular sem escolher

  const temPoder = useCallback((nome) => {
    if (sessao.pessoa?.administrador) return true;
    const p = sessao.representacaoAtual?.poderes;
    return !!p?.[nome];
  }, [sessao]);

  const valor = {
    ...sessao,
    autenticado,
    precisaEscolherContexto,
    carregando,
    login,
    escolherContexto,
    sair,
    recarregar,
    temPoder,
  };

  return <AuthContext.Provider value={valor}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth deve ser usado dentro de AuthProvider');
  return ctx;
}
