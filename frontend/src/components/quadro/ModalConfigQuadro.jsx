import { useState } from 'react';
import {
  Archive, Tag as TagIcon, Trash2, Pencil, Plus, SlidersHorizontal, Zap, Palette, ArrowDownUp,
} from 'lucide-react';
import { api, mensagemDeErro } from '../../api/client.js';
import ModalFrame from './ModalFrame.jsx';
import { GestorCampos } from './CardCampos.jsx';
import Automacoes from './Automacoes.jsx';
import {
  COR_CHIP, CORES, inputCls, semAcento,
} from './ui.js';
import { CORES_KANBAN, COR_HEX, PRESETS_VISUAL, PRESETS_LISTA } from '../../constants/kanbanVisual.js';

/**
 * Configurações do quadro: metadados, etiquetas e (Sprint 34) os campos
 * personalizados.
 */
export default function ModalConfigQuadro({ quadro, onFechar, onAlterado, onRecarregar }) {
  const [nome, setNome] = useState(quadro.nome);
  const [descricao, setDescricao] = useState(quadro.descricao || '');
  const [aberto, setAberto] = useState(quadro.aberto_a_socios);
  const [fundoCor, setFundoCor] = useState(quadro.fundo_cor || null);
  const [fundoPreset, setFundoPreset] = useState(quadro.fundo_preset || null);
  const [etiquetas, setEtiquetas] = useState(quadro.etiquetas);
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState('');
  const [reordenando, setReordenando] = useState(false);
  const [msgReordenar, setMsgReordenar] = useState('');

  async function salvarMetadados() {
    setSalvando(true);
    setErro('');
    try {
      await api.put('/quadros/' + quadro.id, {
        nome,
        descricao: descricao || null,
        aberto_a_socios: aberto,
        fundo_cor: fundoCor,
        fundo_preset: fundoPreset,
      });
      onAlterado();
    } catch (err) {
      setErro(mensagemDeErro(err));
    } finally {
      setSalvando(false);
    }
  }

  // Card criado antes do campo "Termômetro" existir (ou importado pelo CSV
  // antigo) não se reordena sozinho — só card NOVO nasce já na posição
  // certa. Isso aqui é o "reordenar agora" pros que já existem.
  async function reordenarPorTermometro() {
    setReordenando(true);
    setMsgReordenar('');
    setErro('');
    try {
      const r = await api.post('/quadros/' + quadro.id + '/reordenar-termometro');
      setMsgReordenar(
        r.data.cards_reordenados > 0
          ? r.data.cards_reordenados + ' card(s) reordenado(s) por Termômetro.'
          : 'Já estavam na ordem certa — nada mudou.',
      );
      onRecarregar();
    } catch (err) {
      setErro(mensagemDeErro(err));
    } finally {
      setReordenando(false);
    }
  }

  async function arquivar() {
    if (!confirm('Arquivar o quadro "' + quadro.nome + '"? Ele some da listagem mas pode ser desarquivado depois (no banco).')) return;
    try {
      await api.post('/quadros/' + quadro.id + '/arquivar');
      window.location.assign('/tarefas');
    } catch (err) {
      setErro(mensagemDeErro(err));
    }
  }

  return (
    <ModalFrame titulo="Configurações do quadro" onFechar={onFechar} largura="max-w-2xl">
      <div className="space-y-4">
        <div>
          <label className="block text-sm font-medium text-slate-900 mb-1">
            Nome<span className="text-red-600">*</span>
          </label>
          <input
            className={inputCls}
            value={nome}
            onChange={(e) => setNome(e.target.value)}
            maxLength={100}
            required
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-slate-900 mb-1">Descrição</label>
          <textarea
            className={inputCls}
            rows={2}
            value={descricao}
            onChange={(e) => setDescricao(e.target.value)}
            maxLength={2000}
          />
        </div>

        <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
          <label className="flex items-start gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={aberto}
              onChange={(e) => setAberto(e.target.checked)}
              className="mt-1"
            />
            <div>
              <div className="text-sm font-medium text-slate-900">Aberto a todos os sócios</div>
              <div className="text-xs text-slate-500">
                Qualquer pessoa autenticada visualiza, mas só membros da equipe editam.
              </div>
            </div>
          </label>
        </div>

        <div>
          <h3 className="mb-2 flex items-center gap-1.5 text-sm font-semibold text-slate-900">
            <Palette size={13} /> Fundo do quadro
          </h3>
          <div className="flex flex-wrap items-center gap-1.5">
            <button
              type="button"
              onClick={() => { setFundoCor(null); setFundoPreset(null); }}
              className={'flex h-7 w-9 items-center justify-center rounded border text-[10px] text-slate-400 ' + (!fundoCor && !fundoPreset ? 'border-nexus-500 ring-2 ring-nexus-200 bg-white' : 'border-slate-200 bg-white')}
              title="Sem fundo"
            >
              —
            </button>
            {CORES_KANBAN.map((c) => (
              <button
                key={c}
                type="button"
                onClick={() => { setFundoCor(c); setFundoPreset(null); }}
                className={'h-7 w-9 rounded ' + (fundoCor === c ? 'ring-2 ring-offset-1 ring-nexus-700' : '')}
                style={{ backgroundColor: COR_HEX[c] }}
                title={c}
              />
            ))}
            {PRESETS_LISTA.map((p) => (
              <button
                key={p}
                type="button"
                onClick={() => { setFundoPreset(p); setFundoCor(null); }}
                className={'h-7 w-12 rounded ' + (fundoPreset === p ? 'ring-2 ring-offset-1 ring-nexus-700' : '')}
                style={{ backgroundImage: PRESETS_VISUAL[p] }}
                title={p}
              />
            ))}
          </div>
          <p className="mt-1 text-[11px] text-slate-400">Clique em &quot;Salvar&quot; (no rodapé) para aplicar o fundo.</p>
        </div>

        <div>
          <h3 className="mb-2 flex items-center gap-1.5 text-sm font-semibold text-slate-900">
            <TagIcon size={13} /> Etiquetas
          </h3>
          <ListaEtiquetas
            quadroId={quadro.id}
            etiquetas={etiquetas}
            onMudou={(novas) => setEtiquetas(novas)}
          />
        </div>

        {/* Sprint 34 — campos personalizados */}
        <div>
          <h3 className="mb-2 flex items-center gap-1.5 text-sm font-semibold text-slate-900">
            <SlidersHorizontal size={13} /> Campos personalizados
          </h3>
          <GestorCampos
            quadroId={quadro.id}
            campos={quadro.campos || []}
            onMudou={onRecarregar}
          />
          {(quadro.campos || []).some((c) => semAcento(c.nome) === 'termometro') && (
            <div className="mt-3 rounded-lg border border-slate-200 bg-slate-50 p-2.5">
              <div className="mb-1.5 text-xs text-slate-600">
                Card criado antes do campo Termômetro (ou importado por uma planilha antiga) não
                se reordena sozinho — só card novo já nasce na posição certa.
              </div>
              <button
                type="button"
                onClick={reordenarPorTermometro}
                disabled={reordenando}
                className="inline-flex items-center gap-1 rounded-md border border-slate-300 bg-white px-2.5 py-1 text-xs font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50"
              >
                <ArrowDownUp size={11} />
                {reordenando ? 'Reordenando…' : 'Reordenar cards existentes por Termômetro'}
              </button>
              {msgReordenar && <div className="mt-1.5 text-xs text-emerald-700">{msgReordenar}</div>}
            </div>
          )}
        </div>

        {/* Sprint 36 — automações */}
        <div className="border-t border-slate-200 pt-4">
          <h3 className="mb-2 flex items-center gap-1.5 text-sm font-semibold text-slate-900">
            <Zap size={13} /> Automações
          </h3>
          <Automacoes quadro={quadro} />
        </div>

        {erro && (
          <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{erro}</div>
        )}

        <div className="flex items-center justify-between gap-2 border-t border-slate-200 pt-4">
          <button
            type="button"
            onClick={arquivar}
            className="inline-flex items-center gap-1 rounded-lg border border-amber-200 bg-white px-3 py-1.5 text-xs font-medium text-amber-700 hover:bg-amber-50"
          >
            <Archive size={12} /> Arquivar quadro
          </button>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={onFechar}
              className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
            >
              Fechar
            </button>
            <button
              type="button"
              onClick={salvarMetadados}
              disabled={salvando}
              className="rounded-lg bg-nexus-700 px-4 py-2 text-sm font-medium text-white hover:bg-nexus-800 disabled:opacity-50"
            >
              {salvando ? 'Salvando…' : 'Salvar'}
            </button>
          </div>
        </div>
      </div>
    </ModalFrame>
  );
}

// ---------------------------------------------------------------------------
// Etiquetas do quadro
// ---------------------------------------------------------------------------

function ListaEtiquetas({ quadroId, etiquetas, onMudou }) {
  const [criando, setCriando] = useState(false);
  const [novoNome, setNovoNome] = useState('');
  const [novaCor, setNovaCor] = useState('slate');
  const [editandoId, setEditandoId] = useState(null);
  const [editNome, setEditNome] = useState('');
  const [editCor, setEditCor] = useState('slate');

  async function criar() {
    if (!novoNome.trim()) return;
    try {
      const r = await api.post('/quadros/' + quadroId + '/etiquetas', {
        nome: novoNome.trim(),
        cor: novaCor,
      });
      onMudou([...etiquetas, r.data]);
      setNovoNome('');
      setNovaCor('slate');
      setCriando(false);
    } catch (err) {
      alert(mensagemDeErro(err));
    }
  }

  async function excluir(eid) {
    if (!confirm('Excluir etiqueta? Ela some dos cards onde está aplicada.')) return;
    try {
      await api.delete('/quadros/' + quadroId + '/etiquetas/' + eid);
      onMudou(etiquetas.filter((e) => e.id !== eid));
    } catch (err) {
      alert(mensagemDeErro(err));
    }
  }

  function iniciarEdicao(et) {
    setEditandoId(et.id);
    setEditNome(et.nome);
    setEditCor(et.cor || 'slate');
    setCriando(false);
  }

  function cancelarEdicao() {
    setEditandoId(null);
    setEditNome('');
    setEditCor('slate');
  }

  async function salvarEdicao() {
    if (!editNome.trim()) return;
    try {
      const r = await api.put('/quadros/' + quadroId + '/etiquetas/' + editandoId, {
        nome: editNome.trim(),
        cor: editCor,
      });
      onMudou(etiquetas.map((e) => (
        e.id === editandoId ? (r.data || { ...e, nome: editNome.trim(), cor: editCor }) : e
      )));
      cancelarEdicao();
    } catch (err) {
      alert(mensagemDeErro(err));
    }
  }

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-1.5">
        {etiquetas.map((e) => (
          editandoId === e.id ? (
            <div key={e.id} className="w-full rounded-lg border border-nexus-200 bg-nexus-50/50 p-2 space-y-2">
              <input
                autoFocus
                className={inputCls}
                value={editNome}
                onChange={(ev) => setEditNome(ev.target.value)}
                onKeyDown={(ev) => {
                  if (ev.key === 'Enter') { ev.preventDefault(); salvarEdicao(); }
                  if (ev.key === 'Escape') cancelarEdicao();
                }}
                maxLength={50}
              />
              <div className="flex flex-wrap gap-1">
                {CORES.map((c) => (
                  <button
                    key={c}
                    type="button"
                    onClick={() => setEditCor(c)}
                    className={[
                      'h-5 w-5 rounded-full transition-transform',
                      COR_CHIP[c]?.split(' ')[0]?.replace('-100', '-500') || 'bg-slate-500',
                      editCor === c ? 'ring-2 ring-offset-1 ring-nexus-700 scale-110' : '',
                    ].join(' ')}
                  />
                ))}
              </div>
              <div className="flex gap-1">
                <button
                  type="button"
                  onClick={salvarEdicao}
                  className="rounded-md bg-nexus-700 px-2.5 py-1 text-xs font-medium text-white hover:bg-nexus-800"
                >
                  Salvar
                </button>
                <button
                  type="button"
                  onClick={cancelarEdicao}
                  className="rounded-md border border-slate-300 bg-white px-2.5 py-1 text-xs font-medium text-slate-700 hover:bg-slate-50"
                >
                  Cancelar
                </button>
                <button
                  type="button"
                  onClick={() => { excluir(e.id); cancelarEdicao(); }}
                  className="ml-auto inline-flex items-center gap-1 rounded-md border border-red-200 bg-white px-2.5 py-1 text-xs font-medium text-red-700 hover:bg-red-50"
                >
                  <Trash2 size={10} /> Excluir
                </button>
              </div>
            </div>
          ) : (
            <span
              key={e.id}
              className={'group inline-flex items-center gap-1 rounded px-2 py-0.5 text-xs font-medium border ' + (COR_CHIP[e.cor] || COR_CHIP.slate)}
            >
              {e.nome}
              <button
                type="button"
                onClick={() => iniciarEdicao(e)}
                className="opacity-0 group-hover:opacity-70 hover:opacity-100"
                title="Editar"
              >
                <Pencil size={9} />
              </button>
            </span>
          )
        ))}
      </div>

      {criando ? (
        <div className="rounded-lg border border-slate-200 bg-slate-50 p-2 space-y-2">
          <input
            autoFocus
            className={inputCls}
            value={novoNome}
            onChange={(e) => setNovoNome(e.target.value)}
            placeholder="Nome da etiqueta"
            maxLength={50}
          />
          <div className="flex flex-wrap gap-1">
            {CORES.map((c) => (
              <button
                key={c}
                type="button"
                onClick={() => setNovaCor(c)}
                className={[
                  'h-5 w-5 rounded-full transition-transform',
                  COR_CHIP[c]?.split(' ')[0]?.replace('-100', '-500') || 'bg-slate-500',
                  novaCor === c ? 'ring-2 ring-offset-1 ring-nexus-700 scale-110' : '',
                ].join(' ')}
              />
            ))}
          </div>
          <div className="flex gap-1">
            <button
              type="button"
              onClick={criar}
              className="rounded-md bg-nexus-700 px-2.5 py-1 text-xs font-medium text-white hover:bg-nexus-800"
            >
              Criar
            </button>
            <button
              type="button"
              onClick={() => { setCriando(false); setNovoNome(''); }}
              className="rounded-md border border-slate-300 bg-white px-2.5 py-1 text-xs font-medium text-slate-700 hover:bg-slate-50"
            >
              Cancelar
            </button>
          </div>
        </div>
      ) : !editandoId ? (
        <button
          type="button"
          onClick={() => setCriando(true)}
          className="inline-flex items-center gap-1 rounded-md border border-dashed border-slate-300 bg-white px-2 py-1 text-xs text-slate-500 hover:border-nexus-300 hover:text-nexus-700"
        >
          <Plus size={11} /> Nova etiqueta
        </button>
      ) : null}
    </div>
  );
}
