import { apiFetch } from './client';

export interface Customer {
  id: string;
  tenantId: string;
  linkedUserId: string | null;
  name: string;
  phone: string;
  addressText: string;
  lat: number;
  lng: number;
  notes: string;
  createdAt: string;
}

export interface CustomerDetail extends Customer {
  averageRating: number | null;
  deliveryCount: number;
}

export function searchCustomers(tenantId: string, q?: string): Promise<Customer[]> {
  const query = q ? `?q=${encodeURIComponent(q)}` : '';
  return apiFetch<Customer[]>(`/tenants/${tenantId}/customers${query}`);
}

export function getCustomer(tenantId: string, customerId: string): Promise<CustomerDetail> {
  return apiFetch<CustomerDetail>(`/tenants/${tenantId}/customers/${customerId}`);
}

export interface CreateCustomerPayload {
  linkShortCode?: string;
  name?: string;
  phone?: string;
  addressText?: string;
  lat?: number;
  lng?: number;
  notes?: string;
}

export function createCustomer(tenantId: string, payload: CreateCustomerPayload): Promise<Customer> {
  return apiFetch<Customer>(`/tenants/${tenantId}/customers`, {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

export interface UpdateCustomerPayload {
  name?: string;
  phone?: string;
  addressText?: string;
  lat?: number;
  lng?: number;
  notes?: string;
}

export function updateCustomer(
  tenantId: string,
  customerId: string,
  payload: UpdateCustomerPayload,
): Promise<Customer> {
  return apiFetch<Customer>(`/tenants/${tenantId}/customers/${customerId}`, {
    method: 'PATCH',
    body: JSON.stringify(payload),
  });
}
