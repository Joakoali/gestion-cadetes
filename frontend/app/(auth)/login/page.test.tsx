import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { describe, expect, it, vi } from 'vitest';
import { http, HttpResponse } from 'msw';
import { server } from '@/test/msw/server';
import LoginPage from './page';

const replace = vi.fn();
vi.mock('next/navigation', () => ({ useRouter: () => ({ replace }) }));

function renderPage() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <LoginPage />
    </QueryClientProvider>,
  );
}

describe('LoginPage', () => {
  it('logs in with valid credentials and redirects home', async () => {
    server.use(
      http.post('*/auth/login', () =>
        HttpResponse.json({ accessToken: 't', user: { id: 'u1', name: 'Ana', phone: '+549', email: null } }),
      ),
    );
    const user = userEvent.setup();
    renderPage();

    await user.type(screen.getByLabelText('Teléfono'), '+5493431111');
    await user.type(screen.getByLabelText('Contraseña'), 'secret123');
    await user.click(screen.getByRole('button', { name: /ingresar/i }));

    await waitFor(() => expect(replace).toHaveBeenCalledWith('/'));
  });

  it('shows an inline error on invalid credentials', async () => {
    server.use(
      http.post('*/auth/login', () => HttpResponse.json({ message: 'Invalid credentials' }, { status: 401 })),
    );
    const user = userEvent.setup();
    renderPage();

    await user.type(screen.getByLabelText('Teléfono'), '+5493431111');
    await user.type(screen.getByLabelText('Contraseña'), 'wrongpwd');
    await user.click(screen.getByRole('button', { name: /ingresar/i }));

    expect(await screen.findByText('Invalid credentials')).toBeInTheDocument();
  });
});
