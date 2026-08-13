import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { describe, expect, it, vi, beforeEach } from 'vitest';
import type { Session } from '@/lib/auth/session';
import MostradorLayout from './layout';

const replace = vi.fn();
vi.mock('next/navigation', () => ({
  useRouter: () => ({ replace }),
  useSearchParams: () => new URLSearchParams('tenantId=t1'),
}));

const logoutMock = vi.fn();
vi.mock('@/lib/api/auth', () => ({
  logout: () => logoutMock(),
}));

let mockSession: Session;
vi.mock('@/lib/auth/session', () => ({
  useSession: () => mockSession,
}));

function renderLayout(queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })) {
  return {
    queryClient,
    ...render(
      <QueryClientProvider client={queryClient}>
        <MostradorLayout>
          <div data-testid="child">contenido</div>
        </MostradorLayout>
      </QueryClientProvider>,
    ),
  };
}

describe('MostradorLayout', () => {
  beforeEach(() => {
    replace.mockClear();
    logoutMock.mockReset();
  });

  it('shows Clientes and Tablero links, hides Admin link for a MOSTRADOR membership', () => {
    mockSession = {
      status: 'staff',
      user: { id: 'u1', name: 'Ana', phone: '+549', email: null },
      memberships: [{ tenantId: 't1', name: 'Rotisería', role: 'MOSTRADOR' }],
    };
    renderLayout();

    expect(screen.getByRole('link', { name: 'Clientes' })).toHaveAttribute('href', '/clientes?tenantId=t1');
    expect(screen.getByRole('link', { name: 'Tablero' })).toHaveAttribute('href', '/tablero?tenantId=t1');
    expect(screen.queryByRole('link', { name: 'Admin' })).not.toBeInTheDocument();
    expect(screen.getByTestId('child')).toBeInTheDocument();
  });

  it('shows the Admin link when the current membership role is ADMIN', () => {
    mockSession = {
      status: 'staff',
      user: { id: 'u1', name: 'Ana', phone: '+549', email: null },
      memberships: [{ tenantId: 't1', name: 'Rotisería', role: 'ADMIN' }],
    };
    renderLayout();

    expect(screen.getByRole('link', { name: 'Admin' })).toHaveAttribute('href', '/admin?tenantId=t1');
  });

  it('logs out, clears the session cache, and redirects to /login', async () => {
    mockSession = {
      status: 'staff',
      user: { id: 'u1', name: 'Ana', phone: '+549', email: null },
      memberships: [{ tenantId: 't1', name: 'Rotisería', role: 'ADMIN' }],
    };
    logoutMock.mockResolvedValue({ ok: true });
    const user = userEvent.setup();
    const { queryClient } = renderLayout();
    queryClient.setQueryData(['auth', 'me'], { id: 'u1', name: 'Ana', phone: '+549', email: null });

    await user.click(screen.getByRole('button', { name: 'Cerrar sesión' }));

    await waitFor(() => expect(logoutMock).toHaveBeenCalled());
    await waitFor(() => expect(queryClient.getQueryData(['auth', 'me'])).toBeNull());
    await waitFor(() => expect(replace).toHaveBeenCalledWith('/login'));
  });
});
