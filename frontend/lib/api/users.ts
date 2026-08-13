import { apiFetch } from './client';

export interface LocationPayload {
  addressText: string;
  lat: number;
  lng: number;
}

export function updateMyLocation(payload: LocationPayload) {
  return apiFetch<LocationPayload>('/users/me/location', {
    method: 'PATCH',
    body: JSON.stringify(payload),
  });
}

export function ensureShortCode() {
  return apiFetch<{ shortCode: string }>('/users/me/short-code', { method: 'POST' });
}
