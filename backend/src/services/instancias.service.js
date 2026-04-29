import { randomUUID } from 'node:crypto';

/**
 * Service de execução de processos — Sprint 15.
 *
 * Operações principais:
 *   1. criarInstancia()    → cria quadro + colunas + linhas em
 *                            processos_instancias_nos + cards iniciais
 *   2. avancarApos()       → quando um nó é concluído, ativa os próximos
 *                            (chamado pelo hook em cards.controller#mover)
 *   3. escolherSaida()     → registra escolha em decisão e segue só por
 *                            uma das arestas
 *   4. cancelarInstancia() → marca instância como cancelada e arquiva
 *                            todos os cards pendentes
 *
 * Convenções:
 *   - Coluna "Concluído" tem ordem máxima (a última do quadro auto-criado)
 *   - Nós 'inicio' e 'fim' não geram cards — são marcadores no fluxo
 *   - Decisão NÃO avança automático: vira 'concluido' mas com saida_escolhida_aresta_id NULL,
 *     esperando POST /escolher-saida pra avançar
 *   - Uma instância tem zero, uma ou várias arestas saindo do início
 *     (multi-saída funciona: ativa todos os destinos em paralelo)
 */

// =============================================================================
// criarInstancia — gera quadro + colunas + nós + cards iniciais
// =============================================================================

export async function criarInstancia(client, {
  processoId, nome, descricao, dataInicio, pessoaId,
}) {
  // 1. Confere processo e pega versão atual
  const { rows: procs } = await client.query(
    `SELECT id, nome, status, versao, cor, criado_por_id,
            (SELECT MIN(ee.equipe_id) FROM processos_equipes ee
              WHERE ee.processo_id = processos.id) AS equipe_id
       FROM processos
      WHERE id = $1`,
    [processoId],
  );
  const proc = procs[0];
  if (!proc) throw new Error('Processo não encontrado');
  if (proc.status !== 'publicado') {
    throw new Error('Só processos publicados podem ser executados.');
  }
  if (!proc.equipe_id) {
    throw new Error('Processo precisa ter pelo menos uma equipe associada pra ser executado (a primeira hospeda o quadro).');
  }

  // 2. Cria QUADRO (Sprint 10)
  const { rows: qs } = await client.query(
    `INSERT INTO quadros (equipe_id, nome, descricao, aberto_a_socios, criado_por_id)
     VALUES ($1, $2, $3, TRUE, $4)
     RETURNING id`,
    [
      proc.equipe_id,
      `${proc.nome} — ${nome}`,
      descricao || `Execução do processo "${proc.nome}".`,
      pessoaId,
    ],
  );
  const quadroId = qs[0].id;

  // 3. Cria 3 COLUNAS padrão. A ordem segue o passo de 1000 (mesmo
  //    padrão do calcularOrdemCard pra evitar conflitos)
  const { rows: cols } = await client.query(
    `INSERT INTO colunas (quadro_id, nome, ordem)
     VALUES ($1, 'A fazer', 1000),
            ($1, 'Em andamento', 2000),
            ($1, 'Concluído', 3000)
     RETURNING id, nome, ordem`,
    [quadroId],
  );
  const colAFazer    = cols.find((c) => c.nome === 'A fazer');
  const colAndamento = cols.find((c) => c.nome === 'Em andamento');
  const colConcluido = cols.find((c) => c.nome === 'Concluído');

  // 4. Cria a INSTÂNCIA
  const { rows: ins } = await client.query(
    `INSERT INTO processos_instancias (
       processo_id, versao_processo, nome, descricao, quadro_id,
       coluna_concluida_id, coluna_andamento_id, data_inicio, iniciada_por_id
     ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
     RETURNING id`,
    [
      processoId, proc.versao, nome.trim(), descricao?.trim() || null,
      quadroId, colConcluido.id, colAndamento.id, dataInicio || null, pessoaId,
    ],
  );
  const instanciaId = ins[0].id;

  // 5. Carrega TODOS os nós e arestas do processo
  const { rows: nos }     = await client.query(
    `SELECT n.*, p.nome AS papel_nome, p.equipe_id AS papel_equipe_id, p.pessoa_id AS papel_pessoa_id
       FROM processos_nos n
       LEFT JOIN processos_papeis p ON p.id = n.papel_id
      WHERE n.processo_id = $1`,
    [processoId],
  );
  const { rows: arestas } = await client.query(
    `SELECT * FROM processos_arestas WHERE processo_id = $1`,
    [processoId],
  );

  // 6. Cria UMA linha em processos_instancias_nos pra cada nó (status=pendente)
  const noIdParaInstanciaNoId = {};
  for (const n of nos) {
    const { rows } = await client.query(
      `INSERT INTO processos_instancias_nos (instancia_id, no_id, status)
       VALUES ($1, $2, 'pendente')
       RETURNING id`,
      [instanciaId, n.id],
    );
    noIdParaInstanciaNoId[n.id] = rows[0].id;
  }

  // 7. Acha nós conectados ao "Início" — esses começam como ativos
  const inicios = nos.filter((n) => n.tipo === 'inicio');
  const idsAtivar = new Set();
  for (const inicio of inicios) {
    // Marca o início como concluído imediatamente (é só um marcador)
    await client.query(
      `UPDATE processos_instancias_nos
          SET status = 'concluido', concluido_em = NOW(), ativado_em = NOW()
        WHERE id = $1`,
      [noIdParaInstanciaNoId[inicio.id]],
    );
    // Ativa os destinos das arestas saindo do início
    const saidas = arestas.filter((a) => a.origem_no_id === inicio.id);
    for (const a of saidas) idsAtivar.add(a.destino_no_id);
  }

  // 8. Pra cada nó a ativar, ativa e cria card (se for tarefa/decisão)
  for (const noId of idsAtivar) {
    const no = nos.find((n) => n.id === noId);
    if (!no) continue;
    await ativarNo(client, {
      instanciaNoId: noIdParaInstanciaNoId[no.id],
      no,
      colunaIdAFazer: colAFazer.id,
      quadroId,
      pessoaCriadoraId: pessoaId,
      dataInicio,
    });
  }

  return { instanciaId, quadroId };
}

// =============================================================================
// ativarNo — muda status pra 'ativo' e cria card (interno)
// =============================================================================

async function ativarNo(client, { instanciaNoId, no, colunaIdAFazer, quadroId, pessoaCriadoraId, dataInicio }) {
  if (no.tipo === 'fim') {
    // Fim não gera card — é só um marcador. Vai ser concluído na hora que
    // for "alcançado" (verificarConclusaoInstancia chama).
    await client.query(
      `UPDATE processos_instancias_nos
          SET status = 'concluido', ativado_em = NOW(), concluido_em = NOW()
        WHERE id = $1`,
      [instanciaNoId],
    );
    return;
  }

  // Calcula data_prazo: data_inicio (ou hoje) + prazo_dias do nó
  let dataPrazo = null;
  if (no.prazo_dias != null) {
    const base = dataInicio ? new Date(`${dataInicio}T12:00:00Z`) : new Date();
    base.setUTCDate(base.getUTCDate() + Number(no.prazo_dias));
    dataPrazo = base.toISOString().slice(0, 10);
  }

  // Define responsável: se papel mapeado pra pessoa, usa direto.
  // Se papel mapeado pra equipe, deixa NULL (qualquer membro pega depois).
  const responsavelId = no.papel_pessoa_id || null;

  // Calcula próxima ordem na coluna
  const { rows: max } = await client.query(
    `SELECT COALESCE(MAX(ordem), 0) + 1000 AS prox
       FROM cards WHERE coluna_id = $1 AND arquivado_em IS NULL`,
    [colunaIdAFazer],
  );

  // Cria card
  const tituloPrefixo = no.tipo === 'decisao' ? '[Decisão] ' : '';
  const { rows: cs } = await client.query(
    `INSERT INTO cards (
       coluna_id, quadro_id, titulo, descricao,
       responsavel_id, data_prazo, ordem, criado_por_id,
       instancia_no_id
     ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
     RETURNING id`,
    [
      colunaIdAFazer, quadroId,
      tituloPrefixo + no.rotulo,
      no.descricao || null,
      responsavelId, dataPrazo, max[0].prox, pessoaCriadoraId,
      instanciaNoId,
    ],
  );
  const cardId = cs[0].id;

  // Atualiza o nó da instância
  await client.query(
    `UPDATE processos_instancias_nos
        SET status = 'ativo', ativado_em = NOW(), card_id = $2
      WHERE id = $1`,
    [instanciaNoId, cardId],
  );
}

// =============================================================================
// avancarApos — chamado pelo hook quando card vai pra "Concluído"
// =============================================================================

/**
 * Chamado quando um card associado a uma instância chega na coluna
 * "Concluído" do quadro daquela instância. Marca o nó como concluído
 * e ativa os próximos.
 *
 * Decisão: NÃO avança automático — apenas marca como concluído. O
 * frontend mostra modal pra escolher saída, e POST /escolher-saida
 * dispara o avanço pela aresta escolhida.
 *
 * Idempotente: se já está concluído, retorna sem efeito.
 */
export async function avancarApos(client, { cardId }) {
  // Pega o nó da instância vinculado a este card
  const { rows: ins } = await client.query(
    `SELECT inn.*, n.tipo AS no_tipo, n.processo_id, i.id AS instancia_id,
            i.coluna_concluida_id, i.coluna_andamento_id, i.data_inicio,
            i.status AS instancia_status, i.iniciada_por_id, i.quadro_id
       FROM processos_instancias_nos inn
       JOIN processos_nos n ON n.id = inn.no_id
       JOIN processos_instancias i ON i.id = inn.instancia_id
      WHERE inn.card_id = $1`,
    [cardId],
  );
  if (!ins[0]) return { avancou: false, motivo: 'card-sem-instancia' };
  const inn = ins[0];

  if (inn.instancia_status !== 'em_andamento') {
    return { avancou: false, motivo: 'instancia-fechada' };
  }
  if (inn.status === 'concluido') {
    return { avancou: false, motivo: 'no-ja-concluido' };
  }

  // Marca o nó como concluído
  await client.query(
    `UPDATE processos_instancias_nos
        SET status = 'concluido', concluido_em = NOW()
      WHERE id = $1`,
    [inn.id],
  );

  // Se decisão: NÃO avança aqui. Espera o usuário escolher.
  if (inn.no_tipo === 'decisao') {
    return { avancou: false, motivo: 'decisao-aguarda-escolha', instancia_id: inn.instancia_id, instancia_no_id: inn.id };
  }

  // Pra nó tarefa: ativa todas as arestas saindo
  await ativarSaidas(client, {
    instanciaId: inn.instancia_id,
    noOrigemId: inn.no_id,
    arestaUnicaId: null,
    quadroId: inn.quadro_id,
    colunaIdAFazer: await acharColunaInicial(client, inn.quadro_id),
    pessoaCriadoraId: inn.iniciada_por_id,
    dataInicio: inn.data_inicio,
  });

  // Verifica se a instância foi concluída (todos os nós-fim alcançados)
  await verificarConclusaoInstancia(client, inn.instancia_id);

  return { avancou: true, instancia_id: inn.instancia_id };
}

// =============================================================================
// escolherSaida — pra decisões
// =============================================================================

export async function escolherSaida(client, { instanciaNoId, arestaId, pessoaId }) {
  // Carrega nó + instância + aresta
  const { rows: r } = await client.query(
    `SELECT inn.*, n.tipo AS no_tipo, n.processo_id, n.id AS no_id,
            i.id AS instancia_id, i.coluna_concluida_id, i.coluna_andamento_id,
            i.iniciada_por_id, i.data_inicio, i.quadro_id, i.status AS instancia_status
       FROM processos_instancias_nos inn
       JOIN processos_nos n ON n.id = inn.no_id
       JOIN processos_instancias i ON i.id = inn.instancia_id
      WHERE inn.id = $1`,
    [instanciaNoId],
  );
  if (!r[0]) throw new Error('Nó da instância não encontrado');
  const inn = r[0];

  if (inn.no_tipo !== 'decisao') {
    throw new Error('Só nós de decisão podem ter saída escolhida.');
  }
  if (inn.instancia_status !== 'em_andamento') {
    throw new Error('Instância não está em andamento.');
  }
  if (inn.saida_escolhida_aresta_id) {
    throw new Error('Saída já foi escolhida pra esta decisão.');
  }

  // Valida que a aresta sai DESTE nó
  const { rows: ar } = await client.query(
    `SELECT * FROM processos_arestas
      WHERE id = $1 AND origem_no_id = $2`,
    [arestaId, inn.no_id],
  );
  if (!ar[0]) {
    throw new Error('Aresta não pertence a este nó de decisão.');
  }

  // Registra escolha
  await client.query(
    `UPDATE processos_instancias_nos
        SET saida_escolhida_aresta_id = $2,
            saida_escolhida_em = NOW(),
            saida_escolhida_por_id = $3
      WHERE id = $1`,
    [instanciaNoId, arestaId, pessoaId],
  );

  // Ativa o destino dessa aresta específica
  await ativarSaidas(client, {
    instanciaId: inn.instancia_id,
    noOrigemId: inn.no_id,
    arestaUnicaId: arestaId,
    quadroId: inn.quadro_id,
    colunaIdAFazer: await acharColunaInicial(client, inn.quadro_id),
    pessoaCriadoraId: inn.iniciada_por_id,
    dataInicio: inn.data_inicio,
  });

  await verificarConclusaoInstancia(client, inn.instancia_id);
  return { ok: true };
}

// =============================================================================
// ativarSaidas — interno
// =============================================================================

async function ativarSaidas(client, {
  instanciaId, noOrigemId, arestaUnicaId,
  quadroId, colunaIdAFazer, pessoaCriadoraId, dataInicio,
}) {
  let arestasParams;
  if (arestaUnicaId) {
    arestasParams = await client.query(
      `SELECT * FROM processos_arestas WHERE id = $1`,
      [arestaUnicaId],
    );
  } else {
    arestasParams = await client.query(
      `SELECT * FROM processos_arestas WHERE origem_no_id = $1`,
      [noOrigemId],
    );
  }
  const arestas = arestasParams.rows;

  for (const a of arestas) {
    // Pega o nó destino completo
    const { rows: ns } = await client.query(
      `SELECT n.*, p.pessoa_id AS papel_pessoa_id
         FROM processos_nos n
         LEFT JOIN processos_papeis p ON p.id = n.papel_id
        WHERE n.id = $1`,
      [a.destino_no_id],
    );
    const no = ns[0];
    if (!no) continue;

    // Pega instancia_no_id correspondente
    const { rows: inns } = await client.query(
      `SELECT id, status FROM processos_instancias_nos
        WHERE instancia_id = $1 AND no_id = $2`,
      [instanciaId, no.id],
    );
    const inn = inns[0];
    if (!inn) continue;
    if (inn.status !== 'pendente') continue; // já foi ativado por outro caminho

    await ativarNo(client, {
      instanciaNoId: inn.id,
      no,
      colunaIdAFazer,
      quadroId,
      pessoaCriadoraId,
      dataInicio,
    });
  }
}

// =============================================================================
// verificarConclusaoInstancia — interno
// =============================================================================

/**
 * Marca instância como concluída se todos os nós tipo 'fim' estão
 * com status 'concluido' OU não há mais nós ativos. Caso especial:
 * processo sem 'fim' explícito → conclui quando não há mais ativos.
 */
async function verificarConclusaoInstancia(client, instanciaId) {
  const { rows: contagem } = await client.query(
    `SELECT
       COUNT(*) FILTER (WHERE inn.status = 'ativo')::int AS ativos,
       COUNT(*) FILTER (WHERE n.tipo = 'fim' AND inn.status = 'concluido')::int AS fins_concluidos,
       COUNT(*) FILTER (WHERE n.tipo = 'fim')::int AS fins_total
       FROM processos_instancias_nos inn
       JOIN processos_nos n ON n.id = inn.no_id
      WHERE inn.instancia_id = $1`,
    [instanciaId],
  );
  const { ativos, fins_concluidos, fins_total } = contagem[0];

  // Concluída se: não há ativos E (todos os fins foram alcançados OU não tem fim)
  if (ativos === 0 && (fins_total === 0 || fins_concluidos > 0)) {
    await client.query(
      `UPDATE processos_instancias
          SET status = 'concluida', concluida_em = NOW()
        WHERE id = $1 AND status = 'em_andamento'`,
      [instanciaId],
    );
  }
}

// =============================================================================
// acharColunaInicial — interno
// =============================================================================

/**
 * Acha a coluna "A fazer" do quadro (a primeira pela ordem).
 * Cards iniciais sempre nascem nela.
 */
async function acharColunaInicial(client, quadroId) {
  const { rows } = await client.query(
    `SELECT id FROM colunas
      WHERE quadro_id = $1 AND arquivada_em IS NULL
      ORDER BY ordem
      LIMIT 1`,
    [quadroId],
  );
  return rows[0]?.id;
}

// =============================================================================
// cancelarInstancia
// =============================================================================

export async function cancelarInstancia(client, { instanciaId, motivo, pessoaId }) {
  const { rows: ins } = await client.query(
    `SELECT id, status, quadro_id FROM processos_instancias WHERE id = $1`,
    [instanciaId],
  );
  if (!ins[0]) throw new Error('Instância não encontrada');
  if (ins[0].status !== 'em_andamento') {
    throw new Error('Só é possível cancelar instâncias em andamento.');
  }

  await client.query(
    `UPDATE processos_instancias
        SET status = 'cancelada',
            motivo_cancelamento = $2,
            cancelada_em = NOW(),
            cancelada_por_id = $3
      WHERE id = $1`,
    [instanciaId, motivo.trim(), pessoaId],
  );

  // Arquiva todos os cards da instância que ainda estão ativos
  await client.query(
    `UPDATE cards SET arquivado_em = NOW()
      WHERE id IN (
        SELECT card_id FROM processos_instancias_nos
         WHERE instancia_id = $1 AND status = 'ativo' AND card_id IS NOT NULL
      )`,
    [instanciaId],
  );

  return { ok: true };
}
