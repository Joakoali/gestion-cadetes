import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { describe, expect, it } from 'vitest';
import { http, HttpResponse } from 'msw';
import { server } from '@/test/msw/server';
import ForgotPasswordPage from './page';

function renderPage() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <ForgotPasswordPage />
    </QueryClientProvider>,
  );
}

describe('ForgotPasswordPage', () => {
  it('shows a generic confirmation after submitting, regardless of whether the email exists', async () => {
    server.use(http.post('*/auth/forgot-password', () => HttpResponse.json({ ok: true })));
    const user = userEvent.setup();
    renderPage();

    await user.type(screen.getByLabelText('Email'), 'nadie@example.com');
    await user.click(screen.getByRole('button', { name: /enviar/i }));

    expect(
      await screen.findByText(/si el email existe, te llega un link para recuperar tu contraseña/i),
    ).toBeInTheDocument();
  });

  it('shows an error message when the mutation fails', async () => {
    server.use(http.post('*/auth/forgot-password', () => new HttpResponse(null, { status: 500 })));
    const user = userEvent.setup();
    renderPage();

    await user.type(screen.getByLabelText('Email'), 'test@example.com');
    await user.click(screen.getByRole('button', { name: /enviar/i }));

    expect(await screen.findByText(/algo salió mal\. intentá de nuevo\./i)).toBeInTheDocument();
  });
});
