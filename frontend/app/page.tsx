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
        router.replace('/seleccionar-rotiseria');
      }
    }
  }, [session, router]);

  return null;
}
