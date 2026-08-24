import { useEffect, useState } from 'react';
import {
  ArrowRight, ChevronRight, Clock, Download, History, Loader2,
} from 'lucide-react';
import { api, mensagemDeErro } from '../../api/client.js';
import { iniciais } from './ui.js';

/**
 * Histórico do card.
 *
 * Mostra a linha do tempo completa: quando aconteceu, quem fez e — para as
 * movimentações — de qual coluna para qual coluna o card foi.
 *
 * Duas fontes chegam já unificadas de /cards/:id/historico:
 *   - `origem: 'movimento'` vem de cards_movimentos, com os nomes das colunas
 *     resolvidos e quanto tempo o card ficou parado na origem;
 *   - `origem: 'acao'` vem do log de auditoria (criou, editou, comentou,
 *     anexou, arquivou).
 *
 * Cada linha expande para o registro cru — útil para auditar de verdade.
 */

const FILTROS = [
  { id: 'tudo', nome: 'Tudo' },
  { id: 'movimentos', nome: 'Movimentações' },
  { id: 'acoes', nome: 'Outras ações' },
];

/** Data e hora por extenso — o histórico existe para ser preciso. */
function dataHora(iso) {
  if (!iso) return '';
  return new Date(iso).toLocaleString('pt-BR', {
    day: '2-digit', month: '2-digit', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  });
}

function tempoRelativo(iso) {
  if (!iso) return '';
  const seg = Math.round((Date.now() - new Date(iso).getTime()) / 1000);
  if (seg < 60) return 'agora';
  const min = Math.round(seg / 60);
  if (min < 60) return `há ${min}min`;
  const h = Math.round(min / 60);
  if (h < 24) return `há ${h}h`;
  const dias = Math.round(h / 24);
  if (dias < 30) return `há ${dias}d`;
  const meses = Math.round(dias / 30);
  return `há ${meses} ${meses === 1 ? 'mês' : 'meses'}`;
}

/** Minutos -> "3d 4h" / "2h30" / "45min". Duração de permanência é em dias. */
function duracao(min) {
  const m = Number(min || 0);
  if (m <= 0) return null;
  if (m < 60) return `${m}min`;
  const h = Math.floor(m / 60);
  if (h < 24) return m % 60 === 0 ? `${h}h` : `${h}h${String(m % 60).padStart(2, '0')}`;
  const d = Math.floor(h / 24);
  return h % 24 === 0 ? `${d}d` : `${d}d ${h % 24}h`;
}

const ROTULO_ACAO = {
  'card.criou': 'criou este card',
  'card.arquivou': 'arquivou o card',
  'card.comentou': 'comentou',
  'card.anexo.criou': 'anexou um arquivo',
  'card.anexo.excluiu': 'removeu um anexo',
  'card.checklist.criou': 'adicionou um checklist',
  'card.checklist.excluiu': 'removeu um checklist',
};

function descreverAcao(item) {
  const d = item.detalhes || {};
  if (item.acao === 'card.editou') {
    const campos = Array.isArray(d.campos)
      ? d.campos.filter((c) => c !== 'etiqueta_ids' && c !== 'responsavel_ids')
      : [];
    return campos.length > 0 ? `editou ${campos.join(', ')}` : 'editou o card';
  }
  if (item.acao === 'card.anexo.criou' && d.nome) return `anexou "${d.nome}"`;
  if (item.acao === 'card.anexo.excluiu' && d.nome) return `removeu o anexo "${d.nome}"`;
  if (item.acao === 'card.checklist.criou' && d.titulo) return `adicionou o checklist "${d.titulo}"`;
  if (item.acao === 'card.moveu_quadro') {
    return `moveu para outro quadro${d.para_coluna ? ` (coluna "${d.para_coluna}")` : ''}`;
  }
  return ROTULO_ACAO[item.acao] || item.acao;
}

function baixarCsv(itens, cardId) {
  const cabecalho = ['Data e hora', 'Quem', 'Evento', 'De', 'Para', 'Tempo na origem'];
  const escapa = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`;
  const linhas = itens.map((i) => [
    dataHora(i.quando),
    i.pessoa_nome || '',
    i.origem === 'movimento' ? 'Movimentação' : descreverAcao(i),
    i.origem === 'movimento' ? (i.de_coluna_nome || 'criação do card') : '',
    i.origem === 'movimento' ? (i.para_coluna_nome || '') : '',
    i.origem === 'movimento' ? (duracao(i.minutos_na_origem) || '') : '',
  ].map(escapa).join(','));

  // BOM para o Excel abrir os acentos direito.
  const blob = new Blob(['﻿' + [cabecalho.map(escapa).join(','), ...linhas].join('\n')], {
    type: 'text/csv;charset=utf-8',
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `historico-card-${cardId.slice(0, 8)}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

export default function CardHistorico({ cardId }) {
  const [dados, setDados] = useState(null);
  const [filtro, setFiltro] = useState('tudo');
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState('');
  const [aberto, setAberto] = useState(() => new Set());

  useEffect(() => {
    let vivo = true;
    setCarregando(true);
    setErro('');
    const qs = filtro === 'tudo' ? '' : `?tipo=${filtro}`;
    api.get(`/cards/${cardId}/historico${qs}`)
      .then((r) => { if (vivo) setDados(r.data); })
      .catch((err) => { if (vivo) setErro(mensagemDeErro(err, 'Não consegui carregar o histórico.')); })
      .finally(() => { if (vivo) setCarregando(false); });
    return () => { vivo = false; };
  }, [cardId, filtro]);

  function alternar(id) {
    setAberto((atual) => {
      const novo = new Set(atual);
      if (novo.has(id)) novo.delete(id); else novo.add(id);
      return novo;
    });
  }

  const itens = dados?.itens || [];

  return (
    <div className="space-y-3">
      {/* Onde o card está agora e há quanto tempo */}
      {dados?.coluna_atual && (
        <div className="flex items-center gap-2 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-600">
          <Clock size={13} className="shrink-0 text-slate-400" />
          <span>
            Está em <strong className="text-slate-900">{dados.coluna_atual}</strong>
            {dados.coluna_desde && <> desde {dataHora(dados.coluna_desde)} ({tempoRelativo(dados.coluna_desde)})</>}
          </span>
        </div>
      )}

      <div className="flex flex-wrap items-center gap-1">
        {FILTROS.map((f) => (
          <button
            key={f.id}
            type="button"
            onClick={() => setFiltro(f.id)}
            className={[
              'rounded-lg px-2.5 py-1 text-xs font-medium transition-colors',
              filtro === f.id ? 'bg-nexus-700 text-white' : 'text-slate-600 hover:bg-slate-100',
            ].join(' ')}
          >
            {f.nome}
          </button>
        ))}
        <button
          type="button"
          onClick={() => baixarCsv(itens, cardId)}
          disabled={itens.length === 0}
          className="ml-auto inline-flex items-center gap-1 rounded-lg border border-slate-300 bg-white px-2.5 py-1 text-xs font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-40"
          title="Baixar este histórico em CSV"
        >
          <Download size={12} /> CSV
        </button>
      </div>

      {carregando && (
        <div className="flex items-center gap-2 py-6 text-xs text-slate-400">
          <Loader2 size={14} className="animate-spin" /> Carregando histórico…
        </div>
      )}

      {erro && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">{erro}</div>
      )}

      {!carregando && !erro && itens.length === 0 && (
        <div className="py-6 text-center text-xs text-slate-400">
          <History size={20} className="mx-auto mb-1.5 text-slate-300" />
          Nada registrado ainda para este filtro.
        </div>
      )}

      {!carregando && itens.length > 0 && (
        <ol className="space-y-0">
          {itens.map((i) => {
            const expandido = aberto.has(i.id);
            const tempo = i.origem === 'movimento' ? duracao(i.minutos_na_origem) : null;
            return (
              <li key={i.id} className="border-b border-slate-100 last:border-b-0">
                <button
                  type="button"
                  onClick={() => alternar(i.id)}
                  className="flex w-full items-start gap-2 py-2 text-left hover:bg-slate-50"
                >
                  <ChevronRight
                    size={13}
                    className={'mt-1 shrink-0 text-slate-300 transition-transform ' + (expandido ? 'rotate-90' : '')}
                  />
                  <span
                    className="mt-0.5 inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-slate-200 text-[9px] font-semibold text-slate-600"
                    title={i.pessoa_nome || 'Automação'}
                  >
                    {i.pessoa_nome ? iniciais(i.pessoa_nome) : '⚙'}
                  </span>

                  <span className="min-w-0 flex-1 text-xs leading-snug text-slate-600">
                    <span className="font-medium text-slate-900">
                      {i.pessoa_nome || 'Automação'}
                    </span>{' '}

                    {i.origem === 'movimento' ? (
                      i.de_coluna_nome ? (
                        <>
                          moveu de{' '}
                          <span className="inline-flex items-center gap-1 whitespace-nowrap rounded bg-slate-100 px-1.5 py-0.5 font-medium text-slate-800">
                            {i.de_coluna_nome}
                          </span>
                          <ArrowRight size={10} className="mx-1 inline text-slate-400" />
                          <span className="inline-flex items-center gap-1 whitespace-nowrap rounded bg-slate-900 px-1.5 py-0.5 font-medium text-white">
                            {i.para_coluna_nome}
                          </span>
                          {tempo && (
                            <span className="ml-1.5 whitespace-nowrap text-[10px] text-slate-400">
                              · ficou {tempo} em {i.de_coluna_nome}
                            </span>
                          )}
                        </>
                      ) : (
                        <>
                          criou o card em{' '}
                          <span className="whitespace-nowrap rounded bg-slate-900 px-1.5 py-0.5 font-medium text-white">
                            {i.para_coluna_nome}
                          </span>
                        </>
                      )
                    ) : descreverAcao(i)}

                    <span className="ml-1.5 whitespace-nowrap text-[10px] text-slate-400">
                      · {dataHora(i.quando)}
                    </span>
                  </span>
                </button>

                {expandido && (
                  <dl className="mb-2 ml-[3.1rem] grid grid-cols-[auto_1fr] gap-x-3 gap-y-0.5 rounded-lg bg-slate-50 px-3 py-2 text-[11px]">
                    <dt className="text-slate-400">Quando</dt>
                    <dd className="text-slate-700">{dataHora(i.quando)} ({tempoRelativo(i.quando)})</dd>

                    <dt className="text-slate-400">Quem</dt>
                    <dd className="text-slate-700">{i.pessoa_nome || 'Automação do quadro'}</dd>

                    {i.origem === 'movimento' && (
                      <>
                        <dt className="text-slate-400">De</dt>
                        <dd className="text-slate-700">{i.de_coluna_nome || '— (criação do card)'}</dd>
                        <dt className="text-slate-400">Para</dt>
                        <dd className="text-slate-700">{i.para_coluna_nome}</dd>
                        {tempo && (
                          <>
                            <dt className="text-slate-400">Tempo na origem</dt>
                            <dd className="text-slate-700">{tempo}</dd>
                          </>
                        )}
                      </>
                    )}

                    {i.origem === 'acao' && (
                      <>
                        <dt className="text-slate-400">Evento</dt>
                        <dd className="font-mono text-slate-700">{i.acao}</dd>
                        {i.ip && (<><dt className="text-slate-400">IP</dt><dd className="font-mono text-slate-700">{i.ip}</dd></>)}
                        {i.detalhes && Object.keys(i.detalhes).length > 1 && (
                          <>
                            <dt className="text-slate-400">Detalhes</dt>
                            <dd className="overflow-x-auto">
                              <pre className="whitespace-pre-wrap break-all font-mono text-[10px] text-slate-600">
                                {JSON.stringify(i.detalhes, null, 1)}
                              </pre>
                            </dd>
                          </>
                        )}
                      </>
                    )}
                  </dl>
                )}
              </li>
            );
          })}
        </ol>
      )}

      {dados?.truncado && (
        <p className="text-[10px] text-slate-400">
          Mostrando os {itens.length} eventos mais recentes.
        </p>
      )}

      <p className="border-t border-slate-100 pt-2 text-[10px] leading-relaxed text-slate-400">
        O registro de movimentação entre colunas começou a ser guardado a partir da Sprint 37.
        Cards movidos antes disso podem ter histórico incompleto — o que aparece aqui é o que
        foi efetivamente registrado.
      </p>
    </div>
  );
}
