import { afterEach, describe, expect, it, vi } from 'vitest';
import { postEventStream } from './stream';

interface MockReader {
  read: ReturnType<typeof vi.fn>;
  releaseLock: ReturnType<typeof vi.fn>;
  cancel: ReturnType<typeof vi.fn>;
}

function okResponse(chunks: Uint8Array[]): { ok: true; status: number; body: { getReader: () => MockReader }; json: ReturnType<typeof vi.fn> } {
  const reads: Array<{ done: boolean; value: Uint8Array }> = [
    ...chunks.map((value) => ({ done: false, value })),
    { done: true, value: new Uint8Array(0) },
  ];
  const reader: MockReader = {
    read: vi.fn().mockImplementation(() => Promise.resolve(reads.shift()!)),
    releaseLock: vi.fn(),
    cancel: vi.fn().mockResolvedValue(undefined),
  };
  return {
    ok: true,
    status: 200,
    body: { getReader: () => reader },
    json: vi.fn(),
  };
}

function errorResponse(status: number, body: unknown): {
  ok: false;
  status: number;
  body: null;
  json: ReturnType<typeof vi.fn>;
} {
  return { ok: false, status, body: null, json: vi.fn().mockResolvedValue(body) };
}

describe('postEventStream', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('emits parsed events and calls onDone for a full SSE frame', async () => {
    const enc = new TextEncoder();
    const frame =
      'event: token\ndata: {"content":"hi"}\n\n' +
      'event: message_done\ndata: {"runId":"r1","content":"hi"}\n\n';
    const fetchMock = vi.fn().mockResolvedValue(okResponse([enc.encode(frame)]));
    vi.stubGlobal('fetch', fetchMock);

    const onEvent = vi.fn();
    const onDone = vi.fn();
    await postEventStream('/ai/sessions/s1/messages', { content: 'hi' }, { onEvent, onDone });

    expect(onEvent).toHaveBeenCalledWith('token', { content: 'hi' });
    expect(onEvent).toHaveBeenCalledWith('message_done', { runId: 'r1', content: 'hi' });
    expect(onDone).toHaveBeenCalledTimes(1);
    expect(fetchMock).toHaveBeenCalledWith(
      '/api/v1/ai/sessions/s1/messages',
      expect.objectContaining({ method: 'POST', body: JSON.stringify({ content: 'hi' }) }),
    );
  });

  it('buffers a frame split across chunks', async () => {
    const enc = new TextEncoder();
    const bytes = enc.encode('event: token\ndata: {"content":"hi"}\n\n');
    const half = Math.floor(bytes.length / 2);
    const fetchMock = vi.fn().mockResolvedValue(okResponse([bytes.slice(0, half), bytes.slice(half)]));
    vi.stubGlobal('fetch', fetchMock);

    const onEvent = vi.fn();
    const onDone = vi.fn();
    await postEventStream('/ai/sessions/s1/messages', { content: 'hi' }, { onEvent, onDone });

    expect(onEvent).toHaveBeenCalledTimes(1);
    expect(onEvent).toHaveBeenCalledWith('token', { content: 'hi' });
    expect(onDone).toHaveBeenCalledTimes(1);
  });

  it('skips malformed data payloads without breaking the stream', async () => {
    const enc = new TextEncoder();
    const bytes = enc.encode(
      'event: token\ndata: {not json}\n\nevent: message_done\ndata: {"runId":"r1","content":"done"}\n\n',
    );
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(okResponse([bytes])));

    const onEvent = vi.fn();
    await postEventStream('/ai/sessions/s1/messages', { content: 'hi' }, { onEvent });

    expect(onEvent).toHaveBeenCalledTimes(1);
    expect(onEvent).toHaveBeenCalledWith('message_done', { runId: 'r1', content: 'done' });
  });

  it('refreshes once on a pre-first-byte 401 and retries the stream', async () => {
    const enc = new TextEncoder();
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        errorResponse(401, { error: { message: 'Unauthorized', code: 'UNAUTHORIZED', requestId: 'r-1' } }),
      )
      .mockResolvedValueOnce({ ok: true, status: 200, json: vi.fn() })
      .mockResolvedValueOnce(okResponse([enc.encode('event: token\ndata: {"content":"ok"}\n\n')]));
    vi.stubGlobal('fetch', fetchMock);

    const onEvent = vi.fn();
    await postEventStream('/ai/sessions/s1/messages', { content: 'hi' }, { onEvent });

    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(String(fetchMock.mock.calls[1]?.[0])).toBe('/api/v1/auth/refresh');
    expect(fetchMock.mock.calls[1]?.[1]).toEqual(expect.objectContaining({ method: 'POST' }));
    expect(onEvent).toHaveBeenCalledWith('token', { content: 'ok' });
  });

  it('throws a Session expired error when refresh fails after a 401', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        errorResponse(401, { error: { message: 'Unauthorized', code: 'UNAUTHORIZED' } }),
      )
      .mockResolvedValueOnce({ ok: false, status: 401, json: vi.fn() });
    vi.stubGlobal('fetch', fetchMock);

    await expect(
      postEventStream('/ai/sessions/s1/messages', { content: 'hi' }, { onEvent: vi.fn() }),
    ).rejects.toMatchObject({ code: 'UNAUTHORIZED', status: 401, message: 'Session expired' });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('throws an ApiError when the response is not ok and not 401', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      errorResponse(500, { error: { message: 'Boom', code: 'INTERNAL' } }),
    );
    vi.stubGlobal('fetch', fetchMock);

    const onEvent = vi.fn();
    const onDone = vi.fn();
    await expect(
      postEventStream('/ai/sessions/s1/messages', { content: 'hi' }, { onEvent, onDone }),
    ).rejects.toMatchObject({ code: 'INTERNAL', status: 500, message: 'Boom' });
    expect(onEvent).not.toHaveBeenCalled();
    expect(onDone).not.toHaveBeenCalled();
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('stops silently when the stream is aborted', async () => {
    const controller = new AbortController();
    let rejectRead!: (e: Error) => void;
    const reader: MockReader = {
      read: vi.fn().mockImplementation(
        () => new Promise((_resolve, reject) => { rejectRead = reject; }),
      ),
      releaseLock: vi.fn(),
      cancel: vi.fn().mockResolvedValue(undefined),
    };
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        body: { getReader: () => reader },
        json: vi.fn(),
      }),
    );

    const onEvent = vi.fn();
    const onDone = vi.fn();
    const streamPromise = postEventStream(
      '/ai/sessions/s1/messages',
      { content: 'hi' },
      { signal: controller.signal, onEvent, onDone },
    );

    await vi.waitFor(() => expect(reader.read).toHaveBeenCalled());
    controller.abort();
    rejectRead(new DOMException('Aborted', 'AbortError'));
    await streamPromise;

    expect(onDone).not.toHaveBeenCalled();
    expect(onEvent).not.toHaveBeenCalled();
    expect(reader.cancel).toHaveBeenCalled();
  });
});