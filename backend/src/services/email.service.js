/**
 * E-mail — Sprint 7.
 *
 * Wrapper fino do Resend que:
 *   - É tolerante a falta de RESEND_API_KEY (não derruba o app)
 *   - Sempre grava o evento em emails_enviados (auditoria)
 *   - Nunca propaga exceção pra cima — falha de e-mail não pode quebrar
 *     a operação principal (criar ata, votar, etc)
 *
 * USO:
 *   import { enviarEmail } from './services/email.service.js';
 *   await enviarEmail({
 *     pessoaId, destinatario, assunto, html,
 *     template: 'voto_pendente',
 *     contexto: { documento_id: '...' },
 *   });
 */

import { Resend } from 'resend';
import { env, emailConfigurado } from '../config/env.js';
import { query } from '../config/database.js';

const resend = emailConfigurado ? new Resend(env.RESEND_API_KEY) : null;

/**
 * Envia um e-mail e registra o resultado em emails_enviados.
 * Nunca lança — sempre retorna { ok, id, erro }.
 *
 * @param {object} args
 * @param {string|null} args.pessoaId - id da pessoa destinatária (para auditoria)
 * @param {string} args.destinatario - e-mail
 * @param {string} args.assunto
 * @param {string} args.html
 * @param {string} [args.texto] - versão texto plano (Resend pede uma)
 * @param {string} [args.template] - nome do template (auditoria)
 * @param {object} [args.contexto] - jsonb com bagagem de debug
 */
export async function enviarEmail({
  pessoaId = null,
  destinatario,
  assunto,
  html,
  texto = null,
  template = null,
  contexto = null,
}) {
  if (!destinatario) {
    return { ok: false, erro: 'destinatário vazio' };
  }

  // Se o Resend não está configurado, registra como pulado e segue.
  if (!resend) {
    await registrarTentativa({
      pessoaId, destinatario, assunto, template, contexto,
      status: 'pulado_sem_config',
    });
    if (env.NODE_ENV !== 'production') {
      console.log(`[email] PULADO (sem RESEND_API_KEY): ${destinatario} - "${assunto}"`);
    }
    return { ok: false, erro: 'sem_configuracao' };
  }

  // Cria o registro pendente primeiro pra ter id e timestamp consistentes.
  const tentativa = await registrarTentativa({
    pessoaId, destinatario, assunto, template, contexto,
    status: 'pendente',
  });

  try {
    const { data, error } = await resend.emails.send({
      from: env.EMAIL_FROM,
      to: destinatario,
      subject: assunto,
      html,
      text: texto || removerHtml(html),
    });

    if (error) {
      await marcarFalha(tentativa.id, error.message || JSON.stringify(error));
      console.warn(`[email] FALHOU: ${destinatario} - ${error.message || error}`);
      return { ok: false, erro: error.message || 'erro_resend' };
    }

    await marcarSucesso(tentativa.id, data?.id || null);
    return { ok: true, id: data?.id };
  } catch (err) {
    await marcarFalha(tentativa.id, err.message || String(err));
    console.warn(`[email] EXCEÇÃO: ${destinatario} - ${err.message || err}`);
    return { ok: false, erro: err.message || String(err) };
  }
}

async function registrarTentativa({ pessoaId, destinatario, assunto, template, contexto, status }) {
  try {
    const { rows } = await query(
      `INSERT INTO emails_enviados
         (pessoa_id, destinatario, assunto, template, contexto, status)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING id`,
      [pessoaId, destinatario, assunto, template, contexto, status],
    );
    return rows[0];
  } catch (err) {
    // Não dá pra fazer muito se a auditoria falhou. Só loga.
    console.warn(`[email] não foi possível auditar envio: ${err.message}`);
    return { id: null };
  }
}

async function marcarSucesso(id, provedorId) {
  if (!id) return;
  try {
    await query(
      `UPDATE emails_enviados
          SET status = 'enviado', provedor_id = $1, enviado_em = now()
        WHERE id = $2`,
      [provedorId, id],
    );
  } catch (err) {
    console.warn(`[email] auditoria de sucesso falhou: ${err.message}`);
  }
}

async function marcarFalha(id, mensagem) {
  if (!id) return;
  try {
    await query(
      `UPDATE emails_enviados
          SET status = 'falhou', erro = $1
        WHERE id = $2`,
      [mensagem?.slice(0, 2000) || 'erro desconhecido', id],
    );
  } catch (err) {
    console.warn(`[email] auditoria de falha falhou: ${err.message}`);
  }
}

/**
 * Heurística simples pra gerar versão texto plano a partir do HTML.
 * Não é perfeita mas funciona pra os templates simples que usamos.
 */
function removerHtml(html) {
  if (!html) return '';
  return String(html)
    .replace(/<style[\s\S]*?<\/style>/gi, '')
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/p>/gi, '\n\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}
