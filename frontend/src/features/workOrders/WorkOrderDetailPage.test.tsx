import { describe, expect, it, vi, beforeEach } from 'vitest';
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { render } from '@testing-library/react';
import { WorkOrderDetailPage } from './WorkOrderDetailPage';
import { ApiError } from '../../lib/errors';
import { createQueryClient } from '../../test/utils';

vi.mock('../../api/client', () => ({
  api: { get: vi.fn(), post: vi.fn(), patch: vi.fn(), delete: vi.fn() },
}));

import { api } from '../../api/client';

const workOrder = {
  id: 'wo1',
  title: 'Fix leaking pipe',
  description: 'Kitchen sink',
  priority: 'high' as const,
  status: 'pending' as const,
  owner: { id: 'u1', name: 'Tech', email: 'tech@example.com' },
  version: 1,
  createdAt: '2026-01-01T00:00:00Z',
  updatedAt: '2026-01-01T00:00:00Z',
};

describe('WorkOrderDetailPage 409 handling', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (api.get as ReturnType<typeof vi.fn>).mockImplementation((path: string) => {
      if (path === '/users/me') {
        return Promise.resolve({
          id: 'u1',
          email: 'tech@example.com',
          name: 'Tech',
          role: 'user',
          createdAt: '2026-01-01T00:00:00Z',
          updatedAt: '2026-01-01T00:00:00Z',
        });
      }
      return Promise.resolve(workOrder);
    });
  });

  it('shows the conflict banner and reloads when an update hits 409 CONFLICT_VERSION', async () => {
    const user = userEvent.setup();
    (api.patch as ReturnType<typeof vi.fn>).mockRejectedValue(
      new ApiError('Resource was modified; reload and retry', 'CONFLICT_VERSION', undefined, undefined, 409),
    );

    const qc = createQueryClient();
    render(
      <QueryClientProvider client={qc}>
        <MemoryRouter initialEntries={['/app/work-orders/wo1']}>
          <Routes>
            <Route path="/app/work-orders/:id" element={<WorkOrderDetailPage />} />
          </Routes>
        </MemoryRouter>
      </QueryClientProvider>,
    );

    await screen.findByText('Fix leaking pipe');
    await user.click(screen.getByRole('button', { name: /edit/i }));
    await user.click(screen.getByRole('button', { name: /save changes/i }));

    expect(await screen.findByText(/was changed elsewhere/i)).toBeInTheDocument();
    // the detail was re-fetched after the conflict (initial fetch + reload)
    const detailCalls = (api.get as ReturnType<typeof vi.fn>).mock.calls.filter((c) => c[0] === '/work-orders/wo1');
    expect(detailCalls).toHaveLength(2);
  });
});