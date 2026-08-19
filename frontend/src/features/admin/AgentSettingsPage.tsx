import { useEffect, useRef, useState } from 'react';
import type { TriageMode, WorkOrderPriority } from '@workorders/shared';
import { useAgentConfig, useDisableAgent, useManualTriageRun, useUpdateAgentConfig } from './queries';
import { usePageTitle } from '../../hooks/usePageTitle';
import { PageHeader, ErrorBanner } from '../../components/primitives/Feedback';
import { FullPageSpinner, Button } from '../../components/primitives/Spinner';
import { Card, CardBody } from '../../components/primitives/Card';
import { Field, Input, Select } from '../../components/primitives/Input';
import { messageFromError } from '../../lib/errors';

export function AgentSettingsPage() {
  usePageTitle('Agents');
  const { data: config, isPending, isError, error } = useAgentConfig();
  const updateConfig = useUpdateAgentConfig();
  const disableAgent = useDisableAgent();
  const manualRun = useManualTriageRun();

  const [mode, setMode] = useState<TriageMode>('suggest');
  const [dailyActionCap, setDailyActionCap] = useState(5);
  const [flagThreshold, setFlagThreshold] = useState<WorkOrderPriority>('medium');
  const [workingHours, setWorkingHours] = useState('');
  const [workOrderId, setWorkOrderId] = useState('');
  const [feedback, setFeedback] = useState<{ kind: 'ok' | 'error'; text: string } | null>(null);
  const seeded = useRef(false);

  useEffect(() => {
    if (config && !seeded.current) {
      seeded.current = true;
      setMode(config.mode);
      setDailyActionCap(config.dailyActionCap);
      setFlagThreshold(config.flagThreshold);
      setWorkingHours(config.workingHours);
    }
  }, [config]);

  if (isPending) return <FullPageSpinner />;
  if (isError || !config) {
    return (
      <div>
        <PageHeader kicker="Agent" title="Triage Agent" />
        <ErrorBanner message={isError ? messageFromError(error) : 'Agent config unavailable'} />
      </div>
    );
  }

  const current = {
    mode,
    dailyActionCap,
    flagThreshold,
    workingHours,
  };

  async function handleSave() {
    setFeedback(null);
    try {
      await updateConfig.mutateAsync(current);
      setFeedback({ kind: 'ok', text: 'Agent settings saved.' });
    } catch (err) {
      setFeedback({ kind: 'error', text: messageFromError(err, 'Save failed') });
    }
  }

  async function handleDisable() {
    setFeedback(null);
    try {
      await disableAgent.mutateAsync();
      setFeedback({ kind: 'ok', text: 'Agent disabled.' });
    } catch (err) {
      setFeedback({ kind: 'error', text: messageFromError(err, 'Disable failed') });
    }
  }

  async function handleRun() {
    setFeedback(null);
    try {
      const { outcome } = await manualRun.mutateAsync(workOrderId.trim() || undefined);
      setFeedback({ kind: 'ok', text: `Triage run finished: ${outcome}.` });
    } catch (err) {
      setFeedback({ kind: 'error', text: messageFromError(err, 'Triage run failed') });
    }
  }

  return (
    <div>
      <PageHeader kicker="Agent" title="Triage Agent" description="Configure the autonomous triage agent.">
        <span
          className={
            config.enabled
              ? 'font-mono text-[11px] font-medium uppercase tracking-wider text-go-400'
              : 'font-mono text-[11px] font-medium uppercase tracking-wider text-steel-400'
          }
        >
          {config.enabled ? '● Enabled' : '● Disabled'}
        </span>
      </PageHeader>

      {feedback && (
        <div className="mb-4">
          {feedback.kind === 'error' ? (
            <ErrorBanner message={feedback.text} />
          ) : (
            <div role="status" className="rounded-md border border-go-500/40 bg-go-500/10 px-4 py-3 text-sm text-go-400">
              {feedback.text}
            </div>
          )}
        </div>
      )}

      <Card className="mb-5">
        <CardBody className="grid gap-4 sm:grid-cols-2">
          <Field label="Mode" htmlFor="agent-mode">
            <Select
              id="agent-mode"
              value={mode}
              onChange={(e) => setMode(e.target.value as TriageMode)}
            >
              <option value="suggest">Suggest</option>
              <option value="auto-apply">Auto-apply</option>
            </Select>
          </Field>
          <Field label="Daily action cap" htmlFor="agent-cap">
            <Input
              id="agent-cap"
              type="number"
              min={1}
              value={dailyActionCap}
              onChange={(e) => setDailyActionCap(Number(e.target.value))}
            />
          </Field>
          <Field label="Flag threshold" htmlFor="agent-threshold">
            <Select
              id="agent-threshold"
              value={flagThreshold}
              onChange={(e) => setFlagThreshold(e.target.value as WorkOrderPriority)}
            >
              <option value="low">Low</option>
              <option value="medium">Medium</option>
              <option value="high">High</option>
            </Select>
          </Field>
          <Field label="Working hours" htmlFor="agent-hours">
            <Input
              id="agent-hours"
              value={workingHours}
              onChange={(e) => setWorkingHours(e.target.value)}
              placeholder="e.g. 08:00-18:00"
            />
          </Field>
        </CardBody>
        <CardBody className="flex flex-wrap items-center gap-3 border-t border-line">
          <Button
            variant="primary"
            isLoading={updateConfig.isPending}
            onClick={() => void handleSave()}
          >
            Save
          </Button>
          <Button
            variant="danger"
            isLoading={disableAgent.isPending}
            disabled={!config.enabled}
            onClick={() => void handleDisable()}
          >
            Disable agent
          </Button>
        </CardBody>
      </Card>

      <Card>
        <CardBody>
          <div className="mb-3">
            <p className="font-display text-lg font-semibold uppercase tracking-wide text-ice">
              Run triage now
            </p>
            <p className="text-sm text-steel-300">
              Optionally target a specific work order; otherwise the agent picks the most recent one.
            </p>
          </div>
          <div className="flex flex-wrap items-end gap-3">
            <div className="min-w-40 flex-1">
              <Field label="Work order ID (optional)" htmlFor="agent-wid">
                <Input
                  id="agent-wid"
                  value={workOrderId}
                  onChange={(e) => setWorkOrderId(e.target.value)}
                  placeholder="e.g. 65f1a2b3c4d5e6f7a8b9c0d1"
                />
              </Field>
            </div>
            <Button variant="secondary" isLoading={manualRun.isPending} onClick={() => void handleRun()}>
              Run triage now
            </Button>
          </div>
        </CardBody>
      </Card>
    </div>
  );
}