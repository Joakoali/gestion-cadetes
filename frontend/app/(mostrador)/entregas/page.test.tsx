import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { describe, expect, it, vi } from 'vitest';
import { http, HttpResponse } from 'msw';
import { server } from '@/test/msw/server';
import EntregasBoardPage from './page';

vi.mock('next/navigation', () => ({
  useRouter: () => ({ replace: vi.fn() }),
  useSearchParams: () => new URLSearchParams('tenantId=t1'),
}));

vi.mock('sonner', () => ({
  toast: {
    error: vi.fn(),
  },
}));

function renderPage() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <EntregasBoardPage />
    </QueryClientProvider>,
  );
}

const boardEntry = {
  id: 'd1',
  tenantId: 't1',
  customerRecordId: 'c1',
  cadeteUserId: 'u-cadete',
  assignedByUserId: 'u-mostrador',
  status: 'ASSIGNED',
  rating: null,
  ratingNote: null,
  createdAt: '',
  completedAt: null,
  customerRecord: { id: 'c1', name: 'Carlos', phone: '+549', addressText: 'Belgrano 456', lat: 0, lng: 0, notes: '' },
  cadete: { id: 'u-cadete', name: 'Juan', phone: '+549' },
};

const cadete1 = { id: 'u-cadete', name: 'Juan', phone: '+549' };
const cadete2 = { id: 'u-cadete2', name: 'Miguel', phone: '+549' };

describe('EntregasBoardPage', () => {
  it('groups active deliveries by cadete and cancels one', async () => {
    server.use(
      http.get('*/tenants/t1/deliveries', () => HttpResponse.json([boardEntry])),
      http.get('*/tenants/t1/members', () => HttpResponse.json([])),
      http.patch('*/tenants/t1/deliveries/d1/cancel', () => HttpResponse.json({ ...boardEntry, status: 'CANCELLED' })),
    );
    const user = userEvent.setup();
    renderPage();

    expect(await screen.findByText('Juan')).toBeInTheDocument();
    expect(screen.getByText('Carlos')).toBeInTheDocument();

    server.use(http.get('*/tenants/t1/deliveries', () => HttpResponse.json([])));
    await user.click(screen.getByRole('button', { name: /cancelar/i }));

    await waitFor(() => expect(screen.getByText(/no hay entregas en curso/i)).toBeInTheDocument());
  });

  it('shows error message when board query fails', async () => {
    server.use(
      http.get('*/tenants/t1/deliveries', () => HttpResponse.error()),
      http.get('*/tenants/t1/members', () => HttpResponse.json([])),
    );
    renderPage();

    expect(await screen.findByText('No pudimos cargar las entregas. Intentá de nuevo.')).toBeInTheDocument();
  });

  it('shows error message when members query fails', async () => {
    server.use(
      http.get('*/tenants/t1/deliveries', () => HttpResponse.json([boardEntry])),
      http.get('*/tenants/t1/members', () => HttpResponse.error()),
    );
    renderPage();

    expect(await screen.findByText('No pudimos cargar los cadetes. Intentá de nuevo.')).toBeInTheDocument();
  });

  it('shows error toast when cancellation fails', async () => {
    const { toast } = await import('sonner');
    server.use(
      http.get('*/tenants/t1/deliveries', () => HttpResponse.json([boardEntry])),
      http.get('*/tenants/t1/members', () => HttpResponse.json([])),
      http.patch('*/tenants/t1/deliveries/d1/cancel', () => HttpResponse.error()),
    );
    const user = userEvent.setup();
    renderPage();

    expect(await screen.findByText('Juan')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /cancelar/i }));

    await waitFor(() => expect(toast.error).toHaveBeenCalledWith('No se pudo cancelar. Intentá de nuevo.'));
  });
});
