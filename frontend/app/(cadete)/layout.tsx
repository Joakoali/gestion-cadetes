'use client';

import { useRouter } from 'next/navigation';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { InstallBanner } from '@/components/install-banner';
import { logout } from '@/lib/api/auth';
import { Button } from '@/components/ui/button';

export default function CadeteLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const queryClient = useQueryClient();

  const logoutMutation = useMutation({
    mutationFn: logout,
    onSuccess: () => {
      queryClient.setQueryData(['auth', 'me'], null);
      router.replace('/login');
    },
  });

  return (
    <>
      <InstallBanner />
      <div className="flex justify-end p-4">
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={logoutMutation.isPending}
          onClick={() => logoutMutation.mutate()}
        >
          Cerrar sesión
        </Button>
      </div>
      {children}
    </>
  );
}
