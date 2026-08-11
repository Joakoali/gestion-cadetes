import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { LocationPicker } from './location-picker';

vi.mock('./location-picker-map', () => ({
  default: () => <div data-testid="map-stub" />,
}));

describe('LocationPicker', () => {
  it('calls onChange with the browser geolocation when "Usar mi ubicación" is clicked', async () => {
    const onChange = vi.fn();
    Object.defineProperty(global.navigator, 'geolocation', {
      value: {
        getCurrentPosition: (success: PositionCallback) =>
          success({ coords: { latitude: -31.73, longitude: -60.52 } } as GeolocationPosition),
      },
      configurable: true,
    });

    const user = userEvent.setup();
    render(<LocationPicker lat={null} lng={null} onChange={onChange} />);
    await user.click(screen.getByRole('button', { name: /usar mi ubicación/i }));

    expect(onChange).toHaveBeenCalledWith({ lat: -31.73, lng: -60.52 });
  });

  it('shows an error and keeps the map available when geolocation is denied', async () => {
    Object.defineProperty(global.navigator, 'geolocation', {
      value: {
        getCurrentPosition: (_success: PositionCallback, error: PositionErrorCallback) =>
          error({ code: 1 } as GeolocationPositionError),
      },
      configurable: true,
    });

    const user = userEvent.setup();
    render(<LocationPicker lat={null} lng={null} onChange={vi.fn()} />);
    await user.click(screen.getByRole('button', { name: /usar mi ubicación/i }));

    expect(await screen.findByText(/no pudimos acceder a tu ubicación/i)).toBeInTheDocument();
    expect(screen.getByTestId('map-stub')).toBeInTheDocument();
  });
});
