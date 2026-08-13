import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import * as pushLib from '@/lib/push';
import { InstallBanner } from './install-banner';

describe('InstallBanner', () => {
  beforeEach(() => {
    // Mock Notification API which is not available in jsdom by default
    Object.defineProperty(global, 'Notification', {
      value: {
        permission: 'default',
        requestPermission: vi.fn().mockResolvedValue('granted'),
      },
      writable: true,
      configurable: true,
    });
  });

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

  it('does not call requestNotificationPermission when device is not installed as PWA (stale-closure fix)', async () => {
    vi.spyOn(window, 'matchMedia').mockReturnValue({ matches: false } as MediaQueryList);
    const requestNotificationPermissionSpy = vi.spyOn(pushLib, 'requestNotificationPermission');
    const subscribeToSpy = vi.spyOn(pushLib, 'subscribeToPush');

    render(<InstallBanner />);

    // Wait for the banner to render with install instructions (the generic fallback text when not iOS/Android)
    expect(await screen.findByText(/instalar app|agregar a pantalla|menú de tu navegador/i)).toBeInTheDocument();

    // Verify that requestNotificationPermission was NOT called
    // (it should only be called when installed === true, not on initial mount)
    expect(requestNotificationPermissionSpy).not.toHaveBeenCalled();
    expect(subscribeToSpy).not.toHaveBeenCalled();
  });

  it('calls requestNotificationPermission when device IS installed as PWA', async () => {
    vi.spyOn(window, 'matchMedia').mockReturnValue({ matches: true } as MediaQueryList);
    const requestNotificationPermissionSpy = vi.spyOn(pushLib, 'requestNotificationPermission');
    const subscribeToSpy = vi.spyOn(pushLib, 'subscribeToPush');

    render(<InstallBanner />);

    // Wait for effects to run and permission request to be called
    await waitFor(() => {
      expect(requestNotificationPermissionSpy).toHaveBeenCalled();
    });

    // When permission is granted, subscribeToPush should be called
    expect(subscribeToSpy).toHaveBeenCalled();
  });
});
