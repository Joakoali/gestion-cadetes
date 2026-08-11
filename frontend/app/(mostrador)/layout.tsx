'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useSession } from '@/lib/auth/session';
import { useTenantId } from '@/lib/auth/tenant';
import { logout } from '@/lib/api/auth';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';

export default function MostradorLayout({ children }: { children: React.ReactNode }) {
  const session = useSession();
  const tenantId = useTenantId();
  const router = useRouter();
  const queryClient = useQueryClient();

  const logoutMutation = useMutation({
    mutationFn: logout,
    onSuccess: () => {
      queryClient.setQueryData(['auth', 'me'], null);
      router.replace('/login');
    },
  });

  const currentMembership = session.memberships?.find((m) => m.tenantId === tenantId);
  const isAdmin = currentMembership?.role === 'ADMIN';

  if (!tenantId) {
    return <>{children}</>;
  }

  return (
    <>
      <nav className="flex items-center justify-between gap-4 border-b p-4">
        <div className="flex items-center gap-4">
          <Link href={`/clientes?tenantId=${tenantId}`} className="text-sm font-medium hover:underline">
            Clientes
          </Link>
          <Link href={`/tablero?tenantId=${tenantId}`} className="text-sm font-medium hover:underline">
            Tablero
          </Link>
          {isAdmin && (
            <Link href={`/admin?tenantId=${tenantId}`} className="text-sm font-medium hover:underline">
              Admin
            </Link>
          )}
        </div>
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={logoutMutation.isPending}
          onClick={() => logoutMutation.mutate()}
        >
          Cerrar sesión
        </Button>
      </nav>
      <Separator />
      {children}
    </>
  );
}
