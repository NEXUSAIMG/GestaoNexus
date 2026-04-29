import { query } from '../config/database.js';

/**
 * Registra uma ação realizada na ferramenta.
 *
 * Autoria dupla:
 *   - pessoa_acesso_id → quem executou (a pessoa logada)
 *   - socio_id         → em nome de quem (o sócio do contexto atual)
 *
 * Se a ação não tem um sócio no contexto (ex: admin gerenciando cadastros),
 * socio_id pode vir null.
 *
 * Aceita ambos os formatos de chave (snake_case e camelCase) por
 * tolerância — vários controllers chamavam em camelCase historicamente
 * e o destructuring antigo deixava cair como NULL silenciosamente.
 */
export async function registrarAcao(args = {}) {
  const pessoa_acesso_id = args.pessoa_acesso_id ?? args.pessoaId ?? null;
  const socio_id = args.socio_id ?? args.socioId ?? null;
  const { acao, detalhes = {}, req = null } = args;

  try {
    const ip = req?.ip ?? null;
    const user_agent = req?.headers?.['user-agent'] ?? null;

    await query(
      `INSERT INTO log_acoes
         (pessoa_acesso_id, socio_id, acao, detalhes, ip, user_agent)
       VALUES ($1, $2, $3, $4::jsonb, $5, $6)`,
      [pessoa_acesso_id, socio_id, acao, JSON.stringify(detalhes), ip, user_agent],
    );
  } catch (err) {
    // Falha de log nunca pode derrubar uma ação do usuário.
    console.error('[audit] falha ao registrar ação:', err.message);
  }
}
