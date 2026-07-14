import { useEffect, useState } from 'react';
import {
  Archive, Palette, ListChecks, Paperclip, MessageSquare, Activity,
  ListTree, Ban, Link2, Clock, SlidersHorizontal, Flag,
} from 'lucide-react';
import { api, mensagemDeErro } from '../../api/client.js';
import MultiSelectPessoas from '../MultiSelectPessoas.jsx';
import CardChecklists from '../CardChecklists.jsx';
import CardComentarios from '../CardComentarios.jsx';
import CardAnexos from '../CardAnexos.jsx';
import CardAtividades from '../CardAtividades.jsx';
import ModalFrame from './ModalFrame.jsx';
import CardSubtarefas from './CardSubtarefas.jsx';
import CardDependencias from './CardDependencias.jsx';
import CardVinculos from './CardVinculos.jsx';
import CardTimer from './CardTimer.jsx';
import CardCampos from './CardCampos.jsx';
import { COR_CHIP, CORES, corForte, inputCls, PRIORIDADES } from './ui.js';

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
  { id: 'atividade', nome: 'Atividade', icone: Activity },
];

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
  const [etiquetaIds, setEtiquetaIds] = useState([]);
  // Sprint 34
  const [prioridade, setPrioridade] = useState(2);
  const [estimativa, setEstimativa] = useState('');
  const [pontos, setPontos] = useState('');
  const [valoresCampos, setValoresCampos] = useState({});

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
        etiqueta_ids: etiquetaIds,
        prioridade: Number(prioridade),
        estimativa_horas: estimativa.trim() === '' ? null : Number(estimativa),
        pontos: pontos.trim() === '' ? null : Number(pontos),
      };
      if (editando) {
        await api.put('/cards/' + cardId, body);
      } else {
        await api.post('/cards', { ...body, coluna_id: colunaId });
      }
      onSalvo();
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

  if (carregando) {
    return (
      <ModalFrame titulo="Carregando…" onFechar={onFechar}>
        <div className="py-8 text-center text-sm text-slate-500">Carregando…</div>
      </ModalFrame>
    );
  }

  const podeEditar = !!quadro.pode_editar;
  const camposDoQuadro = quadro.campos || [];

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
          {aba === 'atividade' && <CardAtividades cardId={cardId} />}

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

          {/* Sprint 34 — prioridade / estimativa / pontos */}
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
              <div>
                <label className="block text-sm font-medium text-slate-900 mb-1">Início</label>
                <input
                  type="date"
                  className={inputCls}
                  value={dataInicio}
                  onChange={(e) => setDataInicio(e.target.value)}
                />
              </div>
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
                onClick={() => setCapaCor(null)}
                className={'h-6 w-8 rounded border text-[10px] text-slate-400 ' + (capaCor ? 'border-slate-200 bg-white' : 'border-nexus-500 ring-2 ring-nexus-200 bg-white')}
                title="Sem capa"
              >
                —
              </button>
              {CORES.map((c) => (
                <button
                  key={c}
                  type="button"
                  onClick={() => setCapaCor(c)}
                  className={[
                    'h-6 w-8 rounded transition-transform',
                    corForte(c),
                    capaCor === c ? 'ring-2 ring-offset-1 ring-nexus-700 scale-105' : '',
                  ].join(' ')}
                  title={c}
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

          {editando && camposDoQuadro.length > 0 && (
            <div className="border-t border-slate-200 pt-3">
              <h3 className="mb-2 text-sm font-semibold text-slate-900">Campos do quadro</h3>
              <CardCampos
                cardId={cardId}
                campos={camposDoQuadro}
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

          {erro && (
            <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{erro}</div>
          )}

          <div className="flex items-center justify-between gap-2 pt-2">
            {editando ? (
              <button
                type="button"
                onClick={arquivar}
                className="inline-flex items-center gap-1 rounded-lg border border-amber-200 bg-white px-3 py-1.5 text-xs font-medium text-amber-700 hover:bg-amber-50"
              >
                <Archive size={12} /> Arquivar
              </button>
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
