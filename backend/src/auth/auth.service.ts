import { ConflictException, Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcrypt';
import { User } from '@prisma/client';
import type { Response } from 'express';
import { PrismaService } from '../prisma/prisma.service';
import { RegisterDto } from './dto/register.dto';
import { LoginDto } from './dto/login.dto';

export interface UserProfile {
  id: string;
  name: string;
  phone: string;
  email: string | null;
}

const COOKIE_NAME = 'access_token';
const COOKIE_MAX_AGE_MS = 30 * 24 * 60 * 60 * 1000;

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
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
}
