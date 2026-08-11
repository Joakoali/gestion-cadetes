'use client';

import { useQuery } from '@tanstack/react-query';
import { getMe, UserProfile } from '../api/auth';
import { getMyMemberships, Membership } from '../api/tenants';

export type SessionStatus = 'loading' | 'anon' | 'client' | 'staff';

export interface Session {
  status: SessionStatus;
  user?: UserProfile;
  memberships?: Membership[];
}

export function useSession(): Session {
  const meQuery = useQuery({ queryKey: ['auth', 'me'], queryFn: getMe });
  const membershipsQuery = useQuery({
    queryKey: ['tenants', 'mine'],
    queryFn: getMyMemberships,
    enabled: !!meQuery.data,
  });

  if (meQuery.isLoading) {
    return { status: 'loading' };
  }
  if (!meQuery.data) {
    return { status: 'anon' };
  }
  if (membershipsQuery.isLoading || !membershipsQuery.data) {
    return { status: 'loading', user: meQuery.data };
  }

  return {
    status: membershipsQuery.data.length > 0 ? 'staff' : 'client',
    user: meQuery.data,
    memberships: membershipsQuery.data,
  };
}
