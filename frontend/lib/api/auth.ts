import { apiFetch, ApiError } from './client';

export interface UserProfile {
  id: string;
  name: string;
  phone: string;
  email: string | null;
}

export async function getMe(): Promise<UserProfile | null> {
  try {
    return await apiFetch<UserProfile>('/auth/me');
  } catch (err) {
    if (err instanceof ApiError && err.status === 401) {
      return null;
    }
    throw err;
  }
}

export function login(phone: string, password: string) {
  return apiFetch<{ user: UserProfile }>('/auth/login', {
    method: 'POST',
    body: JSON.stringify({ phone, password }),
  });
}

export function register(name: string, phone: string, password: string, email?: string) {
  return apiFetch<{ user: UserProfile }>('/auth/register', {
    method: 'POST',
    body: JSON.stringify({ name, phone, password, email }),
  });
}

export function logout() {
  return apiFetch<{ ok: true }>('/auth/logout', { method: 'POST' });
}
