import { useState } from 'react';
import { api, mensagemDeErro } from '../../api/client.js';
import { Modal, Erro, Campo, inputCls, btnCls, btnPrimCls, localParaIso } from './ui.jsx';
import { Dica } from './Ajuda.jsx';

/**
 * Modais de registro do módulo Comercial (Sprint 42B).
 * Cada um faz a sua chamada e devolve o resultado em onFeito(dados).
 */

function Botoes({ onFechar, enviando, rotulo = 'Registrar', onClick }) {
  return (
    <>
      <button type="button" className={btnCls} onClick={onFechar}>Cancelar</button>
      <button type="button" className={btnPrimCls} onClick={onClick} disabled={enviando}>{enviando ? 'Salvando…' : rotulo}</button>
    </>
  );
}

function useEnvio(onFeito) {
  const [erro, setErro] = useState('');
  const [enviando, setEnviando] = useState(false);
  async function enviar(fn) {
    setErro(''); setEnviando(true);
    try { const r = await fn(); onFeito(r?.data); } catch (err) { setErro(mensagemDeErro(err)); } finally { setEnviando(false); }
  }
  return { erro, setErro, enviando, enviar };
}

const NEGOCIANDO = ['diagnostico', 'proposta', 'corregedoria'];

/** Registrar toque (cadência ou avulso) com resultado obrigatório. */
export function ToqueModal({ cfg, lead, tipo, dia, canal: canalPadrao, onFechar, onFeito }) {
  const passo = tipo === 'cadencia' ? cfg.cadencia.find((c) => c.d === dia) : null;
  const [canal, setCanal] = useState(canalPadrao || passo?.canal || 'Ligação');
  const [resultado, setResultado] = useState('');
  const [duracao, setDuracao] = useState('');
  const [nota, setNota] = useState('');
  const [reuniao, setReuniao] = useState({ tipo: 'diagnostico', inicio: '' });
  const [proximo, setProximo] = useState({ passo: '', data: '' });
  const { erro, setErro, enviando, enviar } = useEnvio(onFeito);
  const pedeProximo = tipo === 'avulso' && NEGOCIANDO.includes(lead.etapa);
  const ehLigacao = /liga/i.test(canal);

  function registrar() {
    if (!resultado) { setErro('Escolha o resultado.'); return; }
    if (resultado === 'agendou' && !reuniao.inicio) { setErro('Informe data e hora da reunião.'); return; }
    if (proximo.passo && !proximo.data) { setErro('Informe a data do próximo passo (sem data ele não aparece em Hoje).'); return; }
    if (pedeProximo && 'proxima_data' in lead && !(proximo.passo && proximo.data) && !(lead.proxima_data && lead.proxima_data >= cfg.hoje)) {
      setErro('Lead em negociação: registre o próximo passo e a data.'); return;
    }
    const corpo = {
      tipo, dia: tipo === 'avulso' ? null : dia, canal, resultado,
      duracao_min: duracao === '' ? null : Number(duracao), nota: nota || null,
      proximo_passo: proximo.passo || null, proxima_data: proximo.data || null,
    };
    if (resultado === 'agendou') corpo.reuniao = { tipo: reuniao.tipo, inicio: localParaIso(reuniao.inicio) };
    enviar(() => api.post(`/comercial/leads/${lead.id}/toques`, corpo));
  }

  return (
    <Modal titulo={`${tipo === 'cadencia' ? `Toque dia ${dia}` : 'Registrar contato'} · ${lead.nome}`} onFechar={onFechar}
      rodape={<Botoes onFechar={onFechar} enviando={enviando} onClick={registrar} />}>
      {passo && <p className="text-sm text-slate-600"><b>{passo.canal}</b> — {passo.acao}</p>}
      <Erro>{erro}</Erro>
      <div className="grid grid-cols-2 gap-3">
        <Campo rotulo="Canal">
          <select className={inputCls} value={canal} onChange={(e) => setCanal(e.target.value)}>
            {['Ligação', 'WhatsApp', 'E-mail', 'Ligação + WhatsApp', 'Reunião', 'Visita', 'Evento'].map((c) => <option key={c}>{c}</option>)}
          </select>
        </Campo>
        {ehLigacao && (
          <Campo rotulo="Duração (min)"><input type="number" min="0" className={inputCls} value={duracao} onChange={(e) => setDuracao(e.target.value)} /></Campo>
        )}
      </div>
      <fieldset>
        <legend className="mb-1 flex items-center gap-1 text-xs font-medium text-slate-600">Resultado * <Dica termo="conexao" /></legend>
        <p className="mb-2 text-xs text-slate-500">Escolha o que aconteceu, mesmo que não tenha atendido. “Agendou reunião” já pede data e hora{['prospect', 'cadencia'].includes(lead.etapa) ? '; se for reunião de diagnóstico, o cartório passa para Reunião de apresentação' : ''}.</p>
        <div className="grid grid-cols-2 gap-1.5">
          {cfg.resultados.map((r) => (
            <label key={r.k} className={`flex cursor-pointer items-center gap-2 rounded-md border px-2 py-1.5 text-sm ${resultado === r.k ? 'border-nexus-500 bg-nexus-50' : 'border-slate-200'}`}>
              <input type="radio" name="resultado" value={r.k} checked={resultado === r.k} onChange={() => setResultado(r.k)} />
              {r.n}
            </label>
          ))}
        </div>
      </fieldset>
      {resultado === 'agendou' && (
        <div className="grid grid-cols-2 gap-3 rounded-md bg-nexus-50 p-3">
          <Campo rotulo="Tipo de reunião">
            <select className={inputCls} value={reuniao.tipo} onChange={(e) => setReuniao({ ...reuniao, tipo: e.target.value })}>
              {Object.entries(cfg.tipos_reuniao).map(([k, n]) => <option key={k} value={k}>{n}</option>)}
            </select>
          </Campo>
          <Campo rotulo="Data e hora *"><input type="datetime-local" className={inputCls} value={reuniao.inicio} onChange={(e) => setReuniao({ ...reuniao, inicio: e.target.value })} /></Campo>
          <AvisoRetroativo inicio={reuniao.inicio} cfg={cfg} />
        </div>
      )}
      <Campo rotulo="Observação"><input className={inputCls} value={nota} onChange={(e) => setNota(e.target.value)} placeholder="O que foi dito, objeção, quem atendeu" /></Campo>
      {(pedeProximo || tipo === 'avulso') && (
        <div className="grid grid-cols-2 gap-3">
          <Campo rotulo={`Próximo passo${pedeProximo ? ' *' : ''}`}><input className={inputCls} value={proximo.passo} onChange={(e) => setProximo({ ...proximo, passo: e.target.value })} /></Campo>
          <Campo rotulo={`Data${pedeProximo ? ' *' : ''}`}><input type="date" min={cfg.hoje} className={inputCls} value={proximo.data} onChange={(e) => setProximo({ ...proximo, data: e.target.value })} /></Campo>
        </div>
      )}
    </Modal>
  );
}

/** Reunião mais de 1h no passado é registro retroativo: só a gestão. */
function AvisoRetroativo({ inicio, cfg }) {
  if (!inicio || new Date(inicio).getTime() >= Date.now() - 3600_000) return null;
  return (
    <p className="col-span-2 text-xs text-amber-800">
      Data no passado = registro retroativo. {cfg.eu?.gestor ? 'Você é gestão: fica registrado como retroativo no histórico.' : 'Só a gestão comercial pode registrar; peça a ela.'}
    </p>
  );
}

/** Estorno: substitui o "apagar". Exige motivo. */
export function EstornoModal({ titulo, url, corpoExtra = {}, onFechar, onFeito }) {
  const [motivo, setMotivo] = useState('');
  const { erro, enviando, enviar } = useEnvio(onFeito);
  return (
    <Modal titulo={titulo || 'Estornar registro'} onFechar={onFechar}
      rodape={<Botoes onFechar={onFechar} enviando={enviando} rotulo="Estornar" onClick={() => enviar(() => api.post(url, { ...corpoExtra, motivo }))} />}>
      <p className="text-sm text-slate-600">O registro não é apagado: fica no histórico como estornado, com quem estornou e o motivo. Só quem registrou pode estornar, no mesmo dia; depois disso, só a gestão.</p>
      <Erro>{erro}</Erro>
      <Campo rotulo="Motivo *"><input className={inputCls} value={motivo} onChange={(e) => setMotivo(e.target.value)} placeholder="ex.: marquei no cartório errado" autoFocus /></Campo>
    </Modal>
  );
}

/** Pede um texto obrigatório (justificativa, motivo de arquivamento). */
export function TextoModal({ titulo, explicacao, rotulo, onFechar, onConfirmar }) {
  const [v, setV] = useState('');
  const [erro, setErro] = useState('');
  return (
    <Modal titulo={titulo} onFechar={onFechar} rodape={<Botoes onFechar={onFechar} rotulo="Confirmar" onClick={() => {
      if (v.trim().length < 10) { setErro('Escreva pelo menos 10 caracteres.'); return; }
      onConfirmar(v.trim());
    }} />}>
      {explicacao && <p className="text-sm text-slate-600">{explicacao}</p>}
      <Erro>{erro}</Erro>
      <Campo rotulo={rotulo || 'Justificativa *'}><textarea className={inputCls + ' min-h-[80px]'} value={v} onChange={(e) => setV(e.target.value)} autoFocus /></Campo>
    </Modal>
  );
}

export function ReuniaoModal({ cfg, lead, tipoPadrao = 'diagnostico', onFechar, onFeito }) {
  const [f, setF] = useState({ tipo: tipoPadrao, inicio: '', participantes: '', nota: '' });
  const { erro, setErro, enviando, enviar } = useEnvio(onFeito);
  return (
    <Modal titulo={`Agendar reunião · ${lead.nome}`} onFechar={onFechar}
      rodape={<Botoes onFechar={onFechar} enviando={enviando} rotulo="Agendar" onClick={() => {
        if (!f.inicio) { setErro('Informe data e hora.'); return; }
        enviar(() => api.post(`/comercial/leads/${lead.id}/reunioes`, { ...f, inicio: localParaIso(f.inicio), participantes: f.participantes || null, nota: f.nota || null }));
      }} />}>
      <Erro>{erro}</Erro>
      <div className="grid grid-cols-2 gap-3">
        <Campo rotulo="Tipo">
          <select className={inputCls} value={f.tipo} onChange={(e) => setF({ ...f, tipo: e.target.value })}>
            {Object.entries(cfg.tipos_reuniao).map(([k, n]) => <option key={k} value={k}>{n}</option>)}
          </select>
        </Campo>
        <Campo rotulo="Data e hora *"><input type="datetime-local" className={inputCls} value={f.inicio} onChange={(e) => setF({ ...f, inicio: e.target.value })} /></Campo>
        <AvisoRetroativo inicio={f.inicio} cfg={cfg} />
        <Campo rotulo="Participantes" className="col-span-2"><input className={inputCls} value={f.participantes} onChange={(e) => setF({ ...f, participantes: e.target.value })} placeholder="titular, escrevente, TI…" /></Campo>
        <Campo rotulo="Pauta / observação" className="col-span-2"><input className={inputCls} value={f.nota} onChange={(e) => setF({ ...f, nota: e.target.value })} /></Campo>
      </div>
    </Modal>
  );
}

export function DesfechoModal({ reuniao, onFechar, onFeito }) {
  const futura = new Date(reuniao.inicio) > new Date();
  // Reunião futura: "realizada/faltou" ficam desabilitadas, então o padrão é remarcar.
  const [status, setStatus] = useState(futura ? 'remarcar' : 'realizada');
  const [nota, setNota] = useState('');
  const [nova, setNova] = useState('');
  const { erro, setErro, enviando, enviar } = useEnvio(onFeito);
  return (
    <Modal titulo="Desfecho da reunião" onFechar={onFechar}
      rodape={<Botoes onFechar={onFechar} enviando={enviando} onClick={() => {
        if (status === 'remarcar') {
          if (!nova) { setErro('Informe a nova data e hora.'); return; }
          enviar(() => api.post(`/comercial/reunioes/${reuniao.id}/remarcar`, { inicio: localParaIso(nova), nota: nota || null }));
        } else enviar(() => api.post(`/comercial/reunioes/${reuniao.id}/desfecho`, { status, nota: nota || null }));
      }} />}>
      <Erro>{erro}</Erro>
      <div className="grid grid-cols-2 gap-1.5">
        {[['realizada', 'Realizada'], ['faltou', 'Cliente faltou'], ['remarcar', 'Remarcar'], ['cancelada', 'Cancelada']].map(([k, n]) => (
          <label key={k} className={`flex items-center gap-2 rounded-md border px-2 py-1.5 text-sm ${status === k ? 'border-nexus-500 bg-nexus-50' : 'border-slate-200'} ${futura && ['realizada', 'faltou'].includes(k) ? 'opacity-50' : 'cursor-pointer'}`}>
            <input type="radio" name="st" disabled={futura && ['realizada', 'faltou'].includes(k)} checked={status === k} onChange={() => setStatus(k)} /> {n}
          </label>
        ))}
      </div>
      {futura && <p className="text-xs text-slate-500">A reunião ainda não aconteceu: só dá para remarcar ou cancelar.</p>}
      {status === 'remarcar' && <Campo rotulo="Nova data e hora *"><input type="datetime-local" className={inputCls} value={nova} onChange={(e) => setNova(e.target.value)} /></Campo>}
      <Campo rotulo="Observação"><input className={inputCls} value={nota} onChange={(e) => setNota(e.target.value)} /></Campo>
    </Modal>
  );
}

export function PropostaModal({ lead, onFechar, onFeito }) {
  const [f, setF] = useState({ plano: '', valor_mensal: '', desconto: 'nenhum', validade: '', observacoes: '' });
  const { erro, setErro, enviando, enviar } = useEnvio(onFeito);
  return (
    <Modal titulo={`Registrar proposta · ${lead.nome}`} onFechar={onFechar}
      rodape={<Botoes onFechar={onFechar} enviando={enviando} onClick={() => {
        if (!f.plano || !(Number(f.valor_mensal) > 0)) { setErro('Informe plano e valor mensal.'); return; }
        enviar(() => api.post(`/comercial/leads/${lead.id}/propostas`, { ...f, valor_mensal: Number(f.valor_mensal), validade: f.validade || undefined, observacoes: f.observacoes || null }));
      }} />}>
      <Erro>{erro}</Erro>
      <div className="grid grid-cols-2 gap-3">
        <Campo rotulo="Plano *"><input className={inputCls} value={f.plano} onChange={(e) => setF({ ...f, plano: e.target.value })} /></Campo>
        <Campo rotulo="Valor mensal (R$) *"><input type="number" min="0" className={inputCls} value={f.valor_mensal} onChange={(e) => setF({ ...f, valor_mensal: e.target.value })} /></Campo>
        <Campo rotulo="Validade (padrão: 7 dias)"><input type="date" className={inputCls} value={f.validade} onChange={(e) => setF({ ...f, validade: e.target.value })} /></Campo>
        <Campo rotulo="Concessão">
          <select className={inputCls} value={f.desconto} onChange={(e) => setF({ ...f, desconto: e.target.value })}>
            <option value="nenhum">Nenhuma</option>
            <option value="mes_gratis_ex_cliente" disabled={lead.origem !== 'ex_cliente'}>1 mês grátis (só ex-cliente, uma vez)</option>
          </select>
        </Campo>
        <Campo rotulo="Observações" className="col-span-2"><input className={inputCls} value={f.observacoes} onChange={(e) => setF({ ...f, observacoes: e.target.value })} /></Campo>
      </div>
      <p className="text-xs text-slate-500">Não existe outro desconto. A proposta anterior em aberto fica como “substituída”.</p>
    </Modal>
  );
}

export function PagamentoModal({ lead, hoje, onFechar, onFeito }) {
  const [f, setF] = useState({ pago_em: hoje, valor: lead.valor_mensal || '', referencia: '' });
  const { erro, enviando, enviar } = useEnvio(onFeito);
  return (
    <Modal titulo={`Confirmar pagamento · ${lead.nome}`} onFechar={onFechar}
      rodape={<Botoes onFechar={onFechar} enviando={enviando} rotulo="Confirmar pagamento" onClick={() => enviar(() => api.post(`/comercial/leads/${lead.id}/pagamento`, { ...f, valor: Number(f.valor) }))} />}>
      <p className="text-sm text-slate-600">Use só quando o pagamento não veio pelo ASAAS. Com o CNPJ preenchido, o ASAAS confirma sozinho.</p>
      <Erro>{erro}</Erro>
      <div className="grid grid-cols-2 gap-3">
        <Campo rotulo="Pago em *"><input type="date" max={hoje} className={inputCls} value={f.pago_em} onChange={(e) => setF({ ...f, pago_em: e.target.value })} /></Campo>
        <Campo rotulo="Valor (R$) *"><input type="number" min="0" className={inputCls} value={f.valor} onChange={(e) => setF({ ...f, valor: e.target.value })} /></Campo>
        <Campo rotulo="Comprovante / referência *" className="col-span-2"><input className={inputCls} value={f.referencia} onChange={(e) => setF({ ...f, referencia: e.target.value })} placeholder="ex.: PIX E123…, boleto nº…" /></Campo>
      </div>
    </Modal>
  );
}

export function ChecagemModal({ cfg, sup, janela: janelaPadrao, onFechar, onFeito }) {
  const [janela, setJanela] = useState(janelaPadrao);
  const [obs, setObs] = useState('');
  const { erro, enviando, enviar } = useEnvio(onFeito);
  return (
    <Modal titulo={`Checagem · ${sup.pessoa.nome}`} onFechar={onFechar}
      rodape={<Botoes onFechar={onFechar} enviando={enviando} onClick={() => enviar(() => api.post('/comercial/checagens', { janela, pessoa_id: sup.pessoa.id, observacao: obs || null }))} />}>
      <Erro>{erro}</Erro>
      <p className="text-sm text-slate-600">Fotografa o semáforo agora ({sup.rotulo}: {sup.feitos} feitos, {sup.pendentes} pendentes, {sup.alertas.length} alerta(s)).</p>
      <Campo rotulo="Janela">
        <select className={inputCls} value={janela} onChange={(e) => setJanela(e.target.value)}>
          {Object.entries(cfg.janelas).map(([k, n]) => <option key={k} value={k}>{n}</option>)}
        </select>
      </Campo>
      <Campo rotulo={`O que foi combinado${sup.sinal !== 'ok' ? ' *' : ''}`}><textarea className={inputCls + ' min-h-[70px]'} value={obs} onChange={(e) => setObs(e.target.value)} /></Campo>
    </Modal>
  );
}

export function UmAUmModal({ sup, hoje, onFechar, onFeito }) {
  const [f, setF] = useState({ bloqueios: '', combinados: '' });
  const [acoes, setAcoes] = useState([{ acao: '', prazo: '' }]);
  const { erro, setErro, enviando, enviar } = useEnvio(onFeito);
  return (
    <Modal titulo={`1:1 · ${sup.pessoa.nome}`} largura="max-w-2xl" onFechar={onFechar}
      rodape={<Botoes onFechar={onFechar} enviando={enviando} onClick={() => {
        const validas = acoes.filter((a) => a.acao.trim());
        if (validas.some((a) => !a.prazo)) { setErro('Toda ação precisa de prazo.'); return; }
        enviar(() => api.post('/comercial/1a1', { pessoa_id: sup.pessoa.id, bloqueios: f.bloqueios || null, combinados: f.combinados, acoes: validas }));
      }} />}>
      <p className="text-sm text-slate-600">O placar dos últimos 7 dias é congelado junto com o registro.</p>
      <Erro>{erro}</Erro>
      <Campo rotulo="Bloqueios relatados"><textarea className={inputCls + ' min-h-[60px]'} value={f.bloqueios} onChange={(e) => setF({ ...f, bloqueios: e.target.value })} /></Campo>
      <Campo rotulo="Combinados *"><textarea className={inputCls + ' min-h-[60px]'} value={f.combinados} onChange={(e) => setF({ ...f, combinados: e.target.value })} /></Campo>
      <p className="text-xs font-medium text-slate-600">Plano de ação</p>
      {acoes.map((a, i) => (
        <div key={i} className="grid grid-cols-[1fr_150px] gap-2">
          <input className={inputCls} placeholder="ação" value={a.acao} onChange={(e) => setAcoes(acoes.map((x, j) => (j === i ? { ...x, acao: e.target.value } : x)))} />
          <input type="date" min={hoje} className={inputCls} value={a.prazo} onChange={(e) => setAcoes(acoes.map((x, j) => (j === i ? { ...x, prazo: e.target.value } : x)))} />
        </div>
      ))}
      <button type="button" className="text-sm font-medium text-nexus-700" onClick={() => setAcoes([...acoes, { acao: '', prazo: '' }])}>+ ação</button>
    </Modal>
  );
}
