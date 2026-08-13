import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { TenantsModule } from '../tenants/tenants.module';
import { InvitesService } from './invites.service';
import { InvitesController } from './invites.controller';

@Module({
  imports: [AuthModule, TenantsModule],
  providers: [InvitesService],
  controllers: [InvitesController],
})
export class InvitesModule {}
