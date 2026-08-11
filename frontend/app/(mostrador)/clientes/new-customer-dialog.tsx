'use client';

import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';
import { createCustomer } from '@/lib/api/customers';
import { ApiError } from '@/lib/api/client';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { LocationPicker } from '@/components/location-picker';

interface NewCustomerDialogProps {
  tenantId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function NewCustomerDialog({ tenantId, open, onOpenChange }: NewCustomerDialogProps) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const [mode, setMode] = useState<'code' | 'manual'>('code');
  const [shortCode, setShortCode] = useState('');
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [addressText, setAddressText] = useState('');
  const [coords, setCoords] = useState<{ lat: number; lng: number } | null>(null);
  const [notes, setNotes] = useState('');
  const [error, setError] = useState<string | null>(null);

  const mutation = useMutation({
    mutationFn: () =>
      mode === 'code'
        ? createCustomer(tenantId, { linkShortCode: shortCode, notes })
        : createCustomer(tenantId, {
            name,
            phone,
            addressText,
            lat: coords!.lat,
            lng: coords!.lng,
            notes,
          }),
    onSuccess: async (customer) => {
      await queryClient.invalidateQueries({ queryKey: ['customers', tenantId] });
      onOpenChange(false);
      router.push(`/clientes/${customer.id}?tenantId=${tenantId}`);
    },
    onError: (err) => {
      setError(
        err instanceof ApiError && mode === 'code'
          ? 'No encontramos ese código. Podés cargar el cliente a mano.'
          : err instanceof ApiError
            ? err.message
            : 'Ocurrió un error, probá de nuevo.',
      );
    },
  });

  const canSubmit = mode === 'code' ? !!shortCode : !!name && !!phone && !!addressText && !!coords;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Nuevo cliente</DialogTitle>
        </DialogHeader>
        <div className="flex gap-2">
          <Button
            type="button"
            variant={mode === 'code' ? 'default' : 'outline'}
            size="sm"
            onClick={() => setMode('code')}
          >
            Por código
          </Button>
          <Button
            type="button"
            variant={mode === 'manual' ? 'default' : 'outline'}
            size="sm"
            onClick={() => setMode('manual')}
          >
            Cargar a mano
          </Button>
        </div>

        {mode === 'code' ? (
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="shortCode">Código del cliente</Label>
            <Input id="shortCode" value={shortCode} onChange={(e) => setShortCode(e.target.value)} />
          </div>
        ) : (
          <div className="flex flex-col gap-3">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="name">Nombre</Label>
              <Input id="name" value={name} onChange={(e) => setName(e.target.value)} />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="phone">Teléfono</Label>
              <Input id="phone" value={phone} onChange={(e) => setPhone(e.target.value)} />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="addressText">Dirección</Label>
              <Input id="addressText" value={addressText} onChange={(e) => setAddressText(e.target.value)} />
            </div>
            <LocationPicker lat={coords?.lat ?? null} lng={coords?.lng ?? null} onChange={setCoords} />
          </div>
        )}

        <div className="flex flex-col gap-1.5">
          <Label htmlFor="notes">Notas</Label>
          <Textarea id="notes" value={notes} onChange={(e) => setNotes(e.target.value)} />
        </div>

        {error && <p className="text-sm text-destructive">{error}</p>}
        <Button type="button" disabled={mutation.isPending || !canSubmit} onClick={() => mutation.mutate()}>
          {mutation.isPending ? 'Guardando…' : 'Guardar cliente'}
        </Button>
      </DialogContent>
    </Dialog>
  );
}
