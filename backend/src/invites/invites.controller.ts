import { Body, Controller, Get, Param, Post, Res, UseGuards } from '@nestjs/common';
import type { Response } from 'express';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { TenantMembershipGuard } from '../tenants/guards/tenant-membership.guard';
import { RolesGuard } from '../tenants/guards/roles.guard';
import { Roles } from '../tenants/decorators/roles.decorator';
import { AuthService } from '../auth/auth.service';
import { InvitesService } from './invites.service';
import { CreateInviteDto } from './dto/create-invite.dto';
import { AcceptInviteDto } from './dto/accept-invite.dto';

@Controller()
export class InvitesController {
  constructor(
    private readonly invitesService: InvitesService,
    private readonly authService: AuthService,
  ) {}

  @Post('tenants/:tenantId/invites')
  @UseGuards(JwtAuthGuard, TenantMembershipGuard, RolesGuard)
  @Roles('ADMIN')
  create(@Param('tenantId') tenantId: string, @Body() dto: CreateInviteDto) {
    return this.invitesService.create(tenantId, dto);
  }

  @Get('invites/:token')
  getByToken(@Param('token') token: string) {
    return this.invitesService.getByToken(token);
  }

  @Post('invites/:token/accept')
  async accept(
    @Param('token') token: string,
    @Body() dto: AcceptInviteDto,
    @Res({ passthrough: true }) res: Response,
  ) {
    const result = await this.invitesService.accept(token, dto);
    this.authService.attachSessionCookie(res, result.accessToken);
    return result;
  }
}
