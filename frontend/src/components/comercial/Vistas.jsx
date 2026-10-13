import { useEffect, useState } from 'react';
import { Check, Copy, ClipboardCheck, Users } from 'lucide-react';
import { api, mensagemDeErro } from '../../api/client.js';
import {
  Pill, Barra, Painel, Vazio, Kpi, brl, pct, dataBr, nivelPontos, inputCls, btnPrimCls, btnCls, Campo, NomeLead,
  Erro, dataHoraBr, horaBr,
} from './ui.jsx';
import { SCRIPTS, OBJECOES } from './scripts.js';
import { ChecagemModal, UmAUmModal, DesfechoModal } from './Acoes.jsx';
import { Dica } from './Ajuda.jsx';

const nomeEtapa = (cfg, k) => cfg.etapas.find((e) => e.k === k)?.n || k;
const btnMini = btnPrimCls + ' !px-2 !py-1 text-xs';
const linkMini = 'text-xs font-medium text-nexus-700 hover:underline';

function Lista({ itens, vazio, render }) {
  if (!itens.length) return <Vazio>{vazio}</Vazio>;
  return <ul className="divide-y divide-slate-100">{itens.map(render)}</ul>;
}

// ---------------------------------------------------------------------------
// HOJE
// ---------------------------------------------------------------------------
/**
 * Fila: prospects sem responsável (listas importadas). Ninguém "perde" lead
 * da fila — cada pessoa pega um lote, e o prazo da etapa começa ao pegar.
 */
function Fila({ painel, onMudou, onAviso }) {
  const [qtd, setQtd] = useState(10);
  const [enviando, setEnviando] = useState(false);
  const [erro, setErro] = useState('');
  if (!painel.fila) return null;
  async function pegar() {
    setErro(''); setEnviando(true);
    try {
      const r = await api.post('/comercial/leads/pegar', { quantidade: Number(qtd) });
      onAviso?.(r.data.pegos ? `${r.data.pegos} cartório(s) da fila agora são seus. Comece a cadência pelo Funil.` : 'A fila está vazia.');
      onMudou();
    } catch (err) { setErro(mensagemDeErro(err)); } finally { setEnviando(false); }
  }
  return (
    <div className="flex flex-wrap items-center gap-2 rounded-md border border-nexus-200 bg-nexus-50 px-3 py-2 text-sm text-slate-700">
      <span><b>{painel.fila}</b> cartório(s) na fila ("Em prospecção" sem responsável).</span>
      <Dica texto="Listas importadas entram na fila. Cada pessoa pega um lote, os mais antigos primeiro; ao pegar, o prazo de 2 dias começa a contar." />
      <span className="ml-auto flex items-center gap-1.5">
        <select className="rounded-md border border-slate-300 bg-white px-2 py-1 text-sm" value={qtd} onChange={(e) => setQtd(e.target.value)} aria-label="Quantos pegar">
          {[5, 10, 20, 30].map((n) => <option key={n} value={n}>{n}</option>)}
        </select>
        <button type="button" className="rounded-md bg-nexus-700 px-3 py-1 text-sm font-medium text-white hover:bg-nexus-800 disabled:opacity-50" disabled={enviando} onClick={pegar}>
          {enviando ? 'Pegando…' : 'Pegar para mim'}
        </button>
      </span>
      {erro && <span className="w-full text-red-700">{erro}</span>}
    </div>
  );
}

export function VistaHoje({ painel, cfg, escopo, onAbrir, onToque, onMarco, onMudou, onAviso }) {
  const { numeros: n, metas: m, hoje_listas: h } = painel;
  const [desfecho, setDesfecho] = useState(null);
  const dataExt = new Date(painel.hoje + 'T12:00:00').toLocaleDateString('pt-BR', { weekday: 'long', day: 'numeric', month: 'long' });
  const agora = new Date();
  const minha = painel.supervisao.find((s) => s.pessoa.id === cfg.eu?.id);
  const pessoal = escopo === 'meus' && minha;

  // Roteiro do dia, na ordem em que deve ser feito. Cada bloco diz por que
  // está nessa posição — é o que a pessoa precisa para decidir sozinha.
  const blocos = [
    {
      k: 'reunioes', titulo: 'Reuniões de hoje', itens: h.reunioes, nivel: 'line',
      porque: 'Compromisso com hora marcada vem primeiro. Prepare-se com o roteiro de Diagnóstico.',
      render: (r) => (
        <li key={r.id} className="flex items-center gap-3 py-2">
          <span className="w-12 font-mono text-sm text-slate-700">{horaBr(r.inicio)}</span>
          <div className="min-w-0 flex-1">
            <NomeLead lead={r.lead} onAbrir={onAbrir} />
            <p className="text-xs text-slate-500">{cfg.tipos_reuniao[r.tipo]}{r.responsavel_nome ? ' · ' + r.responsavel_nome : ''}</p>
          </div>
          {new Date(r.inicio) < agora
            ? <button type="button" className={btnMini} onClick={() => setDesfecho(r)}>Como foi?</button>
            : <span className="text-xs text-slate-400">depois da reunião, registre como foi</span>}
        </li>
      ),
    },
    {
      k: 'sem_desfecho', titulo: 'Reuniões sem desfecho', itens: h.sem_desfecho, nivel: 'crit',
      porque: 'Reunião que já passou precisa dizer se aconteceu. Sem isso, o funil e o placar mentem.',
      render: (r) => (
        <li key={r.id} className="flex items-center gap-3 py-2">
          <div className="min-w-0 flex-1">
            <NomeLead lead={r.lead} onAbrir={onAbrir} />
            <p className="text-xs text-slate-500">{cfg.tipos_reuniao[r.tipo]} · {dataHoraBr(r.inicio)}{r.responsavel_nome ? ' · ' + r.responsavel_nome : ''}</p>
          </div>
          <button type="button" className={btnMini} onClick={() => setDesfecho(r)}>Como foi?</button>
        </li>
      ),
    },
    {
      k: 'marcos', titulo: 'Implantação de clientes', itens: h.marcos, nivel: 'line', dica: 'pontos',
      porque: 'Cliente que assinou precisa ver o resultado rápido. Marco atrasado é cliente esfriando.',
      render: (x) => (
        <li key={x.lead.id + '-' + x.d} className="flex items-start gap-3 py-2">
          <div className="min-w-0 flex-1">
            <NomeLead lead={x.lead} onAbrir={onAbrir} />
            <p className="text-xs text-slate-500">
              <b className="text-slate-700">D{x.d} · {x.n}</b> — {x.acao} <Pill nivel={nivelPontos(x.pontos)}>{x.pontos} pts</Pill>
              {x.atrasado && <> <Pill nivel="crit">desde {dataBr(x.previsto)}</Pill></>}
            </p>
          </div>
          <button type="button" className={btnMini} onClick={() => onMarco(x.lead.id, x.d)}><Check size={12} /> Feito</button>
        </li>
      ),
    },
    {
      k: 'toques', titulo: 'Toques de cadência', itens: h.toques, nivel: 'line', dica: 'cadencia',
      porque: 'O toque do dia de cada cartório em cadência. Registre sempre o resultado — mesmo "não atendeu".',
      render: (x) => (
        <li key={x.lead.id + '-' + x.d} className="flex items-start gap-3 py-2">
          <div className="min-w-0 flex-1">
            <NomeLead lead={x.lead} onAbrir={onAbrir} />
            <p className="text-xs text-slate-500">
              <b className="text-slate-700">Dia {x.d} · {x.canal}</b> — {x.acao}
              {x.lead.dono_nome && <> · {x.lead.dono_nome}</>}
              {x.atrasado && <> <Pill nivel="crit">atrasado desde {dataBr(x.previsto)}</Pill></>}
            </p>
          </div>
          <button type="button" className={btnMini} onClick={() => onToque(x.lead, 'cadencia', x.d)}>Registrar</button>
        </li>
      ),
    },
    {
      k: 'proximos', titulo: 'Próximos passos de hoje', itens: h.proximos, nivel: 'line', dica: 'proximo_passo',
      porque: 'O que você mesma combinou para hoje. Abra o cartório, faça e registre o novo próximo passo.',
      render: (x) => (
        <li key={x.lead.id} className="flex items-start gap-3 py-2">
          <div className="min-w-0 flex-1">
            <NomeLead lead={x.lead} onAbrir={onAbrir} />
            <p className="text-xs text-slate-500">{x.proximo_passo || 'Sem descrição'} · {nomeEtapa(cfg, x.lead.etapa)}</p>
          </div>
          <Pill nivel={x.vencido ? 'crit' : 'neu'}>{x.vencido ? 'venceu ' + dataBr(x.proxima_data) : 'hoje'}</Pill>
          <button type="button" className={linkMini} onClick={() => onAbrir(x.lead.id)}>abrir</button>
        </li>
      ),
    },
    {
      k: 'propostas', titulo: 'Propostas vencendo', itens: h.propostas_vencendo, nivel: 'warn',
      porque: 'Proposta perto da validade: ligue para fechar ou entender o que falta.',
      render: (x) => (
        <li key={x.id} className="flex items-start gap-3 py-2">
          <div className="min-w-0 flex-1">
            <NomeLead lead={x.lead} onAbrir={onAbrir} />
            <p className="text-xs text-slate-500">{x.plano} · {brl(x.valor_mensal)}/mês{x.lead.dono_nome ? ' · ' + x.lead.dono_nome : ''}</p>
          </div>
          <Pill nivel={x.vencida ? 'crit' : 'warn'}>{x.vencida ? 'venceu ' : 'vence '}{dataBr(x.validade)}</Pill>
        </li>
      ),
    },
    {
      k: 'pagamento', titulo: 'Assinados aguardando pagamento', itens: h.aguardando_pagamento, nivel: 'warn', dica: 'assinado_pago',
      porque: 'Assinatura só vira cliente com o 1º pagamento. Confira o CNPJ e o boleto/PIX.',
      render: (x) => (
        <li key={x.lead.id} className="flex items-start gap-3 py-2">
          <div className="min-w-0 flex-1">
            <NomeLead lead={x.lead} onAbrir={onAbrir} />
            <p className="text-xs text-slate-500">assinado {dataBr(x.assinado_em)} · {x.valor_mensal ? brl(x.valor_mensal) + '/mês' : 'sem valor'}{x.lead.dono_nome ? ' · ' + x.lead.dono_nome : ''}</p>
          </div>
          <Pill nivel={(x.dias ?? 0) > 7 ? 'crit' : 'warn'}>{x.dias ?? '?'}d</Pill>
        </li>
      ),
    },
    {
      k: 'parados', titulo: 'Parados além do prazo', itens: h.parados, nivel: 'crit', dica: 'sla',
      porque: 'Cartórios presos na mesma etapa. Abra cada um: a ficha diz o que fazer para destravar.',
      render: (x) => (
        <li key={x.lead.id} className="flex items-start gap-3 py-2">
          <div className="min-w-0 flex-1">
            <NomeLead lead={x.lead} onAbrir={onAbrir} />
            <p className="text-xs text-slate-500">{nomeEtapa(cfg, x.lead.etapa)}{x.lead.dono_nome ? ' · ' + x.lead.dono_nome : ''}</p>
          </div>
          <Pill nivel="crit">{x.dias}d / {x.sla}d</Pill>
        </li>
      ),
    },
  ];
  const comItens = blocos.filter((b) => b.itens.length);
  const emDia = blocos.filter((b) => !b.itens.length);
  const total = comItens.reduce((s, b) => s + b.itens.length, 0);

  return (
    <div className="space-y-4">
      <p className="text-sm text-slate-500">
        {dataExt.charAt(0).toUpperCase() + dataExt.slice(1)}.{' '}
        {total ? <>Você tem <b className="text-slate-800">{total} tarefa(s)</b>{escopo === 'meus' ? '' : ' na equipe'}. Trabalhe de cima para baixo.</> : 'Nenhuma tarefa pendente.'}
      </p>
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {pessoal ? (
          <>
            <Kpi rotulo="Meus toques hoje" valor={minha.feitos} meta={minha.meta_toques || null} sub={`${minha.conexoes} conexão(ões)`} />
            <Kpi rotulo="Meus novos na cadência" valor={minha.novos} meta={minha.meta_novos || null} />
            <div className="flex flex-col gap-1.5 rounded-lg border border-slate-200 bg-white p-4">
              <span className="flex items-center gap-1 text-[11px] font-medium uppercase tracking-wide text-slate-500">Meu semáforo <Dica termo="semaforo" /></span>
              <span><Pill nivel={minha.sinal}>{minha.rotulo}</Pill></span>
              <Barra pct={Math.max(4, minha.indice)} nivel={minha.sinal} />
              <span className="text-xs text-slate-500">{minha.pendentes} pendente(s) agora</span>
            </div>
          </>
        ) : (
          <>
            <Kpi rotulo="Novos na cadência hoje" valor={n.novos_hoje} meta={m.metaNovosDia} />
            <Kpi rotulo="Toques feitos hoje" valor={n.toques_hoje} meta={m.metaToquesDia}
              sub={`${n.conexoes_hoje} conexão(ões) · ${n.toques_hoje ? pct((n.conexoes_hoje / n.toques_hoje) * 100) : '—'}`} />
            <Kpi rotulo="Em implantação" valor={n.implantacoes} sub={`${h.marcos.length} marco(s) para hoje`} />
          </>
        )}
        <Kpi rotulo="Clientes pagos no mês (equipe)" valor={n.pagos_mes} meta={m.metaClientes}
          sub={`${brl(n.receita_nova_mes)}/mês · ${n.aguardando_pagamento} aguardando pagamento`} />
      </div>
      {painel.sem_dono > 0 && (
        <div className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
          {painel.sem_dono} cartório(s) em andamento sem responsável{escopo === 'meus' ? ' — não aparecem em "Só os meus"' : ''}.
          Abra no Funil (filtro "Sem responsável"): quem registra um contato vira o responsável.
        </div>
      )}
      <Fila painel={painel} onMudou={onMudou} onAviso={onAviso} />

      {!total && (
        <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-5 text-sm text-emerald-900">
          <p className="text-base font-semibold">Tudo em dia.</p>
          <p className="mt-1">Sem tarefas pendentes{escopo === 'meus' ? ' para você' : ''}. Bom momento para colocar mais cartórios em cadência:
            {painel.fila ? 'pegue um lote da fila acima e ' : ''}abra o Funil, escolha cartórios em Em prospecção e clique em “Começar cadência hoje”. A meta da equipe é {m.metaNovosDia} novos por dia útil.</p>
        </div>
      )}

      <div className="space-y-4">
        {comItens.map((b, i) => (
          <Painel key={b.k}
            titulo={<span className="flex items-center gap-2"><span className="flex h-5 w-5 items-center justify-center rounded-full bg-nexus-700 text-[11px] font-semibold text-white">{i + 1}</span>{b.titulo}{b.dica && <Dica termo={b.dica} />}</span>}
            extra={<Pill nivel={b.nivel}>{b.itens.length}</Pill>}>
            <p className="-mt-1 text-xs text-slate-500">{b.porque}</p>
            <ul className="divide-y divide-slate-100">{b.itens.slice(0, 40).map(b.render)}</ul>
            {b.itens.length > 40 && <p className="text-xs text-slate-500">e mais {b.itens.length - 40} — conclua estes e eles aparecem aqui.</p>}
          </Painel>
        ))}
      </div>

      {total > 0 && emDia.length > 0 && (
        <p className="flex flex-wrap items-center gap-1.5 text-xs text-slate-500">
          <Check size={14} className="text-emerald-600" /> Em dia: {emDia.map((b) => b.titulo.toLowerCase()).join(' · ')}.
        </p>
      )}
      {desfecho && <DesfechoModal reuniao={desfecho} onFechar={() => setDesfecho(null)} onFeito={() => { setDesfecho(null); onMudou(); }} />}
    </div>
  );
}

// ---------------------------------------------------------------------------
// SUPERVISÃO
// ---------------------------------------------------------------------------
function janelaAtual() {
  const h = new Date().getHours() + new Date().getMinutes() / 60;
  return h < 11 ? 'abertura' : h < 15.5 ? 'meio' : 'fechamento';
}

export function VistaSupervisao({ painel, cfg, onAbrir, onMudou }) {
  const admin = !!(cfg.eu?.gestor ?? cfg.eu?.admin);
  const [modal, setModal] = useState(null);
  const [erro, setErro] = useState('');
  async function concluir(acao) {
    setErro('');
    try { await api.put('/comercial/acoes/' + acao.id, { status: 'feita' }); onMudou(); } catch (err) { setErro(mensagemDeErro(err)); }
  }
  return (
    <div className="space-y-4">
      <p className="max-w-3xl text-sm text-slate-500">
        Três checagens por dia: 8h30 (abertura), 12h30 (meio do dia) e 17h (fechamento). Verde: atividade do dia em dia.
        Amarelo: entre 70% e 99%. Vermelho: abaixo de 70% — conversa de 5 minutos para tirar o bloqueio. Cada checagem
        fica registrada com o semáforo do momento e o que foi combinado.
      </p>
      <Erro>{erro}</Erro>
      {painel.sem_dono > 0 && (
        <div className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
          {painel.sem_dono} cartório(s) ativo(s) sem responsável.
        </div>
      )}
      {!painel.supervisao.length && <Vazio>Ninguém com cartórios ativos ainda. Defina responsáveis no Funil ou metas por pessoa em Metas.</Vazio>}
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {painel.supervisao.map((s) => (
          <Painel key={s.pessoa.id} titulo={s.pessoa.nome} extra={<span className="flex items-center gap-1"><Pill nivel={s.sinal}>{s.rotulo}</Pill><Dica termo="semaforo" /></span>}>
            <div className="grid grid-cols-4 gap-2 text-center">
              <Num rotulo="Feitos" valor={s.feitos} meta={s.meta_toques || null} />
              <Num rotulo={<>Conexões <Dica termo="conexao" /></>} valor={s.conexoes} />
              <Num rotulo="Pendentes" valor={s.pendentes} />
              {s.meta_novos ? <Num rotulo="Novos" valor={s.novos} meta={s.meta_novos} /> : <Num rotulo="Atualiz." valor={s.atualizados_hoje} />}
            </div>
            <Barra pct={Math.max(4, s.indice)} nivel={s.sinal} />
            <div className="flex items-center gap-2 text-xs text-slate-500">
              <ClipboardCheck size={14} /><Dica termo="checagem" />
              {Object.entries(cfg.janelas).map(([k, n]) => {
                const c = s.checagens.find((x) => x.janela === k);
                return (
                  <span key={k} title={c ? `${n} · ${c.gestor_nome || ''}${c.observacao ? ' — ' + c.observacao : ''}` : `${n} · não feita`}
                    className={`rounded px-1.5 py-0.5 ${c ? (c.sinal === 'ok' ? 'bg-emerald-100 text-emerald-800' : c.sinal === 'warn' ? 'bg-amber-100 text-amber-800' : 'bg-red-100 text-red-800') : 'bg-slate-100 text-slate-400'}`}>
                    {n.split(' ')[0]}
                  </span>
                );
              })}
              {admin && <button type="button" className={linkMini + ' ml-auto'} onClick={() => setModal({ tipo: 'checagem', sup: s })}>registrar checagem</button>}
            </div>
            {s.alertas.length ? (
              <ul className="divide-y divide-slate-100">
                {s.alertas.slice(0, 8).map((a, i) => (
                  <li key={a.lead.id + i} className="flex items-center gap-2 py-1.5">
                    <div className="min-w-0 flex-1"><NomeLead lead={a.lead} onAbrir={onAbrir} /><p className="text-xs text-slate-500">{a.motivo}</p></div>
                    <Pill nivel="crit">agir</Pill>
                  </li>
                ))}
                {s.alertas.length > 8 && <li className="py-1.5 text-xs text-slate-500">e mais {s.alertas.length - 8} alerta(s)</li>}
              </ul>
            ) : <Vazio>Sem alertas.</Vazio>}
            {s.acoes.length > 0 && (
              <div className="space-y-1 border-t border-slate-100 pt-2">
                <p className="text-[11px] font-medium uppercase tracking-wide text-slate-500">Plano de ação</p>
                {s.acoes.map((a) => (
                  <div key={a.id} className="flex items-center gap-2 text-sm">
                    <span className="min-w-0 flex-1">{a.acao}</span>
                    <Pill nivel={a.vencida ? 'crit' : 'neu'}>{a.vencida ? 'venceu ' : 'até '}{dataBr(a.prazo)}</Pill>
                    {(admin || a.pessoa_id === cfg.eu?.id) && <button type="button" className={linkMini} onClick={() => concluir(a)}>feita</button>}
                  </div>
                ))}
              </div>
            )}
            <div className="flex items-center justify-between text-xs text-slate-400">
              <span>{s.ativos} cartório(s) ativo(s)</span>
              {admin && <button type="button" className={linkMini + ' inline-flex items-center gap-1'} onClick={() => setModal({ tipo: '1a1', sup: s })}><Users size={12} /> registrar 1:1</button>}
            </div>
          </Painel>
        ))}
      </div>
      {modal?.tipo === 'checagem' && <ChecagemModal cfg={cfg} sup={modal.sup} janela={janelaAtual()} onFechar={() => setModal(null)} onFeito={() => { setModal(null); onMudou(); }} />}
      {modal?.tipo === '1a1' && <UmAUmModal sup={modal.sup} hoje={cfg.hoje} onFechar={() => setModal(null)} onFeito={() => { setModal(null); onMudou(); }} />}
    </div>
  );
}

function Num({ rotulo, valor, meta }) {
  return (
    <div className="flex flex-col">
      <span className="text-[10px] font-medium uppercase tracking-wide text-slate-500">{rotulo}</span>
      <b className="text-xl tabular-nums text-slate-900">{valor}{meta ? <small className="text-xs font-normal text-slate-400">/{meta}</small> : null}</b>
    </div>
  );
}

// ---------------------------------------------------------------------------
// METAS
// ---------------------------------------------------------------------------
const CAMPOS_META = [
  ['metaClientes', 'Meta de clientes pagos/mês'], ['ticket', 'Ticket médio (R$/mês)'], ['diasUteis', 'Dias úteis no mês'],
  ['taxaContatoDiag', 'Contato → reunião (%)'], ['taxaDiagTrial', 'Reunião → proposta (%)'], ['taxaTrialPago', 'Proposta → pago (%)'],
  ['metaNovosDia', 'Novos na cadência/dia (equipe)'], ['metaToquesDia', 'Toques/dia (equipe)'],
];
const CAMPOS_PESSOA = [['novosDia', 'Novos/dia'], ['toquesDia', 'Toques/dia'], ['reunioesMes', 'Reuniões/mês'], ['pagosMes', 'Pagos/mês']];

export function VistaMetas({ painel, cfg, onSalvo }) {
  const admin = !!(cfg.eu?.gestor ?? cfg.eu?.admin);
  const mes = painel.hoje.slice(0, 7);
  const [form, setForm] = useState(null);
  const [salvando, setSalvando] = useState(false);
  const [msg, setMsg] = useState('');
  useEffect(() => {
    const { _mes_origem, _dias_uteis_calculados, novosPorPessoa, ...v } = painel.metas; // eslint-disable-line no-unused-vars
    const pp = { ...(v.porPessoa || {}) };
    Object.entries(novosPorPessoa || {}).forEach(([k, n]) => { pp[k] = { novosDia: n, ...(pp[k] || {}) }; });
    setForm({ ...v, porPessoa: pp });
  }, [painel.metas]);
  if (!form) return null;

  const t = (form.taxaTrialPago / 100) * (form.taxaDiagTrial / 100) * (form.taxaContatoDiag / 100);
  const contatos = t > 0 ? form.metaClientes / t : NaN;
  const n = painel.numeros;
  const cmp = (tx) => (tx.real == null ? <Pill nivel="line">sem dados</Pill>
    : <Pill nivel={tx.real >= tx.meta ? 'ok' : tx.real >= tx.meta * 0.7 ? 'warn' : 'crit'}>{pct(tx.real)}</Pill>);
  const maxMot = Math.max(1, ...n.motivos_perda.map((x) => x.n));
  const setPP = (pid, k, v) => setForm({ ...form, porPessoa: { ...form.porPessoa, [pid]: { ...(form.porPessoa[pid] || {}), [k]: v === '' ? 0 : Number(v) } } });

  async function salvar() {
    setMsg('');
    // Campo do mês vazio vira erro claro (antes ia '' e o servidor lia 0).
    const vazio = CAMPOS_META.find(([k]) => form[k] === '' || form[k] == null);
    if (vazio) { setMsg(`Preencha "${vazio[1]}".`); return; }
    const corpo = Object.fromEntries(Object.entries(form).filter(([k]) => !k.startsWith('_')));
    // Meta individual vazia = 0 (sem meta para aquela pessoa)
    corpo.porPessoa = Object.fromEntries(Object.entries(form.porPessoa || {}).map(([pid, v]) => [pid,
      Object.fromEntries(Object.entries(v || {}).map(([k, x]) => [k, x === '' || x == null ? 0 : Number(x)]))]));
    setSalvando(true);
    try { await api.put('/comercial/metas/' + mes, corpo); setMsg('Metas salvas.'); onSalvo(); } catch (err) { setMsg(mensagemDeErro(err)); } finally { setSalvando(false); }
  }

  return (
    <div className="grid gap-4 xl:grid-cols-2">
      <Painel titulo={`Metas · ${mes.split('-').reverse().join('/')}`} extra={!admin && <Pill nivel="line">só a gestão altera</Pill>}>
        <p className="text-sm text-slate-500">A meta de clientes PAGOS vira contatos por dia, de trás para frente. Comece com as taxas do plano e troque pelas reais depois de 30 dias. Dias úteis do mês, já sem feriados: {painel.metas._dias_uteis_calculados}.</p>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          {CAMPOS_META.map(([k, r]) => (
            <Campo key={k} rotulo={r}>
              <input type="number" min="0" step="any" disabled={!admin} className={inputCls} value={form[k]} onChange={(e) => setForm({ ...form, [k]: e.target.value === '' ? '' : Number(e.target.value) })} />
            </Campo>
          ))}
        </div>
        <div className="overflow-x-auto">
          <p className="mb-2 text-xs font-medium text-slate-600">Metas por pessoa (alimentam o semáforo e o placar)</p>
          <table className="w-full text-sm">
            <thead className="text-left text-[11px] uppercase tracking-wide text-slate-500"><tr><th className="py-1 pr-2">Pessoa</th>{CAMPOS_PESSOA.map(([k, r]) => <th key={k} className="py-1 pr-2">{r}</th>)}</tr></thead>
            <tbody>
              {cfg.pessoas.map((p) => (
                <tr key={p.id}>
                  <td className="py-1 pr-2">{p.nome}</td>
                  {CAMPOS_PESSOA.map(([k]) => (
                    <td key={k} className="py-1 pr-2"><input type="number" min="0" disabled={!admin} className={inputCls + ' !w-20'} value={form.porPessoa[p.id]?.[k] || ''} onChange={(e) => setPP(p.id, k, e.target.value)} /></td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <dl className="grid grid-cols-2 gap-x-4 gap-y-1 border-t border-slate-100 pt-3 text-sm">
          <dt className="text-slate-500">Contatos por dia útil</dt><dd className="text-right text-lg font-semibold">{isFinite(contatos) ? Math.ceil(contatos / (form.diasUteis || 21)) : '—'}</dd>
          <dt className="text-slate-500">Contatos no mês</dt><dd className="text-right font-semibold">{isFinite(contatos) ? Math.ceil(contatos) : '—'}</dd>
          <dt className="text-slate-500">Reuniões no mês</dt><dd className="text-right font-semibold">{form.taxaTrialPago && form.taxaDiagTrial ? Math.ceil(form.metaClientes / ((form.taxaTrialPago / 100) * (form.taxaDiagTrial / 100))) : '—'}</dd>
          <dt className="text-slate-500">Propostas no mês</dt><dd className="text-right font-semibold">{form.taxaTrialPago ? Math.ceil(form.metaClientes / (form.taxaTrialPago / 100)) : '—'}</dd>
          <dt className="text-slate-500">Receita recorrente nova esperada</dt><dd className="text-right font-semibold">{brl(form.metaClientes * (form.ticket || 0))}/mês</dd>
        </dl>
        {admin && (
          <div className="flex items-center gap-3">
            <button type="button" className={btnPrimCls} onClick={salvar} disabled={salvando}>{salvando ? 'Salvando…' : 'Salvar metas do mês'}</button>
            {msg && <span className="text-sm text-slate-600">{msg}</span>}
          </div>
        )}
        {painel.metas._mes_origem && painel.metas._mes_origem !== mes && (
          <p className="text-xs text-amber-700">Este mês ainda usa as metas de {painel.metas._mes_origem}. Salve para fixar as deste mês.</p>
        )}
      </Painel>

      <Painel titulo={<span className="flex items-center gap-1">Taxas reais do funil <Dica texto="De cada 100 cartórios que chegam a uma etapa, quantos passam para a seguinte. Verde: igual ou acima da meta; amarelo: até 30% abaixo; vermelho: mais que isso." /></span>} extra={<span className="text-xs text-slate-400">desde o início do registro</span>}>
        <table className="w-full text-sm">
          <thead className="text-left text-xs uppercase tracking-wide text-slate-500">
            <tr><th className="py-1">Passagem</th><th className="py-1 text-right">Volume</th><th className="py-1 text-right">Real</th><th className="py-1 text-right">Meta</th></tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {[['Contato → reunião', n.taxas.contato_diag], ['Reunião → proposta', n.taxas.diag_proposta], ['Proposta → assinado', n.taxas.proposta_ganho], ['Assinado → pago', n.taxas.assinado_pago]].map(([r, tx]) => (
              <tr key={r}><td className="py-1.5">{r}</td><td className="py-1.5 text-right font-mono">{tx.para}/{tx.de}</td><td className="py-1.5 text-right">{cmp(tx)}</td><td className="py-1.5 text-right font-mono">{tx.meta}%</td></tr>
            ))}
          </tbody>
        </table>
        <dl className="grid grid-cols-2 gap-x-4 gap-y-1 border-t border-slate-100 pt-3 text-sm">
          <dt className="text-slate-500">Clientes pagos no mês</dt><dd className="text-right font-semibold">{n.pagos_mes} / {painel.metas.metaClientes}</dd>
          <dt className="text-slate-500">Assinados no mês</dt><dd className="text-right font-semibold">{n.assinados_mes}</dd>
          <dt className="text-slate-500">Receita recorrente nova (paga)</dt><dd className="text-right font-semibold">{brl(n.receita_nova_mes)}</dd>
          <dt className="text-slate-500">Propostas abertas</dt><dd className="text-right font-semibold">{n.propostas}</dd>
        </dl>
        <div className="flex items-center justify-between border-t border-slate-100 pt-3">
          <h3 className="text-sm font-semibold text-slate-900">Motivos de perda</h3>
          <span className="text-xs text-slate-400">{n.perdidos} perdido(s)</span>
        </div>
        {n.motivos_perda.length ? (
          <div className="space-y-2">
            {n.motivos_perda.map((x) => (
              <div key={x.motivo} className="grid grid-cols-[140px_1fr_32px] items-center gap-2 text-sm">
                <span className="truncate">{x.motivo}</span><Barra pct={(x.n / maxMot) * 100} nivel="crit" /><span className="text-right font-mono">{x.n}</span>
              </div>
            ))}
          </div>
        ) : <Vazio>Nenhuma perda registrada ainda.</Vazio>}
      </Painel>
    </div>
  );
}

// ---------------------------------------------------------------------------
// PLACAR (atividade × resultado por pessoa)
// ---------------------------------------------------------------------------
function periodo(tipo, hoje) {
  const d = new Date(hoje + 'T12:00:00'); const iso = (x) => x.toISOString().slice(0, 10);
  if (tipo === 'semana') { const a = new Date(d); a.setDate(a.getDate() - 6); return [iso(a), hoje]; }
  if (tipo === 'mes_anterior') { const a = new Date(d.getFullYear(), d.getMonth() - 1, 1, 12); const b = new Date(d.getFullYear(), d.getMonth(), 0, 12); return [iso(a), iso(b)]; }
  return [hoje.slice(0, 8) + '01', hoje];
}

const DICAS_PLACAR = {
  conexoes: 'Toques em que a pessoa falou com alguém (atendeu, agendou, pediu retorno, recusou, respondeu).',
  taxa_conexao: 'Conexões ÷ toques. Baixa = problema de horário, lista ou telefone errado.',
  taxa_comparecimento: 'Reuniões realizadas ÷ (realizadas + faltou). Baixa = confirmar a reunião na véspera.',
  assinados: 'Clientes que aceitaram (etapa Ganho) no período.',
  pagos: 'Clientes com o 1º pagamento confirmado no período. É o que conta na meta.',
  estornos: 'Registros corrigidos. Muitos estornos = registro feito com pressa.',
  checagens: 'Quantas checagens diárias a gestão registrou para a pessoa.',
  acoes_vencidas: 'Ações do plano (1:1) com prazo vencido e não feitas.',
};

export function VistaPlacar({ cfg, painel, versao }) {
  const [tipo, setTipo] = useState('mes');
  const [dados, setDados] = useState(null);
  const [erro, setErro] = useState('');
  useEffect(() => {
    const [de, ate] = periodo(tipo, cfg.hoje);
    api.get('/comercial/placar', { params: { de, ate } }).then((r) => setDados(r.data)).catch((err) => setErro(mensagemDeErro(err)));
  }, [tipo, cfg.hoje, versao]);
  const metas = painel?.metas?.porPessoa || {};
  const col = [
    ['toques', 'Toques'], ['conexoes', 'Conexões'], ['taxa_conexao', '% conexão'], ['reunioes_agendadas', 'Reuniões agend.'],
    ['reunioes_realizadas', 'Realizadas'], ['reunioes_faltou', 'Faltou'], ['taxa_comparecimento', '% compar.'],
    ['propostas', 'Propostas'], ['assinados', 'Assinados'], ['pagos', 'Pagos'], ['receita', 'Receita'], ['perdidos', 'Perdidos'],
    ['estornos', 'Estornos'], ['checagens', 'Checagens'], ['acoes_vencidas', 'Ações venc.'],
  ];
  const fmt = (k, v) => (k.startsWith('taxa') ? pct(v) : k === 'receita' ? brl(v) : v);
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <select className={inputCls + ' !w-auto'} value={tipo} onChange={(e) => setTipo(e.target.value)}>
          <option value="mes">Este mês</option><option value="semana">Últimos 7 dias</option><option value="mes_anterior">Mês anterior</option>
        </select>
        {dados && <span className="text-sm text-slate-500">{dataBr(dados.de)} a {dataBr(dados.ate)}</span>}
      </div>
      <Erro>{erro}</Erro>
      <div className="overflow-x-auto rounded-lg border border-slate-200 bg-white">
        <table className="w-full whitespace-nowrap text-sm">
          <thead className="bg-slate-50 text-left text-[11px] uppercase tracking-wide text-slate-500">
            <tr><th className="sticky left-0 bg-slate-50 px-3 py-2">Pessoa</th>{col.map(([k, r]) => (
              <th key={k} className="px-2 py-2 text-right">{r}{DICAS_PLACAR[k] && <Dica className="ml-0.5" texto={DICAS_PLACAR[k]} />}</th>
            ))}</tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {(dados?.linhas || []).map((l) => {
              const mp = metas[l.id] || {};
              return (
                <tr key={l.id}>
                  <td className="sticky left-0 bg-white px-3 py-2 font-medium">{l.nome}</td>
                  {col.map(([k]) => {
                    const meta = k === 'pagos' && tipo === 'mes' ? mp.pagosMes : k === 'reunioes_realizadas' && tipo === 'mes' ? mp.reunioesMes : null;
                    const ruim = (k === 'estornos' && l[k] > 2) || (k === 'acoes_vencidas' && l[k] > 0) || (meta && l[k] < meta);
                    return (
                      <td key={k} className={`px-2 py-2 text-right tabular-nums ${ruim ? 'font-semibold text-red-700' : ''}`}>
                        {fmt(k, l[k])}{meta ? <span className="text-xs font-normal text-slate-400">/{meta}</span> : null}
                      </td>
                    );
                  })}
                </tr>
              );
            })}
            {dados && !dados.linhas.length && <tr><td colSpan={col.length + 1} className="px-3 py-4 text-sm text-slate-500">Sem atividade no período.</td></tr>}
          </tbody>
        </table>
      </div>
      <p className="text-xs text-slate-400">Conexão = falou com alguém (atendeu, agendou, pediu retorno, recusou, respondeu). Comparecimento = realizadas ÷ (realizadas + faltou). Pagos e receita só contam com o 1º pagamento confirmado.</p>
    </div>
  );
}

// ---------------------------------------------------------------------------
// CONTROLES (não contatar, rotina da gestão, feriados)
// ---------------------------------------------------------------------------
export function VistaControles({ cfg, onMudou }) {
  const admin = !!(cfg.eu?.gestor ?? cfg.eu?.admin);
  return (
    <div className="grid gap-4 xl:grid-cols-2">
      <NaoContatar cfg={cfg} admin={admin} onMudou={onMudou} />
      <div className="space-y-4">
        {cfg.eu?.admin && <Gestores cfg={cfg} />}
        <Rotina cfg={cfg} />
        <Feriados cfg={cfg} admin={admin} />
      </div>
    </div>
  );
}

function NaoContatar({ cfg, admin, onMudou }) {
  const [lista, setLista] = useState([]);
  const [busca, setBusca] = useState('');
  const [f, setF] = useState({ tipo: 'email', valor: '', motivo: 'descadastro', observacao: '' });
  const [lote, setLote] = useState('');
  const [msg, setMsg] = useState('');
  const carregar = () => api.get('/comercial/nao-contatar', { params: busca ? { busca } : {} }).then((r) => setLista(r.data)).catch(() => {});
  useEffect(() => { const t = setTimeout(carregar, 300); return () => clearTimeout(t); }, [busca]); // eslint-disable-line

  async function incluir(corpo) {
    setMsg('');
    try { const r = await api.post('/comercial/nao-contatar', corpo); setMsg(`${r.data.incluidos} incluído(s)${r.data.ja_existiam ? `, ${r.data.ja_existiam} já existiam` : ''}.`); setF({ ...f, valor: '', observacao: '' }); setLote(''); carregar(); onMudou(); } catch (err) { setMsg(mensagemDeErro(err)); }
  }
  function incluirLote() {
    const itens = lote.split(/[\n;,]+/).map((x) => x.trim()).filter(Boolean).map((v) => ({
      tipo: v.includes('@') ? 'email' : v.replace(/\D/g, '').length === 14 ? 'cnpj' : v.replace(/\D/g, '').length <= 7 ? 'cns' : 'telefone',
      valor: v, motivo: f.motivo,
    }));
    if (itens.length) incluir({ itens });
  }
  const [confirmar, setConfirmar] = useState(null);
  async function remover(id) {
    setConfirmar(null);
    try { await api.delete('/comercial/nao-contatar/' + id); setMsg('Removido da lista. O contato volta a poder ser cadastrado.'); carregar(); onMudou(); } catch (err) { setMsg(mensagemDeErro(err)); }
  }
  return (
    <Painel titulo="Lista de não contatar (LGPD / descadastro)" extra={<Pill nivel="line">{lista.length}</Pill>}>
      <p className="text-sm text-slate-500">Quem está aqui não pode ser cadastrado, importado nem contatado. Qualquer pessoa da equipe inclui; só a gestão remove (fica registrado).</p>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-[110px_1fr_200px]">
        <select className={inputCls} value={f.tipo} onChange={(e) => setF({ ...f, tipo: e.target.value })}>
          {['email', 'dominio', 'telefone', 'cns', 'cnpj'].map((t) => <option key={t} value={t}>{t === 'dominio' ? 'domínio' : t.toUpperCase() === 'CNS' || t === 'cnpj' ? t.toUpperCase() : t}</option>)}
        </select>
        <input className={inputCls} placeholder="valor" value={f.valor} onChange={(e) => setF({ ...f, valor: e.target.value })} />
        <select className={inputCls} value={f.motivo} onChange={(e) => setF({ ...f, motivo: e.target.value })}>
          {Object.entries(cfg.motivos_nao_contatar).map(([k, n]) => <option key={k} value={k}>{n}</option>)}
        </select>
      </div>
      <div className="flex gap-2">
        <button type="button" className={btnPrimCls} onClick={() => f.valor && incluir({ ...f, observacao: f.observacao || null })}>Incluir</button>
      </div>
      <details className="text-sm">
        <summary className="cursor-pointer text-nexus-700">Incluir em lote (descadastros do Instantly, por exemplo)</summary>
        <textarea className={inputCls + ' mt-2 min-h-[80px] font-mono text-xs'} placeholder="um por linha: e-mail, telefone, CNS ou CNPJ" value={lote} onChange={(e) => setLote(e.target.value)} />
        <button type="button" className={btnCls + ' mt-2'} onClick={incluirLote}>Incluir lote com o motivo escolhido acima</button>
      </details>
      {msg && <p className="text-sm text-slate-600">{msg}</p>}
      <input className={inputCls} placeholder="Buscar" value={busca} onChange={(e) => setBusca(e.target.value)} />
      <ul className="max-h-80 divide-y divide-slate-100 overflow-y-auto">
        {lista.map((x) => (
          <li key={x.id} className="flex items-start gap-2 py-1.5 text-sm">
            <span className="w-16 shrink-0 pt-0.5 text-[10px] uppercase text-slate-400">{x.tipo}</span>
            <div className="min-w-0 flex-1">
              <p className="break-all font-mono text-xs text-slate-800">{x.valor}</p>
              <p className="text-xs text-slate-500">{cfg.motivos_nao_contatar[x.motivo]} · {x.criado_por_nome} · {new Date(x.criado_em).toLocaleDateString('pt-BR')}</p>
            </div>
            {admin && (confirmar === x.id ? (
              <span className="flex shrink-0 items-center gap-2 text-xs">
                <span className="text-slate-600">Remover? A pessoa pediu para não ser contatada.</span>
                <button type="button" className="font-medium text-red-700 hover:underline" onClick={() => remover(x.id)}>sim, remover</button>
                <button type="button" className="text-slate-500 hover:underline" onClick={() => setConfirmar(null)}>não</button>
              </span>
            ) : <button type="button" className="text-xs text-red-700 hover:underline" onClick={() => setConfirmar(x.id)}>remover</button>)}
          </li>
        ))}
      </ul>
    </Painel>
  );
}

/** Quem faz a gestão comercial (checagens, 1:1, metas, arquivar). Só o admin define. */
function Gestores({ cfg }) {
  const [sel, setSel] = useState(null);
  const [msg, setMsg] = useState('');
  useEffect(() => {
    api.get('/comercial/gestores').then((r) => setSel(new Set(r.data.map((g) => g.pessoa_id)))).catch((err) => setMsg(mensagemDeErro(err)));
  }, []);
  if (!sel) return null;
  const alternar = (id) => { const n = new Set(sel); if (n.has(id)) n.delete(id); else n.add(id); setSel(n); setMsg(''); };
  async function salvar() {
    try { await api.put('/comercial/gestores', { pessoas: [...sel] }); setMsg('Salvo. Vale a partir da próxima tela que a pessoa abrir.'); } catch (err) { setMsg(mensagemDeErro(err)); }
  }
  return (
    <Painel titulo="Gestão comercial" extra={<Pill nivel="line">{sel.size}</Pill>}>
      <p className="text-sm text-slate-500">
        Quem faz a gestão do dia sem ser administrador do Nexus: registra checagens e 1:1, define metas, arquiva,
        troca responsável e força etapa com justificativa. Não vê o financeiro. Confirmar pagamento continua só com o administrador.
      </p>
      <ul className="grid gap-1 sm:grid-cols-2">
        {cfg.pessoas.filter((p) => p.id !== cfg.eu.id).map((p) => (
          <li key={p.id}>
            <label className="flex cursor-pointer items-center gap-2 text-sm text-slate-700">
              <input type="checkbox" className="h-4 w-4 rounded border-slate-300 text-nexus-700" checked={sel.has(p.id)} onChange={() => alternar(p.id)} />
              {p.nome}
            </label>
          </li>
        ))}
      </ul>
      <div className="flex items-center gap-2">
        <button type="button" className={btnPrimCls} onClick={salvar}>Salvar</button>
        {msg && <span className="text-sm text-slate-600">{msg}</span>}
      </div>
    </Painel>
  );
}

function Rotina({ cfg }) {
  const [dados, setDados] = useState(null);
  const [umas, setUmas] = useState([]);
  useEffect(() => {
    api.get('/comercial/checagens').then((r) => setDados(r.data)).catch(() => {});
    api.get('/comercial/1a1').then((r) => setUmas(r.data)).catch(() => {});
  }, []);
  if (!dados) return null;
  const feriados = new Set((cfg.feriados || []).map((x) => x.data));
  // Últimos 10 dias úteis + qualquer dia (fim de semana, feriado) que teve checagem
  const comChecagem = new Set(dados.checagens.map((c) => c.data));
  const dias = [];
  for (let d = new Date(dados.ate + 'T12:00:00'); dias.length < 10; d.setDate(d.getDate() - 1)) {
    const iso = d.toISOString().slice(0, 10); const w = d.getDay();
    if ((w !== 0 && w !== 6 && !feriados.has(iso)) || comChecagem.has(iso)) dias.push(iso);
    if (iso < dados.de) break;
  }
  const pessoas = [...new Map(dados.checagens.map((c) => [c.pessoa_id, c.pessoa_nome])).entries()];
  const cor = { ok: 'bg-emerald-400', warn: 'bg-amber-400', crit: 'bg-red-500' };
  return (
    <Painel titulo="Cumprimento da rotina da gestão" extra={<span className="text-xs text-slate-400">últimos dias úteis · 3 checagens/dia</span>}>
      {!pessoas.length ? <Vazio>Nenhuma checagem registrada ainda. Registre pela aba Supervisão.</Vazio> : (
        <div className="overflow-x-auto">
          <table className="text-xs">
            <thead><tr><th className="pr-3 text-left font-medium text-slate-500">Pessoa</th>{dias.slice().reverse().map((d) => <th key={d} className="px-1 font-normal text-slate-400">{dataBr(d)}</th>)}</tr></thead>
            <tbody>
              {pessoas.map(([pid, nome]) => (
                <tr key={pid}>
                  <td className="pr-3 py-1">{nome}</td>
                  {dias.slice().reverse().map((d) => (
                    <td key={d} className="px-1 py-1">
                      <div className="flex gap-0.5">
                        {Object.keys(cfg.janelas).map((j) => {
                          const c = dados.checagens.find((x) => x.pessoa_id === pid && x.data === d && x.janela === j);
                          return <span key={j} title={c ? `${cfg.janelas[j]} · ${c.gestor_nome}${c.observacao ? ' — ' + c.observacao : ''}` : `${cfg.janelas[j]} · não feita`} className={`h-3 w-2 rounded-sm ${c ? cor[c.sinal] : 'bg-slate-200'}`} />;
                        })}
                      </div>
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <div className="border-t border-slate-100 pt-2">
        <p className="mb-1 text-[11px] font-medium uppercase tracking-wide text-slate-500">Últimos 1:1</p>
        {!umas.length ? <Vazio>Nenhum 1:1 registrado.</Vazio> : (
          <ul className="space-y-2 text-sm">
            {umas.slice(0, 8).map((u) => (
              <li key={u.id}>
                <b>{u.pessoa_nome}</b> · {dataBr(u.data)} · {u.gestor_nome}
                <p className="text-xs text-slate-600">{u.combinados}</p>
                {u.acoes.length > 0 && <p className="text-xs text-slate-500">{u.acoes.map((a) => `${a.acao} (${dataBr(a.prazo)}, ${a.status})`).join(' · ')}</p>}
              </li>
            ))}
          </ul>
        )}
      </div>
    </Painel>
  );
}

function Feriados({ cfg, admin }) {
  const [lista, setLista] = useState(cfg.feriados || []);
  const [f, setF] = useState({ data: '', nome: '', abrangencia: 'municipal' });
  const [msg, setMsg] = useState('');
  async function incluir() {
    setMsg('');
    try { await api.post('/comercial/feriados', f); setLista([...lista.filter((x) => x.data !== f.data), { ...f }].sort((a, b) => (a.data < b.data ? -1 : 1))); setF({ data: '', nome: '', abrangencia: 'municipal' }); } catch (err) { setMsg(mensagemDeErro(err)); }
  }
  async function remover(d) {
    try { await api.delete('/comercial/feriados/' + d); setLista(lista.filter((x) => x.data !== d)); } catch (err) { setMsg(mensagemDeErro(err)); }
  }
  return (
    <Painel titulo="Feriados" extra={<span className="text-xs text-slate-400">contam fora dos dias úteis da cadência e das metas</span>}>
      {admin && (
        <div className="grid grid-cols-[130px_1fr_auto] gap-2">
          <input type="date" className={inputCls} value={f.data} onChange={(e) => setF({ ...f, data: e.target.value })} />
          <input className={inputCls} placeholder="nome (ex.: Círio — ponto facultativo)" value={f.nome} onChange={(e) => setF({ ...f, nome: e.target.value })} />
          <button type="button" className={btnCls} onClick={incluir} disabled={!f.data || !f.nome}>Incluir</button>
        </div>
      )}
      {msg && <p className="text-sm text-red-700">{msg}</p>}
      <ul className="max-h-60 divide-y divide-slate-100 overflow-y-auto text-sm">
        {lista.map((x) => (
          <li key={x.data} className="flex items-center gap-2 py-1">
            <span className="w-20 font-mono text-xs">{dataBr(x.data)}/{x.data.slice(2, 4)}</span>
            <span className="flex-1">{x.nome}</span>
            <span className="text-xs text-slate-400">{x.abrangencia}</span>
            {admin && <button type="button" className="text-xs text-red-700 hover:underline" onClick={() => remover(x.data)}>remover</button>}
          </li>
        ))}
      </ul>
    </Painel>
  );
}


// ---------------------------------------------------------------------------
// IMPLANTAÇÃO (clientes assinados, até o pós-venda)
// ---------------------------------------------------------------------------
export function VistaImplantacao({ painel, cfg, onAbrir }) {
  const rows = painel.implantacoes || [];
  if (!rows.length) {
    return (
      <Painel titulo="Nenhum cliente em implantação">
        <Vazio>Quando um cartório assina (etapa Ganho), a implantação começa: onboarding, treinamento e ativação, bot no ar, checagem de uso e pós-venda aos 30 dias.</Vazio>
      </Painel>
    );
  }
  return (
    <div className="space-y-3">
      <p className="text-sm text-slate-500">Implantação assistida: treinamento e ativação em até 48 horas. Pontos de uso: 60 ou mais no dia 7 está no caminho; abaixo de 40, ligue no mesmo dia.</p>
      <div className="overflow-x-auto rounded-lg border border-slate-200 bg-white">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
            <tr><th className="px-3 py-2">Cartório</th><th className="px-3 py-2">Dia</th><th className="px-3 py-2">Uso</th><th className="px-3 py-2">Próximo marco</th><th className="px-3 py-2">Pagamento</th><th className="px-3 py-2">Situação</th></tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {rows.map((t) => (
              <tr key={t.lead.id}>
                <td className="px-3 py-2">
                  <NomeLead lead={t.lead} onAbrir={onAbrir} />
                  <div className="text-xs text-slate-500">{[t.lead.cidade, t.lead.uf].filter(Boolean).join('/')}{t.lead.dono_nome ? ' · ' + t.lead.dono_nome : ''}</div>
                </td>
                <td className="px-3 py-2 font-mono">D{t.dia}<span className="text-slate-400">/30</span></td>
                <td className="min-w-[140px] px-3 py-2">
                  <div className="flex items-center gap-2"><div className="flex-1"><Barra pct={t.pontos} nivel={nivelPontos(t.pontos)} /></div><span className="font-mono text-xs">{t.pontos}</span></div>
                </td>
                <td className="px-3 py-2 text-xs">{t.proximo_marco ? <>D{t.proximo_marco.d} · {t.proximo_marco.n} <span className={t.proximo_marco.atrasado ? 'text-red-700' : 'text-slate-400'}>({dataBr(t.proximo_marco.previsto)})</span></> : 'Concluída'}</td>
                <td className="px-3 py-2">{t.pago_em ? <Pill nivel="ok">pago {dataBr(t.pago_em)}</Pill> : <Pill nivel="warn">aguardando</Pill>}</td>
                <td className="px-3 py-2"><Pill nivel={t.nivel}>{t.texto}</Pill></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}


// ---------------------------------------------------------------------------
// SCRIPTS
// ---------------------------------------------------------------------------
export function VistaScripts({ cfg }) {
  const [copiado, setCopiado] = useState(null);
  async function copiar(i) {
    try { await navigator.clipboard.writeText(SCRIPTS[i].texto); setCopiado(i); setTimeout(() => setCopiado(null), 1500); } catch { /* sem clipboard */ }
  }
  return (
    <div className="space-y-4">
      <p className="text-sm text-slate-500">Roteiros, não falas decoradas: adapte as palavras, mantenha a ordem. Troque os campos entre colchetes antes de enviar.</p>
      <div className="grid gap-4 lg:grid-cols-2">
        {SCRIPTS.map((s, i) => (
          <Painel key={s.titulo} titulo={s.titulo} extra={
            <button type="button" className={btnCls + ' !px-2 !py-1 text-xs'} onClick={() => copiar(i)}>
              {copiado === i ? <><Check size={12} /> Copiado</> : <><Copy size={12} /> Copiar</>}
            </button>
          }>
            <div className="whitespace-pre-wrap rounded-md bg-slate-50 p-3 text-sm leading-relaxed text-slate-700">{s.texto}</div>
          </Painel>
        ))}
      </div>
      <Painel titulo="Objeções">
        <table className="w-full text-sm">
          <thead className="text-left text-xs uppercase tracking-wide text-slate-500"><tr><th className="py-1 pr-4">Quando o cliente diz</th><th className="py-1">Responda</th></tr></thead>
          <tbody className="divide-y divide-slate-100">
            {OBJECOES.map(([a, b]) => <tr key={a}><td className="py-1.5 pr-4 align-top font-medium">“{a}”</td><td className="py-1.5">{b}</td></tr>)}
          </tbody>
        </table>
      </Painel>
      <Painel titulo="Cadência de 12 dias úteis">
        <table className="w-full text-sm">
          <thead className="text-left text-xs uppercase tracking-wide text-slate-500"><tr><th className="py-1 pr-4">Dia</th><th className="py-1 pr-4">Canal</th><th className="py-1">O que fazer</th></tr></thead>
          <tbody className="divide-y divide-slate-100">
            {cfg.cadencia.map((c) => <tr key={c.d}><td className="py-1.5 pr-4 font-mono">{c.d}</td><td className="py-1.5 pr-4">{c.canal}</td><td className="py-1.5">{c.acao}</td></tr>)}
          </tbody>
        </table>
      </Painel>
    </div>
  );
}
