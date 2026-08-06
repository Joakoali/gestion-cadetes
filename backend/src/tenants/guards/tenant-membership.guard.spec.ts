import { ExecutionContext, ForbiddenException } from '@nestjs/common';
import { TenantMembershipGuard } from './tenant-membership.guard';
import { PrismaService } from '../../prisma/prisma.service';

function mockContext(params: any, user: any): ExecutionContext {
  const request: any = { params, user };
  return {
    switchToHttp: () => ({ getRequest: () => request }),
  } as ExecutionContext;
}

describe('TenantMembershipGuard', () => {
  let prisma: { membership: { findUnique: jest.Mock } };
  let guard: TenantMembershipGuard;

  beforeEach(() => {
    prisma = { membership: { findUnique: jest.fn() } };
    guard = new TenantMembershipGuard(prisma as unknown as PrismaService);
  });

  it('allows access when the user has a membership in the requested tenant', async () => {
    prisma.membership.findUnique.mockResolvedValue({ tenantId: 'tenant-a', role: 'MOSTRADOR' });
    const ctx = mockContext({ tenantId: 'tenant-a' }, { userId: 'user-1' });

    await expect(guard.canActivate(ctx)).resolves.toBe(true);
  });

  it('denies access when the user has no membership in the requested tenant (cross-tenant)', async () => {
    prisma.membership.findUnique.mockResolvedValue(null);
    const ctx = mockContext({ tenantId: 'tenant-b' }, { userId: 'user-1' });

    await expect(guard.canActivate(ctx)).rejects.toThrow(ForbiddenException);
  });
});
