/**
 * Sprint 42F — Quadro e Comercial em espelho.
 *
 * O quadro Kanban da equipe e o módulo Comercial andam juntos, nos dois
 * sentidos. O vínculo é comercial_leads.origem_card_id; o mapa coluna →
 * etapa fica em comercial_espelhos (um por quadro).
 *
 *   QUADRO → COMERCIAL (chamado pelo controller de cards)
 *     - mover card: planejarMovimento() decide o que muda no lead e RECUSA
 *       (409) quando o Comercial não deixaria: portão pendente, voltar
 *       etapa/reabrir (exige justificativa, que só a ficha coleta).
 *       aplicarMovimento() grava na MESMA transação do card.
 *       Nas colunas da implantação (Enviar onboarding, Treinamento, Em
 *       desenvolvimento, Pós-venda), entrar na coluna marca os marcos
 *       anteriores como feitos.
 *     - card novo no quadro vira lead (leadDoCardNovo).
 *     - título, responsável e campos (telefone, contato, e-mail, cidade)
 *       vão para o lead (espelharCardNoLead).
 *
 *   COMERCIAL → QUADRO (middleware nas rotas do Comercial)
 *     - depois de qualquer escrita, espelharDesde(inicio) olha os leads
 *       vinculados que mudaram e: move o card quando a etapa mudou ou um
 *       marco foi registrado (só para a frente), cria card para lead novo,
 *       e copia nome, responsável e contatos.
 *
 * Sem eco: as escritas do espelho são SQL direto (não passam pelos
 * controllers), então uma mudança não volta para o outro lado.
 * Sem briga: o Comercial só move o card por EVENTO (etapa mudou, marco
 * novo) — um card deixado numa coluna "ignorar" ou recuado à mão dentro
 * da implantação fica onde a pessoa pôs até o próximo evento.
 */
import { query, pool } from '../config/database.js';
import { AppError } from '../utils/errors.js';
import { publicarMudanca } from './realtime.service.js';
import {
  ETAPA, MARCOS_IMPLANTACAO, hojeBR, aplicarEtapa, pendenciasPortao, ehRetrocesso,
} from './comercial.regras.js';
import {
  carregarLead, reunioesDoLead, propostasDoLead, verificarBloqueios, inserirLead, LIMITES_LEAD,
} from './comercial.dados.js';

// ---------------------------------------------------------------------------
// Palpites pelo nome da coluna (o admin confirma o mapa na importação)
// ---------------------------------------------------------------------------
export const normalizar = (s) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();

export function palpiteEtapa(nomeColuna, tipoColuna) {
  const n = normalizar(nomeColuna);
  if (/fora do funil|descart|sem interesse|negativ|perd|desist|cancel|nao fech|recus/.test(n)) return 'perdido';
  if (/corregedor/.test(n)) return 'corregedoria';
  if (/ganh|fechad|assin|onboard|treinament|desenvolv|ativa|implant|pos.?venda/.test(n)) return 'ganho';
  if (/aguardando retorno|retorno|propost|negocia/.test(n)) return 'proposta';
  if (/diagn|reuni|apresent|demo/.test(n)) return 'diagnostico';
  if (/cadenc|contat|follow|andamento/.test(n)) return 'cadencia';
  if (tipoColuna === 'concluida') return 'ganho';
  return 'prospect';
}

export function palpiteMotivo(nomeColuna, padrao) {
  const n = normalizar(nomeColuna);
  if (/desist/.test(n)) return 'Desistência (usou e desistiu)';
  if (/fora do funil|sem interesse|negativ|recus/.test(n)) return 'Fora do funil (sem interesse)';
  return padrao;
}

/** Coluna da implantação → marco (dia) que a pessoa está fazendo ali. */
export function palpiteMarco(nomeColuna) {
  const n = normalizar(nomeColuna);
  if (/onboard/.test(n)) return 0;
  if (/treinament|ativa/.test(n)) return 2;
  if (/desenvolv/.test(n)) return 7;
  if (/checagem|uso/.test(n)) return 15;
  if (/pos.?venda|acompanhament/.test(n)) return 30;
  return null;
}

// ---------------------------------------------------------------------------
// Campos do quadro ↔ campos do lead (pelo nome do campo, sem acento)
// ---------------------------------------------------------------------------
const CAMPOS = [
  { lead: 'telefone', nomes: ['telefone/whatsapp', 'telefone', 'whatsapp', 'celular'] },
  { lead: 'contato', nomes: ['representante/oficial', 'representante', 'oficial', 'titular', 'contato'] },
  { lead: 'email', nomes: ['e-mail', 'email'] },
  { lead: 'cidade_uf', nomes: ['cidade/uf', 'cidade - uf', 'municipio/uf'] },
  { lead: 'cidade', nomes: ['cidade', 'municipio'] },
  { lead: 'uf', nomes: ['uf', 'estado'] },
];
function campoDoLead(nomeCampo) {
  const n = normalizar(nomeCampo);
  return CAMPOS.find((c) => c.nomes.includes(n))?.lead || null;
}
const vazio = (v) => (v == null || String(v).trim() === '' ? null : String(v).trim());

/** Lê os valores de contato do card (já com cidade/UF separados). */
function contatosDoCard(campos, valores) {
  const out = {};
  for (const c of campos) {
    const k = campoDoLead(c.nome);
    if (!k || c.tipo !== 'texto') continue;
    const v = vazio(valores[c.id]);
    if (k === 'cidade_uf') {
      if (!v) { out.cidade = out.cidade ?? null; continue; }
      const m = v.match(/^(.*?)[\s]*[/\-–][\s]*([A-Za-z]{2})$/);
      out.cidade = m ? m[1].trim() : v;
      if (m) out.uf = m[2].toUpperCase();
    } else {
      out[k] = k === 'uf' && v ? v.toUpperCase().slice(0, 2) : v;
    }
  }
  return out;
}

// ---------------------------------------------------------------------------
// Configuração do espelho
// ---------------------------------------------------------------------------
export async function espelhoDoQuadro(quadroId, client = { query }) {
  if (!quadroId) return null;
  const { rows } = await client.query(
    `SELECT quadro_id, ativo, mapa, criar_cards, origem_padrao, somente_etiqueta FROM comercial_espelhos WHERE quadro_id = $1`,
    [quadroId],
  );
  return rows[0] && rows[0].ativo ? rows[0] : null;
}

/** Quadro onde nascem os cards dos leads novos do Comercial. */
async function espelhoParaNovos(client = { query }) {
  const { rows } = await client.query(
    `SELECT e.quadro_id, e.ativo, e.mapa, e.criar_cards, e.origem_padrao, e.somente_etiqueta
       FROM comercial_espelhos e JOIN quadros q ON q.id = e.quadro_id AND q.arquivado_em IS NULL
      WHERE e.ativo AND e.criar_cards ORDER BY e.atualizado_em DESC LIMIT 1`,
  );
  return rows[0] || null;
}

export async function salvarEspelho(client, quadroId, {
  mapa, ativo = true, criar_cards = true, origem_padrao = 'prospeccao', somente_etiqueta = null,
}, pessoaId) {
  await client.query(
    `INSERT INTO comercial_espelhos (quadro_id, ativo, mapa, criar_cards, origem_padrao, somente_etiqueta, criado_por_id)
     VALUES ($1, $2, $3::jsonb, $4, $5, $6, $7)
     ON CONFLICT (quadro_id) DO UPDATE
       SET ativo = EXCLUDED.ativo, mapa = EXCLUDED.mapa, criar_cards = EXCLUDED.criar_cards,
           origem_padrao = EXCLUDED.origem_padrao, somente_etiqueta = EXCLUDED.somente_etiqueta, atualizado_em = now()`,
    [quadroId, ativo, JSON.stringify(mapa || {}), criar_cards, origem_padrao, somente_etiqueta || null, pessoaId],
  );
}

async function colunasDoQuadro(quadroId, client = { query }) {
  const { rows } = await client.query(
    `SELECT id, nome, tipo, ordem FROM colunas
      WHERE quadro_id = $1 AND arquivada_em IS NULL AND tipo <> 'sustentacao' ORDER BY ordem`,
    [quadroId],
  );
  return rows;
}

/**
 * Coluna onde o card deste lead deveria estar.
 *   - ganho: a coluna do PRÓXIMO marco ainda não feito (Enviar onboarding,
 *     Treinamento, Em desenvolvimento, Pós-venda); tudo feito → a última
 *   - perdido: a coluna que combina com o motivo (Desistência / Fora do funil)
 *   - demais: a coluna com o mesmo nome da etapa; senão a primeira mapeada
 */
export function colunaPara(lead, espelho, colunas) {
  const cands = colunas.filter((c) => espelho.mapa[c.id] === lead.etapa);
  if (!cands.length) return null;
  if (lead.etapa === 'ganho') {
    const feitos = new Set(Object.keys(lead.toques_marco || {}).map(Number));
    const comMarco = cands.map((c) => ({ c, m: palpiteMarco(c.nome) })).filter((x) => x.m != null)
      .sort((a, b) => a.m - b.m);
    if (!comMarco.length) return cands[0];
    return (comMarco.find((x) => !feitos.has(x.m)) || comMarco[comMarco.length - 1]).c;
  }
  if (lead.etapa === 'perdido') {
    const alvo = lead.motivo_perda ? normalizar(lead.motivo_perda) : '';
    const porMotivo = cands.find((c) => {
      const m = palpiteMotivo(c.nome, null);
      return m && normalizar(m) === alvo;
    });
    return porMotivo || cands.find((c) => palpiteMotivo(c.nome, null)?.startsWith('Fora')) || cands[0];
  }
  const nomeEtapa = normalizar(ETAPA[lead.etapa]?.n);
  return cands.find((c) => normalizar(c.nome) === nomeEtapa) || cands[0];
}

// ---------------------------------------------------------------------------
// QUADRO → COMERCIAL: mover o card
// ---------------------------------------------------------------------------
function recusa(lead, mensagem, pendencias = []) {
  const e = new AppError(mensagem, 409, 'comercial_portao');
  e.detalhes = {
    pode_forcar: false,
    comercial: { lead_id: lead.id, lead_nome: lead.nome, etapa: lead.etapa, etapa_nome: ETAPA[lead.etapa]?.n, mensagem, pendencias },
  };
  return e;
}

/**
 * Decide o efeito no Comercial de mover o card para `colunaId`.
 * Devolve null (nada a fazer) ou um plano; lança 409 se o Comercial recusa.
 */
export async function planejarMovimento(cardId, colunaId) {
  const { rows } = await query(
    `SELECT l.id, c.quadro_id, col.nome AS coluna_nome
       FROM cards c
       JOIN colunas col ON col.id = $2
       JOIN comercial_leads l ON l.origem_card_id = c.id AND l.arquivado_em IS NULL
      WHERE c.id = $1`,
    [cardId, colunaId],
  );
  if (!rows[0]) return null;
  const espelho = await espelhoDoQuadro(rows[0].quadro_id);
  if (!espelho) return null;
  const destino = espelho.mapa[colunaId];
  if (!destino || destino === 'ignorar' || !ETAPA[destino]) return null;

  const lead = await carregarLead(rows[0].id);
  const coluna = rows[0].coluna_nome;
  const marcoColuna = destino === 'ganho' ? palpiteMarco(coluna) : null;
  const marcosAte = (m) => (m == null ? [] : MARCOS_IMPLANTACAO.filter((x) => x.d < m).map((x) => x.d));

  if (destino === lead.etapa) {
    if (destino !== 'ganho') return null;
    const feitos = new Set(Object.keys(lead.toques_marco || {}).map(Number));
    const marcar = marcosAte(marcoColuna).filter((d) => !feitos.has(d));
    return marcar.length ? { leadId: lead.id, etapa: null, marcos: marcar, coluna } : null;
  }

  if (ehRetrocesso(lead.etapa, destino)) {
    throw recusa(lead,
      `No Comercial, "${lead.nome}" está em "${ETAPA[lead.etapa].n}". Voltar etapa ou reabrir exige justificativa: faça pela ficha do lead.`);
  }
  if (lead.etapa === 'ganho' && destino === 'perdido') {
    throw recusa(lead, 'Desfazer uma venda exige justificativa: marque como perdido pela ficha do lead no Comercial.');
  }

  const [reunioes, propostas] = await Promise.all([reunioesDoLead(lead.id), propostasDoLead(lead.id)]);
  const vigente = propostas.find((x) => x.status === 'enviada') || null;
  const valor = Number(lead.valor_mensal) > 0 ? lead.valor_mensal : vigente?.valor_mensal ?? null;
  const pend = pendenciasPortao(lead, destino, { reunioes, propostas, valor_mensal: valor });
  if (pend.length) {
    throw recusa(lead, `Para ir a "${ETAPA[destino].n}" no Comercial falta: ${pend.join('; ')}.`, pend);
  }
  return {
    leadId: lead.id,
    etapa: destino,
    motivo: destino === 'perdido' ? palpiteMotivo(coluna, 'Outro') : null,
    valor: destino === 'ganho' && !(Number(lead.valor_mensal) > 0) ? valor : null,
    propostaVigenteId: destino === 'ganho' ? vigente?.id ?? null : null,
    marcos: destino === 'ganho' ? marcosAte(marcoColuna) : [],
    coluna,
  };
}

/** Grava o plano no Comercial, na transação do card. */
export async function aplicarMovimento(client, plano, pessoaId) {
  if (!plano) return;
  const hoje = hojeBR();
  await client.query('SELECT 1 FROM comercial_leads WHERE id = $1 FOR UPDATE', [plano.leadId]);
  const lead = await carregarLead(plano.leadId, client);
  const nota = `pelo quadro (coluna "${plano.coluna}")`;

  if (plano.etapa && plano.etapa !== lead.etapa) {
    const mud = aplicarEtapa(lead, plano.etapa, hoje);
    const sets = { etapa: mud.etapa, etapa_desde: mud.etapa_desde, marcos: JSON.stringify(mud.marcos) };
    if (mud.cadencia_inicio) sets.cadencia_inicio = mud.cadencia_inicio;
    if (mud.implantacao_inicio) sets.implantacao_inicio = mud.implantacao_inicio;
    sets.motivo_perda = plano.etapa === 'perdido' ? (plano.motivo || 'Outro') : null;
    if (plano.valor) sets.valor_mensal = plano.valor;
    // Lead da fila que anda no funil fica com quem moveu (como na ficha)
    if (!lead.dono_id && plano.etapa !== 'perdido') sets.dono_id = pessoaId;
    const ks = Object.keys(sets);
    await client.query(
      'UPDATE comercial_leads SET ' + ks.map((k, i) => `${k} = $${i + 2}${k === 'marcos' ? '::jsonb' : ''}`).join(', ') + ' WHERE id = $1',
      [lead.id, ...ks.map((k) => sets[k])],
    );
    if (plano.propostaVigenteId) {
      await client.query(`UPDATE comercial_propostas SET status = 'aceita' WHERE id = $1`, [plano.propostaVigenteId]);
    }
    await client.query(
      `INSERT INTO comercial_movimentos (lead_id, de_etapa, para_etapa, pessoa_id, justificativa) VALUES ($1,$2,$3,$4,$5)`,
      [lead.id, lead.etapa, plano.etapa, pessoaId, nota],
    );
    if (sets.motivo_perda) {
      await client.query(
        `INSERT INTO comercial_alteracoes (lead_id, campo, de, para, pessoa_id) VALUES ($1,'motivo_perda',$2,$3,$4)`,
        [lead.id, lead.motivo_perda, sets.motivo_perda, pessoaId],
      );
    }
  }
  for (const d of plano.marcos || []) {
    await client.query(
      `INSERT INTO comercial_toques (lead_id, tipo, dia, nota, data, pessoa_id)
       VALUES ($1, 'marco', $2, $3, $4, $5)
       ON CONFLICT (lead_id, tipo, dia) WHERE tipo IN ('cadencia','marco') AND estornado_em IS NULL DO NOTHING`,
      [lead.id, d, 'marcado ' + nota, hoje, pessoaId],
    );
  }
}

// ---------------------------------------------------------------------------
// QUADRO → COMERCIAL: card novo e dados do card
// ---------------------------------------------------------------------------
async function comentar(client, cardId, pessoaId, texto) {
  await client.query(`INSERT INTO card_comentarios (card_id, pessoa_id, texto) VALUES ($1,$2,$3)`, [cardId, pessoaId, '[Comercial] ' + texto]);
}

async function dadosDoCard(cardId, client = { query }) {
  const { rows } = await client.query(
    `SELECT c.id, c.titulo, c.quadro_id, c.coluna_id, c.card_pai_id, c.arquivado_em, col.nome AS coluna_nome,
            (SELECT cr.pessoa_id FROM cards_responsaveis cr JOIN pessoas_acesso p ON p.id = cr.pessoa_id AND p.ativo
              WHERE cr.card_id = c.id ORDER BY cr.ordem, cr.adicionado_em LIMIT 1) AS responsavel_id,
            COALESCE((SELECT jsonb_object_agg(v.campo_id, v.valor #>> '{}') FROM cards_campos_valores v WHERE v.card_id = c.id), '{}'::jsonb) AS valores,
            COALESCE((SELECT array_agg(lower(qe.nome)) FROM cards_etiquetas ce JOIN quadros_etiquetas qe ON qe.id = ce.etiqueta_id
                       WHERE ce.card_id = c.id), '{}') AS etiquetas
       FROM cards c JOIN colunas col ON col.id = c.coluna_id WHERE c.id = $1`,
    [cardId],
  );
  if (!rows[0]) return null;
  const { rows: campos } = await client.query(`SELECT id, nome, tipo FROM quadros_campos WHERE quadro_id = $1`, [rows[0].quadro_id]);
  return { ...rows[0], contatos: contatosDoCard(campos, rows[0].valores || {}), campos };
}

/** Card criado num quadro em espelho vira lead. Nunca derruba a criação do card. */
export async function leadDoCardNovo(cardId, pessoaId) {
  const client = await pool.connect();
  try {
    const card = await dadosDoCard(cardId, client);
    if (!card || card.card_pai_id) return null;
    const espelho = await espelhoDoQuadro(card.quadro_id, client);
    if (!espelho) return null;
    const mapeada = espelho.mapa[card.coluna_id];
    if (!mapeada || mapeada === 'ignorar' || !ETAPA[mapeada]) return null;
    const { rows: ja } = await client.query(`SELECT 1 FROM comercial_leads WHERE origem_card_id = $1`, [cardId]);
    if (ja.length) return null;
    // Quadro misto: só o card com a etiqueta de venda (ex.: "Cliente") vira lead
    if (espelho.somente_etiqueta && !(card.etiquetas || []).includes(espelho.somente_etiqueta.trim().toLowerCase())) return null;

    await client.query('BEGIN');
    if (mapeada === 'perdido' || mapeada === 'ganho') {
      await comentar(client, cardId, pessoaId,
        `Card criado direto em "${card.coluna_nome}": não virou lead, porque ${mapeada === 'ganho' ? 'um ganho precisa passar pela reunião e pela proposta' : 'um lead não nasce perdido'}. Crie o card numa coluna do funil (por exemplo Em prospecção).`);
      await client.query('COMMIT');
      return null;
    }
    // Card novo entra no máximo em Reunião de apresentação: as etapas
    // seguintes têm portões (reunião feita, proposta) que ainda não existem.
    const etapa = ETAPA[mapeada].i > ETAPA.diagnostico.i ? 'diagnostico' : mapeada;
    const dados = {
      nome: card.titulo.slice(0, 255), ...card.contatos,
      dono_id: card.responsavel_id || (etapa === 'prospect' ? null : pessoaId),
      origem: espelho.origem_padrao || 'prospeccao', etapa,
      notas: '(criado a partir de um card do quadro)',
    };
    const bloq = await verificarBloqueios(dados, { soVerificar: true, client });
    if (bloq) {
      await comentar(client, cardId, pessoaId, `Não virou lead: ${bloq.msg}`);
      await client.query('COMMIT');
      return null;
    }
    const id = await inserirLead(client, dados, pessoaId, { origem_card_id: cardId, justificativa: 'card criado no quadro' });
    if (etapa !== mapeada) {
      await comentar(client, cardId, pessoaId,
        `Virou lead em "${ETAPA[etapa].n}". Para "${ETAPA[mapeada].n}", registre no Comercial a reunião feita e a proposta.`);
    }
    await client.query('COMMIT');
    return id;
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    console.error('[comercial.espelho] card novo → lead falhou:', err.message);
    return null;
  } finally { client.release(); }
}

/** Título, campos de contato e (se trocado no card) o responsável vão para o lead. */
export async function espelharCardNoLead(cardId, pessoaId, { responsavel = false } = {}) {
  try {
    const { rows } = await query(
      `SELECT l.id FROM comercial_leads l JOIN cards c ON c.id = l.origem_card_id
        WHERE l.origem_card_id = $1 AND l.arquivado_em IS NULL`,
      [cardId],
    );
    if (!rows[0]) return;
    const card = await dadosDoCard(cardId);
    if (!card || !(await espelhoDoQuadro(card.quadro_id))) return;
    const lead = await carregarLead(rows[0].id);
    const novo = { nome: vazio(card.titulo)?.slice(0, 255) || lead.nome, ...card.contatos };
    for (const k of Object.keys(novo)) {
      if (typeof novo[k] === 'string' && LIMITES_LEAD[k]) novo[k] = novo[k].slice(0, LIMITES_LEAD[k]).trim();
    }
    // Responsável só segue o card quando ele foi trocado no card (senão um
    // lead da fila ganharia dono só porque alguém corrigiu o título)
    if (responsavel && card.responsavel_id) novo.dono_id = card.responsavel_id;
    const muda = Object.keys(novo).filter((k) => (novo[k] ?? null) !== (lead[k] ?? null)
      // campo do quadro vazio não apaga dado do lead
      && !(novo[k] == null && k !== 'dono_id'));
    if (!muda.length) return;
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      await client.query(
        'UPDATE comercial_leads SET ' + muda.map((k, i) => `${k} = $${i + 2}`).join(', ') + ' WHERE id = $1',
        [lead.id, ...muda.map((k) => novo[k])],
      );
      for (const k of muda) {
        await client.query(
          `INSERT INTO comercial_alteracoes (lead_id, campo, de, para, pessoa_id) VALUES ($1,$2,$3,$4,$5)`,
          [lead.id, k, lead[k] == null ? null : String(lead[k]), novo[k] == null ? null : String(novo[k]) + ' (pelo quadro)', pessoaId],
        );
      }
      await client.query('COMMIT');
    } catch (err) {
      await client.query('ROLLBACK').catch(() => {});
      throw err;
    } finally { client.release(); }
  } catch (err) {
    console.error('[comercial.espelho] card → lead falhou:', err.message);
  }
}

// ---------------------------------------------------------------------------
// COMERCIAL → QUADRO
// ---------------------------------------------------------------------------
async function moverCard(client, card, coluna, pessoaId, tipoOrigem) {
  const { rows: max } = await client.query(
    `SELECT COALESCE(MAX(ordem), 0) + 1000 AS prox FROM cards WHERE coluna_id = $1 AND arquivado_em IS NULL`, [coluna.id],
  );
  const conclui = coluna.tipo === 'concluida';
  await client.query(
    `UPDATE cards SET coluna_id = $1, ordem = $2, coluna_desde = NOW(),
            concluido_em = ${conclui ? 'COALESCE(concluido_em, NOW())' : 'NULL'},
            iniciado_em = ${coluna.tipo !== 'backlog' ? 'COALESCE(iniciado_em, NOW())' : 'iniciado_em'}
      WHERE id = $3`,
    [coluna.id, max[0].prox, card.id],
  );
  await client.query(
    `INSERT INTO cards_movimentos (card_id, quadro_id, de_coluna_id, para_coluna_id, de_tipo, para_tipo, minutos_na_origem, pessoa_id)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
    [card.id, card.quadro_id, card.coluna_id, coluna.id, tipoOrigem, coluna.tipo,
      card.coluna_desde ? Math.max(0, Math.round((Date.now() - new Date(card.coluna_desde).getTime()) / 60000)) : null, pessoaId],
  );
}

/** Copia nome, responsável e contatos do lead para o card. */
async function copiarDadosParaCard(client, lead, card, pessoaId) {
  if (vazio(lead.nome) && lead.nome !== card.titulo) {
    await client.query('UPDATE cards SET titulo = $2 WHERE id = $1', [card.id, lead.nome.slice(0, 500)]);
  }
  if (lead.dono_id && lead.dono_id !== card.responsavel_id) {
    await client.query('DELETE FROM cards_responsaveis WHERE card_id = $1 AND pessoa_id = $2', [card.id, lead.dono_id]);
    await client.query('UPDATE cards_responsaveis SET ordem = ordem + 1 WHERE card_id = $1', [card.id]);
    await client.query(
      `INSERT INTO cards_responsaveis (card_id, pessoa_id, ordem, adicionado_por_id) VALUES ($1,$2,0,$3)`,
      [card.id, lead.dono_id, pessoaId],
    );
  }
  for (const c of card.campos) {
    const k = campoDoLead(c.nome);
    if (!k || c.tipo !== 'texto') continue;
    let v;
    if (k === 'cidade_uf') v = lead.cidade ? (lead.uf ? `${lead.cidade}/${lead.uf}` : lead.cidade) : null;
    else v = lead[k] ?? null;
    const atualNoCard = vazio(card.valores[c.id]);
    if (v == null || atualNoCard === vazio(v)) continue;
    // O card guarda o texto inteiro (ex.: vários telefones); o lead, a versão
    // cortada. Se o card já começa com o valor do lead, não encurta o card.
    if (atualNoCard && atualNoCard.startsWith(String(v))) continue;
    await client.query(
      `INSERT INTO cards_campos_valores (card_id, campo_id, valor, atualizado_em) VALUES ($1,$2,$3::jsonb,NOW())
       ON CONFLICT (card_id, campo_id) DO UPDATE SET valor = EXCLUDED.valor, atualizado_em = NOW()`,
      [card.id, c.id, JSON.stringify(String(v).slice(0, 500))],
    );
  }
}

async function criarCardDoLead(client, lead, espelho, pessoaId) {
  const colunas = await colunasDoQuadro(espelho.quadro_id, client);
  const coluna = colunaPara(lead, espelho, colunas);
  if (!coluna) return null;
  const { rows: max } = await client.query(
    `SELECT COALESCE(MAX(ordem), 0) + 1000 AS prox FROM cards WHERE coluna_id = $1 AND arquivado_em IS NULL`, [coluna.id],
  );
  const { rows } = await client.query(
    `INSERT INTO cards (coluna_id, quadro_id, titulo, ordem, criado_por_id, prioridade, coluna_desde, iniciado_em)
     VALUES ($1,$2,$3,$4,$5,2,NOW(),${coluna.tipo !== 'backlog' ? 'NOW()' : 'NULL'}) RETURNING id`,
    [coluna.id, espelho.quadro_id, lead.nome.slice(0, 500), max[0].prox, pessoaId],
  );
  await client.query(
    `INSERT INTO cards_movimentos (card_id, quadro_id, de_coluna_id, para_coluna_id, de_tipo, para_tipo, pessoa_id)
     VALUES ($1,$2,NULL,$3,NULL,$4,$5)`,
    [rows[0].id, espelho.quadro_id, coluna.id, coluna.tipo, pessoaId],
  );
  if (espelho.somente_etiqueta) {
    await client.query(
      `INSERT INTO cards_etiquetas (card_id, etiqueta_id)
       SELECT $1, qe.id FROM quadros_etiquetas qe WHERE qe.quadro_id = $2 AND lower(qe.nome) = lower($3) LIMIT 1`,
      [rows[0].id, espelho.quadro_id, espelho.somente_etiqueta.trim()],
    );
  }
  await client.query('UPDATE comercial_leads SET origem_card_id = $2 WHERE id = $1', [lead.id, rows[0].id]);
  return rows[0].id;
}

/**
 * Leva para o quadro o que mudou nos leads desde `inicio` (timestamp do
 * banco no começo da requisição). Chamado depois de toda escrita no
 * Comercial. Erro aqui nunca afeta a resposta do Comercial.
 */
export async function espelharDesde(inicio, pessoaId) {
  const { rows: ativos } = await query(`SELECT 1 FROM comercial_espelhos WHERE ativo LIMIT 1`);
  if (!ativos.length) return;
  const { rows: leads } = await query(
    `SELECT l.id, l.origem_card_id, l.criado_em >= $1 AS novo,
            EXISTS (SELECT 1 FROM comercial_movimentos m WHERE m.lead_id = l.id AND m.em >= $1) AS mudou_etapa,
            EXISTS (SELECT 1 FROM comercial_toques t WHERE t.lead_id = l.id AND t.tipo = 'marco' AND t.criado_em >= $1) AS marco_novo
       FROM comercial_leads l
      WHERE l.atualizado_em >= $1 AND l.arquivado_em IS NULL
      LIMIT 2000`,
    [inicio],
  );
  const quadros = new Set();
  for (const x of leads) {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const lead = await carregarLead(x.id, client);
      if (!x.origem_card_id) {
        if (!x.novo) { await client.query('ROLLBACK'); continue; }
        const espelho = await espelhoParaNovos(client);
        if (!espelho) { await client.query('ROLLBACK'); continue; }
        const cardId = await criarCardDoLead(client, lead, espelho, pessoaId);
        if (cardId) {
          const card = await dadosDoCard(cardId, client);
          await copiarDadosParaCard(client, lead, card, pessoaId);
          quadros.add(espelho.quadro_id);
        }
        await client.query('COMMIT');
        continue;
      }
      const card = await dadosDoCard(x.origem_card_id, client);
      const espelho = card && !card.arquivado_em ? await espelhoDoQuadro(card.quadro_id, client) : null;
      if (!espelho) { await client.query('ROLLBACK'); continue; }
      const { rows: cr } = await client.query(
        `SELECT c.coluna_desde, col.tipo FROM cards c JOIN colunas col ON col.id = c.coluna_id WHERE c.id = $1`, [card.id],
      );
      const atual = espelho.mapa[card.coluna_id];
      let destino = null;
      if (x.mudou_etapa && atual !== lead.etapa) {
        destino = colunaPara(lead, espelho, await colunasDoQuadro(card.quadro_id, client));
      } else if (lead.etapa === 'ganho' && atual === 'ganho' && (x.marco_novo || x.mudou_etapa)) {
        // Implantação: o card só anda para a FRENTE quando um marco é feito
        const alvo = colunaPara(lead, espelho, await colunasDoQuadro(card.quadro_id, client));
        const mAtual = palpiteMarco(card.coluna_nome);
        const mAlvo = alvo ? palpiteMarco(alvo.nome) : null;
        if (alvo && mAlvo != null && (mAtual == null || mAlvo > mAtual)) destino = alvo;
      }
      if (destino && destino.id !== card.coluna_id) {
        await moverCard(client, { ...card, coluna_desde: cr[0]?.coluna_desde }, destino, pessoaId, cr[0]?.tipo);
      }
      await copiarDadosParaCard(client, lead, card, pessoaId);
      await client.query('COMMIT');
      quadros.add(card.quadro_id);
    } catch (err) {
      await client.query('ROLLBACK').catch(() => {});
      console.error('[comercial.espelho] lead → quadro falhou:', x.id, err.message);
    } finally { client.release(); }
  }
  quadros.forEach((q) => publicarMudanca(q, 'comercial'));
}

/**
 * Middleware das rotas do Comercial: marca o início (relógio do banco) e,
 * terminada a escrita com sucesso, espelha no quadro ANTES de responder —
 * assim a ficha que volta já mostra o card na coluna nova. Erro no espelho
 * nunca derruba a resposta do Comercial.
 */
export function espelharDepois(req, res, next) {
  if (req.method === 'GET') return next();
  query('SELECT now() AS t').then(({ rows }) => {
    const inicio = rows[0].t;
    const original = res.json.bind(res);
    res.json = (corpo) => {
      if (res.statusCode >= 400) return original(corpo);
      espelharDesde(inicio, req.pessoa?.id || null)
        .then(async () => {
          // Ficha de lead na resposta: atualiza onde o card está agora
          if (corpo && typeof corpo === 'object' && corpo.id && 'quadro' in corpo) {
            const { rows: r } = await query(
              `SELECT json_build_object('card_id', cq.id, 'quadro_id', cq.quadro_id, 'quadro', qq.nome, 'coluna', cc.nome,
                        'espelho', EXISTS (SELECT 1 FROM comercial_espelhos e WHERE e.quadro_id = cq.quadro_id AND e.ativo)) AS quadro
                 FROM comercial_leads l JOIN cards cq ON cq.id = l.origem_card_id AND cq.arquivado_em IS NULL
                 JOIN quadros qq ON qq.id = cq.quadro_id JOIN colunas cc ON cc.id = cq.coluna_id
                WHERE l.id = $1`,
              [corpo.id],
            );
            corpo = { ...corpo, quadro: r[0]?.quadro ?? null };
          }
        })
        .catch((err) => console.error('[comercial.espelho]', err.message))
        .finally(() => original(corpo));
      return res;
    };
    next();
  }).catch(() => next());
}
