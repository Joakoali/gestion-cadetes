import { Body, Controller, Get, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { TenantMembershipGuard } from '../tenants/guards/tenant-membership.guard';
import { CustomersService } from './customers.service';
import { CreateCustomerDto } from './dto/create-customer.dto';
import { UpdateCustomerDto } from './dto/update-customer.dto';

@Controller('tenants/:tenantId/customers')
@UseGuards(JwtAuthGuard, TenantMembershipGuard)
export class CustomersController {
  constructor(private readonly customersService: CustomersService) {}

  @Post()
  create(@Param('tenantId') tenantId: string, @Body() dto: CreateCustomerDto) {
    return this.customersService.create(tenantId, dto);
  }

  @Get()
  search(@Param('tenantId') tenantId: string, @Query('q') q?: string) {
    return this.customersService.search(tenantId, q);
  }

  @Get(':customerId')
  findOne(@Param('tenantId') tenantId: string, @Param('customerId') customerId: string) {
    return this.customersService.findOneWithRating(tenantId, customerId);
  }

  @Patch(':customerId')
  update(
    @Param('tenantId') tenantId: string,
    @Param('customerId') customerId: string,
    @Body() dto: UpdateCustomerDto,
  ) {
    return this.customersService.update(tenantId, customerId, dto);
  }
}
