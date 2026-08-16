import { describe, expect, it, vi, beforeEach } from 'vitest';
import { screen } from '@testing-library/react';
import { Routes, Route } from 'react-router-dom';
import { QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import { render } from '@testing-library/react';
import { ProtectedRoute } from './ProtectedRoute';
import { createQueryClient } from '../test/utils';

vi.mock('../api/client', () => ({
  api: { get: vi.fn(), post: vi.fn(), patch: vi.fn(), delete: vi.fn() },
}));

import { api } from '../api/client';
import { ApiError } from '../lib/errors';

describe('ProtectedRoute', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  function renderRoute() {
    const qc = createQueryClient();
    return render(
      <QueryClientProvider client={qc}>
        <MemoryRouter initialEntries={['/app']}>
          <Routes>
            <Route element={<ProtectedRoute />}>
              <Route path="/app" element={<div>Protected content</div>} />
            </Route>
            <Route path="/login" element={<div>Login page</div>} />
          </Routes>
        </MemoryRouter>
      </QueryClientProvider>,
    );
  }

  it('redirects unauthenticated users to /login', async () => {
    (api.get as ReturnType<typeof vi.fn>).mockRejectedValue(
      new ApiError('Unauthorized', 'UNAUTHORIZED', undefined, undefined, 401),
    );
    renderRoute();
    expect(await screen.findByText('Login page')).toBeInTheDocument();
    expect(screen.queryByText('Protected content')).not.toBeInTheDocument();
  });

  it('renders children when authenticated', async () => {
    (api.get as ReturnType<typeof vi.fn>).mockResolvedValue({
      id: 'u1',
      email: 'tech@example.com',
      name: 'Tech',
      role: 'user',
      createdAt: '2026-01-01T00:00:00Z',
      updatedAt: '2026-01-01T00:00:00Z',
    });
    renderRoute();
    expect(await screen.findByText('Protected content')).toBeInTheDocument();
  });
});