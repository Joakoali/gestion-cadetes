import { Module } from '@nestjs/common';
import { TenantsService } from './tenants.service';
import { TenantsController } from './tenants.controller';
import { TenantMembershipGuard } from './guards/tenant-membership.guard';

@Module({
  providers: [TenantsService, TenantMembershipGuard],
  controllers: [TenantsController],
  exports: [TenantMembershipGuard],
})
export class TenantsModule {}
