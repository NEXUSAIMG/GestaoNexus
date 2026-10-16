import { query } from '../config/database.js';
import { RESULTADOS_CONECTAM } from './comercial.regras.js';

/**
 * Sprint 44 — ranking dos e-mails mais utilizados (equipe e pessoa).
 *
 * Conta os toques de e-mail com modelo marcado, no período, sem estorno e de
 * cartório não arquivado. Para cada envio:
 *   - respondeu: o próprio toque já conectou (ex.: "Respondeu") ou o cartório
 *     teve um contato com conexão registrado DEPOIS do envio, em até 7 dias;
 *   - reunião: o cartório ganhou reunião (não cancelada) marcada em até 14
 *     dias depois do envio.
 * "Sem modelo" = e-mail enviado ("Mensagem enviada") sem modelo marcado: mostra
 * quanto do volume ainda não entra no ranking.
 */

const FUSO = `'America/Sao_Paulo'`;
const taxa = (a, b) => (b ? Math.round((a / b) * 1000) / 10 : null);

export async function rankingEmails(de, ate) {
  const [{ rows: linhas }, { rows: semModelo }] = await Promise.all([
    query(
      `WITH env AS (
         SELECT t.id, t.lead_id, t.pessoa_id, t.modelo_email_id, t.data, t.resultado, t.criado_em
           FROM comercial_toques t
           JOIN comercial_leads l ON l.id = t.lead_id AND l.arquivado_em IS NULL
          WHERE t.estornado_em IS NULL AND t.modelo_email_id IS NOT NULL AND t.data BETWEEN $1 AND $2
       ), aval AS (
         SELECT e.*,
                (e.resultado = ANY($3) OR EXISTS (
                   SELECT 1 FROM comercial_toques r
                    WHERE r.lead_id = e.lead_id AND r.id <> e.id AND r.estornado_em IS NULL
                      AND r.criado_em > e.criado_em AND r.data <= e.data + 7 AND r.resultado = ANY($3)
                )) AS respondeu,
                EXISTS (
                   SELECT 1 FROM comercial_reunioes x
                    WHERE x.lead_id = e.lead_id AND x.status <> 'cancelada'
                      AND x.criado_em >= e.criado_em
                      AND (x.criado_em AT TIME ZONE ${FUSO})::date <= e.data + 14
                ) AS reuniao
           FROM env e
       )
       SELECT a.modelo_email_id AS modelo_id, a.pessoa_id,
              m.titulo, m.chave, m.arquivado_em IS NOT NULL AS arquivado, p.nome,
              count(*)::int AS envios,
              count(DISTINCT a.lead_id)::int AS cartorios,
              count(*) FILTER (WHERE a.respondeu)::int AS respostas,
              count(*) FILTER (WHERE a.reuniao)::int AS reunioes
         FROM aval a
         JOIN comercial_modelos_email m ON m.id = a.modelo_email_id
         LEFT JOIN pessoas_acesso p ON p.id = a.pessoa_id
        GROUP BY a.modelo_email_id, a.pessoa_id, m.titulo, m.chave, m.arquivado_em, p.nome`,
      [de, ate, RESULTADOS_CONECTAM],
    ),
    query(
      `SELECT t.pessoa_id, p.nome, count(*)::int AS n
         FROM comercial_toques t
         JOIN comercial_leads l ON l.id = t.lead_id AND l.arquivado_em IS NULL
         LEFT JOIN pessoas_acesso p ON p.id = t.pessoa_id
        WHERE t.estornado_em IS NULL AND t.modelo_email_id IS NULL AND t.data BETWEEN $1 AND $2
          AND t.canal ILIKE 'e%mail%' AND t.resultado = 'enviado'
        GROUP BY t.pessoa_id, p.nome`,
      [de, ate],
    ),
  ]);

  const modelos = new Map();
  const pessoas = new Map();
  const pessoa = (id, nome) => {
    const k = id || 'sem';
    if (!pessoas.has(k)) pessoas.set(k, { id: id || null, nome: nome || 'Sem registro de pessoa', envios: 0, respostas: 0, reunioes: 0, sem_modelo: 0, modelos: [] });
    return pessoas.get(k);
  };

  for (const r of linhas) {
    if (!modelos.has(r.modelo_id)) {
      modelos.set(r.modelo_id, { id: r.modelo_id, titulo: r.titulo, chave: r.chave, arquivado: r.arquivado, envios: 0, cartorios: 0, respostas: 0, reunioes: 0, pessoas: 0 });
    }
    const m = modelos.get(r.modelo_id);
    m.envios += r.envios; m.cartorios += r.cartorios; m.respostas += r.respostas; m.reunioes += r.reunioes; m.pessoas += 1;
    const p = pessoa(r.pessoa_id, r.nome);
    p.envios += r.envios; p.respostas += r.respostas; p.reunioes += r.reunioes;
    p.modelos.push({ id: r.modelo_id, titulo: r.titulo, arquivado: r.arquivado, envios: r.envios, cartorios: r.cartorios, respostas: r.respostas, reunioes: r.reunioes, taxa_resposta: taxa(r.respostas, r.envios) });
  }
  for (const s of semModelo) pessoa(s.pessoa_id, s.nome).sem_modelo += s.n;

  const porUso = (a, b) => b.envios - a.envios || b.respostas - a.respostas || a.titulo.localeCompare(b.titulo, 'pt-BR');
  const listaModelos = [...modelos.values()]
    .map((m) => ({ ...m, taxa_resposta: taxa(m.respostas, m.envios), taxa_reuniao: taxa(m.reunioes, m.envios) }))
    .sort(porUso);
  const listaPessoas = [...pessoas.values()]
    .map((p) => ({
      ...p,
      taxa_resposta: taxa(p.respostas, p.envios),
      modelos: p.modelos.sort(porUso),
      mais_usado: p.modelos.length ? p.modelos.slice().sort(porUso)[0] : null,
    }))
    .sort((a, b) => b.envios - a.envios || b.sem_modelo - a.sem_modelo || a.nome.localeCompare(b.nome, 'pt-BR'));

  const total = listaModelos.reduce((s, m) => s + m.envios, 0);
  const respostas = listaModelos.reduce((s, m) => s + m.respostas, 0);
  return {
    de, ate,
    total_envios: total,
    total_respostas: respostas,
    taxa_resposta: taxa(respostas, total),
    sem_modelo: semModelo.reduce((s, x) => s + x.n, 0),
    modelos: listaModelos,
    pessoas: listaPessoas,
  };
}
