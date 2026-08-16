import { useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { loginSchema } from '@workorders/shared';
import { useLogin } from '../../hooks/useAuth';
import { ApiError } from '../../lib/errors';
import { Button } from '../../components/primitives/Spinner';
import { Field, Input } from '../../components/primitives/Input';
import { Card, CardBody, CardHeader } from '../../components/primitives/Card';
import { ErrorBanner } from '../../components/primitives/Feedback';

export function LoginPage() {
  const login = useLogin();
  const navigate = useNavigate();
  const location = useLocation();
  const [values, setValues] = useState({ email: '', password: '' });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);

  const from = (location.state as { from?: string } | null)?.from ?? '/app';

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    const parsed = loginSchema.safeParse(values);
    if (!parsed.success) {
      const map: Record<string, string> = {};
      for (const issue of parsed.error.issues) map[issue.path.join('.')] = issue.message;
      setErrors(map);
      return;
    }
    setErrors({});
    setFormError(null);
    try {
      await login.mutateAsync(parsed.data);
      navigate(from, { replace: true });
    } catch (err) {
      setFormError(err instanceof ApiError ? err.message : 'Login failed');
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-ink-950 px-4">
      <Card className="w-full max-w-md">
        <CardHeader title="Sign in" description="Welcome back to the work order desk." />
        <CardBody>
          {formError && <ErrorBanner className="mb-4" message={formError} />}
          <form onSubmit={onSubmit} className="space-y-4" noValidate>
            <Field label="Email" htmlFor="email" error={errors.email}>
              <Input
                id="email"
                type="email"
                autoComplete="email"
                value={values.email}
                onChange={(e) => setValues((v) => ({ ...v, email: e.target.value }))}
              />
            </Field>
            <Field label="Password" htmlFor="password" error={errors.password}>
              <Input
                id="password"
                type="password"
                autoComplete="current-password"
                value={values.password}
                onChange={(e) => setValues((v) => ({ ...v, password: e.target.value }))}
              />
            </Field>
            <Button type="submit" isLoading={login.isPending} className="w-full">
              Sign in
            </Button>
          </form>
          <div className="mt-4 flex items-center justify-between text-sm">
            <Link to="/forgot-password" className="text-hi-400 hover:underline">
              Forgot password?
            </Link>
            <Link to="/register" className="text-steel-300 hover:underline">
              Create an account
            </Link>
          </div>

          <div className="mt-6 rounded-md border border-line bg-ink-800/60 p-3">
            <p className="mb-2 font-mono text-[11px] uppercase tracking-[0.2em] text-hi-400">Demo accounts</p>
            <ul className="space-y-1.5 text-sm">
              <li>
                <span className="font-mono text-[11px] uppercase tracking-wider text-steel-400">Dispatcher</span>
                <span className="ml-2 text-ice">admin@example.com</span>
                <span className="ml-2 font-mono text-steel-300">Admin1234</span>
              </li>
              <li>
                <span className="font-mono text-[11px] uppercase tracking-wider text-steel-400">Technician</span>
                <span className="ml-2 text-ice">user@example.com</span>
                <span className="ml-2 font-mono text-steel-300">User1234</span>
              </li>
              <li>
                <span className="font-mono text-[11px] uppercase tracking-wider text-steel-400">Viewer</span>
                <span className="ml-2 text-ice">viewer@example.com</span>
                <span className="ml-2 font-mono text-steel-300">Viewer1234</span>
                <span className="ml-2 rounded bg-signal-500/15 px-1.5 py-0.5 font-mono text-[10px] uppercase tracking-wider text-signal-400">
                  read only
                </span>
              </li>
            </ul>
          </div>
        </CardBody>
      </Card>
    </div>
  );
}