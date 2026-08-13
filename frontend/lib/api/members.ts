import { apiFetch } from './client';
import { Role } from './tenants';

export interface Member {
  userId: string;
  name: string;
  phone: string;
  role: Role;
}

export function listMembers(tenantId: string): Promise<Member[]> {
  return apiFetch<Member[]>(`/tenants/${tenantId}/members`);
}
