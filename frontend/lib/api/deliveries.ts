import { apiFetch } from './client';

export type DeliveryStatus = 'ASSIGNED' | 'COMPLETED' | 'CANCELLED';

export interface DeliverySummary {
  id: string;
  tenantId: string;
  customerRecordId: string;
  cadeteUserId: string;
  assignedByUserId: string;
  status: DeliveryStatus;
  rating: number | null;
  ratingNote: string | null;
  createdAt: string;
  completedAt: string | null;
}

interface CustomerSnapshot {
  id: string;
  name: string;
  phone: string;
  addressText: string;
  lat: number;
  lng: number;
  notes: string;
}

export interface DeliveryWithCustomer extends DeliverySummary {
  customerRecord: CustomerSnapshot;
}

export interface DeliveryBoardEntry extends DeliveryWithCustomer {
  cadete: { id: string; name: string; phone: string };
}

export function assignDelivery(tenantId: string, customerRecordId: string, cadeteUserId: string) {
  return apiFetch<DeliverySummary>(`/tenants/${tenantId}/deliveries`, {
    method: 'POST',
    body: JSON.stringify({ customerRecordId, cadeteUserId }),
  });
}

export function listDeliveriesBoard(tenantId: string, status: DeliveryStatus = 'ASSIGNED') {
  return apiFetch<DeliveryBoardEntry[]>(`/tenants/${tenantId}/deliveries?status=${status}`);
}

export function reassignDelivery(tenantId: string, deliveryId: string, cadeteUserId: string) {
  return apiFetch<DeliverySummary>(`/tenants/${tenantId}/deliveries/${deliveryId}/reassign`, {
    method: 'PATCH',
    body: JSON.stringify({ cadeteUserId }),
  });
}

export function cancelDelivery(tenantId: string, deliveryId: string) {
  return apiFetch<DeliverySummary>(`/tenants/${tenantId}/deliveries/${deliveryId}/cancel`, {
    method: 'PATCH',
  });
}

export function completeDelivery(tenantId: string, deliveryId: string, rating: number, ratingNote?: string) {
  return apiFetch<DeliverySummary>(`/tenants/${tenantId}/deliveries/${deliveryId}/complete`, {
    method: 'PATCH',
    body: JSON.stringify({ rating, ratingNote }),
  });
}

export function listMyDeliveries(tenantId: string) {
  return apiFetch<DeliveryWithCustomer[]>(`/tenants/${tenantId}/deliveries/mine`);
}
