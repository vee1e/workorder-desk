import { usePageTitle } from '../../hooks/usePageTitle';
import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { registerSchema } from '@workorders/shared';
import { useRegister } from '../../hooks/useAuth';
import { ApiError } from '../../lib/errors';
import { Button } from '../../components/primitives/Spinner';
import { Field, Input } from '../../components/primitives/Input';
import { Card, CardBody, CardHeader } from '../../components/primitives/Card';
import { ErrorBanner } from '../../components/primitives/Feedback';

export function RegisterPage() {
  usePageTitle('Create account');
  const register = useRegister();
  const navigate = useNavigate();
  const [values, setValues] = useState({ name: '', email: '', password: '' });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    const parsed = registerSchema.safeParse(values);
    if (!parsed.success) {
      const map: Record<string, string> = {};
      for (const issue of parsed.error.issues) map[issue.path.join('.')] = issue.message;
      setErrors(map);
      return;
    }
    setErrors({});
    setFormError(null);
    try {
      await register.mutateAsync(parsed.data);
      navigate('/app', { replace: true });
    } catch (err) {
      setFormError(err instanceof ApiError ? err.message : 'Registration failed');
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-ink-950 px-4">
      <Card className="w-full max-w-md">
        <CardHeader as="h1" title="Create account" description="Join the work order desk." />
        <CardBody>
          {formError && <ErrorBanner className="mb-4" message={formError} />}
          <form onSubmit={onSubmit} className="space-y-4" noValidate>
            <Field label="Name" htmlFor="name" error={errors.name}>
              <Input id="name" value={values.name} onChange={(e) => setValues((v) => ({ ...v, name: e.target.value }))} />
            </Field>
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
                autoComplete="new-password"
                value={values.password}
                onChange={(e) => setValues((v) => ({ ...v, password: e.target.value }))}
              />
            </Field>
            <p className="text-xs text-steel-400">At least 8 characters, one letter and one number.</p>
            <Button type="submit" isLoading={register.isPending} className="w-full">
              Create account
            </Button>
          </form>
          <p className="mt-4 text-center text-sm text-steel-300">
            Already have an account?{' '}
            <Link to="/login" className="text-hi-400 hover:underline">
              Sign in
            </Link>
          </p>
        </CardBody>
      </Card>
    </div>
  );
}