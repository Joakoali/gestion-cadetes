import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { InstallBanner } from './install-banner';

describe('InstallBanner', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('shows iOS install instructions when not running as an installed PWA', async () => {
    vi.spyOn(window, 'matchMedia').mockReturnValue({ matches: false } as MediaQueryList);
    vi.spyOn(navigator, 'userAgent', 'get').mockReturnValue(
      'Mozilla/5.0 (iPhone; CPU iPhone OS 16_4 like Mac OS X)',
    );

    render(<InstallBanner />);

    expect(await screen.findByText(/agregar a pantalla de inicio/i)).toBeInTheDocument();
  });

  it('dismisses the banner on request', async () => {
    vi.spyOn(window, 'matchMedia').mockReturnValue({ matches: false } as MediaQueryList);
    const user = userEvent.setup();
    render(<InstallBanner />);

    await user.click(await screen.findByRole('button', { name: /ahora no/i }));
    expect(screen.queryByText(/pantalla de inicio|instalar app/i)).not.toBeInTheDocument();
  });

  it('renders nothing when already running as an installed PWA', () => {
    vi.spyOn(window, 'matchMedia').mockReturnValue({ matches: true } as MediaQueryList);
    const { container } = render(<InstallBanner />);
    expect(container).toBeEmptyDOMElement();
  });
});
