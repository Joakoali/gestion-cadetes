import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { describe, expect, it, vi } from 'vitest';
import { http, HttpResponse } from 'msw';
import { server } from '@/test/msw/server';
import AdminPage from './page';

vi.mock('next/navigation', () => ({
  useRouter: () => ({ replace: vi.fn() }),
  useSearchParams: () => new URLSearchParams('tenantId=t1'),
}));

function renderPage() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <AdminPage />
    </QueryClientProvider>,
  );
}

describe('AdminPage', () => {
  it('lists members and pending invites, and creates a new invite link', async () => {
    server.use(
      http.get('*/tenants/t1/members', () =>
        HttpResponse.json([{ userId: 'u1', name: 'Ana', phone: '+549', role: 'ADMIN' }]),
      ),
      http.get('*/tenants/t1/invites', () => HttpResponse.json([])),
      http.post('*/tenants/t1/invites', () =>
        HttpResponse.json({
          id: 'i1',
          url: 'http://localhost:3000/invite/abc123',
          role: 'CADETE',
          label: 'Cadete Juan',
          expiresAt: new Date().toISOString(),
        }),
      ),
    );
    const user = userEvent.setup();
    renderPage();

    // Wait for members to load
    await waitFor(() => {
      expect(screen.getByText(/Ana/)).toBeInTheDocument();
    });

    await user.type(screen.getByLabelText('Nombre (para identificarlo en la lista)'), 'Cadete Juan');
    await user.click(screen.getByRole('combobox'));
    await user.click(await screen.findByText('Cadete'));
    await user.click(screen.getByRole('button', { name: /generar invitación/i }));

    await waitFor(() =>
      expect(screen.getByDisplayValue('http://localhost:3000/invite/abc123')).toBeInTheDocument(),
    );
  });

  it('shows error message when members query fails', async () => {
    server.use(
      http.get('*/tenants/t1/members', () => HttpResponse.error()),
      http.get('*/tenants/t1/invites', () => HttpResponse.json([])),
    );
    renderPage();

    expect(await screen.findByText('No pudimos cargar los miembros. Intentá de nuevo.')).toBeInTheDocument();
  });

  it('shows error message when invite creation fails', async () => {
    server.use(
      http.get('*/tenants/t1/members', () =>
        HttpResponse.json([{ userId: 'u1', name: 'Ana', phone: '+549', role: 'ADMIN' }]),
      ),
      http.get('*/tenants/t1/invites', () => HttpResponse.json([])),
      http.post('*/tenants/t1/invites', () => HttpResponse.error()),
    );
    const user = userEvent.setup();
    renderPage();

    await waitFor(() => {
      expect(screen.getByText(/Ana/)).toBeInTheDocument();
    });

    await user.click(screen.getByRole('button', { name: /generar invitación/i }));

    expect(await screen.findByText('No pudimos generar la invitación. Intentá de nuevo.')).toBeInTheDocument();
  });
});
