import { useState } from 'react';
import { ArrowRight, CheckCircle2, Circle, Compass, Copy, Check, MessageSquareText } from 'lucide-react';
import { btnPrimCls, btnCls, dataBr, dataHoraBr } from './ui.jsx';
import { GUIA_ETAPAS, scriptDoPasso } from './guia.js';
import { SCRIPTS } from './scripts.js';

/**
 * Orientação dentro da ficha do cartório (Sprint 42C):
 *   - O que fazer agora (uma ação, com o botão que resolve)
 *   - O que falta para avançar de etapa (checklist com botões)
 *   - O que falar (script do passo atual)
 *
 * As "ações" são strings interpretadas pela gaveta:
 *   toque:cadencia:<dia> | toque:avulso | marco:<dia> | reuniao:<tipo> |
 *   desfecho:<id> | proposta | etapa:<k> | foco:<id do campo> | pagamento
 */

const CAD_DIAS = [1, 2, 4, 6, 8, 10, 11, 12];
const ORDEM = ['prospect', 'cadencia', 'diagnostico', 'proposta', 'ganho'];

function addDiasUteis(s, n, feriados) {
  const d = new Date(s + 'T12:00:00'); let k = 0;
  const iso = () => d.toISOString().slice(0, 10);
  while (k < n) { d.setDate(d.getDate() + 1); const w = d.getDay(); if (w !== 0 && w !== 6 && !feriados.has(iso())) k++; }
  return iso();
}
function addDias(s, n) { const d = new Date(s + 'T12:00:00'); d.setDate(d.getDate() + n); return d.toISOString().slice(0, 10); }
const diffDias = (a, b) => Math.round((new Date(b + 'T12:00:00') - new Date(a + 'T12:00:00')) / 864e5);

/** Critérios para entrar na próxima etapa, com situação de cada um. */
export function criteriosPara(lead, rascunho, cfg) {
  if (!lead) return null;
  const etapaAtual = lead.etapa;
  const i = ORDEM.indexOf(etapaAtual);
  if (etapaAtual === 'ganho') return null;
  // Aguardando a Corregedoria fica fora da linha principal: dali, o próximo é Ganho.
  const proxima = etapaAtual === 'corregedoria' ? 'ganho' : ORDEM[i + 1];
  if (i < 0 && etapaAtual !== 'corregedoria') return null;
  const reun = lead.reunioes || [];
  const props = lead.propostas || [];
  const diag = { ...(lead.diagnostico || {}), ...(rascunho?.diagnostico || {}) };
  const itens = [];
  if (proxima === 'cadencia') {
    itens.push({ ok: true, txt: 'Cadastro feito', acao: null });
  }
  if (proxima === 'diagnostico') {
    const ag = reun.some((r) => r.tipo === 'diagnostico' && ['agendada', 'realizada'].includes(r.status));
    itens.push({ ok: ag, txt: 'Reunião de apresentação agendada (registre um contato com "Agendou reunião")', acao: ag ? null : 'toque:avulso', rotulo: 'Registrar contato' });
  }
  // Os portões são cumulativos (igual ao servidor): Aguardando retorno exige
  // a reunião feita, o diagnóstico e a proposta.
  const alvo = ORDEM.indexOf(proxima);
  const jaPassou = (k) => !!(lead.marcos && lead.marcos[k]); // mesma regra do servidor
  if (alvo >= ORDEM.indexOf('proposta') && !jaPassou('proposta')) {
    const agendada = reun.find((r) => r.tipo === 'diagnostico' && r.status === 'agendada');
    const realizada = reun.some((r) => r.tipo === 'diagnostico' && r.status === 'realizada');
    itens.push({
      ok: realizada, txt: 'Reunião de apresentação marcada como realizada',
      acao: realizada ? null : agendada ? 'desfecho:' + agendada.id : 'reuniao:diagnostico',
      rotulo: agendada ? 'Registrar desfecho' : 'Agendar reunião',
    });
    cfg.diagnostico_campos.filter((c) => c.obrigatorio).forEach((c) => {
      const ok = diag[c.k] != null && String(diag[c.k]).trim() !== '';
      itens.push({ ok, txt: 'Diagnóstico: ' + c.n.toLowerCase(), acao: ok ? null : 'foco:campo-diag-' + c.k, rotulo: 'Preencher' });
    });
  }
  if (alvo >= ORDEM.indexOf('proposta') && !jaPassou('proposta')) {
    const ok = props.some((x) => ['enviada', 'aceita'].includes(x.status));
    itens.push({ ok, txt: 'Proposta registrada (plano, valor e validade)', acao: ok ? null : 'proposta', rotulo: 'Registrar proposta' });
  }
  if (proxima === 'ganho') {
    const ok = Number(rascunho?.valor_mensal ?? lead.valor_mensal) > 0;
    itens.push({ ok, txt: 'Valor mensal do contrato', acao: ok ? null : 'foco:campo-valor', rotulo: 'Preencher' });
    itens.push({ ok: false, opcional: true, txt: 'Cliente assinou — você confirma ao mudar para Ganho', acao: null });
  }
  const pronto = itens.filter((x) => !x.opcional).every((x) => x.ok);
  return { proxima, nomeProxima: cfg.etapas.find((e) => e.k === proxima)?.n, itens, pronto };
}

/** A ação mais importante agora, em linguagem simples. */
function proximaAcaoBase(lead, cfg, admin) {
  if (!lead) return null;
  const hoje = cfg.hoje;
  const feriados = new Set((cfg.feriados || []).map((x) => x.data));
  const reun = lead.reunioes || [];
  const agora = new Date();
  if (lead.bloqueado_nc) return { nivel: 'crit', titulo: 'Não contate este cartório', texto: 'Ele está na lista de não contatar. Se a negociação estava aberta, marque como Perdido.' };

  const semDesfecho = reun.find((r) => r.status === 'agendada' && new Date(r.inicio) < agora);
  if (semDesfecho) {
    return { nivel: 'crit', titulo: 'Registre como foi a reunião', texto: `A reunião de ${dataHoraBr(semDesfecho.inicio)} já passou e ainda não tem desfecho (realizada, faltou ou remarcar).`, acao: 'desfecho:' + semDesfecho.id, rotulo: 'Registrar desfecho' };
  }
  const futura = reun.filter((r) => r.status === 'agendada').sort((a, b) => (a.inicio < b.inicio ? -1 : 1))[0];

  switch (lead.etapa) {
    case 'prospect':
      return { nivel: 'info', titulo: 'Comece os contatos', texto: 'Este cartório ainda não recebeu contato. Ao começar, ele entra na cadência de 12 dias e o 1º toque aparece em Hoje.', acao: 'etapa:cadencia', rotulo: 'Começar cadência hoje' };
    case 'cadencia': {
      const feitos = lead.toques_cadencia || {};
      const prox = CAD_DIAS.find((d) => !feitos[d]);
      if (!prox) return { nivel: 'warn', titulo: 'A cadência terminou sem conversa', texto: 'Os 8 toques foram feitos. Marque como Perdido com o motivo "Sumiu" — ou, se houve resposta, registre o contato.', acao: 'etapa:perdido', rotulo: 'Marcar como perdido' };
      const previsto = addDiasUteis(lead.cadencia_inicio || hoje, prox - 1, feriados);
      const passo = cfg.cadencia.find((c) => c.d === prox);
      if (previsto <= hoje) {
        return { nivel: previsto < hoje ? 'crit' : 'info', titulo: `Faça o toque do dia ${prox}: ${passo.canal}`, texto: passo.acao + (previsto < hoje ? ` (atrasado desde ${dataBr(previsto)})` : ''), acao: 'toque:cadencia:' + prox, rotulo: 'Registrar toque' };
      }
      return { nivel: 'ok', titulo: `Próximo toque em ${dataBr(previsto)}`, texto: `Dia ${prox} · ${passo.canal}: ${passo.acao}. Até lá, nada a fazer — ele aparece em Hoje no dia certo.` };
    }
    case 'diagnostico': {
      const realizada = reun.some((r) => r.tipo === 'diagnostico' && r.status === 'realizada');
      if (!realizada && futura) return { nivel: 'ok', titulo: `Reunião em ${dataHoraBr(futura.inicio)}`, texto: 'Prepare-se com o roteiro da apresentação (abaixo, em "O que falar"): primeiro as perguntas, depois a demonstração com o WhatsApp do próprio cartório. Depois da reunião, volte aqui para registrar o desfecho.' };
      if (!realizada) return { nivel: 'warn', titulo: 'Agende a reunião de apresentação', texto: 'Este cartório está em Reunião agendada mas não tem reunião marcada.', acao: 'reuniao:diagnostico', rotulo: 'Agendar reunião' };
      const falta = cfg.diagnostico_campos.filter((c) => c.obrigatorio && !(lead.diagnostico || {})[c.k]);
      if (falta.length) return { nivel: 'warn', titulo: 'Preencha o diagnóstico', texto: `Falta: ${falta.map((c) => c.n.toLowerCase()).join(', ')}.`, acao: 'foco:campo-diag-' + falta[0].k, rotulo: 'Preencher agora' };
      const vigD = (lead.propostas || []).find((x) => x.status === 'enviada');
      if (!vigD) return { nivel: 'warn', titulo: 'Envie a proposta em até 2 dias', texto: 'Plano e valor, com a dor e os números que o titular falou na reunião. Argumento de valor: implantação assistida em 48 horas.', acao: 'proposta', rotulo: 'Registrar proposta' };
      return { nivel: 'info', titulo: 'Proposta enviada: mude para Aguardando retorno', texto: 'Assim o funil mostra que a decisão está com o cartório, com prazo de 7 dias.', acao: 'etapa:proposta', rotulo: 'Mudar para Aguardando retorno' };
    }
    case 'corregedoria':
      return { nivel: lead.proxima_data && lead.proxima_data >= hoje ? 'ok' : 'warn', titulo: 'Aguardando a corregedoria', texto: lead.proxima_data && lead.proxima_data >= hoje ? `Próxima cobrança em ${dataBr(lead.proxima_data)}. Autorizou e assinou? Marque como ganho.` : 'Registre a próxima data para cobrar o retorno e ofereça ajuda com os documentos.', acao: lead.proxima_data && lead.proxima_data >= hoje ? 'etapa:ganho' : 'foco:campo-proximo', rotulo: lead.proxima_data && lead.proxima_data >= hoje ? 'Cliente assinou' : 'Marcar próxima cobrança' };
    case 'proposta': {
      const vig = (lead.propostas || []).find((x) => x.status === 'enviada');
      if (vig && vig.validade < hoje) return { nivel: 'crit', titulo: 'A proposta venceu', texto: 'Ligue para o cartório. Se ainda houver interesse, registre uma nova proposta; se não, marque como Perdido com o motivo.', acao: 'toque:avulso', rotulo: 'Registrar ligação' };
      return { nivel: 'info', titulo: 'Acompanhe até o fechamento', texto: vig ? `Proposta válida até ${dataBr(vig.validade)}. Assinou? Marque como ganho — o valor vem da proposta e a implantação começa.` : 'Assinou? Marque como ganho.', acao: 'etapa:ganho', rotulo: 'Cliente assinou' };
    }
    case 'ganho': {
      // Implantação assistida: marcos depois da assinatura
      if (lead.implantacao_inicio) {
        const ini = lead.implantacao_inicio;
        const feitos = lead.toques_marco || {};
        const marco = cfg.marcos_implantacao.find((m) => !feitos[m.d] && addDias(ini, m.d) <= hoje);
        if (marco) return { nivel: addDias(ini, marco.d) < hoje ? 'crit' : 'info', titulo: `Implantação D${marco.d}: ${marco.n}`, texto: marco.acao, acao: 'marco:' + marco.d, rotulo: 'Marcar como feito' };
        const dia = diffDias(ini, hoje);
        if (dia >= 5 && (lead.pontos ?? 0) < 40 && !feitos[30]) return { nivel: 'crit', titulo: 'Uso baixo na implantação: ligue hoje', texto: `Dia ${dia} com ${lead.pontos ?? 0} pontos. Descubra o que travou e marque os sinais de uso que mudarem.`, acao: 'toque:avulso', rotulo: 'Registrar ligação' };
      }

      if (lead.pago_em) return { nivel: 'ok', titulo: 'Cliente pago', texto: 'Peça uma indicação: quem indicar ganha um mês grátis quando o indicado pagar. Use o script "Pedido de indicação".' };
      if (!lead.cnpj) return { nivel: 'warn', titulo: 'Preencha o CNPJ', texto: 'Com o CNPJ, o Nexus confere sozinho o primeiro pagamento no ASAAS — e só aí o cliente conta na meta.', acao: 'foco:campo-cnpj', rotulo: 'Preencher CNPJ' };
      if (admin) return { nivel: 'warn', titulo: 'Aguardando o 1º pagamento', texto: 'O ASAAS confere pelo CNPJ. Se o cliente pagou por fora, confirme com o comprovante.', acao: 'pagamento', rotulo: 'Confirmar pagamento' };
      return { nivel: 'warn', titulo: 'Aguardando o 1º pagamento', texto: 'O ASAAS confere pelo CNPJ automaticamente. Se o cliente pagou por fora, avise a gestão para confirmar com o comprovante.' };
    }
    case 'perdido':
      return { nivel: 'neu', titulo: 'Negociação encerrada', texto: `Motivo: ${lead.motivo_perda || '—'}. Para reabrir, mude a etapa e escreva a justificativa.` };
    default:
      return null;
  }
}

/**
 * A ação mais importante agora. Se a sugestão for avançar de etapa mas ainda
 * faltar algum critério (portões são cumulativos), sugere resolver o que falta
 * primeiro — assim o botão nunca leva a um "não pode".
 */
export function proximaAcao(lead, cfg, admin) {
  const r = proximaAcaoBase(lead, cfg, admin);
  if (!r || !r.acao || !r.acao.startsWith('etapa:')) return r;
  const destino = r.acao.split(':')[1];
  if (['cadencia', 'perdido'].includes(destino)) return r;
  const crit = criteriosPara(lead, null, cfg);
  const falta = crit?.itens.find((x) => !x.ok && !x.opcional);
  if (!falta) return r;
  return {
    nivel: 'warn',
    titulo: `Antes de ir para ${crit.nomeProxima}, resolva: ${falta.txt.toLowerCase()}`,
    texto: `Faltam ${crit.itens.filter((x) => !x.ok && !x.opcional).length} item(ns) na lista "Para avançar" logo abaixo.`,
    acao: falta.acao, rotulo: falta.rotulo || 'Resolver',
  };
}

const COR = {
  crit: 'border-red-200 bg-red-50', warn: 'border-amber-200 bg-amber-50', info: 'border-nexus-200 bg-nexus-50',
  ok: 'border-emerald-200 bg-emerald-50', neu: 'border-slate-200 bg-slate-50',
};

export function CaixaProximaAcao({ acao, onExecutar }) {
  if (!acao) return null;
  return (
    <section className={`rounded-lg border p-3 ${COR[acao.nivel] || COR.neu}`} aria-label="O que fazer agora">
      <p className="mb-1 flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-slate-500"><Compass size={13} /> O que fazer agora</p>
      <p className="text-sm font-semibold text-slate-900">{acao.titulo}</p>
      <p className="mt-0.5 text-sm text-slate-700">{acao.texto}</p>
      {acao.acao && (
        <button type="button" className={btnPrimCls + ' mt-2'} onClick={() => onExecutar(acao.acao)}>
          {acao.rotulo} <ArrowRight size={14} />
        </button>
      )}
    </section>
  );
}

export function ListaCriterios({ criterios, onExecutar }) {
  if (!criterios || !criterios.itens.length) return null;
  return (
    <section className="rounded-lg border border-slate-200 p-3" aria-label="O que falta para avançar">
      <p className="mb-2 text-xs font-semibold text-slate-700">
        Para avançar para <span className="text-nexus-800">{criterios.nomeProxima}</span>
        {criterios.pronto ? <span className="ml-2 font-normal text-emerald-700">— tudo pronto</span> : null}
      </p>
      <ul className="space-y-1.5">
        {criterios.itens.map((c) => (
          <li key={c.txt} className="flex items-center gap-2 text-sm">
            {c.ok ? <CheckCircle2 size={16} className="shrink-0 text-emerald-600" /> : <Circle size={16} className="shrink-0 text-slate-300" />}
            <span className={`flex-1 ${c.ok ? 'text-slate-500' : 'text-slate-800'}`}>{c.txt}{c.opcional ? '' : ''}</span>
            {!c.ok && c.acao && <button type="button" className="text-xs font-medium text-nexus-700 hover:underline" onClick={() => onExecutar(c.acao)}>{c.rotulo || 'Resolver'}</button>}
          </li>
        ))}
      </ul>
    </section>
  );
}

export function GuiaDaEtapa({ etapa }) {
  const g = GUIA_ETAPAS[etapa];
  if (!g) return null;
  return (
    <div className="rounded-md bg-slate-50 p-2 text-xs text-slate-600">
      <b className="text-slate-700">Nesta etapa:</b> {g.objetivo} <span className="text-slate-500">Prazo: {g.prazo}</span>
    </div>
  );
}

export function OQueFalar({ lead }) {
  const [aberto, setAberto] = useState(false);
  const [copiado, setCopiado] = useState(false);
  const titulo = scriptDoPasso(lead);
  const s = SCRIPTS.find((x) => x.titulo === titulo);
  if (!s) return null;
  async function copiar() { try { await navigator.clipboard.writeText(s.texto); setCopiado(true); setTimeout(() => setCopiado(false), 1500); } catch { /* sem clipboard */ } }
  return (
    <section className="rounded-lg border border-slate-200">
      <button type="button" onClick={() => setAberto(!aberto)} className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm">
        <MessageSquareText size={15} className="text-nexus-700" />
        <span className="flex-1"><b>O que falar agora:</b> {s.titulo}</span>
        <span className="text-xs text-nexus-700">{aberto ? 'esconder' : 'ver roteiro'}</span>
      </button>
      {aberto && (
        <div className="space-y-2 border-t border-slate-100 p-3">
          <div className="whitespace-pre-wrap rounded-md bg-slate-50 p-3 text-sm leading-relaxed text-slate-700">{s.texto}</div>
          <button type="button" className={btnCls + ' !px-2 !py-1 text-xs'} onClick={copiar}>{copiado ? <><Check size={12} /> Copiado</> : <><Copy size={12} /> Copiar</>}</button>
        </div>
      )}
    </section>
  );
}
