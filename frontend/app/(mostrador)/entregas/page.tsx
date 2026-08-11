'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTenantId } from '@/lib/auth/tenant';
import { cancelDelivery, DeliveryBoardEntry, listDeliveriesBoard, reassignDelivery } from '@/lib/api/deliveries';
import { listMembers } from '@/lib/api/members';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

export default function EntregasBoardPage() {
  const tenantId = useTenantId();
  const queryClient = useQueryClient();

  const boardQuery = useQuery({
    queryKey: ['deliveries', tenantId, 'board'],
    queryFn: () => listDeliveriesBoard(tenantId as string),
    enabled: !!tenantId,
  });
  const membersQuery = useQuery({
    queryKey: ['members', tenantId],
    queryFn: () => listMembers(tenantId as string),
    enabled: !!tenantId,
  });
  const cadetes = membersQuery.data?.filter((m) => m.role === 'CADETE') ?? [];

  const reassignMutation = useMutation({
    mutationFn: ({ deliveryId, cadeteUserId }: { deliveryId: string; cadeteUserId: string }) =>
      reassignDelivery(tenantId as string, deliveryId, cadeteUserId),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['deliveries', tenantId, 'board'] }),
    onError: () => {
      // Error handling for reassign
    },
  });
  const cancelMutation = useMutation({
    mutationFn: (deliveryId: string) => cancelDelivery(tenantId as string, deliveryId),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['deliveries', tenantId, 'board'] }),
    onError: () => {
      // Error handling for cancel
    },
  });

  if (!tenantId) {
    return null;
  }

  const byCadete = new Map<string, DeliveryBoardEntry[]>();
  for (const delivery of boardQuery.data ?? []) {
    const list = byCadete.get(delivery.cadete.id) ?? [];
    list.push(delivery);
    byCadete.set(delivery.cadete.id, list);
  }

  return (
    <main className="mx-auto flex max-w-2xl flex-col gap-6 p-6">
      <h1 className="text-2xl font-semibold">Entregas en curso</h1>
      {[...byCadete.entries()].map(([cadeteId, deliveries]) => (
        <section key={cadeteId} className="flex flex-col gap-2">
          <h2 className="font-medium">{deliveries[0].cadete.name}</h2>
          {deliveries.map((delivery) => (
            <div key={delivery.id} className="flex items-center justify-between rounded-lg border p-3">
              <div>
                <p className="font-medium">{delivery.customerRecord.name}</p>
                <p className="text-sm text-muted-foreground">{delivery.customerRecord.addressText}</p>
              </div>
              <div className="flex items-center gap-2">
                <Select
                  onValueChange={(cadeteUserId: string | null) => {
                    if (cadeteUserId) {
                      reassignMutation.mutate({ deliveryId: delivery.id, cadeteUserId });
                    }
                  }}
                >
                  <SelectTrigger className="w-40">
                    <SelectValue placeholder="Reasignar a…" />
                  </SelectTrigger>
                  <SelectContent>
                    {cadetes.map((cadete) => (
                      <SelectItem key={cadete.userId} value={cadete.userId}>
                        {cadete.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Button
                  type="button"
                  variant="destructive"
                  size="sm"
                  onClick={() => cancelMutation.mutate(delivery.id)}
                >
                  Cancelar
                </Button>
              </div>
            </div>
          ))}
        </section>
      ))}
      {boardQuery.data?.length === 0 && <p className="text-sm text-muted-foreground">No hay entregas en curso.</p>}
    </main>
  );
}
