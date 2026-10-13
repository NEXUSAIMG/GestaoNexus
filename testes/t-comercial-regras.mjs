// Regras puras do Comercial (sem banco/servidor): portões de etapa.
import { pendenciasPortao } from '../backend/src/services/comercial.regras.js';
import { ok, titulo } from './api.mjs';

titulo('Portões de etapa (regras puras)');
const vazio = { reunioes: [], propostas: [] };
const novo = { etapa: 'diagnostico', marcos: { prospect: 'x', cadencia: 'x', diagnostico: 'x' }, diagnostico: {} };
ok(pendenciasPortao(novo, 'proposta', vazio).length === 7, 'ir de Reunião de apresentação para Aguardando retorno cobra reunião, diagnóstico e proposta');
ok(pendenciasPortao(novo, 'corregedoria', vazio).length === 7, 'Aguardando a Corregedoria cobra o mesmo que Aguardando retorno');
const importado = { etapa: 'proposta', marcos: { prospect: 'x', cadencia: 'x', diagnostico: 'x', proposta: 'x' }, diagnostico: {}, valor_mensal: 540 };
ok(pendenciasPortao(importado, 'ganho', vazio).length === 0, 'lead que já passou pelas etapas (ex.: importado) não é cobrado de novo');
ok(pendenciasPortao({ ...importado, valor_mensal: null }, 'ganho', vazio).length === 1, 'ganho continua exigindo valor');
ok(pendenciasPortao(novo, 'perdido', vazio).length === 0, 'perdido não tem portão');
