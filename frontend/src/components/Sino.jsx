import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Bell, BellRing, Check, Trash2, X } from 'lucide-react';
import { api, mensagemDeErro } from '../api/client.js';

/**
 * Sino de notificações — Sprint 7.
 *
 * - Busca contagem em /api/notificacoes/contagem a cada 60s.
 * - Ao abrir o popover, busca a lista das últimas 30.
 * - Click em uma notificação marca como lida e (se tiver link) navega.
 * - Botão "Marcar todas como lidas" chama o endpoint correspondente.
 *
 * Como cada pessoa só vê suas próprias notificações, não precisa de
 * filtro por contexto — o backend já amarra pelo JWT.
 */
export default function Sino() {
  const [contagem, setContagem] = useState({ nao_lidas: 0, total_30d: 0 });
  const [aberto, setAberto] = useState(false);
  const [carregando, setCarregando] = useState(false);
  const [lista, setLista] = useState([]);
  const [erro, setErro] = useState('');
  const refContainer = useRef(null);
  const navigate = useNavigate();

  // Polling da contagem.
  useEffect(() => {
    let ativo = true;
    async function buscarContagem() {
      try {
        const r = await api.get('/notificacoes/contagem');
        if (ativo) setContagem(r.data);
      } catch {
        // ignora — pode estar offline
      }
    }
    buscarContagem();
    const id = setInterval(buscarContagem, 60_000);
    return () => { ativo = false; clearInterval(id); };
  }, []);

  // Fecha o popover ao clicar fora ou pressionar Escape.
  useEffect(() => {
    if (!aberto) return;
    function onClick(e) {
      if (refContainer.current && !refContainer.current.contains(e.target)) {
        setAberto(false);
      }
    }
    function onKey(e) { if (e.key === 'Escape') setAberto(false); }
    document.addEventListener('mousedown', onClick);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onClick);
      document.removeEventListener('keydown', onKey);
    };
  }, [aberto]);

  async function abrir() {
    if (aberto) { setAberto(false); return; }
    setAberto(true);
    setCarregando(true);
    setErro('');
    try {
      const r = await api.get('/notificacoes', { params: { filtro: 'todas', limite: 30 } });
      setLista(r.data);
    } catch (err) {
      setErro(mensagemDeErro(err, 'Não consegui carregar suas notificações.'));
    } finally {
      setCarregando(false);
    }
  }

  async function aoClicar(notif) {
    // Marca como lida primeiro (otimista).
    if (!notif.lida) {
      setLista((atual) => atual.map((n) => n.id === notif.id ? { ...n, lida: true } : n));
      setContagem((c) => ({ ...c, nao_lidas: Math.max(0, c.nao_lidas - 1) }));
      api.post(`/notificacoes/${notif.id}/marcar-lida`).catch(() => {});
    }
    if (notif.link) {
      setAberto(false);
      navigate(notif.link);
    }
  }

  async function marcarTodas() {
    try {
      await api.post('/notificacoes/marcar-todas-lidas');
      setLista((atual) => atual.map((n) => ({ ...n, lida: true })));
      setContagem((c) => ({ ...c, nao_lidas: 0 }));
    } catch (err) {
      setErro(mensagemDeErro(err, 'Não consegui marcar como lidas.'));
    }
  }

  async function excluir(notif, e) {
    e.stopPropagation();
    setLista((atual) => atual.filter((n) => n.id !== notif.id));
    if (!notif.lida) {
      setContagem((c) => ({ ...c, nao_lidas: Math.max(0, c.nao_lidas - 1) }));
    }
    api.delete(`/notificacoes/${notif.id}`).catch(() => {});
  }

  const temNaoLidas = contagem.nao_lidas > 0;

  return (
    <div ref={refContainer} className="relative">
      <button
        type="button"
        onClick={abrir}
        className={[
          'relative flex items-center justify-center rounded-lg p-2 transition-colors',
          'hover:bg-black/5 dark:hover:bg-white/10',
        ].join(' ')}
        aria-label={`Notificações${temNaoLidas ? ` (${contagem.nao_lidas} não lidas)` : ''}`}
      >
        {temNaoLidas ? <BellRing size={18} /> : <Bell size={18} />}
        {temNaoLidas && (
          <span className="absolute -top-0.5 -right-0.5 flex h-4 min-w-[16px] items-center justify-center rounded-full bg-red-500 px-1 text-[10px] font-semibold text-white">
            {contagem.nao_lidas > 99 ? '99+' : contagem.nao_lidas}
          </span>
        )}
      </button>

      {aberto && (
        <div className="absolute right-0 top-full mt-2 w-80 rounded-xl border border-slate-200 bg-white text-slate-900 shadow-lg z-50 max-h-[70vh] flex flex-col">
          <div className="flex items-center justify-between border-b border-slate-200 px-4 py-3">
            <div className="text-sm font-semibold">Notificações</div>
            <div className="flex items-center gap-1">
              {lista.some((n) => !n.lida) && (
                <button
                  type="button"
                  onClick={marcarTodas}
                  className="rounded-md px-2 py-1 text-xs text-nexus-700 hover:bg-nexus-50"
                  title="Marcar todas como lidas"
                >
                  <Check size={14} className="inline mr-1" />
                  Tudo lido
                </button>
              )}
              <button
                type="button"
                onClick={() => setAberto(false)}
                className="rounded-md p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-600"
                aria-label="Fechar"
              >
                <X size={16} />
              </button>
            </div>
          </div>

          <div className="flex-1 overflow-y-auto">
            {carregando ? (
              <div className="px-4 py-6 text-sm text-slate-500">Carregando…</div>
            ) : erro ? (
              <div className="px-4 py-6 text-sm text-red-600">{erro}</div>
            ) : lista.length === 0 ? (
              <div className="px-4 py-10 text-center text-sm text-slate-500">
                Nada por aqui ainda.<br />
                <span className="text-xs">Quando houver novidade você vai ver aqui.</span>
              </div>
            ) : (
              <ul>
                {lista.map((n) => (
                  <li
                    key={n.id}
                    onClick={() => aoClicar(n)}
                    className={[
                      'group cursor-pointer border-b border-slate-100 px-4 py-3 transition-colors',
                      n.lida ? 'bg-white hover:bg-slate-50' : 'bg-nexus-50/40 hover:bg-nexus-50',
                    ].join(' ')}
                  >
                    <div className="flex items-start gap-2">
                      {!n.lida && <span className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-nexus-700" />}
                      <div className="flex-1 min-w-0">
                        <div className={['text-sm leading-snug', n.lida ? 'text-slate-700' : 'font-medium text-slate-900'].join(' ')}>
                          {n.titulo}
                        </div>
                        {n.descricao && (
                          <div className="mt-0.5 text-xs text-slate-500 line-clamp-2">{n.descricao}</div>
                        )}
                        <div className="mt-1 text-[11px] text-slate-400">
                          {formatarRelativo(n.criada_em)}
                        </div>
                      </div>
                      <button
                        type="button"
                        onClick={(e) => excluir(n, e)}
                        className="opacity-0 group-hover:opacity-100 rounded p-1 text-slate-300 hover:bg-slate-200 hover:text-slate-600"
                        aria-label="Excluir"
                        title="Excluir"
                      >
                        <Trash2 size={13} />
                      </button>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

/** "há 5 min", "há 2h", "ontem", "12/04" — formato simples e curto. */
function formatarRelativo(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  const agora = new Date();
  const diffMs = agora - d;
  const min = Math.floor(diffMs / 60_000);
  if (min < 1) return 'agora';
  if (min < 60) return `há ${min} min`;
  const h = Math.floor(min / 60);
  if (h < 24) return `há ${h}h`;
  const dias = Math.floor(h / 24);
  if (dias === 1) return 'ontem';
  if (dias < 7) return `há ${dias} dias`;
  return d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' });
}
