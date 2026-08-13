import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { describe, expect, it, vi } from 'vitest';
import { http, HttpResponse } from 'msw';
import { server } from '@/test/msw/server';
import CrearNegocioPage from './page';

const replace = vi.fn();
vi.mock('next/navigation', () => ({ useRouter: () => ({ replace }) }));

function renderPage() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <CrearNegocioPage />
    </QueryClientProvider>,
  );
}

describe('CrearNegocioPage', () => {
  it('creates a tenant and redirects straight to its customer list', async () => {
    server.use(
      http.post('*/tenants', () => HttpResponse.json({ id: 't1', name: 'Almacén Don José', contactInfo: null })),
    );
    const user = userEvent.setup();
    renderPage();

    await user.type(screen.getByLabelText('Nombre del negocio'), 'Almacén Don José');
    await user.click(screen.getByRole('button', { name: /crear negocio/i }));

    await waitFor(() => expect(replace).toHaveBeenCalledWith('/clientes?tenantId=t1'));
  });

  it('shows an error message when tenant creation fails', async () => {
    server.use(
      http.post('*/tenants', () => HttpResponse.json({ message: 'Error creating tenant' }, { status: 500 })),
    );
    const user = userEvent.setup();
    renderPage();

    await user.type(screen.getByLabelText('Nombre del negocio'), 'Almacén Don José');
    await user.click(screen.getByRole('button', { name: /crear negocio/i }));

    expect(await screen.findByText('Algo salió mal. Intentá de nuevo.')).toBeInTheDocument();
  });
});
