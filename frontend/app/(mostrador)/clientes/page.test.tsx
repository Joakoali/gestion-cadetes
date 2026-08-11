import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { describe, expect, it, vi } from 'vitest';
import { http, HttpResponse } from 'msw';
import { server } from '@/test/msw/server';
import ClientesPage from './page';

vi.mock('@/components/location-picker-map', () => ({ default: () => <div data-testid="map-stub" /> }));
const replace = vi.fn();
const push = vi.fn();
vi.mock('next/navigation', () => ({
  useRouter: () => ({ replace, push }),
  useSearchParams: () => new URLSearchParams('tenantId=t1'),
}));

function renderPage() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <ClientesPage />
    </QueryClientProvider>,
  );
}

describe('ClientesPage', () => {
  it('lists search results and links to the customer detail page', async () => {
    server.use(
      http.get('*/tenants/t1/customers', () =>
        HttpResponse.json([{ id: 'c1', name: 'Carlos', phone: '+549', tenantId: 't1', linkedUserId: null, addressText: '', lat: 0, lng: 0, notes: '', createdAt: '' }]),
      ),
    );
    renderPage();

    expect(await screen.findByText('Carlos')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /Carlos/ })).toHaveAttribute('href', '/clientes/c1?tenantId=t1');
  });

  it('creates a customer manually and navigates to its detail page', async () => {
    // Mock geolocation to return coordinates
    global.navigator.geolocation = {
      getCurrentPosition: (success: any) => {
        success({ coords: { latitude: -31.7, longitude: -60.5 } });
      },
    } as any;

    server.use(
      http.get('*/tenants/t1/customers', () => HttpResponse.json([])),
      http.post('*/tenants/t1/customers', () =>
        HttpResponse.json({ id: 'c2', name: 'Nueva', phone: '+549', tenantId: 't1', linkedUserId: null, addressText: 'Belgrano 456', lat: -31.7, lng: -60.5, notes: '', createdAt: '' }),
      ),
    );
    const user = userEvent.setup();
    renderPage();

    await user.click(screen.getByRole('button', { name: /nuevo cliente/i }));
    await user.click(screen.getByRole('button', { name: /cargar a mano/i }));
    await user.type(screen.getByLabelText('Nombre'), 'Nueva');
    await user.type(screen.getByLabelText('Teléfono'), '+5493431199');
    await user.type(screen.getByLabelText('Dirección'), 'Belgrano 456');
    await user.click(screen.getByRole('button', { name: /usar mi ubicación/i }));
    await user.click(screen.getByRole('button', { name: /guardar cliente/i }));

    await waitFor(() => expect(push).toHaveBeenCalledWith('/clientes/c2?tenantId=t1'));
  });
});
