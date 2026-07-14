import { useEffect, useState } from 'react';
import {
  Zap, Plus, Trash2, ChevronRight, CheckCircle2, XCircle, MinusCircle,
  Power, History, X,
} from 'lucide-react';
import { api, mensagemDeErro } from '../../api/client.js';
import { inputCls } from './ui.js';

/**
 * Sprint 36 — Automações do quadro.
 *
 * Construtor de regra em linguagem natural: QUANDO … SE … ENTÃO …
 * Um DSL visual seria mais poderoso e menos usado. Frase montada é o que
 * as pessoas de fato conseguem escrever sem manual.
 *
 * O log de execuções fica ao lado da regra, não escondido: automação que
 * não se explica é automação em que ninguém confia.
 */

const GATILHOS = [
  { tipo: 'card_criado', label: 'um card for criado', temColuna: true },
  { tipo: 'card_movido', label: 'um card for movido', temColuna: true },
  { tipo: 'checklist_completo', label: 'o checklist for 100% concluído' },
  { tipo: 'prazo_proximo', label: 'faltar N dias para o prazo', temDias: true },
  { tipo: 'agendada', label: 'todo dia (varredura das 07h)' },
];

const CAMPOS = [
  { v: 'prioridade', label: 'prioridade', num: true },
  { v: 'tem_responsavel', label: 'tem responsável', bool: true },
  { v: 'tem_prazo', label: 'tem prazo', bool: true },
  { v: 'prazo_vencido', label: 'prazo vencido', bool: true },
  { v: 'bloqueado', label: 'está bloqueado', bool: true },
  { v: 'titulo', label: 'título', texto: true },
  { v: 'estimativa_horas', label: 'estimativa (h)', num: true },
];

const ACOES = [
  { tipo: 'mover_coluna', label: 'mover para a coluna…' },
  { tipo: 'definir_prioridade', label: 'definir prioridade…' },
  { tipo: 'definir_prazo', label: 'definir prazo em N dias…' },
  { tipo: 'adicionar_etiqueta', label: 'adicionar etiqueta…' },
  { tipo: 'atribuir', label: 'atribuir responsável…' },
  { tipo: 'comentar', label: 'comentar no card…' },
  { tipo: 'criar_checklist', label: 'criar checklist…' },
  { tipo: 'criar_conta_pagar', label: 'criar conta a pagar…' },
];

const ICONE_STATUS = { ok: CheckCircle2, erro: XCircle, ignorada: MinusCircle };
const COR_STATUS = { ok: 'text-emerald-600', erro: 'text-red-600', ignorada: 'text-slate-400' };

export default function Automacoes({ quadro, onFechar }) {
  const [lista, setLista] = useState([]);
  const [carregando, setCarregando] = useState(true);
  const [criando, setCriando] = useState(false);
  const [logAberto, setLogAberto] = useState(null);

  async function carregar() {
    setCarregando(true);
    try {
      const r = await api.get('/quadros/' + quadro.id + '/automacoes');
      setLista(r.data || []);
    } catch (err) {
      alert(mensagemDeErro(err));
    } finally {
      setCarregando(false);
    }
  }

  useEffect(() => { carregar(); /* eslint-disable-next-line */ }, [quadro.id]);

  async function alternarAtiva(a) {
    try {
      await api.put('/quadros/' + quadro.id + '/automacoes/' + a.id, { ativa: !a.ativa });
      carregar();
    } catch (err) { alert(mensagemDeErro(err)); }
  }

  async function excluir(a) {
    if (!confirm('Excluir a automação "' + a.nome + '"? O histórico de execuções vai junto.')) return;
    try {
      await api.delete('/quadros/' + quadro.id + '/automacoes/' + a.id);
      carregar();
    } catch (err) { alert(mensagemDeErro(err)); }
  }

  return (
    <div className="space-y-4">
      <p className="text-xs text-slate-500">
        Regras que rodam sozinhas quando algo acontece no quadro. Elas podem
        atravessar módulos — fechar um card e a conta a pagar daquele trabalho
        nascer sozinha, já vinculada.
      </p>

      {carregando ? (
        <p className="text-xs text-slate-400">Carregando…</p>
      ) : lista.length === 0 ? (
        <div className="rounded-lg border border-dashed border-slate-300 bg-white px-3 py-6 text-center text-xs text-slate-400">
          Nenhuma automação neste quadro ainda.
        </div>
      ) : (
        <ul className="space-y-2">
          {lista.map((a) => (
            <li key={a.id} className="rounded-lg border border-slate-200 bg-white">
              <div className="flex items-center gap-2 px-3 py-2">
                <Zap size={14} className={a.ativa ? 'text-amber-500' : 'text-slate-300'} />
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm font-medium text-slate-900">{a.nome}</div>
                  <div className="text-[11px] text-slate-500">
                    {frase(a, quadro)}
                  </div>
                </div>

                {(a.n_ok > 0 || a.n_erro > 0) && (
                  <span className="shrink-0 text-[10px] tabular-nums text-slate-400">
                    {a.n_ok} ok
                    {a.n_erro > 0 && <span className="text-red-600"> · {a.n_erro} erro</span>}
                  </span>
                )}

                <button
                  type="button"
                  onClick={() => setLogAberto(logAberto === a.id ? null : a.id)}
                  className="shrink-0 rounded p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700"
                  title="Histórico de execuções"
                >
                  <History size={13} />
                </button>
                <button
                  type="button"
                  onClick={() => alternarAtiva(a)}
                  className={[
                    'shrink-0 rounded p-1',
                    a.ativa ? 'text-emerald-600 hover:bg-emerald-50' : 'text-slate-300 hover:bg-slate-100',
                  ].join(' ')}
                  title={a.ativa ? 'Desligar' : 'Ligar'}
                >
                  <Power size={13} />
                </button>
                <button
                  type="button"
                  onClick={() => excluir(a)}
                  className="shrink-0 rounded p-1 text-slate-400 hover:bg-slate-100 hover:text-red-600"
                >
                  <Trash2 size={13} />
                </button>
              </div>

              {logAberto === a.id && <Log quadroId={quadro.id} automacaoId={a.id} />}
            </li>
          ))}
        </ul>
      )}

      {criando ? (
        <Construtor
          quadro={quadro}
          onCancelar={() => setCriando(false)}
          onCriada={() => { setCriando(false); carregar(); }}
        />
      ) : (
        <button
          type="button"
          onClick={() => setCriando(true)}
          className="inline-flex items-center gap-1 rounded-lg bg-nexus-700 px-3 py-1.5 text-xs font-medium text-white hover:bg-nexus-800"
        >
          <Plus size={12} /> Nova automação
        </button>
      )}
    </div>
  );
}

/** Frase-resumo da regra, montada a partir do jsonb. */
function frase(a, quadro) {
  const g = GATILHOS.find((x) => x.tipo === a.gatilho?.tipo);
  const col = quadro.colunas?.find((c) => c.id === a.gatilho?.coluna_id);
  let txt = 'Quando ' + (g?.label || a.gatilho?.tipo);
  if (col) txt += ' para "' + col.nome + '"';
  if (a.gatilho?.tipo === 'prazo_proximo') txt = 'Quando faltarem ' + (a.gatilho.dias ?? 1) + ' dia(s) para o prazo';
  const n = (a.acoes || []).length;
  return txt + ' → ' + n + ' ação(ões)';
}

function Log({ quadroId, automacaoId }) {
  const [itens, setItens] = useState(null);

  useEffect(() => {
    api.get('/quadros/' + quadroId + '/automacoes/' + automacaoId + '/execucoes')
      .then((r) => setItens(r.data || []))
      .catch(() => setItens([]));
  }, [quadroId, automacaoId]);

  if (!itens) return <div className="border-t border-slate-100 px-3 py-2 text-xs text-slate-400">Carregando…</div>;
  if (itens.length === 0) {
    return (
      <div className="border-t border-slate-100 px-3 py-2 text-xs text-slate-400">
        Ainda não rodou nenhuma vez.
      </div>
    );
  }

  return (
    <ul className="max-h-52 space-y-1 overflow-y-auto border-t border-slate-100 px-3 py-2">
      {itens.map((e) => {
        const Icone = ICONE_STATUS[e.status] || MinusCircle;
        return (
          <li key={e.id} className="flex items-start gap-2 text-[11px]">
            <Icone size={12} className={'mt-0.5 shrink-0 ' + (COR_STATUS[e.status] || '')} />
            <span className="shrink-0 text-slate-400">
              {new Date(e.executado_em).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}
            </span>
            <span className="truncate text-slate-700">{e.card_titulo || '—'}</span>
            {e.status === 'ignorada' && e.detalhe?.condicao_reprovada && (
              <span className="truncate text-slate-400">
                · condição “{e.detalhe.condicao_reprovada.campo}” não bateu
              </span>
            )}
            {e.status === 'erro' && (
              <span className="truncate text-red-600">· {e.detalhe?.mensagem}</span>
            )}
          </li>
        );
      })}
    </ul>
  );
}

// ---------------------------------------------------------------------------
// Construtor: QUANDO … SE … ENTÃO …
// ---------------------------------------------------------------------------

function Construtor({ quadro, onCancelar, onCriada }) {
  const [nome, setNome] = useState('');
  const [gatilho, setGatilho] = useState({ tipo: 'card_movido', coluna_id: '' });
  const [condicoes, setCondicoes] = useState([]);
  const [acoes, setAcoes] = useState([]);
  const [pessoas, setPessoas] = useState([]);
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState('');

  useEffect(() => {
    api.get('/pessoas')
      .then((r) => setPessoas((r.data || []).filter((p) => p.ativo)))
      .catch(() => {});
  }, []);

  const meta = GATILHOS.find((g) => g.tipo === gatilho.tipo);

  function addAcao(tipo) {
    const base = { tipo };
    if (tipo === 'definir_prioridade') base.prioridade = 0;
    if (tipo === 'definir_prazo') base.dias = 3;
    if (tipo === 'criar_checklist') { base.titulo = 'Checklist'; base.itens = []; }
    if (tipo === 'criar_conta_pagar') { base.descricao = '{{titulo}}'; base.valor = 0; base.dias_vencimento = 30; }
    if (tipo === 'atribuir') base.pessoa_ids = [];
    setAcoes((a) => [...a, base]);
  }

  function setAcao(i, patch) {
    setAcoes((a) => a.map((x, j) => (j === i ? { ...x, ...patch } : x)));
  }

  async function salvar() {
    setErro('');
    if (!nome.trim()) { setErro('Dê um nome à automação.'); return; }
    if (acoes.length === 0) { setErro('Adicione pelo menos uma ação.'); return; }

    // Limpa campos vazios que o Zod recusaria (uuid vazio, por exemplo).
    const g = { tipo: gatilho.tipo };
    if (meta?.temColuna && gatilho.coluna_id) g.coluna_id = gatilho.coluna_id;
    if (meta?.temDias) g.dias = Number(gatilho.dias ?? 1);

    setSalvando(true);
    try {
      await api.post('/quadros/' + quadro.id + '/automacoes', {
        nome: nome.trim(),
        gatilho: g,
        condicoes,
        acoes,
      });
      onCriada();
    } catch (err) {
      setErro(mensagemDeErro(err, 'Não consegui criar a automação.'));
    } finally {
      setSalvando(false);
    }
  }

  return (
    <div className="space-y-3 rounded-lg border border-nexus-200 bg-nexus-50/40 p-3">
      <input
        autoFocus
        className={inputCls}
        value={nome}
        onChange={(e) => setNome(e.target.value)}
        placeholder="Nome da regra (ex.: Entrega gera conta a pagar)"
        maxLength={120}
      />

      {/* QUANDO */}
      <Bloco rotulo="Quando">
        <select
          className={inputCls}
          value={gatilho.tipo}
          onChange={(e) => setGatilho({ tipo: e.target.value, coluna_id: '', dias: 1 })}
        >
          {GATILHOS.map((g) => (<option key={g.tipo} value={g.tipo}>{g.label}</option>))}
        </select>

        {meta?.temColuna && (
          <select
            className={inputCls}
            value={gatilho.coluna_id || ''}
            onChange={(e) => setGatilho((g) => ({ ...g, coluna_id: e.target.value }))}
          >
            <option value="">qualquer coluna</option>
            {(quadro.colunas || []).map((c) => (
              <option key={c.id} value={c.id}>para “{c.nome}”</option>
            ))}
          </select>
        )}

        {meta?.temDias && (
          <input
            type="number"
            min={0}
            max={60}
            className={inputCls}
            value={gatilho.dias ?? 1}
            onChange={(e) => setGatilho((g) => ({ ...g, dias: Number(e.target.value) }))}
          />
        )}
      </Bloco>

      {/* SE */}
      <Bloco rotulo="Se (opcional)">
        {condicoes.map((c, i) => {
          const campo = CAMPOS.find((x) => x.v === c.campo);
          return (
            <div key={i} className="flex items-center gap-1">
              <select
                className={inputCls}
                value={c.campo}
                onChange={(e) => {
                  const novo = CAMPOS.find((x) => x.v === e.target.value);
                  setCondicoes((cs) => cs.map((x, j) => (j === i
                    ? { campo: e.target.value, op: novo?.bool ? 'verdadeiro' : '=', valor: novo?.bool ? null : '' }
                    : x)));
                }}
              >
                {CAMPOS.map((x) => (<option key={x.v} value={x.v}>{x.label}</option>))}
              </select>
              <select
                className={inputCls}
                value={c.op}
                onChange={(e) => setCondicoes((cs) => cs.map((x, j) => (j === i ? { ...x, op: e.target.value } : x)))}
              >
                {campo?.bool
                  ? <><option value="verdadeiro">é sim</option><option value="falso">é não</option></>
                  : campo?.num
                    ? <><option value="=">=</option><option value="<=">≤</option><option value=">=">≥</option></>
                    : <><option value="contem">contém</option><option value="nao_contem">não contém</option></>}
              </select>
              {!campo?.bool && (
                <input
                  className={inputCls}
                  value={c.valor ?? ''}
                  onChange={(e) => setCondicoes((cs) => cs.map((x, j) => (j === i
                    ? { ...x, valor: campo?.num ? Number(e.target.value) : e.target.value }
                    : x)))}
                  placeholder="valor"
                />
              )}
              <button
                type="button"
                onClick={() => setCondicoes((cs) => cs.filter((_, j) => j !== i))}
                className="rounded p-1 text-slate-400 hover:bg-slate-200 hover:text-red-600"
              >
                <X size={12} />
              </button>
            </div>
          );
        })}
        <button
          type="button"
          onClick={() => setCondicoes((cs) => [...cs, { campo: 'prioridade', op: '<=', valor: 1 }])}
          className="inline-flex items-center gap-1 rounded-md border border-dashed border-slate-300 bg-white px-2 py-1 text-xs text-slate-500 hover:text-nexus-700"
        >
          <Plus size={11} /> Condição
        </button>
      </Bloco>

      {/* ENTÃO */}
      <Bloco rotulo="Então">
        {acoes.map((a, i) => (
          <div key={i} className="flex items-center gap-1">
            <span className="shrink-0 text-xs text-slate-500">
              <ChevronRight size={12} className="inline" />
            </span>
            <span className="w-40 shrink-0 truncate text-xs font-medium text-slate-700">
              {ACOES.find((x) => x.tipo === a.tipo)?.label}
            </span>
            <EditorAcao
              acao={a}
              quadro={quadro}
              pessoas={pessoas}
              onChange={(patch) => setAcao(i, patch)}
            />
            <button
              type="button"
              onClick={() => setAcoes((as) => as.filter((_, j) => j !== i))}
              className="rounded p-1 text-slate-400 hover:bg-slate-200 hover:text-red-600"
            >
              <X size={12} />
            </button>
          </div>
        ))}
        <select
          className={inputCls}
          value=""
          onChange={(e) => { if (e.target.value) addAcao(e.target.value); }}
        >
          <option value="">+ adicionar ação…</option>
          {ACOES.map((a) => (<option key={a.tipo} value={a.tipo}>{a.label}</option>))}
        </select>
      </Bloco>

      {erro && <p className="text-xs text-red-600">{erro}</p>}

      <div className="flex justify-end gap-2">
        <button
          type="button"
          onClick={onCancelar}
          className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50"
        >
          Cancelar
        </button>
        <button
          type="button"
          onClick={salvar}
          disabled={salvando}
          className="rounded-lg bg-nexus-700 px-3 py-1.5 text-xs font-medium text-white hover:bg-nexus-800 disabled:opacity-50"
        >
          {salvando ? 'Salvando…' : 'Criar automação'}
        </button>
      </div>
    </div>
  );
}

function Bloco({ rotulo, children }) {
  return (
    <div className="rounded-lg border border-slate-200 bg-white p-2">
      <div className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-slate-400">
        {rotulo}
      </div>
      <div className="space-y-1">{children}</div>
    </div>
  );
}

/** Campos específicos de cada ação. */
function EditorAcao({ acao, quadro, pessoas, onChange }) {
  switch (acao.tipo) {
    case 'mover_coluna':
      return (
        <select
          className={inputCls}
          value={acao.coluna_id || ''}
          onChange={(e) => onChange({ coluna_id: e.target.value })}
        >
          <option value="">escolha…</option>
          {(quadro.colunas || []).map((c) => (<option key={c.id} value={c.id}>{c.nome}</option>))}
        </select>
      );

    case 'adicionar_etiqueta':
    case 'remover_etiqueta':
      return (
        <select
          className={inputCls}
          value={acao.etiqueta_id || ''}
          onChange={(e) => onChange({ etiqueta_id: e.target.value })}
        >
          <option value="">escolha…</option>
          {(quadro.etiquetas || []).map((e) => (<option key={e.id} value={e.id}>{e.nome}</option>))}
        </select>
      );

    case 'definir_prioridade':
      return (
        <select
          className={inputCls}
          value={acao.prioridade ?? 0}
          onChange={(e) => onChange({ prioridade: Number(e.target.value) })}
        >
          <option value={0}>P0 · Crítica</option>
          <option value={1}>P1 · Alta</option>
          <option value={2}>P2 · Normal</option>
          <option value={3}>P3 · Baixa</option>
        </select>
      );

    case 'definir_prazo':
      return (
        <input
          type="number"
          className={inputCls}
          value={acao.dias ?? 3}
          onChange={(e) => onChange({ dias: Number(e.target.value) })}
          placeholder="dias a partir de hoje"
        />
      );

    case 'atribuir':
      return (
        <select
          className={inputCls}
          value={(acao.pessoa_ids || [])[0] || ''}
          onChange={(e) => onChange({ pessoa_ids: e.target.value ? [e.target.value] : [] })}
        >
          <option value="">escolha…</option>
          {pessoas.map((p) => (<option key={p.id} value={p.id}>{p.nome}</option>))}
        </select>
      );

    case 'comentar':
      return (
        <input
          className={inputCls}
          value={acao.texto || ''}
          onChange={(e) => onChange({ texto: e.target.value })}
          placeholder="Texto (aceita {{titulo}}, {{prazo}})"
        />
      );

    case 'criar_checklist':
      return (
        <input
          className={inputCls}
          value={(acao.itens || []).join(', ')}
          onChange={(e) => onChange({
            itens: e.target.value.split(',').map((s) => s.trim()).filter(Boolean),
          })}
          placeholder="Itens separados por vírgula"
        />
      );

    case 'criar_conta_pagar':
      return (
        <div className="flex flex-1 gap-1">
          <input
            className={inputCls}
            value={acao.descricao || ''}
            onChange={(e) => onChange({ descricao: e.target.value })}
            placeholder="Descrição"
          />
          <input
            type="number"
            step="0.01"
            className={inputCls}
            value={acao.valor ?? 0}
            onChange={(e) => onChange({ valor: Number(e.target.value) })}
            placeholder="Valor"
          />
          <input
            type="number"
            className={inputCls}
            value={acao.dias_vencimento ?? 30}
            onChange={(e) => onChange({ dias_vencimento: Number(e.target.value) })}
            placeholder="Venc. (dias)"
          />
        </div>
      );

    default:
      return null;
  }
}
