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
    coluna: pega('coluna', 'lista', 'status', 'status atual', 'situacao', 'fase'),
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

/**
 * Colunas fora do formato "uma linha, um card": informação que hoje o
 * import descarta em silêncio (CRM/funil de vendas exportado em planilha
 * costuma trazer isso — Origem, Termômetro, Cidade, Faturamento...).
 *
 * A saída: casa com um *campo personalizado* já cadastrado no quadro (mesma
 * tabela que alimenta a Ficha de Cliente — ver `FichaCliente.jsx` no
 * frontend); sem campo correspondente, o valor vai pra descrição do card em
 * vez de sumir.
 */

/** Nomes de campo fixo já tratados por `interpretarLinha` — o resto do
 * cabeçalho é "extra" (campo personalizado do quadro, ou texto solto). */
const CAMPOS_FIXOS = [
  'titulo', 'descricao', 'prioridade', 'estimativa', 'tipo', 'etiquetas',
  'categoria', 'cliente', 'coluna', 'responsavel', 'prazo',
];

/** Chave de comparação de nome de campo: sem acento/caixa e sem espaço, pra
 * "Telefone / WhatsApp" (planilha) casar com "Telefone/WhatsApp" (campo). */
export function chaveCampo(s) {
  return semAcento(s).replace(/\s+/g, '');
}

/** Colunas do cabeçalho que não são nenhum campo fixo — candidatas a campo
 * personalizado do quadro ou a texto extra na descrição. */
export function colunasExtras(cabecalho, col) {
  const usados = new Set(CAMPOS_FIXOS.map((k) => col[k]).filter((i) => i >= 0));
  return cabecalho
    .map((h, i) => ({ i, nome: String(h ?? '').trim() }))
    .filter(({ i, nome }) => nome && !usados.has(i));
}

/** Mapa chave-normalizada -> campo, pra casar cabeçalho da planilha com
 * campo personalizado do quadro (`quadros_campos`). */
export function mapaCampos(campos) {
  return new Map(campos.map((c) => [chaveCampo(c.nome), c]));
}

/**
 * Converte o texto da planilha pro formato do campo personalizado.
 * Best-effort: se não der pra interpretar com confiança (moeda em formato
 * estranho, opção de seleção que não bate, pessoa — exigiria casar nome
 * numa consulta à parte), devolve null e o valor vira texto na descrição em
 * vez de travar o import por um campo malformado.
 *
 * ponytail: "pessoa" fica de fora (exigiria a mesma consulta de pessoas do
 * import inteiro, duplicada na prévia); casa por nome quando alguém pedir.
 */
export function normalizarValorCampoImport(campo, texto) {
  switch (campo.tipo) {
    case 'texto':
      return texto.slice(0, 500);
    case 'url':
      return (/^https?:\/\//i.test(texto) ? texto : 'https://' + texto).slice(0, 500);
    case 'numero':
    case 'moeda': {
      const n = parseHoras(texto);
      return n == null ? null : n;
    }
    case 'data':
      return parseData(texto);
    case 'checkbox': {
      const v = semAcento(texto);
      if (['sim', 'true', '1', 'x', 'verdadeiro'].includes(v)) return true;
      if (['nao', 'false', '0', 'falso'].includes(v)) return false;
      return null;
    }
    case 'selecao': {
      const opcoes = Array.isArray(campo.opcoes) ? campo.opcoes : [];
      return opcoes.find((o) => semAcento(o) === semAcento(texto)) || null;
    }
    default:
      return null;
  }
}

/**
 * Termômetro -> prioridade do card (0=Urgente, 1=Alta, 2=Média, 3=Baixa) e
 * -> posição no funil. "Morno" é sinônimo de "Médio" — nomenclatura antiga
 * da Ficha de Cliente que ainda pode aparecer em planilha de gente.
 */
const PRIORIDADE_POR_TERMOMETRO = {
  quente: 1, medio: 2, morno: 2, frio: 3,
};

/** Posição no funil (0=primeiro): quente > médio/morno > frio > sem
 * termômetro reconhecido (fica na ordem em que já vinha na planilha). */
const RANK_TERMOMETRO = { quente: 0, medio: 1, morno: 1, frio: 2 };
export function rankTermometro(valor) {
  return RANK_TERMOMETRO[chaveCampo(valor || '')] ?? 3;
}

/**
 * Reordena os itens interpretados por Termômetro — quente primeiro, depois
 * médio, depois frio; sem termômetro reconhecido mantém a posição relativa
 * que já tinha na planilha (Array.prototype.sort é estável). "Tratamento
 * especial" é só pra quem tem o campo preenchido; o resto não muda de lugar
 * por causa disso.
 */
export function ordenarPorTermometro(itens) {
  return itens
    .map((item, idx) => ({ item, idx, rank: rankTermometro(item.termometro) }))
    .sort((a, b) => (a.rank - b.rank) || (a.idx - b.idx))
    .map((x) => x.item);
}

/** Transforma uma linha da planilha no card que ela vai virar. */
export function interpretarLinha(linha, col, extras, camposPorChave) {
  const em = (i) => (i >= 0 && linha[i] != null ? String(linha[i]).trim() : '');

  const etiquetas = [];
  if (em(col.tipo)) etiquetas.push(em(col.tipo));
  if (em(col.etiquetas)) {
    for (const e of em(col.etiquetas).split(/[;,]/)) {
      const t = e.trim();
      if (t) etiquetas.push(t);
    }
  }

  // Categoria e Cliente entram na descrição quando não há coluna própria de
  // descrição — é onde a informação fica visível sem inventar campo.
  let descricao = em(col.descricao);
  const textoExtra = [];
  if (em(col.categoria)) textoExtra.push('Categoria: ' + em(col.categoria));
  if (em(col.cliente)) textoExtra.push('Cliente: ' + em(col.cliente));

  // Colunas extras: casa com campo personalizado do quadro quando dá; senão
  // vira mais uma linha de texto na descrição. "Termômetro" (Quente/Médio/
  // Frio) sai capturado à parte, além de virar campo — ele também pauta
  // ordem e prioridade do card (ver PRIORIDADE_POR_TERMOMETRO abaixo).
  const camposValores = {};
  const extrasNaDescricao = [];
  let termometro = null;
  for (const { i, nome } of extras) {
    const valor = em(i);
    if (!valor) continue;
    if (chaveCampo(nome) === 'termometro') termometro = valor;
    const campo = camposPorChave?.get(chaveCampo(nome));
    const normalizado = campo ? normalizarValorCampoImport(campo, valor) : null;
    if (campo && normalizado !== null && normalizado !== undefined) {
      camposValores[campo.id] = normalizado;
    } else {
      textoExtra.push(nome + ': ' + valor);
      extrasNaDescricao.push(nome);
    }
  }
  if (textoExtra.length) descricao = (descricao ? descricao + '\n\n' : '') + textoExtra.join('\n');

  // Sem coluna de Prioridade na planilha, o Termômetro serve de substituto
  // razoável — "quente" é lead que não pode esperar. Prioridade explícita
  // da planilha sempre manda quando existir; isso só preenche o vazio.
  let prioridade = col.prioridade >= 0 ? mapPrioridade(em(col.prioridade)) : 2;
  if (col.prioridade < 0 && termometro) {
    const p = PRIORIDADE_POR_TERMOMETRO[chaveCampo(termometro)];
    if (p !== undefined) prioridade = p;
  }

  return {
    titulo: em(col.titulo).slice(0, 255),
    descricao: descricao ? descricao.slice(0, 20000) : null,
    prioridade,
    estimativa_horas: col.estimativa >= 0 ? parseHoras(em(col.estimativa)) : null,
    data_prazo: col.prazo >= 0 ? parseData(em(col.prazo)) : null,
    etiquetas: [...new Set(etiquetas.map((e) => e.slice(0, 50)))],
    coluna: em(col.coluna),
    responsavel: em(col.responsavel),
    campos_valores: camposValores,
    extras_na_descricao: extrasNaDescricao,
    termometro,
  };
}
