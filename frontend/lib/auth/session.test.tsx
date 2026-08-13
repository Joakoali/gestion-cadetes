import { render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { describe, expect, it } from 'vitest';
import { http, HttpResponse } from 'msw';
import { server } from '@/test/msw/server';
import { useSession } from './session';

function Probe() {
  const session = useSession();
  return <div data-testid="status">{session.status}</div>;
}

function renderWithClient() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <Probe />
    </QueryClientProvider>,
  );
}

describe('useSession', () => {
  it('resolves to "client" when the user has no memberships', async () => {
    server.use(
      http.get('*/auth/me', () =>
        HttpResponse.json({ id: 'u1', name: 'Ana', phone: '+549', email: null }),
      ),
      http.get('*/tenants', () => HttpResponse.json([])),
    );
    renderWithClient();
    await waitFor(() => expect(screen.getByTestId('status')).toHaveTextContent('client'));
  });

  it('resolves to "staff" when the user has at least one membership', async () => {
    server.use(
      http.get('*/auth/me', () =>
        HttpResponse.json({ id: 'u1', name: 'Ana', phone: '+549', email: null }),
      ),
      http.get('*/tenants', () =>
        HttpResponse.json([{ tenantId: 't1', name: 'Rotisería', role: 'MOSTRADOR' }]),
      ),
    );
    renderWithClient();
    await waitFor(() => expect(screen.getByTestId('status')).toHaveTextContent('staff'));
  });

  it('resolves to "anon" when /auth/me returns no user', async () => {
    server.use(http.get('*/auth/me', () => new HttpResponse(null, { status: 401 })));
    renderWithClient();
    await waitFor(() => expect(screen.getByTestId('status')).toHaveTextContent('anon'));
  });

  it('resolves to "error" when /tenants call fails', async () => {
    server.use(
      http.get('*/auth/me', () =>
        HttpResponse.json({ id: 'u1', name: 'Ana', phone: '+549', email: null }),
      ),
      http.get('*/tenants', () => new HttpResponse(null, { status: 500 })),
    );
    renderWithClient();
    await waitFor(() => expect(screen.getByTestId('status')).toHaveTextContent('error'));
  });

  it('resolves to "error" (not "anon") when /auth/me fails with something other than a 401', async () => {
    server.use(http.get('*/auth/me', () => new HttpResponse(null, { status: 500 })));
    renderWithClient();
    await waitFor(() => expect(screen.getByTestId('status')).toHaveTextContent('error'));
  });
});
