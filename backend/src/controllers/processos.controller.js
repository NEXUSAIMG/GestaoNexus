import { z } from 'zod';
import { query, pool } from '../config/database.js';
import { NaoEncontradoError, AppError, NaoAutorizadoError } from '../utils/errors.js';
import { registrarAcao } from '../utils/audit.js';

/**
 * Processos / Workflows — Sprint 14.
 *
 * Constrói processos em estilo BPMN simplificado: nós (início, tarefa,
 * decisão, fim) ligados por arestas, com papéis das pessoas envolvidas
 * mapeados para equipes ou pessoas específicas.
 *
 * Visibilidade:
 *   - Admin: vê e edita tudo
 *   - Não-admin: vê processos cujas equipes ele é membro OU processos
 *     publicados (transparência igual aos quadros abertos)
 *   - Editar: só admin (Sprint 14). Sprint 15 pode ampliar pra membros.
 *
 * Endpoint /api/processos retorna lista resumida; /api/processos/:id
 * retorna o processo COMPLETO (com papéis, nós, arestas, equipes
 * associadas) — útil pra abrir o canvas sem N requests.
 *
 * Salvar é "replace-all": o cliente envia o estado completo dos nós,
 * arestas, papéis e equipes; o backend deleta tudo e re-insere dentro
 * de uma transação. Mais simples e robusto que diff incremental.
 */

const cores = [
  'slate', 'red', 'orange', 'amber', 'yellow',
  'lime', 'emerald', 'teal', 'cyan', 'blue',
  'indigo', 'violet', 'fuchsia', 'pink', 'rose',
];

const papelSchema = z.object({
  // id é opcional na entrada — se não vier, é papel novo. Se vier UUID,
  // tentamos preservar (mas como fazemos replace-all, na prática o id é
  // só pra estabilidade no front; o banco gera novos.)
  id_local: z.string().optional(),  // ex: "papel-1" — usado pro front mapear
  nome: z.string().min(1).max(100),
  descricao: z.string().max(2000).optional().nullable(),
  cor: z.enum(cores).default('blue'),
  equipe_id: z.string().uuid().optional().nullable(),
  pessoa_id: z.string().uuid().optional().nullable(),
  ordem: z.number().int().default(0),
}).refine(
  (p) => !(p.equipe_id && p.pessoa_id),
  { message: 'Papel pode ser mapeado pra equipe OU pessoa, não os dois.' },
);

const noSchema = z.object({
  id_local: z.string(),  // obrigatório no front pra ligar arestas
  tipo: z.enum(['inicio', 'tarefa', 'decisao', 'fim']),
  rotulo: z.string().min(1).max(255),
  descricao: z.string().max(5000).optional().nullable(),
  papel_id_local: z.string().optional().nullable(),
  prazo_dias: z.number().int().min(0).max(365).optional().nullable(),
  posicao_x: z.number().default(0),
  posicao_y: z.number().default(0),
});

const arestaSchema = z.object({
  origem_id_local: z.string(),
  destino_id_local: z.string(),
  rotulo: z.string().max(100).optional().nullable(),
});

const criarProcessoSchema = z.object({
  nome: z.string().min(2).max(100),
  descricao: z.string().max(5000).optional().nullable(),
  cor: z.enum(cores).default('slate'),
  equipes_ids: z.array(z.string().uuid()).default([]),
});

const salvarProcessoSchema = z.object({
  nome: z.string().min(2).max(100).optional(),
  descricao: z.string().max(5000).optional().nullable(),
  cor: z.enum(cores).optional(),
  status: z.enum(['rascunho', 'publicado', 'arquivado']).optional(),
  equipes_ids: z.array(z.string().uuid()).optional(),
  papeis: z.array(papelSchema).optional(),
  nos: z.array(noSchema).optional(),
  arestas: z.array(arestaSchema).optional(),
});

// =============================================================================
// Helpers de visibilidade
// =============================================================================

/**
 * Filtro SQL: processos que a pessoa pode VER.
 * Admin → tudo. Não-admin → membro de alguma equipe associada OU publicado.
 *
 * Retorna a string SQL (com $N pro pessoaId), pra concatenar num WHERE.
 */
function filtroVisibilidade(isAdmin, pessoaIdParam) {
  if (isAdmin) return 'TRUE';
  return `(
    p.status = 'publicado'
    OR EXISTS (
      SELECT 1 FROM processos_equipes pe
       JOIN equipes_membros em ON em.equipe_id = pe.equipe_id
      WHERE pe.processo_id = p.id AND em.pessoa_id = ${pessoaIdParam}
    )
  )`;
}

// =============================================================================
// Endpoints
// =============================================================================

/**
 * GET /api/processos
 *
 * Lista resumida — sem nós/arestas. Inclui contagem de nós e nomes das
 * equipes associadas pra mostrar na lista.
 */
export async function listar(req, res, next) {
  try {
    const isAdmin = !!req.pessoa?.administrador;

    // Admin vê tudo; não-admin vê publicados ou de equipes que é membro.
    // Construímos a query com parâmetros condicionais pra não passar
    // parâmetro sem $N correspondente (causa erro 08P01 no PG).
    const params = [];
    let filtro;
    if (isAdmin) {
      filtro = 'TRUE';
    } else {
      params.push(req.pessoa.id);
      filtro = `(
        p.status = 'publicado'
        OR EXISTS (
          SELECT 1 FROM processos_equipes pe
           JOIN equipes_membros em ON em.equipe_id = pe.equipe_id
          WHERE pe.processo_id = p.id AND em.pessoa_id = $1
        )
      )`;
    }

    const { rows } = await query(
      `SELECT p.id, p.nome, p.descricao, p.cor, p.status, p.versao,
              p.criado_em, p.atualizado_em,
              (SELECT COUNT(*)::int FROM processos_nos n WHERE n.processo_id = p.id) AS qtd_nos,
              COALESCE(
                (SELECT json_agg(json_build_object('id', e.id, 'nome', e.nome, 'cor', e.cor) ORDER BY e.nome)
                   FROM processos_equipes pe
                   JOIN equipes e ON e.id = pe.equipe_id
                  WHERE pe.processo_id = p.id),
                '[]'::json
              ) AS equipes
         FROM processos p
        WHERE p.status <> 'arquivado'
          AND ${filtro}
        ORDER BY p.atualizado_em DESC`,
      params,
    );

    res.json(rows);
  } catch (err) { next(err); }
}

/**
 * GET /api/processos/:id
 *
 * Processo completo: cabeçalho + equipes + papéis + nós + arestas.
 * Tudo num único request porque o canvas precisa de tudo de uma vez.
 */
export async function obter(req, res, next) {
  try {
    const isAdmin = !!req.pessoa?.administrador;

    // Mesmo padrão do listar: parâmetros condicionais
    const params = [req.params.id];
    let filtro;
    if (isAdmin) {
      filtro = 'TRUE';
    } else {
      params.push(req.pessoa.id);
      filtro = `(
        p.status = 'publicado'
        OR EXISTS (
          SELECT 1 FROM processos_equipes pe
           JOIN equipes_membros em ON em.equipe_id = pe.equipe_id
          WHERE pe.processo_id = p.id AND em.pessoa_id = $2
        )
      )`;
    }

    const { rows: cabecalhos } = await query(
      `SELECT p.* FROM processos p
        WHERE p.id = $1 AND ${filtro}`,
      params,
    );
    if (!cabecalhos[0]) throw new NaoEncontradoError('Processo não encontrado');
    const proc = cabecalhos[0];

    const [equipes, papeis, nos, arestas] = await Promise.all([
      query(
        `SELECT e.id, e.nome, e.cor
           FROM processos_equipes pe
           JOIN equipes e ON e.id = pe.equipe_id
          WHERE pe.processo_id = $1
          ORDER BY e.nome`,
        [req.params.id],
      ),
      query(
        `SELECT pp.*, e.nome AS equipe_nome, e.cor AS equipe_cor,
                pa.nome AS pessoa_nome
           FROM processos_papeis pp
           LEFT JOIN equipes e ON e.id = pp.equipe_id
           LEFT JOIN pessoas_acesso pa ON pa.id = pp.pessoa_id
          WHERE pp.processo_id = $1
          ORDER BY pp.ordem, pp.nome`,
        [req.params.id],
      ),
      query(
        `SELECT n.* FROM processos_nos n
          WHERE n.processo_id = $1
          ORDER BY n.criado_em`,
        [req.params.id],
      ),
      query(
        `SELECT a.* FROM processos_arestas a
          WHERE a.processo_id = $1
          ORDER BY a.criado_em`,
        [req.params.id],
      ),
    ]);

    res.json({
      ...proc,
      equipes: equipes.rows,
      papeis: papeis.rows,
      nos: nos.rows,
      arestas: arestas.rows,
    });
  } catch (err) { next(err); }
}

/**
 * POST /api/processos
 *
 * Cria processo "vazio" — só cabeçalho + equipes. Nós e arestas vêm
 * depois via PUT. Permite que o usuário comece pelo nome e vá editando.
 */
export async function criar(req, res, next) {
  const client = await pool.connect();
  try {
    const d = criarProcessoSchema.parse(req.body);

    await client.query('BEGIN');

    const { rows } = await client.query(
      `INSERT INTO processos (nome, descricao, cor, criado_por_id)
       VALUES ($1, $2, $3, $4)
       RETURNING id`,
      [d.nome.trim(), d.descricao?.trim() || null, d.cor, req.pessoa.id],
    );
    const id = rows[0].id;

    // Vincula equipes
    for (const equipeId of d.equipes_ids) {
      await client.query(
        `INSERT INTO processos_equipes (processo_id, equipe_id) VALUES ($1, $2)
         ON CONFLICT DO NOTHING`,
        [id, equipeId],
      );
    }

    // Cria nó "Início" e nó "Fim" automaticamente — o usuário só precisa
    // adicionar tarefas no meio. UX melhor que canvas vazio.
    await client.query(
      `INSERT INTO processos_nos (processo_id, tipo, rotulo, posicao_x, posicao_y)
       VALUES ($1, 'inicio', 'Início', 100, 200),
              ($1, 'fim',    'Fim',    700, 200)`,
      [id],
    );

    await client.query('COMMIT');

    await registrarAcao({
      pessoa_acesso_id: req.pessoa.id,
      acao: 'processo.criar',
      detalhes: { processo_id: id, nome: d.nome },
      req,
    });

    res.status(201).json({ id });
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    next(err);
  } finally {
    client.release();
  }
}

/**
 * PUT /api/processos/:id
 *
 * Salva o estado completo. "replace-all" para nós/arestas/papéis/equipes:
 * apaga tudo e insere a versão atual numa transação.
 *
 * Cabeçalho (nome/descricao/cor/status) é update parcial.
 */
export async function salvar(req, res, next) {
  const client = await pool.connect();
  try {
    const d = salvarProcessoSchema.parse(req.body);

    // Validação estrutural extra: arestas devem referenciar nós existentes
    if (d.nos && d.arestas) {
      const idsLocais = new Set(d.nos.map((n) => n.id_local));
      for (const a of d.arestas) {
        if (!idsLocais.has(a.origem_id_local)) {
          throw new AppError(`Aresta com origem inexistente: ${a.origem_id_local}`, 400);
        }
        if (!idsLocais.has(a.destino_id_local)) {
          throw new AppError(`Aresta com destino inexistente: ${a.destino_id_local}`, 400);
        }
        if (a.origem_id_local === a.destino_id_local) {
          throw new AppError('Aresta não pode ligar um nó a ele mesmo.', 400);
        }
      }
    }

    // Validação: cada nó com papel referenciado, o papel deve existir
    if (d.nos && d.papeis) {
      const papeisLocais = new Set(d.papeis.map((p) => p.id_local).filter(Boolean));
      for (const n of d.nos) {
        if (n.papel_id_local && !papeisLocais.has(n.papel_id_local)) {
          throw new AppError(`Nó "${n.rotulo}" referencia papel inexistente.`, 400);
        }
      }
    }

    await client.query('BEGIN');

    // Confere existência
    const { rows: existe } = await client.query(
      `SELECT id, status, versao FROM processos WHERE id = $1 FOR UPDATE`,
      [req.params.id],
    );
    if (!existe[0]) throw new NaoEncontradoError('Processo não encontrado');

    // Update parcial do cabeçalho
    const sets = [];
    const params = [];
    if (d.nome !== undefined)      { params.push(d.nome.trim()); sets.push(`nome = $${params.length}`); }
    if (d.descricao !== undefined) { params.push(d.descricao?.trim() || null); sets.push(`descricao = $${params.length}`); }
    if (d.cor !== undefined)       { params.push(d.cor); sets.push(`cor = $${params.length}`); }
    if (d.status !== undefined)    { params.push(d.status); sets.push(`status = $${params.length}`); }

    if (sets.length > 0) {
      params.push(req.params.id);
      await client.query(
        `UPDATE processos SET ${sets.join(', ')}, atualizado_em = NOW()
          WHERE id = $${params.length}`,
        params,
      );
    }

    // Replace-all em equipes
    if (d.equipes_ids !== undefined) {
      await client.query(`DELETE FROM processos_equipes WHERE processo_id = $1`, [req.params.id]);
      for (const equipeId of d.equipes_ids) {
        await client.query(
          `INSERT INTO processos_equipes (processo_id, equipe_id) VALUES ($1, $2)
           ON CONFLICT DO NOTHING`,
          [req.params.id, equipeId],
        );
      }
    }

    // Replace-all em papéis. Mapeamos id_local → id_real pra reusar nos nós.
    let papeisMap = {}; // id_local → id_real
    if (d.papeis !== undefined) {
      await client.query(`DELETE FROM processos_papeis WHERE processo_id = $1`, [req.params.id]);
      for (const p of d.papeis) {
        const { rows } = await client.query(
          `INSERT INTO processos_papeis
             (processo_id, nome, descricao, cor, equipe_id, pessoa_id, ordem)
           VALUES ($1, $2, $3, $4, $5, $6, $7)
           RETURNING id`,
          [
            req.params.id,
            p.nome.trim(),
            p.descricao?.trim() || null,
            p.cor,
            p.equipe_id ?? null,
            p.pessoa_id ?? null,
            p.ordem ?? 0,
          ],
        );
        if (p.id_local) papeisMap[p.id_local] = rows[0].id;
      }
    }

    // Replace-all em nós. Mapeamos id_local → id_real pras arestas.
    let nosMap = {}; // id_local → id_real
    if (d.nos !== undefined) {
      // Cascade FK em arestas dispara automático ao apagar nós
      await client.query(`DELETE FROM processos_nos WHERE processo_id = $1`, [req.params.id]);
      for (const n of d.nos) {
        const papelIdReal = n.papel_id_local ? (papeisMap[n.papel_id_local] ?? null) : null;
        const { rows } = await client.query(
          `INSERT INTO processos_nos
             (processo_id, tipo, rotulo, descricao, papel_id, prazo_dias, posicao_x, posicao_y)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
           RETURNING id`,
          [
            req.params.id,
            n.tipo,
            n.rotulo.trim(),
            n.descricao?.trim() || null,
            papelIdReal,
            n.prazo_dias ?? null,
            n.posicao_x,
            n.posicao_y,
          ],
        );
        nosMap[n.id_local] = rows[0].id;
      }
    }

    // Replace-all em arestas
    if (d.arestas !== undefined) {
      await client.query(`DELETE FROM processos_arestas WHERE processo_id = $1`, [req.params.id]);
      // Dedup por par (origem, destino) — a UI pode mandar duplicado por bug
      const vistos = new Set();
      for (const a of d.arestas) {
        const origemId = nosMap[a.origem_id_local];
        const destinoId = nosMap[a.destino_id_local];
        if (!origemId || !destinoId) continue; // já validado acima, defesa
        const chave = `${origemId}->${destinoId}`;
        if (vistos.has(chave)) continue;
        vistos.add(chave);

        await client.query(
          `INSERT INTO processos_arestas
             (processo_id, origem_no_id, destino_no_id, rotulo)
           VALUES ($1, $2, $3, $4)
           ON CONFLICT DO NOTHING`,
          [req.params.id, origemId, destinoId, a.rotulo?.trim() || null],
        );
      }
    }

    // Bump de versão se já estava publicado e mexeu na estrutura
    const mexeuEstrutura = d.nos !== undefined || d.arestas !== undefined || d.papeis !== undefined;
    if (existe[0].status === 'publicado' && mexeuEstrutura) {
      await client.query(
        `UPDATE processos SET versao = versao + 1 WHERE id = $1`,
        [req.params.id],
      );
    }

    await client.query('COMMIT');

    await registrarAcao({
      pessoa_acesso_id: req.pessoa.id,
      acao: 'processo.salvar',
      detalhes: {
        processo_id: req.params.id,
        campos: Object.keys(d),
      },
      req,
    });

    res.status(204).send();
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    next(err);
  } finally {
    client.release();
  }
}

/**
 * POST /api/processos/:id/publicar
 * Atalho pra status='publicado'.
 */
export async function publicar(req, res, next) {
  try {
    const { rowCount } = await query(
      `UPDATE processos SET status = 'publicado', atualizado_em = NOW()
        WHERE id = $1 AND status <> 'arquivado'`,
      [req.params.id],
    );
    if (rowCount === 0) throw new NaoEncontradoError('Processo não encontrado ou arquivado.');

    await registrarAcao({
      pessoa_acesso_id: req.pessoa.id,
      acao: 'processo.publicar',
      detalhes: { processo_id: req.params.id },
      req,
    });
    res.status(204).send();
  } catch (err) { next(err); }
}

/**
 * POST /api/processos/:id/arquivar
 */
export async function arquivar(req, res, next) {
  try {
    const { rowCount } = await query(
      `UPDATE processos SET status = 'arquivado', atualizado_em = NOW()
        WHERE id = $1`,
      [req.params.id],
    );
    if (rowCount === 0) throw new NaoEncontradoError('Processo não encontrado.');

    await registrarAcao({
      pessoa_acesso_id: req.pessoa.id,
      acao: 'processo.arquivar',
      detalhes: { processo_id: req.params.id },
      req,
    });
    res.status(204).send();
  } catch (err) { next(err); }
}
