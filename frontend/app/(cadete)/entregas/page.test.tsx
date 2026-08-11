import { render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { describe, expect, it, vi } from 'vitest';
import { http, HttpResponse } from 'msw';
import { server } from '@/test/msw/server';
import CadeteEntregasPage from './page';

vi.mock('next/navigation', () => ({
  useRouter: () => ({ replace: vi.fn() }),
  useSearchParams: () => new URLSearchParams('tenantId=t1'),
}));

function renderPage() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <CadeteEntregasPage />
    </QueryClientProvider>,
  );
}

describe('CadeteEntregasPage', () => {
  it('lists assigned deliveries with a link to each detail', async () => {
    server.use(
      http.get('*/tenants/t1/deliveries/mine', () =>
        HttpResponse.json([
          {
            id: 'd1',
            tenantId: 't1',
            customerRecordId: 'c1',
            cadeteUserId: 'u1',
            assignedByUserId: 'u2',
            status: 'ASSIGNED',
            rating: null,
            ratingNote: null,
            createdAt: '',
            completedAt: null,
            customerRecord: { id: 'c1', name: 'Carlos', phone: '+549', addressText: 'Belgrano 456', lat: -31.7, lng: -60.5, notes: '' },
          },
        ]),
      ),
    );
    renderPage();

    expect(await screen.findByText('Carlos')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /Carlos/ })).toHaveAttribute('href', '/entregas/d1?tenantId=t1');
  });

  it('shows empty state when no deliveries are assigned', async () => {
    server.use(
      http.get('*/tenants/t1/deliveries/mine', () =>
        HttpResponse.json([]),
      ),
    );
    renderPage();

    expect(await screen.findByText('No tenés entregas asignadas.')).toBeInTheDocument();
  });

  it('shows error feedback when delivery fetch fails', async () => {
    server.use(
      http.get('*/tenants/t1/deliveries/mine', () =>
        HttpResponse.error(),
      ),
    );
    renderPage();

    expect(await screen.findByText('No pudimos cargar tus entregas. Intentá de nuevo.')).toBeInTheDocument();
  });
});
