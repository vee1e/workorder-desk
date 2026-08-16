import { useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { resetPasswordSchema } from '@workorders/shared';
import { api } from '../../api/client';
import type { UserPublic } from '@workorders/shared';
import { useQueryClient } from '@tanstack/react-query';
import { ApiError } from '../../lib/errors';
import { Button } from '../../components/primitives/Spinner';
import { Field, Input } from '../../components/primitives/Input';
import { Card, CardBody, CardHeader } from '../../components/primitives/Card';
import { ErrorBanner } from '../../components/primitives/Feedback';

export function ResetPasswordPage() {
  const [params] = useSearchParams();
  const token = params.get('token') ?? '';
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const navigate = useNavigate();
  const qc = useQueryClient();

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    const parsed = resetPasswordSchema.safeParse({ token, password });
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? 'Invalid input');
      return;
    }
    setError(null);
    setBusy(true);
    try {
      const user = await api.post<UserPublic>('/auth/reset-password', parsed.data);
      qc.setQueryData(['me'], user);
      navigate('/app', { replace: true });
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Reset failed');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-ink-950 px-4">
      <Card className="w-full max-w-md">
        <CardHeader title="Choose a new password" />
        <CardBody>
          {!token && <ErrorBanner message="This reset link is missing its token. Request a new one." />}
          {token && (
            <>
              {error && <ErrorBanner className="mb-4" message={error} />}
              <form onSubmit={onSubmit} className="space-y-4" noValidate>
                <Field label="New password" htmlFor="password">
                  <Input
                    id="password"
                    type="password"
                    autoComplete="new-password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                  />
                </Field>
                <Button type="submit" isLoading={busy} className="w-full">
                  Set password
                </Button>
              </form>
            </>
          )}
          <p className="mt-4 text-center text-sm text-steel-300">
            <Link to="/login" className="text-hi-400 hover:underline">
              Back to sign in
            </Link>
          </p>
        </CardBody>
      </Card>
    </div>
  );
}