import { Injectable } from '@nestjs/common';
import { User } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { UpdateLocationDto } from './dto/update-location.dto';

const CODE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

@Injectable()
export class UsersService {
  constructor(private readonly prisma: PrismaService) {}

  async ensureShortCode(userId: string): Promise<string> {
    const user = await this.prisma.user.findUniqueOrThrow({ where: { id: userId } });
    if (user.shortCode) {
      return user.shortCode;
    }

    let code: string;
    do {
      code = this.randomCode();
    } while (await this.prisma.user.findUnique({ where: { shortCode: code } }));

    await this.prisma.user.update({ where: { id: userId }, data: { shortCode: code } });
    return code;
  }

  async updateLocation(userId: string, dto: UpdateLocationDto) {
    const user = await this.prisma.user.update({
      where: { id: userId },
      data: { homeAddressText: dto.addressText, homeLat: dto.lat, homeLng: dto.lng },
    });
    return { addressText: user.homeAddressText, lat: user.homeLat, lng: user.homeLng };
  }

  async getByShortCode(code: string): Promise<User | null> {
    return this.prisma.user.findUnique({ where: { shortCode: code } });
  }

  private randomCode(): string {
    let code = '';
    for (let i = 0; i < 6; i++) {
      code += CODE_CHARS[Math.floor(Math.random() * CODE_CHARS.length)];
    }
    return code;
  }
}
