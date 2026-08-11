import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { describe, expect, it, vi } from 'vitest';
import { http, HttpResponse } from 'msw';
import { server } from '@/test/msw/server';
import RegistroPage from './page';

const replace = vi.fn();
vi.mock('next/navigation', () => ({ useRouter: () => ({ replace }) }));

function renderPage() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <RegistroPage />
    </QueryClientProvider>,
  );
}

describe('RegistroPage', () => {
  it('registers a new client and redirects home', async () => {
    server.use(
      http.post('*/auth/register', () =>
        HttpResponse.json({ accessToken: 't', user: { id: 'u1', name: 'Carlos', phone: '+549', email: null } }),
      ),
    );
    const user = userEvent.setup();
    renderPage();

    await user.type(screen.getByLabelText('Nombre'), 'Carlos');
    await user.type(screen.getByLabelText('Teléfono'), '+5493431112');
    await user.type(screen.getByLabelText('Contraseña'), 'secret123');
    await user.click(screen.getByRole('button', { name: /crear cuenta/i }));

    await waitFor(() => expect(replace).toHaveBeenCalledWith('/'));
  });

  it('shows an inline error when the phone is already registered', async () => {
    server.use(
      http.post('*/auth/register', () =>
        HttpResponse.json({ message: 'Phone already registered' }, { status: 409 }),
      ),
    );
    const user = userEvent.setup();
    renderPage();

    await user.type(screen.getByLabelText('Nombre'), 'Carlos');
    await user.type(screen.getByLabelText('Teléfono'), '+5493431112');
    await user.type(screen.getByLabelText('Contraseña'), 'secret123');
    await user.click(screen.getByRole('button', { name: /crear cuenta/i }));

    expect(await screen.findByText('Phone already registered')).toBeInTheDocument();
  });
});
