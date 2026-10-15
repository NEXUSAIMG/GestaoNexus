import { useCallback, useEffect, useState } from 'react';
import { GraduationCap } from 'lucide-react';
import { api, mensagemDeErro } from '../../api/client.js';
import EscolaDrawer from './EscolaDrawer.jsx';
import { AtividadeModal, DesfechoModal } from './Acoes.jsx';
import {
  VistaHoje, VistaFunil, VistaEscolas, VistaRotas, VistaPilotos, VistaSemana, VistaPlano, VistaMetodo,
} from './Vistas.jsx';

/**
 * Sprint 43 — Frente AdaptAI dentro do Comercial.
 * Venda consultiva B2B para escolas de Belém (foco em TEA): diagnóstico →
 * oficina/demo → piloto de 30 dias → proposta. Funil próprio, separado do
 * Seu Cartório; os números aparecem também no Modo TV.
 */
const ABAS = [
  ['hoje', 'Hoje'], ['funil', 'Funil'], ['escolas', 'Escolas'], ['rotas', 'Rotas'], ['pilotos', 'Pilotos'],
  ['semana', 'Semana e metas'], ['plano', 'Plano e kit'], ['metodo', 'Método'],
];

export default function AdaptAI({ onAviso }) {
  const [aba, setAba] = useState(() => { try { return localStorage.getItem('adaptai-aba') || 'hoje'; } catch { return 'hoje'; } });
  const [cfg, setCfg] = useState(null);
  const [painel, setPainel] = useState(null);
  const [escolas, setEscolas] = useState(null);
  const [erro, setErro] = useState('');
  const [versao, setVersao] = useState(0);
  const [aberto, setAberto] = useState(undefined); // undefined = fechado; null = nova
  const [modal, setModal] = useState(null);
  const [semana, setSemana] = useState(null);
  const recarregar = useCallback(() => setVersao((v) => v + 1), []);

  useEffect(() => { try { localStorage.setItem('adaptai-aba', aba); } catch { /* ok */ } }, [aba]);
  useEffect(() => {
    api.get('/comercial/adaptai/config').then((r) => setCfg(r.data)).catch((err) => setErro(mensagemDeErro(err, 'Não consegui abrir o AdaptAI.')));
  }, [versao]);
  useEffect(() => {
    api.get('/comercial/adaptai/painel' + (semana ? `?semana=${semana}` : '')).then((r) => { setPainel(r.data); setErro(''); }).catch((err) => setErro(mensagemDeErro(err)));
  }, [versao, semana]);
  useEffect(() => {
    if (!['funil', 'escolas', 'rotas'].includes(aba)) return;
    api.get('/comercial/adaptai/escolas').then((r) => setEscolas(r.data.escolas)).catch((err) => setErro(mensagemDeErro(err)));
  }, [aba, versao]);

  async function carregarLista() {
    try {
      const r = await api.post('/comercial/adaptai/carregar-lista');
      onAviso?.(`${r.data.carregadas} escolas carregadas. Confirme os telefones antes de visitar.`);
      recarregar();
    } catch (err) { setErro(mensagemDeErro(err)); }
  }

  const abrir = (id) => setAberto(id);
  const pronto = cfg && painel;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl bg-gradient-to-r from-violet-800 via-violet-700 to-fuchsia-700 px-5 py-4 text-white">
        <div className="flex items-center gap-3">
          <div className="grid h-10 w-10 place-items-center rounded-xl bg-white/15"><GraduationCap size={22} /></div>
          <div>
            <p className="text-lg font-semibold leading-tight">AdaptAI · escolas de Belém</p>
            <p className="text-xs text-violet-200">Vender inclusão, não software. Diagnóstico → oficina → piloto de 30 dias → proposta.</p>
          </div>
        </div>
        {painel && (
          <div className="flex gap-4 text-center text-xs">
            <div><p className="text-xl font-semibold tabular-nums">{painel.totais.escolas}</p><p className="text-violet-200">escolas</p></div>
            <div><p className="text-xl font-semibold tabular-nums">{painel.pilotos.filter((p) => !p.piloto?.encerrado).length}</p><p className="text-violet-200">pilotos</p></div>
            <div><p className="text-xl font-semibold tabular-nums">{painel.totais.ganhos}</p><p className="text-violet-200">clientes</p></div>
          </div>
        )}
      </div>

      <div role="tablist" className="flex gap-1 overflow-x-auto border-b border-slate-200">
        {ABAS.map(([k, n]) => (
          <button key={k} type="button" role="tab" aria-selected={aba === k} onClick={() => setAba(k)}
            className={`whitespace-nowrap border-b-2 px-3 py-2 text-sm font-medium ${aba === k ? 'border-violet-700 text-violet-800' : 'border-transparent text-slate-500 hover:text-slate-800'}`}>
            {n}
          </button>
        ))}
      </div>

      {erro && <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">{erro}</div>}
      {!pronto ? <p className="text-sm text-slate-400">Carregando…</p> : (
        <>
          {aba === 'hoje' && (
            <VistaHoje painel={painel} cfg={cfg} onAbrir={abrir} onCarregarLista={carregarLista}
              onPasso={(e, passo) => setModal({ k: 'ativ', escola: e, passo })}
              onDesfecho={(a) => setModal({ k: 'desfecho', a })}
              onMarcoPiloto={(e) => setModal({ k: 'ativ', escola: e, tipo: e.marco.k })} />
          )}
          {aba === 'funil' && (escolas ? <VistaFunil escolas={escolas} cfg={cfg} onAbrir={abrir} /> : <p className="text-sm text-slate-400">Carregando…</p>)}
          {aba === 'escolas' && (escolas ? <VistaEscolas escolas={escolas} cfg={cfg} onAbrir={abrir} onNova={() => setAberto(null)} /> : <p className="text-sm text-slate-400">Carregando…</p>)}
          {aba === 'rotas' && (escolas ? <VistaRotas escolas={escolas} cfg={cfg} onAbrir={abrir} /> : <p className="text-sm text-slate-400">Carregando…</p>)}
          {aba === 'pilotos' && <VistaPilotos painel={painel} cfg={cfg} onAbrir={abrir} />}
          {aba === 'semana' && <VistaSemana painel={painel} cfg={cfg} onRecarregar={recarregar} semana={semana} setSemana={setSemana} />}
          {aba === 'plano' && <VistaPlano cfg={cfg} />}
          {aba === 'metodo' && <VistaMetodo cfg={cfg} />}
        </>
      )}

      {cfg && aberto !== undefined && (
        <EscolaDrawer id={aberto} cfg={cfg} onFechar={() => setAberto(undefined)} onMudou={recarregar}
          onCriada={(id) => { onAviso?.('Escola cadastrada.'); recarregar(); setAberto(id); }} />
      )}
      {cfg && modal?.k === 'ativ' && (
        <AtividadeModal cfg={cfg} escola={modal.escola} passo={modal.passo} tipoPadrao={modal.tipo} onFechar={() => setModal(null)}
          onFeito={() => { setModal(null); onAviso?.('Registrado.'); recarregar(); }} />
      )}
      {cfg && modal?.k === 'desfecho' && (
        <DesfechoModal cfg={cfg} atividade={modal.a} onFechar={() => setModal(null)}
          onFeito={() => { setModal(null); onAviso?.('Desfecho registrado.'); recarregar(); }} />
      )}
    </div>
  );
}
