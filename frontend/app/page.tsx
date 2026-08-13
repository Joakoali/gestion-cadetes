'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useSession } from '@/lib/auth/session';

export default function RootPage() {
  const session = useSession();
  const router = useRouter();

  useEffect(() => {
    if (session.status === 'anon') {
      router.replace('/login');
    } else if (session.status === 'client') {
      router.replace('/perfil');
    } else if (session.status === 'staff' && session.memberships) {
      if (session.memberships.length === 1) {
        const membership = session.memberships[0];
        const landingPath = membership.role === 'CADETE' ? '/entregas' : '/clientes';
        router.replace(`${landingPath}?tenantId=${membership.tenantId}`);
      } else {
        router.replace('/seleccionar-negocio');
      }
    }
  }, [session, router]);

  if (session.status === 'loading') {
    return null;
  }

  if (session.status === 'error') {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '100vh' }}>
        <div style={{ textAlign: 'center', maxWidth: '400px' }}>
          <h1 style={{ fontSize: '24px', fontWeight: 'bold', marginBottom: '16px' }}>
            Error al cargar la sesión
          </h1>
          <p style={{ fontSize: '16px', color: '#666', marginBottom: '24px' }}>
            No pudimos cargar tu sesión. Intentá recargar la página.
          </p>
          <button
            onClick={() => window.location.reload()}
            style={{
              padding: '10px 20px',
              fontSize: '16px',
              backgroundColor: '#000',
              color: '#fff',
              border: 'none',
              borderRadius: '4px',
              cursor: 'pointer',
            }}
          >
            Recargar
          </button>
        </div>
      </div>
    );
  }

  return null;
}
