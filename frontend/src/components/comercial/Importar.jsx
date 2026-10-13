import { useEffect, useState } from 'react';
import { X } from 'lucide-react';
import { api, mensagemDeErro } from '../../api/client.js';
import { Campo, inputCls, btnCls, btnPrimCls } from './ui.jsx';

function Modal({ titulo, onFechar, children, rodape }) {
  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-slate-900/30 p-4 pt-12">
      <div className="w-full max-w-2xl rounded-lg bg-white shadow-xl" role="dialog" aria-modal="true" aria-label={titulo}>
        <div className="flex items-center justify-between border-b border-slate-200 px-5 py-3">
          <h2 className="text-base font-semibold text-slate-900">{titulo}</h2>
          <button type="button" onClick={onFechar} className="rounded p-1 text-slate-500 hover:bg-slate-100" aria-label="Fechar"><X size={18} /></button>
        </div>
        <div className="space-y-3 px-5 py-4">{children}</div>
        <div className="flex justify-end gap-2 border-t border-slate-200 px-5 py-3">{rodape}</div>
      </div>
    </div>
  );
}

const MOTIVO_RECUSA = { duplicado: 'já no funil (ou repetido na lista)', nao_contatar: 'na lista de não contatar', ja_cliente: 'já cliente', invalido: 'dado inválido' };
const LIMITE = 2000;

function baixarCsv(nome, linhas) {
  const esc = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`;
  const csv = '﻿' + linhas.map((l) => l.map(esc).join(';')).join('\r\n');
  const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
  const a = document.createElement('a'); a.href = url; a.download = nome; a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/** Colar lista de cartórios (uma linha por cartório). */
export function ImportarLista({ cfg, onFechar, onFeito }) {
  const [texto, setTexto] = useState('');
  const [origem, setOrigem] = useState('prospeccao');
  const [campanha, setCampanha] = useState('');
  const [dono, setDono] = useState('');
  const [etapa, setEtapa] = useState('prospect');
  const [msg, setMsg] = useState('');
  const [enviando, setEnviando] = useState(false);
  const [resultado, setResultado] = useState(null);

  const linhas = texto.split(/\r?\n/).map((s) => s.trim()).filter(Boolean)
    .filter((s) => !/^nome\s*[;\t]/i.test(s))
    .map((s) => { const p = s.split(/[;\t]/).map((x) => x.trim()); return { nome: p[0], cidade: p[1] || null, uf: p[2] || null, telefone: p[3] || null, email: p[4] || null, segmento: p[5] || null, contato: p[6] || null, cns: p[7] || null, cnpj: p[8] || null }; })
    .filter((l) => l.nome);

  async function importar() {
    if (!linhas.length) { setMsg('Cole ao menos uma linha com o nome do cartório.'); return; }
    if (linhas.length > LIMITE) { setMsg(`A lista tem ${linhas.length} linhas; o limite é ${LIMITE.toLocaleString('pt-BR')} por vez. Divida em partes.`); return; }
    if (etapa === 'cadencia' && !dono) { setMsg('Para entrar direto em cadência, escolha o responsável (alguém precisa fazer o toque do dia 1 hoje).'); return; }
    setEnviando(true); setMsg('');
    try {
      const r = await api.post('/comercial/leads/importar-lista', { linhas, origem, campanha: campanha || null, dono_id: dono || null, etapa });
      setResultado(r.data);
    } catch (err) { setMsg(mensagemDeErro(err)); } finally { setEnviando(false); }
  }

  if (resultado) {
    const rec = resultado.lista_recusados || [];
    const resumo = `${resultado.criados} cartório(s) importado(s)${rec.length ? `, ${rec.length} recusado(s)` : ''}.`;
    return (
      <Modal titulo="Resultado da importação" onFechar={() => onFeito(resumo)} rodape={<>
        {rec.length > 0 && (
          <button type="button" className={btnCls} onClick={() => baixarCsv('recusados.csv', [['Linha', 'Nome', 'Motivo', 'Detalhe'], ...rec.map((x) => [x.linha, x.nome, MOTIVO_RECUSA[x.motivo] || x.motivo, x.mensagem])])}>
            Baixar recusados (CSV)
          </button>
        )}
        <button type="button" className={btnPrimCls} onClick={() => onFeito(resumo)}>Concluir</button>
      </>}>
        <p className="text-sm text-slate-700"><b>{resultado.criados}</b> cartório(s) entraram {dono ? 'no funil' : 'na fila ("Em prospecção" sem responsável) — a equipe pega em Hoje → “Pegar para mim”'}.</p>
        {rec.length > 0 && (
          <>
            <p className="text-sm text-slate-700">
              <b>{rec.length}</b> recusado(s): {Object.entries(resultado.recusados_por_motivo).map(([k, n]) => `${n} ${MOTIVO_RECUSA[k] || k}`).join(' · ')}.
              Corrija os inválidos e importe só eles de novo.
            </p>
            <ul className="max-h-64 divide-y divide-slate-100 overflow-y-auto rounded-md border border-slate-200 text-xs">
              {rec.map((x) => (
                <li key={x.linha} className="flex gap-2 px-2 py-1">
                  <span className="w-12 shrink-0 text-slate-400">linha {x.linha}</span>
                  <span className="min-w-0 flex-1"><b className="text-slate-800">{x.nome}</b> — {x.mensagem}</span>
                </li>
              ))}
            </ul>
          </>
        )}
      </Modal>
    );
  }

  return (
    <Modal titulo="Importar lista de cartórios" onFechar={onFechar} rodape={<>
      <button type="button" className={btnCls} onClick={onFechar}>Cancelar</button>
      <button type="button" className={btnPrimCls} onClick={importar} disabled={enviando}>{enviando ? 'Importando…' : `Importar ${linhas.length || ''}`}</button>
    </>}>
      <p className="text-sm text-slate-600">Cole uma linha por cartório, campos separados por ponto e vírgula ou tabulação (colar direto da planilha funciona). Até 2.000 linhas por vez. Linha com dado inválido ou repetido é recusada sozinha e aparece no resultado.</p>
      <pre className="overflow-x-auto rounded-md bg-slate-50 p-2 text-xs text-slate-600">Nome; Cidade; UF; Telefone; E-mail; Segmento; Titular; CNS; CNPJ{'\n'}1º Ofício de Registro Civil; Castanhal; PA; (91) 99999-0000; contato@cartorio.com.br; Registro Civil; Dra. Ana; 067954; 00000000000100</pre>
      <div className="grid grid-cols-2 gap-3">
        <Campo rotulo="Origem *">
          <select className={inputCls} value={origem} onChange={(e) => setOrigem(e.target.value)}>
            {Object.entries(cfg.origens).map(([k, n]) => <option key={k} value={k}>{n}</option>)}
          </select>
        </Campo>
        <Campo rotulo="Campanha / onda"><input className={inputCls} value={campanha} onChange={(e) => setCampanha(e.target.value)} placeholder="ex.: E-mail onda 1" /></Campo>
        <Campo rotulo="Entram como">
          <select className={inputCls} value={etapa} onChange={(e) => { setEtapa(e.target.value); if (e.target.value === 'cadencia' && !dono) setDono(cfg.eu?.id || ''); }}>
            <option value="prospect">Em prospecção</option><option value="cadencia">Em contatos (começa hoje)</option>
          </select>
        </Campo>
        <Campo rotulo={`Responsável${etapa === 'cadencia' ? ' *' : ''}`}>
          <select className={inputCls} value={dono} onChange={(e) => setDono(e.target.value)}>
            {etapa === 'prospect' && <option value="">Ninguém — vai para a fila</option>}
            {etapa === 'cadencia' && !dono && <option value="">Escolha…</option>}
            {cfg.pessoas.map((p) => <option key={p.id} value={p.id}>{p.nome}</option>)}
          </select>
        </Campo>
      </div>
      {etapa === 'prospect' && !dono && <p className="text-xs text-slate-500">Sem responsável, os cartórios ficam na fila: cada pessoa pega um lote em Hoje (“Pegar para mim”) e o prazo começa a contar aí.</p>}
      <Campo rotulo="Lista"><textarea className={inputCls + ' min-h-[200px] font-mono text-xs'} value={texto} onChange={(e) => setTexto(e.target.value)} placeholder="Cole aqui" /></Campo>
      {linhas.length > LIMITE && <p className="text-sm text-amber-800">{linhas.length} linhas — acima do limite de {LIMITE.toLocaleString('pt-BR')} por vez.</p>}
      {msg && <p className="text-sm text-red-700">{msg}</p>}
    </Modal>
  );
}

/** Trazer os cards do quadro Kanban (ex.: "Atividade Comercial"). Só admin. */
export function ImportarQuadro({ cfg, onFechar, onFeito }) {
  const [quadros, setQuadros] = useState([]);
  const [quadroId, setQuadroId] = useState('');
  const [previa, setPrevia] = useState(null);
  const [mapa, setMapa] = useState({});
  const [origem, setOrigem] = useState('prospeccao');
  const [campanha, setCampanha] = useState('');
  const [etiqueta, setEtiqueta] = useState('');
  const [msg, setMsg] = useState('');
  const [enviando, setEnviando] = useState(false);
  // Sprint 42F — quadro e Comercial em espelho depois de importar
  const [espelhar, setEspelhar] = useState(true);
  const [criarCards, setCriarCards] = useState(true);

  useEffect(() => {
    api.get('/comercial/importar-quadro/previa').then((r) => {
      setQuadros(r.data.quadros);
      const ac = r.data.quadros.find((q) => /comercial/i.test(q.nome));
      if (ac) setQuadroId(ac.id);
    }).catch((err) => setMsg(mensagemDeErro(err)));
  }, []);

  useEffect(() => {
    if (!quadroId) { setPrevia(null); return; }
    api.get('/comercial/importar-quadro/previa', { params: { quadro_id: quadroId } }).then((r) => {
      setPrevia(r.data);
      setMapa(Object.fromEntries(r.data.colunas.map((c) => [c.id, c.etapa_sugerida])));
      const cli = (r.data.etiquetas || []).find((e) => e.nome.trim().toLowerCase() === 'cliente');
      setEtiqueta(r.data.espelho ? (r.data.espelho.somente_etiqueta || '') : (cli ? cli.nome : ''));
      if (r.data.espelho) { setEspelhar(!!r.data.espelho.ativo); setCriarCards(!!r.data.espelho.criar_cards); }
    }).catch((err) => setMsg(mensagemDeErro(err)));
  }, [quadroId]);

  async function importar() {
    setEnviando(true); setMsg('');
    try {
      const r = await api.post('/comercial/importar-quadro', { quadro_id: quadroId, mapa, origem_padrao: origem, campanha: campanha || null, somente_etiqueta: etiqueta || null, espelhar, criar_cards: criarCards }, { timeout: 120_000 });
      onFeito(`${r.data.criados} cartório(s) importado(s); ${r.data.pulados} já estavam no funil; ${r.data.ignorados} ignorado(s); ${r.data.bloqueados || 0} bloqueado(s) (não contatar ou já cliente).${r.data.espelho ? ' Quadro e Comercial agora andam juntos.' : ''}`);
    } catch (err) { setMsg(mensagemDeErro(err)); } finally { setEnviando(false); }
  }

  return (
    <Modal titulo="Importar e ligar o quadro Kanban" onFechar={onFechar} rodape={<>
      <button type="button" className={btnCls} onClick={onFechar}>Cancelar</button>
      <button type="button" className={btnPrimCls} onClick={importar} disabled={enviando || !previa}>{enviando ? 'Importando…' : 'Importar'}</button>
    </>}>
      <p className="text-sm text-slate-600">
        Cada card vira um cartório no funil. Nome = título; responsável = primeiro responsável do card; Cidade/UF, E-mail, Telefone,
        Representante e Origem vêm dos campos personalizados; Termômetro, Faturamento e descrição vão para as anotações.
        Pode rodar de novo: card já importado é pulado (é também como se ajusta o mapa do espelho).
      </p>
      <Campo rotulo="Quadro">
        <select className={inputCls} value={quadroId} onChange={(e) => setQuadroId(e.target.value)}>
          <option value="">Escolha…</option>
          {quadros.map((q) => <option key={q.id} value={q.id}>{q.nome} ({q.cards} cards)</option>)}
        </select>
      </Campo>
      {previa && (
        <>
          {previa.ja_importados > 0 && <p className="text-xs text-amber-700">{previa.ja_importados} card(s) deste quadro já estão no funil e serão pulados.</p>}
          <div className="rounded-md border border-slate-200">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500"><tr><th className="px-3 py-2">Coluna do quadro</th><th className="px-3 py-2">Cards</th><th className="px-3 py-2">Vira a etapa</th></tr></thead>
              <tbody className="divide-y divide-slate-100">
                {previa.colunas.map((c) => (
                  <tr key={c.id}>
                    <td className="px-3 py-1.5">{c.nome}{mapa[c.id] === 'ganho' && c.marco != null && <span className="block text-[11px] text-slate-500">implantação: marco D{c.marco}</span>}</td>
                    <td className="px-3 py-1.5 font-mono">{c.cards}</td>
                    <td className="px-3 py-1.5">
                      <select className={inputCls} value={mapa[c.id] || 'ignorar'} onChange={(e) => setMapa({ ...mapa, [c.id]: e.target.value })}>
                        {cfg.etapas.map((e) => <option key={e.k} value={e.k}>{e.n}</option>)}
                        <option value="ignorar">Não importar</option>
                      </select>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <Campo rotulo="Quais cards importar">
            <select className={inputCls} value={etiqueta} onChange={(e) => setEtiqueta(e.target.value)}>
              <option value="">Todos os cards das colunas mapeadas</option>
              {(previa.etiquetas || []).map((e) => <option key={e.nome} value={e.nome}>Só os com a etiqueta “{e.nome}” ({e.cards})</option>)}
            </select>
          </Campo>
          <div className="grid grid-cols-2 gap-3">
            <Campo rotulo="Origem quando o card não tiver">
              <select className={inputCls} value={origem} onChange={(e) => setOrigem(e.target.value)}>
                {Object.entries(cfg.origens).map(([k, n]) => <option key={k} value={k}>{n}</option>)}
              </select>
            </Campo>
            <Campo rotulo="Campanha (opcional)"><input className={inputCls} value={campanha} onChange={(e) => setCampanha(e.target.value)} /></Campo>
          </div>
          <div className="space-y-2 rounded-md border border-indigo-200 bg-indigo-50 p-3 text-sm text-indigo-950">
            <label className="flex items-start gap-2">
              <input type="checkbox" className="mt-0.5" checked={espelhar} onChange={(e) => setEspelhar(e.target.checked)} />
              <span><b>Manter o quadro e o Comercial em espelho.</b> Mover o card muda a etapa no Comercial (respeitando o que cada etapa exige) e mudar a etapa no Comercial move o card. Nome, responsável e contatos ficam iguais nos dois. Card novo numa coluna mapeada vira lead{etiqueta ? ` (só com a etiqueta “${etiqueta}”)` : ''}. Nas colunas da implantação, entrar na coluna marca os marcos anteriores.</span>
            </label>
            {espelhar && (
              <label className="flex items-start gap-2 pl-6">
                <input type="checkbox" className="mt-0.5" checked={criarCards} onChange={(e) => setCriarCards(e.target.checked)} />
                <span>Lead cadastrado no Comercial também ganha um card no quadro.</span>
              </label>
            )}
          </div>
          <p className="text-xs text-slate-500">"Em prospecção" entra sem responsável, na fila: a equipe pega em lotes em Hoje. Perdido recebe o motivo pelo nome da coluna (“Fora do funil” = Sem interesse; “Desistência” = Desistiu depois de usar), senão “Outro”. Ganho entra sem valor e já em implantação — completem no funil. As datas vêm do card, então ganhos antigos não contam como ganhos deste mês.</p>
        </>
      )}
      {msg && <p className="text-sm text-red-700">{msg}</p>}
    </Modal>
  );
}
