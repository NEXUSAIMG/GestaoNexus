// Sprint 39 -- espelho de backend/src/utils/kanban-visual.js + estilos de render.
// Usamos style inline (hex/gradiente) em vez de classes Tailwind dinamicas,
// que nao existiriam no bundle (o Tailwind so inclui classes vistas no build).

export const CORES_KANBAN = [
  'slate', 'red', 'orange', 'amber', 'yellow',
  'lime', 'emerald', 'teal', 'cyan', 'blue',
  'indigo', 'violet', 'fuchsia', 'pink', 'rose',
];

// Nivel 500 do Tailwind por cor.
export const COR_HEX = {
  slate: '#64748b', red: '#ef4444', orange: '#f97316', amber: '#f59e0b',
  yellow: '#eab308', lime: '#84cc16', emerald: '#10b981', teal: '#14b8a6',
  cyan: '#06b6d4', blue: '#3b82f6', indigo: '#6366f1', violet: '#8b5cf6',
  fuchsia: '#d946ef', pink: '#ec4899', rose: '#f43f5e',
};

// Presets de gradiente (chave -> CSS). Chaves iguais ao backend.
export const PRESETS_VISUAL = {
  oceano: 'linear-gradient(135deg, #0ea5e9, #2563eb)',
  pordosol: 'linear-gradient(135deg, #f97316, #db2777)',
  floresta: 'linear-gradient(135deg, #10b981, #065f46)',
  roxo: 'linear-gradient(135deg, #8b5cf6, #6d28d9)',
  rosa: 'linear-gradient(135deg, #f472b6, #db2777)',
  grafite: 'linear-gradient(135deg, #334155, #0f172a)',
};
export const PRESETS_LISTA = Object.keys(PRESETS_VISUAL);

// Fundo do quadro: preset (gradiente) tem prioridade; senao cor solida suave.
export function estiloFundoQuadro(fundoCor, fundoPreset) {
  if (fundoPreset && PRESETS_VISUAL[fundoPreset]) {
    return { backgroundImage: PRESETS_VISUAL[fundoPreset] };
  }
  if (fundoCor && COR_HEX[fundoCor]) {
    return { backgroundColor: COR_HEX[fundoCor] + '20' }; // ~12% alpha, bem suave
  }
  return {};
}

// Capa do card (faixa no topo). Devolve null quando nao ha capa.
export function estiloCapaCard(capaCor, capaPreset) {
  if (capaPreset && PRESETS_VISUAL[capaPreset]) {
    return { backgroundImage: PRESETS_VISUAL[capaPreset] };
  }
  if (capaCor && COR_HEX[capaCor]) {
    return { backgroundColor: COR_HEX[capaCor] };
  }
  return null;
}

// Tinta suave pro cabecalho da coluna.
export function estiloHeaderColuna(cor) {
  if (cor && COR_HEX[cor]) {
    return { backgroundColor: COR_HEX[cor] + '22', borderColor: COR_HEX[cor] + '55' };
  }
  return {};
}
