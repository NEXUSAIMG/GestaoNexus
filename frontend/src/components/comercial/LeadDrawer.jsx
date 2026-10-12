import { useEffect, useState } from 'react';
import { X, Archive, CalendarPlus, FileSignature, Phone, BadgeCheck } from 'lucide-react';
import { api, mensagemDeErro } from '../../api/client.js';
import { Pill, Campo, Erro, inputCls, btnCls, btnPrimCls, dataBr, dataHoraBr, nivelPontos, brl } from './ui.jsx';
import {
  ToqueModal, EstornoModal, TextoModal, ReuniaoModal, DesfechoModal, PropostaModal, PagamentoModal,
} from './Acoes.jsx';

/**
 * Gaveta de um lead (Sprint 42/42B).
 *
 * Atividade (toques, marcos, reuniões, propostas, pagamento) é gravada na
 * hora, cada uma no seu registro. Dados do cadastro, etapa, diagnóstico e
 * sinais só com "Salvar". O servidor aplica os portões de etapa; a gaveta
 * mostra antes o que falta.
 */

const VAZIO = {
  nome: '', segmento: '', cidade: '', uf: '', contato: '', telefone: '', email: '', cns: '', cnpj: '',
  origem: '', campanha: '', dono_id: '', etapa: 'prospect', valor_mensal: '', motivo_perda: '',
  motivo_perda_obs: '', proximo_passo: '', proxima_data: '', notas: '', sinais: {}, diagnostico: {},
  meta_sucesso: '', indicado_por_id: '',
};

function addDiasUteis(s, n, feriados) {
  const d = new Date(s + 'T12:00:00'); let k = 0;
  const iso = () => d.toISOString().slice(0, 10);
  while (k < n) { d.setDate(d.getDate() + 1); const w = d.getDay(); if (w !== 0 && w !== 6 && !feriados.has(iso())) k++; }
  return iso();
}
function addDias(s, n) { const d = new Date(s + 'T12:00:00'); d.setDate(d.getDate() + n); return d.toISOString().slice(0, 10); }

const ST_REUNIAO = { agendada: 'neu', realizada: 'ok', faltou: 'crit', remarcada: 'line', cancelada: 'line' };
const ST_PROPOSTA = { enviada: 'info', aceita: 'ok', recusada: 'crit', expirada: 'warn', substituida: 'line' };

export default function LeadDrawer({ id, cfg, padrao, onFechar, onMudou }) {
  const [lead, setLead] = useState(null);
  const [f, setF] = useState(null);
  const [erro, setErro] = useState('');
  const [erroCodigo, setErroCodigo] = useState('');
  const [salvando, setSalvando] = useState(false);
  const [modal, setModal] = useState(null);
  const [ganhos, setGanhos] = useState([]);
  const feriados = new Set((cfg.feriados || []).map((x) => x.data));
  const admin = !!cfg.eu?.admin;

  function paraRascunho(l) {
    const r = { ...VAZIO };
    Object.keys(VAZIO).forEach((k) => { if (l[k] != null) r[k] = l[k]; });
    r.sinais = { ...(l.sinais || {}) }; r.diagnostico = { ...(l.diagnostico || {}) };
    return r;
  }

  async function recarregar() {
    const r = await api.get('/comercial/leads/' + id);
    const antes = lead;
    setF((atual) => {
      if (!atual || !antes) return paraRascunho(r.data);
      const editouEtapa = atual.etapa !== antes.etapa;
      return {
        ...atual,
        etapa: editouEtapa ? atual.etapa : r.data.etapa,
        valor_mensal: r.data.valor_mensal ?? atual.valor_mensal,
        proximo_passo: r.data.proximo_passo ?? atual.proximo_passo,
        proxima_data: r.data.proxima_data ?? atual.proxima_data,
      };
    });
    setLead(r.data);
    return r.data;
  }

  useEffect(() => {
    setErro('');
    if (!id) { setLead(null); setF({ ...VAZIO, ...padrao }); return; }
    api.get('/comercial/leads/' + id)
      .then((r) => { setLead(r.data); setF(paraRascunho(r.data)); })
      .catch((err) => setErro(mensagemDeErro(err, 'Não consegui abrir o cartório.')));
    // eslint-disable-next-line
  }, [id]);

  useEffect(() => {
    if (!f || !['indicacao'].includes(f.origem) || ganhos.length) return;
    api.get('/comercial/leads', { params: { etapa: 'ganho', limite: 2000 } }).then((r) => setGanhos(r.data.leads)).catch(() => {});
  }, [f, ganhos.length]);

  useEffect(() => {
    const k = (e) => { if (e.key === 'Escape' && !modal) onFechar(); };
    window.addEventListener('keydown', k);
    return () => window.removeEventListener('keydown', k);
  }, [onFechar, modal]);

  if (!f) return <Moldura onFechar={onFechar} titulo="Carregando…"><Erro>{erro}</Erro></Moldura>;

  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });
  const setDiag = (k) => (e) => setF({ ...f, diagnostico: { ...f.diagnostico, [k]: e.target.value } });
  const hoje = cfg.hoje;
  const idx = (k) => cfg.etapas.findIndex((e) => e.k === k);
  const pend = lead && f.etapa !== lead.etapa && f.etapa !== 'perdido' ? (lead.portoes?.[f.etapa] || []) : [];

  async function salvar(extra = {}) {
    setErro(''); setErroCodigo('');
    if (!f.nome.trim()) { setErro('Informe o nome do cartório.'); return; }
    if (!f.origem) { setErro('Escolha a origem do lead.'); return; }
    if (f.etapa === 'perdido' && !f.motivo_perda) { setErro('Escolha o motivo da perda.'); return; }
    const corpo = {
      ...f, ...extra,
      dono_id: f.dono_id || null, indicado_por_id: f.indicado_por_id || null,
      valor_mensal: f.valor_mensal === '' || f.valor_mensal == null ? null : Number(f.valor_mensal),
      motivo_perda: f.etapa === 'perdido' ? f.motivo_perda : null,
      proxima_data: f.proxima_data || null,
      cns: f.cns || null, cnpj: f.cnpj || null,
    };
    if (lead && corpo.etapa === lead.etapa) delete corpo.etapa;
    setSalvando(true);
    try {
      if (id) await api.put('/comercial/leads/' + id, corpo);
      else await api.post('/comercial/leads', corpo);
      onMudou(); onFechar();
    } catch (err) {
      const cod = err?.response?.data?.codigo;
      if (cod === 'justificativa_obrigatoria') { setModal({ tipo: 'justificativa' }); return; }
      setErro(mensagemDeErro(err)); setErroCodigo(cod || '');
    } finally { setSalvando(false); }
  }

  async function marcoDireto(dia) {
    try { await api.post(`/comercial/leads/${id}/toques`, { tipo: 'marco', dia }); await recarregar(); onMudou(); } catch (err) { setErro(mensagemDeErro(err)); }
  }

  async function aposModal() { setModal(null); await recarregar(); onMudou(); }

  async function statusProposta(pid, status) {
    try { await api.post(`/comercial/propostas/${pid}/status`, { status }); await aposModal(); } catch (err) { setErro(mensagemDeErro(err)); }
  }

  async function recompensa() {
    try { await api.post(`/comercial/leads/${id}/recompensa-indicacao`); await aposModal(); } catch (err) { setErro(mensagemDeErro(err)); }
  }

  const etapaReal = lead?.etapa;
  const cadInicio = lead?.cadencia_inicio || (f.etapa === 'cadencia' ? hoje : null);
  const trialInicio = lead?.trial_inicio;
  const mostraCad = etapaReal === 'cadencia' || Object.keys(lead?.toques_cadencia || {}).length > 0;
  const mostraDiag = idx(f.etapa) >= idx('diagnostico') && f.etapa !== 'perdido' || Object.values(f.diagnostico || {}).some(Boolean);
  const mostraTrial = ['trial', 'proposta', 'ganho'].includes(f.etapa) || !!trialInicio;
  const pontos = cfg.sinais.reduce((s, x) => s + (f.sinais[x.k] ? x.p : 0), 0);
  const leadMin = lead ? { id: lead.id, nome: lead.nome, etapa: lead.etapa, origem: lead.origem, valor_mensal: lead.valor_mensal } : null;

  return (
    <Moldura onFechar={onFechar} sobre={lead ? lead.protocolo : 'Novo'} titulo={id ? (lead?.nome || 'Cartório') : 'Novo cartório'}
      selos={lead && (
        <>
          {lead.bloqueado_nc && <Pill nivel="crit">NÃO CONTATAR</Pill>}
          {lead.etapa === 'ganho' && (lead.pago_em ? <Pill nivel="ok">pago em {dataBr(lead.pago_em)}</Pill> : <Pill nivel="warn">assinado · aguardando pagamento</Pill>)}
        </>
      )}
      rodape={(
        <>
          {id && admin ? (
            <button type="button" onClick={() => setModal({ tipo: 'arquivar' })} className="inline-flex items-center gap-1 text-sm font-medium text-red-700 hover:underline">
              <Archive size={14} /> Arquivar
            </button>
          ) : <span className="text-xs text-slate-400">{id ? 'Para encerrar, marque Perdido com o motivo.' : ''}</span>}
          <div className="flex gap-2">
            <button type="button" className={btnCls} onClick={onFechar}>Cancelar</button>
            <button type="button" className={btnPrimCls} onClick={() => salvar()} disabled={salvando}>{salvando ? 'Salvando…' : 'Salvar'}</button>
          </div>
        </>
      )}>
      <Erro>{erro}</Erro>
      {erroCodigo === 'portao' && admin && (
        <button type="button" className="text-sm font-medium text-amber-800 underline" onClick={() => setModal({ tipo: 'forcar' })}>
          Forçar a mudança de etapa (gestão) com justificativa
        </button>
      )}
      {lead?.bloqueado_nc && (
        <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
          Este cartório está na lista de não contatar. Nenhum contato, reunião ou proposta pode ser registrado.
        </div>
      )}

      {id && !lead?.bloqueado_nc && (
        <div className="flex flex-wrap gap-2">
          <button type="button" className={btnCls} onClick={() => setModal({ tipo: 'toque' })}><Phone size={14} /> Registrar contato</button>
          <button type="button" className={btnCls} onClick={() => setModal({ tipo: 'reuniao' })}><CalendarPlus size={14} /> Agendar reunião</button>
          {['qualificado', 'trial', 'proposta'].includes(etapaReal) && (
            <button type="button" className={btnCls} onClick={() => setModal({ tipo: 'proposta' })}><FileSignature size={14} /> Registrar proposta</button>
          )}
        </div>
      )}

      <div className="grid grid-cols-2 gap-3">
        <Campo rotulo="Nome do cartório *" className="col-span-2"><input className={inputCls} value={f.nome} onChange={set('nome')} /></Campo>
        <Campo rotulo="Segmento">
          <select className={inputCls} value={f.segmento || ''} onChange={set('segmento')}>
            <option value="">—</option>{cfg.segmentos.map((s) => <option key={s}>{s}</option>)}
          </select>
        </Campo>
        <Campo rotulo="Origem *">
          <select className={inputCls} value={f.origem} onChange={set('origem')}>
            <option value="">Escolha…</option>{Object.entries(cfg.origens).map(([k, n]) => <option key={k} value={k}>{n}</option>)}
          </select>
        </Campo>
        <Campo rotulo="Responsável">
          <select className={inputCls} value={f.dono_id || ''} onChange={set('dono_id')}>
            <option value="">Sem responsável</option>{cfg.pessoas.map((p) => <option key={p.id} value={p.id}>{p.nome}</option>)}
          </select>
        </Campo>
        <Campo rotulo="Campanha / onda"><input className={inputCls} value={f.campanha || ''} onChange={set('campanha')} placeholder="ex.: E-mail onda 1" /></Campo>
        {f.origem === 'indicacao' && (
          <Campo rotulo="Indicado por (cliente)" className="col-span-2">
            <select className={inputCls} value={f.indicado_por_id || ''} onChange={set('indicado_por_id')}>
              <option value="">—</option>{ganhos.filter((g) => g.id !== id).map((g) => <option key={g.id} value={g.id}>{g.nome}</option>)}
            </select>
          </Campo>
        )}
        <Campo rotulo="Cidade"><input className={inputCls} value={f.cidade || ''} onChange={set('cidade')} /></Campo>
        <Campo rotulo="UF"><input className={inputCls} maxLength={2} value={f.uf || ''} onChange={(e) => setF({ ...f, uf: e.target.value.toUpperCase() })} /></Campo>
        <Campo rotulo="CNS (código da serventia)"><input className={inputCls} inputMode="numeric" value={f.cns || ''} onChange={set('cns')} placeholder="6 dígitos" /></Campo>
        <Campo rotulo="CNPJ"><input className={inputCls} inputMode="numeric" value={f.cnpj || ''} onChange={set('cnpj')} /></Campo>
        <Campo rotulo="Titular / responsável"><input className={inputCls} value={f.contato || ''} onChange={set('contato')} /></Campo>
        <Campo rotulo="Telefone / WhatsApp"><input className={inputCls} value={f.telefone || ''} onChange={set('telefone')} /></Campo>
        <Campo rotulo="E-mail" className="col-span-2"><input type="email" className={inputCls} value={f.email || ''} onChange={set('email')} /></Campo>
      </div>

      <Bloco titulo="Etapa">
        <div className="grid grid-cols-2 gap-3">
          <Campo rotulo="Etapa">
            <select className={inputCls} value={f.etapa} onChange={set('etapa')}>
              {cfg.etapas.map((e) => <option key={e.k} value={e.k}>{e.n}</option>)}
            </select>
          </Campo>
          {f.etapa === 'perdido' ? (
            <Campo rotulo="Motivo da perda *">
              <select className={inputCls} value={f.motivo_perda || ''} onChange={set('motivo_perda')}>
                <option value="">Escolha…</option>{cfg.motivos_perda.map((m) => <option key={m}>{m}</option>)}
              </select>
            </Campo>
          ) : (
            <Campo rotulo={`Valor mensal (R$)${f.etapa === 'ganho' ? ' *' : ''}`}>
              <input type="number" min="0" className={inputCls} value={f.valor_mensal ?? ''} onChange={set('valor_mensal')} />
            </Campo>
          )}
          {f.etapa === 'perdido' && <Campo rotulo="Detalhe da perda" className="col-span-2"><input className={inputCls} value={f.motivo_perda_obs || ''} onChange={set('motivo_perda_obs')} /></Campo>}
          <Campo rotulo="Próximo passo"><input className={inputCls} value={f.proximo_passo || ''} onChange={set('proximo_passo')} /></Campo>
          <Campo rotulo="Data do próximo passo"><input type="date" className={inputCls} value={f.proxima_data || ''} onChange={set('proxima_data')} /></Campo>
        </div>
        {pend.length > 0 && (
          <div className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900">
            <b>Para ir a “{cfg.etapas.find((e) => e.k === f.etapa)?.n}” falta:</b>
            <ul className="ml-4 list-disc">{pend.map((p) => <li key={p}>{p}</li>)}</ul>
          </div>
        )}
        {lead?.prazo && <p className="text-xs text-slate-500">Na etapa há {lead.prazo.dias} dia(s) · prazo {lead.prazo.sla} dias <Pill nivel={lead.prazo.nivel}>{lead.prazo.nivel === 'crit' ? 'fora do prazo' : lead.prazo.nivel === 'warn' ? 'vencendo' : 'no prazo'}</Pill></p>}
      </Bloco>

      {mostraDiag && (
        <Bloco titulo="Diagnóstico">
          <div className="grid grid-cols-2 gap-3">
            {cfg.diagnostico_campos.map((c) => (
              <Campo key={c.k} rotulo={c.n + (c.obrigatorio ? ' *' : '')} className={['dor', 'sistema_atual'].includes(c.k) ? 'col-span-2' : ''}>
                <input className={inputCls} value={f.diagnostico[c.k] ?? ''} onChange={setDiag(c.k)} />
              </Campo>
            ))}
            {idx(f.etapa) >= idx('qualificado') && f.etapa !== 'perdido' && (
              <Campo rotulo="Meta de sucesso do trial *" className="col-span-2"><input className={inputCls} value={f.meta_sucesso || ''} onChange={set('meta_sucesso')} placeholder="ex.: responder 90% das mensagens em até 10 minutos" /></Campo>
            )}
          </div>
        </Bloco>
      )}

      {lead && (lead.reunioes?.length > 0) && (
        <Bloco titulo="Reuniões">
          <ul className="divide-y divide-slate-100">
            {lead.reunioes.map((r) => (
              <li key={r.id} className="flex items-center gap-2 py-1.5 text-sm">
                <div className="min-w-0 flex-1">
                  <b>{cfg.tipos_reuniao[r.tipo]}</b> · {dataHoraBr(r.inicio)}
                  {r.responsavel_nome && <span className="text-slate-500"> · {r.responsavel_nome}</span>}
                  {r.nota && <span className="block text-xs text-slate-500">{r.nota}</span>}
                </div>
                <Pill nivel={ST_REUNIAO[r.status]}>{r.status}</Pill>
                {r.status === 'agendada' && <button type="button" className="text-xs font-medium text-nexus-700 hover:underline" onClick={() => setModal({ tipo: 'desfecho', reuniao: r })}>desfecho</button>}
              </li>
            ))}
          </ul>
        </Bloco>
      )}

      {lead && lead.propostas?.length > 0 && (
        <Bloco titulo="Propostas">
          <ul className="divide-y divide-slate-100">
            {lead.propostas.map((x) => (
              <li key={x.id} className="flex items-center gap-2 py-1.5 text-sm">
                <div className="min-w-0 flex-1">
                  <b>{x.plano}</b> · {brl(x.valor_mensal)}/mês · enviada {dataBr(x.enviada_em)} · válida até {dataBr(x.validade)}
                  {x.desconto !== 'nenhum' && <span className="block text-xs text-amber-700">1 mês grátis (ex-cliente)</span>}
                </div>
                <Pill nivel={ST_PROPOSTA[x.status]}>{x.status}</Pill>
                {x.status === 'enviada' && (
                  <span className="flex gap-2 text-xs">
                    <button type="button" className="text-red-700 hover:underline" onClick={() => statusProposta(x.id, 'recusada')}>recusada</button>
                    <button type="button" className="text-slate-600 hover:underline" onClick={() => statusProposta(x.id, 'expirada')}>expirou</button>
                  </span>
                )}
              </li>
            ))}
          </ul>
        </Bloco>
      )}

      {lead?.etapa === 'ganho' && (
        <Bloco titulo="Pagamento">
          {lead.pago_em ? (
            <p className="text-sm text-slate-700"><BadgeCheck size={14} className="mr-1 inline text-emerald-600" />
              Pago em {dataBr(lead.pago_em)} · {brl(lead.pago_valor)} · {lead.pago_fonte === 'asaas' ? 'confirmado pelo ASAAS' : 'confirmado manualmente'} · {lead.pago_referencia}</p>
          ) : (
            <div className="flex flex-wrap items-center gap-2 text-sm text-slate-700">
              <span>Assinado em {dataBr(lead.marcos?.ganho)}. Só conta na meta quando o 1º pagamento entrar{lead.cnpj ? ' (o ASAAS confere pelo CNPJ)' : ' — preencha o CNPJ para o ASAAS conferir sozinho'}.</span>
              {admin && <button type="button" className={btnCls} onClick={() => setModal({ tipo: 'pagamento' })}>Confirmar pagamento</button>}
            </div>
          )}
          {lead.indicado_por_id && (
            <p className="text-sm text-slate-700">Indicado por <b>{lead.indicado_por_nome}</b> ·{' '}
              {lead.recompensa_indicacao_em ? `mês grátis concedido em ${dataBr(lead.recompensa_indicacao_em)}`
                : lead.pago_em ? (admin ? <button type="button" className="font-medium text-nexus-700 hover:underline" onClick={recompensa}>marcar mês grátis concedido</button> : 'mês grátis a conceder')
                  : 'mês grátis só depois do pagamento'}
            </p>
          )}
        </Bloco>
      )}

      {mostraCad && (
        <Bloco titulo={`Cadência${cadInicio ? ' · início ' + dataBr(cadInicio) : ''}`}>
          {cfg.cadencia.map((c) => {
            const feito = (lead?.toques_cadencia || {})[c.d];
            const previsto = cadInicio ? addDiasUteis(cadInicio, c.d - 1, feriados) : '';
            const ultimo = lead?.toques?.find((t) => t.tipo === 'cadencia' && t.dia === c.d && !t.estornado_em);
            return (
              <Check key={c.d} marcado={!!feito} desab={!id || lead?.bloqueado_nc || (etapaReal !== 'cadencia' && !feito)}
                onChange={() => setModal(feito ? { tipo: 'estornar', url: `/comercial/leads/${id}/toques/estornar`, corpo: { tipo: 'cadencia', dia: c.d } } : { tipo: 'toque', toqueTipo: 'cadencia', dia: c.d })}>
                <b>Dia {c.d} · {c.canal}</b> — {c.acao}
                <span className="block text-xs text-slate-400">
                  {feito ? `feito em ${dataBr(feito)}${ultimo?.resultado ? ' · ' + (cfg.resultados.find((r) => r.k === ultimo.resultado)?.n || ultimo.resultado) : ''}` : previsto ? 'previsto para ' + dataBr(previsto) : ''}
                </span>
              </Check>
            );
          })}
        </Bloco>
      )}

      {mostraTrial && (
        <Bloco titulo={<>Trial guiado{trialInicio ? ' · início ' + dataBr(trialInicio) : ''} <Pill nivel={nivelPontos(pontos)}>{pontos} pts</Pill></>}>
          <p className="text-[11px] font-medium uppercase tracking-wide text-slate-500">Sinais de ativação</p>
          {cfg.sinais.map((x) => (
            <Check key={x.k} marcado={!!f.sinais[x.k]} onChange={() => setF({ ...f, sinais: { ...f.sinais, [x.k]: !f.sinais[x.k] } })}>
              {x.n} <span className="text-xs text-slate-400">+{x.p}</span>
            </Check>
          ))}
          <p className="mt-2 text-[11px] font-medium uppercase tracking-wide text-slate-500">Roteiro de 14 dias</p>
          {cfg.marcos_trial.map((m) => {
            const feito = (lead?.toques_marco || {})[m.d];
            return (
              <Check key={m.d} marcado={!!feito} desab={!id || !trialInicio}
                onChange={() => (feito ? setModal({ tipo: 'estornar', url: `/comercial/leads/${id}/toques/estornar`, corpo: { tipo: 'marco', dia: m.d } }) : marcoDireto(m.d))}>
                <b>D{m.d} · {m.n}</b> — {m.acao}
                <span className="block text-xs text-slate-400">{feito ? 'feito em ' + dataBr(feito) : trialInicio ? 'previsto para ' + dataBr(addDias(trialInicio, m.d)) : ''}</span>
              </Check>
            );
          })}
        </Bloco>
      )}

      <Campo rotulo="Anotações gerais">
        <textarea className={inputCls + ' min-h-[80px]'} value={f.notas || ''} onChange={set('notas')} />
      </Campo>

      {lead && <Historico cfg={cfg} lead={lead} />}

      {modal?.tipo === 'toque' && <ToqueModal cfg={cfg} lead={leadMin} tipo={modal.toqueTipo || 'avulso'} dia={modal.dia} onFechar={() => setModal(null)} onFeito={aposModal} />}
      {modal?.tipo === 'estornar' && <EstornoModal url={modal.url} corpoExtra={modal.corpo} onFechar={() => setModal(null)} onFeito={aposModal} />}
      {modal?.tipo === 'reuniao' && <ReuniaoModal cfg={cfg} lead={leadMin} tipoPadrao={etapaReal === 'qualificado' ? 'ativacao' : etapaReal === 'trial' ? 'resultado' : 'diagnostico'} onFechar={() => setModal(null)} onFeito={aposModal} />}
      {modal?.tipo === 'desfecho' && <DesfechoModal reuniao={modal.reuniao} onFechar={() => setModal(null)} onFeito={aposModal} />}
      {modal?.tipo === 'proposta' && <PropostaModal lead={leadMin} onFechar={() => setModal(null)} onFeito={aposModal} />}
      {modal?.tipo === 'pagamento' && <PagamentoModal lead={leadMin} hoje={hoje} onFechar={() => setModal(null)} onFeito={aposModal} />}
      {modal?.tipo === 'justificativa' && (
        <TextoModal titulo="Justificar mudança de etapa" explicacao="Voltar etapa ou reabrir um lead ganho/perdido fica registrado com a justificativa."
          onFechar={() => setModal(null)} onConfirmar={(t) => { setModal(null); salvar({ justificativa: t }); }} />
      )}
      {modal?.tipo === 'forcar' && (
        <TextoModal titulo="Forçar etapa (gestão)" explicacao="A mudança passa sem cumprir o portão. A justificativa e as pendências ficam no histórico."
          onFechar={() => setModal(null)} onConfirmar={(t) => { setModal(null); salvar({ justificativa: t, forcar_portao: true }); }} />
      )}
      {modal?.tipo === 'arquivar' && (
        <TextoModal titulo="Arquivar lead" explicacao="O lead sai do funil e das contas. Use só para cadastro errado ou duplicado." rotulo="Motivo *"
          onFechar={() => setModal(null)} onConfirmar={async (t) => {
            try { await api.post(`/comercial/leads/${id}/arquivar`, { motivo: t }); setModal(null); onMudou(); onFechar(); } catch (err) { setModal(null); setErro(mensagemDeErro(err)); }
          }} />
      )}
    </Moldura>
  );
}

const ROTULO_CAMPO = {
  nome: 'Nome', segmento: 'Segmento', cidade: 'Cidade', uf: 'UF', contato: 'Titular', telefone: 'Telefone', email: 'E-mail',
  cns: 'CNS', cnpj: 'CNPJ', dono_id: 'Responsável', origem: 'Origem', campanha: 'Campanha', valor_mensal: 'Valor mensal',
  motivo_perda: 'Motivo da perda', motivo_perda_obs: 'Detalhe da perda', proximo_passo: 'Próximo passo', proxima_data: 'Data do próximo passo',
  notas: 'Anotações', meta_sucesso: 'Meta de sucesso', diagnostico: 'Diagnóstico', sinais: 'Sinais do trial', etapa: 'Etapa',
  pagamento: 'Pagamento', arquivado: 'Arquivado', recompensa_indicacao: 'Indicação', indicado_por_id: 'Indicado por',
};

function Historico({ cfg, lead }) {
  const [aberto, setAberto] = useState(false);
  const nomeEtapa = (k) => cfg.etapas.find((e) => e.k === k)?.n || k;
  const nomePessoa = (id) => cfg.pessoas.find((p) => p.id === id)?.nome || id;
  const res = (k) => cfg.resultados.find((r) => r.k === k)?.n || k;
  const itens = [
    ...(lead.movimentos || []).map((m) => ({ em: m.em, quem: m.pessoa_nome, txt: `${m.de_etapa ? nomeEtapa(m.de_etapa) + ' → ' : 'Entrou em '}${nomeEtapa(m.para_etapa)}${m.justificativa ? ` — “${m.justificativa}”` : ''}` })),
    ...(lead.toques || []).map((t) => ({
      em: t.criado_em, quem: t.pessoa_nome, riscado: !!t.estornado_em,
      txt: `${t.tipo === 'cadencia' ? `Toque dia ${t.dia}` : t.tipo === 'marco' ? `Marco do trial D${t.dia}` : 'Contato'}${t.canal ? ' · ' + t.canal : ''}${t.resultado ? ' · ' + res(t.resultado) : ''}${t.duracao_min ? ` · ${t.duracao_min} min` : ''}${t.nota ? ': ' + t.nota : ''}`
        + (t.estornado_em ? ` [ESTORNADO por ${t.estornado_por_nome || '—'}: ${t.estorno_motivo}]` : ''),
    })),
    ...(lead.alteracoes || []).filter((a) => a.campo !== 'etapa').map((a) => {
      let de = a.de; let para = a.para;
      if (a.campo === 'dono_id') { de = de && nomePessoa(de); para = para && nomePessoa(para); }
      const curto = (v) => (v && v.length > 60 ? v.slice(0, 60) + '…' : v);
      return { em: a.em, quem: a.pessoa_nome, txt: `${ROTULO_CAMPO[a.campo] || a.campo}: ${curto(de) || '—'} → ${curto(para) || '—'}` };
    }),
  ].sort((a, b) => (a.em < b.em ? 1 : -1));
  return (
    <Bloco titulo={<button type="button" onClick={() => setAberto(!aberto)} className="hover:underline">Histórico completo ({itens.length}) {aberto ? '▲' : '▼'}</button>}>
      {aberto && (
        <ul className="space-y-1 text-xs text-slate-600">
          {itens.map((h, i) => (
            <li key={i} className={h.riscado ? 'text-slate-400 line-through decoration-red-400' : ''}>
              <span className="font-mono text-slate-400">{new Date(h.em).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}</span> · {h.txt}
              {h.quem ? <span className="text-slate-400"> · {h.quem}</span> : null}
            </li>
          ))}
        </ul>
      )}
    </Bloco>
  );
}

function Moldura({ titulo, sobre, selos, onFechar, rodape, children }) {
  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      <div className="absolute inset-0 bg-slate-900/30" onClick={onFechar} />
      <aside role="dialog" aria-modal="true" aria-label={typeof titulo === 'string' ? titulo : 'Cartório'}
        className="relative flex h-full w-full max-w-2xl flex-col bg-white shadow-xl">
        <div className="flex items-start justify-between gap-3 border-b border-slate-200 px-5 py-4">
          <div className="min-w-0">
            {sobre && <p className="font-mono text-[11px] text-slate-400">{sobre}</p>}
            <h2 className="truncate text-lg font-semibold text-slate-900">{titulo}</h2>
            {selos && <div className="mt-1 flex flex-wrap gap-1">{selos}</div>}
          </div>
          <button type="button" onClick={onFechar} className="rounded p-1 text-slate-500 hover:bg-slate-100" aria-label="Fechar"><X size={18} /></button>
        </div>
        <div className="flex-1 space-y-4 overflow-y-auto px-5 py-4">{children}</div>
        {rodape && <div className="flex items-center justify-between gap-2 border-t border-slate-200 px-5 py-3">{rodape}</div>}
      </aside>
    </div>
  );
}

function Bloco({ titulo, children }) {
  return (
    <fieldset className="space-y-2 rounded-lg border border-slate-200 p-3">
      <legend className="px-1 text-xs font-semibold text-slate-700">{titulo}</legend>
      {children}
    </fieldset>
  );
}

function Check({ marcado, desab, onChange, children }) {
  return (
    <label className={`flex items-start gap-2 text-sm ${desab ? 'opacity-60' : 'cursor-pointer'}`}>
      <input type="checkbox" className="mt-0.5 h-4 w-4 rounded border-slate-300 text-nexus-700" checked={marcado} disabled={desab} onChange={onChange} />
      <span className="text-slate-700">{children}</span>
    </label>
  );
}
