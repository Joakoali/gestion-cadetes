'use client';

import { useState } from 'react';
import { useMutation, useQuery } from '@tanstack/react-query';
import { useSession } from '@/lib/auth/session';
import { ensureShortCode, updateMyLocation } from '@/lib/api/users';
import { LocationPicker } from '@/components/location-picker';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

export default function PerfilPage() {
  const session = useSession();
  const shortCodeQuery = useQuery({ queryKey: ['users', 'me', 'short-code'], queryFn: ensureShortCode });
  const [addressText, setAddressText] = useState('');
  const [coords, setCoords] = useState<{ lat: number; lng: number } | null>(null);
  const [saved, setSaved] = useState(false);
  const [locationError, setLocationError] = useState<string | null>(null);

  const mutation = useMutation({
    mutationFn: () => updateMyLocation({ addressText, lat: coords!.lat, lng: coords!.lng }),
    onSuccess: () => {
      setLocationError(null);
      setSaved(true);
    },
    onError: () => {
      setLocationError('Algo salió mal. Intentá de nuevo.');
    },
  });

  async function share() {
    const code = shortCodeQuery.data?.shortCode;
    if (!code) return;
    const text = `Mi código en Gestión de Cadetes: ${code}`;
    if (navigator.share) {
      await navigator.share({ text });
    } else {
      await navigator.clipboard.writeText(code);
    }
  }

  if (session.status === 'loading') {
    return null;
  }

  return (
    <main className="mx-auto flex max-w-md flex-col gap-6 p-6">
      <div>
        <h1 className="text-2xl font-semibold">{session.user?.name}</h1>
        <p className="text-sm text-muted-foreground">{session.user?.phone}</p>
      </div>

      <div className="rounded-lg border p-4 text-center">
        <p className="text-sm text-muted-foreground">Tu código</p>
        <p className="text-3xl font-bold tracking-widest">{shortCodeQuery.data?.shortCode ?? '······'}</p>
        <Button type="button" variant="outline" size="sm" className="mt-2" onClick={share}>
          Compartir
        </Button>
      </div>

      <div className="flex flex-col gap-3">
        <h2 className="text-lg font-medium">Mi ubicación</h2>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="addressText">Dirección</Label>
          <Input id="addressText" value={addressText} onChange={(e) => setAddressText(e.target.value)} />
        </div>
        <LocationPicker lat={coords?.lat ?? null} lng={coords?.lng ?? null} onChange={setCoords} />
        <Button
          type="button"
          disabled={!addressText || !coords || mutation.isPending}
          onClick={() => mutation.mutate()}
        >
          {mutation.isPending ? 'Guardando…' : 'Guardar ubicación'}
        </Button>
        {locationError && <p className="text-sm text-destructive">{locationError}</p>}
        {saved && <p className="text-sm text-muted-foreground">Ubicación guardada.</p>}
      </div>
    </main>
  );
}
