import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { describe, expect, it, vi } from 'vitest';
import { http, HttpResponse } from 'msw';
import { server } from '@/test/msw/server';
import ResetPasswordPage from './page';

const replace = vi.fn();
vi.mock('next/navigation', () => ({
  useRouter: () => ({ replace }),
  useParams: () => ({ token: 'valid-token' }),
}));

function renderPage() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <ResetPasswordPage />
    </QueryClientProvider>,
  );
}

describe('ResetPasswordPage', () => {
  it('shows the form for a valid token and resets the password on submit', async () => {
    server.use(
      http.get('*/auth/reset-password/valid-token', () => HttpResponse.json({ valid: true })),
      http.post('*/auth/reset-password/valid-token', () => HttpResponse.json({ ok: true })),
    );
    const user = userEvent.setup();
    renderPage();

    const passwordInput = await screen.findByLabelText('Nueva contraseña');
    await user.type(passwordInput, 'newpassword456');
    await user.click(screen.getByRole('button', { name: /guardar/i }));

    await waitFor(() => expect(replace).toHaveBeenCalledWith('/login'));
  });

  it('shows an explicit error for an invalid or expired token', async () => {
    server.use(http.get('*/auth/reset-password/valid-token', () => new HttpResponse(null, { status: 404 })));
    renderPage();

    expect(await screen.findByText(/este link venció o ya fue usado/i)).toBeInTheDocument();
  });
});
