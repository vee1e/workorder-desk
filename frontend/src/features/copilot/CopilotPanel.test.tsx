import { describe, expect, it, vi, beforeEach } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { renderWithProviders } from '../../test/utils';
import { CopilotPanel } from './CopilotPanel';

const mocks = vi.hoisted(() => ({
  postEventStream: vi.fn(),
  decideMutate: vi.fn(),
}));

vi.mock('../../api/stream', () => ({ postEventStream: mocks.postEventStream }));

vi.mock('./queries', () => ({
  useCopilotSession: () => ({
    data: {
      id: 's1',
      userId: 'u1',
      status: 'active',
      createdAt: '2026-01-01T00:00:00Z',
      updatedAt: '2026-01-01T00:00:00Z',
    },
    isPending: false,
    error: null,
  }),
  useDecideApproval: () => ({ mutateAsync: mocks.decideMutate }),
}));

function sessionEventStream(events: Array<[string, Record<string, unknown>]>) {
  mocks.postEventStream.mockImplementation(async (_path, _body, opts) => {
    for (const [event, data] of events) opts.onEvent(event, data);
    opts.onDone?.();
  });
}

describe('CopilotPanel', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders messages and streams assistant tokens', async () => {
    const user = userEvent.setup();
    sessionEventStream([
      ['token', { content: 'Hello' }],
      ['token', { content: ' world' }],
      ['message_done', { runId: 'r1', content: 'Hello world', inputTokens: 3, outputTokens: 2 }],
    ]);

    renderWithProviders(<CopilotPanel open onClose={vi.fn()} />);

    await user.type(screen.getByLabelText('Message Copilot'), 'Fix the sink');
    await user.click(screen.getByRole('button', { name: /send/i }));

    expect(await screen.findByText('Fix the sink')).toBeInTheDocument();
    expect(await screen.findByText('Hello world')).toBeInTheDocument();
    expect(mocks.postEventStream).toHaveBeenCalledWith(
      '/ai/sessions/s1/messages',
      { content: 'Fix the sink' },
      expect.objectContaining({ onEvent: expect.any(Function) }),
    );
  });

  it('shows the approval modal and Approve calls decide', async () => {
    const user = userEvent.setup();
    mocks.decideMutate.mockResolvedValue({ id: 'tc1' });
    sessionEventStream([
      [
        'tool_approval_required',
        {
          toolCallId: 'tc1',
          tool: 'update_work_order',
          args: { title: 'New title' },
          preImage: { title: 'Old title' },
          afterDiff: { title: 'New title' },
          summary: 'Update work order wo1',
          expiresAt: new Date(Date.now() + 60_000).toISOString(),
        },
      ],
    ]);

    renderWithProviders(<CopilotPanel open onClose={vi.fn()} />);

    await user.type(screen.getByLabelText('Message Copilot'), 'Rename the ticket');
    await user.click(screen.getByRole('button', { name: /send/i }));

    expect(await screen.findByRole('dialog', { name: 'Tool approval' })).toBeInTheDocument();
    expect(screen.getByText('Update work order wo1')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /approve/i }));

    await waitFor(() => expect(mocks.decideMutate).toHaveBeenCalledWith({ id: 'tc1', approve: true }));
  });

  it('surfaces a stream error event', async () => {
    const user = userEvent.setup();
    sessionEventStream([
      ['error', { code: 'AI_UNAVAILABLE', message: 'AI provider unavailable', requestId: 'r1' }],
    ]);

    renderWithProviders(<CopilotPanel open onClose={vi.fn()} />);

    await user.type(screen.getByLabelText('Message Copilot'), 'Do something');
    await user.click(screen.getByRole('button', { name: /send/i }));

    expect(await screen.findByText('AI provider unavailable')).toBeInTheDocument();
  });
});