import { useEffect, useState } from 'react';
import { Plus, Trash2, X, Pencil } from 'lucide-react';
import { api, mensagemDeErro } from '../../api/client.js';
import { inputCls } from './ui.js';

/**
 * Sprint 34 — Campos personalizados.
 *
 * `CardCampos`  → preenche os valores num card (usa as definições do quadro)
 * `GestorCampos` → cria/edita/exclui as definições (modal de config do quadro)
 *
 * O valor é gravado como jsonb e o tipo é validado no backend. Aqui a UI
 * só escolhe o input certo.
 */

const TIPOS = [
  { valor: 'texto', nome: 'Texto' },
  { valor: 'numero', nome: 'Número' },
  { valor: 'moeda', nome: 'Moeda (R$)' },
  { valor: 'data', nome: 'Data' },
  { valor: 'selecao', nome: 'Seleção' },
  { valor: 'checkbox', nome: 'Sim/Não' },
  { valor: 'pessoa', nome: 'Pessoa' },
  { valor: 'url', nome: 'Link' },
];

// ---------------------------------------------------------------------------
// Valores no card
// ---------------------------------------------------------------------------

export default function CardCampos({ cardId, campos = [], valoresIniciais = {}, podeEditar, pessoas = [], onMudou }) {
  const [valores, setValores] = useState(valoresIniciais || {});
  const [salvando, setSalvando] = useState(null);

  useEffect(() => { setValores(valoresIniciais || {}); }, [cardId]); // eslint-disable-line

  async function salvar(campoId, valor) {
    setSalvando(campoId);
    try {
      await api.put('/cards/' + cardId + '/campos/' + campoId, { valor });
      setValores((v) => ({ ...v, [campoId]: valor }));
      onMudou?.();
    } catch (err) {
      alert(mensagemDeErro(err, 'Não consegui salvar o campo.'));
    } finally {
      setSalvando(null);
    }
  }

  if (campos.length === 0) {
    return (
      <p className="text-xs text-slate-400">
        Este quadro não tem campos personalizados. Crie em Configurações do quadro.
      </p>
    );
  }

  return (
    <div className="grid grid-cols-2 gap-3">
      {campos.map((c) => {
        const v = valores[c.id];
        const comum = {
          disabled: !podeEditar || salvando === c.id,
          className: inputCls,
        };
        return (
          <div key={c.id}>
            <label className="mb-1 block text-xs font-medium text-slate-700">
              {c.nome}
              {salvando === c.id && <span className="ml-1 text-[10px] text-slate-400">salvando…</span>}
            </label>

            {c.tipo === 'checkbox' && (
              <input
                type="checkbox"
                checked={!!v}
                disabled={!podeEditar}
                onChange={(e) => salvar(c.id, e.target.checked)}
                className="h-4 w-4"
              />
            )}

            {c.tipo === 'selecao' && (
              <select
                {...comum}
                value={v ?? ''}
                onChange={(e) => salvar(c.id, e.target.value || null)}
              >
                <option value="">—</option>
                {(c.opcoes || []).map((o) => (<option key={o} value={o}>{o}</option>))}
              </select>
            )}

            {c.tipo === 'pessoa' && (
              <select
                {...comum}
                value={v ?? ''}
                onChange={(e) => salvar(c.id, e.target.value || null)}
              >
                <option value="">—</option>
                {pessoas.map((p) => (<option key={p.id} value={p.id}>{p.nome}</option>))}
              </select>
            )}

            {['texto', 'url'].includes(c.tipo) && (
              <input
                {...comum}
                type={c.tipo === 'url' ? 'url' : 'text'}
                defaultValue={v ?? ''}
                onBlur={(e) => {
                  const novo = e.target.value.trim() || null;
                  if (novo !== (v ?? null)) salvar(c.id, novo);
                }}
              />
            )}

            {['numero', 'moeda'].includes(c.tipo) && (
              <input
                {...comum}
                type="number"
                step="0.01"
                defaultValue={v ?? ''}
                onBlur={(e) => {
                  const t = e.target.value.trim();
                  const novo = t === '' ? null : Number(t);
                  if (novo !== (v ?? null)) salvar(c.id, novo);
                }}
              />
            )}

            {c.tipo === 'data' && (
              <input
                {...comum}
                type="date"
                value={v ?? ''}
                onChange={(e) => salvar(c.id, e.target.value || null)}
              />
            )}
          </div>
        );
      })}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Definições dos campos (config do quadro)
// ---------------------------------------------------------------------------

export function GestorCampos({ quadroId, campos, onMudou }) {
  const [criando, setCriando] = useState(false);
  const [nome, setNome] = useState('');
  const [tipo, setTipo] = useState('texto');
  const [opcoesTexto, setOpcoesTexto] = useState('');
  const [mostrarNoCard, setMostrarNoCard] = useState(false);

  // Editar um campo existente era impossível: só dava para criar e excluir —
  // e excluir leva junto os valores preenchidos em todos os cards. O backend
  // já tinha PUT /quadros/:id/campos/:campoId; faltava a tela.
  const [editandoId, setEditandoId] = useState(null);
  const [edNome, setEdNome] = useState('');
  const [edOpcoes, setEdOpcoes] = useState('');
  const [edMostrar, setEdMostrar] = useState(false);

  function limpar() {
    setNome(''); setTipo('texto'); setOpcoesTexto(''); setMostrarNoCard(false); setCriando(false);
  }

  function abrirEdicao(c) {
    setEditandoId(c.id);
    setEdNome(c.nome);
    setEdOpcoes((c.opcoes || []).join(', '));
    setEdMostrar(!!c.mostrar_no_card);
  }

  async function salvarEdicao() {
    const campo = campos.find((c) => c.id === editandoId);
    if (!campo || !edNome.trim()) return;
    const corpo = { nome: edNome.trim(), mostrar_no_card: edMostrar };
    if (campo.tipo === 'selecao') {
      const opcoes = edOpcoes.split(',').map((s) => s.trim()).filter(Boolean);
      if (opcoes.length === 0) {
        alert('Campo de seleção precisa de pelo menos uma opção.');
        return;
      }
      corpo.opcoes = opcoes;
    }
    try {
      await api.put(`/quadros/${quadroId}/campos/${editandoId}`, corpo);
      setEditandoId(null);
      onMudou?.();
    } catch (err) {
      alert(mensagemDeErro(err, 'Não consegui salvar o campo.'));
    }
  }

  async function criar() {
    if (!nome.trim()) return;
    const opcoes = tipo === 'selecao'
      ? opcoesTexto.split(',').map((s) => s.trim()).filter(Boolean)
      : null;
    if (tipo === 'selecao' && (!opcoes || opcoes.length === 0)) {
      alert('Campo de seleção precisa de pelo menos uma opção (separe por vírgula).');
      return;
    }
    try {
      await api.post('/quadros/' + quadroId + '/campos', {
        nome: nome.trim(),
        tipo,
        opcoes,
        mostrar_no_card: mostrarNoCard,
      });
      limpar();
      onMudou?.();
    } catch (err) {
      alert(mensagemDeErro(err));
    }
  }

  async function excluir(id) {
    if (!confirm('Excluir o campo? Os valores preenchidos nos cards somem junto.')) return;
    try {
      await api.delete('/quadros/' + quadroId + '/campos/' + id);
      onMudou?.();
    } catch (err) {
      alert(mensagemDeErro(err));
    }
  }

  return (
    <div className="space-y-2">
      {campos.length > 0 && (
        <ul className="space-y-1">
          {campos.map((c) => (
            editandoId === c.id ? (
              <li key={c.id} className="space-y-2 rounded-lg border border-nexus-300 bg-nexus-50 p-2">
                <input
                  autoFocus
                  className={inputCls}
                  value={edNome}
                  onChange={(e) => setEdNome(e.target.value)}
                  placeholder="Nome do campo"
                  maxLength={60}
                />
                {c.tipo === 'selecao' && (
                  <input
                    className={inputCls}
                    value={edOpcoes}
                    onChange={(e) => setEdOpcoes(e.target.value)}
                    placeholder="Opções separadas por vírgula"
                  />
                )}
                <label className="flex items-center gap-2 text-xs text-slate-600">
                  <input
                    type="checkbox"
                    checked={edMostrar}
                    onChange={(e) => setEdMostrar(e.target.checked)}
                  />
                  Mostrar no card
                </label>
                <p className="text-[10px] text-slate-400">
                  O tipo ({TIPOS.find((t) => t.valor === c.tipo)?.nome || c.tipo}) não muda:
                  trocá-lo invalidaria os valores já preenchidos nos cards.
                </p>
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
                    onClick={() => setEditandoId(null)}
                    className="rounded-md p-1 text-slate-500 hover:bg-slate-200"
                  >
                    <X size={13} />
                  </button>
                </div>
              </li>
            ) : (
              <li key={c.id} className="flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-2 py-1.5">
                <span className="flex-1 truncate text-xs font-medium text-slate-800">{c.nome}</span>
                {c.mostrar_no_card && (
                  <span
                    className="shrink-0 rounded bg-nexus-100 px-1.5 py-0.5 text-[9px] font-medium uppercase text-nexus-800"
                    title="Aparece no card, no board"
                  >
                    no card
                  </span>
                )}
                <span className="shrink-0 rounded bg-slate-100 px-1.5 py-0.5 text-[9px] uppercase text-slate-500">
                  {TIPOS.find((t) => t.valor === c.tipo)?.nome || c.tipo}
                </span>
                <button
                  type="button"
                  onClick={() => abrirEdicao(c)}
                  className="shrink-0 rounded p-0.5 text-slate-400 hover:bg-slate-100 hover:text-nexus-700"
                  title="Editar campo"
                >
                  <Pencil size={11} />
                </button>
                <button
                  type="button"
                  onClick={() => excluir(c.id)}
                  className="shrink-0 rounded p-0.5 text-slate-400 hover:bg-slate-100 hover:text-red-600"
                  title="Excluir campo"
                >
                  <Trash2 size={11} />
                </button>
              </li>
            )
          ))}
        </ul>
      )}

      {criando ? (
        <div className="space-y-2 rounded-lg border border-slate-200 bg-slate-50 p-2">
          <input
            autoFocus
            className={inputCls}
            value={nome}
            onChange={(e) => setNome(e.target.value)}
            placeholder="Nome do campo (ex.: Valor do contrato)"
            maxLength={60}
          />
          <select className={inputCls} value={tipo} onChange={(e) => setTipo(e.target.value)}>
            {TIPOS.map((t) => (<option key={t.valor} value={t.valor}>{t.nome}</option>))}
          </select>
          {tipo === 'selecao' && (
            <input
              className={inputCls}
              value={opcoesTexto}
              onChange={(e) => setOpcoesTexto(e.target.value)}
              placeholder="Opções separadas por vírgula"
            />
          )}
          <label className="flex items-center gap-2 text-xs text-slate-600">
            <input
              type="checkbox"
              checked={mostrarNoCard}
              onChange={(e) => setMostrarNoCard(e.target.checked)}
            />
            Mostrar como selo no card
          </label>
          <div className="flex gap-1">
            <button type="button" onClick={criar}
              className="rounded-md bg-nexus-700 px-2.5 py-1 text-xs font-medium text-white hover:bg-nexus-800">
              Criar campo
            </button>
            <button type="button" onClick={limpar}
              className="rounded-md p-1 text-slate-500 hover:bg-slate-200">
              <X size={13} />
            </button>
          </div>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => setCriando(true)}
          className="inline-flex items-center gap-1 rounded-md border border-dashed border-slate-300 bg-white px-2 py-1 text-xs text-slate-500 hover:border-nexus-300 hover:text-nexus-700"
        >
          <Plus size={11} /> Novo campo personalizado
        </button>
      )}
    </div>
  );
}
