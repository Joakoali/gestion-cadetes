'use client';

import dynamic from 'next/dynamic';
import { useState } from 'react';
import { Button } from '@/components/ui/button';

const LocationPickerMap = dynamic(() => import('./location-picker-map'), { ssr: false });

export interface LocationPickerProps {
  lat: number | null;
  lng: number | null;
  onChange: (coords: { lat: number; lng: number }) => void;
}

export function LocationPicker({ lat, lng, onChange }: LocationPickerProps) {
  const [geoError, setGeoError] = useState<string | null>(null);

  function useMyLocation() {
    if (!navigator.geolocation) {
      setGeoError('Tu navegador no soporta geolocalización. Marcá el pin manualmente en el mapa.');
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (pos) => onChange({ lat: pos.coords.latitude, lng: pos.coords.longitude }),
      () => setGeoError('No pudimos acceder a tu ubicación. Marcá el pin manualmente en el mapa.'),
    );
  }

  return (
    <div className="flex flex-col gap-2">
      <LocationPickerMap lat={lat} lng={lng} onChange={onChange} />
      <div className="flex items-center justify-between">
        <p className="text-xs text-muted-foreground">Tocá el mapa para fijar o corregir el pin.</p>
        <Button type="button" variant="outline" size="sm" onClick={useMyLocation}>
          Usar mi ubicación
        </Button>
      </div>
      {geoError && <p className="text-sm text-destructive">{geoError}</p>}
    </div>
  );
}
