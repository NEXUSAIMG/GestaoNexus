import { useState } from 'react';
import { Outlet, useNavigate } from 'react-router-dom';
import { Menu, X, LogOut, Shield } from 'lucide-react';
import Sidebar from './Sidebar.jsx';
import SeletorDeContexto from './SeletorDeContexto.jsx';
import Sino from './Sino.jsx';
import ModalTarefasLogin from './ModalTarefasLogin.jsx';
import { useAuth } from '../context/AuthContext.jsx';

export default function Layout() {
  const { pessoa, sair } = useAuth();
  const navigate = useNavigate();
  const [abertoMobile, setAbertoMobile] = useState(false);

  function sairClicado() {
    sair();
    navigate('/login', { replace: true });
  }

  const iniciais = (pessoa?.nome || '?')
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase())
    .join('');

  return (
    <div className="min-h-screen flex bg-slate-50">
      {/* Modal de boas-vindas: avisa sobre tarefas pendentes ao logar */}
      <ModalTarefasLogin />

      {/* Overlay escuro no mobile quando o menu está aberto */}
      {abertoMobile && (
        <button
          type="button"
          onClick={() => setAbertoMobile(false)}
          className="fixed inset-0 z-30 bg-slate-900/50 lg:hidden"
          aria-label="Fechar menu"
        />
      )}

      {/* Menu lateral */}
      <aside
        className={[
          'fixed inset-y-0 left-0 z-40 w-64 bg-nexus-950 text-white flex flex-col',
          'transform transition-transform lg:static lg:translate-x-0',
          abertoMobile ? 'translate-x-0' : '-translate-x-full',
        ].join(' ')}
      >
        <div className="flex items-center justify-between px-5 py-4 border-b border-nexus-800">
          <div>
            <div className="text-lg font-semibold leading-tight">Gestão Nexus</div>
            <div className="text-xs text-nexus-200">Transparência para os sócios</div>
          </div>
          <button
            type="button"
            onClick={() => setAbertoMobile(false)}
            className="lg:hidden text-nexus-200 hover:text-white"
            aria-label="Fechar menu"
          >
            <X size={20} />
          </button>
        </div>

        {/* Seletor de contexto do sócio */}
        <div className="px-3 py-3 border-b border-nexus-800">
          <SeletorDeContexto />
        </div>

        <div className="flex-1 overflow-y-auto">
          <Sidebar aoClicar={() => setAbertoMobile(false)} />
        </div>

        <div className="border-t border-nexus-800 p-3">
          <div className="flex items-center gap-3 px-2 py-2">
            <div className="h-9 w-9 rounded-full bg-nexus-700 text-white flex items-center justify-center text-sm font-semibold">
              {iniciais}
            </div>
            <div className="min-w-0 flex-1">
              <div className="truncate text-sm font-medium">{pessoa?.nome}</div>
              <div className="truncate text-xs text-nexus-200 flex items-center gap-1">
                {pessoa?.administrador && <Shield size={11} />}
                {pessoa?.administrador ? 'Administrador' : 'Pessoa de acesso'}
              </div>
            </div>
            <Sino />
          </div>
          <button
            type="button"
            onClick={sairClicado}
            className="mt-1 flex w-full items-center gap-2 rounded-lg px-3 py-2 text-sm text-nexus-100 hover:bg-nexus-800/60 hover:text-white"
          >
            <LogOut size={16} />
            Sair
          </button>
        </div>
      </aside>

      {/* Conteúdo */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Barra superior só no mobile */}
        <header className="sticky top-0 z-20 flex items-center gap-3 border-b border-slate-200 bg-white px-4 py-3 lg:hidden">
          <button
            type="button"
            onClick={() => setAbertoMobile(true)}
            className="rounded-md p-2 text-slate-600 hover:bg-slate-100"
            aria-label="Abrir menu"
          >
            <Menu size={20} />
          </button>
          <div className="flex-1 font-semibold text-slate-800">Gestão Nexus</div>
          {/* Sino do mobile fica fora do menu, sempre visível. */}
          <div className="text-slate-700">
            <Sino />
          </div>
        </header>

        <main className="flex-1 p-4 md:p-8">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
