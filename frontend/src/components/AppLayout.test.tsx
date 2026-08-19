import { describe, expect, it, vi, beforeEach } from 'vitest';
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import { render } from '@testing-library/react';
import { AppLayout } from './AppLayout';
import { createQueryClient } from '../test/utils';

vi.mock('../api/client', () => ({
  api: { get: vi.fn(), post: vi.fn(), patch: vi.fn(), delete: vi.fn() },
}));

import { api } from '../api/client';

const user = {
  id: 'u1',
  email: 'admin@example.com',
  name: 'Admin',
  role: 'admin',
  createdAt: '2026-01-01T00:00:00Z',
  updatedAt: '2026-01-01T00:00:00Z',
};

const session = {
  id: 's1',
  userId: 'u1',
  status: 'active',
  createdAt: '2026-01-01T00:00:00Z',
  updatedAt: '2026-01-01T00:00:00Z',
};

describe('AppLayout copilot toggle', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (api.get as ReturnType<typeof vi.fn>).mockImplementation((path: string) => {
      if (path === '/users/me') return Promise.resolve(user);
      if (path === '/ai/sessions') return Promise.resolve([session]);
      return Promise.reject(new Error(`unexpected get ${path}`));
    });
  });

  it('opens the copilot drawer when the Copilot button is clicked', async () => {
    const userEventApi = userEvent.setup();
    render(
      <QueryClientProvider client={createQueryClient()}>
        <MemoryRouter initialEntries={['/app/work-orders']}>
          <AppLayout />
        </MemoryRouter>
      </QueryClientProvider>,
    );
    const button = screen.getByRole('button', { name: 'Open Copilot' });
    await userEventApi.click(button);
    expect(await screen.findByRole('dialog', { name: 'Copilot' })).toBeInTheDocument();
  });
});
