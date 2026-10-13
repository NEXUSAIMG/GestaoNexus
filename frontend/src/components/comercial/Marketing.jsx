import { useCallback, useEffect, useMemo, useState } from 'react';
import { ChevronLeft, ChevronRight, Plus, Check, CalendarClock, Flag, Upload, Trash2 } from 'lucide-react';
import { api, mensagemDeErro } from '../../api/client.js';
import {
  Painel, Kpi, Pill, Vazio, Modal, Campo, Erro, inputCls, btnCls, btnPrimCls, brl, pct, dataBr,
} from './ui.jsx';
import { Dica } from './Ajuda.jsx';
import { PLANO_MARKETING } from './planoMarketing.js';

/**
 * Sprint 42I — aba Marketing: calendário das ações com o resultado no funil.
 * A ação se liga aos cartórios pela CAMPANHA (campo do cadastro do cartório).
 */

const MESES = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];
const SEMANA = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];
const COR_STATUS = {
  planejada: 'border-slate-300 bg-white text-slate-700',
  em_andamento: 'border-sky-300 bg-sky-50 text-sky-800',
  feita: 'border-emerald-300 bg-emerald-50 text-emerald-800',
  adiada: 'border-amber-300 bg-amber-50 text-amber-800',
  cancelada: 'border-slate-200 bg-slate-50 text-slate-400 line-through',
};
const NIVEL_STATUS = { planejada: 'line', em_andamento: 'neu', feita: 'ok', adiada: 'warn', cancelada: 'line' };

const iso = (d) => d.toISOString().slice(0, 10);
const somar = (s, n) => { const d = new Date(s + 'T12:00:00Z'); d.setUTCDate(d.getUTCDate() + n); return iso(d); };
const ativa = (a) => a.status === 'planejada' || a.status === 'em_andamento';
const quem = (a) => a.responsavel_nome || a.responsavel_texto || 'sem responsável';

export function VistaMarketing({ cfg, onAviso }) {
  const [mes, setMes] = useState(() => cfg.hoje.slice(0, 7));
  const [dados, setDados] = useState(null);
  const [erro, setErro] = useState('');
  const [editar, setEditar] = useState(null); // {acao} | {nova: true, data}
  const [lancando, setLancando] = useState(false);

  const inicio = mes + '-01';
  const fim = somar(somar(inicio, 32).slice(0, 7) + '-01', -1);
  const carregar = useCallback(async () => {
    try {
      const r = await api.get('/comercial/marketing', { params: { de: somar(inicio, -14), ate: somar(fim, 45) } });
      setDados(r.data); setErro('');
    } catch (e) { setErro(mensagemDeErro(e, 'Não consegui carregar o marketing.')); }
  }, [inicio, fim]);
  useEffect(() => { carregar(); }, [carregar]);

  const mudarMes = (n) => { const d = new Date(inicio + 'T12:00:00Z'); d.setUTCMonth(d.getUTCMonth() + n); setMes(iso(d).slice(0, 7)); };

  async function lancarPlano() {
    setLancando(true);
    try {
      const r = await api.post('/comercial/marketing/lote', PLANO_MARKETING);
      onAviso?.(`Plano lançado: ${r.data.criadas} ação(ões) e ${r.data.datas} data(s) importante(s)${r.data.puladas ? ` (${r.data.puladas} já estavam aqui)` : ''}.`);
      carregar();
    } catch (e) { setErro(mensagemDeErro(e)); } finally { setLancando(false); }
  }

  async function marcar(a, status) {
    try {
      await api.put('/comercial/marketing/acoes/' + a.id, { status });
      onAviso?.(status === 'feita' ? 'Ação marcada como feita. Anote o resultado quando tiver.' : 'Ação atualizada.');
      carregar();
    } catch (e) { setErro(mensagemDeErro(e)); }
  }

  if (!dados) return erro ? <Erro>{erro}</Erro> : <p className="text-sm text-slate-400">Carregando…</p>;
  const { acoes, datas, resumo, canais, status: STATUS, hoje } = dados;
  const doMes = acoes.filter((a) => a.data.slice(0, 7) === mes);
  const paraFazer = acoes.filter((a) => ativa(a) && a.data <= somar(hoje, 6)).sort((x, y) => x.data.localeCompare(y.data));
  const comResultado = doMes.filter((a) => a.canal !== 'interno' && a.status !== 'cancelada');
  const nomeMes = (([m]) => m.charAt(0).toUpperCase() + m.slice(1))([MESES[Number(mes.slice(5, 7)) - 1]]) + ' de ' + mes.slice(0, 4);

  return (
    <div className="space-y-4">
      {erro && <Erro>{erro}</Erro>}

      <div className="flex flex-wrap items-center gap-2">
        <div className="inline-flex items-center rounded-md border border-slate-300 bg-white">
          <button type="button" className="p-1.5 text-slate-600 hover:bg-slate-50" onClick={() => mudarMes(-1)} aria-label="Mês anterior"><ChevronLeft size={16} /></button>
          <span className="min-w-[150px] px-2 text-center text-sm font-medium text-slate-800">{nomeMes}</span>
          <button type="button" className="p-1.5 text-slate-600 hover:bg-slate-50" onClick={() => mudarMes(1)} aria-label="Próximo mês"><ChevronRight size={16} /></button>
        </div>
        {mes !== hoje.slice(0, 7) && <button type="button" className={btnCls} onClick={() => setMes(hoje.slice(0, 7))}>Este mês</button>}
        <div className="flex-1" />
        {dados.pode_gerir && (
          <button type="button" className={btnCls} onClick={lancarPlano} disabled={lancando}
            title="Lança as 47 ações e as 4 datas do plano de outubro a dezembro. Rodar de novo não duplica.">
            <Upload size={14} /> {lancando ? 'Lançando…' : 'Lançar o plano out–dez'}
          </button>
        )}
        <button type="button" className={btnPrimCls} onClick={() => setEditar({ nova: true, data: mes === hoje.slice(0, 7) ? hoje : inicio })}>
          <Plus size={14} /> Nova ação
        </button>
      </div>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Kpi rotulo={`Ações em ${MESES[Number(resumo.mes.slice(5, 7)) - 1]}`} valor={resumo.feitas_mes} meta={resumo.acoes_mes || null} sub="feitas / previstas no mês" />
        <Kpi rotulo="Atrasadas" valor={resumo.atrasadas} sub={resumo.atrasadas ? 'data passou e não foi marcada como feita' : 'nenhuma — muito bem'} />
        <Kpi rotulo="Cartórios que chegaram" valor={resumo.cartorios_mes} sub={`${resumo.reunioes_mes} com reunião · ${resumo.pagos_mes} cliente(s) pago(s)`} />
        <Kpi rotulo="Investido no mês" valor={brl(resumo.custo_mes)} sub={resumo.cartorios_mes ? `${brl(resumo.custo_mes / resumo.cartorios_mes)} por cartório` : 'custo por cartório aparece quando chegar o 1º'} />
      </div>

      {paraFazer.length > 0 && (
        <Painel titulo={<span className="flex items-center gap-2"><CalendarClock size={15} className="text-nexus-700" />Para fazer: atrasadas e próximos 7 dias</span>}
          extra={<Pill nivel={paraFazer.some((a) => a.data < hoje) ? 'crit' : 'neu'}>{paraFazer.length}</Pill>}>
          <p className="-mt-1 text-xs text-slate-500">Fez? Clique em “Feita” e, quando tiver, anote o resultado na ação (alcance, inscritos, conversas). Não vai dar? Adie com a nova data.</p>
          <ul className="divide-y divide-slate-100">
            {paraFazer.slice(0, 30).map((a) => (
              <li key={a.id} className="flex flex-wrap items-center gap-3 py-2">
                <div className="min-w-0 flex-1">
                  <button type="button" className="text-left text-sm font-medium text-slate-900 hover:underline" onClick={() => setEditar({ acao: a })}>{a.titulo}</button>
                  <p className="text-xs text-slate-500">{canais[a.canal]?.nome || a.canal} · {quem(a)}</p>
                </div>
                <Pill nivel={a.data < hoje ? 'crit' : a.data === hoje ? 'warn' : 'line'}>{a.data < hoje ? 'atrasada · ' + dataBr(a.data) : a.data === hoje ? 'hoje' : dataBr(a.data)}</Pill>
                <button type="button" className={btnCls + ' !px-2 !py-1 text-xs'} onClick={() => marcar(a, 'feita')}><Check size={13} /> Feita</button>
                <button type="button" className={btnCls + ' !px-2 !py-1 text-xs'} onClick={() => setEditar({ acao: a, adiar: true })}>Adiar</button>
              </li>
            ))}
          </ul>
        </Painel>
      )}

      <Calendario mes={mes} hoje={hoje} acoes={acoes} datas={datas} canais={canais}
        onAbrir={(a) => setEditar({ acao: a })} onNova={(d) => setEditar({ nova: true, data: d })} />

      <Painel titulo={<span className="flex items-center gap-1">Resultado no funil — ações de {MESES[Number(mes.slice(5, 7)) - 1]} <Dica texto="Cada ação conta os cartórios cadastrados com a campanha dela (campo Campanha do cartório). Ao cadastrar um cartório que chegou por uma ação, escolha a campanha na lista: é isso que mostra se a ação deu certo." /></span>}
        extra={<span className="text-xs text-slate-400">reunião = reunião de apresentação marcada ou feita</span>}>
        {comResultado.length ? (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[760px] text-sm">
              <thead><tr className="border-b border-slate-200 text-left text-[11px] uppercase tracking-wide text-slate-500">
                <th className="py-2 pr-2">Ação</th><th className="px-2">Data</th><th className="px-2">Status</th>
                <th className="px-2 text-right">Cartórios</th><th className="px-2 text-right">Reuniões</th><th className="px-2 text-right">Propostas</th>
                <th className="px-2 text-right">Clientes pagos</th><th className="px-2 text-right">Custo</th><th className="pl-2 text-right">Custo / cartório</th>
              </tr></thead>
              <tbody className="divide-y divide-slate-100">
                {comResultado.map((a) => (
                  <tr key={a.id} className="cursor-pointer hover:bg-slate-50" onClick={() => setEditar({ acao: a })}>
                    <td className="py-2 pr-2"><div className="font-medium text-slate-900">{a.titulo}</div><div className="text-xs text-slate-500">{canais[a.canal]?.nome} · campanha “{a.campanha}”</div></td>
                    <td className="px-2 whitespace-nowrap">{dataBr(a.data)}</td>
                    <td className="px-2"><Pill nivel={NIVEL_STATUS[a.status]}>{STATUS[a.status]}</Pill></td>
                    <td className="px-2 text-right tabular-nums font-semibold">{a.cartorios}</td>
                    <td className="px-2 text-right tabular-nums">{a.reunioes}</td>
                    <td className="px-2 text-right tabular-nums">{a.propostas}</td>
                    <td className="px-2 text-right tabular-nums">{a.pagos}{a.receita ? <span className="block text-[11px] text-emerald-700">{brl(a.receita)}/mês</span> : null}</td>
                    <td className="px-2 text-right tabular-nums">{a.custo ? brl(a.custo) : '—'}</td>
                    <td className="pl-2 text-right tabular-nums">{a.custo && a.cartorios ? brl(a.custo / a.cartorios) : '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : <Vazio>Nenhuma ação neste mês. Clique em “Nova ação” ou num dia do calendário.</Vazio>}
      </Painel>

      <div className="grid gap-4 lg:grid-cols-2">
        <Painel titulo={<span className="flex items-center gap-1">De onde vêm os cartórios (últimos 90 dias) <Dica texto="Todos os cartórios cadastrados nos últimos 90 dias, pela origem. Mostra qual canal traz mais gente e qual converte melhor em reunião e cliente." /></span>}>
          {dados.por_canal.length ? (
            <table className="w-full text-sm">
              <thead><tr className="border-b border-slate-200 text-left text-[11px] uppercase tracking-wide text-slate-500">
                <th className="py-1.5">Origem</th><th className="text-right">Cartórios</th><th className="text-right">Reunião</th><th className="text-right">Clientes</th>
              </tr></thead>
              <tbody className="divide-y divide-slate-100">
                {dados.por_canal.map((c) => (
                  <tr key={c.origem}>
                    <td className="py-1.5">{c.nome}</td>
                    <td className="text-right tabular-nums">{c.cartorios}</td>
                    <td className="text-right tabular-nums">{c.reunioes} <span className="text-xs text-slate-400">({pct((c.reunioes / c.cartorios) * 100)})</span></td>
                    <td className="text-right tabular-nums">{c.pagos || c.ganhos} <span className="text-xs text-slate-400">({pct(((c.pagos || c.ganhos) / c.cartorios) * 100)})</span></td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : <Vazio>Nenhum cartório cadastrado nos últimos 90 dias.</Vazio>}
        </Painel>

        <Datas dados={dados} onMudou={carregar} setErro={setErro} />
      </div>

      {dados.campanhas_soltas.length > 0 && (
        <Painel titulo="Campanhas digitadas que não batem com nenhuma ação" extra={<Pill nivel="warn">{dados.campanhas_soltas.length}</Pill>}>
          <p className="-mt-1 text-xs text-slate-500">Estes cartórios têm uma campanha escrita à mão que não é de nenhuma ação, então não entram no resultado. Corrija a campanha no cartório (escolhendo da lista) ou crie a ação com esse nome de campanha.</p>
          <div className="flex flex-wrap gap-2">
            {dados.campanhas_soltas.map((c) => <span key={c.campanha} className="rounded-full bg-amber-50 px-2.5 py-1 text-xs text-amber-900 ring-1 ring-amber-200">“{c.campanha}” · {c.cartorios}</span>)}
          </div>
        </Painel>
      )}

      {editar && (
        <AcaoModal cfg={cfg} dados={dados} editar={editar} onFechar={() => setEditar(null)}
          onSalvo={(msg) => { setEditar(null); onAviso?.(msg); carregar(); }} />
      )}
    </div>
  );
}

function Calendario({ mes, hoje, acoes, datas, canais, onAbrir, onNova }) {
  const dias = useMemo(() => {
    const primeiro = new Date(mes + '-01T12:00:00Z');
    const inicio = somar(mes + '-01', -primeiro.getUTCDay());
    return Array.from({ length: 42 }, (_, i) => somar(inicio, i));
  }, [mes]);
  const semanas = dias[35].slice(0, 7) === mes ? 6 : 5;
  return (
    <section className="rounded-lg border border-slate-200 bg-white">
      <div className="grid grid-cols-7 border-b border-slate-200 text-center text-[11px] font-medium uppercase tracking-wide text-slate-500">
        {SEMANA.map((s) => <div key={s} className="py-1.5">{s}</div>)}
      </div>
      <div className="grid grid-cols-7">
        {dias.slice(0, semanas * 7).map((d) => {
          const fora = d.slice(0, 7) !== mes;
          const doDia = acoes.filter((a) => a.data === d);
          const marcos = datas.filter((x) => x.data === d);
          return (
            <div key={d} className={`group relative min-h-[96px] border-b border-r border-slate-100 p-1 ${fora ? 'bg-slate-50/70' : ''}`}>
              <div className="mb-0.5 flex items-center justify-between">
                <span className={`flex h-5 w-5 items-center justify-center rounded-full text-[11px] ${d === hoje ? 'bg-nexus-700 font-semibold text-white' : fora ? 'text-slate-300' : 'text-slate-500'}`}>{Number(d.slice(8, 10))}</span>
                <button type="button" onClick={() => onNova(d)} className="rounded p-0.5 text-slate-300 opacity-0 hover:bg-slate-100 hover:text-nexus-700 group-hover:opacity-100" title="Nova ação neste dia" aria-label={'Nova ação em ' + dataBr(d)}><Plus size={12} /></button>
              </div>
              {marcos.map((m) => (
                <div key={m.id} className="mb-0.5 flex items-center gap-1 truncate rounded bg-amber-100 px-1 py-0.5 text-[10px] font-semibold text-amber-900" title={m.titulo + (m.nota ? ' — ' + m.nota : '')}>
                  <Flag size={9} className="shrink-0" /><span className="truncate">{m.titulo}</span>
                </div>
              ))}
              {doDia.slice(0, 4).map((a) => (
                <button key={a.id} type="button" onClick={() => onAbrir(a)}
                  className={`mb-0.5 block w-full truncate rounded border px-1 py-0.5 text-left text-[10px] leading-tight ${COR_STATUS[a.status]} ${ativa(a) && a.data < hoje ? '!border-red-300 !bg-red-50 !text-red-800' : ''}`}
                  title={`${a.titulo} · ${canais[a.canal]?.nome} · ${quem(a)}`}>
                  {a.titulo}
                </button>
              ))}
              {doDia.length > 4 && <span className="text-[10px] text-slate-500">+{doDia.length - 4}</span>}
            </div>
          );
        })}
      </div>
      <div className="flex flex-wrap gap-3 border-t border-slate-100 px-3 py-2 text-[11px] text-slate-500">
        {[['planejada', 'Planejada'], ['em_andamento', 'Em andamento'], ['feita', 'Feita'], ['adiada', 'Adiada']].map(([k, n]) => (
          <span key={k} className="inline-flex items-center gap-1"><span className={`h-2.5 w-2.5 rounded border ${COR_STATUS[k]}`} />{n}</span>
        ))}
        <span className="inline-flex items-center gap-1"><span className="h-2.5 w-2.5 rounded border border-red-300 bg-red-50" />Atrasada</span>
        <span className="inline-flex items-center gap-1"><span className="h-2.5 w-2.5 rounded bg-amber-100" />Data importante</span>
      </div>
    </section>
  );
}

function Datas({ dados, onMudou, setErro }) {
  const [f, setF] = useState({ titulo: '', data: '', nota: '' });
  const futuras = dados.datas.filter((d) => d.data >= dados.hoje);
  async function incluir(e) {
    e.preventDefault();
    try { await api.post('/comercial/marketing/datas', f); setF({ titulo: '', data: '', nota: '' }); onMudou(); } catch (err) { setErro(mensagemDeErro(err)); }
  }
  async function remover(d) {
    try { await api.delete('/comercial/marketing/datas/' + d.id); onMudou(); } catch (err) { setErro(mensagemDeErro(err)); }
  }
  return (
    <Painel titulo={<span className="flex items-center gap-1">Datas importantes <Dica texto="Congressos, fim de condição especial, webinars: datas em que a equipe precisa estar pronta. Aparecem em amarelo no calendário." /></span>}>
      {futuras.length ? (
        <ul className="divide-y divide-slate-100 text-sm">
          {futuras.map((d) => (
            <li key={d.id} className="flex items-center gap-3 py-1.5">
              <span className="w-12 shrink-0 tabular-nums text-slate-500">{dataBr(d.data).slice(0, 5)}</span>
              <span className="flex-1"><b className="font-medium text-slate-900">{d.titulo}</b>{d.nota ? <span className="text-slate-500"> · {d.nota}</span> : null}</span>
              <span className="text-xs text-slate-400">{Math.round((new Date(d.data) - new Date(dados.hoje)) / 86_400_000)} dias</span>
              {dados.pode_gerir && <button type="button" onClick={() => remover(d)} className="text-slate-400 hover:text-red-600" aria-label={'Remover ' + d.titulo}><Trash2 size={13} /></button>}
            </li>
          ))}
        </ul>
      ) : <Vazio>Nenhuma data importante pela frente.</Vazio>}
      {dados.pode_gerir && (
        <form onSubmit={incluir} className="flex flex-wrap items-end gap-2 border-t border-slate-100 pt-3">
          <Campo rotulo="Data" className="w-36"><input type="date" className={inputCls} value={f.data} onChange={(e) => setF({ ...f, data: e.target.value })} required /></Campo>
          <Campo rotulo="O quê" className="min-w-[160px] flex-1"><input className={inputCls} value={f.titulo} onChange={(e) => setF({ ...f, titulo: e.target.value })} placeholder="ex.: Congresso Anoreg" required /></Campo>
          <Campo rotulo="Nota" className="w-32"><input className={inputCls} value={f.nota} onChange={(e) => setF({ ...f, nota: e.target.value })} placeholder="Brasília" /></Campo>
          <button type="submit" className={btnCls}>Incluir</button>
        </form>
      )}
    </Painel>
  );
}

function AcaoModal({ cfg, dados, editar, onFechar, onSalvo }) {
  const a = editar.acao;
  const [f, setF] = useState(() => ({
    titulo: a?.titulo || '', canal: a?.canal || 'linkedin', data: editar.adiar ? '' : (a?.data || editar.data),
    status: editar.adiar ? 'planejada' : (a?.status || 'planejada'),
    responsavel_id: a?.responsavel_id || (a ? '' : cfg.eu.id), responsavel_texto: a?.responsavel_texto || '', fora: !!a?.responsavel_texto,
    campanha: a?.campanha || '', custo: a?.custo ?? '', horas: a?.horas ?? '', notas: a?.notas || '', resultado: a?.resultado || '',
  }));
  const [erro, setErro] = useState('');
  const [salvando, setSalvando] = useState(false);
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });
  const podeRemover = a && (dados.pode_gerir || a.criado_por_id === cfg.eu.id);

  async function salvar() {
    setSalvando(true); setErro('');
    const corpo = {
      ...f, fora: undefined, responsavel_id: f.fora ? null : (f.responsavel_id || null), responsavel_texto: f.fora ? (f.responsavel_texto.trim() || null) : null,
      custo: f.custo === '' ? 0 : f.custo, horas: f.horas === '' ? null : f.horas, campanha: f.campanha || null,
    };
    try {
      if (a) await api.put('/comercial/marketing/acoes/' + a.id, corpo);
      else await api.post('/comercial/marketing/acoes', corpo);
      onSalvo(a ? 'Ação salva.' : 'Ação criada. Ela já aparece no cadastro do cartório, no campo Campanha.');
    } catch (e) { setErro(mensagemDeErro(e)); setSalvando(false); }
  }
  async function remover() {
    try { await api.post(`/comercial/marketing/acoes/${a.id}/arquivar`); onSalvo('Ação removida.'); } catch (e) { setErro(mensagemDeErro(e)); }
  }

  return (
    <Modal titulo={editar.adiar ? 'Adiar a ação' : a ? 'Ação de marketing' : 'Nova ação de marketing'} onFechar={onFechar} largura="max-w-2xl"
      rodape={<>
        {podeRemover && <button type="button" className={btnCls + ' mr-auto text-red-700'} onClick={remover}>Remover</button>}
        <button type="button" className={btnCls} onClick={onFechar}>Cancelar</button>
        <button type="button" className={btnPrimCls} onClick={salvar} disabled={salvando}>{salvando ? 'Salvando…' : 'Salvar'}</button>
      </>}>
      <Erro>{erro}</Erro>
      {editar.adiar && <p className="rounded-md bg-amber-50 px-3 py-2 text-sm text-amber-900">Escolha a nova data. A ação continua planejada e sai da lista de atrasadas.</p>}
      {a && !editar.adiar && (
        <div className="grid grid-cols-4 gap-2 rounded-md bg-slate-50 p-3 text-center text-xs text-slate-600">
          <div><b className="block text-lg text-slate-900">{a.cartorios}</b>cartórios</div>
          <div><b className="block text-lg text-slate-900">{a.reunioes}</b>reuniões</div>
          <div><b className="block text-lg text-slate-900">{a.propostas}</b>propostas</div>
          <div><b className="block text-lg text-slate-900">{a.pagos}</b>clientes pagos</div>
        </div>
      )}
      <div className="grid grid-cols-2 gap-3">
        <Campo rotulo="O que vai ser feito" className="col-span-2"><input className={inputCls} value={f.titulo} onChange={set('titulo')} placeholder="ex.: Post no LinkedIn com o caso de Socorro" /></Campo>
        <Campo rotulo="Canal">
          <select className={inputCls} value={f.canal} onChange={set('canal')}>
            {Object.entries(dados.canais).map(([k, c]) => <option key={k} value={k}>{c.nome}</option>)}
          </select>
        </Campo>
        <Campo rotulo="Data"><input type="date" className={inputCls} value={f.data} onChange={set('data')} /></Campo>
        <Campo rotulo="Status">
          <select className={inputCls} value={f.status} onChange={set('status')}>
            {Object.entries(dados.status).map(([k, n]) => <option key={k} value={k}>{n}</option>)}
          </select>
        </Campo>
        <Campo rotulo="Responsável">
          <select className={inputCls} value={f.fora ? '__texto' : (f.responsavel_id || '')}
            onChange={(e) => setF(e.target.value === '__texto' ? { ...f, fora: true, responsavel_id: '' } : { ...f, fora: false, responsavel_id: e.target.value, responsavel_texto: '' })}>
            <option value="">Sem responsável</option>
            {cfg.pessoas.map((p) => <option key={p.id} value={p.id}>{p.nome}</option>)}
            <option value="__texto">Outra pessoa (fora do Nexus)…</option>
          </select>
        </Campo>
        {f.fora && (
          <Campo rotulo="Quem (fora do Nexus)" className="col-span-2"><input className={inputCls} value={f.responsavel_texto} onChange={set('responsavel_texto')} placeholder="ex.: Sócio, agência" /></Campo>
        )}
        <Campo rotulo="Custo (R$)"><input type="number" min="0" step="0.01" className={inputCls} value={f.custo} onChange={set('custo')} placeholder="0" /></Campo>
        <Campo rotulo="Horas de trabalho"><input type="number" min="0" step="0.5" className={inputCls} value={f.horas} onChange={set('horas')} /></Campo>
        <Campo rotulo="Campanha (liga a ação aos cartórios)" className="col-span-2"
          dica={<Dica texto="É o nome que a equipe escolhe no cadastro do cartório, no campo Campanha, quando ele chegou por esta ação. Deixe em branco para usar o título com a data." />}>
          <input className={inputCls} value={f.campanha} onChange={set('campanha')} placeholder={f.titulo ? `${f.titulo.slice(0, 60)} (${(f.data || '').slice(8, 10)}/${(f.data || '').slice(5, 7)})` : 'gerada a partir do título'} />
        </Campo>
        <Campo rotulo="Notas / como fazer" className="col-span-2"><textarea rows={2} className={inputCls} value={f.notas} onChange={set('notas')} /></Campo>
        {(f.status === 'feita' || a?.resultado) && (
          <Campo rotulo="O que aconteceu (alcance, inscritos, conversas…)" className="col-span-2"><textarea rows={2} className={inputCls} value={f.resultado} onChange={set('resultado')} placeholder="ex.: 1.200 visualizações, 8 comentários, 2 pediram demonstração" /></Campo>
        )}
      </div>
    </Modal>
  );
}
