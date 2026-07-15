// Sprint 39 -- valores permitidos da customizacao visual do kanban.
// Compartilhado pelos controllers de quadros, colunas e cards.
// O frontend tem uma constante espelho em src/constants/kanbanVisual.js.

import { z } from 'zod';

// Paleta padrao de 15 cores usada no app inteiro.
export const CORES_KANBAN = [
  'slate', 'red', 'orange', 'amber', 'yellow',
  'lime', 'emerald', 'teal', 'cyan', 'blue',
  'indigo', 'violet', 'fuchsia', 'pink', 'rose',
];

// Presets de fundo/capa (gradientes CSS renderizados no front).
export const PRESETS_VISUAL = ['oceano', 'pordosol', 'floresta', 'roxo', 'rosa', 'grafite'];

// Schemas reutilizaveis: aceitam a cor/preset valido, null (limpar) ou ausente.
export const corSchema = z
  .string()
  .refine((v) => CORES_KANBAN.includes(v), 'Cor invalida')
  .nullable()
  .optional();

export const presetSchema = z
  .string()
  .refine((v) => PRESETS_VISUAL.includes(v), 'Preset invalido')
  .nullable()
  .optional();
