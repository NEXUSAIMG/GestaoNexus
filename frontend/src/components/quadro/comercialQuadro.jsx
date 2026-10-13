import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Handshake, ChevronDown, ChevronUp, ArrowRight } from 'lucide-react';
import { Dica } from '../comercial/Ajuda.jsx';
import { GUIA_ETAPAS } from '../comercial/guia.js';

/**
 * Sprint 42H — o quadro explica sozinho o que é cada coisa quando anda em
 * espelho com o Comercial: faixa "como funciona", o significado de cada
 * coluna e o próximo passo de cada card.
 */

export const ETAPA_COMERCIAL = {
  prospect: 'Em prospecção', cadencia: 'Em contatos', diagnostico: 'Reunião de apresentação',
  trial: 'Trial (14 dias)', proposta: 'Aguardando retorno', corregedoria: 'Aguardando a Corregedoria', ganho: 'Ganho', perdido: 'Perdido',
};

const MARCO = {
  0: { nome: 'Onboarding (D0)', texto: 'Cliente acabou de assinar: mande o onboarding no mesmo dia.' },
  2: { nome: 'Treinamento e ativação (D2)', texto: 'Reunião de treinamento e ativação do número do cartório.' },
  7: { nome: 'Bot no ar (D7)', texto: 'Em desenvolvimento: o bot precisa estar respondendo até o 7º dia.' },
  15: { nome: 'Checagem de uso (D15)', texto: 'Confira se o cartório está usando. Uso baixo: ligue no mesmo dia.' },
  30: { nome: 'Pós-venda (D30)', texto: 'Conversa de 30 dias: satisfação, depoimento e indicação.' },
};

const lerLS = (k, padrao) => { try { const v = localStorage.getItem(k); return v == null ? padrao : v; } catch { return padrao; } };
const gravarLS = (k, v) => { try { localStorage.setItem(k, v); } catch { /* sem storage: tudo bem */ } };

/** Data de hoje (fuso do navegador) em AAAA-MM-DD. */
export function hojeISO() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

const dataCurta = (iso) => (iso ? iso.slice(8, 10) + '/' + iso.slice(5, 7) : '');

/** O card é "meu"? Responsável no card ou dono do lead no Comercial. */
export function cardEhMeu(card, pessoaId) {
  if (!pessoaId) return false;
  if ((card.responsaveis || []).some((r) => r.id === pessoaId)) return true;
  return card.comercial?.dono_id === pessoaId;
}

/** Texto do chip e da explicação de uma coluna do quadro em espelho. */
const semAcento = (t) => String(t || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim();

export function explicarColuna(info, nomeColuna = '') {
  if (!info || info.etapa === 'ignorar') {
    return {
      rotulo: 'só no quadro',
      neutro: true,
      texto: 'Esta coluna não faz parte do funil: o card pode ficar aqui sem mudar nada no Comercial.',
    };
  }
  if (info.etapa === 'ganho' && info.marco != null && MARCO[info.marco]) {
    const m = MARCO[info.marco];
    return {
      rotulo: 'Implantação · ' + m.nome,
      texto: (
        <>
          <b>Cliente em implantação.</b> {m.texto}
          <br /><br />Arrastar o card para cá marca no Comercial os marcos até {m.nome}. Os marcos também podem ser marcados na aba Implantação do Comercial: o card anda sozinho.
        </>
      ),
    };
  }
  const g = GUIA_ETAPAS[info.etapa];
  const nome = ETAPA_COMERCIAL[info.etapa] || info.etapa;
  return {
    // coluna com o mesmo nome da etapa: não repete o nome
    rotulo: semAcento(nome) === semAcento(nomeColuna) ? 'ligada ao Comercial' : 'Comercial · ' + nome,
    texto: (
      <>
        <b>Etapa “{nome}” no Comercial.</b>{g ? ' ' + g.objetivo : ''}
        {g && <><br /><br /><b>Avança quando:</b> {g.avancar}</>}
        {g && g.prazo !== '—' && <><br /><b>Prazo:</b> {g.prazo}</>}
        <br /><br />Arrastar o card para esta coluna muda a etapa lá. Se faltar algum critério, o quadro avisa o que falta.
      </>
    ),
  };
}

/** Chip abaixo do nome da coluna: o que ela é no Comercial, com (?) explicando. */
export function ChipColuna({ info, nomeColuna }) {
  const e = explicarColuna(info, nomeColuna);
  return (
    <div className="mt-1 flex items-center gap-1 pl-4">
      <span className={'inline-flex max-w-full items-center gap-1 truncate rounded px-1.5 py-0.5 text-[10px] font-medium '
        + (e.neutro ? 'bg-slate-200/70 text-slate-500' : 'bg-indigo-50 text-indigo-700')}>
        {!e.neutro && <Handshake size={10} className="shrink-0" />}
        <span className="truncate">{e.rotulo}</span>
      </span>
      <Dica texto={e.texto} />
    </div>
  );
}

// Quando o lead não tem próximo passo anotado, o que fazer vem da etapa.
const PASSO_DA_ETAPA = {
  prospect: { texto: 'Ainda sem contato. No dia do 1º contato, passe para Em contatos.', noCard: false },
  cadencia: { texto: 'Seguir a cadência: o toque do dia está em Hoje, no Comercial.', noCard: true },
  ganho: { texto: 'Implantação: o próximo marco está na aba Implantação do Comercial.', noCard: false },
};

/** Próximo passo do lead: o que fazer e quando (null = nada a mostrar). */
export function proximoPasso(comercial, hoje = hojeISO(), { noCard = false } = {}) {
  if (!comercial || comercial.etapa === 'perdido') return null;
  if (!comercial.proximo_passo) {
    const f = PASSO_DA_ETAPA[comercial.etapa];
    if (f && (!noCard || f.noCard)) return { texto: f.texto, quando: '', nivel: 'neu' };
    if (!f && !noCard) return { texto: 'Sem próximo passo com data. Abra no Comercial e combine o próximo contato.', quando: '', nivel: 'warn', falta: true };
    return null;
  }
  const d = comercial.proxima_data;
  let quando = ''; let nivel = 'neu';
  if (d) {
    if (d < hoje) { quando = 'atrasado desde ' + dataCurta(d); nivel = 'crit'; }
    else if (d === hoje) { quando = 'hoje'; nivel = 'warn'; }
    else quando = dataCurta(d);
  }
  return { texto: comercial.proximo_passo, quando, nivel };
}

export function LinhaProximoPasso({ comercial }) {
  const p = proximoPasso(comercial, hojeISO(), { noCard: true });
  if (!p) return null;
  const cor = p.nivel === 'crit' ? 'text-red-700' : p.nivel === 'warn' ? 'text-amber-700' : 'text-slate-600';
  return (
    <div className={'mt-1 flex items-start gap-1 text-[11px] leading-snug ' + cor}
      title="Próximo passo combinado no Comercial. Ao registrar o contato lá, ele muda sozinho.">
      <ArrowRight size={11} className="mt-0.5 shrink-0" />
      <span className="min-w-0">
        <span className="line-clamp-2">{p.texto}</span>
        {p.quando && <span className="font-semibold"> · {p.quando}</span>}
      </span>
    </div>
  );
}

/** Faixa recolhível no topo do quadro em espelho. */
export function FaixaEspelho({ espelho }) {
  const chave = 'quadro-espelho-ajuda';
  const [aberto, setAberto] = useState(() => lerLS(chave, '1') === '1');
  if (!espelho) return null;
  const alternar = () => { const n = !aberto; setAberto(n); gravarLS(chave, n ? '1' : '0'); };
  return (
    <div className="border-b border-indigo-100 bg-indigo-50/70 px-4 text-sm text-slate-700">
      <button type="button" onClick={alternar} className="flex w-full items-center gap-2 py-2 text-left font-medium text-indigo-900">
        <Handshake size={15} className="text-indigo-700" />
        <span className="flex-1">Este quadro anda junto com o Comercial</span>
        <span className="text-xs font-normal text-indigo-700">{aberto ? 'esconder' : 'como funciona'}</span>
        {aberto ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
      </button>
      {aberto && (
        <div className="flex flex-wrap items-start gap-4 pb-3">
          <ul className="ml-6 min-w-[280px] flex-1 list-disc space-y-0.5 text-[13px]">
            <li><b>Cartório avançou?</b> Arraste o card para a coluna seguinte: a etapa muda no Comercial também. Se faltar algo (reunião, proposta…), o quadro mostra o que é e o botão para resolver.</li>
            <li><b>O que fazer em cada card:</b> a linha com a seta é o próximo passo e a data. <span className="font-medium text-red-700">Vermelho</span> = atrasado; <span className="font-medium text-amber-700">laranja</span> = hoje.</li>
            <li><b>O que é cada coluna:</b> clique no <span className="font-semibold">(?)</span> embaixo do nome da coluna.</li>
            <li><b>Ver só o seu trabalho:</b> use <span className="font-semibold">Destacar os meus</span>, na barra de filtros.</li>
            <li><b>Contato, reunião e proposta</b> se registram no Comercial: abra o card e clique em “Abrir no Comercial”.{espelho.somente_etiqueta ? <> Só cards com a etiqueta <b>{espelho.somente_etiqueta}</b> são de venda.</> : null}</li>
          </ul>
          <Link to="/comercial" className="shrink-0 rounded-lg border border-indigo-300 bg-white px-3 py-1.5 text-xs font-medium text-indigo-800 hover:bg-indigo-100">
            Abrir o Comercial (Hoje)
          </Link>
        </div>
      )}
    </div>
  );
}
