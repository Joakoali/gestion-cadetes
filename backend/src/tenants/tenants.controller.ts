import { Body, Controller, Get, Param, Post, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { TenantMembershipGuard } from './guards/tenant-membership.guard';
import { RolesGuard } from './guards/roles.guard';
import { Roles } from './decorators/roles.decorator';
import { TenantsService } from './tenants.service';
import { CreateTenantDto } from './dto/create-tenant.dto';
import { InviteMemberDto } from './dto/invite-member.dto';

@Controller()
@UseGuards(JwtAuthGuard)
export class TenantsController {
  constructor(private readonly tenantsService: TenantsService) {}

  @Post('tenants')
  create(@CurrentUser() userId: string, @Body() dto: CreateTenantDto) {
    return this.tenantsService.create(userId, dto);
  }

  @Get('tenants')
  listMine(@CurrentUser() userId: string) {
    return this.tenantsService.listMyMemberships(userId);
  }

  @Post('tenants/:tenantId/members')
  @UseGuards(TenantMembershipGuard, RolesGuard)
  @Roles('ADMIN')
  invite(@Param('tenantId') tenantId: string, @Body() dto: InviteMemberDto) {
    return this.tenantsService.inviteMember(tenantId, dto);
  }

  @Get('tenants/:tenantId/members')
  @UseGuards(TenantMembershipGuard, RolesGuard)
  @Roles('ADMIN', 'MOSTRADOR')
  listMembers(@Param('tenantId') tenantId: string) {
    return this.tenantsService.listMembers(tenantId);
  }
}
