import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { UsersService } from '../users/users.service';
import { CreateCustomerDto } from './dto/create-customer.dto';
import { UpdateCustomerDto } from './dto/update-customer.dto';

@Injectable()
export class CustomersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly usersService: UsersService,
  ) {}

  async create(tenantId: string, dto: CreateCustomerDto) {
    if (dto.linkShortCode) {
      const user = await this.usersService.getByShortCode(dto.linkShortCode);
      if (!user || !user.homeAddressText || user.homeLat == null || user.homeLng == null) {
        throw new NotFoundException('Short code not found or user has no location set');
      }
      return this.prisma.customerRecord.create({
        data: {
          tenantId,
          linkedUserId: user.id,
          name: user.name,
          phone: user.phone,
          addressText: user.homeAddressText,
          lat: user.homeLat,
          lng: user.homeLng,
          notes: dto.notes ?? '',
        },
      });
    }

    if (!dto.name || !dto.phone || !dto.addressText || dto.lat == null || dto.lng == null) {
      throw new BadRequestException('name, phone, addressText, lat and lng are required without a link code');
    }

    return this.prisma.customerRecord.create({
      data: {
        tenantId,
        name: dto.name,
        phone: dto.phone,
        addressText: dto.addressText,
        lat: dto.lat,
        lng: dto.lng,
        notes: dto.notes ?? '',
      },
    });
  }

  async search(tenantId: string, q: string | undefined) {
    return this.prisma.customerRecord.findMany({
      where: {
        tenantId,
        ...(q
          ? {
              OR: [
                { name: { contains: q, mode: 'insensitive' } },
                { phone: { contains: q } },
              ],
            }
          : {}),
      },
      take: 20,
      orderBy: { createdAt: 'desc' },
    });
  }

  async findOneOrThrow(tenantId: string, customerId: string) {
    const customer = await this.prisma.customerRecord.findFirst({
      where: { id: customerId, tenantId },
    });
    if (!customer) {
      throw new NotFoundException('Customer not found');
    }
    return customer;
  }

  async findOneWithRating(tenantId: string, customerId: string) {
    const customer = await this.findOneOrThrow(tenantId, customerId);
    const agg = await this.prisma.delivery.aggregate({
      where: { customerRecordId: customer.id, status: 'COMPLETED' },
      _avg: { rating: true },
      _count: { rating: true },
    });
    return {
      ...customer,
      averageRating: agg._avg.rating,
      deliveryCount: agg._count.rating,
    };
  }

  async update(tenantId: string, customerId: string, dto: UpdateCustomerDto) {
    await this.findOneOrThrow(tenantId, customerId);
    return this.prisma.customerRecord.update({
      where: { id: customerId },
      data: dto,
    });
  }
}
