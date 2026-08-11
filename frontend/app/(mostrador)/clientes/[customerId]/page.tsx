'use client';

import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useParams } from 'next/navigation';
import { useTenantId } from '@/lib/auth/tenant';
import { getCustomer, updateCustomer } from '@/lib/api/customers';
import { LocationPicker } from '@/components/location-picker';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';

export default function CustomerDetailPage() {
  const tenantId = useTenantId();
  const { customerId } = useParams<{ customerId: string }>();
  const queryClient = useQueryClient();
  const customerQuery = useQuery({
    queryKey: ['customers', tenantId, customerId],
    queryFn: () => getCustomer(tenantId as string, customerId),
    enabled: !!tenantId,
  });

  const [notes, setNotes] = useState('');
  const [coords, setCoords] = useState<{ lat: number; lng: number } | null>(null);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    if (customerQuery.data) {
      setNotes(customerQuery.data.notes);
      setCoords({ lat: customerQuery.data.lat, lng: customerQuery.data.lng });
    }
  }, [customerQuery.data]);

  const mutation = useMutation({
    mutationFn: () =>
      updateCustomer(tenantId as string, customerId, { notes, lat: coords?.lat, lng: coords?.lng }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['customers', tenantId, customerId] });
      setSaved(true);
    },
  });

  if (!tenantId || !customerQuery.data) {
    return null;
  }

  const customer = customerQuery.data;

  return (
    <main className="mx-auto flex max-w-md flex-col gap-4 p-6">
      <div>
        <h1 className="text-2xl font-semibold">{customer.name}</h1>
        <p className="text-sm text-muted-foreground">{customer.phone}</p>
        <p className="text-sm text-muted-foreground">{customer.addressText}</p>
      </div>

      <div className="flex gap-4 text-sm">
        <p>
          Promedio: <strong>{customer.averageRating != null ? customer.averageRating.toFixed(1) : 'Sin datos'}</strong>
        </p>
        <p>
          Entregas: <strong>{customer.deliveryCount}</strong>
        </p>
      </div>

      <LocationPicker lat={coords?.lat ?? null} lng={coords?.lng ?? null} onChange={setCoords} />

      <div className="flex flex-col gap-1.5">
        <label htmlFor="notes" className="text-sm font-medium">
          Notas
        </label>
        <Textarea id="notes" value={notes} onChange={(e) => setNotes(e.target.value)} />
      </div>

      <Button type="button" disabled={mutation.isPending} onClick={() => mutation.mutate()}>
        {mutation.isPending ? 'Guardando…' : 'Guardar notas'}
      </Button>
      {saved && <p className="text-sm text-muted-foreground">Cambios guardados.</p>}
    </main>
  );
}
