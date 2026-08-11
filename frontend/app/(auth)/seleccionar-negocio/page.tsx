'use client';

import { useRouter } from 'next/navigation';
import { useSession } from '@/lib/auth/session';

export default function SeleccionarNegocioPage() {
  const session = useSession();
  const router = useRouter();

  if (session.status !== 'staff' || !session.memberships) {
    return null;
  }

  return (
    <main className="mx-auto flex min-h-screen max-w-sm flex-col justify-center gap-4 p-6">
      <h1 className="text-2xl font-semibold">Elegí un negocio</h1>
      <ul className="flex flex-col gap-2">
        {session.memberships.map((membership) => (
          <li key={membership.tenantId}>
            <button
              type="button"
              className="w-full rounded-lg border p-3 text-left hover:bg-accent"
              onClick={() => {
                const landingPath = membership.role === 'CADETE' ? '/entregas' : '/clientes';
                router.push(`${landingPath}?tenantId=${membership.tenantId}`);
              }}
            >
              <p className="font-medium">{membership.name}</p>
              <p className="text-sm text-muted-foreground">{membership.role}</p>
            </button>
          </li>
        ))}
      </ul>
    </main>
  );
}
