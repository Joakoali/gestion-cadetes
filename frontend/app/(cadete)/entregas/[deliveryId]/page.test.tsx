import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { describe, expect, it, vi } from 'vitest';
import { http, HttpResponse } from 'msw';
import { server } from '@/test/msw/server';
import CadeteDeliveryDetailPage from './page';

vi.mock('@/components/location-picker-map', () => ({ default: () => <div data-testid="map-stub" /> }));
vi.mock('sonner', () => ({
  toast: {
    error: vi.fn(),
  },
}));
const push = vi.fn();
vi.mock('next/navigation', () => ({
  useRouter: () => ({ replace: vi.fn(), push }),
  useSearchParams: () => new URLSearchParams('tenantId=t1'),
  useParams: () => ({ deliveryId: 'd1' }),
}));

function renderPage() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <CadeteDeliveryDetailPage />
    </QueryClientProvider>,
  );
}

const delivery = {
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
  customerRecord: {
    id: 'c1',
    name: 'Carlos',
    phone: '+549',
    addressText: 'Belgrano 456',
    lat: -31.7,
    lng: -60.5,
    notes: 'rejas negras',
  },
};

describe('CadeteDeliveryDetailPage', () => {
  it('shows customer info and completes the delivery with a rating', async () => {
    server.use(
      http.get('*/tenants/t1/deliveries/mine', () => HttpResponse.json([delivery])),
      http.patch('*/tenants/t1/deliveries/d1/complete', () =>
        HttpResponse.json({ ...delivery, status: 'COMPLETED', rating: 4 }),
      ),
    );
    const user = userEvent.setup();
    renderPage();

    expect(await screen.findByText('Carlos')).toBeInTheDocument();
    expect(screen.getByText('rejas negras')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /completar/i }));
    await user.click(screen.getByRole('button', { name: '4 estrellas' }));
    await user.click(screen.getByRole('button', { name: /confirmar/i }));

    await waitFor(() => expect(push).toHaveBeenCalledWith('/entregas?tenantId=t1'));
  });

  it('shows error feedback when completion fails', async () => {
    const { toast } = await import('sonner');
    server.use(
      http.get('*/tenants/t1/deliveries/mine', () => HttpResponse.json([delivery])),
      http.patch('*/tenants/t1/deliveries/d1/complete', () =>
        HttpResponse.error(),
      ),
    );
    const user = userEvent.setup();
    renderPage();

    expect(await screen.findByText('Carlos')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /completar/i }));
    await user.click(screen.getByRole('button', { name: '4 estrellas' }));
    await user.click(screen.getByRole('button', { name: /confirmar/i }));

    await waitFor(() => expect(toast.error).toHaveBeenCalledWith('No se pudo completar la entrega. Intentá de nuevo.'));
  });

  it('cancels delivery with error feedback on failure', async () => {
    const { toast } = await import('sonner');
    server.use(
      http.get('*/tenants/t1/deliveries/mine', () => HttpResponse.json([delivery])),
      http.patch('*/tenants/t1/deliveries/d1/cancel', () =>
        HttpResponse.error(),
      ),
    );
    const user = userEvent.setup();
    renderPage();

    expect(await screen.findByText('Carlos')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /cancelar/i }));

    await waitFor(() => expect(toast.error).toHaveBeenCalledWith('No se pudo cancelar la entrega. Intentá de nuevo.'));
  });
});
