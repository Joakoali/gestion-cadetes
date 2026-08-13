import { ConflictException, Injectable, NotFoundException, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import * as bcrypt from 'bcrypt';
import { randomBytes } from 'crypto';
import { User } from '@prisma/client';
import type { Response } from 'express';
import { PrismaService } from '../prisma/prisma.service';
import { MailService } from '../mail/mail.service';
import { RegisterDto } from './dto/register.dto';
import { LoginDto } from './dto/login.dto';
import { ForgotPasswordDto } from './dto/forgot-password.dto';
import { ResetPasswordDto } from './dto/reset-password.dto';

export interface UserProfile {
  id: string;
  name: string;
  phone: string;
  email: string | null;
}

const COOKIE_NAME = 'access_token';
const COOKIE_MAX_AGE_MS = 30 * 24 * 60 * 60 * 1000;
const RESET_TOKEN_TTL_MS = 60 * 60 * 1000; // 1 hour

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
    private readonly mail: MailService,
    private readonly config: ConfigService,
  ) {}

  attachSessionCookie(res: Response, accessToken: string): void {
    res.cookie(COOKIE_NAME, accessToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: process.env.NODE_ENV === 'production' ? 'none' : 'lax',
      maxAge: COOKIE_MAX_AGE_MS,
    });
  }

  clearSessionCookie(res: Response): void {
    res.clearCookie(COOKIE_NAME);
  }

  async register(dto: RegisterDto): Promise<{ accessToken: string; user: UserProfile }> {
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
    const user = await this.prisma.user.create({
      data: { name: dto.name, phone: dto.phone, email: dto.email, passwordHash },
    });

    return { accessToken: this.signToken(user.id), user: this.toProfile(user) };
  }

  async login(dto: LoginDto): Promise<{ accessToken: string; user: UserProfile }> {
    const user = await this.prisma.user.findUnique({ where: { phone: dto.phone } });
    if (!user) {
      throw new UnauthorizedException('Invalid credentials');
    }

    const valid = await bcrypt.compare(dto.password, user.passwordHash);
    if (!valid) {
      throw new UnauthorizedException('Invalid credentials');
    }

    return { accessToken: this.signToken(user.id), user: this.toProfile(user) };
  }

  async validateUserById(userId: string): Promise<{ id: string } | null> {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    return user ? { id: user.id } : null;
  }

  async getProfile(userId: string): Promise<UserProfile> {
    const user = await this.prisma.user.findUniqueOrThrow({ where: { id: userId } });
    return this.toProfile(user);
  }

  signToken(userId: string): string {
    return this.jwt.sign({ sub: userId });
  }

  private toProfile(user: User): UserProfile {
    return { id: user.id, name: user.name, phone: user.phone, email: user.email };
  }

  async forgotPassword(dto: ForgotPasswordDto): Promise<{ ok: true }> {
    const user = await this.prisma.user.findUnique({ where: { email: dto.email } });
    if (user) {
      const token = randomBytes(32).toString('hex');
      await this.prisma.passwordResetToken.create({
        data: { userId: user.id, token, expiresAt: new Date(Date.now() + RESET_TOKEN_TTL_MS) },
      });
      const frontendOrigin = this.config.getOrThrow<string>('FRONTEND_ORIGIN');
      const resetUrl = `${frontendOrigin}/reset-password/${token}`;
      await this.mail.sendPasswordReset(dto.email, resetUrl);
    }
    return { ok: true };
  }

  async validateResetToken(token: string): Promise<{ valid: true }> {
    await this.findValidResetTokenOrThrow(token);
    return { valid: true };
  }

  async resetPassword(token: string, dto: ResetPasswordDto): Promise<{ ok: true }> {
    const resetToken = await this.findValidResetTokenOrThrow(token);
    const passwordHash = await bcrypt.hash(dto.password, 10);
    await this.prisma.$transaction(async (tx) => {
      // Conditional update, not update-by-id: the atomic guard against a
      // check-then-act race where two concurrent resets on the same token
      // both pass findValidResetTokenOrThrow before either marks it used.
      // The loser sees count === 0 and fails fast before touching the
      // user's password.
      const result = await tx.passwordResetToken.updateMany({
        where: { id: resetToken.id, usedAt: null },
        data: { usedAt: new Date() },
      });
      if (result.count === 0) {
        throw new NotFoundException('Invalid or expired reset token');
      }
      await tx.user.update({ where: { id: resetToken.userId }, data: { passwordHash } });
    });
    return { ok: true };
  }

  private async findValidResetTokenOrThrow(token: string) {
    const resetToken = await this.prisma.passwordResetToken.findUnique({ where: { token } });
    if (!resetToken || resetToken.usedAt || resetToken.expiresAt < new Date()) {
      throw new NotFoundException('Invalid or expired reset token');
    }
    return resetToken;
  }
}
