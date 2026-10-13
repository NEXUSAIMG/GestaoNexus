import { useCallback, useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { TrendingUp, HelpCircle } from 'lucide-react';
import { api, mensagemDeErro } from '../api/client.js';
import { useAuth } from '../context/AuthContext.jsx';
import Funil from '../components/comercial/Funil.jsx';
import LeadDrawer from '../components/comercial/LeadDrawer.jsx';
import { ImportarLista, ImportarQuadro } from '../components/comercial/Importar.jsx';
import {
  VistaHoje, VistaImplantacao, VistaSupervisao, VistaMetas, VistaScripts, VistaPlacar, VistaControles,
} from '../components/comercial/Vistas.jsx';
import { ToqueModal } from '../components/comercial/Acoes.jsx';
import { ComoFunciona, Tour, VistaAjuda } from '../components/comercial/Ajuda.jsx';
import { VistaProcesso } from '../components/comercial/Processo.jsx';
import { VistaMarketing } from '../components/comercial/Marketing.jsx';

/**
 * Comercial — Sprint 42.
 *
 * Funil de vendas do Seu Cartório com a metodologia de venda SaaS:
 * Hoje (o que fazer), Funil, Implantação, Supervisão (semáforo por pessoa),
 * Metas (desdobramento + taxas reais + motivos de perda) e Scripts.
 * Todos os cálculos vêm prontos do backend (GET /comercial/painel).
 */

const ABAS = [
  ['hoje', 'Hoje'], ['processo', 'Processo'], ['funil', 'Funil'], ['implantacao', 'Implantação'],
  ['supervisao', 'Supervisão'], ['placar', 'Placar'], ['metas', 'Metas e indicadores'],
  ['marketing', 'Marketing'], ['controles', 'Controles'], ['scripts', 'Scripts'], ['ajuda', 'Ajuda'],
];

/** Filtra as listas do painel para "só os meus" (responsável = eu). */
function soMeus(painel, eu) {
  const meu = (x) => (x.lead?.dono_id ?? x.dono_id) === eu || x.responsavel_id === eu;
  const h = painel.hoje_listas;
  return {
    ...painel,
    hoje_listas: Object.fromEntries(Object.entries(h).map(([k, v]) => [k, v.filter(meu)])),
    implantacoes: (painel.implantacoes || []).filter(meu),
  };
}

export default function Comercial() {
  const { pessoa } = useAuth();
  const admin = !!pessoa?.administrador;
  const [aba, setAba] = useState(() => { try { const v = localStorage.getItem('comercial-aba'); return v && v !== 'trials' ? v : 'hoje'; } catch { return 'hoje'; } });
  const [cfg, setCfg] = useState(null);
  const [painel, setPainel] = useState(null);
  const [erro, setErro] = useState('');
  const [versao, setVersao] = useState(0);
  const [aberto, setAberto] = useState(null); // undefined = fechado; null = novo; id
  const [modal, setModal] = useState(null);   // 'lista' | 'quadro'
  const [aviso, setAviso] = useState('');
  const [toque, setToque] = useState(null); // {lead, tipo, dia}
  const [escopo, setEscopo] = useState(() => { try { return localStorage.getItem('comercial-escopo') || (admin ? 'equipe' : 'meus'); } catch { return admin ? 'equipe' : 'meus'; } });
  const [tour, setTour] = useState(false);
  useEffect(() => { try { localStorage.setItem('comercial-escopo', escopo); } catch { /* ok */ } }, [escopo]);

  useEffect(() => { try { localStorage.setItem('comercial-aba', aba); } catch { /* ok */ } }, [aba]);

  useEffect(() => {
    api.get('/comercial/config').then((r) => { setCfg(r.data); setErro(''); }).catch((err) => setErro(mensagemDeErro(err, 'Não consegui abrir o Comercial.')));
  }, []);

  const recarregar = useCallback(() => setVersao((v) => v + 1), []);

  useEffect(() => {
    if (['funil', 'scripts', 'controles', 'ajuda', 'marketing'].includes(aba)) return;
    api.get('/comercial/painel').then((r) => { setPainel(r.data); setErro(''); }).catch((err) => setErro(mensagemDeErro(err)));
  }, [aba, versao]);

  useEffect(() => { if (!aviso) return undefined; const t = setTimeout(() => setAviso(''), 4000); return () => clearTimeout(t); }, [aviso]);

  async function marcarMarco(leadId, dia) {
    try { await api.post(`/comercial/leads/${leadId}/toques`, { tipo: 'marco', dia }); recarregar(); } catch (err) { setAviso(mensagemDeErro(err)); }
  }

  const abrir = (id) => setAberto({ id });

  // Sprint 42F — /comercial?lead=<id> abre a ficha (link "Abrir no Comercial" do card)
  const [params, setParams] = useSearchParams();
  useEffect(() => {
    const id = params.get('lead');
    if (!id) return;
    setAberto({ id });
    params.delete('lead');
    setParams(params, { replace: true });
  }, [params, setParams]);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <TrendingUp size={22} className="text-nexus-700" />
          <h1 className="text-xl font-semibold text-slate-900">Comercial</h1>
          <span className="text-sm text-slate-500">Seu Cartório</span>
        </div>
        <div className="flex items-center gap-2">
          {aviso && <span className="rounded-md bg-slate-900 px-3 py-1.5 text-sm text-white" role="status">{aviso}</span>}
          <button type="button" onClick={() => setAba('ajuda')} className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-sm text-nexus-700 hover:bg-nexus-50">
            <HelpCircle size={16} /> Dúvidas?
          </button>
        </div>
      </div>

      <div role="tablist" className="flex gap-1 overflow-x-auto border-b border-slate-200">
        {ABAS.map(([k, n]) => (
          <button key={k} type="button" role="tab" aria-selected={aba === k} onClick={() => setAba(k)}
            className={`whitespace-nowrap border-b-2 px-3 py-2 text-sm font-medium ${aba === k ? 'border-nexus-700 text-nexus-800' : 'border-transparent text-slate-500 hover:text-slate-800'}`}>
            {n}
          </button>
        ))}
      </div>

      {erro && <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">{erro}</div>}
      {!cfg ? <p className="text-sm text-slate-400">Carregando…</p> : (
        <>
          {aba === 'funil' && (
            <Funil cfg={cfg} admin={admin} gestor={!!cfg.eu?.gestor} versao={versao} onAbrir={abrir}
              onNovo={() => setAberto({ id: null })}
              onImportarLista={() => setModal('lista')}
              onImportarQuadro={() => setModal('quadro')} />
          )}
          {aba !== 'ajuda' && <ComoFunciona aba={aba} />}
          {aba === 'hoje' && (
            <div className="flex items-center gap-2 text-sm">
              <span className="text-slate-500">Mostrar:</span>
              {[['meus', 'Só os meus cartórios'], ['equipe', 'Toda a equipe']].map(([k, n]) => (
                <button key={k} type="button" onClick={() => setEscopo(k)}
                  className={`rounded-full px-3 py-1 ${escopo === k ? 'bg-nexus-700 text-white' : 'bg-white text-slate-600 ring-1 ring-slate-300 hover:bg-slate-50'}`}>{n}</button>
              ))}
            </div>
          )}
          {aba === 'ajuda' && <VistaAjuda cfg={cfg} onTour={() => setTour(true)} onProcesso={() => setAba('processo')} />}
          {aba === 'processo' && <VistaProcesso cfg={cfg} painel={painel} />}
          {aba === 'scripts' && <VistaScripts cfg={cfg} />}
          {aba === 'controles' && <VistaControles cfg={cfg} onMudou={recarregar} />}
          {aba === 'marketing' && <VistaMarketing cfg={cfg} onAviso={setAviso} />}
          {!['funil', 'scripts', 'controles', 'ajuda', 'marketing'].includes(aba) && !painel && <p className="text-sm text-slate-400">Carregando…</p>}
          {painel && aba === 'hoje' && (
            <VistaHoje painel={escopo === 'meus' ? soMeus(painel, cfg.eu.id) : painel} escopo={escopo} cfg={cfg} onAbrir={abrir} onMudou={recarregar}
              onAviso={setAviso}
              onToque={(lead, tipo, dia) => setToque({ lead, tipo, dia })} onMarco={marcarMarco} />
          )}
          {painel && aba === 'implantacao' && <VistaImplantacao painel={painel} cfg={cfg} onAbrir={abrir} />}
          {painel && aba === 'supervisao' && <VistaSupervisao painel={painel} cfg={cfg} onAbrir={abrir} onMudou={recarregar} />}
          {painel && aba === 'placar' && <VistaPlacar painel={painel} cfg={cfg} versao={versao} />}
          {painel && aba === 'metas' && <VistaMetas painel={painel} cfg={cfg} onSalvo={recarregar} />}
        </>
      )}

      {cfg && <Tour forcar={tour} onFechar={() => setTour(false)} />}
      {cfg && aberto && (
        <LeadDrawer id={aberto.id} cfg={cfg} padrao={{ origem: '', dono_id: pessoa?.id || '' }}
          onFechar={() => setAberto(null)} onMudou={recarregar}
          onCriado={(novo) => { setAviso('Cartório cadastrado. Veja o próximo passo na ficha.'); setAberto({ id: novo }); }} />
      )}
      {cfg && toque && (
        <ToqueModal cfg={cfg} lead={toque.lead} tipo={toque.tipo} dia={toque.dia}
          onFechar={() => setToque(null)} onFeito={() => { setToque(null); setAviso('Toque registrado.'); recarregar(); }} />
      )}
      {cfg && modal === 'lista' && <ImportarLista cfg={cfg} onFechar={() => setModal(null)} onFeito={(m) => { setModal(null); setAviso(m); recarregar(); }} />}
      {cfg && modal === 'quadro' && <ImportarQuadro cfg={cfg} onFechar={() => setModal(null)} onFeito={(m) => { setModal(null); setAviso(m); recarregar(); }} />}
    </div>
  );
}
