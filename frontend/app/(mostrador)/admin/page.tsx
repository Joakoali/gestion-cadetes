'use client';

import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTenantId } from '@/lib/auth/tenant';
import { listMembers } from '@/lib/api/members';
import { createInvite, listPendingInvites } from '@/lib/api/invites';
import { Role } from '@/lib/api/tenants';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

const ROLE_LABELS: Record<Role, string> = { ADMIN: 'Admin', MOSTRADOR: 'Mostrador', CADETE: 'Cadete' };

export default function AdminPage() {
  const tenantId = useTenantId();
  const queryClient = useQueryClient();
  const [label, setLabel] = useState('');
  const [role, setRole] = useState<Role>('CADETE');
  const [generatedUrl, setGeneratedUrl] = useState('');

  const membersQuery = useQuery({
    queryKey: ['members', tenantId],
    queryFn: () => listMembers(tenantId as string),
    enabled: !!tenantId,
  });
  const invitesQuery = useQuery({
    queryKey: ['invites', tenantId],
    queryFn: () => listPendingInvites(tenantId as string),
    enabled: !!tenantId,
  });

  const [createError, setCreateError] = useState('');

  const mutation = useMutation({
    mutationFn: () => createInvite(tenantId as string, { role, label: label || undefined }),
    onSuccess: async (invite) => {
      setGeneratedUrl(invite.url);
      setLabel('');
      setCreateError('');
      await queryClient.invalidateQueries({ queryKey: ['invites', tenantId] });
    },
    onError: () => {
      setCreateError('No pudimos generar la invitación. Intentá de nuevo.');
    },
  });

  if (!tenantId) {
    return null;
  }

  return (
    <main className="mx-auto flex max-w-md flex-col gap-8 p-6">
      <section className="flex flex-col gap-3">
        <h1 className="text-2xl font-semibold">Invitar personal</h1>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="label">Nombre (para identificarlo en la lista)</Label>
          <Input id="label" value={label} onChange={(e) => setLabel(e.target.value)} />
        </div>
        <Select value={role} onValueChange={(value) => setRole(value as Role)}>
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="CADETE">Cadete</SelectItem>
            <SelectItem value="MOSTRADOR">Mostrador</SelectItem>
            <SelectItem value="ADMIN">Admin</SelectItem>
          </SelectContent>
        </Select>
        <Button type="button" disabled={mutation.isPending} onClick={() => mutation.mutate()}>
          {mutation.isPending ? 'Generando…' : 'Generar invitación'}
        </Button>
        {createError && (
          <p className="text-sm text-destructive">{createError}</p>
        )}
        {generatedUrl && (
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="generatedUrl">Mandale este link por WhatsApp</Label>
            <Input id="generatedUrl" readOnly value={generatedUrl} onFocus={(e) => e.target.select()} />
          </div>
        )}
      </section>

      <section className="flex flex-col gap-2">
        <h2 className="text-lg font-medium">Invitaciones pendientes</h2>
        {invitesQuery.isError && (
          <p className="text-sm text-destructive">No pudimos cargar las invitaciones. Intentá de nuevo.</p>
        )}
        {invitesQuery.data?.length === 0 && <p className="text-sm text-muted-foreground">Ninguna.</p>}
        {invitesQuery.data?.map((invite) => (
          <div key={invite.id} className="rounded-lg border p-3 text-sm">
            {invite.label ?? 'Sin nombre'} — {ROLE_LABELS[invite.role]}
          </div>
        ))}
      </section>

      <section className="flex flex-col gap-2">
        <h2 className="text-lg font-medium">Miembros</h2>
        {membersQuery.isError && (
          <p className="text-sm text-destructive">No pudimos cargar los miembros. Intentá de nuevo.</p>
        )}
        {membersQuery.data?.map((member) => (
          <div key={member.userId} className="rounded-lg border p-3 text-sm">
            {member.name} — {ROLE_LABELS[member.role]}
          </div>
        ))}
      </section>
    </main>
  );
}
