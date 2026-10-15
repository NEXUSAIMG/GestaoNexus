import { useState } from 'react';
import { api, mensagemDeErro } from '../../api/client.js';
import { Modal, Campo, Erro, inputCls, btnCls } from '../comercial/ui.jsx';
import { MODELOS } from './metodo.js';
import { Copiar, AvisoLgpd } from './ui.jsx';

const btnViol = 'inline-flex items-center justify-center gap-1.5 rounded-md bg-violet-700 px-3 py-1.5 text-sm font-medium text-white hover:bg-violet-800 disabled:opacity-50';
export { btnViol };

/**
 * Registrar uma atividade (contato feito) ou agendar (visita/reunião).
 * `passo` = passo da cadência sugerido; `modo` = 'feito' | 'agendado'.
 */
export function AtividadeModal({ cfg, escola, passo, tipoPadrao, modo = 'feito', onFechar, onFeito }) {
  const p = passo ? cfg.cadencia.find((c) => c.k === passo) : null;
  const [f, setF] = useState({
    tipo: tipoPadrao || p?.tipos[0] || (modo === 'agendado' ? 'diagnostico' : 'ligacao'),
    resultado: '', com_quem: '', nota: '', data: modo === 'agendado' ? '' : cfg.hoje, hora: '',
  });
  const [erro, setErro] = useState('');
  const [salvando, setSalvando] = useState(false);
  const info = cfg.tipos_atividade.find((t) => t.k === f.tipo);
  const tipos = p ? cfg.tipos_atividade.filter((t) => p.tipos.includes(t.k))
    : modo === 'agendado' ? cfg.tipos_atividade.filter((t) => t.reuniao || ['visita', 'ligacao'].includes(t.k))
      : cfg.tipos_atividade;
  const modelo = p ? MODELOS[p.modelo] : null;

  async function salvar() {
    setSalvando(true); setErro('');
    try {
      const corpo = { tipo: f.tipo, status: modo, com_quem: f.com_quem || null, nota: f.nota || null };
      if (p) corpo.passo = p.k;
      if (modo === 'feito' && info?.contato) corpo.resultado = f.resultado || null;
      if (modo === 'feito' && !info?.contato && f.resultado) corpo.resultado = f.resultado;
      if (f.data) corpo.data = f.data;
      if (f.hora) corpo.hora = f.hora;
      const r = await api.post(`/comercial/adaptai/escolas/${escola.id}/atividades`, corpo);
      onFeito(r.data, f);
    } catch (err) { setErro(mensagemDeErro(err)); } finally { setSalvando(false); }
  }

  return (
    <Modal titulo={modo === 'agendado' ? `Agendar · ${escola.nome}` : p ? `Cadência D${p.dia} · ${escola.nome}` : `Registrar contato · ${escola.nome}`}
      onFechar={onFechar} largura="max-w-xl"
      rodape={<><button type="button" className={btnCls} onClick={onFechar}>Cancelar</button>
        <button type="button" className={btnViol} disabled={salvando} onClick={salvar}>{salvando ? 'Salvando…' : modo === 'agendado' ? 'Agendar' : 'Registrar'}</button></>}>
      {p && (
        <div className="rounded-lg bg-violet-50 px-3 py-2 text-sm text-violet-900">
          <b>{p.canal}:</b> {p.acao}. <span className="text-violet-700">Objetivo: {p.objetivo}.</span>
        </div>
      )}
      {modelo && (
        <div className="rounded-lg border border-slate-200 bg-slate-50 p-3 text-sm">
          <div className="mb-1 flex items-center justify-between"><span className="text-xs font-semibold uppercase text-slate-500">Modelo · {modelo.canal}</span><Copiar texto={(modelo.assunto ? 'Assunto: ' + modelo.assunto + '\n\n' : '') + modelo.texto} /></div>
          {modelo.assunto && <p className="mb-1 text-xs text-slate-500">Assunto: {modelo.assunto}</p>}
          <p className="whitespace-pre-line text-slate-700">{modelo.texto}</p>
        </div>
      )}
      <div className="grid grid-cols-2 gap-3">
        <Campo rotulo="Tipo">
          <select className={inputCls} value={f.tipo} onChange={(e) => setF({ ...f, tipo: e.target.value })}>
            {tipos.map((t) => <option key={t.k} value={t.k}>{t.n}</option>)}
          </select>
        </Campo>
        <Campo rotulo="Com quem (cargo ou nome profissional)">
          <input className={inputCls} value={f.com_quem} maxLength={160} onChange={(e) => setF({ ...f, com_quem: e.target.value })} placeholder="Ex.: coordenadora do AEE" />
        </Campo>
        {modo === 'agendado' ? (
          <>
            <Campo rotulo="Data"><input type="date" className={inputCls} min={cfg.hoje} value={f.data} onChange={(e) => setF({ ...f, data: e.target.value })} /></Campo>
            <Campo rotulo="Hora"><input type="time" className={inputCls} value={f.hora} onChange={(e) => setF({ ...f, hora: e.target.value })} /></Campo>
          </>
        ) : (info?.contato || f.tipo === 'outro') && (
          <Campo rotulo="Resultado" className="col-span-2">
            <div className="flex flex-wrap gap-1.5">
              {cfg.resultados.map((r) => (
                <button key={r.k} type="button" onClick={() => setF({ ...f, resultado: r.k })}
                  className={`rounded-full px-2.5 py-1 text-xs font-medium ring-1 ring-inset ${f.resultado === r.k ? 'bg-violet-700 text-white ring-violet-700' : 'bg-white text-slate-600 ring-slate-300 hover:bg-slate-50'}`}>{r.n}</button>
              ))}
            </div>
          </Campo>
        )}
      </div>
      <Campo rotulo={modo === 'agendado' ? 'Observação' : 'O que ouviu (dores, nas palavras da escola)'}>
        <textarea className={inputCls} rows={3} value={f.nota} maxLength={4000} onChange={(e) => setF({ ...f, nota: e.target.value })} />
      </Campo>
      <AvisoLgpd />
      {f.resultado === 'agendou' && modo === 'feito' && <p className="text-xs text-violet-700">Depois de registrar, agende a reunião na ficha (botão “Agendar”).</p>}
      <Erro>{erro}</Erro>
    </Modal>
  );
}

export function DesfechoModal({ cfg, atividade, onFechar, onFeito }) {
  const [resultado, setResultado] = useState('');
  const [nota, setNota] = useState('');
  const [erro, setErro] = useState('');
  async function enviar(status) {
    setErro('');
    try {
      const r = await api.post(`/comercial/adaptai/atividades/${atividade.id}/desfecho`, { status, resultado: resultado || null, nota: nota || null });
      onFeito(r.data, status);
    } catch (err) { setErro(mensagemDeErro(err)); }
  }
  const nome = cfg.tipos_atividade.find((t) => t.k === atividade.tipo)?.n || atividade.tipo;
  return (
    <Modal titulo={`Como foi? · ${nome}`} onFechar={onFechar}
      rodape={<><button type="button" className={btnCls} onClick={() => enviar('cancelado')}>Não aconteceu</button>
        <button type="button" className={btnViol} onClick={() => enviar('feito')}>Foi realizada</button></>}>
      <Campo rotulo="Resultado (opcional)">
        <select className={inputCls} value={resultado} onChange={(e) => setResultado(e.target.value)}>
          <option value="">—</option>
          {cfg.resultados.map((r) => <option key={r.k} value={r.k}>{r.n}</option>)}
        </select>
      </Campo>
      <Campo rotulo="Resumo em 3 linhas (o que ouviu e o combinado)">
        <textarea className={inputCls} rows={3} value={nota} onChange={(e) => setNota(e.target.value)} />
      </Campo>
      <AvisoLgpd />
      <Erro>{erro}</Erro>
    </Modal>
  );
}

export function MotivoModal({ titulo, explicacao, rotulo = 'Motivo', min = 5, onFechar, onConfirmar }) {
  const [v, setV] = useState('');
  const [erro, setErro] = useState('');
  return (
    <Modal titulo={titulo} onFechar={onFechar}
      rodape={<><button type="button" className={btnCls} onClick={onFechar}>Cancelar</button>
        <button type="button" className={btnViol} disabled={v.trim().length < min}
          onClick={async () => { try { await onConfirmar(v.trim()); } catch (err) { setErro(mensagemDeErro(err)); } }}>Confirmar</button></>}>
      {explicacao && <p className="text-sm text-slate-600">{explicacao}</p>}
      <Campo rotulo={rotulo}><textarea className={inputCls} rows={3} value={v} onChange={(e) => setV(e.target.value)} /></Campo>
      <Erro>{erro}</Erro>
    </Modal>
  );
}
