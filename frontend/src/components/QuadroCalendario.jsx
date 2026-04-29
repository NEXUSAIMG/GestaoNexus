import { useEffect, useMemo, useState } from 'react';
import {
  ChevronLeft, ChevronRight, Plus, Trash2, MapPin, Link2, Repeat, AlertCircle, X,
} from 'lucide-react';
import { api, mensagemDeErro } from '../api/client.js';
import CalendarioMensal from './CalendarioMensal.jsx';

/**
 * Visão de calendário do quadro — Sprint 11.
 *
 * Componente isolado que substitui a view do board quando o usuário
 * clica em "Calendário" nas abas do topo. Reaproveita CalendarioMensal.
 *
 * Mostra:
 *   - Eventos avulsos do quadro (tipo='reuniao'|'deadline'|'marco'|'outro')
 *   - Cards do quadro com data_prazo (tipo='card', fonte='card')
 *
 * Cards são read-only no calendário: click leva ao modal do card no
 * kanban (callback `aoClicarCard`). Eventos podem ser criados, editados
 * e excluídos pela própria aba.
 */

const NOMES_MES = [
  'Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho',
  'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro',
];

const ROTULO_TIPO = {
  reuniao:  'Reunião',
  deadline: 'Deadline',
  marco:    'Marco',
  outro:    'Outro',
};

const ROTULO_RECORRENCIA = {
  mensal:     'Mensalmente',
  trimestral: 'A cada 3 meses',
  semestral:  'A cada 6 meses',
  anual:      'Anualmente',
};

function ymd(d) {
  const ano = d.getFullYear();
  const mes = String(d.getMonth() + 1).padStart(2, '0');
  const dia = String(d.getDate()).padStart(2, '0');
  return `${ano}-${mes}-${dia}`;
}

export default function QuadroCalendario({ quadro, podeEditar, aoClicarCard }) {
  const hoje = new Date();
  const [ano, setAno] = useState(hoje.getFullYear());
  const [mes, setMes] = useState(hoje.getMonth() + 1);

  const [eventos, setEventos] = useState([]);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState('');

  const [modal, setModal] = useState(null); // { modo: 'criar'|'editar', evento?, dataInicial? }

  const { inicioISO, fimISO } = useMemo(() => {
    const ini = new Date(ano, mes - 1, 1);
    const fim = new Date(ano, mes, 0);
    return { inicioISO: ymd(ini), fimISO: ymd(fim) };
  }, [ano, mes]);

  async function carregar() {
    setCarregando(true);
    setErro('');
    try {
      const r = await api.get(`/quadros/${quadro.id}/eventos`, {
        params: { inicio: inicioISO, fim: fimISO },
      });
      setEventos(r.data);
    } catch (err) {
      setErro(mensagemDeErro(err, 'Não consegui carregar o calendário.'));
    } finally {
      setCarregando(false);
    }
  }

  useEffect(() => { carregar(); /* eslint-disable-next-line */ }, [ano, mes, quadro.id]);

  function mesAnterior() { if (mes === 1) { setAno(ano - 1); setMes(12); } else setMes(mes - 1); }
  function proximoMes() { if (mes === 12) { setAno(ano + 1); setMes(1); } else setMes(mes + 1); }
  function irHoje() { setAno(hoje.getFullYear()); setMes(hoje.getMonth() + 1); }

  function aoClicarDia(iso) {
    if (!podeEditar) return;
    setModal({ modo: 'criar', dataInicial: iso });
  }

  function aoClicarEvento(e) {
    // Card: delega pro pai abrir o modal do kanban
    if (e.fonte === 'card' && aoClicarCard) {
      aoClicarCard(e.card_id);
      return;
    }
    // Evento normal: abre modal de edição
    setModal({ modo: 'editar', evento: e });
  }

  return (
    <div className="p-4">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <button type="button" onClick={mesAnterior}
            className="rounded-lg border border-slate-300 bg-white p-2 text-slate-600 hover:bg-slate-50"
            title="Mês anterior"
          ><ChevronLeft size={16} /></button>

          <button type="button" onClick={irHoje}
            className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs font-medium text-slate-700 hover:bg-slate-50"
          >Hoje</button>

          <button type="button" onClick={proximoMes}
            className="rounded-lg border border-slate-300 bg-white p-2 text-slate-600 hover:bg-slate-50"
            title="Próximo mês"
          ><ChevronRight size={16} /></button>

          <h2 className="ml-2 text-lg font-semibold text-slate-900 capitalize">
            {NOMES_MES[mes - 1]} de {ano}
          </h2>
        </div>

        {podeEditar && (
          <button type="button" onClick={() => setModal({ modo: 'criar' })}
            className="inline-flex items-center gap-2 rounded-lg bg-nexus-700 px-3 py-1.5 text-sm font-medium text-white hover:bg-nexus-800"
          >
            <Plus size={14} /> Novo evento
          </button>
        )}
      </div>

      {erro && (
        <div className="mb-4 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{erro}</div>
      )}

      {carregando && <div className="mb-2 text-xs text-slate-500">Carregando eventos...</div>}

      <CalendarioMensal
        ano={ano}
        mes={mes}
        eventos={eventos}
        aoClicarDia={podeEditar ? aoClicarDia : undefined}
        aoClicarEvento={aoClicarEvento}
      />

      <div className="mt-3 flex flex-wrap items-center gap-3 text-xs text-slate-500">
        <Legenda cor="bg-sky-500"     texto="Reunião" />
        <Legenda cor="bg-red-500"     texto="Deadline" />
        <Legenda cor="bg-violet-500"  texto="Marco" />
        <Legenda cor="bg-emerald-500" texto="Card com prazo" />
        <Legenda cor="bg-slate-400"   texto="Outro" />
        <span className="inline-flex items-center gap-1.5 ml-2">
          <Repeat size={11} className="text-slate-400" /> recorrente
        </span>
      </div>

      {modal && (
        <ModalEvento
          quadroId={quadro.id}
          modo={modal.modo}
          evento={modal.evento}
          dataInicial={modal.dataInicial}
          podeEditar={podeEditar}
          onFechar={() => setModal(null)}
          onSalvo={() => { setModal(null); carregar(); }}
        />
      )}
    </div>
  );
}

function Legenda({ cor, texto }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <span className={`h-2 w-2 rounded-full ${cor}`} />
      {texto}
    </span>
  );
}

// =============================================================================
// Modal de criar/editar evento
// =============================================================================

function ModalEvento({ quadroId, modo, evento, dataInicial, podeEditar, onFechar, onSalvo }) {
  const [titulo, setTitulo] = useState(evento?.titulo || '');
  const [descricao, setDescricao] = useState(evento?.descricao || '');
  const [tipo, setTipo] = useState(evento?.tipo || 'outro');
  const [dataInicio, setDataInicio] = useState(() => {
    if (evento?.data_inicio) return paraInputDateTime(evento.data_inicio);
    if (dataInicial) return `${dataInicial}T09:00`;
    return paraInputDateTime(new Date());
  });
  const [dataFim, setDataFim] = useState(evento?.data_fim ? paraInputDateTime(evento.data_fim) : '');
  const [diaInteiro, setDiaInteiro] = useState(!!evento?.dia_inteiro);
  const [local, setLocal] = useState(evento?.local || '');
  const [link, setLink] = useState(evento?.link || '');
  const [observacao, setObservacao] = useState(evento?.observacao || '');
  const [recorrenciaTipo, setRecorrenciaTipo] = useState(evento?.recorrencia_tipo || '');
  const [recorrenciaAte, setRecorrenciaAte] = useState(
    evento?.recorrencia_ate ? String(evento.recorrencia_ate).slice(0, 10) : '',
  );

  const [carregandoMestre, setCarregandoMestre] = useState(false);
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState('');

  const ehRecorrente = !!recorrenciaTipo;
  const visualizando = modo === 'editar' && !podeEditar;

  // Quando edita uma OCORRÊNCIA expandida, busca o evento-mestre
  useEffect(() => {
    if (modo === 'editar' && evento?.eh_ocorrencia && evento?.id) {
      setCarregandoMestre(true);
      api.get(`/quadros/${quadroId}/eventos/${evento.id}`)
        .then((r) => {
          const m = r.data;
          setTitulo(m.titulo || '');
          setDescricao(m.descricao || '');
          setTipo(m.tipo || 'outro');
          setDataInicio(paraInputDateTime(m.data_inicio));
          setDataFim(m.data_fim ? paraInputDateTime(m.data_fim) : '');
          setDiaInteiro(!!m.dia_inteiro);
          setLocal(m.local || '');
          setLink(m.link || '');
          setObservacao(m.observacao || '');
          setRecorrenciaTipo(m.recorrencia_tipo || '');
          setRecorrenciaAte(m.recorrencia_ate ? String(m.recorrencia_ate).slice(0, 10) : '');
        })
        .catch((err) => setErro(mensagemDeErro(err, 'Não consegui carregar os dados originais.')))
        .finally(() => setCarregandoMestre(false));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function submeter(e) {
    e.preventDefault();
    setErro('');
    setSalvando(true);
    try {
      const body = {
        titulo,
        descricao: descricao || null,
        tipo,
        data_inicio: new Date(dataInicio).toISOString(),
        data_fim: dataFim ? new Date(dataFim).toISOString() : null,
        dia_inteiro: diaInteiro,
        local: local || null,
        link: link || null,
        observacao: observacao || null,
        recorrencia_tipo: recorrenciaTipo || null,
        recorrencia_ate: recorrenciaTipo && recorrenciaAte ? recorrenciaAte : null,
      };
      if (modo === 'criar') {
        await api.post(`/quadros/${quadroId}/eventos`, body);
      } else {
        await api.put(`/quadros/${quadroId}/eventos/${evento.id}`, body);
      }
      onSalvo();
    } catch (err) {
      setErro(mensagemDeErro(err, 'Não consegui salvar.'));
    } finally {
      setSalvando(false);
    }
  }

  async function excluir() {
    const msg = ehRecorrente
      ? 'Excluir TODA a série de eventos recorrentes? Não dá pra desfazer.'
      : 'Excluir este evento?';
    if (!confirm(msg)) return;
    setSalvando(true);
    try {
      await api.delete(`/quadros/${quadroId}/eventos/${evento.id}`);
      onSalvo();
    } catch (err) {
      setErro(mensagemDeErro(err, 'Não consegui excluir.'));
      setSalvando(false);
    }
  }

  if (visualizando) {
    return (
      <ModalFrame titulo={evento.titulo} onFechar={onFechar}>
        <div className="space-y-3 text-sm">
          <div className="flex items-center gap-2">
            <span className="rounded bg-slate-100 px-1.5 py-0.5 text-[10px] font-medium uppercase text-slate-600">
              {ROTULO_TIPO[evento.tipo] ?? evento.tipo}
            </span>
            {evento.recorrencia_tipo && (
              <span className="inline-flex items-center gap-1 rounded bg-nexus-100 px-1.5 py-0.5 text-[10px] font-medium text-nexus-800">
                <Repeat size={10} />
                {ROTULO_RECORRENCIA[evento.recorrencia_tipo]}
              </span>
            )}
          </div>
          <div className="text-slate-700">
            <strong>{formatarBR(evento.data_inicio, evento.dia_inteiro)}</strong>
            {evento.data_fim && <> até {formatarBR(evento.data_fim, evento.dia_inteiro)}</>}
          </div>
          {evento.descricao && (
            <div className="rounded-lg bg-slate-50 p-3 whitespace-pre-wrap">{evento.descricao}</div>
          )}
          {evento.local && <div className="flex items-center gap-2 text-slate-600"><MapPin size={14} /> {evento.local}</div>}
          {evento.link && (
            <a href={evento.link} target="_blank" rel="noreferrer" className="flex items-center gap-2 text-nexus-700 hover:underline">
              <Link2 size={14} /> {evento.link}
            </a>
          )}
        </div>
      </ModalFrame>
    );
  }

  return (
    <ModalFrame titulo={modo === 'criar' ? 'Novo evento' : 'Editar evento'} onFechar={onFechar}>
      {carregandoMestre && (
        <div className="mb-3 rounded-lg bg-slate-50 p-2 text-xs text-slate-500">
          Carregando dados originais…
        </div>
      )}

      {modo === 'editar' && ehRecorrente && (
        <div className="mb-3 flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs text-amber-800">
          <AlertCircle size={14} className="mt-0.5 shrink-0" />
          <div>
            Este evento se repete <strong>{ROTULO_RECORRENCIA[recorrenciaTipo]?.toLowerCase()}</strong>.
            Qualquer alteração afeta <strong>todas as ocorrências</strong>.
          </div>
        </div>
      )}

      <form onSubmit={submeter} className="space-y-3">
        <div>
          <label className="block text-sm font-medium text-slate-900 mb-1">Título<span className="text-red-600">*</span></label>
          <input className={inputCls} value={titulo} onChange={(e) => setTitulo(e.target.value)}
            maxLength={255} required autoFocus
            placeholder="Ex: Reunião semanal de status" />
        </div>

        <div>
          <label className="block text-sm font-medium text-slate-900 mb-1">Tipo</label>
          <select className={inputCls} value={tipo} onChange={(e) => setTipo(e.target.value)}>
            <option value="reuniao">Reunião</option>
            <option value="deadline">Deadline</option>
            <option value="marco">Marco</option>
            <option value="outro">Outro</option>
          </select>
        </div>

        <label className="inline-flex items-center gap-2 text-sm text-slate-700">
          <input type="checkbox" checked={diaInteiro} onChange={(e) => setDiaInteiro(e.target.checked)} />
          Dia inteiro (sem horário específico)
        </label>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-sm font-medium text-slate-900 mb-1">Início<span className="text-red-600">*</span></label>
            <input className={inputCls}
              type={diaInteiro ? 'date' : 'datetime-local'}
              value={diaInteiro ? dataInicio.slice(0, 10) : dataInicio}
              onChange={(e) => setDataInicio(diaInteiro ? `${e.target.value}T00:00` : e.target.value)}
              required />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-900 mb-1">Fim (opcional)</label>
            <input className={inputCls}
              type={diaInteiro ? 'date' : 'datetime-local'}
              value={dataFim ? (diaInteiro ? dataFim.slice(0, 10) : dataFim) : ''}
              onChange={(e) => setDataFim(e.target.value ? (diaInteiro ? `${e.target.value}T23:59` : e.target.value) : '')}
            />
          </div>
        </div>

        <div className="rounded-lg border border-slate-200 bg-slate-50/60 p-3">
          <div className="mb-2 flex items-center gap-2 text-xs font-medium text-slate-700">
            <Repeat size={12} /> Recorrência
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">Repetir</label>
              <select className={inputCls} value={recorrenciaTipo}
                onChange={(e) => {
                  setRecorrenciaTipo(e.target.value);
                  if (!e.target.value) setRecorrenciaAte('');
                }}
              >
                <option value="">Não se repete</option>
                <option value="mensal">Mensalmente</option>
                <option value="trimestral">A cada 3 meses</option>
                <option value="semestral">A cada 6 meses</option>
                <option value="anual">Anualmente</option>
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">
                Repetir até (opcional)
              </label>
              <input className={inputCls} type="date" value={recorrenciaAte}
                disabled={!recorrenciaTipo}
                onChange={(e) => setRecorrenciaAte(e.target.value)} />
              {!recorrenciaTipo && (
                <p className="mt-1 text-[11px] text-slate-500">Escolha um tipo de repetição.</p>
              )}
              {recorrenciaTipo && !recorrenciaAte && (
                <p className="mt-1 text-[11px] text-slate-500">Em branco = repete por 2 anos.</p>
              )}
            </div>
          </div>
        </div>

        <div>
          <label className="block text-sm font-medium text-slate-900 mb-1">Local (opcional)</label>
          <input className={inputCls} value={local} onChange={(e) => setLocal(e.target.value)}
            maxLength={255} placeholder="Ex: Sala de reuniões" />
        </div>

        <div>
          <label className="block text-sm font-medium text-slate-900 mb-1">Link (opcional)</label>
          <input className={inputCls} type="url" value={link} onChange={(e) => setLink(e.target.value)}
            maxLength={2048} placeholder="https://meet.google.com/..." />
        </div>

        <div>
          <label className="block text-sm font-medium text-slate-900 mb-1">Descrição (opcional)</label>
          <textarea className={inputCls} rows={3} value={descricao} onChange={(e) => setDescricao(e.target.value)} maxLength={5000} />
        </div>

        {erro && (
          <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{erro}</div>
        )}

        <div className="flex items-center justify-between gap-2 pt-2">
          {modo === 'editar' ? (
            <button type="button" onClick={excluir} disabled={salvando}
              className="inline-flex items-center gap-1 rounded-lg border border-red-200 bg-white px-3 py-2 text-sm font-medium text-red-700 hover:bg-red-50 disabled:opacity-50"
            >
              <Trash2 size={14} /> {ehRecorrente ? 'Excluir série' : 'Excluir'}
            </button>
          ) : <span />}

          <div className="flex items-center gap-2">
            <button type="button" onClick={onFechar}
              className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
            >Cancelar</button>
            <button type="submit" disabled={salvando}
              className="rounded-lg bg-nexus-700 px-4 py-2 text-sm font-medium text-white hover:bg-nexus-800 disabled:opacity-50"
            >{salvando ? 'Salvando…' : modo === 'criar' ? 'Criar evento' : 'Salvar'}</button>
          </div>
        </div>
      </form>
    </ModalFrame>
  );
}

// =============================================================================
// Helpers
// =============================================================================

const inputCls = 'w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm shadow-sm outline-none focus:border-nexus-500 focus:ring-2 focus:ring-nexus-200';

function paraInputDateTime(d) {
  const dt = typeof d === 'string' ? new Date(d) : d;
  const ano = dt.getFullYear();
  const mes = String(dt.getMonth() + 1).padStart(2, '0');
  const dia = String(dt.getDate()).padStart(2, '0');
  const hora = String(dt.getHours()).padStart(2, '0');
  const min = String(dt.getMinutes()).padStart(2, '0');
  return `${ano}-${mes}-${dia}T${hora}:${min}`;
}

function formatarBR(iso, diaInteiro) {
  if (!iso) return '';
  const d = new Date(iso);
  if (diaInteiro) return d.toLocaleDateString('pt-BR');
  return d.toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}

function ModalFrame({ titulo, onFechar, children }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4">
      <div className="w-full max-w-xl rounded-xl bg-white shadow-xl">
        <header className="flex items-center justify-between border-b border-slate-200 px-5 py-3">
          <h2 className="text-base font-semibold text-slate-900">{titulo}</h2>
          <button type="button" onClick={onFechar}
            className="rounded p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-600">
            <X size={18} />
          </button>
        </header>
        <div className="p-5 max-h-[80vh] overflow-y-auto">{children}</div>
      </div>
    </div>
  );
}
