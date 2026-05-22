import { useState } from 'react';
import { X } from 'lucide-react';
import { api, mensagemDeErro } from '../api/client.js';

/**
 * Modal de criar/editar cartório — Sprint 20.
 *
 * Reusado por:
 *   - pages/Cartorios.jsx (botão "Novo cartório")
 *   - pages/Cartorio.jsx (botão "Editar informações")
 *
 * Edita apenas os campos básicos. Responsáveis, vínculos com quadros e
 * histórico têm UIs dedicadas na página de detalhe.
 */

export const TIPOS_CARTORIO = [
  { valor: 'notas',               rotulo: 'Notas' },
  { valor: 'imoveis',             rotulo: 'Imóveis' },
  { valor: 'protesto',            rotulo: 'Protesto' },
  { valor: 'civil',               rotulo: 'Civil' },
  { valor: 'titulos_documentos',  rotulo: 'Títulos e Documentos' },
  { valor: 'outro',               rotulo: 'Outro' },
];

export const STATUS_CARTORIO = [
  { valor: 'ativo',           rotulo: 'Ativo',           cor: 'bg-emerald-100 text-emerald-800 border-emerald-200' },
  { valor: 'em_implantacao',  rotulo: 'Em implantação',  cor: 'bg-amber-100 text-amber-800 border-amber-200' },
  { valor: 'inativo',         rotulo: 'Inativo',         cor: 'bg-slate-100 text-slate-700 border-slate-200' },
];

const UFS = [
  'AC', 'AL', 'AM', 'AP', 'BA', 'CE', 'DF', 'ES', 'GO', 'MA', 'MG', 'MS',
  'MT', 'PA', 'PB', 'PE', 'PI', 'PR', 'RJ', 'RN', 'RO', 'RR', 'RS', 'SC',
  'SE', 'SP', 'TO',
];

const inputCls = 'w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm shadow-sm outline-none focus:border-nexus-500 focus:ring-2 focus:ring-nexus-200';

export default function ModalCartorio({ modo, cartorio, onFechar, onSalvo }) {
  const editando = modo === 'editar';

  const [nome, setNome] = useState(cartorio?.nome || '');
  const [tipo, setTipo] = useState(cartorio?.tipo || 'notas');
  const [cidade, setCidade] = useState(cartorio?.cidade || '');
  const [uf, setUf] = useState(cartorio?.uf || '');
  const [status, setStatus] = useState(cartorio?.status || 'em_implantacao');
  const [telefone, setTelefone] = useState(cartorio?.telefone || '');
  const [email, setEmail] = useState(cartorio?.email || '');
  const [especificidades, setEspecificidades] = useState(cartorio?.especificidades || '');

  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState('');

  async function submeter(e) {
    e.preventDefault();
    setErro('');
    setSalvando(true);
    try {
      const body = {
        nome: nome.trim(),
        tipo,
        cidade: cidade.trim() || null,
        uf: uf.trim().toUpperCase() || null,
        status,
        telefone: telefone.trim() || null,
        email: email.trim() || null,
        especificidades: especificidades.trim() || null,
      };
      let r;
      if (editando) {
        r = await api.put(`/cartorios/${cartorio.id}`, body);
      } else {
        r = await api.post('/cartorios', body);
      }
      onSalvo(r.data);
    } catch (err) {
      setErro(mensagemDeErro(err));
    } finally {
      setSalvando(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4">
      <div className="w-full max-w-xl rounded-xl bg-white shadow-xl">
        <header className="flex items-center justify-between border-b border-slate-200 px-5 py-3">
          <h2 className="text-base font-semibold text-slate-900">
            {editando ? `Editar: ${cartorio.nome}` : 'Novo cartório'}
          </h2>
          <button type="button" onClick={onFechar}
            className="rounded p-1 text-slate-400 hover:bg-slate-100">
            <X size={18} />
          </button>
        </header>

        <form onSubmit={submeter} className="p-5 space-y-3 max-h-[80vh] overflow-y-auto">
          <div>
            <label className="block text-sm font-medium text-slate-900 mb-1">
              Nome<span className="text-red-600">*</span>
            </label>
            <input
              className={inputCls}
              value={nome} onChange={(e) => setNome(e.target.value)}
              maxLength={255} required autoFocus
              placeholder="Ex: 1º Tabelionato de Notas de São Paulo"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-medium text-slate-900 mb-1">Tipo<span className="text-red-600">*</span></label>
              <select className={inputCls} value={tipo} onChange={(e) => setTipo(e.target.value)} required>
                {TIPOS_CARTORIO.map((t) => (<option key={t.valor} value={t.valor}>{t.rotulo}</option>))}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-900 mb-1">Status</label>
              <select className={inputCls} value={status} onChange={(e) => setStatus(e.target.value)}>
                {STATUS_CARTORIO.map((s) => (<option key={s.valor} value={s.valor}>{s.rotulo}</option>))}
              </select>
            </div>
          </div>

          <div className="grid grid-cols-3 gap-3">
            <div className="col-span-2">
              <label className="block text-sm font-medium text-slate-900 mb-1">Cidade</label>
              <input className={inputCls} value={cidade} onChange={(e) => setCidade(e.target.value)} maxLength={100} />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-900 mb-1">UF</label>
              <select className={inputCls} value={uf} onChange={(e) => setUf(e.target.value)}>
                <option value="">—</option>
                {UFS.map((u) => (<option key={u} value={u}>{u}</option>))}
              </select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-medium text-slate-900 mb-1">Telefone</label>
              <input className={inputCls} value={telefone} onChange={(e) => setTelefone(e.target.value)}
                maxLength={40} placeholder="(11) 0000-0000" />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-900 mb-1">Email</label>
              <input type="email" className={inputCls} value={email} onChange={(e) => setEmail(e.target.value)}
                maxLength={255} placeholder="contato@cartorio.com.br" />
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-900 mb-1">Especificidades</label>
            <textarea
              className={inputCls}
              rows={4}
              value={especificidades} onChange={(e) => setEspecificidades(e.target.value)}
              maxLength={10000}
              placeholder="Horário de funcionamento, peculiaridades operacionais, atendimento especial..."
            />
          </div>

          {erro && (
            <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{erro}</div>
          )}

          <div className="flex justify-end gap-2 pt-2 border-t border-slate-100">
            <button type="button" onClick={onFechar}
              className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50">
              Cancelar
            </button>
            <button type="submit" disabled={salvando}
              className="rounded-lg bg-nexus-700 px-4 py-2 text-sm font-medium text-white hover:bg-nexus-800 disabled:opacity-50">
              {salvando ? 'Salvando…' : (editando ? 'Salvar' : 'Criar cartório')}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
