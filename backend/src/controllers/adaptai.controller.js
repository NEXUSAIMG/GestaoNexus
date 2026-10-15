import { z } from 'zod';
import { query, pool } from '../config/database.js';
import { AppError, NaoEncontradoError } from '../utils/errors.js';
import { registrarAcao } from '../utils/audit.js';
import {
  hojeBR, addDias, TIPOS, TIPO, trilhaDoTipo, ETAPAS, FINAIS, FINAIS_TRILHA, ETAPA_INICIAL, NOME_ETAPA,
  etapasDaTrilha, ehAberta, ehRetrocesso, MOTIVOS_PERDA, DIAS_NUTRICAO, ORIGENS, ROTAS, rotaDoBairro,
  PONTUACAO, TRATAMENTO, CADENCIA, PASSO, TIPOS_ATIVIDADE, TIPO_ATIV, TIPOS_ATIV_CHAVES, RESULTADOS,
  RESULTADOS_CHAVES, RESPONDEU, BANT, DIAGNOSTICO, DIAGNOSTICO_OBRIG, DIAS_PILOTO, MARCOS_PILOTO,
  METRICAS_PILOTO, METAS, METAS_CHAVES, aplicarEtapa, pendenciasPortao, somaPontos,
} from '../services/adaptai.regras.js';
import {
  SELECT_ESCOLA, novoProtocolo, atividadesPorEscola, enriquecer, carregarEscola, listarEscolas,
  lerMetas, calcularPainel,
} from '../services/adaptai.dados.js';
import { LISTA_BELEM, FONTE_LISTA, VAGAS_A_COMPLETAR } from '../services/adaptai.lista-belem.js';
import { pessoasAtivas } from '../services/comercial.dados.js';

/**
 * Sprint 43 — Frente AdaptAI no Comercial.
 *
 * Regras garantidas pelo servidor:
 *   - portões de etapa (decisor identificado, BANT, demo/oficina feita,
 *     diagnóstico + piloto ou proposta antes de "Proposta / piloto")
 *   - voltar etapa e reabrir exige justificativa; a gestão pode forçar um
 *     portão, com justificativa registrada
 *   - perdido exige motivo; nutrição retoma em 60 dias
 *   - contato só é registrado com data de hoje (a gestão pode lançar até 7
 *     dias para trás); nunca é apagado: erro vira estorno com motivo
 *   - nenhum campo guarda dado de aluno (aviso na tela; LGPD)
 */

const ehAdmin = (req) => !!req.pessoa?.administrador;
const ehGestor = (req) => !!req.gestorComercial || ehAdmin(req);
function exigirGestor(req, msg) {
  if (!ehGestor(req)) throw new AppError(msg || 'Só a gestão comercial pode fazer isso.', 403, 'so_gestao');
}

const dataISO = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'data no formato AAAA-MM-DD');
// undefined continua undefined (campo não enviado = não mexe); vazio vira null
const dataOpc = z.union([dataISO, z.literal(''), z.null()]).optional().transform((v) => (v === undefined ? undefined : v || null));
const txt = (max) => z.string().max(max).nullable().optional()
  .transform((v) => (v === undefined ? undefined : v == null || String(v).trim() === '' ? null : String(v).trim()));
const pts = (max) => z.union([z.number().int().min(0).max(max), z.null()]).optional();
const intOpc = z.union([z.number().int().min(0).max(100000), z.null()]).optional();
const jsonTxt = z.record(z.union([z.string().max(4000), z.number(), z.boolean(), z.null()])).optional();

const campos = {
  nome: z.string().trim().min(1, 'informe o nome da escola').max(255),
  tipo: z.enum(TIPOS.map((t) => t.k)),
  etapas_ensino: txt(160),
  bairro: txt(80),
  rota: z.union([z.enum(['A', 'B', 'C']), z.literal(''), z.null()]).optional().transform((v) => (v === undefined ? undefined : v || null)),
  endereco: txt(255),
  telefone: txt(120),
  email: txt(255),
  site: txt(255),
  fonte_dados: txt(255),
  dados_confirmados: z.boolean().optional(),
  pts_etapas: pts(3), pts_porte: pts(3), pts_acesso: pts(2), pts_rota: pts(2),
  pontos: z.union([z.number().int().min(0).max(10), z.null()]).optional(),
  aee_ativo: z.union([z.boolean(), z.null()]).optional(),
  alunos_tea: intOpc, professores: intOpc,
  decisor_nome: txt(160), decisor_cargo: txt(120), decisor_contato: txt(160),
  aliado_nome: txt(160), aliado_cargo: txt(120), aliado_contato: txt(160),
  dono_id: z.string().uuid().nullable().optional(),
  bant: jsonTxt, diagnostico: jsonTxt, piloto: jsonTxt, proposta: jsonTxt,
  piloto_inicio: dataOpc,
  valor_mensal: z.union([z.number().min(0).max(10_000_000), z.null()]).optional(),
  origem: z.enum(ORIGENS.map((o) => o.k)).optional(),
  indicado_por: txt(160),
  motivo_perda: z.union([z.enum(MOTIVOS_PERDA), z.literal(''), z.null()]).optional().transform((v) => (v === undefined ? undefined : v || null)),
  motivo_perda_obs: txt(2000),
  nutricao_ate: dataOpc,
  proximo_passo: txt(255),
  proxima_data: dataOpc,
  notas: txt(8000),
};
const criarSchema = z.object({ ...campos, etapa: z.string().optional() });
const atualizarSchema = z.object({
  ...Object.fromEntries(Object.entries(campos).map(([k, v]) => [k, v.optional()])),
  etapa: z.string().optional(),
  justificativa: z.string().trim().max(2000).optional(),
  forcar: z.boolean().optional(),
});

const COLUNAS = Object.keys(campos);
const JSONB = ['bant', 'diagnostico', 'piloto', 'proposta'];

function validar(schema, body) {
  const r = schema.safeParse(body ?? {});
  if (!r.success) {
    const i = r.error.issues[0];
    throw new AppError(`${i.path.join('.') || 'dados'}: ${i.message}`, 400, 'validacao');
  }
  return r.data;
}

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------
export async function config(req, res, next) {
  try {
    const { rows } = await query(`SELECT chave, valor FROM adapt_config`);
    res.json({
      tipos: TIPOS, etapas: ETAPAS, finais: FINAIS, finais_trilha: FINAIS_TRILHA, nomes_etapa: NOME_ETAPA,
      motivos_perda: MOTIVOS_PERDA, dias_nutricao: DIAS_NUTRICAO, origens: ORIGENS, rotas: ROTAS,
      pontuacao: PONTUACAO, tratamento: TRATAMENTO, cadencia: CADENCIA, tipos_atividade: TIPOS_ATIVIDADE,
      resultados: RESULTADOS, bant: BANT, diagnostico: DIAGNOSTICO, diagnostico_obrig: DIAGNOSTICO_OBRIG,
      dias_piloto: DIAS_PILOTO, marcos_piloto: MARCOS_PILOTO, metricas_piloto: METRICAS_PILOTO,
      metas_def: METAS, metas: await lerMetas(),
      config: Object.fromEntries(rows.map((r) => [r.chave, r.valor])),
      vagas_a_completar: VAGAS_A_COMPLETAR,
      pessoas: await pessoasAtivas(),
      eu: { id: req.pessoa.id, admin: ehAdmin(req), gestor: ehGestor(req) },
      hoje: hojeBR(),
    });
  } catch (err) { next(err); }
}

// ---------------------------------------------------------------------------
// Escolas
// ---------------------------------------------------------------------------
export async function listar(_req, res, next) {
  try { res.json({ escolas: await listarEscolas() }); } catch (err) { next(err); }
}

async function fichaCompleta(id) {
  const e = await carregarEscola(id);
  if (!e) throw new NaoEncontradoError('Escola não encontrada');
  const { rows: ativ } = await query(
    `SELECT a.*, a.data::text AS data, p.nome AS pessoa_nome
       FROM adapt_atividades a LEFT JOIN pessoas_acesso p ON p.id = a.pessoa_id
      WHERE a.escola_id = $1 ORDER BY a.quando DESC`,
    [id],
  );
  const { rows: mov } = await query(
    `SELECT m.*, p.nome AS pessoa_nome FROM adapt_movimentos m LEFT JOIN pessoas_acesso p ON p.id = m.pessoa_id
      WHERE m.escola_id = $1 ORDER BY m.em DESC`,
    [id],
  );
  const vivas = ativ.filter((a) => !a.estornado_em);
  const enr = enriquecer(e, vivas);
  const proximas = etapasDaTrilha(e.trilha).filter((k) => k !== e.etapa);
  const pendencias = Object.fromEntries(proximas.map((k) => [k, pendenciasPortao(e, k, { atividades: vivas })]));
  return { ...enr, atividades: ativ, movimentos: mov, pendencias };
}

export async function obter(req, res, next) {
  try { res.json(await fichaCompleta(req.params.id)); } catch (err) { next(err); }
}

function normalizarPontos(d) {
  const soma = somaPontos(d);
  if (soma != null) d.pontos = soma;
  return d;
}

export async function criar(req, res, next) {
  const client = await pool.connect();
  try {
    const d = normalizarPontos(validar(criarSchema, req.body));
    const trilha = trilhaDoTipo(d.tipo);
    const { rows: dup } = await client.query(
      `SELECT id, nome, protocolo FROM adapt_escolas WHERE arquivado_em IS NULL AND lower(nome) = lower($1)`, [d.nome],
    );
    if (dup.length) throw new AppError(`Esta escola já está cadastrada: ${dup[0].nome} (${dup[0].protocolo}).`, 409, 'duplicada');
    const etapa = ETAPA_INICIAL[trilha];
    const hoje = hojeBR();
    const mud = aplicarEtapa({ trilha, marcos: {} }, etapa, hoje);
    if (!d.rota && d.bairro) d.rota = rotaDoBairro(d.bairro);
    await client.query('BEGIN');
    const cols = COLUNAS.filter((k) => d[k] !== undefined);
    const vals = cols.map((k) => (JSONB.includes(k) ? JSON.stringify(d[k] || {}) : d[k]));
    if (d.piloto_inicio) { cols.push('piloto_fim'); vals.push(addDias(d.piloto_inicio, DIAS_PILOTO)); }
    cols.push('protocolo', 'trilha', 'etapa', 'etapa_desde', 'marcos', 'criado_por_id');
    vals.push(novoProtocolo(hoje), trilha, etapa, hoje, JSON.stringify(mud.marcos), req.pessoa.id);
    if (d.dono_id === undefined) { cols.push('dono_id'); vals.push(req.pessoa.id); }
    const { rows } = await client.query(
      `INSERT INTO adapt_escolas (${cols.join(',')}) VALUES (${cols.map((_, i) => '$' + (i + 1)).join(',')}) RETURNING id`,
      vals,
    );
    await client.query(
      `INSERT INTO adapt_movimentos (escola_id, de_etapa, para_etapa, pessoa_id) VALUES ($1, NULL, $2, $3)`,
      [rows[0].id, etapa, req.pessoa.id],
    );
    await client.query('COMMIT');
    await registrarAcao({ pessoa_acesso_id: req.pessoa.id, acao: 'adaptai.escola.criar', detalhes: { id: rows[0].id, nome: d.nome }, req });
    res.status(201).json(await fichaCompleta(rows[0].id));
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    next(err);
  } finally { client.release(); }
}

export async function atualizar(req, res, next) {
  const client = await pool.connect();
  try {
    const d = validar(atualizarSchema, req.body);
    await client.query('BEGIN');
    const { rows: atual } = await client.query(`${SELECT_ESCOLA} WHERE e.id = $1 FOR UPDATE OF e`, [req.params.id]);
    const e = atual[0];
    if (!e) throw new NaoEncontradoError('Escola não encontrada');
    if (e.arquivado_em) throw new AppError('Escola arquivada.', 409, 'arquivada');

    // Mesclar jsonb (o cliente pode mandar só uma parte)
    for (const k of JSONB) if (d[k] !== undefined) d[k] = { ...(e[k] || {}), ...d[k] };
    const merged = { ...e, ...Object.fromEntries(Object.entries(d).filter(([, v]) => v !== undefined)) };
    if (PONTUACAO.some((p) => d[p.k] !== undefined)) {
      const soma = somaPontos(merged);
      if (soma != null) d.pontos = soma;
    }
    if (d.tipo && d.tipo !== e.tipo && trilhaDoTipo(d.tipo) !== e.trilha) {
      throw new AppError('Esse tipo muda o funil (escola, rede ou parceiro). Cadastre de novo no tipo certo e arquive este.', 400, 'trilha');
    }
    if (d.bairro !== undefined && d.rota === undefined && !e.rota) d.rota = rotaDoBairro(d.bairro);
    if (d.piloto_inicio !== undefined) d.piloto_fim = d.piloto_inicio ? addDias(d.piloto_inicio, DIAS_PILOTO) : null;

    const sets = {};
    for (const k of [...COLUNAS, 'piloto_fim']) if (d[k] !== undefined) sets[k] = JSONB.includes(k) ? JSON.stringify(d[k]) : d[k];

    // Responsável: quem não é gestão só pega escola sem dono ou repassa a sua
    if (d.dono_id !== undefined && d.dono_id !== e.dono_id && !ehGestor(req)
      && e.dono_id && e.dono_id !== req.pessoa.id) {
      throw new AppError('Só a gestão troca o responsável de uma escola que é de outra pessoa.', 403, 'dono');
    }

    // Mudança de etapa
    let movimento = null;
    if (d.etapa && d.etapa !== e.etapa) {
      const nova = d.etapa;
      if (!etapasDaTrilha(e.trilha).includes(nova)) throw new AppError('Etapa inválida para este funil.', 400, 'etapa');
      const { rows: ativ } = await client.query(
        `SELECT tipo, status, resultado, passo, estornado_em FROM adapt_atividades WHERE escola_id = $1`, [e.id],
      );
      const falta = pendenciasPortao(e, nova, { atividades: ativ, dados: d });
      const just = (d.justificativa || '').trim();
      if (falta.length) {
        if (!(d.forcar && ehGestor(req))) {
          throw new AppError(`Para ir para "${NOME_ETAPA[nova]}" falta: ${falta.join('; ')}.`, 400, 'portao', { falta });
        }
        if (just.length < 10) throw new AppError('Para forçar a etapa, escreva a justificativa (10 caracteres ou mais).', 400, 'justificativa');
      }
      if (ehRetrocesso(e.trilha, e.etapa, nova) && just.length < 10) {
        throw new AppError('Voltar etapa ou reabrir exige justificativa (10 caracteres ou mais).', 400, 'justificativa');
      }
      const mud = aplicarEtapa(e, nova);
      sets.etapa = nova;
      sets.etapa_desde = mud.etapa_desde;
      sets.marcos = JSON.stringify(mud.marcos);
      if (nova === 'nutricao') sets.nutricao_ate = d.nutricao_ate || e.nutricao_ate || addDias(hojeBR(), DIAS_NUTRICAO);
      else if (ehAberta(nova)) sets.nutricao_ate = null;
      if (nova !== 'perdido' && e.motivo_perda && ehAberta(nova)) sets.motivo_perda = null;
      if (nova === 'nutricao' && !d.proximo_passo) {
        sets.proximo_passo = 'Retomar contato (nutrição)';
        sets.proxima_data = sets.nutricao_ate;
      }
      if (nova === 'proposta' && !d.proximo_passo) {
        sets.proximo_passo = 'Acompanhamento semanal do piloto/proposta';
        sets.proxima_data = addDias(hojeBR(), 7);
      }
      movimento = { de: e.etapa, para: nova, just: just || null, forcado: falta.length > 0 };
    }

    const chaves = Object.keys(sets);
    if (chaves.length) {
      await client.query(
        `UPDATE adapt_escolas SET ${chaves.map((k, i) => `${k} = $${i + 2}${k === 'marcos' || JSONB.includes(k) ? '::jsonb' : ''}`).join(', ')} WHERE id = $1`,
        [e.id, ...chaves.map((k) => sets[k])],
      );
    }
    if (movimento) {
      await client.query(
        `INSERT INTO adapt_movimentos (escola_id, de_etapa, para_etapa, pessoa_id, justificativa) VALUES ($1,$2,$3,$4,$5)`,
        [e.id, movimento.de, movimento.para, req.pessoa.id, movimento.forcado ? `[forçado] ${movimento.just}` : movimento.just],
      );
    }
    await client.query('COMMIT');
    if (movimento) await registrarAcao({ pessoa_acesso_id: req.pessoa.id, acao: 'adaptai.escola.etapa', detalhes: { id: e.id, ...movimento }, req });
    res.json(await fichaCompleta(e.id));
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    next(err);
  } finally { client.release(); }
}

export async function arquivar(req, res, next) {
  try {
    exigirGestor(req, 'Só a gestão comercial arquiva escolas.');
    const motivo = String(req.body?.motivo || '').trim();
    if (motivo.length < 5) throw new AppError('Informe o motivo do arquivamento.', 400, 'motivo');
    const { rowCount } = await query(
      `UPDATE adapt_escolas SET arquivado_em = NOW(), arquivado_motivo = $2 WHERE id = $1 AND arquivado_em IS NULL`,
      [req.params.id, motivo],
    );
    if (!rowCount) throw new NaoEncontradoError('Escola não encontrada');
    res.json({ ok: true });
  } catch (err) { next(err); }
}

// ---------------------------------------------------------------------------
// Atividades
// ---------------------------------------------------------------------------
const atividadeSchema = z.object({
  tipo: z.enum(TIPOS_ATIV_CHAVES),
  passo: z.string().max(30).nullable().optional(),
  resultado: z.union([z.enum(RESULTADOS_CHAVES), z.null()]).optional(),
  status: z.enum(['feito', 'agendado']).default('feito'),
  data: dataISO.optional(),
  hora: z.string().regex(/^\d{2}:\d{2}$/).optional(),
  com_quem: txt(160),
  nota: txt(4000),
  proximo_passo: txt(255),
  proxima_data: dataOpc,
});

export async function registrarAtividade(req, res, next) {
  const client = await pool.connect();
  try {
    const d = validar(atividadeSchema, req.body);
    const hoje = hojeBR();
    await client.query('BEGIN');
    const e = await carregarEscola(req.params.id, client);
    if (!e || e.arquivado_em) throw new NaoEncontradoError('Escola não encontrada');
    const tipoInfo = TIPO_ATIV[d.tipo];
    if (d.passo && !PASSO[d.passo]) throw new AppError('Passo da cadência inválido.', 400, 'passo');
    if (d.passo && !PASSO[d.passo].tipos.includes(d.tipo)) throw new AppError(`Esse passo é por ${PASSO[d.passo].canal.toLowerCase()}.`, 400, 'passo');

    let data = d.data || hoje;
    if (d.status === 'feito') {
      if (data > hoje) throw new AppError('Atividade feita não pode ter data futura. Use "agendar".', 400, 'data');
      if (data < hoje && !(ehGestor(req) && data >= addDias(hoje, -7))) {
        throw new AppError('Registre a atividade no dia em que foi feita. Só a gestão lança até 7 dias para trás.', 400, 'data');
      }
      if (tipoInfo.contato && !d.resultado) throw new AppError('Informe o resultado do contato.', 400, 'resultado');
    } else {
      if (!tipoInfo.reuniao && d.tipo !== 'visita' && d.tipo !== 'ligacao') throw new AppError('Agende reuniões, visitas ou ligações.', 400, 'tipo');
      if (!d.data) throw new AppError('Informe a data do agendamento.', 400, 'data');
      if (data < hoje) throw new AppError('Agendamento precisa ser hoje ou depois.', 400, 'data');
    }
    const quando = d.hora ? `${data}T${d.hora}:00-03:00` : (d.status === 'feito' && data === hoje ? new Date().toISOString() : `${data}T12:00:00-03:00`);
    const { rows } = await client.query(
      `INSERT INTO adapt_atividades (escola_id, tipo, passo, dia_cadencia, resultado, status, quando, data, com_quem, nota, pessoa_id)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) RETURNING id`,
      [e.id, d.tipo, d.passo || null, d.passo ? PASSO[d.passo].dia : null, d.resultado || null, d.status, quando, data,
        d.com_quem, d.nota, req.pessoa.id],
    );

    // Efeitos automáticos
    const sets = {};
    const ehContato = tipoInfo.contato || tipoInfo.reuniao;
    if (d.status === 'feito' && ehContato && !e.cadencia_inicio && e.trilha === 'escola') sets.cadencia_inicio = data;
    let novaEtapa = null;
    if (d.status === 'feito' && e.etapa === 'lista' && (RESPONDEU.includes(d.resultado) || tipoInfo.reuniao)) novaEtapa = 'contato';
    if (d.status === 'feito' && ['demo', 'oficina'].includes(d.tipo) && ['qualificada'].includes(e.etapa)) novaEtapa = 'demo';
    if (d.status === 'feito' && d.tipo === 'oficina' && e.trilha === 'parceiro' && e.etapa === 'contato') novaEtapa = 'oficina_parceiro';
    if (novaEtapa) {
      const mud = aplicarEtapa(e, novaEtapa);
      Object.assign(sets, { etapa: novaEtapa, etapa_desde: mud.etapa_desde, marcos: JSON.stringify(mud.marcos) });
    }
    if (d.proximo_passo !== undefined) sets.proximo_passo = d.proximo_passo;
    if (d.proxima_data !== undefined) sets.proxima_data = d.proxima_data;
    if (d.status === 'agendado' && d.proximo_passo === undefined) {
      sets.proximo_passo = `${tipoInfo.n}${d.com_quem ? ' com ' + d.com_quem : ''}`;
      sets.proxima_data = data;
    }
    // Cadência: próximo passo vira o próximo da sequência
    if (d.status === 'feito' && d.passo && d.proximo_passo === undefined && e.trilha === 'escola') {
      const { rows: feitos } = await client.query(
        `SELECT passo FROM adapt_atividades WHERE escola_id = $1 AND passo IS NOT NULL AND status = 'feito' AND estornado_em IS NULL`, [e.id],
      );
      const set = new Set(feitos.map((f) => f.passo));
      const prox = CADENCIA.find((c) => !set.has(c.k));
      const inicio = sets.cadencia_inicio || e.cadencia_inicio || data;
      if (prox) { sets.proximo_passo = `Cadência D${prox.dia}: ${prox.canal}`; sets.proxima_data = addDias(inicio, prox.dia - 1); }
      else { sets.proximo_passo = 'Cadência concluída: mover para nutrição se não respondeu'; sets.proxima_data = hoje; }
    }
    const ch = Object.keys(sets);
    if (ch.length) {
      await client.query(
        `UPDATE adapt_escolas SET ${ch.map((k, i) => `${k} = $${i + 2}${k === 'marcos' ? '::jsonb' : ''}`).join(', ')} WHERE id = $1`,
        [e.id, ...ch.map((k) => sets[k])],
      );
    }
    if (novaEtapa) {
      await client.query(
        `INSERT INTO adapt_movimentos (escola_id, de_etapa, para_etapa, pessoa_id, justificativa) VALUES ($1,$2,$3,$4,$5)`,
        [e.id, e.etapa, novaEtapa, req.pessoa.id, 'automático: atividade registrada'],
      );
    }
    await client.query('COMMIT');
    res.status(201).json({ id: rows[0].id, etapa: novaEtapa || e.etapa, escola: await fichaCompleta(e.id) });
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    next(err);
  } finally { client.release(); }
}

/** Reunião/visita agendada: realizada ou cancelada. */
export async function desfecho(req, res, next) {
  const client = await pool.connect();
  try {
    const d = validar(z.object({
      status: z.enum(['feito', 'cancelado']),
      resultado: z.union([z.enum(RESULTADOS_CHAVES), z.null()]).optional(),
      nota: txt(4000),
    }), req.body);
    await client.query('BEGIN');
    const { rows } = await client.query(`SELECT *, data::text AS data FROM adapt_atividades WHERE id = $1 FOR UPDATE`, [req.params.id]);
    const a = rows[0];
    if (!a || a.estornado_em) throw new NaoEncontradoError('Agendamento não encontrado');
    if (a.status !== 'agendado') throw new AppError('Essa atividade já teve desfecho.', 409, 'desfecho');
    const hoje = hojeBR();
    if (d.status === 'feito' && a.data > hoje) {
      throw new AppError('Só dá para marcar como realizada no dia ou depois.', 400, 'data');
    }
    await client.query(
      `UPDATE adapt_atividades SET status = $2::varchar, resultado = COALESCE($3::varchar, resultado), nota = COALESCE($4::text, nota),
              data = CASE WHEN $2::varchar = 'feito' AND data > $5::date THEN $5::date ELSE data END
        WHERE id = $1`,
      [a.id, d.status, d.resultado || null, d.nota, hoje],
    );
    const e = await carregarEscola(a.escola_id, client);
    let novaEtapa = null;
    if (d.status === 'feito') {
      if (e.etapa === 'lista') novaEtapa = 'contato';
      if (['demo', 'oficina'].includes(a.tipo) && e.etapa === 'qualificada') novaEtapa = 'demo';
      if (a.tipo === 'oficina' && e.trilha === 'parceiro' && e.etapa === 'contato') novaEtapa = 'oficina_parceiro';
      if (!e.cadencia_inicio && e.trilha === 'escola') await client.query(`UPDATE adapt_escolas SET cadencia_inicio = $2 WHERE id = $1`, [e.id, hoje]);
    }
    if (novaEtapa) {
      const mud = aplicarEtapa(e, novaEtapa);
      await client.query(`UPDATE adapt_escolas SET etapa = $2, etapa_desde = $3, marcos = $4::jsonb WHERE id = $1`,
        [e.id, novaEtapa, mud.etapa_desde, JSON.stringify(mud.marcos)]);
      await client.query(
        `INSERT INTO adapt_movimentos (escola_id, de_etapa, para_etapa, pessoa_id, justificativa) VALUES ($1,$2,$3,$4,$5)`,
        [e.id, e.etapa, novaEtapa, req.pessoa.id, 'automático: reunião realizada'],
      );
    }
    await client.query('COMMIT');
    res.json({ ok: true, escola: await fichaCompleta(a.escola_id) });
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    next(err);
  } finally { client.release(); }
}

export async function estornar(req, res, next) {
  try {
    const motivo = String(req.body?.motivo || '').trim();
    if (motivo.length < 5) throw new AppError('Informe o motivo do estorno.', 400, 'motivo');
    const { rows } = await query(`SELECT * FROM adapt_atividades WHERE id = $1`, [req.params.id]);
    const a = rows[0];
    if (!a || a.estornado_em) throw new NaoEncontradoError('Atividade não encontrada');
    const doDia = new Date(a.criado_em).toISOString().slice(0, 10) === new Date().toISOString().slice(0, 10);
    if (!(ehGestor(req) || (a.pessoa_id === req.pessoa.id && doDia))) {
      throw new AppError('Só quem registrou (no mesmo dia) ou a gestão estorna uma atividade.', 403, 'estorno');
    }
    await query(`UPDATE adapt_atividades SET estornado_em = NOW(), estorno_motivo = $2 WHERE id = $1`, [a.id, motivo]);
    res.json({ ok: true, escola: await fichaCompleta(a.escola_id) });
  } catch (err) { next(err); }
}

// ---------------------------------------------------------------------------
// Painel, metas, plano/kit, configuração, lista inicial
// ---------------------------------------------------------------------------
export async function painel(req, res, next) {
  try {
    const semana = /^\d{4}-\d{2}-\d{2}$/.test(req.query.semana || '') ? req.query.semana : null;
    res.json(await calcularPainel({ semana }));
  } catch (err) { next(err); }
}

export async function salvarMetas(req, res, next) {
  try {
    exigirGestor(req, 'Só a gestão comercial define as metas.');
    const d = validar(z.record(z.number().int().min(0).max(10000)), req.body);
    for (const [k, v] of Object.entries(d)) {
      if (!METAS_CHAVES.includes(k)) continue;
      await query(
        `INSERT INTO adapt_metas (chave, valor, atualizado_por) VALUES ($1,$2,$3)
         ON CONFLICT (chave) DO UPDATE SET valor = EXCLUDED.valor, atualizado_por = EXCLUDED.atualizado_por, atualizado_em = NOW()`,
        [k, v, req.pessoa.id],
      );
    }
    res.json({ metas: await lerMetas() });
  } catch (err) { next(err); }
}

export async function listarChecklist(_req, res, next) {
  try {
    const { rows } = await query(
      `SELECT c.*, p.nome AS responsavel_nome FROM adapt_checklist c LEFT JOIN pessoas_acesso p ON p.id = c.responsavel_id`,
    );
    res.json({ itens: Object.fromEntries(rows.map((r) => [r.chave, r])) });
  } catch (err) { next(err); }
}

export async function salvarChecklist(req, res, next) {
  try {
    const d = validar(z.object({
      tipo: z.enum(['plano', 'kit', 'decisao']),
      feito: z.boolean().optional(),
      obs: txt(2000),
      responsavel_id: z.string().uuid().nullable().optional(),
    }), req.body);
    if (d.tipo === 'decisao') exigirGestor(req, 'Só a gestão marca as decisões da diretoria.');
    const chave = String(req.params.chave).slice(0, 60);
    await query(
      `INSERT INTO adapt_checklist (chave, tipo, feito, obs, responsavel_id, atualizado_por)
       VALUES ($1,$2,COALESCE($3,FALSE),$4,$5,$6)
       ON CONFLICT (chave) DO UPDATE SET
         feito = COALESCE($3, adapt_checklist.feito),
         obs = CASE WHEN $7 THEN $4 ELSE adapt_checklist.obs END,
         responsavel_id = CASE WHEN $8 THEN $5 ELSE adapt_checklist.responsavel_id END,
         atualizado_por = $6, atualizado_em = NOW()`,
      [chave, d.tipo, d.feito ?? null, d.obs ?? null, d.responsavel_id ?? null, req.pessoa.id,
        req.body?.obs !== undefined, req.body?.responsavel_id !== undefined],
    );
    res.json({ ok: true });
  } catch (err) { next(err); }
}

export async function salvarConfig(req, res, next) {
  try {
    exigirGestor(req);
    const d = validar(z.object({ semana1: dataOpc }), req.body);
    if (d.semana1 !== undefined) {
      await query(
        `INSERT INTO adapt_config (chave, valor) VALUES ('semana1', $1)
         ON CONFLICT (chave) DO UPDATE SET valor = EXCLUDED.valor, atualizado_em = NOW()`,
        [d.semana1],
      );
    }
    res.json({ ok: true });
  } catch (err) { next(err); }
}

/** Carrega as escolas do "Plano comercial B2B para escolas de Belém" (não duplica). */
export async function carregarLista(req, res, next) {
  const client = await pool.connect();
  try {
    exigirGestor(req, 'Só a gestão comercial carrega a lista inicial.');
    const hoje = hojeBR();
    await client.query('BEGIN');
    const { rows: existentes } = await client.query(`SELECT lower(nome) AS nome FROM adapt_escolas`);
    const ja = new Set(existentes.map((r) => r.nome));
    let n = 0;
    for (const x of LISTA_BELEM) {
      if (ja.has(x.nome.toLowerCase())) continue;
      const trilha = trilhaDoTipo(x.tipo);
      const etapa = ETAPA_INICIAL[trilha];
      const mud = aplicarEtapa({ trilha, marcos: {} }, etapa, hoje);
      const { rows } = await client.query(
        `INSERT INTO adapt_escolas (protocolo, nome, tipo, trilha, etapas_ensino, bairro, rota, endereco, telefone, email,
            fonte_dados, pontos, etapa, etapa_desde, marcos, origem, criado_por_id, notas)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15::jsonb,'lista',$16,$17) RETURNING id`,
        [novoProtocolo(hoje), x.nome, x.tipo, trilha, x.etapas || null, x.bairro || null, rotaDoBairro(x.bairro),
          x.endereco || null, x.telefone || null, x.email || null, FONTE_LISTA, x.pontos ?? null, etapa, hoje,
          JSON.stringify(mud.marcos), req.pessoa.id,
          x.telefone ? null : 'Telefone não localizado no plano: buscar no site, Google Maps, Instagram ou INEP.'],
      );
      await client.query(
        `INSERT INTO adapt_movimentos (escola_id, de_etapa, para_etapa, pessoa_id, justificativa) VALUES ($1, NULL, $2, $3, 'lista inicial do plano')`,
        [rows[0].id, etapa, req.pessoa.id],
      );
      n += 1;
    }
    await client.query('COMMIT');
    await registrarAcao({ pessoa_acesso_id: req.pessoa.id, acao: 'adaptai.lista.carregar', detalhes: { n }, req });
    res.json({ carregadas: n, ja_existiam: LISTA_BELEM.length - n });
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    next(err);
  } finally { client.release(); }
}

export { atividadesPorEscola };
