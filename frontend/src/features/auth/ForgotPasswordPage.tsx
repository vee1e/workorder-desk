import { usePageTitle } from '../../hooks/usePageTitle';
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { forgotPasswordSchema } from '@workorders/shared';
import { api } from '../../api/client';
import type { OkResponse } from '@workorders/shared';
import { ApiError } from '../../lib/errors';
import { Button } from '../../components/primitives/Spinner';
import { Field, Input } from '../../components/primitives/Input';
import { Card, CardBody, CardHeader } from '../../components/primitives/Card';
import { ErrorBanner } from '../../components/primitives/Feedback';

export function ForgotPasswordPage() {
  usePageTitle('Reset your password');
  const [email, setEmail] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitted, setSubmitted] = useState(false);
  const [busy, setBusy] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    const parsed = forgotPasswordSchema.safeParse({ email });
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? 'Invalid email');
      return;
    }
    setError(null);
    setBusy(true);
    try {
      await api.post<OkResponse>('/auth/forgot-password', parsed.data);
      setSubmitted(true);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Request failed');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-ink-950 px-4">
      <Card className="w-full max-w-md">
        <CardHeader as="h1" title="Reset your password" description="We will email you a reset link if the account exists." />
        <CardBody>
          {submitted ? (
            <p className="text-sm text-steel-300">
              If an account exists for that email, a password reset link is on its way. Check your inbox.
            </p>
          ) : (
            <>
              {error && <ErrorBanner className="mb-4" message={error} />}
              <form onSubmit={onSubmit} className="space-y-4" noValidate>
                <Field label="Email" htmlFor="email">
                  <Input
                    id="email"
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                  />
                </Field>
                <Button type="submit" isLoading={busy} className="w-full">
                  Send reset link
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