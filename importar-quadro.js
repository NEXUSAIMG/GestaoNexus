#!/usr/bin/env node
/* =====================================================================
 * GestaoNexus — Importador reutilizável de cards para um quadro
 * ---------------------------------------------------------------------
 * Lê um arquivo CSV (ou .xlsx, se o pacote "xlsx" estiver instalado) e
 * insere os cards num quadro existente do GestaoNexus.
 *
 * USO:
 *   railway run --service Postgres node importar-quadro.js \
 *     --file cards.csv --quadro "Atividades Estagiários" [opções]
 *
 *   (ou, com DATABASE_URL/DATABASE_PUBLIC_URL no ambiente/.env):
 *   node importar-quadro.js --file cards.csv --quadro "Nome do Quadro"
 *
 * OPÇÕES:
 *   --file    <caminho>   Arquivo CSV ou XLSX (obrigatório)
 *   --quadro  <nome>      Nome exato do quadro de destino (obrigatório)
 *   --coluna  <nome>      Coluna de destino (padrão: a coluna do tipo "backlog")
 *   --sheet   <nome>      Aba do XLSX (padrão: a primeira)
 *   --dry-run             Só mostra o que faria, sem gravar nada
 *
 * COLUNAS ACEITAS NO ARQUIVO (cabeçalho, sem diferenciar acento/maiúsc.):
 *   Titulo | Título | Card            -> título do card (obrigatório)
 *   Descricao | Descrição             -> descrição (opcional)
 *   Prioridade                        -> 0-3 OU Urgente/Crítica, Alta, Média/Normal, Baixa
 *   Estimativa_h | Estimativa (h) | Horas -> número de horas (opcional)
 *   Tipo                              -> vira etiqueta (Bug, Melhoria, Urgente, Roadmap, ...)
 *   Etiquetas                         -> etiquetas extras, separadas por ; ou ,
 *   Categoria, Cliente                -> se não houver Descricao, entram na descrição
 *
 * Idempotente: cards cujo título já existe no quadro (não arquivados) são pulados.
 * ===================================================================== */

const fs = require('fs');
const path = require('path');

// ---------- args ----------
function parseArgs(argv) {
  const a = { flags: {} };
  for (let i = 2; i < argv.length; i++) {
    const t = argv[i];
    if (t === '--dry-run') a.flags.dryRun = true;
    else if (t.startsWith('--')) { a.flags[t.slice(2)] = argv[++i]; }
  }
  return a.flags;
}

// ---------- env / conexão ----------
function carregarEnv() {
  if (process.env.DATABASE_PUBLIC_URL || process.env.DATABASE_URL) return;
  for (const p of [path.join(__dirname, 'backend', '.env'), path.join(__dirname, '.env')]) {
    if (fs.existsSync(p)) {
      for (const l of fs.readFileSync(p, 'utf8').split(/\r?\n/)) {
        const m = l.match(/^\s*DATABASE_URL\s*=\s*(.*)\s*$/);
        if (m) { process.env.DATABASE_URL = m[1].replace(/^["']|["']$/g, ''); return; }
      }
    }
  }
}
function getClient() {
  let Client;
  try { ({ Client } = require('pg')); }
  catch (_) { ({ Client } = require(path.join(__dirname, 'backend', 'node_modules', 'pg'))); }
  const raw = process.env.DATABASE_PUBLIC_URL || process.env.DATABASE_URL;
  if (!raw) throw new Error('DATABASE_URL/DATABASE_PUBLIC_URL não encontrada (use railway run, .env ou variável).');
  const ehLocal = /localhost|127\.0\.0\.1/.test(raw);
  const url = raw.replace(/([?&])(sslmode|ssl|channel_binding)=[^&]*/gi, '$1')
                 .replace(/[?&]+$/, '').replace(/\?&+/, '?').replace(/&&+/g, '&');
  return new Client({ connectionString: url, ssl: ehLocal ? undefined : { rejectUnauthorized: false } });
}

// ---------- leitura do arquivo ----------
function parseCSV(text) {
  if (text.charCodeAt(0) === 0xFEFF) text = text.slice(1); // BOM
  // detecta delimitador pela 1ª linha
  const primeira = text.slice(0, text.indexOf('\n') < 0 ? text.length : text.indexOf('\n'));
  const delim = (primeira.split(';').length > primeira.split(',').length) ? ';' : ',';
  const rows = [];
  let row = [], field = '', inQ = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQ) {
      if (c === '"') { if (text[i + 1] === '"') { field += '"'; i++; } else inQ = false; }
      else field += c;
    } else {
      if (c === '"') inQ = true;
      else if (c === delim) { row.push(field); field = ''; }
      else if (c === '\r') { /* ignore */ }
      else if (c === '\n') { row.push(field); rows.push(row); row = []; field = ''; }
      else field += c;
    }
  }
  if (field.length || row.length) { row.push(field); rows.push(row); }
  return rows.filter(r => r.some(x => String(x).trim() !== ''));
}
function lerArquivo(file, sheetName) {
  const ext = path.extname(file).toLowerCase();
  if (ext === '.csv' || ext === '.tsv' || ext === '.txt') {
    return parseCSV(fs.readFileSync(file, 'utf8'));
  }
  if (ext === '.xlsx' || ext === '.xls') {
    let XLSX;
    try { XLSX = require('xlsx'); }
    catch (_) {
      try { XLSX = require(path.join(__dirname, 'backend', 'node_modules', 'xlsx')); }
      catch (e) {
        throw new Error('Para ler .xlsx é preciso o pacote "xlsx" (npm i xlsx). Alternativa: exporte a planilha como CSV e use --file cards.csv.');
      }
    }
    const wb = XLSX.readFile(file);
    const aba = sheetName || wb.SheetNames[0];
    const ws = wb.Sheets[aba];
    if (!ws) throw new Error(`Aba "${aba}" não encontrada. Abas: ${wb.SheetNames.join(', ')}`);
    return XLSX.utils.sheet_to_json(ws, { header: 1, blankrows: false, defval: '' })
              .map(r => r.map(x => (x == null ? '' : String(x))));
  }
  throw new Error('Formato não suportado: ' + ext + ' (use .csv ou .xlsx).');
}

// ---------- normalização de colunas / valores ----------
const semAcento = s => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();
function indexarCabecalho(header) {
  const idx = {};
  header.forEach((h, i) => { idx[semAcento(h)] = i; });
  const pick = (...nomes) => { for (const n of nomes) if (idx[n] != null) return idx[n]; return -1; };
  return {
    titulo:     pick('titulo', 'card', 'nome', 'tarefa'),
    descricao:  pick('descricao', 'descricao do card', 'desc'),
    prioridade: pick('prioridade', 'prio'),
    estimativa: pick('estimativa_h', 'estimativa (h)', 'estimativa', 'horas', 'est (h)', 'est'),
    tipo:       pick('tipo'),
    etiquetas:  pick('etiquetas', 'labels', 'tags'),
    categoria:  pick('categoria'),
    cliente:    pick('cliente'),
  };
}
function mapPrioridade(v) {
  const s = semAcento(v);
  if (/^[0-3]$/.test(s)) return Number(s);
  if (['urgente', 'critica', 'p0'].includes(s)) return 0;
  if (['alta', 'p1'].includes(s)) return 1;
  if (['media', 'normal', 'p2', ''].includes(s)) return 2;
  if (['baixa', 'p3'].includes(s)) return 3;
  return 2; // padrão
}
function parseHoras(v) {
  const s = String(v || '').replace(',', '.').replace(/[^0-9.]/g, '');
  if (!s) return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

const CORES = ['red','orange','amber','emerald','teal','cyan','blue','indigo','violet','fuchsia','pink','rose','lime','yellow','slate'];

const HELP = `
GestaoNexus — Importador de cards para um quadro (CSV/XLSX)

USO
  railway run --service Postgres node importar-quadro.js --file <arquivo> --quadro "<nome>" [opções]
  node importar-quadro.js --file <arquivo> --quadro "<nome>"     (com DATABASE_URL no ambiente/.env)

OPÇÕES
  --file    <caminho>   Arquivo .csv ou .xlsx com os cards            (obrigatório)
  --quadro  <nome>      Nome exato do quadro de destino               (obrigatório)
  --coluna  <nome>      Coluna de destino (padrão: a coluna "backlog"/A fazer)
  --sheet   <nome>      Aba do .xlsx (padrão: a primeira)
  --dry-run             Só mostra a prévia, não grava nada
  --help, -h            Mostra esta ajuda

COLUNAS DO ARQUIVO (cabeçalho; ignora acento e maiúsculas)
  Titulo | Título | Card            título do card                   (obrigatório)
  Descricao | Descrição             descrição                        (opcional)
  Prioridade                        0-3  OU  Urgente/Crítica, Alta, Média/Normal, Baixa
  Estimativa_h | Estimativa (h) | Horas   número de horas            (opcional)
  Tipo                              vira etiqueta (Bug, Melhoria, Urgente, Roadmap, ...)
  Etiquetas                         etiquetas extras separadas por ; ou ,
  Categoria, Cliente                se não houver Descricao, entram na descrição

COMPORTAMENTO
  • Idempotente: cards cujo título já existe no quadro (não arquivados) são pulados.
  • Prioridade vira inteiro 0-3 (Urgente=0, Alta=1, Média/Normal=2, Baixa=3).
  • Etiquetas que não existirem no quadro são criadas e vinculadas.
  • Inserção numa transação: se algo falhar, faz rollback (nada grava pela metade).

EXEMPLOS
  # prévia sem gravar
  node importar-quadro.js --file cards.csv --quadro "Atividades Estagiários" --dry-run
  # importar de verdade (produção via Railway)
  railway run --service Postgres node importar-quadro.js --file cards.csv --quadro "Atividades Estagiários"
  # escolhendo a coluna e a aba do xlsx
  railway run --service Postgres node importar-quadro.js --file backlog.xlsx --sheet Cards --coluna "A fazer" --quadro "Atividades Karina"
`;

(async () => {
  if (process.argv.includes('--help') || process.argv.includes('-h')) { console.log(HELP); process.exit(0); }
  const flags = parseArgs(process.argv);
  if (!flags.file || !flags.quadro) {
    console.error('Faltou --file e/ou --quadro. Use --help para ver as opções.');
    process.exit(1);
  }
  if (!fs.existsSync(flags.file)) { console.error('❌ Arquivo não encontrado:', flags.file); process.exit(1); }

  // 1) ler + mapear linhas
  const linhas = lerArquivo(flags.file, flags.sheet);
  if (linhas.length < 2) { console.error('❌ Arquivo sem dados (precisa de cabeçalho + ao menos 1 linha).'); process.exit(1); }
  const col = indexarCabecalho(linhas[0]);
  if (col.titulo < 0) { console.error('❌ Não achei a coluna de título (Titulo/Card/Nome) no cabeçalho.'); process.exit(1); }

  const cards = [];
  for (let i = 1; i < linhas.length; i++) {
    const r = linhas[i];
    const titulo = String(r[col.titulo] || '').trim();
    if (!titulo) continue;
    const at = k => (k >= 0 ? String(r[k] ?? '').trim() : '');
    let descricao = at(col.descricao);
    const categoria = at(col.categoria), cliente = at(col.cliente);
    if (!descricao && (categoria || cliente)) {
      descricao = [categoria && `Categoria: ${categoria}`, cliente && `Cliente: ${cliente}`].filter(Boolean).join(' · ');
    }
    const etiquetas = [];
    if (col.tipo >= 0 && at(col.tipo)) etiquetas.push(at(col.tipo));
    if (col.etiquetas >= 0 && at(col.etiquetas)) at(col.etiquetas).split(/[;,]/).forEach(e => e.trim() && etiquetas.push(e.trim()));
    cards.push({
      titulo,
      descricao: descricao || null,
      prioridade: mapPrioridade(at(col.prioridade)),
      estimativa: parseHoras(at(col.estimativa)),
      etiquetas: [...new Set(etiquetas)],
    });
  }
  console.log(`📄 ${cards.length} cards lidos de ${path.basename(flags.file)}.`);
  if (flags.dryRun) {
    console.log('— DRY RUN — prévia dos 5 primeiros:');
    cards.slice(0, 5).forEach(c => console.log(`  [P${c.prioridade} ${c.estimativa ?? '-'}h] ${c.titulo}  {${c.etiquetas.join(', ')}}`));
    console.log('Nada foi gravado. Rode sem --dry-run para importar.');
    process.exit(0);
  }

  // 2) conectar + resolver quadro/coluna
  carregarEnv();
  const client = getClient();
  await client.connect();
  try {
    const q = await client.query(
      `SELECT id, criado_por_id FROM quadros WHERE nome = $1 AND arquivado_em IS NULL ORDER BY criado_em LIMIT 1`,
      [flags.quadro]);
    if (!q.rows.length) throw new Error(`Quadro "${flags.quadro}" não encontrado (verifique o nome exato).`);
    const quadroId = q.rows[0].id, criador = q.rows[0].criado_por_id;

    let coluna;
    if (flags.coluna) {
      coluna = (await client.query(
        `SELECT id FROM colunas WHERE quadro_id=$1 AND arquivada_em IS NULL AND nome ILIKE $2 ORDER BY ordem LIMIT 1`,
        [quadroId, flags.coluna])).rows[0];
    }
    if (!coluna) {
      coluna = (await client.query(
        `SELECT id FROM colunas WHERE quadro_id=$1 AND arquivada_em IS NULL AND tipo='backlog' ORDER BY ordem LIMIT 1`,
        [quadroId])).rows[0];
    }
    if (!coluna) {
      coluna = (await client.query(
        `SELECT id FROM colunas WHERE quadro_id=$1 AND arquivada_em IS NULL ORDER BY ordem LIMIT 1`,
        [quadroId])).rows[0];
    }
    if (!coluna) throw new Error(`Nenhuma coluna encontrada no quadro "${flags.quadro}".`);
    const colunaId = coluna.id;

    // etiquetas existentes do quadro
    const etqRows = (await client.query(`SELECT id, nome FROM quadros_etiquetas WHERE quadro_id=$1`, [quadroId])).rows;
    const etqMap = new Map(etqRows.map(e => [semAcento(e.nome), e.id]));
    let proxOrdemEtq = (await client.query(`SELECT COALESCE(MAX(ordem),0)+1 n FROM quadros_etiquetas WHERE quadro_id=$1`, [quadroId])).rows[0].n;
    let corIdx = etqRows.length % CORES.length;
    async function etiquetaId(nome) {
      const k = semAcento(nome);
      if (etqMap.has(k)) return etqMap.get(k);
      const cor = CORES[corIdx++ % CORES.length];
      const id = (await client.query(
        `INSERT INTO quadros_etiquetas (quadro_id, nome, cor, ordem) VALUES ($1,$2,$3,$4) RETURNING id`,
        [quadroId, nome, cor, proxOrdemEtq++])).rows[0].id;
      etqMap.set(k, id);
      return id;
    }

    let base = (await client.query(`SELECT COALESCE(MAX(ordem),0) n FROM cards WHERE coluna_id=$1`, [colunaId])).rows[0].n;

    await client.query('BEGIN');
    let ins = 0, skip = 0, seq = 0;
    for (const c of cards) {
      seq++;
      const existe = (await client.query(
        `SELECT 1 FROM cards WHERE quadro_id=$1 AND arquivado_em IS NULL AND titulo=$2 LIMIT 1`,
        [quadroId, c.titulo])).rowCount;
      if (existe) { skip++; continue; }
      const card = (await client.query(
        `INSERT INTO cards (coluna_id, quadro_id, titulo, descricao, ordem, prioridade, estimativa_horas, criado_por_id)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING id`,
        [colunaId, quadroId, c.titulo, c.descricao, base + seq * 10, c.prioridade, c.estimativa, criador])).rows[0].id;
      ins++;
      for (const nome of c.etiquetas) {
        const eid = await etiquetaId(nome);
        await client.query(`INSERT INTO cards_etiquetas (card_id, etiqueta_id) VALUES ($1,$2) ON CONFLICT DO NOTHING`, [card, eid]);
      }
    }
    await client.query('COMMIT');
    console.log(`✅ Importação concluída no quadro "${flags.quadro}": ${ins} inseridos, ${skip} já existentes (pulados).`);
  } catch (e) {
    try { await client.query('ROLLBACK'); } catch (_) {}
    console.error('❌ Erro:', e.message);
    process.exitCode = 1;
  } finally {
    await client.end();
  }
})();
