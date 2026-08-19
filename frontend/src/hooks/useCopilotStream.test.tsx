import { describe, expect, it, vi, beforeEach } from 'vitest';
import { act, renderHook, waitFor } from '@testing-library/react';
import { useCopilotStream } from '../features/copilot/useCopilotStream';

const mocks = vi.hoisted(() => ({ postEventStream: vi.fn() }));

vi.mock('../api/stream', () => ({ postEventStream: mocks.postEventStream }));

function streamEvents(events: Array<[string, Record<string, unknown>]>) {
  mocks.postEventStream.mockImplementation(async (_path, _body, opts) => {
    for (const [event, data] of events) opts.onEvent(event, data);
    opts.onDone?.();
  });
}

describe('useCopilotStream', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('appends tokens into one assistant message and finalizes on message_done', async () => {
    streamEvents([
      ['heartbeat', { ts: 1 }],
      ['token', { content: 'Hel' }],
      ['token', { content: 'lo' }],
      ['message_done', { runId: 'r1', content: 'Hello' }],
    ]);
    const { result } = renderHook(() => useCopilotStream());

    await act(async () => {
      await result.current.send('hi', 's1');
    });

    expect(result.current.messages).toEqual([
      { role: 'user', content: 'hi' },
      { role: 'assistant', content: 'Hello' },
    ]);
    expect(result.current.runId).toBe('r1');
    expect(result.current.isStreaming).toBe(false);
    expect(mocks.postEventStream).toHaveBeenCalledWith(
      '/ai/sessions/s1/messages',
      { content: 'hi' },
      expect.objectContaining({ onEvent: expect.any(Function), onDone: expect.any(Function) }),
    );
  });

  it('does not append an empty final message', async () => {
    streamEvents([
      ['token', { content: 'Hi' }],
      ['message_done', { runId: 'r1', content: '' }],
    ]);
    const { result } = renderHook(() => useCopilotStream());

    await act(async () => {
      await result.current.send('hi', 's1');
    });

    expect(result.current.messages).toEqual([
      { role: 'user', content: 'hi' },
      { role: 'assistant', content: 'Hi' },
    ]);
  });

  it('exposes a pendingApproval until a tool_result resolves it', async () => {
    mocks.postEventStream.mockImplementation(async (_path, _body, opts) => {
      opts.onEvent('tool_approval_required', {
        toolCallId: 'tc1',
        tool: 'update_work_order',
        args: { title: 'x' },
        summary: 'Update wo1',
        expiresAt: '2026-01-01T00:00:00Z',
      });
      await Promise.resolve();
      opts.onEvent('tool_result', { toolCallId: 'tc1', outcome: 'executed', result: 'ok' });
      opts.onDone?.();
    });

    const { result } = renderHook(() => useCopilotStream());

    let sendPromise: Promise<void> | undefined;
    act(() => {
      sendPromise = result.current.send('hi', 's1');
    });

    await waitFor(() =>
      expect(result.current.pendingApproval).toEqual(
        expect.objectContaining({ toolCallId: 'tc1', tool: 'update_work_order', summary: 'Update wo1' }),
      ),
    );
    await act(async () => {
      await sendPromise;
    });

    expect(result.current.pendingApproval).toBeNull();
    expect(result.current.toolResults).toEqual({ tc1: 'ok' });
  });

  it('clears a pendingApproval when it expires', async () => {
    mocks.postEventStream.mockImplementation(async (_path, _body, opts) => {
      opts.onEvent('tool_approval_required', {
        toolCallId: 'tc1',
        tool: 'update_work_order',
        args: {},
        summary: 'Update wo1',
        expiresAt: '2026-01-01T00:00:00Z',
      });
      await Promise.resolve();
      opts.onEvent('tool_approval_expired', { toolCallId: 'tc1' });
      opts.onDone?.();
    });

    const { result } = renderHook(() => useCopilotStream());

    let sendPromise: Promise<void> | undefined;
    act(() => {
      sendPromise = result.current.send('hi', 's1');
    });

    await waitFor(() => expect(result.current.pendingApproval).not.toBeNull());
    await act(async () => {
      await sendPromise;
    });

    expect(result.current.pendingApproval).toBeNull();
  });

  it('does not send while a stream is in flight', async () => {
    let resolveStream!: () => void;
    mocks.postEventStream.mockImplementation(
      () => new Promise<void>((resolve) => { resolveStream = resolve; }),
    );
    const { result } = renderHook(() => useCopilotStream());

    let first: Promise<void> | undefined;
    let second: Promise<void> | undefined;
    act(() => {
      first = result.current.send('one', 's1');
      second = result.current.send('two', 's1');
    });

    await act(async () => {
      resolveStream();
    });
    await first;
    await second;

    expect(mocks.postEventStream).toHaveBeenCalledTimes(1);
  });

  it('does not send while an approval is pending', async () => {
    mocks.postEventStream.mockImplementation(async (_path, _body, opts) => {
      opts.onEvent('tool_approval_required', {
        toolCallId: 'tc1',
        tool: 'update_work_order',
        args: {},
        summary: 'Update wo1',
        expiresAt: '2026-01-01T00:00:00Z',
      });
      opts.onDone?.();
    });

    const { result } = renderHook(() => useCopilotStream());
    await act(async () => {
      await result.current.send('hi', 's1');
    });

    expect(result.current.pendingApproval).not.toBeNull();
    await act(async () => {
      await result.current.send('again', 's1');
    });

    expect(mocks.postEventStream).toHaveBeenCalledTimes(1);
  });

  it('surfaces an error event message', async () => {
    streamEvents([['error', { code: 'AI_UNAVAILABLE', message: 'AI provider unavailable' }]]);
    const { result } = renderHook(() => useCopilotStream());

    await act(async () => {
      await result.current.send('hi', 's1');
    });

    expect(result.current.error).toBe('AI provider unavailable');
    expect(result.current.isStreaming).toBe(false);
  });

  it('sets the error when the stream onError callback fires', async () => {
    mocks.postEventStream.mockImplementation(async (_path, _body, opts) => {
      opts.onError?.(new Error('stream boom'));
    });
    const { result } = renderHook(() => useCopilotStream());

    await act(async () => {
      await result.current.send('hi', 's1');
    });

    expect(result.current.error).toBe('stream boom');
    expect(result.current.isStreaming).toBe(false);
  });
});