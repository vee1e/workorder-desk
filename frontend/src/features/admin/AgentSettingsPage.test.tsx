import { describe, expect, it, vi, beforeEach } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { renderWithProviders } from '../../test/utils';
import { AgentSettingsPage } from './AgentSettingsPage';

const mocks = vi.hoisted(() => ({
  config: {
    name: 'triage',
    enabled: true,
    mode: 'suggest' as const,
    allowedFields: ['priority', 'status'],
    dailyActionCap: 5,
    flagThreshold: 'medium' as const,
    workingHours: '08:00-18:00',
    updatedBy: null,
    updatedAt: '2026-01-01T00:00:00Z',
  },
  updateConfigMutate: vi.fn(),
  disableMutate: vi.fn(),
  runMutate: vi.fn(),
}));

vi.mock('./queries', () => ({
  useAgentConfig: () => ({ data: mocks.config, isPending: false, isError: false, error: null }),
  useUpdateAgentConfig: () => ({ mutateAsync: mocks.updateConfigMutate, isPending: false }),
  useDisableAgent: () => ({ mutateAsync: mocks.disableMutate, isPending: false }),
  useManualTriageRun: () => ({ mutateAsync: mocks.runMutate, isPending: false }),
}));

describe('AgentSettingsPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders the agent config values', async () => {
    renderWithProviders(<AgentSettingsPage />);

    expect(await screen.findByDisplayValue('08:00-18:00')).toBeInTheDocument();
    expect(screen.getByLabelText('Mode')).toHaveValue('suggest');
    expect(screen.getByLabelText('Daily action cap')).toHaveValue(5);
    expect(screen.getByLabelText('Flag threshold')).toHaveValue('medium');
    expect(screen.getByText('● Enabled')).toBeInTheDocument();
  });

  it('saves the updated config via PATCH', async () => {
    const user = userEvent.setup();
    mocks.updateConfigMutate.mockResolvedValue({ ...mocks.config, mode: 'auto-apply' });

    renderWithProviders(<AgentSettingsPage />);
    await screen.findByDisplayValue('08:00-18:00');

    await user.selectOptions(screen.getByLabelText('Mode'), 'auto-apply');
    await user.click(screen.getByRole('button', { name: /^save$/i }));

    await waitFor(() =>
      expect(mocks.updateConfigMutate).toHaveBeenCalledWith({
        mode: 'auto-apply',
        dailyActionCap: 5,
        flagThreshold: 'medium',
        workingHours: '08:00-18:00',
      }),
    );
    expect(await screen.findByText('Agent settings saved.')).toBeInTheDocument();
  });

  it('runs triage with an optional work order id', async () => {
    const user = userEvent.setup();
    mocks.runMutate.mockResolvedValue({ outcome: 'done' });

    renderWithProviders(<AgentSettingsPage />);
    await screen.findByDisplayValue('08:00-18:00');

    await user.type(screen.getByLabelText('Work order ID (optional)'), 'wo-123');
    await user.click(screen.getByRole('button', { name: /run triage now/i }));

    await waitFor(() => expect(mocks.runMutate).toHaveBeenCalledWith('wo-123'));
    expect(await screen.findByText('Triage run finished: done.')).toBeInTheDocument();
  });
});