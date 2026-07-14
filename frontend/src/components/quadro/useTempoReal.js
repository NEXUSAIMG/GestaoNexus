import { useEffect, useRef, useState } from 'react';
import { BASE_URL } from '../../api/client.js';

/**
 * Sprint 38.1 — Hook de tempo real (SSE).
 *
 * Abre um EventSource para /quadros/:id/stream e, a cada evento "mudou",
 * chama `aoMudar` (com debounce curto — várias mudanças em rajada viram
 * um recarregamento só).
 *
 * Detalhes que evitam dor:
 *   - Token na query: o EventSource não manda header. O backend só emite
 *     avisos "mudou" (sem dado), então a URL vazar em log não vaza conteúdo.
 *   - O EventSource reconecta sozinho ao cair. Se o token expirar, o backend
 *     responde 401 e o navegador fica retentando — tratamos marcando
 *     `conectado=false` para a UI mostrar "offline" em vez de mentir "ao vivo".
 *   - `aoMudar` fica numa ref: assim o effect não reabre a conexão a cada
 *     render (senão o board piscaria e a conexão viveria menos que 1s).
 *
 * Devolve `{ conectado }` para um badge de status.
 */
export function useTempoReal(quadroId, aoMudar) {
  const [conectado, setConectado] = useState(false);
  const aoMudarRef = useRef(aoMudar);
  aoMudarRef.current = aoMudar;

  useEffect(() => {
    if (!quadroId) return undefined;
    const token = localStorage.getItem('nexus_token');
    if (!token) return undefined;

    const url = BASE_URL + '/quadros/' + quadroId + '/stream?token=' + encodeURIComponent(token);
    let es;
    let debounce;
    let fechado = false;

    try {
      es = new EventSource(url);
    } catch {
      return undefined;
    }

    es.addEventListener('conectado', () => {
      if (!fechado) setConectado(true);
    });

    es.addEventListener('mudou', () => {
      // Debounce: rajada de mudanças (ex.: alguém arrastando vários cards)
      // vira UM recarregamento.
      clearTimeout(debounce);
      debounce = setTimeout(() => {
        aoMudarRef.current?.();
      }, 350);
    });

    es.onopen = () => { if (!fechado) setConectado(true); };
    es.onerror = () => {
      // O navegador reabre sozinho; enquanto isso, marcamos offline.
      if (!fechado) setConectado(false);
    };

    return () => {
      fechado = true;
      clearTimeout(debounce);
      es.close();
      setConectado(false);
    };
  }, [quadroId]);

  return { conectado };
}
