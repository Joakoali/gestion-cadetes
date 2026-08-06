import { ConflictException, Injectable } from '@nestjs/common';
import * as bcrypt from 'bcrypt';
import { randomBytes } from 'crypto';
import { PrismaService } from '../prisma/prisma.service';
import { CreateTenantDto } from './dto/create-tenant.dto';
import { InviteMemberDto } from './dto/invite-member.dto';

@Injectable()
export class TenantsService {
  constructor(private readonly prisma: PrismaService) {}

  async create(userId: string, dto: CreateTenantDto) {
    return this.prisma.tenant.create({
      data: {
        name: dto.name,
        contactInfo: dto.contactInfo,
        memberships: { create: { userId, role: 'ADMIN' } },
      },
    });
  }

  async listMyMemberships(userId: string) {
    const memberships = await this.prisma.membership.findMany({
      where: { userId },
      include: { tenant: true },
    });
    return memberships.map((m) => ({
      tenantId: m.tenantId,
      name: m.tenant.name,
      role: m.role,
    }));
  }

  async inviteMember(tenantId: string, dto: InviteMemberDto) {
    let user = await this.prisma.user.findUnique({ where: { phone: dto.phone } });
    let temporaryPassword: string | undefined;

    if (!user) {
      temporaryPassword = randomBytes(4).toString('hex');
      const passwordHash = await bcrypt.hash(temporaryPassword, 10);
      user = await this.prisma.user.create({
        data: { name: dto.name, phone: dto.phone, passwordHash },
      });
    }

    const existingMembership = await this.prisma.membership.findUnique({
      where: { userId_tenantId: { userId: user.id, tenantId } },
    });
    if (existingMembership) {
      throw new ConflictException('User is already a member of this tenant');
    }

    await this.prisma.membership.create({
      data: { userId: user.id, tenantId, role: dto.role },
    });

    return { userId: user.id, role: dto.role, temporaryPassword };
  }
}
