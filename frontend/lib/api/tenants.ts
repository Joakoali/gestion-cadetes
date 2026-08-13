import { apiFetch } from './client';

export type Role = 'ADMIN' | 'MOSTRADOR' | 'CADETE';

export interface Membership {
  tenantId: string;
  name: string;
  role: Role;
}

export function getMyMemberships(): Promise<Membership[]> {
  return apiFetch<Membership[]>('/tenants');
}

export function createTenant(name: string, contactInfo?: string) {
  return apiFetch<{ id: string; name: string; contactInfo: string | null }>('/tenants', {
    method: 'POST',
    body: JSON.stringify({ name, contactInfo }),
  });
}
