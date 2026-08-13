import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { describe, expect, it, vi } from 'vitest';
import { http, HttpResponse } from 'msw';
import { useEffect } from 'react';
import { server } from '@/test/msw/server';
import PerfilPage from './page';

vi.mock('@/components/location-picker-map', () => ({
  default: ({ onChange }: any) => {
    useEffect(() => {
      onChange({ lat: -31.735, lng: -60.525 });
    }, [onChange]);
    return <div data-testid="map-stub" />;
  },
}));
const replace = vi.fn();
vi.mock('next/navigation', () => ({ useRouter: () => ({ replace }) }));

function renderPage() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return {
    queryClient,
    ...render(
      <QueryClientProvider client={queryClient}>
        <PerfilPage />
      </QueryClientProvider>,
    ),
  };
}

describe('PerfilPage', () => {
  it('shows the short code and saves a new location', async () => {
    server.use(
      http.get('*/auth/me', () =>
        HttpResponse.json({ id: 'u1', name: 'Carlos', phone: '+5493431112', email: null }),
      ),
      http.get('*/tenants', () => HttpResponse.json([])),
      http.post('*/users/me/short-code', () => HttpResponse.json({ shortCode: 'AB12CD' })),
      http.patch('*/users/me/location', () =>
        HttpResponse.json({ addressText: 'Belgrano 456', lat: -31.735, lng: -60.525 }),
      ),
    );
    const user = userEvent.setup();
    renderPage();

    expect(await screen.findByText('AB12CD')).toBeInTheDocument();
    expect(screen.getByText('Carlos')).toBeInTheDocument();

    await user.type(screen.getByLabelText('Dirección'), 'Belgrano 456');
    await user.click(screen.getByRole('button', { name: /guardar ubicación/i }));

    await waitFor(() => expect(screen.getByText(/ubicación guardada/i)).toBeInTheDocument());
  });

  it('logs out, clears the session cache, and redirects to /login', async () => {
    server.use(
      http.get('*/auth/me', () =>
        HttpResponse.json({ id: 'u1', name: 'Carlos', phone: '+5493431112', email: null }),
      ),
      http.get('*/tenants', () => HttpResponse.json([])),
      http.post('*/users/me/short-code', () => HttpResponse.json({ shortCode: 'AB12CD' })),
      http.post('*/auth/logout', () => HttpResponse.json({ ok: true })),
    );
    replace.mockClear();
    const user = userEvent.setup();
    const { queryClient } = renderPage();

    expect(await screen.findByText('AB12CD')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: /cerrar sesión/i }));

    await waitFor(() => expect(queryClient.getQueryData(['auth', 'me'])).toBeNull());
    await waitFor(() => expect(replace).toHaveBeenCalledWith('/login'));
  });
});
