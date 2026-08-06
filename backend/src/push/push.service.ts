import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { OnEvent } from '@nestjs/event-emitter';
import * as webpush from 'web-push';
import { PrismaService } from '../prisma/prisma.service';
import { SubscribePushDto } from './dto/subscribe-push.dto';

@Injectable()
export class PushService {
  private readonly logger = new Logger(PushService.name);

  constructor(
    private readonly prisma: PrismaService,
    config: ConfigService,
  ) {
    webpush.setVapidDetails(
      config.get<string>('VAPID_SUBJECT')!,
      config.get<string>('VAPID_PUBLIC_KEY')!,
      config.get<string>('VAPID_PRIVATE_KEY')!,
    );
  }

  getPublicKey(): string {
    return process.env.VAPID_PUBLIC_KEY!;
  }

  async subscribe(userId: string, dto: SubscribePushDto) {
    await this.prisma.pushSubscription.upsert({
      where: { endpoint: dto.endpoint },
      create: {
        userId,
        endpoint: dto.endpoint,
        p256dh: dto.keys.p256dh,
        auth: dto.keys.auth,
      },
      update: { userId, p256dh: dto.keys.p256dh, auth: dto.keys.auth },
    });
  }

  async sendToUser(
    userId: string,
    payload: { title: string; body: string; url: string },
  ) {
    const subscriptions = await this.prisma.pushSubscription.findMany({
      where: { userId },
    });

    await Promise.all(
      subscriptions.map(async (sub) => {
        try {
          await webpush.sendNotification(
            {
              endpoint: sub.endpoint,
              keys: { p256dh: sub.p256dh, auth: sub.auth },
            },
            JSON.stringify(payload),
          );
        } catch (err) {
          if (
            err instanceof webpush.WebPushError &&
            (err.statusCode === 410 || err.statusCode === 404)
          ) {
            await this.prisma.pushSubscription.delete({
              where: { id: sub.id },
            });
          } else {
            const message = err instanceof Error ? err.message : String(err);
            this.logger.warn(
              `Failed to send push to subscription ${sub.id}: ${message}`,
            );
          }
        }
      }),
    );
  }

  @OnEvent('delivery.assigned')
  async handleDeliveryAssigned(event: {
    deliveryId: string;
    cadeteUserId: string;
  }) {
    await this.sendToUser(event.cadeteUserId, {
      title: 'Nueva entrega asignada',
      body: 'Tenés una nueva entrega — abrí la app para ver la dirección.',
      url: `/deliveries/${event.deliveryId}`,
    });
  }
}
