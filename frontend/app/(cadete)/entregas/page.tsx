'use client';

import { useQuery } from '@tanstack/react-query';
import Link from 'next/link';
import { useTenantId } from '@/lib/auth/tenant';
import { listMyDeliveries } from '@/lib/api/deliveries';

export default function CadeteEntregasPage() {
  const tenantId = useTenantId();
  const deliveriesQuery = useQuery({
    queryKey: ['deliveries', 'mine', tenantId],
    queryFn: () => listMyDeliveries(tenantId as string),
    enabled: !!tenantId,
  });

  if (!tenantId) {
    return null;
  }

  return (
    <main className="mx-auto flex max-w-md flex-col gap-4 p-6">
      <h1 className="text-2xl font-semibold">Mis entregas</h1>
      {deliveriesQuery.isError && (
        <p className="text-sm text-destructive">No pudimos cargar tus entregas. Intentá de nuevo.</p>
      )}
      {!deliveriesQuery.isError && (
        <>
          {deliveriesQuery.data?.length === 0 && (
            <p className="text-sm text-muted-foreground">No tenés entregas asignadas.</p>
          )}
          <ul className="flex flex-col gap-2">
            {deliveriesQuery.data?.map((delivery) => (
              <li key={delivery.id}>
                <Link
                  href={`/entregas/${delivery.id}?tenantId=${tenantId}`}
                  className="block rounded-lg border p-3 hover:bg-accent"
                >
                  <p className="font-medium">{delivery.customerRecord.name}</p>
                  <p className="text-sm text-muted-foreground">{delivery.customerRecord.addressText}</p>
                </Link>
              </li>
            ))}
          </ul>
        </>
      )}
    </main>
  );
}
