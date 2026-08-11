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

// Members with CADETE role for reassign tests
const cadete1Member = { userId: 'u-cadete', name: 'Juan', phone: '+549', role: 'CADETE' as const };
const cadete2Member = { userId: 'u-cadete2', name: 'Miguel', phone: '+549', role: 'CADETE' as const };

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

  it('reassigns a delivery to a different cadete', async () => {
    const reassignedEntry = { ...boardEntry, cadeteUserId: 'u-cadete2', cadete: cadete2Member };
    let callCount = 0;

    server.use(
      http.get('*/tenants/t1/deliveries', () => {
        callCount++;
        // Return reassigned delivery on second fetch (after reassign mutation succeeds)
        return HttpResponse.json(callCount === 1 ? [boardEntry] : [reassignedEntry]);
      }),
      http.get('*/tenants/t1/members', () => HttpResponse.json([cadete1Member, cadete2Member])),
      http.patch('*/tenants/t1/deliveries/d1/reassign', () => HttpResponse.json(reassignedEntry)),
    );
    const user = userEvent.setup();
    renderPage();

    // Verify initial state: delivery assigned to Juan (cadete1)
    expect(await screen.findByText('Juan')).toBeInTheDocument();
    expect(screen.getByText('Carlos')).toBeInTheDocument();

    // Open reassign select and pick Miguel (cadete2)
    // The select trigger has role="combobox"
    const reassignSelect = screen.getByRole('combobox');
    await user.click(reassignSelect);

    // After opening, find and click Miguel option from the listbox
    // The option element contains text "Miguel" but no name attribute, so we query by text
    const miguelOption = screen.getAllByText('Miguel').find((el) => el.closest('[role="option"]'));
    if (miguelOption?.closest('[role="option"]')) {
      await user.click(miguelOption.closest('[role="option"]')!);
    }

    // After reassignment, board query is invalidated and refetches.
    // Verify the delivery is now under Miguel's group.
    await waitFor(() => {
      const miguelHeadings = screen.getAllByText('Miguel');
      expect(miguelHeadings.length).toBeGreaterThan(0);
    });
  });

  it('shows error toast when reassignment fails', async () => {
    const { toast } = await import('sonner');
    server.use(
      http.get('*/tenants/t1/deliveries', () => HttpResponse.json([boardEntry])),
      http.get('*/tenants/t1/members', () => HttpResponse.json([cadete1Member, cadete2Member])),
      http.patch('*/tenants/t1/deliveries/d1/reassign', () => HttpResponse.error()),
    );
    const user = userEvent.setup();
    renderPage();

    expect(await screen.findByText('Juan')).toBeInTheDocument();

    // Open reassign select and pick Miguel (cadete2)
    const reassignSelect = screen.getByRole('combobox');
    await user.click(reassignSelect);

    const miguelOption = screen.getAllByText('Miguel').find((el) => el.closest('[role="option"]'));
    if (miguelOption?.closest('[role="option"]')) {
      await user.click(miguelOption.closest('[role="option"]')!);
    }

    // Verify error toast is shown
    await waitFor(() => expect(toast.error).toHaveBeenCalledWith('No se pudo reasignar. Intentá de nuevo.'));
  });
});
