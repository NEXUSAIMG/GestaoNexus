import { useEffect, useState } from 'react';
import {
  Archive, Palette, ListChecks, Paperclip, MessageSquare,
  ListTree, Ban, Link2, Clock, SlidersHorizontal, Flag, History, FolderInput,
} from 'lucide-react';
import { api, mensagemDeErro } from '../../api/client.js';
import MultiSelectPessoas from '../MultiSelectPessoas.jsx';
import CardChecklists from '../CardChecklists.jsx';
import CardComentarios from '../CardComentarios.jsx';
import CardAnexos from '../CardAnexos.jsx';
import CardHistorico from './CardHistorico.jsx';
import ModalFrame from './ModalFrame.jsx';
import CardSubtarefas from './CardSubtarefas.jsx';
import CardDependencias from './CardDependencias.jsx';
import CardVinculos from './CardVinculos.jsx';
import CardTimer from './CardTimer.jsx';
import CardCampos from './CardCampos.jsx';
import { ehCardCliente } from './FichaCliente.jsx';
import {
  COR_CHIP, CORES, corForte, inputCls, PRIORIDADES, semAcento,
} from './ui.js';
import { PRESETS_VISUAL, PRESETS_LISTA } from '../../constants/kanbanVisual.js';

/**
 * Modal do card (criar/editar).
 *
 * Sprint 34: ganhou prioridade, estimativa, pontos, e as abas de
 * subtarefas / dependências / vínculos / horas / campos personalizados.
 * As seções extras só aparecem na edição (precisam de um card_id).
 */

const ABAS = [
  { id: 'detalhes', nome: 'Detalhes', icone: SlidersHorizontal },
  { id: 'subtarefas', nome: 'Subtarefas', icone: ListTree },
  { id: 'dependencias', nome: 'Dependências', icone: Ban },
  { id: 'vinculos', nome: 'Vínculos', icone: Link2 },
  { id: 'horas', nome: 'Horas', icone: Clock },
  { id: 'historico', nome: 'Histórico', icone: History },
];

// Colunas de estágio do funil (import CSV) que não agregam nada no dia a
// dia do card — pedido explícito pra sumir da seção "Campos do quadro".
// O campo continua existindo (Configurações → Campos personalizados);
// isso só tira ele da vista no card.
const CAMPOS_OCULTOS_NO_CARD = new Set([
  'reuniao de apresentacao',
  'data do ultimo contato',
  'enviar onboarding e aguardar (2 dias)',
  'reuniao de apresentacao do dashboard',
  'em desenvolvimento (3 dias)',
  'pronto para ativacao',
].map(semAcento));

export default function ModalCard({
  cardId, colunaId, quadro, onFechar, onSalvo, onExtrasMudou, aoAbrirCard,
}) {
  const editando = !!cardId;
  const aoMudarExtras = onExtrasMudou || (() => {});
  const [aba, setAba] = useState('detalhes');
  const [carregando, setCarregando] = useState(editando);
  const [pessoas, setPessoas] = useState([]);
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState('');

  const [titulo, setTitulo] = useState('');
  const [descricao, setDescricao] = useState('');
  const [responsavelIds, setResponsavelIds] = useState([]);
  const [dataPrazo, setDataPrazo] = useState('');
  const [dataInicio, setDataInicio] = useState('');
  const [prazoConcluido, setPrazoConcluido] = useState(false);
  const [capaCor, setCapaCor] = useState(null);
  const [capaPreset, setCapaPreset] = useState(null);
  const [etiquetaIds, setEtiquetaIds] = useState([]);
  // Sprint 34
  const [prioridade, setPrioridade] = useState(2);
  const [estimativa, setEstimativa] = useState('');
  const [pontos, setPontos] = useState('');
  const [valoresCampos, setValoresCampos] = useState({});

  // Mover pra outro quadro (equipe/funil diferente) — painel à parte,
  // aberto sob demanda; não carrega a lista de quadros à toa.
  const [movendo, setMovendo] = useState(false);
  const [quadrosDisponiveis, setQuadrosDisponiveis] = useState(null);
  const [quadroDestinoId, setQuadroDestinoId] = useState('');
  const [colunasDestino, setColunasDestino] = useState([]);
  const [colunaDestinoId, setColunaDestinoId] = useState('');
  const [movendoSalvando, setMovendoSalvando] = useState(false);

  useEffect(() => {
    api.get('/pessoas')
      .then((r) => setPessoas((r.data || []).filter((p) => p.ativo)))
      .catch(() => { /* sem permissão — deixa vazio */ });
  }, []);

  useEffect(() => {
    if (!editando) { setCarregando(false); return; }
    setCarregando(true);
    api.get('/cards/' + cardId)
      .then((r) => {
        const c = r.data;
        setTitulo(c.titulo);
        setDescricao(c.descricao || '');
        setResponsavelIds((c.responsaveis || []).map((p) => p.id));
        setDataPrazo(c.data_prazo ? String(c.data_prazo).slice(0, 10) : '');
        setDataInicio(c.data_inicio ? String(c.data_inicio).slice(0, 10) : '');
        setPrazoConcluido(!!c.prazo_concluido);
        setCapaCor(c.capa_cor || null);
        setCapaPreset(c.capa_preset || null);
        setEtiquetaIds(c.etiqueta_ids || []);
        setPrioridade(Number(c.prioridade ?? 2));
        setEstimativa(c.estimativa_horas != null ? String(c.estimativa_horas) : '');
        setPontos(c.pontos != null ? String(c.pontos) : '');
        // Valores dos campos vêm do payload do quadro (evita 1 request a mais)
        const doQuadro = (quadro.cards || []).find((x) => x.id === cardId);
        setValoresCampos(doQuadro?.campos || {});
      })
      .catch((err) => setErro(mensagemDeErro(err)))
      .finally(() => setCarregando(false));
  }, [cardId, editando]); // eslint-disable-line

  function alternarEtiqueta(eid) {
    setEtiquetaIds((atual) => (
      atual.includes(eid) ? atual.filter((x) => x !== eid) : [...atual, eid]
    ));
  }

  async function submeter(e) {
    e.preventDefault();
    setSalvando(true);
    setErro('');
    try {
      const body = {
        titulo,
        descricao: descricao || null,
        responsavel_ids: responsavelIds,
        data_prazo: dataPrazo || null,
        data_inicio: dataInicio || null,
        prazo_concluido: prazoConcluido,
        capa_cor: capaCor || null,
        capa_preset: capaPreset || null,
        etiqueta_ids: etiquetaIds,
        prioridade: Number(prioridade),
        estimativa_horas: estimativa.trim() === '' ? null : Number(estimativa),
        pontos: pontos.trim() === '' ? null : Number(pontos),
      };
      let salvo;
      if (editando) {
        const r = await api.put('/cards/' + cardId, body);
        salvo = r.data;
      } else {
        const r = await api.post('/cards', { ...body, coluna_id: colunaId });
        salvo = r.data;
      }
      // Passa o card salvo pro pai mesclar no estado (evita refazer o quadro).
      onSalvo(salvo);
    } catch (err) {
      setErro(mensagemDeErro(err));
    } finally {
      setSalvando(false);
    }
  }

  async function arquivar() {
    if (!confirm('Arquivar este card? Ele some do board mas fica no histórico.')) return;
    try {
      await api.post('/cards/' + cardId + '/arquivar');
      onSalvo();
    } catch (err) {
      setErro(mensagemDeErro(err));
    }
  }

  async function abrirMoverQuadro() {
    setMovendo(true);
    setErro('');
    if (quadrosDisponiveis) return;
    try {
      const r = await api.get('/quadros');
      setQuadrosDisponiveis((r.data || []).filter((q) => q.id !== quadro.id));
    } catch (err) {
      setErro(mensagemDeErro(err));
    }
  }

  async function escolherQuadroDestino(id) {
    setQuadroDestinoId(id);
    setColunaDestinoId('');
    setColunasDestino([]);
    if (!id) return;
    try {
      const r = await api.get('/quadros/' + id);
      setColunasDestino(r.data.colunas || []);
    } catch (err) {
      setErro(mensagemDeErro(err));
    }
  }

  async function confirmarMoverQuadro() {
    if (!quadroDestinoId || !colunaDestinoId) return;
    setMovendoSalvando(true);
    setErro('');
    try {
      await api.post('/cards/' + cardId + '/mover-quadro', {
        quadro_id: quadroDestinoId,
        coluna_id: colunaDestinoId,
      });
      onFechar();
      onSalvo();
    } catch (err) {
      setErro(mensagemDeErro(err));
    } finally {
      setMovendoSalvando(false);
    }
  }

  if (carregando) {
    return (
      <ModalFrame titulo="Carregando…" onFechar={onFechar}>
        <div className="py-8 text-center text-sm text-slate-500">Carregando…</div>
      </ModalFrame>
    );
  }

  const podeEditar = !!quadro.pode_editar;
  const camposDoQuadro = quadro.campos || [];
  // Campos do funil comercial que não interessam no dia a dia do card —
  // continuam existindo no quadro (histórico do import), só não aparecem
  // mais aqui.
  const camposVisiveisNoCard = camposDoQuadro.filter(
    (c) => !CAMPOS_OCULTOS_NO_CARD.has(semAcento(c.nome)),
  );

  // A ficha comercial é disparada pela etiqueta "Cliente" — e reage na hora
  // em que a pessoa marca a etiqueta, antes mesmo de salvar.
  const ehCliente = ehCardCliente(
    etiquetaIds.map((eid) => (quadro.etiquetas || []).find((e) => e.id === eid)).filter(Boolean),
    camposDoQuadro,
  );

  // Termômetro preenchido: o card já está categorizado por ele, então
  // Prioridade/Estimativa/Pontos/Início/Prazo somem do formulário — não
  // apaga o que já tava salvo, só para de mostrar/editar aqui enquanto o
  // termômetro estiver preenchido. Card novo (sem cardId ainda) não tem
  // valor de campo personalizado pra ler, então isso só entra em ação
  // depois que o termômetro é preenchido e o card é reaberto.
  const campoTermometro = camposDoQuadro.find((c) => semAcento(c.nome) === 'termometro');
  const temTermometro = !!String((campoTermometro && valoresCampos[campoTermometro.id]) || '').trim();

  return (
    <ModalFrame
      titulo={editando ? 'Editar tarefa' : 'Nova tarefa'}
      onFechar={onFechar}
      largura={editando ? 'max-w-2xl' : 'max-w-xl'}
    >
      {editando && (
        <div className="mb-4 flex flex-wrap gap-1 border-b border-slate-200 pb-2">
          {ABAS.map((a) => {
            const Icone = a.icone;
            return (
              <button
                key={a.id}
                type="button"
                onClick={() => setAba(a.id)}
                className={[
                  'inline-flex items-center gap-1 rounded-lg px-2.5 py-1 text-xs font-medium transition-colors',
                  aba === a.id
                    ? 'bg-nexus-700 text-white'
                    : 'text-slate-600 hover:bg-slate-100',
                ].join(' ')}
              >
                <Icone size={12} /> {a.nome}
              </button>
            );
          })}
        </div>
      )}

      {editando && aba !== 'detalhes' && (
        <div className="space-y-4">
          {aba === 'subtarefas' && (
            <CardSubtarefas
              cardId={cardId}
              podeEditar={podeEditar}
              onMudou={aoMudarExtras}
              aoAbrirCard={aoAbrirCard}
            />
          )}
          {aba === 'dependencias' && (
            <CardDependencias
              cardId={cardId}
              podeEditar={podeEditar}
              cardsDoQuadro={quadro.cards || []}
              onMudou={aoMudarExtras}
            />
          )}
          {aba === 'vinculos' && (
            <CardVinculos cardId={cardId} podeEditar={podeEditar} onMudou={aoMudarExtras} />
          )}
          {aba === 'horas' && (
            <CardTimer cardId={cardId} podeEditar={podeEditar} onMudou={aoMudarExtras} />
          )}
          {aba === 'historico' && <CardHistorico cardId={cardId} />}

          <div className="flex justify-end border-t border-slate-200 pt-3">
            <button
              type="button"
              onClick={onFechar}
              className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
            >
              Fechar
            </button>
          </div>
        </div>
      )}

      {(!editando || aba === 'detalhes') && (
        <form onSubmit={submeter} className="space-y-3">
          <div>
            <label className="block text-sm font-medium text-slate-900 mb-1">
              Título<span className="text-red-600">*</span>
            </label>
            <input
              className={inputCls}
              value={titulo}
              onChange={(e) => setTitulo(e.target.value)}
              maxLength={255}
              required
              autoFocus
            />
          </div>

          {temTermometro && (
            <p className="rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-1.5 text-xs text-slate-500">
              Prioridade, Estimativa, Pontos e Início ficam ocultos enquanto o Termômetro está
              preenchido — o card já está categorizado por ele. Prazo continua disponível, é só
              informativo.
            </p>
          )}

          {/* Sprint 34 — prioridade / estimativa / pontos */}
          {!temTermometro && (
            <div className="grid grid-cols-3 gap-3">
              <div>
                <label className="mb-1 block text-sm font-medium text-slate-900">
                  <span className="inline-flex items-center gap-1"><Flag size={12} /> Prioridade</span>
                </label>
                <div className="flex gap-1">
                  {PRIORIDADES.map((p) => (
                    <button
                      key={p.valor}
                      type="button"
                      onClick={() => setPrioridade(p.valor)}
                      title={p.nome}
                      className={[
                        'flex-1 rounded-md border px-1 py-1.5 text-[11px] font-bold transition-all',
                        p.chip,
                        Number(prioridade) === p.valor
                          ? 'ring-2 ring-offset-1 ring-nexus-700'
                          : 'opacity-50 hover:opacity-100',
                      ].join(' ')}
                    >
                      {p.sigla}
                    </button>
                  ))}
                </div>
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium text-slate-900">Estimativa (h)</label>
                <input
                  className={inputCls}
                  type="number"
                  step="0.5"
                  min="0"
                  value={estimativa}
                  onChange={(e) => setEstimativa(e.target.value)}
                  placeholder="—"
                />
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium text-slate-900">Pontos</label>
                <input
                  className={inputCls}
                  type="number"
                  min="0"
                  value={pontos}
                  onChange={(e) => setPontos(e.target.value)}
                  placeholder="—"
                />
              </div>
            </div>
          )}

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-medium text-slate-900 mb-1">
                Responsáveis
                {responsavelIds.length > 0 && (
                  <span className="ml-1 text-xs font-normal text-slate-500">
                    ({responsavelIds.length} selecionado{responsavelIds.length === 1 ? '' : 's'})
                  </span>
                )}
              </label>
              <MultiSelectPessoas
                pessoas={pessoas}
                selecionadosIds={responsavelIds}
                onChange={setResponsavelIds}
              />
              {pessoas.length === 0 && (
                <p className="mt-1 text-xs text-slate-500">Nenhuma pessoa ativa cadastrada.</p>
              )}
            </div>
            <div className="space-y-2">
              {!temTermometro && (
                <div>
                  <label className="block text-sm font-medium text-slate-900 mb-1">Início</label>
                  <input
                    type="date"
                    className={inputCls}
                    value={dataInicio}
                    onChange={(e) => setDataInicio(e.target.value)}
                  />
                </div>
              )}
              <div>
                <label className="block text-sm font-medium text-slate-900 mb-1">Prazo</label>
                <input
                  type="date"
                  className={inputCls}
                  value={dataPrazo}
                  onChange={(e) => setDataPrazo(e.target.value)}
                />
                {dataPrazo && (
                  <label className="mt-1.5 inline-flex items-center gap-1.5 text-xs text-slate-600 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={prazoConcluido}
                      onChange={(e) => setPrazoConcluido(e.target.checked)}
                    />
                    Prazo concluído
                  </label>
                )}
              </div>
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-900 mb-1">
              <span className="inline-flex items-center gap-1"><Palette size={13} /> Capa</span>
            </label>
            <div className="flex flex-wrap items-center gap-1.5">
              <button
                type="button"
                onClick={() => { setCapaCor(null); setCapaPreset(null); }}
                className={'h-6 w-8 rounded border text-[10px] text-slate-400 ' + (!capaCor && !capaPreset ? 'border-nexus-500 ring-2 ring-nexus-200 bg-white' : 'border-slate-200 bg-white')}
                title="Sem capa"
              >
                —
              </button>
              {CORES.map((c) => (
                <button
                  key={c}
                  type="button"
                  onClick={() => { setCapaCor(c); setCapaPreset(null); }}
                  className={[
                    'h-6 w-8 rounded transition-transform',
                    corForte(c),
                    capaCor === c ? 'ring-2 ring-offset-1 ring-nexus-700 scale-105' : '',
                  ].join(' ')}
                  title={c}
                />
              ))}
              {PRESETS_LISTA.map((p) => (
                <button
                  key={p}
                  type="button"
                  onClick={() => { setCapaPreset(p); setCapaCor(null); }}
                  className={'h-6 w-10 rounded transition-transform ' + (capaPreset === p ? 'ring-2 ring-offset-1 ring-nexus-700 scale-105' : '')}
                  style={{ backgroundImage: PRESETS_VISUAL[p] }}
                  title={p}
                />
              ))}
            </div>
          </div>

          {quadro.etiquetas.length > 0 && (
            <div>
              <label className="block text-sm font-medium text-slate-900 mb-1">Etiquetas</label>
              <div className="flex flex-wrap gap-1.5">
                {quadro.etiquetas.map((e) => {
                  const ativo = etiquetaIds.includes(e.id);
                  return (
                    <button
                      key={e.id}
                      type="button"
                      onClick={() => alternarEtiqueta(e.id)}
                      className={[
                        'inline-flex items-center rounded px-2 py-0.5 text-xs font-medium border transition-opacity',
                        COR_CHIP[e.cor] || COR_CHIP.slate,
                        ativo ? 'opacity-100 ring-1 ring-offset-1 ring-nexus-700' : 'opacity-50 hover:opacity-100',
                      ].join(' ')}
                    >
                      {e.nome}
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          <div>
            <label className="block text-sm font-medium text-slate-900 mb-1">
              Descrição <span className="text-xs font-normal text-slate-500">(suporta markdown)</span>
            </label>
            <textarea
              className={inputCls + ' font-mono text-xs'}
              rows={5}
              value={descricao}
              onChange={(e) => setDescricao(e.target.value)}
              maxLength={20000}
              placeholder="Detalhes da tarefa, contexto, links…"
            />
          </div>

          {editando && camposVisiveisNoCard.length > 0 && (
            <div className="border-t border-slate-200 pt-3">
              <h3 className="mb-1 text-sm font-semibold text-slate-900">
                {ehCliente ? 'Dados do cliente' : 'Campos do quadro'}
              </h3>
              {ehCliente && (
                <p className="mb-2 text-xs text-slate-500">
                  Preenchidos aqui, estes dados aparecem direto no card, no board.
                </p>
              )}
              <CardCampos
                cardId={cardId}
                campos={camposVisiveisNoCard}
                valoresIniciais={valoresCampos}
                pessoas={pessoas}
                podeEditar={podeEditar}
                onMudou={aoMudarExtras}
              />
            </div>
          )}

          {editando && (
            <div className="space-y-5 border-t border-slate-200 pt-4">
              <section>
                <h3 className="mb-2 flex items-center gap-1.5 text-sm font-semibold text-slate-900">
                  <ListChecks size={14} /> Checklists
                </h3>
                <CardChecklists cardId={cardId} podeEditar={podeEditar} onMudou={aoMudarExtras} />
              </section>

              <section>
                <h3 className="mb-2 flex items-center gap-1.5 text-sm font-semibold text-slate-900">
                  <Paperclip size={14} /> Anexos
                </h3>
                <CardAnexos cardId={cardId} podeEditar={podeEditar} onMudou={aoMudarExtras} />
              </section>

              <section>
                <h3 className="mb-2 flex items-center gap-1.5 text-sm font-semibold text-slate-900">
                  <MessageSquare size={14} /> Comentários
                </h3>
                <CardComentarios cardId={cardId} podeEditar={podeEditar} onMudou={aoMudarExtras} />
              </section>
            </div>
          )}

          {editando && movendo && (
            <div className="space-y-2 rounded-lg border border-nexus-200 bg-nexus-50/50 p-3">
              <div className="text-xs font-medium text-slate-900">Mover para outro quadro</div>
              <p className="text-[11px] text-slate-500">
                Título, descrição, checklists, comentários e anexos vão junto. Etiqueta e campo
                personalizado são deste quadro e não seguem — ficam salvos, mas somem da tela.
              </p>
              {quadrosDisponiveis === null ? (
                <p className="text-xs text-slate-500">Carregando quadros…</p>
              ) : (
                <>
                  <select
                    className={inputCls}
                    value={quadroDestinoId}
                    onChange={(e) => escolherQuadroDestino(e.target.value)}
                  >
                    <option value="">Escolha o quadro de destino…</option>
                    {quadrosDisponiveis.map((q) => (
                      <option key={q.id} value={q.id}>{q.equipe_nome ? q.equipe_nome + ' — ' : ''}{q.nome}</option>
                    ))}
                  </select>
                  {quadroDestinoId && (
                    <select
                      className={inputCls}
                      value={colunaDestinoId}
                      onChange={(e) => setColunaDestinoId(e.target.value)}
                    >
                      <option value="">Escolha a coluna…</option>
                      {colunasDestino.map((c) => (<option key={c.id} value={c.id}>{c.nome}</option>))}
                    </select>
                  )}
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={confirmarMoverQuadro}
                      disabled={!quadroDestinoId || !colunaDestinoId || movendoSalvando}
                      className="rounded-md bg-nexus-700 px-2.5 py-1 text-xs font-medium text-white hover:bg-nexus-800 disabled:opacity-50"
                    >
                      {movendoSalvando ? 'Movendo…' : 'Mover'}
                    </button>
                    <button
                      type="button"
                      onClick={() => { setMovendo(false); setQuadroDestinoId(''); setColunaDestinoId(''); }}
                      className="rounded-md border border-slate-300 bg-white px-2.5 py-1 text-xs font-medium text-slate-700 hover:bg-slate-50"
                    >
                      Cancelar
                    </button>
                  </div>
                </>
              )}
            </div>
          )}

          {erro && (
            <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{erro}</div>
          )}

          <div className="flex items-center justify-between gap-2 pt-2">
            {editando ? (
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={arquivar}
                  className="inline-flex items-center gap-1 rounded-lg border border-amber-200 bg-white px-3 py-1.5 text-xs font-medium text-amber-700 hover:bg-amber-50"
                >
                  <Archive size={12} /> Arquivar
                </button>
                {!movendo && (
                  <button
                    type="button"
                    onClick={abrirMoverQuadro}
                    className="inline-flex items-center gap-1 rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50"
                  >
                    <FolderInput size={12} /> Mover para outro quadro
                  </button>
                )}
              </div>
            ) : <span />}

            <div className="flex gap-2">
              <button
                type="button"
                onClick={onFechar}
                className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
              >
                Cancelar
              </button>
              <button
                type="submit"
                disabled={salvando}
                className="rounded-lg bg-nexus-700 px-4 py-2 text-sm font-medium text-white hover:bg-nexus-800 disabled:opacity-50"
              >
                {salvando ? 'Salvando…' : (editando ? 'Salvar' : 'Criar tarefa')}
              </button>
            </div>
          </div>
        </form>
      )}
    </ModalFrame>
  );
}
