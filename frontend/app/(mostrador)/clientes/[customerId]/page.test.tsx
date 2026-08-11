import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { describe, expect, it, vi } from 'vitest';
import { http, HttpResponse } from 'msw';
import { server } from '@/test/msw/server';
import CustomerDetailPage from './page';

vi.mock('@/components/location-picker-map', () => ({ default: () => <div data-testid="map-stub" /> }));
vi.mock('next/navigation', () => ({
  useRouter: () => ({ replace: vi.fn(), push: vi.fn() }),
  useSearchParams: () => new URLSearchParams('tenantId=t1'),
  useParams: () => ({ customerId: 'c1' }),
}));

function renderPage() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <CustomerDetailPage />
    </QueryClientProvider>,
  );
}

const baseCustomer = {
  id: 'c1',
  tenantId: 't1',
  linkedUserId: null,
  name: 'Carlos',
  phone: '+549343399999',
  addressText: 'Belgrano 456',
  lat: -31.735,
  lng: -60.525,
  notes: 'rejas negras',
  createdAt: '',
  averageRating: 4.5,
  deliveryCount: 2,
};

describe('CustomerDetailPage', () => {
  it('shows the customer ficha and saves edited notes', async () => {
    server.use(
      http.get('*/tenants/t1/customers/c1', () => HttpResponse.json(baseCustomer)),
      http.patch('*/tenants/t1/customers/c1', () =>
        HttpResponse.json({ ...baseCustomer, notes: 'perro suelto' }),
      ),
    );
    const user = userEvent.setup();
    renderPage();

    expect(await screen.findByText('Carlos')).toBeInTheDocument();
    expect(screen.getByText(/4.5/)).toBeInTheDocument();

    const notesField = screen.getByLabelText('Notas');
    await user.clear(notesField);
    await user.type(notesField, 'perro suelto');
    await user.click(screen.getByRole('button', { name: /guardar notas/i }));

    await waitFor(() => expect(screen.getByText(/cambios guardados/i)).toBeInTheDocument());
  });
});
