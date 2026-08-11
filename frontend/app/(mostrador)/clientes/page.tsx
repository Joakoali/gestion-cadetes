'use client';

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import Link from 'next/link';
import { useTenantId } from '@/lib/auth/tenant';
import { searchCustomers } from '@/lib/api/customers';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { NewCustomerDialog } from './new-customer-dialog';

export default function ClientesPage() {
  const tenantId = useTenantId();
  const [q, setQ] = useState('');
  const [dialogOpen, setDialogOpen] = useState(false);

  const customersQuery = useQuery({
    queryKey: ['customers', tenantId, q],
    queryFn: () => searchCustomers(tenantId as string, q),
    enabled: !!tenantId,
  });

  if (!tenantId) {
    return null;
  }

  return (
    <main className="mx-auto flex max-w-md flex-col gap-4 p-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Clientes</h1>
        <Button onClick={() => setDialogOpen(true)}>Nuevo cliente</Button>
      </div>
      <Input
        placeholder="Buscar por teléfono, nombre o código"
        value={q}
        onChange={(e) => setQ(e.target.value)}
      />
      <ul className="flex flex-col gap-2">
        {customersQuery.data?.map((customer) => (
          <li key={customer.id}>
            <Link
              href={`/clientes/${customer.id}?tenantId=${tenantId}`}
              className="block rounded-lg border p-3 hover:bg-accent"
            >
              <p className="font-medium">{customer.name}</p>
              <p className="text-sm text-muted-foreground">{customer.phone}</p>
            </Link>
          </li>
        ))}
      </ul>
      <NewCustomerDialog tenantId={tenantId} open={dialogOpen} onOpenChange={setDialogOpen} />
    </main>
  );
}
