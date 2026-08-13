'use client';

import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { listMembers } from '@/lib/api/members';
import { assignDelivery } from '@/lib/api/deliveries';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

interface AssignDeliveryDialogProps {
  tenantId: string;
  customerId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function AssignDeliveryDialog({ tenantId, customerId, open, onOpenChange }: AssignDeliveryDialogProps) {
  const queryClient = useQueryClient();
  const [cadeteUserId, setCadeteUserId] = useState('');

  const membersQuery = useQuery({
    queryKey: ['members', tenantId],
    queryFn: () => listMembers(tenantId),
    enabled: open,
  });
  const cadetes = membersQuery.data?.filter((m) => m.role === 'CADETE') ?? [];

  const mutation = useMutation({
    mutationFn: () => assignDelivery(tenantId, customerId, cadeteUserId),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['deliveries', tenantId] });
      onOpenChange(false);
      setCadeteUserId('');
      toast('Entrega asignada');
    },
    onError: () => {
      toast.error('Algo salió mal. Intentá de nuevo.');
    },
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Asignar entrega</DialogTitle>
        </DialogHeader>
        {membersQuery.isError && (
          <p className="text-sm text-destructive">No pudimos cargar los cadetes. Intentá de nuevo.</p>
        )}
        <Select value={cadeteUserId || ''} onValueChange={(value) => setCadeteUserId(value || '')}>
          <SelectTrigger>
            <SelectValue placeholder="Elegí un cadete" />
          </SelectTrigger>
          <SelectContent>
            {cadetes.map((cadete) => (
              <SelectItem key={cadete.userId} value={cadete.userId}>
                {cadete.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Button type="button" disabled={!cadeteUserId || mutation.isPending} onClick={() => mutation.mutate()}>
          {mutation.isPending ? 'Asignando…' : 'Asignar'}
        </Button>
      </DialogContent>
    </Dialog>
  );
}
