import { useCallback, useEffect, useState } from 'react';
import { TrendingUp } from 'lucide-react';
import { api, mensagemDeErro } from '../api/client.js';
import { useAuth } from '../context/AuthContext.jsx';
import Funil from '../components/comercial/Funil.jsx';
import LeadDrawer from '../components/comercial/LeadDrawer.jsx';
import { ImportarLista, ImportarQuadro } from '../components/comercial/Importar.jsx';
import {
  VistaHoje, VistaTrials, VistaSupervisao, VistaMetas, VistaScripts, VistaPlacar, VistaControles,
} from '../components/comercial/Vistas.jsx';
import { ToqueModal } from '../components/comercial/Acoes.jsx';

/**
 * Comercial — Sprint 42.
 *
 * Funil de vendas do Seu Cartório com a metodologia de venda SaaS:
 * Hoje (o que fazer), Funil, Trials, Supervisão (semáforo por pessoa),
 * Metas (desdobramento + taxas reais + motivos de perda) e Scripts.
 * Todos os cálculos vêm prontos do backend (GET /comercial/painel).
 */

const ABAS = [
  ['hoje', 'Hoje'], ['funil', 'Funil'], ['trials', 'Trials'],
  ['supervisao', 'Supervisão'], ['placar', 'Placar'], ['metas', 'Metas e indicadores'],
  ['controles', 'Controles'], ['scripts', 'Scripts'],
];

export default function Comercial() {
  const { pessoa } = useAuth();
  const admin = !!pessoa?.administrador;
  const [aba, setAba] = useState(() => { try { return localStorage.getItem('comercial-aba') || 'hoje'; } catch { return 'hoje'; } });
  const [cfg, setCfg] = useState(null);
  const [painel, setPainel] = useState(null);
  const [erro, setErro] = useState('');
  const [versao, setVersao] = useState(0);
  const [aberto, setAberto] = useState(null); // undefined = fechado; null = novo; id
  const [modal, setModal] = useState(null);   // 'lista' | 'quadro'
  const [aviso, setAviso] = useState('');
  const [toque, setToque] = useState(null); // {lead, tipo, dia}

  useEffect(() => { try { localStorage.setItem('comercial-aba', aba); } catch { /* ok */ } }, [aba]);

  useEffect(() => {
    api.get('/comercial/config').then((r) => setCfg(r.data)).catch((err) => setErro(mensagemDeErro(err, 'Não consegui abrir o Comercial.')));
  }, []);

  const recarregar = useCallback(() => setVersao((v) => v + 1), []);

  useEffect(() => {
    if (['funil', 'scripts', 'controles'].includes(aba)) return;
    api.get('/comercial/painel').then((r) => setPainel(r.data)).catch((err) => setErro(mensagemDeErro(err)));
  }, [aba, versao]);

  useEffect(() => { if (!aviso) return undefined; const t = setTimeout(() => setAviso(''), 4000); return () => clearTimeout(t); }, [aviso]);

  async function marcarMarco(leadId, dia) {
    try { await api.post(`/comercial/leads/${leadId}/toques`, { tipo: 'marco', dia }); recarregar(); } catch (err) { setAviso(mensagemDeErro(err)); }
  }

  const abrir = (id) => setAberto({ id });

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <TrendingUp size={22} className="text-nexus-700" />
          <h1 className="text-xl font-semibold text-slate-900">Comercial</h1>
          <span className="text-sm text-slate-500">Seu Cartório</span>
        </div>
        {aviso && <span className="rounded-md bg-slate-900 px-3 py-1.5 text-sm text-white">{aviso}</span>}
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
            <Funil cfg={cfg} admin={admin} versao={versao} onAbrir={abrir}
              onNovo={() => setAberto({ id: null })}
              onImportarLista={() => setModal('lista')}
              onImportarQuadro={() => setModal('quadro')} />
          )}
          {aba === 'scripts' && <VistaScripts cfg={cfg} />}
          {aba === 'controles' && <VistaControles cfg={cfg} onMudou={recarregar} />}
          {!['funil', 'scripts', 'controles'].includes(aba) && !painel && <p className="text-sm text-slate-400">Carregando…</p>}
          {painel && aba === 'hoje' && (
            <VistaHoje painel={painel} cfg={cfg} onAbrir={abrir} onMudou={recarregar}
              onToque={(lead, tipo, dia) => setToque({ lead, tipo, dia })} onMarco={marcarMarco} />
          )}
          {painel && aba === 'trials' && <VistaTrials painel={painel} cfg={cfg} onAbrir={abrir} />}
          {painel && aba === 'supervisao' && <VistaSupervisao painel={painel} cfg={cfg} onAbrir={abrir} onMudou={recarregar} />}
          {painel && aba === 'placar' && <VistaPlacar painel={painel} cfg={cfg} versao={versao} />}
          {painel && aba === 'metas' && <VistaMetas painel={painel} cfg={cfg} onSalvo={recarregar} />}
        </>
      )}

      {cfg && aberto && (
        <LeadDrawer id={aberto.id} cfg={cfg} padrao={{ origem: '', dono_id: pessoa?.id || '' }}
          onFechar={() => setAberto(null)} onMudou={recarregar} />
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
