import { useEffect, useMemo, useState } from 'react';
import {
  ChevronLeft, ChevronRight, Plus, Trash2, MapPin, Link2, Repeat, AlertCircle,
} from 'lucide-react';
import { api, mensagemDeErro } from '../api/client.js';
import { useAuth } from '../context/AuthContext.jsx';
import CalendarioMensal from '../components/CalendarioMensal.jsx';
import { ModalBase, Campo, inputCls } from '../components/GovernancaUI.jsx';

/**
 * Página do Calendário societário — Sprint 6 + recorrência da Sprint 8.
 *
 * Grid mensal estilo Google Calendar.
 *
 * Click numa célula vazia (do mês atual) → modal de criar evento com a data preenchida.
 * Click num evento → modal de detalhes/editar.
 *
 * Eventos recorrentes (mensal/trimestral/semestral/anual) são expandidos
 * pelo backend dentro da janela do mês. Cada ocorrência aparece como um
 * "card" no dia correspondente, com ícone de repetição. Editar uma
 * ocorrência edita a série toda.
 *
 * Admin pode criar, editar e excluir. Não-admin só visualiza.
 */

const NOMES_MES = [
  'Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho',
  'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro',
];

const ROTULO_TIPO = {
  reuniao:               'Reunião',
  vencimento_legal:      'Vencimento legal',
  pagamento_importante:  'Pagamento importante',
  outro:                 'Outro',
};

const ROTULO_RECORRENCIA = {
  mensal:     'Mensalmente',
  trimestral: 'A cada 3 meses',
  semestral:  'A cada 6 meses',
  anual:      'Anualmente',
};

export default function CalendarioGov() {
  const { pessoa } = useAuth();
  const admin = !!pessoa?.administrador;

  const hoje = new Date();
  const [ano, setAno] = useState(hoje.getFullYear());
  const [mes, setMes] = useState(hoje.getMonth() + 1); // 1-12

  const [eventos, setEventos] = useState([]);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState('');

  // Modal: { modo: 'criar' | 'editar', evento, dataInicial }
  const [modal, setModal] = useState(null);

  const { inicioISO, fimISO } = useMemo(() => {
    const ini = new Date(ano, mes - 1, 1);
    const fim = new Date(ano, mes, 0);
    return {
      inicioISO: formatarYMD(ini),
      fimISO: formatarYMD(fim),
    };
  }, [ano, mes]);

  async function carregar() {
    setCarregando(true);
    setErro('');
    try {
      const r = await api.get('/governanca/eventos', { params: { inicio: inicioISO, fim: fimISO } });
      setEventos(r.data);
    } catch (err) {
      setErro(mensagemDeErro(err, 'Não foi possível carregar o calendário.'));
    } finally {
      setCarregando(false);
    }
  }

  useEffect(() => { carregar(); /* eslint-disable-next-line */ }, [ano, mes]);

  function mesAnterior() {
    if (mes === 1) { setAno(ano - 1); setMes(12); } else setMes(mes - 1);
  }
  function proximoMes() {
    if (mes === 12) { setAno(ano + 1); setMes(1); } else setMes(mes + 1);
  }
  function irParaHoje() {
    setAno(hoje.getFullYear());
    setMes(hoje.getMonth() + 1);
  }

  function aoClicarDia(iso) {
    if (!admin) return;
    setModal({ modo: 'criar', dataInicial: iso });
  }
  function aoClicarEvento(e) {
    setModal({ modo: 'editar', evento: e });
  }

  /**
   * Sprint 9 — drag & drop. Move o evento (ou série inteira, se recorrente)
   * para uma nova data preservando hora/minuto. Recorrente pede confirmação.
   *
   * @param {object} evento O evento (pode ser uma ocorrência expandida)
   * @param {string} novaDataYMD Data alvo no formato YYYY-MM-DD
   */
  async function aoMoverEvento(evento, novaDataYMD) {
    if (!admin) return;

    // Se for ocorrência expandida, preciso pegar a data_inicio MESTRE pra
    // calcular o offset correto. A ocorrência clicada tem `data_inicio` no
    // dia da ocorrência, mas a do banco é a data original.
    let dadosMestre = evento;
    if (evento.eh_ocorrencia) {
      try {
        const r = await api.get(`/governanca/eventos/${evento.id}`);
        dadosMestre = r.data;
      } catch (err) {
        setErro(mensagemDeErro(err, 'Não consegui carregar os dados originais.'));
        return;
      }
    }

    // Confirmação se for recorrente — a ação vai mudar TODA a série.
    if (dadosMestre.recorrencia_tipo) {
      const ok = window.confirm(
        'Este evento se repete. Mover vai mudar a data inicial de TODA a série ' +
        '(todas as ocorrências futuras também mudam). Continuar?'
      );
      if (!ok) return;
    }

    // Calcula a nova data_inicio preservando hora/min/seg do mestre.
    const inicioOriginal = new Date(dadosMestre.data_inicio);
    const [yyyy, mm, dd] = novaDataYMD.split('-').map(Number);
    const novoInicio = new Date(inicioOriginal);
    novoInicio.setFullYear(yyyy, mm - 1, dd);

    // Mantém a duração original (data_fim - data_inicio).
    let novoFim = null;
    if (dadosMestre.data_fim) {
      const fimOriginal = new Date(dadosMestre.data_fim);
      const duracaoMs = fimOriginal - inicioOriginal;
      novoFim = new Date(novoInicio.getTime() + duracaoMs);
    }

    try {
      await api.put(`/governanca/eventos/${evento.id}`, {
        data_inicio: novoInicio.toISOString(),
        data_fim: novoFim ? novoFim.toISOString() : null,
      });
      carregar();
    } catch (err) {
      setErro(mensagemDeErro(err, 'Não consegui mover o evento.'));
    }
  }

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={mesAnterior}
            className="rounded-lg border border-slate-300 bg-white p-2 text-slate-600 hover:bg-slate-50"
            title="Mês anterior"
          ><ChevronLeft size={16} /></button>

          <button
            type="button"
            onClick={irParaHoje}
            className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs font-medium text-slate-700 hover:bg-slate-50"
          >Hoje</button>

          <button
            type="button"
            onClick={proximoMes}
            className="rounded-lg border border-slate-300 bg-white p-2 text-slate-600 hover:bg-slate-50"
            title="Próximo mês"
          ><ChevronRight size={16} /></button>

          <h2 className="ml-2 text-lg font-semibold text-slate-900 capitalize">
            {NOMES_MES[mes - 1]} de {ano}
          </h2>
        </div>

        {admin && (
          <button
            type="button"
            onClick={() => setModal({ modo: 'criar' })}
            className="inline-flex items-center gap-2 rounded-lg bg-nexus-700 px-3 py-1.5 text-sm font-medium text-white hover:bg-nexus-800"
          >
            <Plus size={14} /> Novo evento
          </button>
        )}
      </div>

      {erro && (
        <div className="mb-4 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
          {erro}
        </div>
      )}

      {carregando && <div className="mb-2 text-xs text-slate-500">Carregando eventos...</div>}

      <CalendarioMensal
        ano={ano}
        mes={mes}
        eventos={eventos}
        aoClicarDia={admin ? aoClicarDia : undefined}
        aoClicarEvento={aoClicarEvento}
        aoMoverEvento={admin ? aoMoverEvento : undefined}
      />

      {/* Legenda */}
      <div className="mt-3 flex flex-wrap items-center gap-3 text-xs text-slate-500">
        <Legenda cor="bg-sky-500"   texto="Reunião" />
        <Legenda cor="bg-red-500"   texto="Vencimento legal" />
        <Legenda cor="bg-amber-500" texto="Pagamento importante" />
        <Legenda cor="bg-slate-400" texto="Outro" />
        <span className="inline-flex items-center gap-1.5 ml-2">
          <Repeat size={11} className="text-slate-400" /> recorrente
        </span>
      </div>

      {modal && (
        <ModalEvento
          modo={modal.modo}
          evento={modal.evento}
          dataInicial={modal.dataInicial}
          admin={admin}
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

function formatarYMD(d) {
  const ano = d.getFullYear();
  const mes = String(d.getMonth() + 1).padStart(2, '0');
  const dia = String(d.getDate()).padStart(2, '0');
  return `${ano}-${mes}-${dia}`;
}

/**
 * Modal de criar/editar evento.
 *
 * Quando estiver editando uma OCORRÊNCIA expandida (eh_ocorrencia=true), faz
 * fetch do evento-mãe pra carregar `data_inicio` original — assim o usuário
 * vê os dados-mestre da série, e qualquer edição afeta toda a série.
 */
function ModalEvento({ modo, evento, dataInicial, admin, onFechar, onSalvo }) {
  const [titulo, setTitulo] = useState(evento?.titulo || '');
  const [descricao, setDescricao] = useState(evento?.descricao || '');
  const [tipo, setTipo] = useState(evento?.tipo || 'outro');
  const [dataInicio, setDataInicio] = useState(() => {
    if (evento?.data_inicio) return formatarParaInput(evento.data_inicio);
    if (dataInicial) return `${dataInicial}T09:00`;
    return formatarParaInput(new Date());
  });
  const [dataFim, setDataFim] = useState(evento?.data_fim ? formatarParaInput(evento.data_fim) : '');
  const [diaInteiro, setDiaInteiro] = useState(!!evento?.dia_inteiro);
  const [local, setLocal] = useState(evento?.local || '');
  const [link, setLink] = useState(evento?.link || '');
  const [observacao, setObservacao] = useState(evento?.observacao || '');
  const [recorrenciaTipo, setRecorrenciaTipo] = useState(evento?.recorrencia_tipo || '');
  const [recorrenciaAte, setRecorrenciaAte] = useState(
    evento?.recorrencia_ate ? String(evento.recorrencia_ate).slice(0, 10) : '',
  );

  // Carregando dados-mestre quando editando uma ocorrência
  const [carregandoMestre, setCarregandoMestre] = useState(false);
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState('');

  const ehRecorrente = !!recorrenciaTipo;
  const visualizando = modo === 'editar' && !admin;

  // Quando editamos uma ocorrência expandida, busca o evento-mãe pra mostrar
  // a `data_inicio` original (não a da ocorrência clicada). Isso evita
  // confusão do tipo "movi pra outro dia e mexeu em todas as ocorrências
  // sem eu perceber".
  useEffect(() => {
    if (modo === 'editar' && evento?.eh_ocorrencia && evento?.id) {
      setCarregandoMestre(true);
      api.get(`/governanca/eventos/${evento.id}`)
        .then((r) => {
          const m = r.data;
          setTitulo(m.titulo || '');
          setDescricao(m.descricao || '');
          setTipo(m.tipo || 'outro');
          setDataInicio(formatarParaInput(m.data_inicio));
          setDataFim(m.data_fim ? formatarParaInput(m.data_fim) : '');
          setDiaInteiro(!!m.dia_inteiro);
          setLocal(m.local || '');
          setLink(m.link || '');
          setObservacao(m.observacao || '');
          setRecorrenciaTipo(m.recorrencia_tipo || '');
          setRecorrenciaAte(m.recorrencia_ate ? String(m.recorrencia_ate).slice(0, 10) : '');
        })
        .catch((err) => {
          setErro(mensagemDeErro(err, 'Não consegui carregar os dados originais do evento.'));
        })
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
        await api.post('/governanca/eventos', body);
      } else {
        await api.put(`/governanca/eventos/${evento.id}`, body);
      }
      onSalvo();
    } catch (err) {
      setErro(mensagemDeErro(err, 'Não foi possível salvar.'));
    } finally {
      setSalvando(false);
    }
  }

  async function excluir() {
    const confirma = ehRecorrente
      ? 'Excluir TODA a série de eventos recorrentes? Não dá pra desfazer.'
      : 'Excluir este evento?';
    if (!confirm(confirma)) return;
    setSalvando(true);
    try {
      await api.delete(`/governanca/eventos/${evento.id}`);
      onSalvo();
    } catch (err) {
      setErro(mensagemDeErro(err, 'Não foi possível excluir.'));
      setSalvando(false);
    }
  }

  // Visualização (não-admin)
  if (visualizando) {
    return (
      <ModalBase titulo={evento.titulo} onFechar={onFechar}>
        <div className="space-y-3 text-sm">
          <div className="flex items-center gap-2">
            <span className="rounded bg-slate-100 px-1.5 py-0.5 text-[10px] font-medium uppercase text-slate-600">
              {ROTULO_TIPO[evento.tipo]}
            </span>
            {evento.recorrencia_tipo && (
              <span className="inline-flex items-center gap-1 rounded bg-nexus-100 px-1.5 py-0.5 text-[10px] font-medium text-nexus-800">
                <Repeat size={10} />
                {ROTULO_RECORRENCIA[evento.recorrencia_tipo]}
              </span>
            )}
          </div>
          <div className="text-slate-700">
            <strong>{formatarDataHora(evento.data_inicio, evento.dia_inteiro)}</strong>
            {evento.data_fim && <> até {formatarDataHora(evento.data_fim, evento.dia_inteiro)}</>}
          </div>
          {evento.recorrencia_tipo && evento.recorrencia_ate && (
            <div className="text-xs text-slate-500">
              Repete até {formatarDataHora(evento.recorrencia_ate, true)}
            </div>
          )}
          {evento.descricao && (
            <div className="rounded-lg bg-slate-50 p-3 whitespace-pre-wrap">{evento.descricao}</div>
          )}
          {evento.local && (
            <div className="flex items-center gap-2 text-slate-600">
              <MapPin size={14} /> {evento.local}
            </div>
          )}
          {evento.link && (
            <a href={evento.link} target="_blank" rel="noreferrer" className="flex items-center gap-2 text-nexus-700 hover:underline">
              <Link2 size={14} /> {evento.link}
            </a>
          )}
          {evento.observacao && (
            <div className="text-xs text-slate-500 italic">{evento.observacao}</div>
          )}
        </div>
      </ModalBase>
    );
  }

  return (
    <ModalBase titulo={modo === 'criar' ? 'Novo evento' : 'Editar evento'} onFechar={onFechar}>
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
            Qualquer alteração afeta <strong>todas as ocorrências</strong> da série
            (passadas e futuras). Não há suporte a editar uma ocorrência isolada.
          </div>
        </div>
      )}

      <form onSubmit={submeter}>
        <Campo rotulo="Título" obrigatorio>
          <input className={inputCls} value={titulo} onChange={(e) => setTitulo(e.target.value)} maxLength={255} required
            placeholder="Ex: Reunião de sócios — outubro" />
        </Campo>

        <Campo rotulo="Tipo">
          <select className={inputCls} value={tipo} onChange={(e) => setTipo(e.target.value)}>
            <option value="reuniao">Reunião</option>
            <option value="vencimento_legal">Vencimento legal</option>
            <option value="pagamento_importante">Pagamento importante</option>
            <option value="outro">Outro</option>
          </select>
        </Campo>

        <Campo rotulo="">
          <label className="inline-flex items-center gap-2 text-sm text-slate-700">
            <input
              type="checkbox"
              checked={diaInteiro}
              onChange={(e) => setDiaInteiro(e.target.checked)}
            />
            Dia inteiro (sem horário específico)
          </label>
        </Campo>

        <div className="grid grid-cols-2 gap-3">
          <Campo rotulo="Início" obrigatorio>
            <input
              className={inputCls}
              type={diaInteiro ? 'date' : 'datetime-local'}
              value={diaInteiro ? dataInicio.slice(0, 10) : dataInicio}
              onChange={(e) => setDataInicio(diaInteiro ? `${e.target.value}T00:00` : e.target.value)}
              required
            />
          </Campo>
          <Campo rotulo="Fim (opcional)">
            <input
              className={inputCls}
              type={diaInteiro ? 'date' : 'datetime-local'}
              value={dataFim ? (diaInteiro ? dataFim.slice(0, 10) : dataFim) : ''}
              onChange={(e) => setDataFim(e.target.value ? (diaInteiro ? `${e.target.value}T23:59` : e.target.value) : '')}
            />
          </Campo>
        </div>

        {/* Recorrência (Sprint 8) */}
        <div className="mt-1 rounded-lg border border-slate-200 bg-slate-50/60 p-3">
          <div className="mb-2 flex items-center gap-2 text-xs font-medium text-slate-700">
            <Repeat size={12} /> Recorrência
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Campo rotulo="Repetir">
              <select
                className={inputCls}
                value={recorrenciaTipo}
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
            </Campo>
            <Campo rotulo="Repetir até (opcional)" hint={!recorrenciaTipo ? 'Escolha um tipo de repetição.' : 'Em branco = repete por 2 anos.'}>
              <input
                className={inputCls}
                type="date"
                value={recorrenciaAte}
                disabled={!recorrenciaTipo}
                onChange={(e) => setRecorrenciaAte(e.target.value)}
              />
            </Campo>
          </div>
        </div>

        <Campo rotulo="Local (opcional)">
          <input className={inputCls} value={local} onChange={(e) => setLocal(e.target.value)} maxLength={255}
            placeholder="Ex: Escritório central, sala 3" />
        </Campo>

        <Campo rotulo="Link (opcional)" hint="Ex: link do Google Meet, pauta no Notion">
          <input className={inputCls} type="url" value={link} onChange={(e) => setLink(e.target.value)} maxLength={2048}
            placeholder="https://..." />
        </Campo>

        <Campo rotulo="Descrição (opcional)">
          <textarea className={inputCls} rows={3} value={descricao} onChange={(e) => setDescricao(e.target.value)} maxLength={5000} />
        </Campo>

        <Campo rotulo="Observação interna (opcional)">
          <textarea className={inputCls} rows={2} value={observacao} onChange={(e) => setObservacao(e.target.value)} maxLength={2000} />
        </Campo>

        {erro && <div className="mb-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{erro}</div>}

        <div className="flex items-center justify-between gap-2 mt-4">
          {modo === 'editar' ? (
            <button
              type="button"
              onClick={excluir}
              disabled={salvando}
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
            >{salvando ? 'Salvando...' : modo === 'criar' ? 'Criar evento' : 'Salvar'}</button>
          </div>
        </div>
      </form>
    </ModalBase>
  );
}

function formatarParaInput(d) {
  const dt = typeof d === 'string' ? new Date(d) : d;
  const ano = dt.getFullYear();
  const mes = String(dt.getMonth() + 1).padStart(2, '0');
  const dia = String(dt.getDate()).padStart(2, '0');
  const hora = String(dt.getHours()).padStart(2, '0');
  const min = String(dt.getMinutes()).padStart(2, '0');
  return `${ano}-${mes}-${dia}T${hora}:${min}`;
}

function formatarDataHora(dataIso, diaInteiro) {
  if (!dataIso) return '';
  const d = new Date(dataIso);
  if (diaInteiro) return d.toLocaleDateString('pt-BR');
  return d.toLocaleString('pt-BR', {
    day: '2-digit', month: '2-digit', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  });
}
