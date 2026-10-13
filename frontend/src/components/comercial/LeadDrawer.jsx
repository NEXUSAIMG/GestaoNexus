import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { X, Archive, CalendarPlus, FileSignature, Phone, BadgeCheck, KanbanSquare } from 'lucide-react';
import { api, mensagemDeErro } from '../../api/client.js';
import { Pill, Campo, Erro, Modal, inputCls, btnCls, btnPrimCls, dataBr, dataHoraBr, nivelPontos, brl } from './ui.jsx';
import {
  ToqueModal, EstornoModal, TextoModal, ReuniaoModal, DesfechoModal, PropostaModal, PagamentoModal,
} from './Acoes.jsx';
import { Dica } from './Ajuda.jsx';
import { OndeEsta } from './Processo.jsx';
import { proximaAcao, criteriosPara, CaixaProximaAcao, ListaCriterios, GuiaDaEtapa, OQueFalar } from './Orientacao.jsx';

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

const igual = (a, b) => JSON.stringify(a ?? '') === JSON.stringify(b ?? '');

export default function LeadDrawer({ id, cfg, padrao, onFechar, onMudou, onCriado }) {
  const [lead, setLead] = useState(null);
  const [f, setF] = useState(null);
  const [erro, setErro] = useState('');
  const [erroCodigo, setErroCodigo] = useState('');
  const [salvando, setSalvando] = useState(false);
  const [modal, setModal] = useState(null);
  const [aviso, setAviso] = useState('');
  const [ganhos, setGanhos] = useState(null);
  const feriados = new Set((cfg.feriados || []).map((x) => x.data));
  const admin = !!cfg.eu?.admin;          // pagamento manual
  const gestor = !!(cfg.eu?.gestor ?? cfg.eu?.admin); // arquivar, forçar portão

  function paraRascunho(l) {
    const r = { ...VAZIO };
    Object.keys(VAZIO).forEach((k) => { if (l[k] != null) r[k] = l[k]; });
    r.sinais = { ...(l.sinais || {}) }; r.diagnostico = { ...(l.diagnostico || {}) };
    return r;
  }

  /**
   * Recarrega do servidor SEM perder o que está sendo digitado: campo que a
   * pessoa mexeu fica como está; o resto vem atualizado (ex.: um toque que
   * mudou o próximo passo ou a etapa).
   */
  async function recarregar() {
    const r = await api.get('/comercial/leads/' + id);
    const base = lead ? paraRascunho(lead) : null;
    const novo = paraRascunho(r.data);
    setF((atual) => {
      if (!atual || !base) return novo;
      const m = { ...novo };
      Object.keys(VAZIO).forEach((k) => { if (!igual(atual[k], base[k])) m[k] = atual[k]; });
      return m;
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

  // Lista de clientes (para "indicado por") só uma vez, quando a origem é indicação.
  const origemAtual = f?.origem;
  useEffect(() => {
    if (origemAtual !== 'indicacao' || ganhos) return;
    setGanhos([]);
    api.get('/comercial/leads', { params: { etapa: 'ganho', limite: 5000 } }).then((r) => setGanhos(r.data.leads)).catch(() => {});
  }, [origemAtual, ganhos]);

  // Rascunho com alteração não salva?
  const sujo = !!f && (lead ? Object.keys(VAZIO).some((k) => !igual(f[k], paraRascunho(lead)[k]))
    : Object.keys(VAZIO).some((k) => !igual(f[k], { ...VAZIO, ...padrao }[k])));
  function tentarFechar() { if (sujo) setModal({ tipo: 'sair' }); else onFechar(); }

  useEffect(() => {
    const k = (e) => { if (e.key === 'Escape' && !modal) tentarFechar(); };
    window.addEventListener('keydown', k);
    return () => window.removeEventListener('keydown', k);
  });

  if (!f) return <Moldura onFechar={onFechar} titulo="Carregando…"><Erro>{erro}</Erro></Moldura>;

  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });
  const setDiag = (k) => (e) => setF({ ...f, diagnostico: { ...f.diagnostico, [k]: e.target.value } });
  const hoje = cfg.hoje;
  const idx = (k) => cfg.etapas.findIndex((e) => e.k === k);
  const pend = lead && f.etapa !== lead.etapa && f.etapa !== 'perdido' ? (lead.portoes?.[f.etapa] || []) : [];

  /**
   * Salva e MANTÉM a ficha aberta (a orientação "o que fazer agora" é o
   * passo seguinte). Na edição só vão os campos alterados: um dado antigo
   * inválido (ex.: CNPJ importado errado) não trava quem só mudou a etapa.
   */
  async function salvar(extra = {}) {
    setErro(''); setErroCodigo(''); setAviso('');
    const g = { ...f, ...extra };
    if (!g.nome.trim()) { setErro('Informe o nome do cartório.'); return; }
    if (!g.origem) { setErro('Escolha a origem do lead.'); return; }
    if (g.etapa === 'perdido' && !g.motivo_perda) { setErro('Escolha o motivo da perda.'); focar('campo-motivo'); return; }
    if (g.proximo_passo && !g.proxima_data) { setErro('Informe a data do próximo passo (sem data ele não aparece em Hoje).'); focar('campo-proxima-data'); return; }
    const limpo = {
      ...g,
      dono_id: g.dono_id || null, indicado_por_id: g.indicado_por_id || null,
      valor_mensal: g.valor_mensal === '' || g.valor_mensal == null ? null : Number(g.valor_mensal),
      motivo_perda: g.etapa === 'perdido' ? g.motivo_perda : null,
      proxima_data: g.proxima_data || null,
      cns: g.cns || null, cnpj: g.cnpj || null,
    };
    let corpo = limpo;
    if (lead) {
      const base = paraRascunho(lead);
      corpo = {};
      Object.keys(VAZIO).forEach((k) => { if (!igual(g[k], base[k])) corpo[k] = limpo[k]; });
      ['justificativa', 'forcar_portao'].forEach((k) => { if (extra[k] !== undefined) corpo[k] = extra[k]; });
      if (corpo.etapa === undefined && corpo.motivo_perda !== undefined && g.etapa !== 'perdido') delete corpo.motivo_perda;
      if (corpo.etapa === 'perdido' || (g.etapa === 'perdido' && corpo.motivo_perda_obs !== undefined)) corpo.motivo_perda = limpo.motivo_perda;
      if (!Object.keys(corpo).length) { setAviso('Nada para salvar.'); return; }
    }
    setSalvando(true);
    try {
      if (id) {
        const r = await api.put('/comercial/leads/' + id, corpo);
        onMudou();
        const r2 = await api.get('/comercial/leads/' + id);
        setLead(r2.data); setF(paraRascunho(r2.data));
        setAviso('Salvo. Etapa atual: ' + (cfg.etapas.find((e) => e.k === r.data.etapa)?.n || r.data.etapa) + '. Veja abaixo o próximo passo.');
      } else {
        const r = await api.post('/comercial/leads', corpo);
        onMudou();
        if (onCriado) onCriado(r.data.id); else onFechar();
      }
    } catch (err) {
      const cod = err?.response?.data?.codigo;
      if (cod === 'justificativa_obrigatoria') { setModal({ tipo: 'justificativa' }); return; }
      setErro(mensagemDeErro(err)); setErroCodigo(cod || '');
    } finally { setSalvando(false); }
  }

  async function marcoDireto(dia) {
    try { await api.post(`/comercial/leads/${id}/toques`, { tipo: 'marco', dia }); await recarregar(); onMudou(); } catch (err) { setErro(mensagemDeErro(err)); }
  }

  // Executa a ação sugerida pela orientação ("O que fazer agora" / checklist)
  function focar(idCampo) {
    setTimeout(() => {
      const el = document.getElementById(idCampo);
      if (el) { el.scrollIntoView({ behavior: 'smooth', block: 'center' }); el.focus(); }
    }, 50);
  }
  function executar(acao) {
    const [tipo, a, b] = acao.split(':');
    if (tipo === 'toque') setModal(a === 'cadencia' ? { tipo: 'toque', toqueTipo: 'cadencia', dia: Number(b) } : { tipo: 'toque' });
    else if (tipo === 'marco') marcoDireto(Number(a));
    else if (tipo === 'reuniao') setModal({ tipo: 'reuniao', tipoReuniao: a });
    else if (tipo === 'desfecho') setModal({ tipo: 'desfecho', reuniao: lead.reunioes.find((r) => r.id === a) });
    else if (tipo === 'proposta') setModal({ tipo: 'proposta' });
    else if (tipo === 'pagamento') setModal({ tipo: 'pagamento' });
    else if (tipo === 'foco') focar(a);
    else if (tipo === 'etapa') {
      setF({ ...f, etapa: a });
      if (a === 'perdido') focar('campo-motivo');
      else salvar({ etapa: a });
    }
  }

  async function aposModal() { setModal(null); setAviso('Registrado.'); await recarregar(); onMudou(); }

  async function statusProposta(pid, status) {
    try { await api.post(`/comercial/propostas/${pid}/status`, { status }); await aposModal(); } catch (err) { setErro(mensagemDeErro(err)); }
  }

  async function recompensa() {
    try { await api.post(`/comercial/leads/${id}/recompensa-indicacao`); await aposModal(); } catch (err) { setErro(mensagemDeErro(err)); }
  }

  const etapaReal = lead?.etapa;
  const cadInicio = lead?.cadencia_inicio || (f.etapa === 'cadencia' ? hoje : null);
  const implInicio = lead?.implantacao_inicio;
  const mostraCad = etapaReal === 'cadencia' || Object.keys(lead?.toques_cadencia || {}).length > 0;
  const mostraDiag = idx(f.etapa) >= idx('diagnostico') && f.etapa !== 'perdido' || Object.values(f.diagnostico || {}).some(Boolean);
  const mostraImpl = etapaReal === 'ganho' && !!implInicio;
  const pontos = cfg.sinais.reduce((s, x) => s + (f.sinais[x.k] ? x.p : 0), 0);
  const eu = cfg.eu?.id;
  // Responsável: gestão troca livre; os demais pegam da fila ou repassam o próprio.
  const podeTrocarDono = gestor || !lead || !lead.dono_id || lead.dono_id === eu;
  const opcoesDono = gestor || !lead || lead.dono_id === eu ? cfg.pessoas
    : cfg.pessoas.filter((p) => p.id === eu || p.id === lead.dono_id);
  // Origem: gestão, ou quem cadastrou nas primeiras 24h.
  const podeOrigem = gestor || !lead || (lead.criado_por_id === eu && Date.now() - new Date(lead.criado_em).getTime() < 86_400_000);
  // Etapas oferecidas: novo cadastro entra até Diagnóstico.
  const etapasOpcoes = lead ? cfg.etapas : cfg.etapas.filter((e) => ['prospect', 'cadencia', 'diagnostico'].includes(e.k));
  const leadMin = lead ? { id: lead.id, nome: lead.nome, etapa: lead.etapa, origem: lead.origem, valor_mensal: lead.valor_mensal, proxima_data: lead.proxima_data } : null;

  return (
    <Moldura onFechar={tentarFechar} sobre={lead ? lead.protocolo : 'Novo'} titulo={id ? (lead?.nome || 'Cartório') : 'Novo cartório'}
      selos={lead && (
        <>
          {lead.bloqueado_nc && <Pill nivel="crit">NÃO CONTATAR</Pill>}
          {lead.etapa === 'ganho' && (lead.pago_em ? <Pill nivel="ok">pago em {dataBr(lead.pago_em)}</Pill> : <Pill nivel="warn">assinado · aguardando pagamento</Pill>)}
        </>
      )}
      rodape={(
        <>
          {id && gestor ? (
            <button type="button" onClick={() => setModal({ tipo: 'arquivar' })} className="inline-flex items-center gap-1 text-sm font-medium text-red-700 hover:underline">
              <Archive size={14} /> Arquivar
            </button>
          ) : <span className="text-xs text-slate-400">{id ? 'Para encerrar, marque Perdido com o motivo.' : ''}</span>}
          <div className="flex gap-2">
            <button type="button" className={btnCls} onClick={tentarFechar}>{lead && !sujo ? 'Fechar' : 'Cancelar'}</button>
            <button type="button" className={btnPrimCls} onClick={() => salvar()} disabled={salvando || (lead && !sujo)}>{salvando ? 'Salvando…' : sujo || !lead ? 'Salvar' : 'Salvo'}</button>
          </div>
        </>
      )}>
      <Erro>{erro}</Erro>
      {erroCodigo === 'portao' && gestor && (
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
          {['diagnostico', 'proposta', 'corregedoria'].includes(etapaReal) && (
            <button type="button" className={btnCls} onClick={() => setModal({ tipo: 'proposta' })}><FileSignature size={14} /> Registrar proposta</button>
          )}
        </div>
      )}

      {lead && <OndeEsta cfg={cfg} etapa={lead.etapa} />}
      {lead?.quadro && (
        <div className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-700">
          <span className="inline-flex items-center gap-1.5">
            <KanbanSquare size={14} className="shrink-0 text-slate-500" />
            No quadro {lead.quadro.quadro}: <b>{lead.quadro.coluna}</b>
            {lead.quadro.espelho && <span className="text-xs text-slate-500">· andam juntos</span>}
          </span>
          <Link to={`/tarefas/${lead.quadro.quadro_id}?card=${lead.quadro.card_id}`} className="text-sm font-medium text-nexus-700 hover:underline">Ver o card</Link>
        </div>
      )}
      {aviso && <div className="rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-800">{aviso}</div>}
      {lead && <CaixaProximaAcao acao={proximaAcao(lead, cfg, admin)} onExecutar={executar} />}
      {lead && <ListaCriterios criterios={criteriosPara(lead, f, cfg)} onExecutar={executar} />}
      {lead && <OQueFalar lead={lead} />}
      {!id && (
        <div className="rounded-md bg-nexus-50 p-3 text-sm text-slate-700">
          Preencha o nome e a origem (de onde ele veio). Com CNS ou CNPJ o sistema evita cadastro repetido.
          O cartório entra como <b>Em prospecção</b>; ao salvar, a ficha mostra o próximo passo.
        </div>
      )}

      <div className="grid grid-cols-2 gap-3">
        <Campo rotulo="Nome do cartório *" className="col-span-2"><input className={inputCls} value={f.nome} onChange={set('nome')} /></Campo>
        <Campo rotulo="Segmento">
          <select className={inputCls} value={f.segmento || ''} onChange={set('segmento')}>
            <option value="">—</option>{cfg.segmentos.map((s) => <option key={s}>{s}</option>)}
          </select>
        </Campo>
        <Campo rotulo="Origem *" dica={<Dica termo="origem" />}>
          <select className={inputCls} value={f.origem} onChange={set('origem')} disabled={!podeOrigem}
            title={podeOrigem ? undefined : 'A origem só muda pela gestão comercial (ou por quem cadastrou, nas primeiras 24h).'}>
            <option value="">Escolha…</option>{Object.entries(cfg.origens).map(([k, n]) => <option key={k} value={k}>{n}</option>)}
          </select>
        </Campo>
        <Campo rotulo="Responsável">
          <select className={inputCls} value={f.dono_id || ''} onChange={set('dono_id')} disabled={!podeTrocarDono}
            title={podeTrocarDono ? undefined : 'Lead de outra pessoa: para trocar o responsável, fale com a gestão comercial.'}>
            <option value="">Sem responsável</option>{opcoesDono.map((p) => <option key={p.id} value={p.id}>{p.nome}</option>)}
          </select>
        </Campo>
        <Campo rotulo="Campanha (ação de marketing)" dica={<Dica termo="campanha" />}>
          <input className={inputCls} value={f.campanha || ''} list="campanhas-mkt" placeholder="escolha a ação que trouxe o cartório"
            onChange={(e) => {
              // Sprint 42I — escolheu a campanha de uma ação: sugere a origem do canal dela
              const v = e.target.value;
              const c = (cfg.campanhas || []).find((x) => x.campanha === v);
              setF({ ...f, campanha: v, ...(c?.origem && !f.origem && podeOrigem ? { origem: c.origem } : {}) });
            }} />
          <datalist id="campanhas-mkt">
            {(cfg.campanhas || []).map((c) => <option key={c.campanha} value={c.campanha}>{c.titulo}</option>)}
          </datalist>
        </Campo>
        {f.origem === 'indicacao' && (
          <Campo rotulo="Indicado por (cliente)" className="col-span-2">
            <select className={inputCls} value={f.indicado_por_id || ''} onChange={set('indicado_por_id')}>
              <option value="">—</option>{(ganhos || []).filter((g) => g.id !== id).map((g) => <option key={g.id} value={g.id}>{g.nome}</option>)}
            </select>
          </Campo>
        )}
        <Campo rotulo="Cidade"><input className={inputCls} value={f.cidade || ''} onChange={set('cidade')} /></Campo>
        <Campo rotulo="UF"><input className={inputCls} maxLength={2} value={f.uf || ''} onChange={(e) => setF({ ...f, uf: e.target.value.toUpperCase() })} /></Campo>
        <Campo rotulo="CNS (código da serventia)" dica={<Dica termo="cns" />}><input className={inputCls} inputMode="numeric" value={f.cns || ''} onChange={set('cns')} placeholder="6 dígitos" /></Campo>
        <Campo rotulo="CNPJ"><input id="campo-cnpj" className={inputCls} inputMode="numeric" value={f.cnpj || ''} onChange={set('cnpj')} placeholder="14 dígitos — confere o pagamento no ASAAS" /></Campo>
        <Campo rotulo="Titular / responsável"><input className={inputCls} value={f.contato || ''} onChange={set('contato')} /></Campo>
        <Campo rotulo="Telefone / WhatsApp"><input className={inputCls} value={f.telefone || ''} onChange={set('telefone')} /></Campo>
        <Campo rotulo="E-mail" className="col-span-2"><input type="email" className={inputCls} value={f.email || ''} onChange={set('email')} /></Campo>
      </div>

      <Bloco titulo="Etapa">
        <div className="grid grid-cols-2 gap-3">
          <Campo rotulo="Etapa" dica={<Dica termo="portao" />}>
            <select className={inputCls} value={f.etapa} onChange={set('etapa')}>
              {etapasOpcoes.map((e) => <option key={e.k} value={e.k}>{e.n}</option>)}
            </select>
          </Campo>
          {f.etapa === 'perdido' ? (
            <Campo rotulo="Motivo da perda *">
              <select id="campo-motivo" className={inputCls} value={f.motivo_perda || ''} onChange={set('motivo_perda')}>
                <option value="">Escolha…</option>{cfg.motivos_perda.map((m) => <option key={m}>{m}</option>)}
              </select>
            </Campo>
          ) : (
            <Campo rotulo={`Valor mensal (R$)${f.etapa === 'ganho' ? ' *' : ''}`}>
              <input id="campo-valor" type="number" min="0" className={inputCls} value={f.valor_mensal ?? ''} onChange={set('valor_mensal')} />
            </Campo>
          )}
          {f.etapa === 'perdido' && <Campo rotulo="Detalhe da perda" className="col-span-2"><input className={inputCls} value={f.motivo_perda_obs || ''} onChange={set('motivo_perda_obs')} /></Campo>}
          <Campo rotulo="Próximo passo" dica={<Dica termo="proximo_passo" />}><input id="campo-proximo" className={inputCls} value={f.proximo_passo || ''} onChange={set('proximo_passo')} placeholder="ex.: ligar para a titular" /></Campo>
          <Campo rotulo="Data do próximo passo"><input id="campo-proxima-data" type="date" min={hoje} className={inputCls} value={f.proxima_data || ''} onChange={set('proxima_data')} /></Campo>
        </div>
        {pend.length > 0 && (
          <div className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900">
            <b>Para ir a “{cfg.etapas.find((e) => e.k === f.etapa)?.n}” falta:</b>
            <ul className="ml-4 list-disc">{pend.map((p) => <li key={p}>{p}</li>)}</ul>
          </div>
        )}
        <GuiaDaEtapa etapa={f.etapa} />
        {lead?.prazo && <p className="text-xs text-slate-500">Na etapa há {lead.prazo.dias} dia(s) · prazo {lead.prazo.sla} dias <Pill nivel={lead.prazo.nivel}>{lead.prazo.nivel === 'crit' ? 'fora do prazo' : lead.prazo.nivel === 'warn' ? 'vencendo' : 'no prazo'}</Pill></p>}
      </Bloco>

      {mostraDiag && (
        <Bloco titulo="Diagnóstico">
          <div className="grid grid-cols-2 gap-3">
            {cfg.diagnostico_campos.map((c) => (
              <Campo key={c.k} rotulo={c.n + (c.obrigatorio ? ' *' : '')} className={['dor', 'sistema_atual'].includes(c.k) ? 'col-span-2' : ''}>
                <input id={'campo-diag-' + c.k} className={inputCls} value={f.diagnostico[c.k] ?? ''} onChange={setDiag(c.k)} />
              </Campo>
            ))}
            {idx(f.etapa) >= idx('proposta') && f.etapa !== 'perdido' && (
              <Campo rotulo="O que é sucesso para o cliente" className="col-span-2"><input id="campo-meta" className={inputCls} value={f.meta_sucesso || ''} onChange={set('meta_sucesso')} placeholder="ex.: responder 90% das mensagens em até 10 minutos (usado no pós-venda)" /></Campo>
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

      {mostraImpl && (
        <Bloco titulo={<>Implantação · início {dataBr(implInicio)} <Pill nivel={nivelPontos(pontos)}>{pontos} pts</Pill></>}>
          <p className="text-[11px] font-medium uppercase tracking-wide text-slate-500">Roteiro da implantação</p>
          {cfg.marcos_implantacao.map((m) => {
            const feito = (lead?.toques_marco || {})[m.d];
            return (
              <Check key={m.d} marcado={!!feito} desab={!id}
                onChange={() => (feito ? setModal({ tipo: 'estornar', url: `/comercial/leads/${id}/toques/estornar`, corpo: { tipo: 'marco', dia: m.d } }) : marcoDireto(m.d))}>
                <b>D{m.d} · {m.n}</b> — {m.acao}
                <span className="block text-xs text-slate-400">{feito ? 'feito em ' + dataBr(feito) : 'previsto para ' + dataBr(addDias(implInicio, m.d))}</span>
              </Check>
            );
          })}
          <p className="mt-2 text-[11px] font-medium uppercase tracking-wide text-slate-500">Sinais de uso (marque e salve)</p>
          {cfg.sinais.map((x) => (
            <Check key={x.k} marcado={!!f.sinais[x.k]} onChange={() => setF({ ...f, sinais: { ...f.sinais, [x.k]: !f.sinais[x.k] } })}>
              {x.n} <span className="text-xs text-slate-400">+{x.p}</span>
            </Check>
          ))}
        </Bloco>
      )}

      <Campo rotulo="Anotações gerais">
        <textarea className={inputCls + ' min-h-[80px]'} value={f.notas || ''} onChange={set('notas')} />
      </Campo>

      {lead && (
        <Historico cfg={cfg} lead={lead} hoje={hoje} gestor={gestor}
          onEstornar={(t) => setModal({ tipo: 'estornar', url: `/comercial/toques/${t.id}/estornar` })} />
      )}

      {modal?.tipo === 'toque' && <ToqueModal cfg={cfg} lead={leadMin} tipo={modal.toqueTipo || 'avulso'} dia={modal.dia} onFechar={() => setModal(null)} onFeito={aposModal} />}
      {modal?.tipo === 'estornar' && <EstornoModal url={modal.url} corpoExtra={modal.corpo} onFechar={() => setModal(null)} onFeito={aposModal} />}
      {modal?.tipo === 'reuniao' && <ReuniaoModal cfg={cfg} lead={leadMin} tipoPadrao={modal.tipoReuniao || (etapaReal === 'ganho' ? 'ativacao' : 'diagnostico')} onFechar={() => setModal(null)} onFeito={aposModal} />}
      {modal?.tipo === 'desfecho' && <DesfechoModal reuniao={modal.reuniao} onFechar={() => setModal(null)} onFeito={aposModal} />}
      {modal?.tipo === 'proposta' && <PropostaModal lead={leadMin} onFechar={() => setModal(null)} onFeito={aposModal} />}
      {modal?.tipo === 'pagamento' && <PagamentoModal lead={leadMin} hoje={hoje} onFechar={() => setModal(null)} onFeito={aposModal} />}
      {modal?.tipo === 'justificativa' && (
        <TextoModal titulo="Justificar mudança de etapa" explicacao="Voltar etapa, reabrir um lead ganho/perdido ou marcar como perdido uma venda já fechada fica registrado com a justificativa."
          onFechar={() => setModal(null)} onConfirmar={(t) => { setModal(null); salvar({ justificativa: t }); }} />
      )}
      {modal?.tipo === 'sair' && (
        <Modal titulo="Descartar o que não foi salvo?" onFechar={() => setModal(null)}
          rodape={(
            <>
              <button type="button" className={btnCls} onClick={() => { setModal(null); onFechar(); }}>Descartar e fechar</button>
              <button type="button" className={btnPrimCls} onClick={() => { setModal(null); salvar(); }}>Salvar</button>
            </>
          )}>
          <p className="text-sm text-slate-700">Você mudou campos desta ficha e ainda não salvou.</p>
        </Modal>
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
  notas: 'Anotações', meta_sucesso: 'Meta de sucesso', diagnostico: 'Diagnóstico', sinais: 'Sinais de uso', etapa: 'Etapa',
  pagamento: 'Pagamento', arquivado: 'Arquivado', recompensa_indicacao: 'Indicação', indicado_por_id: 'Indicado por',
};

function Historico({ cfg, lead, hoje, gestor, onEstornar }) {
  const [aberto, setAberto] = useState(false);
  const nomeEtapa = (k) => cfg.etapas.find((e) => e.k === k)?.n || k;
  const nomePessoa = (id) => cfg.pessoas.find((p) => p.id === id)?.nome || id;
  const res = (k) => cfg.resultados.find((r) => r.k === k)?.n || k;
  const itens = [
    ...(lead.movimentos || []).map((m) => ({ em: m.em, quem: m.pessoa_nome, txt: `${m.de_etapa ? nomeEtapa(m.de_etapa) + ' → ' : 'Entrou em '}${nomeEtapa(m.para_etapa)}${m.justificativa ? ` — “${m.justificativa}”` : ''}` })),
    ...(lead.toques || []).map((t) => ({
      em: t.criado_em, quem: t.pessoa_nome, riscado: !!t.estornado_em,
      // Contato avulso não tem caixinha no roteiro: o estorno é por aqui.
      estornavel: !t.estornado_em && t.tipo === 'avulso' && (gestor || (t.pessoa_id === cfg.eu?.id && t.data === hoje)) ? t : null,
      txt: `${t.tipo === 'cadencia' ? `Toque dia ${t.dia}` : t.tipo === 'marco' ? `Implantação D${t.dia}` : 'Contato'}${t.canal ? ' · ' + t.canal : ''}${t.resultado ? ' · ' + res(t.resultado) : ''}${t.duracao_min ? ` · ${t.duracao_min} min` : ''}${t.nota ? ': ' + t.nota : ''}`
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
              {h.estornavel && <button type="button" className="ml-2 font-medium text-red-700 hover:underline" onClick={() => onEstornar(h.estornavel)}>estornar</button>}
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
