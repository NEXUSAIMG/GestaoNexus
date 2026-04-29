/**
 * Conciliação de extrato bancário — Sprint 9.
 *
 * Fluxo: admin sobe um extrato (OFX ou CSV), o service parseia as
 * transações e cruza com `contas_pagar` pagas + `movimentos_socios`
 * efetivados. Não persiste nada — devolve apenas o relatório.
 *
 * Regra de match: valor absoluto igual (tolerância 1 centavo) + data
 * dentro de janela de ±3 dias da transação. Suficiente pra cobrir o
 * lag entre "data lançada no banco" e "data registrada na ferramenta".
 *
 * Limitações deliberadas:
 *  - Não distinguimos sinal (saída/entrada) na conciliação. O extrato
 *    é assimétrico: contas_pagar são sempre saídas, movimentos_socios
 *    podem ser ambos. Match por |valor| funciona na prática.
 *  - Sem persistência de histórico. Quem quiser repete a conciliação
 *    do mesmo extrato.
 *  - Sem ML/heurística por descrição. Só valor + data.
 */

import { query } from '../config/database.js';
import { AppError } from '../utils/errors.js';

const TOLERANCIA_VALOR = 0.01;     // 1 centavo
const JANELA_DATA_DIAS = 3;        // ±3 dias

/**
 * Parseia o conteúdo de um extrato. Detecta o formato pelo conteúdo:
 *   - Começa com `<OFX>` (case-insensitive, com possível header SGML antes) → OFX
 *   - Senão → CSV
 *
 * Retorna array de { data, valor, descricao, identificador? } onde:
 *   - data: string YYYY-MM-DD
 *   - valor: number (negativo = saída, positivo = entrada)
 *   - descricao: string
 *   - identificador: opcional (ID único da transação no banco — só OFX traz)
 */
export function parsearExtrato(conteudo, nomeArquivo = '') {
  const texto = String(conteudo).trim();
  const ehOfx = /<OFX[\s>]/i.test(texto) || /[\r\n]\s*OFXHEADER/i.test(texto)
    || nomeArquivo.toLowerCase().endsWith('.ofx');

  return ehOfx ? parsearOfx(texto) : parsearCsv(texto);
}

/**
 * Parser OFX simplificado. Lida com OFX 1.x (SGML) e 2.x (XML) usando
 * regex no nível das tags `<STMTTRN>`. Não valida o resto do arquivo.
 *
 * Tolerância: tags sem fechamento (estilo SGML) também funcionam pq
 * pegamos só o valor até o próximo `<` ou quebra de linha.
 */
function parsearOfx(texto) {
  const blocos = texto.match(/<STMTTRN>[\s\S]*?<\/STMTTRN>/gi) || [];
  if (blocos.length === 0) {
    throw new AppError(
      'Não encontrei transações neste arquivo OFX. Verifique se é um extrato válido.',
      400,
      'ofx_sem_transacoes',
    );
  }

  const transacoes = [];
  for (const bloco of blocos) {
    const dataRaw = capturar(bloco, 'DTPOSTED') || capturar(bloco, 'DTUSER');
    const valorRaw = capturar(bloco, 'TRNAMT');
    const memo = capturar(bloco, 'MEMO') || capturar(bloco, 'NAME') || '';
    const fitid = capturar(bloco, 'FITID') || null;

    if (!dataRaw || !valorRaw) continue;

    const data = converterDataOfx(dataRaw);
    const valor = parseFloat(String(valorRaw).replace(',', '.'));
    if (!data || Number.isNaN(valor)) continue;

    transacoes.push({
      data,
      valor: Number(valor.toFixed(2)),
      descricao: limpar(memo),
      identificador: fitid,
    });
  }
  return transacoes;
}

function capturar(bloco, tag) {
  const m = bloco.match(new RegExp(`<${tag}>([^<\\r\\n]+)`, 'i'));
  return m ? m[1].trim() : null;
}

/**
 * Converte data OFX (YYYYMMDD[HHMMSS][TZ]) → YYYY-MM-DD em horário local.
 */
function converterDataOfx(raw) {
  const m = String(raw).match(/^(\d{4})(\d{2})(\d{2})/);
  if (!m) return null;
  return `${m[1]}-${m[2]}-${m[3]}`;
}

/**
 * Parser CSV. Aceita 2 dialetos comuns:
 *   - BR: `Data;Descrição;Valor` (separador `;`, vírgula decimal,
 *         data DD/MM/YYYY)
 *   - Internacional: `Date,Description,Amount` (separador `,`,
 *         ponto decimal, data YYYY-MM-DD ou MM/DD/YYYY)
 *
 * Usa heurística simples: se a primeira linha tem mais `;` que `,`,
 * usa `;`. Cabeçalho é detectado se a primeira coluna não parseia
 * como data — nesse caso, pula a linha.
 */
function parsearCsv(texto) {
  const linhas = texto.split(/\r?\n/).filter((l) => l.trim().length > 0);
  if (linhas.length === 0) {
    throw new AppError('Arquivo CSV vazio.', 400, 'csv_vazio');
  }

  // Detecta separador
  const primeiraLinha = linhas[0];
  const sep = (primeiraLinha.match(/;/g) || []).length
              > (primeiraLinha.match(/,/g) || []).length ? ';' : ',';

  // Detecta se tem cabeçalho — primeira linha tem coluna 0 que NÃO parseia como data
  const primeira = primeiraLinha.split(sep);
  const temCabecalho = !parsearData(primeira[0]?.trim());

  const transacoes = [];
  for (let i = temCabecalho ? 1 : 0; i < linhas.length; i++) {
    const cols = linhas[i].split(sep).map((c) => c.trim().replace(/^"|"$/g, ''));
    if (cols.length < 3) continue;

    const data = parsearData(cols[0]);
    const descricao = cols.slice(1, -1).join(' ').trim();
    const valor = parsearValor(cols[cols.length - 1]);

    if (!data || valor === null) continue;

    transacoes.push({
      data,
      valor: Number(valor.toFixed(2)),
      descricao: limpar(descricao),
      identificador: null,
    });
  }

  if (transacoes.length === 0) {
    throw new AppError(
      'Não consegui ler nenhuma transação do CSV. Verifique o formato (Data, Descrição, Valor).',
      400,
      'csv_sem_transacoes',
    );
  }
  return transacoes;
}

/**
 * Aceita: DD/MM/YYYY, DD-MM-YYYY, YYYY-MM-DD, MM/DD/YYYY (ambíguo —
 * resolvido a favor de DD/MM se primeira parte > 12).
 */
function parsearData(s) {
  if (!s) return null;
  const t = s.trim();

  // YYYY-MM-DD ou YYYY/MM/DD
  let m = t.match(/^(\d{4})[-/](\d{1,2})[-/](\d{1,2})$/);
  if (m) return `${m[1]}-${m[2].padStart(2, '0')}-${m[3].padStart(2, '0')}`;

  // DD/MM/YYYY ou DD-MM-YYYY
  m = t.match(/^(\d{1,2})[-/](\d{1,2})[-/](\d{4})$/);
  if (m) {
    const a = parseInt(m[1], 10);
    const b = parseInt(m[2], 10);
    // Se a primeira parte > 12, é dia. Senão, assumimos DD/MM (padrão BR).
    const dia = a;
    const mes = b;
    if (dia >= 1 && dia <= 31 && mes >= 1 && mes <= 12) {
      return `${m[3]}-${String(mes).padStart(2, '0')}-${String(dia).padStart(2, '0')}`;
    }
  }
  return null;
}

/**
 * Aceita "1.234,56", "1,234.56", "-1500.00", "1500", etc.
 * Heurística: se tem `,` E `.`, o último é decimal (assumido).
 *             se tem só `,`, é decimal (BR).
 *             se tem só `.`, decimal (US).
 */
function parsearValor(s) {
  if (!s) return null;
  let t = String(s).trim().replace(/\s/g, '');
  // Remove "R$"
  t = t.replace(/^R\$\s*/, '');
  // Negativo entre parênteses (estilo contábil)
  let negativo = false;
  if (t.startsWith('(') && t.endsWith(')')) {
    negativo = true;
    t = t.slice(1, -1);
  }
  if (t.startsWith('-')) { negativo = true; t = t.slice(1); }

  const temVirgula = t.includes(',');
  const temPonto = t.includes('.');

  if (temVirgula && temPonto) {
    // último símbolo é o decimal
    const ultVirgula = t.lastIndexOf(',');
    const ultPonto = t.lastIndexOf('.');
    if (ultVirgula > ultPonto) {
      // BR: "1.234,56" → "1234.56"
      t = t.replace(/\./g, '').replace(',', '.');
    } else {
      // US: "1,234.56" → "1234.56"
      t = t.replace(/,/g, '');
    }
  } else if (temVirgula) {
    t = t.replace(',', '.');
  }

  const n = parseFloat(t);
  if (Number.isNaN(n)) return null;
  return negativo ? -n : n;
}

function limpar(s) {
  return String(s ?? '').replace(/\s+/g, ' ').trim();
}

/**
 * Concilia uma lista de transações com os registros do banco (contas_pagar
 * pagas e movimentos_socios efetivados).
 *
 * Retorna lista de transações enriquecidas com:
 *   - status: 'conciliada' | 'ambigua' | 'nao_conciliada'
 *   - matches: array de { tipo, id, descricao, valor, data } se houver
 */
export async function conciliar(transacoes) {
  if (!transacoes.length) return [];

  // Janela total das transações pra otimizar a busca
  const datas = transacoes.map((t) => t.data).sort();
  const dataMin = datas[0];
  const dataMax = datas[datas.length - 1];

  // Busca todos candidatos da janela de uma vez (com folga de ±3 dias)
  const [contasR, movimentosR] = await Promise.all([
    query(
      `SELECT id, descricao, fornecedor_nome, valor_pago, data_pagamento
         FROM contas_pagar
        WHERE status = 'paga'
          AND data_pagamento BETWEEN ($1::date - INTERVAL '${JANELA_DATA_DIAS} days')
                                 AND ($2::date + INTERVAL '${JANELA_DATA_DIAS} days')`,
      [dataMin, dataMax],
    ),
    query(
      `SELECT m.id, m.descricao, m.tipo, m.valor, m.data_efetivada,
              s.nome AS socio_nome
         FROM movimentos_socios m
         JOIN socios s ON s.id = m.socio_id
        WHERE m.status = 'efetivado'
          AND m.data_efetivada BETWEEN ($1::date - INTERVAL '${JANELA_DATA_DIAS} days')
                                   AND ($2::date + INTERVAL '${JANELA_DATA_DIAS} days')`,
      [dataMin, dataMax],
    ),
  ]);

  // Pré-prepara em arrays normalizados pra match
  const candidatos = [
    ...contasR.rows.map((c) => ({
      tipo: 'conta_pagar',
      id: c.id,
      descricao: c.descricao,
      sub_descricao: c.fornecedor_nome || null,
      valor: Math.abs(Number(c.valor_pago)),
      data: String(c.data_pagamento).slice(0, 10),
    })),
    ...movimentosR.rows.map((m) => ({
      tipo: m.tipo === 'aporte' ? 'aporte' : (m.tipo === 'pro_labore' ? 'pro_labore' : 'distribuicao'),
      id: m.id,
      descricao: m.descricao,
      sub_descricao: m.socio_nome,
      valor: Math.abs(Number(m.valor)),
      data: String(m.data_efetivada).slice(0, 10),
    })),
  ];

  const usados = new Set(); // ids de candidatos já consumidos por uma transação
  const resultado = [];

  for (const t of transacoes) {
    const valorAbs = Math.abs(t.valor);
    const matches = candidatos.filter((c) => {
      if (usados.has(`${c.tipo}:${c.id}`)) return false;
      if (Math.abs(c.valor - valorAbs) > TOLERANCIA_VALOR) return false;
      const diffDias = diferencaDias(t.data, c.data);
      return Math.abs(diffDias) <= JANELA_DATA_DIAS;
    });

    let status;
    if (matches.length === 0) {
      status = 'nao_conciliada';
    } else if (matches.length === 1) {
      status = 'conciliada';
      usados.add(`${matches[0].tipo}:${matches[0].id}`);
    } else {
      status = 'ambigua';
    }

    resultado.push({
      ...t,
      status,
      matches: matches.map((m) => ({
        tipo: m.tipo,
        id: m.id,
        descricao: m.descricao,
        sub_descricao: m.sub_descricao,
        valor: m.valor,
        data: m.data,
      })),
    });
  }

  return resultado;
}

function diferencaDias(d1, d2) {
  const a = new Date(`${d1}T12:00:00`);
  const b = new Date(`${d2}T12:00:00`);
  return (a - b) / (1000 * 60 * 60 * 24);
}
