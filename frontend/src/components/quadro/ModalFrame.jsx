import { X } from 'lucide-react';

/** Moldura padrão dos modais do quadro. */
export default function ModalFrame({ titulo, onFechar, children, largura = 'max-w-xl' }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto bg-slate-900/50 p-4">
      {/* O modal inteiro (cabeçalho + corpo) cabe na tela: com max-h só no
          corpo, em tela baixa o rodapé com os botões ficava fora do alcance.
          100dvh em vez de vh porque no celular a barra de endereço entra e
          sai da conta. */}
      <div className={'flex max-h-[calc(100dvh-2rem)] w-full flex-col rounded-xl bg-white shadow-xl ' + largura}>
        <header className="flex shrink-0 items-center justify-between border-b border-slate-200 px-5 py-3">
          <h2 className="text-base font-semibold text-slate-900">{titulo}</h2>
          <button
            type="button"
            onClick={onFechar}
            className="rounded p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-600"
          >
            <X size={18} />
          </button>
        </header>
        <div className="min-h-0 flex-1 overflow-y-auto p-5">{children}</div>
      </div>
    </div>
  );
}
