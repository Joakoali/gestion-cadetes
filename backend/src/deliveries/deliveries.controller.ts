import { Body, Controller, Param, Patch, Post, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { TenantMembershipGuard } from '../tenants/guards/tenant-membership.guard';
import { RolesGuard } from '../tenants/guards/roles.guard';
import { Roles } from '../tenants/decorators/roles.decorator';
import { DeliveriesService } from './deliveries.service';
import { CreateDeliveryDto } from './dto/create-delivery.dto';
import { ReassignDeliveryDto } from './dto/reassign-delivery.dto';

@Controller('tenants/:tenantId/deliveries')
@UseGuards(JwtAuthGuard, TenantMembershipGuard, RolesGuard)
export class DeliveriesController {
  constructor(private readonly deliveriesService: DeliveriesService) {}

  @Post()
  @Roles('ADMIN', 'MOSTRADOR')
  create(
    @Param('tenantId') tenantId: string,
    @CurrentUser() userId: string,
    @Body() dto: CreateDeliveryDto,
  ) {
    return this.deliveriesService.create(tenantId, userId, dto);
  }

  @Patch(':deliveryId/reassign')
  @Roles('ADMIN', 'MOSTRADOR', 'CADETE')
  reassign(
    @Param('tenantId') tenantId: string,
    @Param('deliveryId') deliveryId: string,
    @Body() dto: ReassignDeliveryDto,
  ) {
    return this.deliveriesService.reassign(tenantId, deliveryId, dto);
  }

  @Patch(':deliveryId/cancel')
  @Roles('ADMIN', 'MOSTRADOR', 'CADETE')
  cancel(@Param('tenantId') tenantId: string, @Param('deliveryId') deliveryId: string) {
    return this.deliveriesService.cancel(tenantId, deliveryId);
  }
}
