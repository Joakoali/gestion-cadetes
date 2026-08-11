import { Test } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { ThrottlerStorage } from '@nestjs/throttler';
import cookieParser from 'cookie-parser';
import { AppModule } from '../../src/app.module';
import { PrismaService } from '../../src/prisma/prisma.service';
import { MailService } from '../../src/mail/mail.service';
import { FakeMailService } from './fake-mail.service';

export async function createTestApp(): Promise<INestApplication> {
  const moduleRef = await Test.createTestingModule({
    imports: [AppModule],
  })
    .overrideProvider(MailService)
    .useClass(FakeMailService)
    .compile();

  const app = moduleRef.createNestApplication();
  app.use(cookieParser());
  app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
  await app.init();
  return app;
}

export async function cleanDb(app: INestApplication): Promise<void> {
  const prisma = app.get(PrismaService);
  await prisma.pushSubscription.deleteMany();
  await prisma.passwordResetToken.deleteMany();
  await prisma.delivery.deleteMany();
  await prisma.customerRecord.deleteMany();
  await prisma.invite.deleteMany();
  await prisma.membership.deleteMany();
  await prisma.user.deleteMany();
  await prisma.tenant.deleteMany();

  const fakeMail = app.get(MailService) as unknown as FakeMailService;
  fakeMail.sent = [];

  // Clear the throttler cache to reset rate limits between tests
  try {
    const throttlerStorage = app.get(ThrottlerStorage) as any;
    // Clear the internal storage map
    if (throttlerStorage?.storage instanceof Map) {
      throttlerStorage.storage.clear();
    }
  } catch (e) {
    // Ignore errors if storage cannot be cleared
  }
}
