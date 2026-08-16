import { describe, expect, it, vi, beforeEach } from 'vitest';
import { screen } from '@testing-library/react';
import { Routes, Route } from 'react-router-dom';
import { QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import { render } from '@testing-library/react';
import { AdminRoute } from './AdminRoute';
import { createQueryClient } from '../test/utils';

vi.mock('../api/client', () => ({
  api: { get: vi.fn(), post: vi.fn(), patch: vi.fn(), delete: vi.fn() },
}));

import { api } from '../api/client';

const user = (role: 'admin' | 'user') => ({
  id: 'u1',
  email: 'tech@example.com',
  name: 'Tech',
  role,
  createdAt: '2026-01-01T00:00:00Z',
  updatedAt: '2026-01-01T00:00:00Z',
});

describe('AdminRoute', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  function renderRoute(role: 'admin' | 'user') {
    const qc = createQueryClient();
    (api.get as ReturnType<typeof vi.fn>).mockResolvedValue(user(role));
    return render(
      <QueryClientProvider client={qc}>
        <MemoryRouter initialEntries={['/app/admin']}>
          <Routes>
            <Route element={<AdminRoute />}>
              <Route path="/app/admin" element={<div>Admin panel</div>} />
            </Route>
            <Route path="/app" element={<div>App home</div>} />
          </Routes>
        </MemoryRouter>
      </QueryClientProvider>,
    );
  }

  it('renders for admins', async () => {
    renderRoute('admin');
    expect(await screen.findByText('Admin panel')).toBeInTheDocument();
  });

  it('redirects non-admins to /app', async () => {
    renderRoute('user');
    expect(await screen.findByText('App home')).toBeInTheDocument();
    expect(screen.queryByText('Admin panel')).not.toBeInTheDocument();
  });
});