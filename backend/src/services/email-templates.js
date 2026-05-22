/**
 * Templates de e-mail — Sprint 7.
 *
 * Templates HTML simples e responsivos. Não usamos engine de template
 * (Handlebars, EJS) porque são poucos e variáveis — é mais simples
 * com template literals.
 *
 * Padrão: cada template é uma função que recebe um objeto e devolve
 * { assunto, html }. Quem chama é responsável por enviar.
 */

import { env } from '../config/env.js';

const CORES = {
  fundo: '#f8fafc',
  cartao: '#ffffff',
  borda: '#e2e8f0',
  texto: '#0f172a',
  texto_secundario: '#475569',
  primario: '#0e7490', // nexus-700 aprox
  primario_escuro: '#155e75',
  amarelo: '#a16207',
  amarelo_fundo: '#fef3c7',
  verde: '#15803d',
  verde_fundo: '#dcfce7',
  vermelho: '#b91c1c',
  vermelho_fundo: '#fee2e2',
};

function formatarBRL(valor) {
  if (valor == null) return '—';
  return Number(valor).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

function formatarData(d) {
  if (!d) return '—';
  try { return new Date(d).toLocaleDateString('pt-BR'); } catch { return '—'; }
}

/**
 * Casca padrão de e-mail. Recebe título, parágrafos (array de strings ou
 * { texto, cor }), botão (opcional) e gera o HTML completo.
 */
function moldura({ titulo, paragrafos = [], botao = null, rodape = null }) {
  const blocos = paragrafos
    .map((p) => {
      if (typeof p === 'string') {
        return `<p style="margin: 0 0 12px; color: ${CORES.texto}; font-size: 15px; line-height: 1.6;">${p}</p>`;
      }
      // bloco destacado
      return `
        <div style="margin: 16px 0; padding: 12px 14px; border-radius: 8px;
                    background: ${p.fundo || CORES.amarelo_fundo};
                    color: ${p.cor || CORES.amarelo};
                    font-size: 14px; line-height: 1.5;">
          ${p.texto}
        </div>`;
    })
    .join('\n');

  const botaoHtml = botao
    ? `
      <div style="margin: 24px 0 8px;">
        <a href="${botao.url}"
           style="display: inline-block;
                  padding: 12px 22px;
                  background: ${CORES.primario};
                  color: white;
                  text-decoration: none;
                  border-radius: 8px;
                  font-weight: 600;
                  font-size: 14px;">
          ${botao.texto}
        </a>
      </div>`
    : '';

  const rodapeHtml = rodape
    ? `<p style="margin: 16px 0 0; color: ${CORES.texto_secundario}; font-size: 13px; line-height: 1.5;">${rodape}</p>`
    : '';

  return `
<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${escapar(titulo)}</title>
</head>
<body style="margin: 0; padding: 0; background: ${CORES.fundo}; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background: ${CORES.fundo}; padding: 32px 16px;">
    <tr>
      <td align="center">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width: 560px;">

          <!-- Cabeçalho com a marca -->
          <tr>
            <td style="padding: 0 0 16px 4px;">
              <div style="font-size: 11px; letter-spacing: 0.18em; text-transform: uppercase;
                          color: ${CORES.primario}; font-weight: 600;">
                Gestão Nexus
              </div>
            </td>
          </tr>

          <!-- Cartão -->
          <tr>
            <td style="background: ${CORES.cartao};
                       border: 1px solid ${CORES.borda};
                       border-radius: 12px;
                       padding: 28px 28px 24px;">
              <h1 style="margin: 0 0 16px; color: ${CORES.texto};
                         font-size: 20px; line-height: 1.35; font-weight: 600;">
                ${escapar(titulo)}
              </h1>
              ${blocos}
              ${botaoHtml}
              ${rodapeHtml}
            </td>
          </tr>

          <!-- Rodapé fora do cartão -->
          <tr>
            <td style="padding: 18px 4px 0; color: ${CORES.texto_secundario}; font-size: 12px; line-height: 1.5;">
              Esta mensagem foi gerada automaticamente pela Gestão Nexus.<br/>
              Você está recebendo porque tem cadastro ativo na ferramenta.
              Para deixar de receber avisos, fale com um administrador.
            </td>
          </tr>

        </table>
      </td>
    </tr>
  </table>
</body>
</html>`.trim();
}

function escapar(s) {
  return String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function url(path) {
  const base = env.APP_URL.replace(/\/$/, '');
  return `${base}${path.startsWith('/') ? path : `/${path}`}`;
}

// =============================================================================
// Templates
// =============================================================================

/**
 * Aviso para sócios com poder de votar de que existe um documento (ata
 * ou contrato) aguardando aprovação.
 */
export function tplDocumentoEmAprovacao({ documento, criadoPor, sociosTotal }) {
  const tipoLabel = documento.tipo === 'ata' ? 'ata'
    : documento.tipo === 'contrato_social' ? 'contrato social'
    : 'documento';
  const quorum = documento.quorum === 'unanimidade' ? 'unanimidade' : 'maioria simples';
  const linkPath = documento.tipo === 'contrato_social' ? '/governanca/contrato' : '/governanca/atas';

  return {
    assunto: `[Gestão Nexus] Voto pendente: ${documento.titulo}`,
    html: moldura({
      titulo: `Sua aprovação foi solicitada`,
      paragrafos: [
        `Uma nova ${tipoLabel} foi colocada em aprovação na Gestão Nexus${criadoPor ? ` por <strong>${escapar(criadoPor)}</strong>` : ''}.`,
        `<strong>${escapar(documento.titulo)}</strong>` +
          (documento.descricao ? `<br/><span style="color: ${CORES.texto_secundario};">${escapar(documento.descricao).slice(0, 240)}${documento.descricao.length > 240 ? '...' : ''}</span>` : ''),
        {
          texto: `<strong>Quórum:</strong> ${quorum}${sociosTotal ? ` · <strong>Sócios elegíveis:</strong> ${sociosTotal}` : ''}<br/>
                  <strong>Data de referência:</strong> ${formatarData(documento.data_referencia)}`,
          fundo: CORES.amarelo_fundo,
          cor: CORES.amarelo,
        },
      ],
      botao: { texto: 'Abrir e votar', url: url(linkPath) },
      rodape: 'Você só recebe este aviso se for sócio com poder de aprovação para o tipo de documento.',
    }),
  };
}

/**
 * Aviso para sócios com pode_votar de que existe uma decisão aguardando voto.
 */
export function tplDecisaoEmAprovacao({ decisao, criadoPor, sociosTotal }) {
  const quorum = decisao.quorum === 'unanimidade' ? 'unanimidade' : 'maioria simples';
  return {
    assunto: `[Gestão Nexus] Voto pendente: ${decisao.titulo}`,
    html: moldura({
      titulo: 'Uma decisão precisa do seu voto',
      paragrafos: [
        `${criadoPor ? `<strong>${escapar(criadoPor)}</strong> propôs` : 'Foi proposta'} uma decisão para os sócios votarem.`,
        `<strong>${escapar(decisao.titulo)}</strong><br/>
         <span style="color: ${CORES.texto_secundario};">${escapar(decisao.descricao).slice(0, 260)}${decisao.descricao.length > 260 ? '...' : ''}</span>`,
        {
          texto: `<strong>Quórum:</strong> ${quorum}${sociosTotal ? ` · <strong>Sócios elegíveis:</strong> ${sociosTotal}` : ''}` +
                 (decisao.prazo_aprovacao ? `<br/><strong>Prazo:</strong> ${formatarData(decisao.prazo_aprovacao)}` : ''),
          fundo: CORES.amarelo_fundo,
          cor: CORES.amarelo,
        },
      ],
      botao: { texto: 'Abrir e votar', url: url('/governanca/decisoes') },
    }),
  };
}

/**
 * Aviso para o criador de que o documento ou decisão foi finalizado.
 */
export function tplFinalizado({ titulo, statusFinal, link, comentarioContagem }) {
  const statusLabel = {
    aprovado: 'Aprovado',
    aprovada: 'Aprovada',
    rejeitado: 'Rejeitado',
    rejeitada: 'Rejeitada',
  }[statusFinal] || statusFinal;
  const isAprovado = String(statusFinal).startsWith('aprovad');
  return {
    assunto: `[Gestão Nexus] ${statusLabel}: ${titulo}`,
    html: moldura({
      titulo: `${statusLabel}: ${titulo}`,
      paragrafos: [
        `A votação foi encerrada — o resultado final é <strong>${statusLabel.toLowerCase()}</strong>.`,
        comentarioContagem
          ? {
              texto: `Aprovações: <strong>${comentarioContagem.aprovado}</strong> · ` +
                     `Rejeições: <strong>${comentarioContagem.rejeitado}</strong> · ` +
                     `Abstenções: <strong>${comentarioContagem.abstencao}</strong>`,
              fundo: isAprovado ? CORES.verde_fundo : CORES.vermelho_fundo,
              cor: isAprovado ? CORES.verde : CORES.vermelho,
            }
          : null,
      ].filter(Boolean),
      botao: { texto: 'Ver detalhes', url: url(link) },
    }),
  };
}

/**
 * Aviso ao sócio de que um movimento foi criado em seu nome
 * (pró-labore, aporte ou parte de uma distribuição).
 */
export function tplMovimentoSocioCriado({ movimento, socioNome }) {
  const rotuloTipo = {
    pro_labore: 'Pró-labore',
    distribuicao: 'Distribuição de lucros',
    aporte: 'Aporte',
  }[movimento.tipo] || 'Movimento';

  return {
    assunto: `[Gestão Nexus] ${rotuloTipo} registrado: ${formatarBRL(movimento.valor)}`,
    html: moldura({
      titulo: `${rotuloTipo} registrado em seu nome`,
      paragrafos: [
        `Um administrador acabou de registrar um <strong>${rotuloTipo.toLowerCase()}</strong> em nome de <strong>${escapar(socioNome)}</strong>.`,
        {
          texto: `<strong>Descrição:</strong> ${escapar(movimento.descricao)}<br/>
                  <strong>Valor:</strong> ${formatarBRL(movimento.valor)}<br/>
                  <strong>Data prevista:</strong> ${formatarData(movimento.data_prevista)}<br/>
                  <strong>Status:</strong> previsto (ainda não foi efetivado)`,
          fundo: CORES.amarelo_fundo,
          cor: CORES.amarelo,
        },
        'Você pode acompanhar o status no extrato do sócio. O movimento ainda precisa ser efetivado para o pagamento ocorrer.',
      ],
      botao: { texto: 'Abrir extrato', url: url(`/socios/${movimento.socio_id}/extrato`) },
    }),
  };
}

/**
 * Resumo diário pro admin: contas atrasadas/vencendo, movimentos
 * vencidos/vencendo e votos abertos. As seções aparecem em ordem de
 * urgência: atrasados primeiro (em vermelho), depois próximos.
 */
export function tplResumoDiarioAdmin({
  contasAtrasadas = [],
  contasVencendo = [],
  movimentosVencidos = [],
  movimentosVencendo = [],
  aprovacoesAbertas = 0,
} = {}) {
  const totalAtrasos = contasAtrasadas.length + movimentosVencidos.length;
  const tituloEmail = totalAtrasos > 0
    ? `Resumo do dia — ${totalAtrasos} item${totalAtrasos === 1 ? '' : 's'} com atraso`
    : 'Resumo do dia';

  return {
    assunto: `[Gestão Nexus] ${tituloEmail} — ${formatarData(new Date())}`,
    html: moldura({
      titulo: tituloEmail,
      paragrafos: [
        totalAtrasos > 0
          ? {
              texto: `<strong>${totalAtrasos} item${totalAtrasos === 1 ? '' : 's'} com atraso</strong> precisa${totalAtrasos === 1 ? '' : 'm'} da sua atenção hoje.`,
              fundo: CORES.vermelho_fundo,
              cor: CORES.vermelho,
            }
          : 'Aqui está um apanhado rápido de tudo que precisa de atenção hoje.',

        // Contas atrasadas (em vermelho — mais urgente)
        contasAtrasadas.length > 0
          ? secaoTabela({
              titulo: '⚠ Contas a pagar atrasadas',
              corTitulo: CORES.vermelho,
              colunas: ['Descrição', 'Vencimento', 'Valor'],
              linhas: contasAtrasadas.map((c) => [
                escapar(c.descricao),
                formatarData(c.data_vencimento),
                formatarBRL(c.valor),
              ]),
            })
          : null,

        // Movimentos vencidos sem efetivação (Sprint 8)
        movimentosVencidos.length > 0
          ? secaoTabela({
              titulo: '⚠ Movimentos sem efetivação (vencidos)',
              corTitulo: CORES.vermelho,
              colunas: ['Sócio / Descrição', 'Previsto', 'Valor'],
              linhas: movimentosVencidos.map((m) => [
                `${escapar(m.socio_nome)} — ${escapar(m.descricao)}`,
                formatarData(m.data_prevista),
                formatarBRL(m.valor),
              ]),
              rodape: 'Confira se cada um foi pago e ainda não efetivado, ou se deve ser cancelado.',
            })
          : null,

        // Contas vencendo nos próximos N dias
        contasVencendo.length > 0
          ? secaoTabela({
              titulo: 'Contas a pagar vencendo',
              corTitulo: CORES.amarelo,
              colunas: ['Descrição', 'Vencimento', 'Valor'],
              linhas: contasVencendo.map((c) => [
                escapar(c.descricao),
                formatarData(c.data_vencimento),
                formatarBRL(c.valor),
              ]),
            })
          : null,

        // Movimentos previstos próximos
        movimentosVencendo.length > 0
          ? secaoTabela({
              titulo: 'Pró-labore / distribuições previstos',
              corTitulo: CORES.amarelo,
              colunas: ['Sócio / Descrição', 'Previsto', 'Valor'],
              linhas: movimentosVencendo.map((m) => [
                `${escapar(m.socio_nome)} — ${escapar(m.descricao)}`,
                formatarData(m.data_prevista),
                formatarBRL(m.valor),
              ]),
            })
          : null,

        aprovacoesAbertas > 0
          ? {
              texto: `Há <strong>${aprovacoesAbertas}</strong> ${aprovacoesAbertas === 1 ? 'documento ou decisão aguardando voto' : 'documentos ou decisões aguardando voto'} dos sócios.`,
              fundo: CORES.amarelo_fundo,
              cor: CORES.amarelo,
            }
          : null,
      ].filter(Boolean),
      botao: { texto: 'Abrir o painel', url: url('/') },
    }),
  };
}

/**
 * Aviso ao responsável de que ele foi atribuído a um card de tarefa.
 */
export function tplCardAtribuido({ card, quadroNome, equipeNome, atribuidoPor }) {
  const partes = [];
  if (atribuidoPor) {
    partes.push(`<strong>${escapar(atribuidoPor)}</strong> te atribuiu uma tarefa.`);
  } else {
    partes.push('Você foi atribuído a uma tarefa.');
  }

  const detalhes = [
    `<strong>${escapar(card.titulo)}</strong>`,
    quadroNome ? `Quadro: <strong>${escapar(quadroNome)}</strong>${equipeNome ? ` · ${escapar(equipeNome)}` : ''}` : null,
    card.data_prazo ? `Prazo: <strong>${formatarData(card.data_prazo)}</strong>` : null,
  ].filter(Boolean).join('<br/>');

  return {
    assunto: `[Gestão Nexus] Você foi atribuído: ${card.titulo}`,
    html: moldura({
      titulo: 'Nova tarefa pra você',
      paragrafos: [
        ...partes,
        { texto: detalhes, fundo: CORES.amarelo_fundo, cor: CORES.amarelo },
        card.descricao
          ? `<span style="color: ${CORES.texto_secundario};">${escapar(String(card.descricao).slice(0, 280))}${card.descricao.length > 280 ? '...' : ''}</span>`
          : null,
      ].filter(Boolean),
      botao: { texto: 'Abrir tarefa', url: url(`/tarefas/${card.quadro_id}?card=${card.id}`) },
    }),
  };
}

/**
 * Resumo diário adicional: tarefas com prazo HOJE atribuídas à pessoa.
 * Disparado pelo mesmo cron do resumo do admin (mas vai pra cada pessoa
 * com tarefas vencendo hoje).
 */
export function tplCardsPrazoHoje({ pessoaNome, cards }) {
  const linhas = cards.map((c) => [
    escapar(c.titulo),
    escapar(c.quadro_nome || '—'),
    formatarData(c.data_prazo),
  ]);

  return {
    assunto: `[Gestão Nexus] ${cards.length} tarefa${cards.length === 1 ? '' : 's'} com prazo hoje`,
    html: moldura({
      titulo: `Você tem ${cards.length} tarefa${cards.length === 1 ? '' : 's'} com prazo hoje`,
      paragrafos: [
        `Olá${pessoaNome ? `, ${escapar(pessoaNome.split(' ')[0])}` : ''}! Hoje é o prazo para:`,
        secaoTabela({
          titulo: 'Suas tarefas com prazo hoje',
          corTitulo: CORES.amarelo,
          colunas: ['Tarefa', 'Quadro', 'Prazo'],
          linhas,
        }),
      ],
      botao: { texto: 'Ver minhas tarefas', url: url('/tarefas') },
    }),
  };
}

/**
 * Helper interno: gera um bloco com título + tabela com cabeçalho.
 * Retorna uma string HTML para entrar como parágrafo na moldura.
 */
function secaoTabela({ titulo, corTitulo, colunas, linhas, rodape = null }) {
  const cabecalho = colunas.map((c, i) => {
    const align = i === colunas.length - 1 ? 'right' : 'left';
    return `<th style="padding: 4px 8px; font-size: 11px; font-weight: 600; text-transform: uppercase;
             letter-spacing: 0.05em; color: ${CORES.texto_secundario}; text-align: ${align};
             border-bottom: 1px solid ${CORES.borda};">${c}</th>`;
  }).join('');

  const corpo = linhas.map((linha) => {
    const tds = linha.map((celula, i) => {
      const align = i === linha.length - 1 ? 'right' : 'left';
      return `<td style="padding: 6px 8px; border-bottom: 1px solid ${CORES.borda};
               font-size: 13px; text-align: ${align};
               ${i === linha.length - 1 ? 'white-space: nowrap;' : ''}">${celula}</td>`;
    }).join('');
    return `<tr>${tds}</tr>`;
  }).join('');

  const rodapeHtml = rodape
    ? `<div style="margin-top: 4px; font-size: 12px; color: ${CORES.texto_secundario};">${rodape}</div>`
    : '';

  return `
    <div style="margin-top: 18px;">
      <strong style="display: block; margin-bottom: 6px; color: ${corTitulo};">${titulo}</strong>
      <table cellpadding="0" cellspacing="0" style="width:100%; border-top: 1px solid ${CORES.borda};">
        <thead><tr>${cabecalho}</tr></thead>
        <tbody>${corpo}</tbody>
      </table>
      ${rodapeHtml}
    </div>`;
}

// =============================================================================
// Sprint 26 — Aviso de contratos vencendo / vencidos
// =============================================================================

/**
 * Aviso para administradores sobre contratos próximos do vencimento
 * ou já vencidos. Separa em duas seções — vencidos em vermelho
 * (urgente), vencendo em amarelo (planejamento).
 *
 * Entrada: array de contratos com
 *   { id, titulo, contraparte_nome, data_fim, valor, dias_para_vencer }
 * onde dias_para_vencer pode ser negativo (já venceu).
 */
export function tplContratoVencendo({ contratos = [] } = {}) {
  const vencidos = contratos.filter((c) => c.dias_para_vencer < 0);
  const vencendo = contratos.filter((c) => c.dias_para_vencer >= 0);

  const totalUrgentes = vencidos.length;
  const total = contratos.length;

  const tituloEmail = totalUrgentes > 0
    ? `${totalUrgentes} contrato${totalUrgentes === 1 ? '' : 's'} vencido${totalUrgentes === 1 ? '' : 's'}`
      + (vencendo.length > 0 ? ` (+ ${vencendo.length} próximo${vencendo.length === 1 ? '' : 's'} do vencimento)` : '')
    : `${total} contrato${total === 1 ? '' : 's'} próximo${total === 1 ? '' : 's'} do vencimento`;

  const linhasVencidos = vencidos.map((c) => [
    escapar(c.titulo) + (c.contraparte_nome ? `<br/><span style="color: ${CORES.texto_secundario}; font-size: 12px;">${escapar(c.contraparte_nome)}</span>` : ''),
    formatarData(c.data_fim) + `<br/><span style="color: ${CORES.vermelho}; font-size: 11px; font-weight: 600;">venceu há ${Math.abs(c.dias_para_vencer)} dia${Math.abs(c.dias_para_vencer) === 1 ? '' : 's'}</span>`,
    formatarBRL(c.valor),
  ]);

  const linhasVencendo = vencendo.map((c) => [
    escapar(c.titulo) + (c.contraparte_nome ? `<br/><span style="color: ${CORES.texto_secundario}; font-size: 12px;">${escapar(c.contraparte_nome)}</span>` : ''),
    formatarData(c.data_fim) + `<br/><span style="color: ${CORES.amarelo}; font-size: 11px; font-weight: 600;">${c.dias_para_vencer === 0 ? 'vence hoje' : 'em ' + c.dias_para_vencer + ' dia' + (c.dias_para_vencer === 1 ? '' : 's')}</span>`,
    formatarBRL(c.valor),
  ]);

  return {
    assunto: `[Gestão Nexus] ${tituloEmail}`,
    html: moldura({
      titulo: tituloEmail,
      paragrafos: [
        totalUrgentes > 0
          ? {
              texto: `<strong>${totalUrgentes} contrato${totalUrgentes === 1 ? '' : 's'}</strong> já venceu sem renovação registrada. Confira se foi renovado, encerrado ou se precisa de ação.`,
              fundo: CORES.vermelho_fundo,
              cor: CORES.vermelho,
            }
          : 'Os contratos abaixo estão próximos do vencimento. Renove, encerre ou atualize o status conforme a situação real.',

        vencidos.length > 0
          ? secaoTabela({
              titulo: '⚠ Contratos vencidos',
              corTitulo: CORES.vermelho,
              colunas: ['Contrato / Contraparte', 'Data fim', 'Valor'],
              linhas: linhasVencidos,
            })
          : null,

        vencendo.length > 0
          ? secaoTabela({
              titulo: 'Próximos do vencimento',
              corTitulo: CORES.amarelo,
              colunas: ['Contrato / Contraparte', 'Data fim', 'Valor'],
              linhas: linhasVencendo,
            })
          : null,
      ].filter(Boolean),
      botao: { texto: 'Abrir contratos', url: url('/governanca/contratos') },
      rodape: 'Os contratos só aparecem aqui uma vez por semana enquanto continuarem na janela de alerta. Para parar de receber, mude o status do contrato ou altere a configuração de notificações.',
    }),
  };
}

