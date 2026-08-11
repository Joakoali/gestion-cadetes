'use client';

import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useParams, useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { useTenantId } from '@/lib/auth/tenant';
import { cancelDelivery, completeDelivery, listMyDeliveries } from '@/lib/api/deliveries';
import { updateCustomer } from '@/lib/api/customers';
import { LocationPicker } from '@/components/location-picker';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Textarea } from '@/components/ui/textarea';

export default function CadeteDeliveryDetailPage() {
  const tenantId = useTenantId();
  const { deliveryId } = useParams<{ deliveryId: string }>();
  const router = useRouter();
  const queryClient = useQueryClient();

  const deliveriesQuery = useQuery({
    queryKey: ['deliveries', 'mine', tenantId],
    queryFn: () => listMyDeliveries(tenantId as string),
    enabled: !!tenantId,
  });
  const delivery = deliveriesQuery.data?.find((d) => d.id === deliveryId);

  const [coords, setCoords] = useState<{ lat: number; lng: number } | null>(null);
  const [completeOpen, setCompleteOpen] = useState(false);
  const [rating, setRating] = useState(5);
  const [ratingNote, setRatingNote] = useState('');

  const pinMutation = useMutation({
    mutationFn: () =>
      updateCustomer(tenantId as string, delivery!.customerRecord.id, { lat: coords!.lat, lng: coords!.lng }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['deliveries', 'mine', tenantId] });
      setCoords(null);
    },
    onError: () => {
      toast.error('No se pudo guardar el pin. Intentá de nuevo.');
    },
  });

  const completeMutation = useMutation({
    mutationFn: () => completeDelivery(tenantId as string, deliveryId, rating, ratingNote || undefined),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['deliveries', 'mine', tenantId] });
      router.push(`/entregas?tenantId=${tenantId}`);
    },
    onError: () => {
      toast.error('No se pudo completar la entrega. Intentá de nuevo.');
    },
  });

  const cancelMutation = useMutation({
    mutationFn: () => cancelDelivery(tenantId as string, deliveryId),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['deliveries', 'mine', tenantId] });
      router.push(`/entregas?tenantId=${tenantId}`);
    },
    onError: () => {
      toast.error('No se pudo cancelar la entrega. Intentá de nuevo.');
    },
  });

  if (!tenantId || !delivery) {
    return null;
  }

  const pinCoords = coords ?? { lat: delivery.customerRecord.lat, lng: delivery.customerRecord.lng };

  return (
    <main className="mx-auto flex max-w-md flex-col gap-4 p-6">
      <div>
        <h1 className="text-2xl font-semibold">{delivery.customerRecord.name}</h1>
        <p className="text-sm text-muted-foreground">{delivery.customerRecord.addressText}</p>
        {delivery.customerRecord.notes && (
          <p className="mt-2 rounded-md bg-muted p-2 text-sm">{delivery.customerRecord.notes}</p>
        )}
      </div>

      <LocationPicker lat={pinCoords.lat} lng={pinCoords.lng} onChange={setCoords} />
      {coords && (
        <Button type="button" variant="outline" size="sm" onClick={() => pinMutation.mutate()}>
          {pinMutation.isPending ? 'Guardando pin…' : 'Corregir pin'}
        </Button>
      )}

      <div className="flex gap-2">
        <Button type="button" onClick={() => setCompleteOpen(true)}>
          Completar
        </Button>
        <Button type="button" variant="destructive" onClick={() => cancelMutation.mutate()}>
          {cancelMutation.isPending ? 'Cancelando…' : 'Cancelar'}
        </Button>
      </div>

      <Dialog open={completeOpen} onOpenChange={setCompleteOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Completar entrega</DialogTitle>
          </DialogHeader>
          <div className="flex gap-1">
            {[1, 2, 3, 4, 5].map((value) => (
              <button
                key={value}
                type="button"
                aria-label={`${value} estrellas`}
                aria-pressed={rating === value}
                onClick={() => setRating(value)}
                className={`h-8 w-8 rounded ${rating >= value ? 'bg-yellow-400' : 'bg-muted'}`}
              />
            ))}
          </div>
          <Textarea
            placeholder="Nota (opcional)"
            value={ratingNote}
            onChange={(e) => setRatingNote(e.target.value)}
          />
          <Button type="button" disabled={completeMutation.isPending} onClick={() => completeMutation.mutate()}>
            {completeMutation.isPending ? 'Guardando…' : 'Confirmar'}
          </Button>
        </DialogContent>
      </Dialog>
    </main>
  );
}
