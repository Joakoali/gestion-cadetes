import { Body, Controller, Get, Post, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { PushService } from './push.service';
import { SubscribePushDto } from './dto/subscribe-push.dto';

@Controller('push')
export class PushController {
  constructor(private readonly pushService: PushService) {}

  @Get('vapid-public-key')
  getPublicKey() {
    return { publicKey: this.pushService.getPublicKey() };
  }

  @Post('subscribe')
  @UseGuards(JwtAuthGuard)
  subscribe(@CurrentUser() userId: string, @Body() dto: SubscribePushDto) {
    return this.pushService.subscribe(userId, dto);
  }
}
