import { apiFetch } from './client';
import { Role } from './tenants';

export interface InviteInfo {
  tenantName: string;
  role: Role;
}

export function getInvite(token: string): Promise<InviteInfo> {
  return apiFetch<InviteInfo>(`/invites/${token}`);
}

export interface AcceptInvitePayload {
  name: string;
  phone: string;
  password: string;
  email?: string;
}

export function acceptInvite(token: string, payload: AcceptInvitePayload) {
  return apiFetch<{ user: { id: string; name: string; phone: string; email: string | null } }>(
    `/invites/${token}/accept`,
    { method: 'POST', body: JSON.stringify(payload) },
  );
}

export interface CreateInvitePayload {
  role: Role;
  label?: string;
  phone?: string;
}

export function createInvite(tenantId: string, payload: CreateInvitePayload) {
  return apiFetch<{ id: string; url: string; role: Role; label: string | null; expiresAt: string }>(
    `/tenants/${tenantId}/invites`,
    { method: 'POST', body: JSON.stringify(payload) },
  );
}
