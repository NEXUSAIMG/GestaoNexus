import axios from 'axios';

/**
 * Cliente HTTP central.
 *
 * - Em dev, VITE_API_URL fica vazia e o Vite faz proxy de /api para o backend.
 * - Em produção, o backend serve o frontend no mesmo host, então /api também funciona.
 * - Se precisar apontar para outro host (staging, etc.), defina VITE_API_URL.
 */
const baseURL = import.meta.env.VITE_API_URL?.trim() || '/api';

// Exportado pra montar URLs de download diretas (ex: <a href> para arquivos
// servidos pelo backend) quando o axios não serve.
export const BASE_URL = baseURL;

export const api = axios.create({
  baseURL,
  headers: { 'Content-Type': 'application/json' },
  timeout: 15_000,
});

// Injeta o token JWT em todas as requisições, se houver.
api.interceptors.request.use((config) => {
  const token = localStorage.getItem('nexus_token');
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

// Se o backend devolver 401, limpa a sessão e força o login de novo.
api.interceptors.response.use(
  (res) => res,
  (err) => {
    if (err.response?.status === 401) {
      localStorage.removeItem('nexus_token');
      localStorage.removeItem('nexus_sessao');
      // Só redireciona se não estivermos já na tela de login,
      // para não travar o formulário quando a senha estiver errada.
      if (!window.location.pathname.startsWith('/login')) {
        window.location.assign('/login');
      }
    }
    return Promise.reject(err);
  },
);

/**
 * Extrai a mensagem de erro num formato amigável.
 *
 * Trata erros de validação do backend (Zod) que vêm com `detalhes: [{campo, mensagem}]`,
 * exibindo os campos específicos. Sem isso o usuário só vê "Dados inválidos"
 * genérico, sem saber qual campo corrigir.
 */
export function mensagemDeErro(err, fallback = 'Algo deu errado. Tente de novo.') {
  const data = err?.response?.data;

  // Erro de validação do Zod — mostra qual campo falhou.
  if (data?.codigo === 'validacao' && Array.isArray(data.detalhes) && data.detalhes.length > 0) {
    const partes = data.detalhes.map((d) => {
      if (d.campo) return `${d.campo}: ${d.mensagem}`;
      return d.mensagem;
    });
    return `${data.erro}— ${partes.join('; ')}`;
  }

  return data?.erro || err?.message || fallback;
}
