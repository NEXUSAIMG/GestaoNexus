import { useEffect, useState } from 'react';
import { X, Archive } from 'lucide-react';
import { api, mensagemDeErro } from '../../api/client.js';
import { Pill, Campo, inputCls, btnCls, btnPrimCls, dataBr, nivelPontos } from './ui.jsx';

/**
 * Gaveta de um lead: dados, etapa, cadência, trial guiado, contato avulso
 * e histórico. Toques/marcos são gravados na hora (são atividade feita);
 * o resto só com "Salvar".
 */

const VAZIO = {
  nome: '', segmento: '', cidade: '', uf: '', contato: '', telefone: '', email: '',
  origem: '', campanha: '', dono_id: '', etapa: 'prospect', valor_mensal: '', motivo_perda: '',
  motivo_perda_obs: '', proximo_passo: '', proxima_data: '', notas: '', sinais: {},
};

function addDiasUteis(s, n) {
  const d = new Date(s + 'T12:00:00'); let k = 0;
  while (k < n) { d.setDate(d.getDate() + 1); const w = d.getDay(); if (w !== 0 && w !== 6) k++; }
  return d.toISOString().slice(0, 10);
}
function addDias(s, n) { const d = new Date(s + 'T12:00:00'); d.setDate(d.getDate() + n); return d.toISOString().slice(0, 10); }

const CANAIS = ['Ligação', 'WhatsApp', 'E-mail', 'Reunião', 'Visita', 'Evento'];

export default function LeadDrawer({ id, cfg, padrao, onFechar, onMudou }) {
  const [lead, setLead] = useState(null); // dados vindos do servidor
  const [f, setF] = useState(null);       // rascunho
  const [erro, setErro] = useState('');
  const [salvando, setSalvando] = useState(false);
  const [avulso, setAvulso] = useState({ canal: 'Ligação', nota: '' });
  const [confirmaArq, setConfirmaArq] = useState(false);

  function paraRascunho(l) {
    const r = { ...VAZIO };
    Object.keys(VAZIO).forEach((k) => { if (l[k] != null) r[k] = l[k]; });
    r.sinais = { ...(l.sinais || {}) };
    return r;
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
    const k = (e) => { if (e.key === 'Escape') onFechar(); };
    window.addEventListener('keydown', k);
    return () => window.removeEventListener('keydown', k);
  }, [onFechar]);

  if (!f) {
    return (
      <Moldura onFechar={onFechar} titulo="Carregando…">
        {erro && <p className="text-sm text-red-700">{erro}</p>}
      </Moldura>
    );
  }

  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });
  const hoje = cfg.hoje;

  async function salvar() {
    setErro('');
    if (!f.nome.trim()) { setErro('Informe o nome do cartório.'); return; }
    if (!f.origem) { setErro('Escolha a origem do lead.'); return; }
    if (f.etapa === 'perdido' && !f.motivo_perda) { setErro('Escolha o motivo da perda.'); return; }
    if (f.etapa === 'ganho' && !(Number(f.valor_mensal) > 0)) { setErro('Informe o valor mensal do contrato.'); return; }
    const corpo = {
      ...f,
      dono_id: f.dono_id || null,
      valor_mensal: f.valor_mensal === '' ? null : Number(f.valor_mensal),
      motivo_perda: f.etapa === 'perdido' ? f.motivo_perda : null,
      proxima_data: f.proxima_data || null,
    };
    setSalvando(true);
    try {
      if (id) await api.put('/comercial/leads/' + id, corpo);
      else await api.post('/comercial/leads', corpo);
      onMudou(); onFechar();
    } catch (err) { setErro(mensagemDeErro(err)); } finally { setSalvando(false); }
  }

  async function toque(tipo, dia, marcado) {
    try {
      const r = marcado
        ? await api.delete(`/comercial/leads/${id}/toques`, { params: { tipo, dia } })
        : await api.post(`/comercial/leads/${id}/toques`, { tipo, dia });
      setLead({ ...lead, ...r.data }); onMudou();
    } catch (err) { setErro(mensagemDeErro(err)); }
  }

  async function registrarAvulso() {
    try {
      await api.post(`/comercial/leads/${id}/toques`, { tipo: 'avulso', canal: avulso.canal, nota: avulso.nota });
      const r = await api.get('/comercial/leads/' + id);
      setLead(r.data); setAvulso({ ...avulso, nota: '' }); onMudou();
    } catch (err) { setErro(mensagemDeErro(err)); }
  }

  async function arquivar() {
    if (!confirmaArq) { setConfirmaArq(true); return; }
    try { await api.post(`/comercial/leads/${id}/arquivar`); onMudou(); onFechar(); } catch (err) { setErro(mensagemDeErro(err)); }
  }

  const etapaReal = lead?.etapa;
  const cadInicio = lead?.cadencia_inicio || (f.etapa === 'cadencia' ? hoje : null);
  const trialInicio = lead?.trial_inicio || (f.etapa === 'trial' ? hoje : null);
  const mostraCad = f.etapa === 'cadencia' || Object.keys(lead?.toques_cadencia || {}).length > 0;
  const mostraTrial = ['trial', 'proposta', 'ganho'].includes(f.etapa) || !!lead?.trial_inicio;
  const pontos = cfg.sinais.reduce((s, x) => s + (f.sinais[x.k] ? x.p : 0), 0);
  const podeMarcar = !!id;

  return (
    <Moldura onFechar={onFechar} sobre={lead ? lead.protocolo : 'Novo'} titulo={id ? (lead?.nome || 'Cartório') : 'Novo cartório'}
      rodape={(
        <>
          {id ? (
            <button type="button" onClick={arquivar} className="inline-flex items-center gap-1 text-sm font-medium text-red-700 hover:underline">
              <Archive size={14} /> {confirmaArq ? 'Confirmar arquivamento' : 'Arquivar'}
            </button>
          ) : <span />}
          <div className="flex gap-2">
            <button type="button" className={btnCls} onClick={onFechar}>Cancelar</button>
            <button type="button" className={btnPrimCls} onClick={salvar} disabled={salvando}>{salvando ? 'Salvando…' : 'Salvar'}</button>
          </div>
        </>
      )}>
      {erro && <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">{erro}</div>}

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
        <Campo rotulo="Cidade"><input className={inputCls} value={f.cidade || ''} onChange={set('cidade')} /></Campo>
        <Campo rotulo="UF"><input className={inputCls} maxLength={2} value={f.uf || ''} onChange={(e) => setF({ ...f, uf: e.target.value.toUpperCase() })} /></Campo>
        <Campo rotulo="Titular / responsável"><input className={inputCls} value={f.contato || ''} onChange={set('contato')} /></Campo>
        <Campo rotulo="Telefone / WhatsApp"><input className={inputCls} value={f.telefone || ''} onChange={set('telefone')} /></Campo>
        <Campo rotulo="E-mail" className="col-span-2"><input type="email" className={inputCls} value={f.email || ''} onChange={set('email')} /></Campo>
      </div>

      <Bloco titulo="Etapa">
        <div className="grid grid-cols-2 gap-3">
          <Campo rotulo="Etapa atual">
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
          {f.etapa === 'perdido' && (
            <Campo rotulo="Detalhe da perda" className="col-span-2"><input className={inputCls} value={f.motivo_perda_obs || ''} onChange={set('motivo_perda_obs')} /></Campo>
          )}
          <Campo rotulo="Próximo passo"><input className={inputCls} value={f.proximo_passo || ''} onChange={set('proximo_passo')} /></Campo>
          <Campo rotulo="Data do próximo passo"><input type="date" className={inputCls} value={f.proxima_data || ''} onChange={set('proxima_data')} /></Campo>
        </div>
        {lead?.prazo && <p className="text-xs text-slate-500">Na etapa há {lead.prazo.dias} dia(s) · prazo {lead.prazo.sla} dias <Pill nivel={lead.prazo.nivel}>{lead.prazo.nivel === 'crit' ? 'fora do prazo' : lead.prazo.nivel === 'warn' ? 'vencendo' : 'no prazo'}</Pill></p>}
      </Bloco>

      {mostraCad && (
        <Bloco titulo={`Cadência${cadInicio ? ' · início ' + dataBr(cadInicio) : ''}`}>
          {!podeMarcar && <p className="text-xs text-slate-500">Salve o cartório para começar a marcar os toques.</p>}
          {etapaReal !== 'cadencia' && id && f.etapa === 'cadencia' && <p className="text-xs text-slate-500">Salve a mudança de etapa para a cadência começar hoje.</p>}
          {cfg.cadencia.map((c) => {
            const feito = (lead?.toques_cadencia || {})[c.d];
            const previsto = cadInicio ? addDiasUteis(cadInicio, c.d - 1) : '';
            return (
              <Check key={c.d} marcado={!!feito} desab={!podeMarcar || (etapaReal !== 'cadencia' && !feito)} onChange={() => toque('cadencia', c.d, !!feito)}>
                <b>Dia {c.d} · {c.canal}</b> — {c.acao}
                <span className="block text-xs text-slate-400">{feito ? 'feito em ' + dataBr(feito) : previsto ? 'previsto para ' + dataBr(previsto) : ''}</span>
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
              <Check key={m.d} marcado={!!feito} desab={!podeMarcar || !lead?.trial_inicio} onChange={() => toque('marco', m.d, !!feito)}>
                <b>D{m.d} · {m.n}</b> — {m.acao}
                <span className="block text-xs text-slate-400">{feito ? 'feito em ' + dataBr(feito) : trialInicio ? 'previsto para ' + dataBr(addDias(trialInicio, m.d)) : ''}</span>
              </Check>
            );
          })}
        </Bloco>
      )}

      <Campo rotulo="Anotações (dor, volume de mensagens, meta de sucesso)">
        <textarea className={inputCls + ' min-h-[90px]'} value={f.notas || ''} onChange={set('notas')} />
      </Campo>

      {id && (
        <Bloco titulo="Registrar contato avulso">
          <div className="flex flex-wrap gap-2">
            <select className={inputCls + ' !w-auto'} value={avulso.canal} onChange={(e) => setAvulso({ ...avulso, canal: e.target.value })}>
              {CANAIS.map((c) => <option key={c}>{c}</option>)}
            </select>
            <input className={inputCls + ' flex-1'} placeholder="O que aconteceu" value={avulso.nota} onChange={(e) => setAvulso({ ...avulso, nota: e.target.value })} />
            <button type="button" className={btnCls} onClick={registrarAvulso}>Registrar</button>
          </div>
        </Bloco>
      )}

      {lead && (lead.movimentos?.length > 0 || lead.toques?.length > 0) && (
        <Bloco titulo="Histórico">
          <ul className="space-y-1 text-xs text-slate-600">
            {[
              ...(lead.movimentos || []).map((m) => ({ em: m.em, txt: `${m.de_etapa ? (cfg.etapas.find((e) => e.k === m.de_etapa)?.n || m.de_etapa) + ' → ' : 'Entrou em '}${cfg.etapas.find((e) => e.k === m.para_etapa)?.n || m.para_etapa}`, quem: m.pessoa_nome })),
              ...(lead.toques || []).map((t) => ({ em: t.criado_em, txt: t.tipo === 'cadencia' ? `Toque dia ${t.dia} (${t.canal || ''})` : t.tipo === 'marco' ? `Marco do trial D${t.dia}` : `Contato · ${t.canal || ''}${t.nota ? ': ' + t.nota : ''}`, quem: t.pessoa_nome })),
            ].sort((a, b) => (a.em < b.em ? 1 : -1)).slice(0, 40).map((h, i) => (
              <li key={i}><span className="font-mono text-slate-400">{new Date(h.em).toLocaleDateString('pt-BR')}</span> · {h.txt}{h.quem ? <span className="text-slate-400"> · {h.quem}</span> : null}</li>
            ))}
          </ul>
        </Bloco>
      )}
    </Moldura>
  );
}

function Moldura({ titulo, sobre, onFechar, rodape, children }) {
  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      <div className="absolute inset-0 bg-slate-900/30" onClick={onFechar} />
      <aside role="dialog" aria-modal="true" aria-label={typeof titulo === 'string' ? titulo : 'Cartório'}
        className="relative flex h-full w-full max-w-xl flex-col bg-white shadow-xl">
        <div className="flex items-start justify-between gap-3 border-b border-slate-200 px-5 py-4">
          <div className="min-w-0">
            {sobre && <p className="font-mono text-[11px] text-slate-400">{sobre}</p>}
            <h2 className="truncate text-lg font-semibold text-slate-900">{titulo}</h2>
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
