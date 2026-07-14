import { useEffect, useState } from 'react';
import { Play, Square, Plus, Trash2, Clock } from 'lucide-react';
import { api, mensagemDeErro } from '../../api/client.js';
import { formatarMinutos } from './ui.js';

/**
 * Sprint 34 — Apontamento de horas.
 *
 * Timer com start/stop (o backend garante 1 timer por pessoa — iniciar
 * um novo fecha o anterior) + lançamento manual.
 *
 * A barra compara realizado vs estimado. Passar da estimativa não é erro,
 * é informação: a barra fica âmbar e segue a vida.
 */
export default function CardTimer({ cardId, podeEditar, onMudou }) {
  const [dados, setDados] = useState(null);
  const [rodandoDesde, setRodandoDesde] = useState(null);
  const [agora, setAgora] = useState(Date.now());
  const [lancando, setLancando] = useState(false);
  const [minutos, setMinutos] = useState('');
  const [obs, setObs] = useState('');

  async function carregar() {
    try {
      const r = await api.get('/cards/' + cardId + '/apontamentos');
      setDados(r.data);
      const aberto = (r.data.apontamentos || []).find((a) => !a.fim);
      setRodandoDesde(aberto ? new Date(aberto.inicio).getTime() : null);
    } catch {
      setDados(null);
    }
  }

  useEffect(() => { carregar(); /* eslint-disable-next-line */ }, [cardId]);

  // Tick do cronômetro (só enquanto há timer aberto).
  useEffect(() => {
    if (!rodandoDesde) return undefined;
    const t = setInterval(() => setAgora(Date.now()), 1000);
    return () => clearInterval(t);
  }, [rodandoDesde]);

  async function iniciar() {
    try {
      await api.post('/cards/' + cardId + '/timer/iniciar');
      await carregar();
      onMudou?.();
    } catch (err) {
      alert(mensagemDeErro(err, 'Não consegui iniciar o timer.'));
    }
  }

  async function parar() {
    try {
      await api.post('/cards/' + cardId + '/timer/parar');
      await carregar();
      onMudou?.();
    } catch (err) {
      alert(mensagemDeErro(err));
    }
  }

  async function lancar(e) {
    e.preventDefault();
    const n = Number(minutos);
    if (!Number.isInteger(n) || n < 1) {
      alert('Informe os minutos (número inteiro maior que zero).');
      return;
    }
    try {
      await api.post('/cards/' + cardId + '/apontamentos', {
        minutos: n,
        observacao: obs.trim() || null,
      });
      setMinutos('');
      setObs('');
      setLancando(false);
      await carregar();
      onMudou?.();
    } catch (err) {
      alert(mensagemDeErro(err));
    }
  }

  async function excluir(id) {
    if (!confirm('Excluir este apontamento?')) return;
    try {
      await api.delete('/cards/' + cardId + '/apontamentos/' + id);
      await carregar();
      onMudou?.();
    } catch (err) {
      alert(mensagemDeErro(err));
    }
  }

  if (!dados) return <p className="text-xs text-slate-400">Carregando…</p>;

  const decorridos = rodandoDesde ? Math.floor((agora - rodandoDesde) / 60000) : 0;
  const totalMin = Number(dados.minutos_total || 0) + (rodandoDesde ? decorridos : 0);
  const estMin = dados.estimativa_horas ? Math.round(Number(dados.estimativa_horas) * 60) : null;
  const pct = estMin ? Math.min(100, Math.round((totalMin / estMin) * 100)) : 0;
  const estourou = estMin != null && totalMin > estMin;

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2">
        {podeEditar && (
          rodandoDesde ? (
            <button
              type="button"
              onClick={parar}
              className="inline-flex items-center gap-1 rounded-lg bg-red-600 px-2.5 py-1 text-xs font-medium text-white hover:bg-red-700"
            >
              <Square size={11} /> Parar
            </button>
          ) : (
            <button
              type="button"
              onClick={iniciar}
              className="inline-flex items-center gap-1 rounded-lg bg-emerald-600 px-2.5 py-1 text-xs font-medium text-white hover:bg-emerald-700"
            >
              <Play size={11} /> Iniciar
            </button>
          )
        )}

        <span className="inline-flex items-center gap-1 text-sm font-semibold tabular-nums text-slate-800">
          <Clock size={13} className={rodandoDesde ? 'text-emerald-600' : 'text-slate-400'} />
          {formatarMinutos(totalMin)}
        </span>
        {estMin != null && (
          <span className="text-xs text-slate-500">
            de {formatarMinutos(estMin)} estimados
          </span>
        )}
        {rodandoDesde && (
          <span className="rounded bg-emerald-50 px-1.5 py-0.5 text-[10px] font-medium text-emerald-700">
            rodando
          </span>
        )}
      </div>

      {estMin != null && (
        <div className="h-1.5 overflow-hidden rounded-full bg-slate-200">
          <div
            className={'h-full transition-all ' + (estourou ? 'bg-amber-500' : 'bg-nexus-600')}
            style={{ width: (estourou ? 100 : pct) + '%' }}
          />
        </div>
      )}

      {(dados.apontamentos || []).length > 0 && (
        <ul className="max-h-40 space-y-1 overflow-y-auto">
          {dados.apontamentos.map((a) => (
            <li key={a.id} className="flex items-center gap-2 text-xs text-slate-600">
              <span className="w-14 shrink-0 tabular-nums font-medium text-slate-800">
                {a.fim ? formatarMinutos(a.minutos) : '—'}
              </span>
              <span className="shrink-0 text-slate-400">
                {new Date(a.inicio).toLocaleDateString('pt-BR')}
              </span>
              <span className="truncate">{a.pessoa_nome}</span>
              {a.observacao && <span className="truncate text-slate-400">· {a.observacao}</span>}
              {podeEditar && (
                <button
                  type="button"
                  onClick={() => excluir(a.id)}
                  className="ml-auto shrink-0 rounded p-0.5 text-slate-300 hover:bg-slate-100 hover:text-red-600"
                >
                  <Trash2 size={11} />
                </button>
              )}
            </li>
          ))}
        </ul>
      )}

      {podeEditar && (
        lancando ? (
          <form onSubmit={lancar} className="flex flex-wrap items-center gap-1">
            <input
              autoFocus
              type="number"
              min={1}
              value={minutos}
              onChange={(e) => setMinutos(e.target.value)}
              placeholder="min"
              className="w-20 rounded-md border border-slate-300 px-2 py-1 text-xs outline-none focus:border-nexus-500"
            />
            <input
              value={obs}
              onChange={(e) => setObs(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Escape') setLancando(false); }}
              placeholder="O que foi feito? (opcional)"
              maxLength={500}
              className="flex-1 rounded-md border border-slate-300 px-2 py-1 text-xs outline-none focus:border-nexus-500"
            />
            <button type="submit" className="rounded-md bg-nexus-700 px-2.5 py-1 text-xs font-medium text-white hover:bg-nexus-800">
              Lançar
            </button>
            <button
              type="button"
              onClick={() => setLancando(false)}
              className="rounded-md border border-slate-300 bg-white px-2 py-1 text-xs text-slate-600 hover:bg-slate-50"
            >
              Cancelar
            </button>
          </form>
        ) : (
          <button
            type="button"
            onClick={() => setLancando(true)}
            className="inline-flex items-center gap-1 rounded-md border border-dashed border-slate-300 bg-white px-2 py-1 text-xs text-slate-500 hover:border-nexus-300 hover:text-nexus-700"
          >
            <Plus size={11} /> Lançar horas manualmente
          </button>
        )
      )}
    </div>
  );
}
