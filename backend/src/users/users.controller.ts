import { Body, Controller, Patch, Post, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { UsersService } from './users.service';
import { UpdateLocationDto } from './dto/update-location.dto';

@Controller('users/me')
@UseGuards(JwtAuthGuard)
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  @Post('short-code')
  async ensureShortCode(@CurrentUser() userId: string) {
    return { shortCode: await this.usersService.ensureShortCode(userId) };
  }

  @Patch('location')
  updateLocation(@CurrentUser() userId: string, @Body() dto: UpdateLocationDto) {
    return this.usersService.updateLocation(userId, dto);
  }
}
