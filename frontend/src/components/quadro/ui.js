/**
 * Base compartilhada do módulo de Quadro (Sprint 34 — refactor).
 *
 * Tudo que era duplicado dentro do Quadro.jsx (1.7k linhas) mora aqui:
 * paleta de cores, classes de input, formatação de prazo e o util de
 * movimentação otimista de card.
 */

export const COR_CHIP = {
  slate: 'bg-slate-100 text-slate-700 border-slate-200',
  red: 'bg-red-100 text-red-700 border-red-200',
  orange: 'bg-orange-100 text-orange-700 border-orange-200',
  amber: 'bg-amber-100 text-amber-700 border-amber-200',
  yellow: 'bg-yellow-100 text-yellow-700 border-yellow-200',
  lime: 'bg-lime-100 text-lime-700 border-lime-200',
  emerald: 'bg-emerald-100 text-emerald-700 border-emerald-200',
  teal: 'bg-teal-100 text-teal-700 border-teal-200',
  cyan: 'bg-cyan-100 text-cyan-700 border-cyan-200',
  blue: 'bg-blue-100 text-blue-700 border-blue-200',
  indigo: 'bg-indigo-100 text-indigo-700 border-indigo-200',
  violet: 'bg-violet-100 text-violet-700 border-violet-200',
  fuchsia: 'bg-fuchsia-100 text-fuchsia-700 border-fuchsia-200',
  pink: 'bg-pink-100 text-pink-700 border-pink-200',
  rose: 'bg-rose-100 text-rose-700 border-rose-200',
};

export const CORES = Object.keys(COR_CHIP);

export const inputCls = 'w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm shadow-sm outline-none focus:border-nexus-500 focus:ring-2 focus:ring-nexus-200';

/** Converte o token de cor da paleta na classe de fundo "forte" (capa, bolinha). */
export function corForte(token, tom = '-400') {
  const base = (COR_CHIP[token] || COR_CHIP.slate).split(' ')[0];
  return base.replace('-100', tom);
}

// ---------------------------------------------------------------------------
// Sprint 34 — prioridade
// ---------------------------------------------------------------------------
// 2 = normal e NÃO ganha selo. Um quadro em que tudo tem etiqueta de
// prioridade é um quadro sem prioridade nenhuma — só destacamos o que
// foge do normal.
export const PRIORIDADES = [
  { valor: 0, sigla: 'P0', nome: 'Crítica', chip: 'bg-red-600 text-white border-red-700' },
  { valor: 1, sigla: 'P1', nome: 'Alta', chip: 'bg-orange-100 text-orange-800 border-orange-300' },
  { valor: 2, sigla: 'P2', nome: 'Normal', chip: 'bg-slate-100 text-slate-600 border-slate-200' },
  { valor: 3, sigla: 'P3', nome: 'Baixa', chip: 'bg-slate-50 text-slate-400 border-slate-200' },
];

export function prioridadeDe(valor) {
  return PRIORIDADES.find((p) => p.valor === Number(valor ?? 2)) || PRIORIDADES[2];
}

// ---------------------------------------------------------------------------
// Sprint 34 — tipo de coluna
// ---------------------------------------------------------------------------
export const TIPOS_COLUNA = [
  { valor: 'backlog', nome: 'Backlog', ajuda: 'Fila de espera. Não conta como trabalho em andamento.' },
  { valor: 'em_andamento', nome: 'Em andamento', ajuda: 'Trabalho ativo. Entra na conta do WIP e do cycle time.' },
  { valor: 'concluida', nome: 'Concluída', ajuda: 'Entrega. Carimba a data de conclusão e libera os cards que dependiam deste.' },
];

export const TIPOS_VINCULO = [
  { valor: 'cartorio', nome: 'Cartório', rota: '/cartorios' },
  { valor: 'contrato', nome: 'Contrato', rota: '/contratos' },
  { valor: 'processo_instancia', nome: 'Processo em andamento', rota: '/instancias' },
  { valor: 'produto', nome: 'Produto', rota: '/portfolio' },
  { valor: 'conta_pagar', nome: 'Conta a pagar', rota: '/contas-pagar' },
];

// ---------------------------------------------------------------------------
// Formatação
// ---------------------------------------------------------------------------

export function formatarPrazo(iso) {
  if (!iso) return null;
  const d = new Date(String(iso).slice(0, 10) + 'T12:00:00');
  const hoje = new Date(); hoje.setHours(0, 0, 0, 0);
  const dHoje = new Date(d); dHoje.setHours(0, 0, 0, 0);
  const diff = Math.round((dHoje - hoje) / 86400000);
  let label; let cor;
  if (diff < 0) { label = Math.abs(diff) + 'd atrás'; cor = 'text-red-700 bg-red-50 border-red-200'; }
  else if (diff === 0) { label = 'Hoje'; cor = 'text-amber-800 bg-amber-50 border-amber-200'; }
  else if (diff === 1) { label = 'Amanhã'; cor = 'text-amber-800 bg-amber-50 border-amber-200'; }
  else if (diff <= 7) { label = 'em ' + diff + 'd'; cor = 'text-slate-700 bg-slate-50 border-slate-200'; }
  else {
    label = d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' });
    cor = 'text-slate-700 bg-slate-50 border-slate-200';
  }
  return { label, cor, dataCompleta: d.toLocaleDateString('pt-BR') };
}

export function iniciais(nome) {
  return (nome || '?').split(' ').filter(Boolean).slice(0, 2)
    .map((p) => p[0]?.toUpperCase()).join('');
}

/** Minutos -> "2h30" / "45min". */
export function formatarMinutos(min) {
  const m = Number(min || 0);
  if (m <= 0) return '0';
  const h = Math.floor(m / 60);
  const r = m % 60;
  if (h === 0) return r + 'min';
  if (r === 0) return h + 'h';
  return h + 'h' + String(r).padStart(2, '0');
}

/**
 * Move o card localmente (preview otimista antes da resposta do servidor).
 */
export function moverCardLocal(quadro, cardId, novaColunaId, novaPosicao) {
  const cardsRestantes = quadro.cards.filter((c) => c.id !== cardId);
  const card = quadro.cards.find((c) => c.id === cardId);
  if (!card) return quadro;

  const cardsNoDestino = cardsRestantes
    .filter((c) => c.coluna_id === novaColunaId)
    .sort((a, b) => a.ordem - b.ordem);

  const cardAtualizado = { ...card, coluna_id: novaColunaId };
  cardsNoDestino.splice(novaPosicao, 0, cardAtualizado);
  cardsNoDestino.forEach((c, i) => { c.ordem = (i + 1) * 1000; });

  const cardsForaDestino = cardsRestantes.filter((c) => c.coluna_id !== novaColunaId);
  return { ...quadro, cards: [...cardsForaDestino, ...cardsNoDestino] };
}
