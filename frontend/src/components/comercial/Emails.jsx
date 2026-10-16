import { useEffect, useState } from 'react';
import { Check, Copy, Mail, Pencil, Plus, Archive } from 'lucide-react';
import { api, mensagemDeErro } from '../../api/client.js';
import {
  Painel, Vazio, Kpi, Barra, Pill, pct, dataBr, inputCls, btnCls, btnPrimCls, Campo, Modal, Erro,
} from './ui.jsx';
import { Dica } from './Ajuda.jsx';

/**
 * Sprint 44 — E-mails mais utilizados.
 *   - EmailsMaisUsados: ranking na Supervisão (equipe toda ou uma pessoa)
 *   - BibliotecaEmails: modelos de e-mail na aba Scripts (gestão edita)
 */

function periodo(tipo, hoje) {
  const d = new Date(hoje + 'T12:00:00'); const iso = (x) => x.toISOString().slice(0, 10);
  if (tipo === 'semana') { const a = new Date(d); a.setDate(a.getDate() - 6); return [iso(a), hoje]; }
  if (tipo === 'mes_anterior') { const a = new Date(d.getFullYear(), d.getMonth() - 1, 1, 12); const b = new Date(d.getFullYear(), d.getMonth(), 0, 12); return [iso(a), iso(b)]; }
  if (tipo === '90') { const a = new Date(d); a.setDate(a.getDate() - 89); return [iso(a), hoje]; }
  return [hoje.slice(0, 8) + '01', hoje];
}

const DICA_RESPOSTA = 'Envio que teve resposta: o próprio registro já conectou (ex.: “Respondeu”) ou o cartório teve um contato com conexão registrado depois do e-mail, em até 7 dias.';
const DICA_REUNIAO = 'Envios em que o cartório ganhou reunião marcada (não cancelada) em até 14 dias depois do e-mail.';
const DICA_SEM_MODELO = 'E-mails registrados como “Mensagem enviada” sem modelo marcado. Não entram no ranking: peça para marcar o modelo no registro do toque.';

export function EmailsMaisUsados({ cfg, versao }) {
  const [tipo, setTipo] = useState('mes');
  const [pessoaId, setPessoaId] = useState('');
  const [dados, setDados] = useState(null);
  const [erro, setErro] = useState('');
  useEffect(() => {
    const [de, ate] = periodo(tipo, cfg.hoje);
    setErro('');
    api.get('/comercial/emails/ranking', { params: { de, ate } }).then((r) => setDados(r.data)).catch((err) => setErro(mensagemDeErro(err)));
  }, [tipo, cfg.hoje, versao]);

  const pessoa = pessoaId ? dados?.pessoas.find((p) => (p.id || 'sem') === pessoaId) : null;
  const modelos = pessoa ? pessoa.modelos : (dados?.modelos || []);
  const max = Math.max(1, ...modelos.map((m) => m.envios));
  const resumo = pessoa
    ? { envios: pessoa.envios, taxa: pessoa.taxa_resposta, sem: pessoa.sem_modelo, n: pessoa.modelos.length }
    : dados ? { envios: dados.total_envios, taxa: dados.taxa_resposta, sem: dados.sem_modelo, n: dados.modelos.length } : null;

  return (
    <Painel titulo={<span className="inline-flex items-center gap-1.5"><Mail size={15} /> E-mails mais utilizados</span>} extra={
      <div className="flex flex-wrap items-center gap-2">
        <select aria-label="Quem" className={inputCls + ' !w-auto'} value={pessoaId} onChange={(e) => setPessoaId(e.target.value)}>
          <option value="">Equipe toda</option>
          {(dados?.pessoas || []).map((p) => <option key={p.id || 'sem'} value={p.id || 'sem'}>{p.nome}</option>)}
        </select>
        <select aria-label="Período" className={inputCls + ' !w-auto'} value={tipo} onChange={(e) => setTipo(e.target.value)}>
          <option value="mes">Este mês</option><option value="semana">Últimos 7 dias</option>
          <option value="mes_anterior">Mês anterior</option><option value="90">Últimos 90 dias</option>
        </select>
      </div>
    }>
      <Erro>{erro}</Erro>
      {!dados && !erro && <Vazio>Carregando…</Vazio>}
      {dados && (
        <>
          <p className="text-xs text-slate-500">
            {dataBr(dados.de)} a {dataBr(dados.ate)} · {pessoa ? <>e-mails enviados por <b>{pessoa.nome}</b></> : 'equipe toda'}.
            Conta os toques de e-mail com o modelo marcado no registro.
          </p>
          <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
            <Kpi rotulo="E-mails com modelo" valor={resumo.envios} />
            <Kpi rotulo="Modelos usados" valor={resumo.n} />
            <Kpi rotulo={<>Taxa de resposta <Dica texto={DICA_RESPOSTA} /></>} valor={pct(resumo.taxa)} />
            <Kpi rotulo={<>Sem modelo marcado <Dica texto={DICA_SEM_MODELO} /></>} valor={resumo.sem} />
          </div>

          {!modelos.length ? (
            <Vazio>Nenhum e-mail com modelo marcado no período. O modelo é escolhido ao registrar um toque pelo canal E-mail.</Vazio>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="text-left text-[11px] uppercase tracking-wide text-slate-500">
                  <tr>
                    <th className="w-8 py-1 pr-2">#</th><th className="py-1 pr-3">Modelo</th>
                    <th className="py-1 pr-3 text-right">Envios</th><th className="py-1 pr-3 text-right">Cartórios</th>
                    <th className="py-1 pr-3 text-right">Resposta <Dica texto={DICA_RESPOSTA} /></th>
                    <th className="py-1 text-right">Reuniões <Dica texto={DICA_REUNIAO} /></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {modelos.map((m, i) => (
                    <tr key={m.id}>
                      <td className="py-2 pr-2 font-mono text-xs text-slate-400">{i + 1}</td>
                      <td className="py-2 pr-3">
                        <div className="flex items-center gap-2">
                          <span className="font-medium text-slate-800">{m.titulo}</span>
                          {m.arquivado && <Pill>arquivado</Pill>}
                        </div>
                        <div className="mt-1 max-w-xs"><Barra pct={(m.envios / max) * 100} /></div>
                      </td>
                      <td className="py-2 pr-3 text-right font-semibold tabular-nums">{m.envios}</td>
                      <td className="py-2 pr-3 text-right tabular-nums">{m.cartorios}</td>
                      <td className="py-2 pr-3 text-right tabular-nums">{pct(m.taxa_resposta)} <span className="text-xs text-slate-400">({m.respostas})</span></td>
                      <td className="py-2 text-right tabular-nums">{m.reunioes}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {!pessoa && dados.pessoas.length > 0 && (
            <div className="space-y-2 border-t border-slate-100 pt-3">
              <p className="text-[11px] font-medium uppercase tracking-wide text-slate-500">Por pessoa</p>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="text-left text-[11px] uppercase tracking-wide text-slate-500">
                    <tr>
                      <th className="py-1 pr-3">Pessoa</th><th className="py-1 pr-3 text-right">Envios</th>
                      <th className="py-1 pr-3">Mais usado</th><th className="py-1 pr-3 text-right">Resposta</th>
                      <th className="py-1 text-right">Sem modelo</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {dados.pessoas.map((p) => (
                      <tr key={p.id || 'sem'} className="cursor-pointer hover:bg-slate-50" onClick={() => setPessoaId(p.id || 'sem')} title="Ver os modelos desta pessoa">
                        <td className="py-2 pr-3 font-medium text-nexus-700">{p.nome}</td>
                        <td className="py-2 pr-3 text-right font-semibold tabular-nums">{p.envios}</td>
                        <td className="py-2 pr-3">{p.mais_usado ? <>{p.mais_usado.titulo} <span className="text-xs text-slate-400">({p.mais_usado.envios})</span></> : <span className="text-slate-400">—</span>}</td>
                        <td className="py-2 pr-3 text-right tabular-nums">{pct(p.taxa_resposta)}</td>
                        <td className={`py-2 text-right tabular-nums ${p.sem_modelo > p.envios ? 'font-semibold text-amber-700' : ''}`}>{p.sem_modelo}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
          {pessoa && <button type="button" className={btnCls + ' self-start !px-2 !py-1 text-xs'} onClick={() => setPessoaId('')}>Voltar para a equipe toda</button>}
        </>
      )}
    </Painel>
  );
}

// ---------------------------------------------------------------------------
// Biblioteca de modelos (aba Scripts)
// ---------------------------------------------------------------------------
export function BibliotecaEmails({ cfg, onMudou }) {
  const gestor = !!(cfg.eu?.gestor ?? cfg.eu?.admin);
  const modelos = cfg.modelos_email || [];
  const [copiado, setCopiado] = useState(null);
  const [editando, setEditando] = useState(null); // {} = novo; modelo = editar
  const [erro, setErro] = useState('');
  async function copiar(m) {
    try { await navigator.clipboard.writeText(`Assunto: ${m.assunto}\n\n${m.corpo}`); setCopiado(m.id); setTimeout(() => setCopiado(null), 1500); } catch { /* sem clipboard */ }
  }
  async function arquivar(m) {
    if (!window.confirm(`Arquivar o modelo "${m.titulo}"? Ele sai da lista de escolha; o uso que já teve continua no ranking.`)) return;
    setErro('');
    try { await api.post(`/comercial/modelos-email/${m.id}/arquivar`); onMudou(); } catch (err) { setErro(mensagemDeErro(err)); }
  }
  return (
    <Painel titulo={<span className="inline-flex items-center gap-1.5"><Mail size={15} /> Modelos de e-mail</span>} extra={
      gestor && <button type="button" className={btnPrimCls + ' !px-2 !py-1 text-xs'} onClick={() => setEditando({})}><Plus size={12} /> Novo modelo</button>
    }>
      <p className="text-sm text-slate-500">
        Ao registrar um toque pelo canal E-mail, a pessoa marca qual destes modelos usou; isso alimenta o ranking dos e-mails mais
        utilizados na Supervisão e no modo TV. Campos entre colchetes ([cartório], [Nome], [vendedor]) são preenchidos sozinhos quando possível.
        {!gestor && ' Só a gestão comercial cria e edita modelos.'}
      </p>
      <Erro>{erro}</Erro>
      {!modelos.length && <Vazio>Nenhum modelo cadastrado.</Vazio>}
      <div className="grid gap-4 lg:grid-cols-2">
        {modelos.map((m) => (
          <div key={m.id} className="flex flex-col gap-2 rounded-md border border-slate-200 p-3">
            <div className="flex items-start justify-between gap-2">
              <div>
                <p className="text-sm font-semibold text-slate-900">{m.titulo}</p>
                {m.uso && <p className="text-xs text-slate-500">{m.uso}</p>}
              </div>
              <div className="flex shrink-0 gap-1">
                <button type="button" className={btnCls + ' !px-2 !py-1 text-xs'} onClick={() => copiar(m)}>
                  {copiado === m.id ? <><Check size={12} /> Copiado</> : <><Copy size={12} /> Copiar</>}
                </button>
                {gestor && <button type="button" className={btnCls + ' !px-2 !py-1 text-xs'} onClick={() => setEditando(m)} aria-label={`Editar ${m.titulo}`}><Pencil size={12} /></button>}
                {gestor && <button type="button" className={btnCls + ' !px-2 !py-1 text-xs'} onClick={() => arquivar(m)} aria-label={`Arquivar ${m.titulo}`}><Archive size={12} /></button>}
              </div>
            </div>
            <div className="whitespace-pre-wrap rounded-md bg-slate-50 p-3 text-sm leading-relaxed text-slate-700"><b>Assunto:</b> {m.assunto}{'\n\n'}{m.corpo}</div>
          </div>
        ))}
      </div>
      {editando && <ModeloModal modelo={editando} onFechar={() => setEditando(null)} onFeito={() => { setEditando(null); onMudou(); }} />}
    </Painel>
  );
}

function ModeloModal({ modelo, onFechar, onFeito }) {
  const novo = !modelo.id;
  const [f, setF] = useState({ titulo: modelo.titulo || '', assunto: modelo.assunto || '', corpo: modelo.corpo || '', uso: modelo.uso || '' });
  const [erro, setErro] = useState('');
  const [enviando, setEnviando] = useState(false);
  async function salvar() {
    setErro(''); setEnviando(true);
    try {
      const corpo = { ...f, uso: f.uso || null };
      if (novo) await api.post('/comercial/modelos-email', corpo); else await api.put(`/comercial/modelos-email/${modelo.id}`, corpo);
      onFeito();
    } catch (err) { setErro(mensagemDeErro(err)); } finally { setEnviando(false); }
  }
  return (
    <Modal titulo={novo ? 'Novo modelo de e-mail' : `Editar · ${modelo.titulo}`} onFechar={onFechar} largura="max-w-2xl" rodape={
      <>
        <button type="button" className={btnCls} onClick={onFechar}>Cancelar</button>
        <button type="button" className={btnPrimCls} onClick={salvar} disabled={enviando}>{enviando ? 'Salvando…' : 'Salvar'}</button>
      </>
    }>
      {!novo && <p className="text-xs text-slate-500">A edição vale daqui para frente. Os envios já registrados continuam contando para este modelo no ranking.</p>}
      <Erro>{erro}</Erro>
      <Campo rotulo="Nome do modelo *"><input className={inputCls} value={f.titulo} onChange={(e) => setF({ ...f, titulo: e.target.value })} placeholder="ex.: Retomada depois de 90 dias" autoFocus /></Campo>
      <Campo rotulo="Quando usar"><input className={inputCls} value={f.uso} onChange={(e) => setF({ ...f, uso: e.target.value })} placeholder="ex.: cartório que voltou da lista de 90 dias" /></Campo>
      <Campo rotulo="Assunto *"><input className={inputCls} value={f.assunto} onChange={(e) => setF({ ...f, assunto: e.target.value })} /></Campo>
      <Campo rotulo="Texto *"><textarea className={inputCls + ' min-h-[220px] font-mono text-xs'} value={f.corpo} onChange={(e) => setF({ ...f, corpo: e.target.value })} placeholder={'[Nome], bom dia.\n\nSou [vendedor], da Ayio…'} /></Campo>
    </Modal>
  );
}
