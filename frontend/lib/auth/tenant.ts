'use client';

import { useRouter, useSearchParams } from 'next/navigation';
import { useEffect } from 'react';

export function useTenantId(): string | null {
  const params = useSearchParams();
  const router = useRouter();
  const tenantId = params.get('tenantId');

  useEffect(() => {
    if (!tenantId) {
      router.replace('/');
    }
  }, [tenantId, router]);

  return tenantId;
}
