import { useEffect, useMemo, useState } from 'react';
import {
  X, Phone, CalendarPlus, ArrowRightCircle, MapPin, CheckCircle2, Circle, AlertTriangle, Archive, Undo2,
} from 'lucide-react';
import { api, mensagemDeErro } from '../../api/client.js';
import { Campo, Erro, inputCls, btnCls } from '../comercial/ui.jsx';
import { AtividadeModal, DesfechoModal, MotivoModal, btnViol } from './Acoes.jsx';
import { Prioridade, Etapa, Rota, linkMaps, AvisoLgpd, dataBr, horaBr } from './ui.jsx';

/**
 * Ficha da escola (Sprint 43). Atividades gravam na hora; dados, pontuação,
 * qualificação, diagnóstico, piloto e proposta só com "Salvar". O servidor
 * aplica os portões de etapa e a ficha mostra antes o que falta.
 */

const CAMPOS = [
  'nome', 'tipo', 'etapas_ensino', 'bairro', 'rota', 'endereco', 'telefone', 'email', 'site', 'fonte_dados',
  'dados_confirmados', 'pts_etapas', 'pts_porte', 'pts_acesso', 'pts_rota', 'aee_ativo', 'alunos_tea', 'professores',
  'decisor_nome', 'decisor_cargo', 'decisor_contato', 'aliado_nome', 'aliado_cargo', 'aliado_contato', 'dono_id',
  'bant', 'diagnostico', 'piloto', 'proposta', 'piloto_inicio', 'valor_mensal', 'origem', 'indicado_por',
  'proximo_passo', 'proxima_data', 'notas',
];
const JSONS = ['bant', 'diagnostico', 'piloto', 'proposta'];
const NUMS = ['pts_etapas', 'pts_porte', 'pts_acesso', 'pts_rota', 'alunos_tea', 'professores', 'valor_mensal'];

function rascunho(e) {
  const r = {};
  for (const k of CAMPOS) r[k] = JSONS.includes(k) ? { ...(e?.[k] || {}) } : (e?.[k] ?? (k === 'dados_confirmados' ? false : ''));
  return r;
}
function diferencas(f, e) {
  const d = {};
  for (const k of CAMPOS) {
    const a = f[k]; const b = JSONS.includes(k) ? (e[k] || {}) : (e[k] ?? (k === 'dados_confirmados' ? false : ''));
    if (JSON.stringify(a ?? '') === JSON.stringify(b ?? '')) continue;
    if (NUMS.includes(k)) d[k] = a === '' || a == null ? null : Number(a);
    else if (k === 'aee_ativo') d[k] = a === '' ? null : a;
    else d[k] = a;
  }
  return d;
}

export default function EscolaDrawer({ id, cfg, onFechar, onMudou, onCriada }) {
  const [e, setE] = useState(null);
  const [f, setF] = useState(rascunho({ tipo: 'particular_pequena', origem: 'lista', dono_id: cfg.eu.id }));
  const [erro, setErro] = useState('');
  const [aviso, setAviso] = useState('');
  const [salvando, setSalvando] = useState(false);
  const [modal, setModal] = useState(null);
  const [nova, setNova] = useState('');
  const [mov, setMov] = useState({ justificativa: '', motivo_perda: '', motivo_perda_obs: '', forcar: false });
  const gestor = !!cfg.eu.gestor;

  const carregar = () => api.get(`/comercial/adaptai/escolas/${id}`).then((r) => { setE(r.data); setF(rascunho(r.data)); }).catch((err) => setErro(mensagemDeErro(err)));
  useEffect(() => { if (id) carregar(); }, [id]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { if (!aviso) return undefined; const t = setTimeout(() => setAviso(''), 3500); return () => clearTimeout(t); }, [aviso]);

  const set = (k, v) => setF((x) => ({ ...x, [k]: v }));
  const setJ = (k, sub, v) => setF((x) => ({ ...x, [k]: { ...(x[k] || {}), [sub]: v } }));
  const dif = useMemo(() => (e ? diferencas(f, e) : {}), [f, e]);
  const sujo = Object.keys(dif).length > 0;
  const trilha = e?.trilha || cfg.tipos.find((t) => t.k === f.tipo)?.trilha || 'escola';
  const etapasTrilha = cfg.etapas[trilha] || [];
  const pontos = ['pts_etapas', 'pts_porte', 'pts_acesso', 'pts_rota'].every((k) => f[k] !== '' && f[k] != null)
    ? ['pts_etapas', 'pts_porte', 'pts_acesso', 'pts_rota'].reduce((a, k) => a + Number(f[k]), 0) : null;

  function aplicar(r) { setE(r); setF(rascunho(r)); onMudou?.(); }

  async function criar() {
    setSalvando(true); setErro('');
    try {
      const corpo = diferencas(f, rascunho({}));
      corpo.nome = f.nome; corpo.tipo = f.tipo;
      const r = await api.post('/comercial/adaptai/escolas', corpo);
      onCriada?.(r.data.id);
    } catch (err) { setErro(mensagemDeErro(err)); } finally { setSalvando(false); }
  }
  async function salvar(extra = {}) {
    setSalvando(true); setErro('');
    try {
      const r = await api.put(`/comercial/adaptai/escolas/${id}`, { ...dif, ...extra });
      aplicar(r.data);
      setAviso(extra.etapa ? `Agora em ${cfg.nomes_etapa[extra.etapa]}.` : 'Salvo.');
      if (extra.etapa) { setNova(''); setMov({ justificativa: '', motivo_perda: '', motivo_perda_obs: '', forcar: false }); }
      return true;
    } catch (err) { setErro(mensagemDeErro(err)); return false; } finally { setSalvando(false); }
  }

  // ---------- Nova escola ----------
  if (!id) {
    return (
      <Moldura titulo="Nova escola ou conta" onFechar={onFechar}
        rodape={<><span /><button type="button" className={btnViol} disabled={salvando || !f.nome.trim()} onClick={criar}>{salvando ? 'Salvando…' : 'Cadastrar'}</button></>}>
        <Dados f={f} set={set} cfg={cfg} novo />
        <Erro>{erro}</Erro>
      </Moldura>
    );
  }
  if (!e) return <Moldura titulo="Carregando…" onFechar={onFechar}><Erro>{erro}</Erro></Moldura>;

  const tipoInfo = cfg.tipos.find((t) => t.k === e.tipo);
  const agendadas = e.atividades.filter((a) => a.status === 'agendado' && !a.estornado_em);
  const atrasadas = agendadas.filter((a) => a.data < cfg.hoje);
  const falta = nova ? (e.pendencias?.[nova] || []) : [];
  const retro = nova && ehRetro(cfg, trilha, e.etapa, nova);

  // Próxima ação
  let acao = null;
  if (atrasadas.length) acao = { txt: `Dizer como foi: ${nomeTipo(cfg, atrasadas[0].tipo)} de ${dataBr(atrasadas[0].data)}`, fazer: () => setModal({ k: 'desfecho', a: atrasadas[0] }) };
  else if (e.piloto_marco?.devido) acao = { txt: `Piloto · ${e.piloto_marco.n}: ${e.piloto_marco.acao}`, fazer: () => setModal({ k: 'ativ', tipo: e.piloto_marco.k, modo: 'feito' }) };
  else if (e.passo?.devido) acao = { txt: `Cadência D${e.passo.dia} · ${e.passo.canal}: ${e.passo.acao}`, fazer: () => setModal({ k: 'ativ', passo: e.passo.k }) };
  else if (e.proxima_reuniao) acao = { txt: `${nomeTipo(cfg, e.proxima_reuniao.tipo)} marcada para ${dataBr(e.proxima_reuniao.data)} ${horaBr(e.proxima_reuniao.quando)}`, fazer: null };
  else if (e.etapa === 'nutricao') acao = { txt: `Em nutrição até ${dataBr(e.nutricao_ate)}: retomar com conteúdo útil`, fazer: () => setModal({ k: 'ativ' }) };
  if (!acao) {
    const info = etapasTrilha.find((x) => x.k === e.etapa);
    acao = { txt: info ? `${info.n}: ${info.acao}` : (e.proximo_passo || 'Defina o próximo passo com data'), fazer: null };
  }

  return (
    <Moldura onFechar={onFechar} sobre={`${e.protocolo} · ${tipoInfo?.n || e.tipo}`} titulo={e.nome}
      selos={<>
        <Etapa k={e.etapa} nome={cfg.nomes_etapa[e.etapa]} />
        <Prioridade p={e.prioridade} pontos={e.pontos_calc} preliminar={e.pontos_preliminar} />
        <Rota r={e.rota} />
        {!e.dados_confirmados && <span className="rounded-full bg-amber-50 px-2 py-0.5 text-[11px] font-medium text-amber-800 ring-1 ring-inset ring-amber-200">dados a confirmar</span>}
        {e.prazo?.nivel === 'estourado' && <span className="rounded-full bg-red-50 px-2 py-0.5 text-[11px] font-medium text-red-700 ring-1 ring-inset ring-red-200">{e.prazo.dias} dias na etapa (prazo {e.prazo.sla})</span>}
      </>}
      rodape={<>
        <span className="text-xs text-slate-500">{aviso || (sujo ? 'Há mudanças não salvas.' : 'Tudo salvo.')}</span>
        <div className="flex gap-2">
          {gestor && <button type="button" className={btnCls} onClick={() => setModal({ k: 'arquivar' })}><Archive size={14} />Arquivar</button>}
          <button type="button" className={btnViol} disabled={!sujo || salvando} onClick={() => salvar()}>{salvando ? 'Salvando…' : 'Salvar'}</button>
        </div>
      </>}>

      {/* Agora */}
      <div className="rounded-xl bg-gradient-to-r from-violet-700 to-fuchsia-700 p-4 text-white">
        <p className="text-[11px] font-semibold uppercase tracking-wider text-violet-200">O que fazer agora</p>
        <p className="mt-0.5 text-sm font-medium">{acao.txt}</p>
        <div className="mt-3 flex flex-wrap gap-2">
          {acao.fazer && <button type="button" onClick={acao.fazer} className="rounded-md bg-white px-3 py-1.5 text-sm font-semibold text-violet-800 hover:bg-violet-50">Fazer agora</button>}
          <button type="button" onClick={() => setModal({ k: 'ativ' })} className="inline-flex items-center gap-1 rounded-md bg-white/15 px-3 py-1.5 text-sm hover:bg-white/25"><Phone size={14} />Registrar contato</button>
          <button type="button" onClick={() => setModal({ k: 'ativ', modo: 'agendado' })} className="inline-flex items-center gap-1 rounded-md bg-white/15 px-3 py-1.5 text-sm hover:bg-white/25"><CalendarPlus size={14} />Agendar</button>
          {e.endereco && <a href={linkMaps(e)} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 rounded-md bg-white/15 px-3 py-1.5 text-sm hover:bg-white/25"><MapPin size={14} />Mapa</a>}
        </div>
      </div>
      {aviso && <p className="rounded-md bg-emerald-50 px-3 py-2 text-sm text-emerald-800">{aviso}</p>}
      <Erro>{erro}</Erro>

      {/* Etapa */}
      <Bloco titulo="Etapa do funil">
        <div className="flex flex-wrap items-center gap-1">
          {etapasTrilha.map((x, i) => {
            const idx = etapasTrilha.findIndex((y) => y.k === e.etapa);
            const passou = idx > i || ['ganho', 'parceiro_ativo'].includes(e.etapa);
            return (
              <button key={x.k} type="button" onClick={() => setNova(x.k === e.etapa ? '' : x.k)}
                className={`rounded-full px-2.5 py-1 text-xs font-medium ring-1 ring-inset ${x.k === e.etapa ? 'bg-violet-700 text-white ring-violet-700' : nova === x.k ? 'bg-violet-100 text-violet-900 ring-violet-400' : passou ? 'bg-violet-50 text-violet-700 ring-violet-200' : 'bg-white text-slate-500 ring-slate-200 hover:bg-slate-50'}`}>
                {i + 1}. {x.n}
              </button>
            );
          })}
          <span className="mx-1 text-slate-300">|</span>
          {(cfg.finais_trilha[trilha] || []).map((k) => (
            <button key={k} type="button" onClick={() => setNova(k === e.etapa ? '' : k)}
              className={`rounded-full px-2.5 py-1 text-xs font-medium ring-1 ring-inset ${k === e.etapa ? 'bg-slate-800 text-white ring-slate-800' : nova === k ? 'bg-slate-200 text-slate-900 ring-slate-400' : 'bg-white text-slate-500 ring-slate-200 hover:bg-slate-50'}`}>
              {cfg.nomes_etapa[k]}
            </button>
          ))}
        </div>
        {nova && (
          <div className="mt-3 space-y-2 rounded-lg border border-slate-200 bg-slate-50 p-3">
            <p className="text-sm font-medium text-slate-800">Mover para <b>{cfg.nomes_etapa[nova]}</b></p>
            {falta.length > 0 ? (
              <ul className="space-y-1 text-sm text-amber-800">{falta.map((x) => <li key={x} className="flex gap-1.5"><AlertTriangle size={14} className="mt-0.5 shrink-0" />Falta: {x}</li>)}</ul>
            ) : <p className="text-sm text-emerald-700">Tudo pronto para avançar.</p>}
            {nova === 'perdido' && (
              <div className="grid grid-cols-2 gap-2">
                <Campo rotulo="Motivo da perda"><select className={inputCls} value={mov.motivo_perda} onChange={(ev) => setMov({ ...mov, motivo_perda: ev.target.value })}><option value="">—</option>{cfg.motivos_perda.map((m) => <option key={m}>{m}</option>)}</select></Campo>
                <Campo rotulo="Detalhe"><input className={inputCls} value={mov.motivo_perda_obs} onChange={(ev) => setMov({ ...mov, motivo_perda_obs: ev.target.value })} /></Campo>
              </div>
            )}
            {nova === 'nutricao' && <p className="text-xs text-slate-600">A escola volta para a sua lista em {cfg.dias_nutricao} dias (“retomo no próximo bimestre”).</p>}
            {(retro || (falta.length > 0 && gestor)) && (
              <Campo rotulo={retro ? 'Justificativa (voltar etapa ou reabrir)' : 'Justificativa para forçar (gestão)'}>
                <input className={inputCls} value={mov.justificativa} onChange={(ev) => setMov({ ...mov, justificativa: ev.target.value })} />
              </Campo>
            )}
            {falta.length > 0 && gestor && (
              <label className="flex items-center gap-2 text-xs text-slate-600"><input type="checkbox" checked={mov.forcar} onChange={(ev) => setMov({ ...mov, forcar: ev.target.checked })} />Forçar mesmo assim (fica registrado)</label>
            )}
            <button type="button" className={btnViol} disabled={salvando || (falta.length > 0 && !mov.forcar && nova !== 'perdido')}
              onClick={() => salvar({ etapa: nova, justificativa: mov.justificativa || undefined, forcar: mov.forcar || undefined, motivo_perda: nova === 'perdido' ? mov.motivo_perda || null : undefined, motivo_perda_obs: nova === 'perdido' ? mov.motivo_perda_obs || null : undefined })}>
              <ArrowRightCircle size={15} />Mover
            </button>
          </div>
        )}
        <div className="mt-3 grid grid-cols-2 gap-3">
          <Campo rotulo="Próximo passo"><input className={inputCls} value={f.proximo_passo || ''} onChange={(ev) => set('proximo_passo', ev.target.value)} /></Campo>
          <Campo rotulo="Quando"><input type="date" className={inputCls} value={f.proxima_data || ''} onChange={(ev) => set('proxima_data', ev.target.value)} /></Campo>
        </div>
      </Bloco>

      {trilha === 'escola' && ['lista', 'contato', 'decisor'].includes(e.etapa) && <Cadencia cfg={cfg} e={e} onPasso={(p) => setModal({ k: 'ativ', passo: p })} />}

      {/* Qualificação */}
      {trilha !== 'parceiro' && (
        <Bloco titulo="Quem decide e quem abre a porta">
          <div className="grid grid-cols-3 gap-2">
            <Campo rotulo="Decisor (nome)"><input className={inputCls} value={f.decisor_nome || ''} onChange={(ev) => set('decisor_nome', ev.target.value)} /></Campo>
            <Campo rotulo="Cargo"><input className={inputCls} value={f.decisor_cargo || ''} onChange={(ev) => set('decisor_cargo', ev.target.value)} placeholder="Diretora, mantenedor…" /></Campo>
            <Campo rotulo="Contato direto"><input className={inputCls} value={f.decisor_contato || ''} onChange={(ev) => set('decisor_contato', ev.target.value)} /></Campo>
            <Campo rotulo="Aliado interno (AEE / coordenação)"><input className={inputCls} value={f.aliado_nome || ''} onChange={(ev) => set('aliado_nome', ev.target.value)} /></Campo>
            <Campo rotulo="Cargo"><input className={inputCls} value={f.aliado_cargo || ''} onChange={(ev) => set('aliado_cargo', ev.target.value)} /></Campo>
            <Campo rotulo="Contato"><input className={inputCls} value={f.aliado_contato || ''} onChange={(ev) => set('aliado_contato', ev.target.value)} /></Campo>
          </div>
        </Bloco>
      )}
      {trilha === 'escola' && (
        <Bloco titulo="Qualificação (BANT simplificado)" sub="Os quatro itens são exigidos para Qualificada e para mandar proposta.">
          <div className="grid grid-cols-2 gap-2">
            {cfg.bant.map((b) => (
              <Campo key={b.k} rotulo={<span className="inline-flex items-center gap-1">{f.bant?.[b.k] ? <CheckCircle2 size={13} className="text-emerald-600" /> : <Circle size={13} className="text-slate-300" />}{b.n}</span>}>
                <input className={inputCls} value={f.bant?.[b.k] || ''} placeholder={b.dica} onChange={(ev) => setJ('bant', b.k, ev.target.value)} />
              </Campo>
            ))}
          </div>
        </Bloco>
      )}

      {/* Diagnóstico */}
      {trilha !== 'parceiro' && (
        <Bloco titulo="Diagnóstico consultivo (20 a 30 min)" sub="Ao final, resuma em 3 linhas e peça confirmação: “Entendi que o maior problema é X, que custa Y horas. Correto?”">
          <AvisoLgpd className="mb-2" />
          <div className="grid grid-cols-3 gap-2">
            <Campo rotulo="AEE / sala de recursos ativa?">
              <select className={inputCls} value={f.aee_ativo === true ? 's' : f.aee_ativo === false ? 'n' : ''} onChange={(ev) => set('aee_ativo', ev.target.value === 's' ? true : ev.target.value === 'n' ? false : '')}>
                <option value="">—</option><option value="s">Sim</option><option value="n">Não</option>
              </select>
            </Campo>
            <Campo rotulo="Alunos com TEA (número)"><input type="number" min="0" className={inputCls} value={f.alunos_tea ?? ''} onChange={(ev) => set('alunos_tea', ev.target.value)} /></Campo>
            <Campo rotulo="Professores"><input type="number" min="0" className={inputCls} value={f.professores ?? ''} onChange={(ev) => set('professores', ev.target.value)} /></Campo>
            <Campo rotulo="Horas por semana adaptando (por professor)"><input className={inputCls} value={f.diagnostico?.horas_semana || ''} onChange={(ev) => setJ('diagnostico', 'horas_semana', ev.target.value)} /></Campo>
          </div>
          <div className="mt-2 space-y-2">
            {cfg.diagnostico.map((d) => (
              <Campo key={d.k} rotulo={<span>{d.n}{cfg.diagnostico_obrig.includes(d.k) && <span className="ml-1 text-[10px] font-normal text-violet-600">obrigatório para proposta</span>}</span>}>
                <textarea className={inputCls} rows={2} placeholder={d.perguntas} value={f.diagnostico?.[d.k] || ''} onChange={(ev) => setJ('diagnostico', d.k, ev.target.value)} />
              </Campo>
            ))}
            <Campo rotulo="Resumo em 3 linhas (confirmado com a escola)"><textarea className={inputCls} rows={2} value={f.diagnostico?.resumo || ''} onChange={(ev) => setJ('diagnostico', 'resumo', ev.target.value)} /></Campo>
          </div>
        </Bloco>
      )}

      {/* Piloto */}
      {trilha !== 'parceiro' && (
        <Bloco titulo="Piloto de 30 dias" sub="Escopo: 3 a 5 professores e 1 do AEE; início, acompanhamento e encerramento. Métricas e critério combinados ANTES.">
          {e.piloto_sit && (
            <div className="mb-3 flex flex-wrap items-center gap-3">
              <div className="flex-1">
                <div className="flex justify-between text-xs text-slate-500"><span>Dia {e.piloto_sit.dia} de {e.piloto_sit.de}</span><span>fim {dataBr(e.piloto_fim)}</span></div>
                <div className="mt-1 h-2 overflow-hidden rounded-full bg-slate-100"><div className={`h-full rounded-full ${e.piloto_sit.vencido ? 'bg-red-500' : 'bg-fuchsia-500'}`} style={{ width: `${Math.min(100, (e.piloto_sit.dia / e.piloto_sit.de) * 100)}%` }} /></div>
              </div>
              {cfg.marcos_piloto.map((m) => {
                const feito = e.atividades.some((a) => a.tipo === m.k && a.status === 'feito' && !a.estornado_em);
                return <span key={m.k} className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${feito ? 'bg-emerald-100 text-emerald-800' : 'bg-slate-100 text-slate-600'}`}>D{m.dia} {m.n}{feito ? ' ✓' : ''}</span>;
              })}
            </div>
          )}
          <div className="grid grid-cols-3 gap-2">
            <Campo rotulo="Início"><input type="date" className={inputCls} value={f.piloto_inicio || ''} onChange={(ev) => set('piloto_inicio', ev.target.value)} /></Campo>
            <Campo rotulo="Professores"><input className={inputCls} value={f.piloto?.professores || ''} onChange={(ev) => setJ('piloto', 'professores', ev.target.value)} /></Campo>
            <Campo rotulo="Profissionais do AEE"><input className={inputCls} value={f.piloto?.aee || ''} onChange={(ev) => setJ('piloto', 'aee', ev.target.value)} /></Campo>
          </div>
          <Campo rotulo="Critério de sucesso (por escrito, antes de começar)" className="mt-2"><input className={inputCls} value={f.piloto?.criterio || ''} placeholder="Ex.: reduzir 50% do tempo por adaptação" onChange={(ev) => setJ('piloto', 'criterio', ev.target.value)} /></Campo>
          <div className="mt-2 grid grid-cols-5 gap-2">
            {cfg.metricas_piloto.map((m) => (
              <Campo key={m.k} rotulo={m.n}><input className={inputCls} value={f.piloto?.[m.k] || ''} onChange={(ev) => setJ('piloto', m.k, ev.target.value)} /></Campo>
            ))}
          </div>
          <div className="mt-2 grid grid-cols-3 items-end gap-2">
            <label className="flex items-center gap-2 text-sm text-slate-700"><input type="checkbox" checked={!!f.piloto?.encerrado} onChange={(ev) => setJ('piloto', 'encerrado', ev.target.checked)} />Piloto encerrado</label>
            <Campo rotulo="Resultado (relatório de 1 página)" className="col-span-2"><input className={inputCls} value={f.piloto?.resultado || ''} onChange={(ev) => setJ('piloto', 'resultado', ev.target.value)} /></Campo>
          </div>
        </Bloco>
      )}

      {/* Proposta */}
      {trilha !== 'parceiro' && (
        <Bloco titulo="Proposta" sub="Não envie valores antes de dor, decisor, prazo e orçamento qualificados.">
          <div className="grid grid-cols-4 gap-2">
            <Campo rotulo="Enviada em"><input type="date" className={inputCls} value={f.proposta?.enviada_em || ''} onChange={(ev) => setJ('proposta', 'enviada_em', ev.target.value)} /></Campo>
            <Campo rotulo="Licenças / professores"><input className={inputCls} value={f.proposta?.licencas || ''} onChange={(ev) => setJ('proposta', 'licencas', ev.target.value)} /></Campo>
            <Campo rotulo="Valor mensal (R$)"><input type="number" min="0" className={inputCls} value={f.valor_mensal ?? ''} onChange={(ev) => set('valor_mensal', ev.target.value)} /></Campo>
            <Campo rotulo="Vigência"><input className={inputCls} value={f.proposta?.vigencia || ''} onChange={(ev) => setJ('proposta', 'vigencia', ev.target.value)} /></Campo>
          </div>
          <Campo rotulo="Escopo, formação, suporte e condições" className="mt-2"><textarea className={inputCls} rows={2} value={f.proposta?.escopo || ''} onChange={(ev) => setJ('proposta', 'escopo', ev.target.value)} /></Campo>
        </Bloco>
      )}

      {/* Pontuação */}
      {trilha === 'escola' && (
        <Bloco titulo={`Pontuação: ${pontos ?? e.pontos ?? '—'} de 10${pontos == null && e.pontos != null ? ' (preliminar do plano)' : ''}`}
          sub="Organiza a semana; não garante compra. Revise depois do diagnóstico (AEE ativo, alunos com TEA, orçamento, prazo).">
          <div className="grid grid-cols-4 gap-2">
            {cfg.pontuacao.map((p) => (
              <Campo key={p.k} rotulo={`${p.n} (0–${p.max})`}>
                <select className={inputCls} value={f[p.k] ?? ''} title={p.dica} onChange={(ev) => set(p.k, ev.target.value)}>
                  <option value="">—</option>
                  {Array.from({ length: p.max + 1 }, (_, i) => <option key={i} value={i}>{i}</option>)}
                </select>
              </Campo>
            ))}
          </div>
          {e.prioridade && <p className="mt-2 text-xs text-slate-600"><b>Prioridade {e.prioridade}:</b> {cfg.tratamento[e.prioridade]}</p>}
        </Bloco>
      )}

      <Bloco titulo="Dados da escola"><Dados f={f} set={set} cfg={cfg} /></Bloco>

      <Bloco titulo="Notas"><textarea className={inputCls} rows={3} value={f.notas || ''} onChange={(ev) => set('notas', ev.target.value)} /></Bloco>

      <Historico cfg={cfg} e={e} onDesfecho={(a) => setModal({ k: 'desfecho', a })} onEstornar={(a) => setModal({ k: 'estorno', a })} />

      {modal?.k === 'ativ' && (
        <AtividadeModal cfg={cfg} escola={e} passo={modal.passo} tipoPadrao={modal.tipo} modo={modal.modo || 'feito'} onFechar={() => setModal(null)}
          onFeito={(r) => { setModal(null); aplicar(r.escola); setAviso(r.etapa !== e.etapa ? `Registrado. A escola foi para ${cfg.nomes_etapa[r.etapa]}.` : 'Registrado.'); }} />
      )}
      {modal?.k === 'desfecho' && (
        <DesfechoModal cfg={cfg} atividade={modal.a} onFechar={() => setModal(null)}
          onFeito={(r) => { setModal(null); aplicar(r.escola); setAviso('Desfecho registrado.'); }} />
      )}
      {modal?.k === 'estorno' && (
        <MotivoModal titulo="Estornar atividade" explicacao="A atividade fica riscada, com o motivo; não some do histórico." onFechar={() => setModal(null)}
          onConfirmar={async (motivo) => { const r = await api.post(`/comercial/adaptai/atividades/${modal.a.id}/estornar`, { motivo }); setModal(null); aplicar(r.data.escola); }} />
      )}
      {modal?.k === 'arquivar' && (
        <MotivoModal titulo="Arquivar escola" explicacao="Use para cadastro errado ou duplicado. Escola que não quer agora vai para Perdido ou Nutrição." onFechar={() => setModal(null)}
          onConfirmar={async (motivo) => { await api.post(`/comercial/adaptai/escolas/${id}/arquivar`, { motivo }); setModal(null); onMudou?.(); onFechar(); }} />
      )}
    </Moldura>
  );
}

function nomeTipo(cfg, k) { return cfg.tipos_atividade.find((t) => t.k === k)?.n || k; }
function ehRetro(cfg, trilha, de, para) {
  const abertas = (cfg.etapas[trilha] || []).map((x) => x.k);
  const aberta = (k) => abertas.includes(k);
  if (!aberta(de)) return aberta(para);
  return aberta(para) && abertas.indexOf(para) < abertas.indexOf(de);
}

function Dados({ f, set, cfg, novo }) {
  return (
    <div className="grid grid-cols-2 gap-2">
      <Campo rotulo="Nome" className="col-span-2"><input className={inputCls} value={f.nome || ''} onChange={(ev) => set('nome', ev.target.value)} /></Campo>
      <Campo rotulo="Tipo">
        <select className={inputCls} value={f.tipo} onChange={(ev) => set('tipo', ev.target.value)}>
          {cfg.tipos.map((t) => <option key={t.k} value={t.k}>{t.n}</option>)}
        </select>
      </Campo>
      <Campo rotulo="Etapas de ensino"><input className={inputCls} value={f.etapas_ensino || ''} onChange={(ev) => set('etapas_ensino', ev.target.value)} placeholder="Infantil, Fundamental…" /></Campo>
      <Campo rotulo="Bairro"><input className={inputCls} value={f.bairro || ''} onChange={(ev) => set('bairro', ev.target.value)} /></Campo>
      <Campo rotulo="Rota">
        <select className={inputCls} value={f.rota || ''} onChange={(ev) => set('rota', ev.target.value)}>
          <option value="">Automática pelo bairro</option>
          {cfg.rotas.map((r) => <option key={r.k} value={r.k}>{r.n}</option>)}
        </select>
      </Campo>
      <Campo rotulo="Endereço" className="col-span-2"><input className={inputCls} value={f.endereco || ''} onChange={(ev) => set('endereco', ev.target.value)} /></Campo>
      <Campo rotulo="Telefone"><input className={inputCls} value={f.telefone || ''} onChange={(ev) => set('telefone', ev.target.value)} /></Campo>
      <Campo rotulo="E-mail"><input className={inputCls} value={f.email || ''} onChange={(ev) => set('email', ev.target.value)} /></Campo>
      <Campo rotulo="Site ou Instagram"><input className={inputCls} value={f.site || ''} onChange={(ev) => set('site', ev.target.value)} /></Campo>
      <Campo rotulo="Responsável">
        <select className={inputCls} value={f.dono_id || ''} onChange={(ev) => set('dono_id', ev.target.value || null)}>
          <option value="">Sem responsável</option>
          {cfg.pessoas.map((p) => <option key={p.id} value={p.id}>{p.nome}</option>)}
        </select>
      </Campo>
      <Campo rotulo="Origem">
        <select className={inputCls} value={f.origem || 'lista'} onChange={(ev) => set('origem', ev.target.value)}>
          {cfg.origens.map((o) => <option key={o.k} value={o.k}>{o.n}</option>)}
        </select>
      </Campo>
      <Campo rotulo="Indicado por"><input className={inputCls} value={f.indicado_por || ''} onChange={(ev) => set('indicado_por', ev.target.value)} placeholder="Clínica, terapeuta, cliente…" /></Campo>
      {!novo && (
        <>
          <Campo rotulo="Fonte dos dados" className="col-span-2"><input className={inputCls} value={f.fonte_dados || ''} onChange={(ev) => set('fonte_dados', ev.target.value)} /></Campo>
          <label className="col-span-2 flex items-center gap-2 text-sm text-slate-700"><input type="checkbox" checked={!!f.dados_confirmados} onChange={(ev) => set('dados_confirmados', ev.target.checked)} />Endereço e telefone confirmados por ligação</label>
        </>
      )}
    </div>
  );
}

function Cadencia({ cfg, e, onPasso }) {
  const feitos = new Set(e.passos_feitos || []);
  const inicio = e.cadencia_inicio;
  return (
    <Bloco titulo="Cadência multicanal de 20 dias" sub={inicio ? `Começou em ${dataBr(inicio)} · hoje é o dia ${e.passo?.dia_atual ?? '—'}` : 'Começa no primeiro contato.'}>
      <ol className="grid grid-cols-7 gap-1">
        {cfg.cadencia.map((c) => {
          const feito = feitos.has(c.k);
          const devido = e.passo?.k === c.k && e.passo.devido;
          return (
            <li key={c.k}>
              <button type="button" onClick={() => onPasso(c.k)} title={c.acao}
                className={`flex h-full w-full flex-col items-start rounded-lg p-2 text-left text-[11px] ring-1 ring-inset ${feito ? 'bg-emerald-50 text-emerald-800 ring-emerald-200' : devido ? 'bg-violet-700 text-white ring-violet-700' : 'bg-white text-slate-600 ring-slate-200 hover:bg-slate-50'}`}>
                <span className="font-bold">D{c.dia}{feito ? ' ✓' : ''}</span>
                <span className="leading-tight">{c.canal}</span>
              </button>
            </li>
          );
        })}
      </ol>
    </Bloco>
  );
}

function Historico({ cfg, e, onDesfecho, onEstornar }) {
  const itens = [
    ...e.atividades.map((a) => ({ t: a.quando, k: 'a', a })),
    ...e.movimentos.map((m) => ({ t: m.em, k: 'm', m })),
  ].sort((x, y) => String(y.t).localeCompare(String(x.t)));
  return (
    <Bloco titulo="Histórico">
      {!itens.length && <p className="text-sm text-slate-500">Nada registrado ainda.</p>}
      <ul className="space-y-2">
        {itens.map((x) => x.k === 'm' ? (
          <li key={'m' + x.m.id} className="flex gap-2 text-xs text-slate-500">
            <ArrowRightCircle size={13} className="mt-0.5 shrink-0 text-violet-400" />
            <span>{dataBr(String(x.m.em).slice(0, 10))} · {x.m.de_etapa ? `${cfg.nomes_etapa[x.m.de_etapa]} → ` : 'Entrou em '}{cfg.nomes_etapa[x.m.para_etapa]}{x.m.pessoa_nome ? ` · ${x.m.pessoa_nome}` : ''}{x.m.justificativa ? ` · “${x.m.justificativa}”` : ''}</span>
          </li>
        ) : (
          <li key={'a' + x.a.id} className={`rounded-lg border px-3 py-2 text-sm ${x.a.estornado_em ? 'border-slate-100 bg-slate-50 text-slate-400 line-through' : x.a.status === 'agendado' ? 'border-violet-200 bg-violet-50' : 'border-slate-200'}`}>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="font-medium text-slate-800">
                {nomeTipo(cfg, x.a.tipo)}{x.a.passo ? ` · cadência D${x.a.dia_cadencia}` : ''}
                {x.a.resultado && <span className="ml-1 font-normal text-slate-500">· {cfg.resultados.find((r) => r.k === x.a.resultado)?.n}</span>}
              </span>
              <span className="text-xs text-slate-500">
                {x.a.status === 'agendado' ? `marcado ${dataBr(x.a.data)} ${horaBr(x.a.quando)}` : x.a.status === 'cancelado' ? 'não aconteceu' : dataBr(x.a.data)}
                {x.a.pessoa_nome ? ` · ${x.a.pessoa_nome}` : ''}
              </span>
            </div>
            {x.a.com_quem && <p className="text-xs text-slate-500">com {x.a.com_quem}</p>}
            {x.a.nota && <p className="mt-1 whitespace-pre-line text-slate-600">{x.a.nota}</p>}
            {x.a.estornado_em && <p className="text-xs no-underline">Estornado: {x.a.estorno_motivo}</p>}
            {!x.a.estornado_em && (
              <div className="mt-1 flex gap-2">
                {x.a.status === 'agendado' && <button type="button" className="text-xs font-medium text-violet-700 hover:underline" onClick={() => onDesfecho(x.a)}>Dizer como foi</button>}
                <button type="button" className="inline-flex items-center gap-0.5 text-xs text-slate-400 hover:text-slate-700" onClick={() => onEstornar(x.a)}><Undo2 size={11} />estornar</button>
              </div>
            )}
          </li>
        ))}
      </ul>
    </Bloco>
  );
}

function Bloco({ titulo, sub, children }) {
  return (
    <section className="rounded-xl border border-slate-200 p-4">
      <h3 className="text-sm font-semibold text-slate-900">{titulo}</h3>
      {sub && <p className="mb-2 text-xs text-slate-500">{sub}</p>}
      <div className={sub ? '' : 'mt-2'}>{children}</div>
    </section>
  );
}

function Moldura({ titulo, sobre, selos, onFechar, rodape, children }) {
  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      <div className="absolute inset-0 bg-slate-900/30" onClick={onFechar} />
      <aside role="dialog" aria-modal="true" aria-label={typeof titulo === 'string' ? titulo : 'Escola'}
        className="relative flex h-full w-full max-w-3xl flex-col bg-white shadow-xl">
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

