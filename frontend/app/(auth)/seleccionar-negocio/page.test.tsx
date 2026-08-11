import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import SeleccionarNegocioPage from './page';

const push = vi.fn();
vi.mock('next/navigation', () => ({ useRouter: () => ({ push }) }));
vi.mock('@/lib/auth/session', () => ({
  useSession: () => ({
    status: 'staff',
    memberships: [
      { tenantId: 't1', name: 'Negocio A', role: 'MOSTRADOR' },
      { tenantId: 't2', name: 'Negocio B', role: 'CADETE' },
    ],
  }),
}));

describe('SeleccionarNegocioPage', () => {
  it('lists all memberships and routes to the right landing page by role', async () => {
    const user = userEvent.setup();
    render(<SeleccionarNegocioPage />);

    expect(screen.getByText('Negocio A')).toBeInTheDocument();
    await user.click(screen.getByText('Negocio B'));

    expect(push).toHaveBeenCalledWith('/entregas?tenantId=t2');
  });
});
