import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import { Role } from '@prisma/client';

export const CurrentMembership = createParamDecorator(
  (_: unknown, ctx: ExecutionContext): { tenantId: string; role: Role } => {
    return ctx.switchToHttp().getRequest().membership;
  },
);
