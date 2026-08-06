import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

@Injectable()
export class TenantMembershipGuard implements CanActivate {
  constructor(private readonly prisma: PrismaService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest();
    const tenantId: string | undefined = request.params.tenantId;
    const userId: string | undefined = request.user?.userId;

    if (!tenantId || !userId) {
      throw new ForbiddenException('Missing tenant or user context');
    }

    const membership = await this.prisma.membership.findUnique({
      where: { userId_tenantId: { userId, tenantId } },
    });

    if (!membership) {
      throw new ForbiddenException('Not a member of this tenant');
    }

    request.membership = { tenantId: membership.tenantId, role: membership.role };
    return true;
  }
}
