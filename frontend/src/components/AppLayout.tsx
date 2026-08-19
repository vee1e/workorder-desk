import { useState } from 'react';
import { NavLink, Outlet, useNavigate } from 'react-router-dom';
import { useLogout, useMe } from '../hooks/useAuth';
import type { Role } from '@workorders/shared';
import { cn } from '../lib/utils';
import { CopilotPanel } from '../features/copilot/CopilotPanel';

function Mark() {
  return (
    <span aria-hidden className="flex h-7 w-7 items-center justify-center rounded-md hazard-bar">
      <span className="block h-1.5 w-1.5 rounded-[2px] bg-ink-950" />
    </span>
  );
}

const navItems = (role: Role) => [
  { to: '/app/work-orders', label: 'Work Orders', end: true, always: true },
  { to: '/app/work-orders/new', label: 'New Ticket', end: false, always: role !== 'viewer' },
  { to: '/app/profile', label: 'Profile', end: false, always: true },
  { to: '/app/admin', label: 'Team', end: true, always: role === 'admin' },
  { to: '/app/admin/work-orders', label: 'All Tickets', end: false, always: role === 'admin' },
  { to: '/app/admin/agents', label: 'Agents', end: false, always: role === 'admin' },
  { to: '/app/admin/agents/runs', label: 'Agent Runs', end: false, always: role === 'admin' },
];

export function AppLayout() {
  const { data: user } = useMe();
  const logout = useLogout();
  const navigate = useNavigate();
  const [copilotOpen, setCopilotOpen] = useState(false);
  const items = navItems(user?.role ?? 'user').filter((i) => i.always);

  async function handleLogout() {
    await logout.mutateAsync();
    navigate('/login');
  }

  const linkClass = ({ isActive }: { isActive: boolean }) =>
    cn(
      'flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors',
      isActive ? 'bg-ink-800 text-hi-300' : 'text-steel-300 hover:bg-ink-800 hover:text-ice',
    );

  return (
    <div className="flex min-h-screen flex-col bg-ink-950 text-ice lg:flex-row">
      {/* Mobile top bar */}
      <header className="flex items-center justify-between gap-3 border-b border-line bg-ink-900 px-4 py-3 lg:hidden">
        <div className="flex items-center gap-2">
          <Mark />
          <span className="font-display text-xl font-bold uppercase tracking-wide">Work Order Desk</span>
        </div>
        <button
          type="button"
          onClick={handleLogout}
          className="rounded-md border border-line px-3 py-1.5 text-sm text-steel-300 hover:text-ice"
        >
          Log out
        </button>
      </header>

      {/* Mobile nav */}
      <nav aria-label="App" className="flex gap-1 overflow-x-auto border-b border-line bg-ink-900 px-3 py-2 lg:hidden">
        {items.map((item) => (
          <NavLink key={item.to} to={item.to} end={item.end} className={linkClass}>
            {item.label}
          </NavLink>
        ))}
      </nav>

      {/* Desktop rail */}
      <aside className="hidden w-60 shrink-0 flex-col border-r border-line bg-ink-900 lg:flex">
        <div className="flex items-center gap-2.5 px-5 py-6">
          <Mark />
          <span className="font-display text-2xl font-bold uppercase tracking-wide text-ice">
            Work Order <span className="text-hi-400">Desk</span>
          </span>
        </div>
        <nav className="flex flex-1 flex-col gap-1 px-3" aria-label="App">
          {items.map((item) => (
            <NavLink key={item.to} to={item.to} end={item.end} className={linkClass}>
              <span className="font-mono text-[11px] text-steel-500">{'▸'}</span>
              {item.label}
            </NavLink>
          ))}
        </nav>
        <div className="border-t border-line px-3 py-4">
          <div className="flex items-center gap-3 px-2">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-ink-700 font-display text-lg font-bold uppercase text-hi-300">
              {user?.name?.charAt(0) ?? '?'}
            </div>
            <div className="min-w-0">
              <p className="truncate text-sm font-medium text-ice">{user?.name}</p>
              <p className="font-mono text-[11px] uppercase tracking-wider text-steel-400">{user?.role}</p>
            </div>
          </div>
          <button
            type="button"
            onClick={handleLogout}
            className="mt-3 w-full rounded-md border border-line px-3 py-2 text-sm text-steel-300 transition-colors hover:border-signal-500/50 hover:text-signal-400"
          >
            Log out
          </button>
        </div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <main className="mx-auto w-full max-w-5xl flex-1 px-4 py-6 sm:px-6 lg:px-10 lg:py-10">
          <Outlet />
        </main>
      </div>

      <button
        type="button"
        onClick={() => setCopilotOpen(true)}
        aria-label="Open Copilot"
        className="fixed bottom-5 right-5 z-30 flex items-center gap-2 rounded-full border border-line bg-ink-800 px-4 py-2 font-mono text-xs font-semibold uppercase tracking-wider text-ice shadow-lg transition-colors hover:border-hi-400/50 hover:text-hi-300"
      >
        <span aria-hidden className="hazard-chip" />
        Copilot
      </button>

      <CopilotPanel open={copilotOpen} onClose={() => setCopilotOpen(false)} />
    </div>
  );
}