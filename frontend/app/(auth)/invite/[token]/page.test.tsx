import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { describe, expect, it, vi } from 'vitest';
import { http, HttpResponse } from 'msw';
import { server } from '@/test/msw/server';
import InvitePage from './page';

const replace = vi.fn();
vi.mock('next/navigation', () => ({
  useRouter: () => ({ replace }),
  useParams: () => ({ token: 'valid-token' }),
}));

function renderPage() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <InvitePage />
    </QueryClientProvider>,
  );
}

describe('InvitePage', () => {
  it('shows the tenant and role, then accepts and redirects home', async () => {
    server.use(
      http.get('*/invites/valid-token', () =>
        HttpResponse.json({ tenantName: 'Rotisería Don José', role: 'CADETE' }),
      ),
      http.post('*/invites/valid-token/accept', () =>
        HttpResponse.json({ user: { id: 'u1', name: 'Juan', phone: '+549', email: null } }),
      ),
    );
    const user = userEvent.setup();
    renderPage();

    expect(await screen.findByText(/Rotisería Don José/)).toBeInTheDocument();
    expect(screen.getByText(/CADETE/)).toBeInTheDocument();

    await user.type(screen.getByLabelText('Nombre'), 'Juan');
    await user.type(screen.getByLabelText('Teléfono'), '+5493431113');
    await user.type(screen.getByLabelText('Contraseña'), 'secret123');
    await user.click(screen.getByRole('button', { name: /crear cuenta/i }));

    await waitFor(() => expect(replace).toHaveBeenCalledWith('/'));
  });

  it('shows an explicit message for an invalid or expired invite', async () => {
    server.use(http.get('*/invites/valid-token', () => new HttpResponse(null, { status: 404 })));
    renderPage();

    expect(
      await screen.findByText(/esta invitación venció o ya fue usada/i),
    ).toBeInTheDocument();
  });
});
