import { useState } from 'react';
import {
  AlertTriangle, CheckCircle2, FileSpreadsheet, Loader2,
} from 'lucide-react';
import { Link } from 'react-router-dom';
import { api, mensagemDeErro } from '../../api/client.js';

/**
 * Importação de backlog por planilha (CSV).
 *
 * A prévia é obrigatória: importar para um quadro que já está em uso é a
 * operação com mais chance de sujar dado. Ver antes o que vai entrar, o que
 * vai ser pulado e qual coluna da planilha não casa com o quadro é o que
 * separa "importei errado" de "cancelei a tempo".
 *
 * O parser mora no backend (utils/csv.js) e é o mesmo do importador de linha
 * de comando, já usado em importação real.
 */

const inputCls = 'w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm outline-none focus:border-nexus-500';

export default function ImportarCsv({ equipes, quadros, onFechar, onImportado }) {
  const [destino, setDestino] = useState('novo'); // 'novo' | 'existente'
  const [equipeId, setEquipeId] = useState(equipes[0]?.id || '');
  const [quadroId, setQuadroId] = useState(quadros[0]?.id || '');
  const [nome, setNome] = useState('');
  const [colunaId, setColunaId] = useState('');
  const [arquivo, setArquivo] = useState(null);
  const [previa, setPrevia] = useState(null);
  const [carregandoPrevia, setCarregandoPrevia] = useState(false);
  const [enviando, setEnviando] = useState(false);
  const [erro, setErro] = useState('');
  const [resultado, setResultado] = useState(null);

  function camposDestino() {
    const fd = new FormData();
    if (destino === 'existente') fd.append('quadro_id', quadroId);
    else fd.append('equipe_id', equipeId);
    return fd;
  }

  async function pedirPrevia(f = arquivo) {
    if (!f) return;
    setCarregandoPrevia(true);
    setErro('');
    setPrevia(null);
    try {
      const fd = camposDestino();
      fd.append('arquivo', f);
      const r = await api.post('/quadros/importar-csv/previa', fd, {
        headers: { 'Content-Type': 'multipart/form-data' },
        timeout: 120_000,
      });
      setPrevia(r.data);
      setColunaId('');
    } catch (err) {
      setErro(mensagemDeErro(err, 'Não consegui ler a planilha.'));
    } finally {
      setCarregandoPrevia(false);
    }
  }

  function aoEscolher(e) {
    const f = e.target.files?.[0];
    if (!f) return;
    setArquivo(f);
    if (!nome) setNome(f.name.replace(/\.(csv|tsv|txt)$/i, '').slice(0, 100));
    pedirPrevia(f);
  }

  async function importar() {
    if (!arquivo || !previa) return;
    setEnviando(true);
    setErro('');
    try {
      const fd = camposDestino();
      fd.append('arquivo', arquivo);
      if (destino === 'novo') fd.append('nome', nome || 'Importado de planilha');
      if (colunaId) fd.append('coluna_id', colunaId);
      const r = await api.post('/quadros/importar-csv', fd, {
        headers: { 'Content-Type': 'multipart/form-data' },
        timeout: 10 * 60 * 1000,
      });
      setResultado(r.data);
    } catch (err) {
      setErro(mensagemDeErro(err, 'Falha ao importar.'));
    } finally {
      setEnviando(false);
    }
  }

  if (resultado) {
    return (
      <div className="space-y-3 text-center">
        <CheckCircle2 size={36} className="mx-auto text-emerald-500" />
        <p className="text-sm text-slate-700">
          <strong>{resultado.cards_criados}</strong> card(s) criado(s)
          {resultado.cards_pulados > 0 && <>, {resultado.cards_pulados} pulado(s) por já existirem</>}
          {resultado.etiquetas_criadas > 0 && <>, {resultado.etiquetas_criadas} etiqueta(s) nova(s)</>}
          {resultado.responsaveis > 0 && <>, {resultado.responsaveis} responsável(is) atribuído(s)</>}.
        </p>
        <div className="flex justify-center gap-2">
          <Link
            to={'/tarefas/' + resultado.quadro_id}
            className="rounded-lg bg-nexus-700 px-4 py-2 text-sm font-medium text-white hover:bg-nexus-800"
          >
            Abrir quadro
          </Link>
          <button
            type="button"
            onClick={onImportado}
            className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
          >
            Fechar
          </button>
        </div>
      </div>
    );
  }

  const colunasDoDestino = previa?.destino?.colunas || [];

  return (
    <div className="space-y-4">
      <p className="text-xs text-slate-500">
        Uma linha por card. A planilha precisa de uma coluna <strong>Título</strong>; as demais são
        opcionais: Descrição, Prioridade, Tipo, Etiquetas, Estimativa_h, Coluna, Responsável, Prazo.
        Separador <code>,</code> ou <code>;</code> — detectamos sozinho.
      </p>

      <div>
        <span className="mb-1 block text-sm font-medium text-slate-900">Destino</span>
        <div className="inline-flex rounded-lg border border-slate-300 bg-white p-0.5">
          {[['novo', 'Criar quadro novo'], ['existente', 'Quadro existente']].map(([id, rotulo]) => (
            <button
              key={id}
              type="button"
              onClick={() => { setDestino(id); setPrevia(null); }}
              className={[
                'rounded-md px-2.5 py-1 text-xs font-medium transition-colors',
                destino === id ? 'bg-nexus-700 text-white' : 'text-slate-600 hover:bg-slate-50',
              ].join(' ')}
            >
              {rotulo}
            </button>
          ))}
        </div>
      </div>

      {destino === 'novo' ? (
        <>
          <div>
            <label className="mb-1 block text-sm font-medium text-slate-900">Equipe</label>
            <select className={inputCls} value={equipeId} onChange={(e) => { setEquipeId(e.target.value); setPrevia(null); }}>
              {equipes.map((e) => (<option key={e.id} value={e.id}>{e.nome}</option>))}
            </select>
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-slate-900">Nome do quadro</label>
            <input className={inputCls} value={nome} onChange={(e) => setNome(e.target.value)} maxLength={100} />
          </div>
        </>
      ) : (
        <div>
          <label className="mb-1 block text-sm font-medium text-slate-900">Quadro de destino</label>
          <select className={inputCls} value={quadroId} onChange={(e) => { setQuadroId(e.target.value); setPrevia(null); }}>
            {quadros.map((q) => (<option key={q.id} value={q.id}>{q.nome}</option>))}
          </select>
          <p className="mt-1 text-[11px] text-amber-700">
            Os cards entram num quadro em uso. Confira a prévia antes de confirmar.
          </p>
        </div>
      )}

      <div>
        <label className="mb-1 block text-sm font-medium text-slate-900">Arquivo CSV</label>
        <input
          type="file"
          accept=".csv,.tsv,.txt,text/csv"
          onChange={aoEscolher}
          className="w-full text-xs text-slate-600 file:mr-2 file:rounded-lg file:border-0 file:bg-nexus-50 file:px-3 file:py-1.5 file:text-nexus-800 hover:file:bg-nexus-100"
        />
      </div>

      {carregandoPrevia && (
        <div className="flex items-center gap-2 text-xs text-slate-400">
          <Loader2 size={13} className="animate-spin" /> Lendo a planilha…
        </div>
      )}

      {previa && (
        <div className="space-y-2 rounded-lg border border-slate-200 bg-slate-50 p-3">
          <div className="text-xs font-semibold text-slate-800">
            {previa.cards_validos} card(s) serão criados
            {previa.ja_existem.length > 0 && (
              <span className="font-normal text-slate-500">
                {' · '}{previa.ja_existem.length} já existe(m) e será(ão) pulado(s)
              </span>
            )}
          </div>

          {previa.linhas_sem_titulo > 0 && (
            <div className="text-[11px] text-slate-500">
              {previa.linhas_sem_titulo} linha(s) sem título serão ignoradas.
            </div>
          )}

          <div className="text-[11px] text-slate-500">
            Colunas reconhecidas:{' '}
            {previa.colunas_reconhecidas.map((c) => c.coluna_do_arquivo).join(', ') || '—'}
          </div>
          {previa.colunas_ignoradas.length > 0 && (
            <div className="text-[11px] text-slate-400">
              Ignoradas: {previa.colunas_ignoradas.join(', ')}
            </div>
          )}

          {previa.colunas_nao_casadas.length > 0 && (
            <div className="flex items-start gap-1.5 rounded border border-amber-200 bg-amber-50 px-2 py-1.5 text-[11px] text-amber-800">
              <AlertTriangle size={12} className="mt-0.5 shrink-0" />
              <span>
                Estas colunas da planilha não existem no quadro e cairão na coluna padrão:{' '}
                <strong>{previa.colunas_nao_casadas.join(', ')}</strong>
              </span>
            </div>
          )}

          {colunasDoDestino.length > 0 && (
            <div>
              <label className="mb-1 block text-[11px] font-medium text-slate-600">
                Coluna padrão (para linhas sem coluna ou com coluna desconhecida)
              </label>
              <select className={inputCls} value={colunaId} onChange={(e) => setColunaId(e.target.value)}>
                <option value="">Automática (a primeira do tipo backlog)</option>
                {colunasDoDestino.map((c) => (<option key={c.id} value={c.id}>{c.nome}</option>))}
              </select>
            </div>
          )}

          {previa.amostra.length > 0 && (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[26rem] text-[11px]">
                <thead>
                  <tr className="text-left text-slate-400">
                    <th className="py-1 pr-2 font-medium">Título</th>
                    <th className="py-1 pr-2 font-medium">Coluna</th>
                    <th className="py-1 pr-2 font-medium">Prio</th>
                    <th className="py-1 font-medium">Etiquetas</th>
                  </tr>
                </thead>
                <tbody>
                  {previa.amostra.map((a, i) => (
                    <tr key={i} className="border-t border-slate-200 text-slate-600">
                      <td className="py-1 pr-2">{a.titulo}</td>
                      <td className="py-1 pr-2">{a.coluna || '—'}</td>
                      <td className="py-1 pr-2">{['Urgente', 'Alta', 'Média', 'Baixa'][a.prioridade]}</td>
                      <td className="py-1">{a.etiquetas.join(', ') || '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {previa.cards_validos > previa.amostra.length && (
                <div className="pt-1 text-[10px] text-slate-400">
                  … e mais {previa.cards_validos - previa.amostra.length} linha(s).
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {erro && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">{erro}</div>
      )}

      <div className="flex justify-end gap-2">
        <button
          type="button"
          onClick={onFechar}
          className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
        >
          Cancelar
        </button>
        <button
          type="button"
          onClick={importar}
          disabled={!previa || previa.cards_validos === 0 || enviando}
          className="inline-flex items-center gap-1 rounded-lg bg-nexus-700 px-4 py-2 text-sm font-medium text-white hover:bg-nexus-800 disabled:opacity-50"
        >
          {enviando ? <Loader2 size={13} className="animate-spin" /> : <FileSpreadsheet size={13} />}
          {enviando ? 'Importando…' : 'Importar'}
        </button>
      </div>
    </div>
  );
}
