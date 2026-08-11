import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { randomBytes } from 'crypto';
import * as bcrypt from 'bcrypt';
import { PrismaService } from '../prisma/prisma.service';
import { AuthService } from '../auth/auth.service';
import { CreateInviteDto } from './dto/create-invite.dto';
import { AcceptInviteDto } from './dto/accept-invite.dto';

const INVITE_TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

@Injectable()
export class InvitesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
    private readonly authService: AuthService,
  ) {}

  async create(tenantId: string, dto: CreateInviteDto) {
    const token = randomBytes(16).toString('hex');
    const invite = await this.prisma.invite.create({
      data: {
        tenantId,
        role: dto.role,
        label: dto.label,
        phone: dto.phone,
        token,
        expiresAt: new Date(Date.now() + INVITE_TTL_MS),
      },
    });
    const frontendOrigin = this.config.getOrThrow<string>('FRONTEND_ORIGIN');
    return {
      id: invite.id,
      url: `${frontendOrigin}/invite/${token}`,
      role: invite.role,
      label: invite.label,
      expiresAt: invite.expiresAt,
    };
  }

  async getByToken(token: string) {
    const invite = await this.findValidInviteOrThrow(token);
    const tenant = await this.prisma.tenant.findUniqueOrThrow({ where: { id: invite.tenantId } });
    return { tenantName: tenant.name, role: invite.role };
  }

  async accept(token: string, dto: AcceptInviteDto) {
    const invite = await this.findValidInviteOrThrow(token);

    const existingPhone = await this.prisma.user.findUnique({ where: { phone: dto.phone } });
    if (existingPhone) {
      throw new ConflictException('Phone already registered');
    }
    if (dto.email) {
      const existingEmail = await this.prisma.user.findUnique({ where: { email: dto.email } });
      if (existingEmail) {
        throw new ConflictException('Email already registered');
      }
    }

    const passwordHash = await bcrypt.hash(dto.password, 10);
    const user = await this.prisma.$transaction(async (tx) => {
      const created = await tx.user.create({
        data: { name: dto.name, phone: dto.phone, email: dto.email, passwordHash },
      });
      await tx.membership.create({
        data: { userId: created.id, tenantId: invite.tenantId, role: invite.role },
      });
      await tx.invite.update({ where: { id: invite.id }, data: { usedAt: new Date() } });
      return created;
    });

    return {
      accessToken: this.authService.signToken(user.id),
      user: { id: user.id, name: user.name, phone: user.phone, email: user.email },
    };
  }

  async listPending(tenantId: string) {
    const invites = await this.prisma.invite.findMany({
      where: { tenantId, usedAt: null, expiresAt: { gt: new Date() } },
      orderBy: { createdAt: 'desc' },
    });
    return invites.map((i) => ({ id: i.id, role: i.role, label: i.label, expiresAt: i.expiresAt }));
  }

  private async findValidInviteOrThrow(token: string) {
    const invite = await this.prisma.invite.findUnique({ where: { token } });
    if (!invite || invite.usedAt || invite.expiresAt < new Date()) {
      throw new NotFoundException('Invalid or expired invite');
    }
    return invite;
  }
}
