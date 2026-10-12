import { useEffect, useRef, useState } from 'react';
import { Plus, Upload, Search, KanbanSquare } from 'lucide-react';
import { api, mensagemDeErro } from '../../api/client.js';
import { Pill, brl, nivelPontos, linhaLocal, inputCls, btnCls, btnPrimCls } from './ui.jsx';
import { Dica } from './Ajuda.jsx';
import { GUIA_ETAPAS } from './guia.js';

const POR_COLUNA = 60;

export default function Funil({ cfg, admin, gestor, versao, onAbrir, onNovo, onImportarLista, onImportarQuadro }) {
  const [leads, setLeads] = useState([]);
  const [total, setTotal] = useState(0);
  const [porEtapa, setPorEtapa] = useState({});
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState('');
  const [busca, setBusca] = useState('');
  const [buscaD, setBuscaD] = useState('');
  const [origem, setOrigem] = useState('');
  // Quem não é gestão abre o funil já filtrado na própria carteira.
  const [dono, setDono] = useState(() => {
    try { const v = localStorage.getItem('comercial-dono'); if (v != null) return v; } catch { /* ok */ }
    return gestor ? '' : (cfg.eu?.id || '');
  });
  const [mais, setMais] = useState({});
  const reqId = useRef(0);

  useEffect(() => { const t = setTimeout(() => setBuscaD(busca), 300); return () => clearTimeout(t); }, [busca]);
  useEffect(() => { try { localStorage.setItem('comercial-dono', dono); } catch { /* ok */ } }, [dono]);

  useEffect(() => {
    const meu = ++reqId.current;
    setCarregando(true); setErro('');
    const params = {};
    if (buscaD.trim()) params.busca = buscaD.trim();
    if (origem) params.origem = origem;
    if (dono) params.dono_id = dono;
    api.get('/comercial/leads', { params })
      .then((r) => { if (meu === reqId.current) { setLeads(r.data.leads); setTotal(r.data.total); setPorEtapa(r.data.por_etapa || {}); } })
      .catch((err) => { if (meu === reqId.current) setErro(mensagemDeErro(err, 'Não consegui carregar o funil.')); })
      .finally(() => { if (meu === reqId.current) setCarregando(false); });
  }, [buscaD, origem, dono, versao]);

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2 rounded-lg border border-slate-200 bg-white p-3">
        <button type="button" className={btnPrimCls} onClick={onNovo}><Plus size={14} /> Novo cartório</button>
        <button type="button" className={btnCls} onClick={onImportarLista}><Upload size={14} /> Importar lista</button>
        {admin && <button type="button" className={btnCls} onClick={onImportarQuadro}><KanbanSquare size={14} /> Importar do quadro</button>}
        <div className="relative min-w-[200px] flex-1">
          <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
          <input type="search" placeholder="Buscar por nome, cidade, protocolo, contato…" value={busca} onChange={(e) => setBusca(e.target.value)} className={inputCls + ' pl-8'} />
        </div>
        <select className={inputCls + ' !w-auto'} value={origem} onChange={(e) => setOrigem(e.target.value)} aria-label="Filtrar origem">
          <option value="">Todas as origens</option>
          {Object.entries(cfg.origens).map(([k, n]) => <option key={k} value={k}>{n}</option>)}
        </select>
        <select className={inputCls + ' !w-auto'} value={dono} onChange={(e) => setDono(e.target.value)} aria-label="Filtrar responsável">
          <option value="">Todos os responsáveis</option>
          {cfg.pessoas.map((p) => <option key={p.id} value={p.id}>{p.nome}</option>)}
          <option value="sem">Sem responsável</option>
        </select>
      </div>

      {erro && <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">{erro}</div>}
      {!carregando && total === 0 && !buscaD && !origem && !dono && (
        <div className="rounded-lg border border-slate-200 bg-white p-4 text-sm text-slate-600">
          <b className="text-slate-900">O funil está vazio.</b> Importe os cards do quadro “Atividade Comercial”, cole uma lista de cartórios do seu ICP ou adicione um por um. Cada cartório recebe um protocolo e passa pelas etapas do playbook.
        </div>
      )}

      <div className="overflow-x-auto pb-2">
        <div className="flex min-w-max gap-3">
          {cfg.etapas.map((e) => {
            const cs = leads.filter((l) => l.etapa === e.k);
            const lim = mais[e.k] || POR_COLUNA;
            // Contagem real vem do servidor; a coluna pode ter mais do que foi carregado.
            const real = porEtapa[e.k] ?? cs.length;
            return (
              <section key={e.k} aria-label={e.n} className="flex w-64 shrink-0 flex-col gap-2 rounded-lg bg-slate-100 p-2">
                <div className="flex items-center justify-between px-1">
                  <b className="flex items-center gap-1 text-xs font-semibold text-slate-700">{e.n}<Dica texto={`${GUIA_ETAPAS[e.k].objetivo} ${GUIA_ETAPAS[e.k].avancar}${e.sla ? ` Prazo: ${e.sla} dias.` : ''}`} /></b>
                  <Pill nivel="line">{real}{e.sla ? ` · ${e.sla}d` : ''}</Pill>
                </div>
                {cs.slice(0, lim).map((l) => (
                  <button key={l.id} type="button" onClick={() => onAbrir(l.id)}
                    className="flex flex-col gap-1 rounded-md border border-slate-200 bg-white p-2 text-left shadow-sm hover:border-nexus-300">
                    <span className="font-mono text-[10px] text-slate-400">{l.protocolo}</span>
                    <span className="text-sm font-medium leading-snug text-slate-900">{l.nome}</span>
                    {linhaLocal(l) && <span className="text-xs text-slate-500">{linhaLocal(l)}</span>}
                    <span className="flex flex-wrap gap-1">
                      {l.dono_nome ? <Pill>{l.dono_nome}</Pill> : <Pill nivel="warn">sem responsável</Pill>}
                      <Pill nivel="line">{cfg.origens[l.origem] || l.origem}</Pill>
                      {l.prazo && <Pill nivel={l.prazo.nivel}>{l.prazo.dias}d / {l.prazo.sla}d</Pill>}
                      {l.pontos != null && ['trial', 'proposta'].includes(l.etapa) && <Pill nivel={nivelPontos(l.pontos)}>{l.pontos} pts</Pill>}
                      {l.etapa === 'perdido' && l.motivo_perda && <Pill nivel="line">{l.motivo_perda}</Pill>}
                      {l.etapa === 'ganho' && (l.valor_mensal ? <Pill nivel="ok">{brl(l.valor_mensal)}/mês</Pill> : <Pill nivel="warn">sem valor</Pill>)}
                      {l.etapa === 'ganho' && (l.pago_em ? <Pill nivel="ok">pago</Pill> : <Pill nivel="warn">aguardando pagamento</Pill>)}
                      {l.bloqueado_nc && <Pill nivel="crit">não contatar</Pill>}
                    </span>
                  </button>
                ))}
                {!cs.length && <p className="px-1 py-2 text-[11px] leading-snug text-slate-400">{GUIA_ETAPAS[e.k].objetivo}</p>}
                {cs.length <= lim && real > cs.length && (
                  <p className="px-1 text-[11px] leading-snug text-slate-500">
                    Mostrando {cs.length} de {real}. Use a busca ou os filtros para achar os demais.
                  </p>
                )}
                {cs.length > lim && (
                  <button type="button" className="rounded-md py-1 text-xs font-medium text-nexus-700 hover:bg-white"
                    onClick={() => setMais({ ...mais, [e.k]: lim + POR_COLUNA })}>
                    Mostrar mais {Math.min(POR_COLUNA, cs.length - lim)} de {cs.length - lim}
                  </button>
                )}
              </section>
            );
          })}
        </div>
      </div>
      {carregando && <p className="text-xs text-slate-400">Carregando…</p>}
    </div>
  );
}
