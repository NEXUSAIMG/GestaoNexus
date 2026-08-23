/**
 * Leitura de planilha em CSV.
 *
 * O parser e o mapa de cabeçalho vêm do importador de linha de comando
 * (`importar-quadro.js`, na raiz do projeto), que já foi usado em importação
 * real. Reaproveitamos em vez de escrever outro: o formato está documentado
 * em README-IMPORTADOR.md e já foi testado contra planilha de gente.
 *
 * Cuidados que o formato exige na prática:
 *   - BOM no começo do arquivo (o Excel põe)
 *   - separador `;` no Brasil, `,` no resto
 *   - aspas com aspas dentro
 *   - cabeçalho com acento e caixa variados
 */

/** Remove acento e caixa — para casar cabeçalho digitado de qualquer jeito. */
export function semAcento(s) {
  return String(s ?? '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .trim();
}

/**
 * Converte o texto do CSV numa matriz de linhas.
 * Detecta o separador pela primeira linha e engole o BOM.
 */
export function parseCSV(texto) {
  let t = String(texto ?? '');
  if (t.charCodeAt(0) === 0xFEFF) t = t.slice(1);

  const fimPrimeira = t.indexOf('\n') < 0 ? t.length : t.indexOf('\n');
  const primeira = t.slice(0, fimPrimeira);
  const delim = primeira.split(';').length > primeira.split(',').length ? ';' : ',';

  const linhas = [];
  let linha = [];
  let campo = '';
  let entreAspas = false;

  for (let i = 0; i < t.length; i += 1) {
    const c = t[i];
    if (entreAspas) {
      if (c === '"') {
        if (t[i + 1] === '"') { campo += '"'; i += 1; } else { entreAspas = false; }
      } else {
        campo += c;
      }
    } else if (c === '"') {
      entreAspas = true;
    } else if (c === delim) {
      linha.push(campo); campo = '';
    } else if (c === '\r') {
      // ignora
    } else if (c === '\n') {
      linha.push(campo); linhas.push(linha); linha = []; campo = '';
    } else {
      campo += c;
    }
  }
  if (campo.length || linha.length) { linha.push(campo); linhas.push(linha); }

  return {
    delimitador: delim,
    linhas: linhas.filter((r) => r.some((x) => String(x).trim() !== '')),
  };
}

/**
 * Descobre em que posição está cada coluna conhecida.
 * Devolve -1 para as que o arquivo não tem.
 */
export function indexarCabecalho(cabecalho) {
  const idx = {};
  cabecalho.forEach((h, i) => { idx[semAcento(h)] = i; });
  const pega = (...nomes) => {
    for (const n of nomes) if (idx[n] != null) return idx[n];
    return -1;
  };
  return {
    titulo: pega('titulo', 'card', 'nome', 'tarefa', 'assunto'),
    descricao: pega('descricao', 'descricao do card', 'desc', 'detalhes'),
    prioridade: pega('prioridade', 'prio'),
    estimativa: pega('estimativa_h', 'estimativa (h)', 'estimativa', 'horas', 'est (h)', 'est'),
    tipo: pega('tipo'),
    etiquetas: pega('etiquetas', 'labels', 'tags'),
    categoria: pega('categoria'),
    cliente: pega('cliente'),
    coluna: pega('coluna', 'lista', 'status', 'situacao', 'fase'),
    responsavel: pega('responsavel', 'responsaveis', 'dono', 'atribuido a'),
    prazo: pega('prazo', 'data_prazo', 'vencimento', 'data de entrega', 'entrega'),
  };
}

/** "Urgente"/"Alta"/"Média"/"Baixa" ou 0-3 -> 0..3 (0 = mais urgente). */
export function mapPrioridade(v) {
  const s = semAcento(v);
  if (/^[0-3]$/.test(s)) return Number(s);
  if (['urgente', 'critica', 'critico', 'p0'].includes(s)) return 0;
  if (['alta', 'p1'].includes(s)) return 1;
  if (['baixa', 'p3'].includes(s)) return 3;
  return 2;
}

export function parseHoras(v) {
  const s = String(v ?? '').replace(',', '.').replace(/[^0-9.]/g, '');
  if (!s) return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

/**
 * Aceita 2026-09-30, 30/09/2026 e 30-09-2026. Devolve ISO (yyyy-mm-dd) ou
 * null. Data ambígua fora desses formatos é ignorada de propósito: chutar
 * dia/mês errado é pior do que não importar o prazo.
 */
export function parseData(v) {
  const s = String(v ?? '').trim();
  if (!s) return null;
  const iso = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (iso) return `${iso[1]}-${iso[2]}-${iso[3]}`;
  const br = s.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{4})$/);
  if (br) {
    const [, d, m, a] = br;
    return `${a}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
  }
  return null;
}
