import { z } from 'zod';
import { query } from '../config/database.js';
import { NaoEncontradoError, NaoAutorizadoError } from '../utils/errors.js';
import { registrarAcao } from '../utils/audit.js';
import { podeVerQuadro } from './quadros.controller.js';

/**
 * Sprint 36 — CRUD de automações.
 *
 * O Zod aqui não é burocracia: `gatilho`, `condicoes` e `acoes` são jsonb no
 * banco, então ESTE arquivo é a única barreira entre uma regra malformada e
 * um motor tentando executá-la em produção. Validação frouxa aqui vira erro
 * silencioso às 7 da manhã.
 */

const gatilhoSchema = z.discriminatedUnion('tipo', [
  z.object({ tipo: z.literal('card_criado'), coluna_id: z.string().uuid().optional() }),
  z.object({ tipo: z.literal('card_movido'), coluna_id: z.string().uuid().optional() }),
  z.object({ tipo: z.literal('etiqueta_adicionada'), etiqueta_id: z.string().uuid().optional() }),
  z.object({ tipo: z.literal('checklist_completo') }),
  z.object({ tipo: z.literal('prazo_proximo'), dias: z.number().int().min(0).max(60).default(1) }),
  z.object({ tipo: z.literal('agendada') }),
]);

const condicaoSchema = z.object({
  campo: z.enum([
    'prioridade', 'tem_responsavel', 'tem_prazo', 'prazo_vencido',
    'tem_etiqueta', 'estimativa_horas', 'titulo', 'bloqueado', 'checklist_completo',
  ]),
  op: z.enum(['=', '!=', '<', '<=', '>', '>=', 'contem', 'nao_contem', 'verdadeiro', 'falso']),
  valor: z.union([z.string(), z.number(), z.boolean()]).optional().nullable(),
});

const acaoSchema = z.discriminatedUnion('tipo', [
  z.object({ tipo: z.literal('mover_coluna'), coluna_id: z.string().uuid() }),
  z.object({
    tipo: z.literal('atribuir'),
    pessoa_ids: z.array(z.string().uuid()).min(1),
    substituir: z.boolean().optional().default(false),
  }),
  z.object({ tipo: z.literal('adicionar_etiqueta'), etiqueta_id: z.string().uuid() }),
  z.object({ tipo: z.literal('remover_etiqueta'), etiqueta_id: z.string().uuid() }),
  z.object({ tipo: z.literal('definir_prioridade'), prioridade: z.number().int().min(0).max(3) }),
  z.object({ tipo: z.literal('definir_prazo'), dias: z.number().int().min(-365).max(365) }),
  z.object({ tipo: z.literal('comentar'), texto: z.string().min(1).max(2000) }),
  z.object({
    tipo: z.literal('criar_checklist'),
    titulo: z.string().min(1).max(120),
    itens: z.array(z.string().min(1).max(255)).max(30).default([]),
  }),
  z.object({
    tipo: z.literal('criar_card'),
    coluna_id: z.string().uuid(),
    titulo: z.string().min(1).max(255),
    descricao: z.string().max(5000).optional().nullable(),
  }),
  z.object({
    tipo: z.literal('criar_conta_pagar'),
    descricao: z.string().min(1).max(255),
    valor: z.number().positive(),
    dias_vencimento: z.number().int().min(0).max(365).default(30),
    categoria_id: z.string().uuid().optional().nullable(),
    fornecedor_nome: z.string().max(160).optional().nullable(),
  }),
]);

const automacaoSchema = z.object({
  nome: z.string().min(2).max(120),
  ativa: z.boolean().optional().default(true),
  gatilho: gatilhoSchema,
  condicoes: z.array(condicaoSchema).max(10).optional().default([]),
  acoes: z.array(acaoSchema).min(1).max(10),
});

// ---------------------------------------------------------------------------

async function exigirEdicao(pessoa, quadroId) {
  const isAdmin = !!pessoa?.administrador;
  const { pode, podeEditar } = await podeVerQuadro(pessoa.id, isAdmin, quadroId);
  if (!pode) throw new NaoAutorizadoError('Sem acesso a este quadro.');
  if (!podeEditar) throw new NaoAutorizadoError('Só membros da equipe configuram automações.');
}

/** GET /api/quadros/:id/automacoes */
export async function listar(req, res, next) {
  try {
    const isAdmin = !!req.pessoa?.administrador;
    const { pode } = await podeVerQuadro(req.pessoa.id, isAdmin, req.params.id);
    if (!pode) throw new NaoAutorizadoError('Sem acesso a este quadro.');

    const { rows } = await query(
      `SELECT a.*,
              (SELECT COUNT(*)::int FROM automacoes_execucoes e
                WHERE e.automacao_id = a.id AND e.status = 'ok') AS n_ok,
              (SELECT COUNT(*)::int FROM automacoes_execucoes e
                WHERE e.automacao_id = a.id AND e.status = 'erro') AS n_erro,
              (SELECT MAX(e.executado_em) FROM automacoes_execucoes e
                WHERE e.automacao_id = a.id) AS ultima_execucao
         FROM automacoes a
        WHERE a.quadro_id = $1
        ORDER BY a.criado_em`,
      [req.params.id],
    );
    res.json(rows);
  } catch (err) { next(err); }
}

/** POST /api/quadros/:id/automacoes */
export async function criar(req, res, next) {
  try {
    await exigirEdicao(req.pessoa, req.params.id);
    const d = automacaoSchema.parse(req.body);

    const { rows } = await query(
      `INSERT INTO automacoes (quadro_id, nome, ativa, gatilho, condicoes, acoes, criado_por_id)
       VALUES ($1, $2, $3, $4::jsonb, $5::jsonb, $6::jsonb, $7)
       RETURNING *`,
      [
        req.params.id, d.nome.trim(), d.ativa,
        JSON.stringify(d.gatilho), JSON.stringify(d.condicoes), JSON.stringify(d.acoes),
        req.pessoa.id,
      ],
    );

    registrarAcao({
      acao: 'automacao.criou',
      pessoa_acesso_id: req.pessoa.id,
      detalhes: { quadro_id: req.params.id, automacao_id: rows[0].id, nome: d.nome },
      req,
    });

    res.status(201).json(rows[0]);
  } catch (err) { next(err); }
}

/** PUT /api/quadros/:id/automacoes/:automacaoId */
export async function atualizar(req, res, next) {
  try {
    await exigirEdicao(req.pessoa, req.params.id);
    const d = automacaoSchema.partial().parse(req.body);

    const updates = [];
    const params = [];
    if (d.nome !== undefined) {
      params.push(d.nome.trim());
      updates.push('nome = $' + params.length);
    }
    if (d.ativa !== undefined) {
      params.push(d.ativa);
      updates.push('ativa = $' + params.length);
    }
    if (d.gatilho !== undefined) {
      params.push(JSON.stringify(d.gatilho));
      updates.push('gatilho = $' + params.length + '::jsonb');
    }
    if (d.condicoes !== undefined) {
      params.push(JSON.stringify(d.condicoes));
      updates.push('condicoes = $' + params.length + '::jsonb');
    }
    if (d.acoes !== undefined) {
      params.push(JSON.stringify(d.acoes));
      updates.push('acoes = $' + params.length + '::jsonb');
    }
    if (updates.length === 0) return res.json({ ok: true });

    params.push(req.params.automacaoId, req.params.id);
    const { rows } = await query(
      'UPDATE automacoes SET ' + updates.join(', ')
      + ' WHERE id = $' + (params.length - 1)
      + ' AND quadro_id = $' + params.length
      + ' RETURNING *',
      params,
    );
    if (!rows[0]) throw new NaoEncontradoError('Automação não encontrada');
    res.json(rows[0]);
  } catch (err) { next(err); }
}

/** DELETE /api/quadros/:id/automacoes/:automacaoId */
export async function excluir(req, res, next) {
  try {
    await exigirEdicao(req.pessoa, req.params.id);
    const { rowCount } = await query(
      'DELETE FROM automacoes WHERE id = $1 AND quadro_id = $2',
      [req.params.automacaoId, req.params.id],
    );
    if (rowCount === 0) throw new NaoEncontradoError('Automação não encontrada');

    registrarAcao({
      acao: 'automacao.excluiu',
      pessoa_acesso_id: req.pessoa.id,
      detalhes: { quadro_id: req.params.id, automacao_id: req.params.automacaoId },
      req,
    });

    res.status(204).send();
  } catch (err) { next(err); }
}

/**
 * GET /api/quadros/:id/automacoes/:automacaoId/execucoes
 *
 * O log é o que separa automação de mágica. Devolve inclusive as
 * 'ignorada' — a pergunta mais comum não é "o que ela fez", é "por que
 * ela NÃO fez".
 */
export async function execucoes(req, res, next) {
  try {
    const isAdmin = !!req.pessoa?.administrador;
    const { pode } = await podeVerQuadro(req.pessoa.id, isAdmin, req.params.id);
    if (!pode) throw new NaoAutorizadoError('Sem acesso a este quadro.');

    const { rows } = await query(
      `SELECT e.id, e.status, e.detalhe, e.executado_em,
              e.card_id, c.titulo AS card_titulo
         FROM automacoes_execucoes e
         LEFT JOIN cards c ON c.id = e.card_id
        WHERE e.automacao_id = $1
        ORDER BY e.executado_em DESC
        LIMIT 50`,
      [req.params.automacaoId],
    );
    res.json(rows);
  } catch (err) { next(err); }
}
