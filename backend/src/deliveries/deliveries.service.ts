import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { PrismaService } from '../prisma/prisma.service';
import { CustomersService } from '../customers/customers.service';
import { CreateDeliveryDto } from './dto/create-delivery.dto';
import { ReassignDeliveryDto } from './dto/reassign-delivery.dto';
import { CompleteDeliveryDto } from './dto/complete-delivery.dto';

@Injectable()
export class DeliveriesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly customersService: CustomersService,
    private readonly events: EventEmitter2,
  ) {}

  async create(tenantId: string, assignedByUserId: string, dto: CreateDeliveryDto) {
    await this.customersService.findOneOrThrow(tenantId, dto.customerRecordId);
    await this.assertIsCadete(tenantId, dto.cadeteUserId);

    const delivery = await this.prisma.delivery.create({
      data: {
        tenantId,
        customerRecordId: dto.customerRecordId,
        cadeteUserId: dto.cadeteUserId,
        assignedByUserId,
      },
    });

    this.events.emit('delivery.assigned', { deliveryId: delivery.id, cadeteUserId: delivery.cadeteUserId });
    return delivery;
  }

  async reassign(tenantId: string, deliveryId: string, dto: ReassignDeliveryDto) {
    const delivery = await this.findAssignedOrThrow(tenantId, deliveryId);
    await this.assertIsCadete(tenantId, dto.cadeteUserId);

    const updated = await this.prisma.delivery.update({
      where: { id: delivery.id },
      data: { cadeteUserId: dto.cadeteUserId },
    });

    this.events.emit('delivery.assigned', { deliveryId: updated.id, cadeteUserId: updated.cadeteUserId });
    return updated;
  }

  async cancel(tenantId: string, deliveryId: string) {
    const delivery = await this.findAssignedOrThrow(tenantId, deliveryId);
    return this.prisma.delivery.update({
      where: { id: delivery.id },
      data: { status: 'CANCELLED' },
    });
  }

  async complete(tenantId: string, deliveryId: string, dto: CompleteDeliveryDto) {
    const delivery = await this.findAssignedOrThrow(tenantId, deliveryId);
    return this.prisma.delivery.update({
      where: { id: delivery.id },
      data: {
        status: 'COMPLETED',
        rating: dto.rating,
        ratingNote: dto.ratingNote,
        completedAt: new Date(),
      },
    });
  }

  async listMine(tenantId: string, cadeteUserId: string) {
    return this.prisma.delivery.findMany({
      where: { tenantId, cadeteUserId, status: 'ASSIGNED' },
      include: { customerRecord: true },
      orderBy: { createdAt: 'asc' },
    });
  }

  async findAssignedOrThrow(tenantId: string, deliveryId: string) {
    const delivery = await this.prisma.delivery.findFirst({
      where: { id: deliveryId, tenantId },
    });
    if (!delivery) {
      throw new NotFoundException('Delivery not found');
    }
    if (delivery.status !== 'ASSIGNED') {
      throw new BadRequestException('Only ASSIGNED deliveries can be modified');
    }
    return delivery;
  }

  private async assertIsCadete(tenantId: string, userId: string) {
    const membership = await this.prisma.membership.findUnique({
      where: { userId_tenantId: { userId, tenantId } },
    });
    if (!membership || membership.role !== 'CADETE') {
      throw new BadRequestException('cadeteUserId must belong to a CADETE member of this tenant');
    }
  }
}
