import { Globe, Mail, Phone } from 'lucide-react';

/**
 * Ficha de cliente dentro do card.
 *
 * Cards com a etiqueta "Cliente" mostram a ficha comercial no lugar do card
 * comum. O gatilho é o NOME da etiqueta, não o quadro: "Atividade Comercial"
 * é nome de dado, não existe no código, e amarrar a regra a um quadro
 * específico quebraria no dia em que alguém criasse outro funil.
 *
 * Os valores vêm dos campos personalizados do quadro (`quadros_campos` +
 * `cards_campos_valores`), que já chegam no payload do board. Nome e
 * Responsável não viram campo: são o título e os responsáveis do próprio
 * card, e duplicá-los daria duas versões da mesma informação.
 */

export const ETIQUETA_CLIENTE = 'cliente';

// Ordem de exibição pedida pelo comercial. Campo que não existir no quadro é
// simplesmente pulado — a ficha não quebra se alguém renomear ou remover um.
const ORDEM = [
  'Origem', 'Termômetro', 'Cidade/UF', 'Representante/Oficial',
  'Competência', 'Faturamento', 'Site', 'E-mail', 'Telefone/WhatsApp',
];

/**
 * O card é uma ficha de cliente?
 *
 * Duas condições, e a segunda é o que impede a ficha de vazar: TODO quadro
 * criado pela tela nasce com a etiqueta "Cliente" entre as padrão. Só a
 * etiqueta como gatilho faria qualquer card marcado como "Cliente", em
 * qualquer quadro do sistema, trocar de layout — inclusive os que já existem
 * hoje em produção e não têm nada a ver com o funil comercial.
 *
 * Por isso exigimos também que o QUADRO tenha pelo menos um dos campos
 * comerciais configurado. Quadro sem esses campos continua exatamente como
 * está, etiqueta "Cliente" ou não.
 */
export function ehCardCliente(etiquetasDoCard = [], camposDoQuadro = []) {
  const temEtiqueta = etiquetasDoCard.some(
    (e) => String(e?.nome || '').trim().toLowerCase() === ETIQUETA_CLIENTE,
  );
  if (!temEtiqueta) return false;

  const nomes = new Set(ORDEM);
  return camposDoQuadro.some((c) => nomes.has(c?.nome));
}

// Campos que ocupam a linha inteira (valor longo ou clicável).
const LARGURA_TOTAL = new Set(['Site', 'E-mail', 'Telefone/WhatsApp']);

const CHIP_TERMOMETRO = {
  quente: 'bg-red-100 text-red-800 border-red-200',
  morno: 'bg-amber-100 text-amber-800 border-amber-200',
  frio: 'bg-sky-100 text-sky-800 border-sky-200',
};

function normalizar(s) {
  return String(s || '').trim().toLowerCase();
}

/** "(47) 99123-4567" -> "5547991234567" para o link do WhatsApp. */
function paraWhatsapp(valor) {
  const so = String(valor || '').replace(/\D/g, '');
  if (so.length < 10) return null;
  return so.length <= 11 ? '55' + so : so;
}

function urlDoSite(valor) {
  const v = String(valor || '').trim();
  if (!v) return null;
  return /^https?:\/\//i.test(v) ? v : 'https://' + v;
}

/** Impede que o clique num link abra o card por baixo. */
function pararPropagacao(e) {
  e.stopPropagation();
}

export default function FichaCliente({ campos = [], valores = {}, responsaveis = [] }) {
  const porNome = new Map(campos.map((c) => [c.nome, c]));

  const linhas = ORDEM
    .map((nome) => {
      const def = porNome.get(nome);
      if (!def) return null;
      const valor = valores[def.id];
      if (valor === null || valor === undefined || String(valor).trim() === '') return null;
      return { nome, valor: String(valor).trim() };
    })
    .filter(Boolean);

  const temResponsavel = responsaveis.length > 0;
  if (linhas.length === 0 && !temResponsavel) return null;

  return (
    <dl className="mt-2 grid grid-cols-2 gap-x-2 gap-y-1.5 border-t border-slate-100 pt-2">
      {temResponsavel && (
        <div className="col-span-2">
          <dt className="text-[9px] font-semibold uppercase tracking-wide text-slate-400">
            Responsável
          </dt>
          <dd className="truncate text-[11px] text-slate-700" title={responsaveis.map((r) => r.nome).join(', ')}>
            {responsaveis.map((r) => r.nome).join(', ')}
          </dd>
        </div>
      )}

      {linhas.map(({ nome, valor }) => {
        const total = LARGURA_TOTAL.has(nome);
        return (
          <div key={nome} className={total ? 'col-span-2' : ''}>
            <dt className="text-[9px] font-semibold uppercase tracking-wide text-slate-400">
              {nome}
            </dt>
            <dd className="text-[11px] text-slate-700">
              {nome === 'Termômetro' ? (
                <span
                  className={[
                    'inline-block rounded border px-1.5 py-0.5 text-[10px] font-semibold',
                    CHIP_TERMOMETRO[normalizar(valor)] || 'border-slate-200 bg-slate-100 text-slate-700',
                  ].join(' ')}
                >
                  {valor}
                </span>
              ) : nome === 'Faturamento' ? (
                <span className="font-semibold tabular-nums text-slate-900">{valor}</span>
              ) : nome === 'Site' ? (
                <a
                  href={urlDoSite(valor)}
                  target="_blank"
                  rel="noreferrer"
                  onClick={pararPropagacao}
                  className="inline-flex max-w-full items-center gap-1 truncate text-nexus-700 hover:underline"
                  title={valor}
                >
                  <Globe size={10} className="shrink-0" />
                  <span className="truncate">{valor.replace(/^https?:\/\//i, '')}</span>
                </a>
              ) : nome === 'E-mail' ? (
                <a
                  href={'mailto:' + valor}
                  onClick={pararPropagacao}
                  className="inline-flex max-w-full items-center gap-1 truncate text-nexus-700 hover:underline"
                  title={valor}
                >
                  <Mail size={10} className="shrink-0" />
                  <span className="truncate">{valor}</span>
                </a>
              ) : nome === 'Telefone/WhatsApp' ? (
                paraWhatsapp(valor) ? (
                  <a
                    href={'https://wa.me/' + paraWhatsapp(valor)}
                    target="_blank"
                    rel="noreferrer"
                    onClick={pararPropagacao}
                    className="inline-flex items-center gap-1 text-nexus-700 hover:underline"
                    title={'Abrir no WhatsApp: ' + valor}
                  >
                    <Phone size={10} className="shrink-0" />
                    {valor}
                  </a>
                ) : (
                  <span className="inline-flex items-center gap-1">
                    <Phone size={10} className="shrink-0 text-slate-400" />
                    {valor}
                  </span>
                )
              ) : (
                <span className="block truncate" title={valor}>{valor}</span>
              )}
            </dd>
          </div>
        );
      })}
    </dl>
  );
}
