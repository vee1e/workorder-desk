import { Link } from 'react-router-dom';
import { Button } from '../components/primitives/Spinner';

import { usePageTitle } from '../hooks/usePageTitle';

export function NotFoundPage() {
  usePageTitle('Page not found');
  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-ink-950 px-4 text-center">
      <p className="font-display text-8xl font-bold uppercase leading-none text-steel-600">404</p>
      <p className="mt-2 font-mono text-[11px] uppercase tracking-[0.3em] text-hi-400">Off the route</p>
      <h1 className="mt-4 font-display text-3xl font-semibold uppercase tracking-wide text-ice">Page not found</h1>
      <p className="mt-2 text-sm text-steel-300">The page you are looking for does not exist.</p>
      <div className="mt-6">
        <Link to="/">
          <Button>Back home</Button>
        </Link>
      </div>
    </div>
  );
}