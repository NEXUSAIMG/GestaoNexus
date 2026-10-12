import { useEffect, useState } from 'react';
import { Check, Copy } from 'lucide-react';
import { api, mensagemDeErro } from '../../api/client.js';
import {
  Pill, Barra, Painel, Vazio, Kpi, brl, pct, dataBr, nivelPontos, inputCls, btnPrimCls, btnCls, Campo, NomeLead,
} from './ui.jsx';
import { SCRIPTS, OBJECOES } from './scripts.js';

const nomeEtapa = (cfg, k) => cfg.etapas.find((e) => e.k === k)?.n || k;

// ---------------------------------------------------------------------------
// HOJE
// ---------------------------------------------------------------------------
export function VistaHoje({ painel, cfg, onAbrir, onToque }) {
  const { numeros: n, metas: m, hoje_listas: h } = painel;
  const dataExt = new Date(painel.hoje + 'T12:00:00').toLocaleDateString('pt-BR', { weekday: 'long', day: 'numeric', month: 'long' });
  return (
    <div className="space-y-4">
      <p className="text-sm text-slate-500">
        {dataExt.charAt(0).toUpperCase() + dataExt.slice(1)}. A gestão cobra a atividade; as taxas a gente ajusta no processo.
      </p>
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Kpi rotulo="Novos na cadência hoje" valor={n.novos_hoje} meta={m.metaNovosDia} />
        <Kpi rotulo="Toques feitos hoje" valor={n.toques_hoje} meta={m.metaToquesDia} />
        <Kpi rotulo="Trials ativos" valor={n.trials_ativos} sub={`${h.marcos.length} marco(s) para hoje`} />
        <Kpi rotulo="Ganhos no mês" valor={n.ganhos_mes} meta={m.metaClientes} sub={`${brl(n.receita_nova_mes)}/mês de receita nova`} />
      </div>
      {painel.sem_dono > 0 && (
        <div className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
          {painel.sem_dono} cartório(s) ativo(s) sem responsável. Defina o responsável no Funil para entrarem na supervisão.
        </div>
      )}
      <div className="grid gap-4 lg:grid-cols-2">
        <Painel titulo="Toques de cadência" extra={<Pill nivel="line">{h.toques.length} para fazer</Pill>}>
          {h.toques.length ? (
            <ul className="divide-y divide-slate-100">
              {h.toques.map((x) => (
                <li key={x.lead.id + '-' + x.d} className="flex items-start gap-3 py-2">
                  <div className="min-w-0 flex-1">
                    <NomeLead lead={x.lead} onAbrir={onAbrir} />
                    <p className="text-xs text-slate-500">
                      <b className="text-slate-700">Dia {x.d} · {x.canal}</b> — {x.acao}
                      {x.lead.dono_nome && <> · {x.lead.dono_nome}</>}
                      {x.atrasado && <> <Pill nivel="crit">atrasado desde {dataBr(x.previsto)}</Pill></>}
                    </p>
                  </div>
                  <button type="button" className={btnPrimCls + ' !px-2 !py-1 text-xs'} onClick={() => onToque(x.lead.id, 'cadencia', x.d)}>
                    <Check size={12} /> Feito
                  </button>
                </li>
              ))}
            </ul>
          ) : <Vazio>Nenhum toque pendente. Coloque mais cartórios em cadência no Funil: a meta é {m.metaNovosDia} novos por dia útil.</Vazio>}
        </Painel>

        <Painel titulo="Marcos de trial" extra={<Pill nivel="line">{h.marcos.length} para fazer</Pill>}>
          {h.marcos.length ? (
            <ul className="divide-y divide-slate-100">
              {h.marcos.map((x) => (
                <li key={x.lead.id + '-' + x.d} className="flex items-start gap-3 py-2">
                  <div className="min-w-0 flex-1">
                    <NomeLead lead={x.lead} onAbrir={onAbrir} />
                    <p className="text-xs text-slate-500">
                      <b className="text-slate-700">D{x.d} · {x.n}</b> — {x.acao} <Pill nivel={nivelPontos(x.pontos)}>{x.pontos} pts</Pill>
                      {x.atrasado && <> <Pill nivel="crit">desde {dataBr(x.previsto)}</Pill></>}
                    </p>
                  </div>
                  <button type="button" className={btnPrimCls + ' !px-2 !py-1 text-xs'} onClick={() => onToque(x.lead.id, 'marco', x.d)}>
                    <Check size={12} /> Feito
                  </button>
                </li>
              ))}
            </ul>
          ) : <Vazio>Nenhum marco de trial vencendo hoje.</Vazio>}
        </Painel>

        <Painel titulo="Próximos passos de hoje" extra={<Pill nivel="line">{h.proximos.length}</Pill>}>
          {h.proximos.length ? (
            <ul className="divide-y divide-slate-100">
              {h.proximos.map((x) => (
                <li key={x.lead.id} className="flex items-start gap-3 py-2">
                  <div className="min-w-0 flex-1">
                    <NomeLead lead={x.lead} onAbrir={onAbrir} />
                    <p className="text-xs text-slate-500">{x.proximo_passo || 'Sem descrição'} · {nomeEtapa(cfg, x.lead.etapa)}</p>
                  </div>
                  <Pill nivel={x.vencido ? 'crit' : 'neu'}>{x.vencido ? 'venceu ' + dataBr(x.proxima_data) : 'hoje'}</Pill>
                </li>
              ))}
            </ul>
          ) : <Vazio>Nada agendado para hoje.</Vazio>}
        </Painel>

        <Painel titulo="Parados além do prazo" extra={<Pill nivel={h.parados.length ? 'crit' : 'ok'}>{h.parados.length}</Pill>}>
          {h.parados.length ? (
            <ul className="divide-y divide-slate-100">
              {h.parados.slice(0, 30).map((x) => (
                <li key={x.lead.id} className="flex items-start gap-3 py-2">
                  <div className="min-w-0 flex-1">
                    <NomeLead lead={x.lead} onAbrir={onAbrir} />
                    <p className="text-xs text-slate-500">{nomeEtapa(cfg, x.lead.etapa)}{x.lead.dono_nome ? ' · ' + x.lead.dono_nome : ''}</p>
                  </div>
                  <Pill nivel="crit">{x.dias}d / {x.sla}d</Pill>
                </li>
              ))}
              {h.parados.length > 30 && <li className="py-2 text-xs text-slate-500">e mais {h.parados.length - 30}</li>}
            </ul>
          ) : <Vazio>Todos os cartórios estão dentro do prazo da etapa.</Vazio>}
        </Painel>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// TRIALS
// ---------------------------------------------------------------------------
export function VistaTrials({ painel, cfg, onAbrir }) {
  const rows = painel.trials;
  if (!rows.length) {
    return (
      <Painel titulo="Nenhum trial em andamento">
        <Vazio>Um cartório entra em trial quando passa pelo diagnóstico, está qualificado e tem a reunião de ativação marcada. Mude a etapa para “Trial guiado” para começar o roteiro de 14 dias.</Vazio>
      </Painel>
    );
  }
  return (
    <div className="space-y-3">
      <p className="text-sm text-slate-500">Pontuação de ativação: 60 ou mais no dia 3 está no caminho; abaixo de 40, ligue no mesmo dia.</p>
      <div className="overflow-x-auto rounded-lg border border-slate-200 bg-white">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
            <tr><th className="px-3 py-2">Cartório</th><th className="px-3 py-2">Dia</th><th className="px-3 py-2">Ativação</th><th className="px-3 py-2">Próximo marco</th><th className="px-3 py-2">Situação</th></tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {rows.map((t) => (
              <tr key={t.lead.id}>
                <td className="px-3 py-2">
                  <NomeLead lead={t.lead} onAbrir={onAbrir} />
                  <div className="text-xs text-slate-500">{[t.lead.cidade, t.lead.uf].filter(Boolean).join('/')}{t.lead.dono_nome ? ' · ' + t.lead.dono_nome : ''}</div>
                </td>
                <td className="px-3 py-2 font-mono">D{t.dia}<span className="text-slate-400">/14</span></td>
                <td className="min-w-[140px] px-3 py-2">
                  <div className="flex items-center gap-2"><div className="flex-1"><Barra pct={t.pontos} nivel={nivelPontos(t.pontos)} /></div><span className="font-mono text-xs">{t.pontos}</span></div>
                </td>
                <td className="px-3 py-2 text-xs">{t.proximo_marco ? <>D{t.proximo_marco.d} · {t.proximo_marco.n} <span className="text-slate-400">({dataBr(t.proximo_marco.previsto)})</span></> : 'Roteiro concluído'}</td>
                <td className="px-3 py-2"><Pill nivel={t.nivel}>{t.texto}</Pill></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="text-xs text-slate-400">{nomeEtapa(cfg, 'trial')}: {painel.numeros.por_etapa.trial} · {nomeEtapa(cfg, 'proposta')}: {painel.numeros.por_etapa.proposta}</p>
    </div>
  );
}

// ---------------------------------------------------------------------------
// SUPERVISÃO
// ---------------------------------------------------------------------------
export function VistaSupervisao({ painel, onAbrir }) {
  return (
    <div className="space-y-4">
      <p className="max-w-3xl text-sm text-slate-500">
        Três checagens por dia: 8h30 (abertura), 12h30 (meio do dia) e 17h (fechamento). Verde: atividade do dia em dia.
        Amarelo: entre 70% e 99%. Vermelho: abaixo de 70% — conversa de 5 minutos hoje para tirar o bloqueio.
      </p>
      {painel.sem_dono > 0 && (
        <div className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
          {painel.sem_dono} cartório(s) ativo(s) sem responsável.
        </div>
      )}
      {!painel.supervisao.length && <Vazio>Ninguém com cartórios ativos ainda. Defina responsáveis no Funil ou metas de novos por pessoa em Metas.</Vazio>}
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {painel.supervisao.map((s) => (
          <Painel key={s.pessoa.id} titulo={s.pessoa.nome} extra={<Pill nivel={s.sinal}>{s.rotulo}</Pill>}>
            <div className="grid grid-cols-3 gap-2 text-center">
              <Num rotulo="Feitos hoje" valor={s.feitos} />
              <Num rotulo="Pendentes hoje" valor={s.pendentes} />
              {s.meta_novos
                ? <Num rotulo="Novos na cadência" valor={s.novos} meta={s.meta_novos} />
                : <Num rotulo="Atualizados hoje" valor={s.atualizados_hoje} />}
            </div>
            <Barra pct={Math.max(4, s.indice)} nivel={s.sinal} />
            {s.alertas.length ? (
              <ul className="divide-y divide-slate-100">
                {s.alertas.slice(0, 6).map((a, i) => (
                  <li key={a.lead.id + i} className="flex items-center gap-2 py-1.5">
                    <div className="min-w-0 flex-1"><NomeLead lead={a.lead} onAbrir={onAbrir} /><p className="text-xs text-slate-500">{a.motivo}</p></div>
                    <Pill nivel="crit">agir</Pill>
                  </li>
                ))}
                {s.alertas.length > 6 && <li className="py-1.5 text-xs text-slate-500">e mais {s.alertas.length - 6} alerta(s)</li>}
              </ul>
            ) : <Vazio>Sem alertas.</Vazio>}
            <p className="text-xs text-slate-400">{s.ativos} cartório(s) ativo(s) sob responsabilidade</p>
          </Painel>
        ))}
      </div>
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
  ['metaClientes', 'Meta de clientes/mês'], ['ticket', 'Ticket médio (R$/mês)'], ['diasUteis', 'Dias úteis no mês'],
  ['taxaContatoDiag', 'Contato → diagnóstico (%)'], ['taxaDiagTrial', 'Diagnóstico → trial (%)'], ['taxaTrialPago', 'Trial → pago (%)'],
  ['metaNovosDia', 'Novos na cadência/dia'], ['metaToquesDia', 'Toques/dia'],
];

export function VistaMetas({ painel, cfg, onSalvo }) {
  const mes = painel.hoje.slice(0, 7);
  const [form, setForm] = useState(null);
  const [salvando, setSalvando] = useState(false);
  const [msg, setMsg] = useState('');
  useEffect(() => {
    const { _mes_origem, ...v } = painel.metas; // eslint-disable-line no-unused-vars
    setForm({ ...v, novosPorPessoa: { ...(v.novosPorPessoa || {}) } });
  }, [painel.metas]);
  if (!form) return null;

  const t = (form.taxaTrialPago / 100) * (form.taxaDiagTrial / 100) * (form.taxaContatoDiag / 100);
  const contatos = t > 0 ? form.metaClientes / t : NaN;
  const n = painel.numeros;
  const cmp = (tx) => (tx.real == null ? <Pill nivel="line">sem dados</Pill>
    : <Pill nivel={tx.real >= tx.meta ? 'ok' : tx.real >= tx.meta * 0.7 ? 'warn' : 'crit'}>{pct(tx.real)}</Pill>);
  const maxMot = Math.max(1, ...n.motivos_perda.map((x) => x.n));

  async function salvar() {
    setSalvando(true); setMsg('');
    try {
      await api.put('/comercial/metas/' + mes, form);
      setMsg('Metas salvas.');
      onSalvo();
    } catch (err) { setMsg(mensagemDeErro(err)); } finally { setSalvando(false); }
  }

  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <Painel titulo={`Desdobramento da meta · ${mes.split('-').reverse().join('/')}`}>
        <p className="text-sm text-slate-500">A meta de clientes vira contatos por dia, de trás para frente. Comece com as taxas do plano e troque pelas reais depois de 30 dias.</p>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          {CAMPOS_META.map(([k, r]) => (
            <Campo key={k} rotulo={r}>
              <input type="number" min="0" step="any" className={inputCls} value={form[k]} onChange={(e) => setForm({ ...form, [k]: e.target.value === '' ? '' : Number(e.target.value) })} />
            </Campo>
          ))}
        </div>
        <div>
          <p className="mb-2 text-xs font-medium text-slate-600">Novos na cadência por dia, por pessoa (alimenta o semáforo da Supervisão)</p>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
            {cfg.pessoas.map((p) => (
              <Campo key={p.id} rotulo={p.nome}>
                <input type="number" min="0" className={inputCls} value={form.novosPorPessoa[p.id] ?? ''}
                  onChange={(e) => {
                    const v = { ...form.novosPorPessoa };
                    if (e.target.value === '' || Number(e.target.value) === 0) delete v[p.id]; else v[p.id] = Number(e.target.value);
                    setForm({ ...form, novosPorPessoa: v });
                  }} />
              </Campo>
            ))}
          </div>
        </div>
        <dl className="grid grid-cols-2 gap-x-4 gap-y-1 border-t border-slate-100 pt-3 text-sm">
          <dt className="text-slate-500">Contatos por dia útil</dt><dd className="text-right text-lg font-semibold">{isFinite(contatos) ? Math.ceil(contatos / (form.diasUteis || 21)) : '—'}</dd>
          <dt className="text-slate-500">Contatos no mês</dt><dd className="text-right font-semibold">{isFinite(contatos) ? Math.ceil(contatos) : '—'}</dd>
          <dt className="text-slate-500">Diagnósticos no mês</dt><dd className="text-right font-semibold">{form.taxaTrialPago && form.taxaDiagTrial ? Math.ceil(form.metaClientes / ((form.taxaTrialPago / 100) * (form.taxaDiagTrial / 100))) : '—'}</dd>
          <dt className="text-slate-500">Trials no mês</dt><dd className="text-right font-semibold">{form.taxaTrialPago ? Math.ceil(form.metaClientes / (form.taxaTrialPago / 100)) : '—'}</dd>
          <dt className="text-slate-500">Receita recorrente nova esperada</dt><dd className="text-right font-semibold">{brl(form.metaClientes * (form.ticket || 0))}/mês</dd>
        </dl>
        <div className="flex items-center gap-3">
          <button type="button" className={btnPrimCls} onClick={salvar} disabled={salvando}>{salvando ? 'Salvando…' : 'Salvar metas do mês'}</button>
          {msg && <span className="text-sm text-slate-600">{msg}</span>}
        </div>
        {painel.metas._mes_origem && painel.metas._mes_origem !== mes && (
          <p className="text-xs text-amber-700">Este mês ainda usa as metas de {painel.metas._mes_origem}. Salve para fixar as deste mês.</p>
        )}
      </Painel>

      <Painel titulo="Taxas reais do funil" extra={<span className="text-xs text-slate-400">desde o início do registro</span>}>
        <table className="w-full text-sm">
          <thead className="text-left text-xs uppercase tracking-wide text-slate-500">
            <tr><th className="py-1">Passagem</th><th className="py-1 text-right">Volume</th><th className="py-1 text-right">Real</th><th className="py-1 text-right">Meta</th></tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {[['Contato → diagnóstico', n.taxas.contato_diag], ['Diagnóstico → trial', n.taxas.diag_trial], ['Trial → pago', n.taxas.trial_pago]].map(([r, tx]) => (
              <tr key={r}><td className="py-1.5">{r}</td><td className="py-1.5 text-right font-mono">{tx.para}/{tx.de}</td><td className="py-1.5 text-right">{cmp(tx)}</td><td className="py-1.5 text-right font-mono">{tx.meta}%</td></tr>
            ))}
          </tbody>
        </table>
        <dl className="grid grid-cols-2 gap-x-4 gap-y-1 border-t border-slate-100 pt-3 text-sm">
          <dt className="text-slate-500">Clientes ganhos no mês</dt><dd className="text-right font-semibold">{n.ganhos_mes} / {painel.metas.metaClientes}</dd>
          <dt className="text-slate-500">Receita recorrente nova no mês</dt><dd className="text-right font-semibold">{brl(n.receita_nova_mes)}</dd>
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
        ) : <Vazio>Nenhuma perda registrada ainda. Todo cartório perdido precisa de motivo: é o que mostra o que mudar no discurso.</Vazio>}
      </Painel>
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
