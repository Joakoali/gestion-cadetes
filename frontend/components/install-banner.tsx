'use client';

import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { isPwaInstalled, requestNotificationPermission, subscribeToPush } from '@/lib/push';

function detectPlatform(): 'ios' | 'android' | 'other' {
  if (typeof navigator === 'undefined') {
    return 'other';
  }
  const ua = navigator.userAgent;
  if (/iphone|ipad|ipod/i.test(ua)) {
    return 'ios';
  }
  if (/android/i.test(ua)) {
    return 'android';
  }
  return 'other';
}

export function InstallBanner() {
  const [installed, setInstalled] = useState<boolean | null>(null);
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    const isInstalled = isPwaInstalled();
    setInstalled(isInstalled);
    if (!isInstalled) {
      return;
    }
    requestNotificationPermission()
      .then((permission) => {
        if (permission === 'granted') {
          subscribeToPush();
        }
      })
      .catch(() => {
        // best-effort background enhancement, no user-facing UI needed
      });
  }, []);

  if (installed === null || installed || dismissed) {
    return null;
  }

  const platform = detectPlatform();
  const instructions =
    platform === 'ios'
      ? 'Tocá el botón "Compartir" de Safari y elegí "Agregar a pantalla de inicio".'
      : platform === 'android'
        ? 'Tocá el menú (⋮) de Chrome y elegí "Instalar app" o "Agregar a pantalla de inicio".'
        : 'Instalá la app desde el menú de tu navegador para recibir notificaciones de entregas.';

  return (
    <div className="flex items-center justify-between gap-3 bg-primary p-3 text-sm text-primary-foreground">
      <p>{instructions}</p>
      <Button type="button" variant="secondary" size="sm" onClick={() => setDismissed(true)}>
        Ahora no
      </Button>
    </div>
  );
}
