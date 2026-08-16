import { useState } from 'react';
import { changePasswordSchema, updateProfileSchema } from '@workorders/shared';
import type { UserPublic } from '@workorders/shared';
import { api } from '../../api/client';
import { useMe } from '../../hooks/useAuth';
import { ApiError, messageFromError } from '../../lib/errors';
import { PageHeader, ErrorBanner } from '../../components/primitives/Feedback';
import { Button } from '../../components/primitives/Spinner';
import { Card, CardBody, CardHeader } from '../../components/primitives/Card';
import { Field, Input } from '../../components/primitives/Input';

export function ProfilePage() {
  const { data: user } = useMe();
  const [name, setName] = useState(user?.name ?? '');
  const [nameError, setNameError] = useState<string | null>(null);
  const [nameBusy, setNameBusy] = useState(false);
  const [nameSaved, setNameSaved] = useState(false);

  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [pwErrors, setPwErrors] = useState<Record<string, string>>({});
  const [pwMessage, setPwMessage] = useState<string | null>(null);
  const [pwBusy, setPwBusy] = useState(false);

  async function saveName(e: React.FormEvent) {
    e.preventDefault();
    const parsed = updateProfileSchema.safeParse({ name });
    if (!parsed.success) {
      setNameError(parsed.error.issues[0]?.message ?? 'Invalid name');
      return;
    }
    setNameError(null);
    setNameBusy(true);
    try {
      await api.patch<UserPublic>('/users/me', parsed.data);
      setNameSaved(true);
    } catch (err) {
      setNameError(messageFromError(err));
    } finally {
      setNameBusy(false);
    }
  }

  async function changePassword(e: React.FormEvent) {
    e.preventDefault();
    const parsed = changePasswordSchema.safeParse({ currentPassword, newPassword });
    if (!parsed.success) {
      const map: Record<string, string> = {};
      for (const issue of parsed.error.issues) map[issue.path.join('.')] = issue.message;
      setPwErrors(map);
      return;
    }
    setPwErrors({});
    setPwMessage(null);
    setPwBusy(true);
    try {
      await api.post<UserPublic>('/users/me/password', parsed.data);
      setCurrentPassword('');
      setNewPassword('');
      setPwMessage('Password updated. Other sessions were signed out.');
    } catch (err) {
      setPwMessage(null);
      setPwErrors({ _: err instanceof ApiError ? err.message : 'Password change failed' });
    } finally {
      setPwBusy(false);
    }
  }

  return (
    <div className="max-w-2xl space-y-6">
      <PageHeader kicker="Account" title="Profile" description="Manage your account." />

      <Card>
        <CardHeader title="Name" description="How you appear to your crew." />
        <CardBody>
          <form onSubmit={saveName} className="space-y-4">
            {nameError && <ErrorBanner message={nameError} />}
            {nameSaved && !nameError && (
              <p className="rounded-md border border-go-400/40 bg-go-400/10 px-4 py-3 text-sm text-go-400">Name saved.</p>
            )}
            <Field label="Name" htmlFor="name">
              <Input id="name" value={name} onChange={(e) => setName(e.target.value)} />
            </Field>
            <Button type="submit" isLoading={nameBusy} onClick={() => setNameSaved(false)}>
              Save name
            </Button>
          </form>
        </CardBody>
      </Card>

      <Card>
        <CardHeader title="Password" description="Change your password and sign out other sessions." />
        <CardBody>
          <form onSubmit={changePassword} className="space-y-4" noValidate>
            {pwMessage && (
              <p className="rounded-md border border-go-400/40 bg-go-400/10 px-4 py-3 text-sm text-go-400">{pwMessage}</p>
            )}
            {pwErrors._ && <ErrorBanner message={pwErrors._} />}
            <Field label="Current password" htmlFor="currentPassword" error={pwErrors.currentPassword}>
              <Input
                id="currentPassword"
                type="password"
                autoComplete="current-password"
                value={currentPassword}
                onChange={(e) => setCurrentPassword(e.target.value)}
              />
            </Field>
            <Field label="New password" htmlFor="newPassword" error={pwErrors.newPassword}>
              <Input
                id="newPassword"
                type="password"
                autoComplete="new-password"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
              />
            </Field>
            <Button type="submit" isLoading={pwBusy}>
              Update password
            </Button>
          </form>
        </CardBody>
      </Card>
    </div>
  );
}