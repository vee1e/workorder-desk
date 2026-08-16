import { Link } from 'react-router-dom';
import { Button } from '../components/primitives/Spinner';
import { Badge } from '../components/primitives/Badge';

const boardTickets = [
  { title: 'Rooftop compressor won’t start', no: '№ 3E2A1', priority: 'high' as const, status: 'in_progress' as const },
  { title: 'Replace condensate pump — AC-3', no: '№ 7C90F', priority: 'medium' as const, status: 'pending' as const },
  { title: 'Seal window draft — Unit 3A', no: '№ 4B81D', priority: 'low' as const, status: 'done' as const },
];

export function LandingPage() {
  return (
    <div className="flex min-h-screen flex-col bg-ink-950 text-ice">
      <header className="border-b border-line bg-ink-900/70">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-4">
          <div className="flex items-center gap-2.5">
            <span aria-hidden className="flex h-8 w-8 items-center justify-center rounded-md hazard-bar">
              <span className="block h-2 w-2 rounded-[2px] bg-ink-950" />
            </span>
            <span className="font-display text-2xl font-bold uppercase tracking-wide">
              Work Order <span className="text-hi-400">Desk</span>
            </span>
          </div>
          <nav className="flex items-center gap-3">
            <Link to="/login" className="text-sm text-steel-300 hover:text-ice">
              Sign in
            </Link>
            <Link to="/register">
              <Button>Get started</Button>
            </Link>
          </nav>
        </div>
      </header>

      <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-16 sm:py-24">
        <div className="grid items-center gap-12 lg:grid-cols-2">
          <div className="animate-fade-up">
            <p className="mb-4 flex items-center gap-2 font-mono text-[11px] font-medium uppercase tracking-[0.25em] text-hi-400">
              <span aria-hidden className="hazard-chip" />
              Field service ops
            </p>
            <h1 className="font-display text-6xl font-bold uppercase leading-[0.9] tracking-tight sm:text-7xl">
              Track field work from dispatch to done.
            </h1>
            <p className="mt-5 max-w-md text-lg leading-relaxed text-steel-300">
              Technicians log jobs, update status and priority as they work, and close them out. Dispatchers see every
              ticket on the board.
            </p>
            <div className="mt-8 flex flex-wrap items-center gap-3">
              <Link to="/register">
                <Button className="px-6 py-3 text-base">Create an account</Button>
              </Link>
              <Link to="/login">
                <Button variant="secondary" className="px-6 py-3 text-base">
                  Sign in
                </Button>
              </Link>
            </div>
          </div>

          <div className="animate-fade-up rounded-xl border border-line bg-ink-900 p-4 shadow-2xl">
            <div className="mb-3 flex items-center justify-between border-b border-line pb-3">
              <span className="font-mono text-[11px] uppercase tracking-[0.2em] text-steel-400">Dispatch board</span>
              <span className="flex items-center gap-1.5 font-mono text-[11px] uppercase tracking-wider text-go-400">
                <span className="h-1.5 w-1.5 rounded-full bg-go-400" /> live
              </span>
            </div>
            <ul className="space-y-2">
              {boardTickets.map((t) => (
                <li
                  key={t.no}
                  className="flex items-center justify-between gap-3 overflow-hidden rounded-md border border-line bg-ink-800 px-3 py-2.5"
                >
                  <div className="flex min-w-0 items-center gap-3">
                    <span
                      aria-hidden
                      className={
                        t.priority === 'high'
                          ? 'hazard-bar h-8 w-1.5 shrink-0 rounded-sm'
                          : t.priority === 'medium'
                            ? 'h-8 w-1.5 shrink-0 rounded-sm bg-hi-400/70'
                            : 'h-8 w-1.5 shrink-0 rounded-sm bg-steel-600'
                      }
                    />
                    <div className="min-w-0">
                      <p className="truncate font-display text-lg font-semibold uppercase tracking-wide text-ice">
                        {t.title}
                      </p>
                      <p className="font-mono text-[11px] text-steel-500">{t.no}</p>
                    </div>
                  </div>
                  <div className="flex shrink-0 items-center gap-2">
                    <Badge kind="priority" value={t.priority} />
                    <Badge kind="status" value={t.status} />
                  </div>
                </li>
              ))}
            </ul>
            <div className="mt-3 border-t border-line pt-3 text-right font-mono text-[11px] uppercase tracking-wider text-steel-500">
              20 tickets on the board
            </div>
          </div>
        </div>

        <div className="mt-20 grid gap-4 sm:grid-cols-3">
          {[
            ['Own your jobs', 'Log work orders and track progress through a clear status flow.'],
            ['Prioritize', 'Flag jobs low, medium or high so urgent field work surfaces first.'],
            ['Dispatcher oversight', 'Admins see every work order and can manage the crew’s access.'],
          ].map(([title, body]) => (
            <div key={title} className="rounded-lg border border-line bg-ink-900 p-6">
              <p className="font-display text-2xl font-semibold uppercase tracking-wide text-hi-400">{title}</p>
              <p className="mt-2 text-sm leading-relaxed text-steel-300">{body}</p>
            </div>
          ))}
        </div>
      </main>

      <footer className="border-t border-line bg-ink-900 py-6 text-center font-mono text-xs uppercase tracking-wider text-steel-500">
        Work Order Desk · MERN starter, purpose-built for field service
      </footer>
    </div>
  );
}