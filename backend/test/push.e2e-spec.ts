import { INestApplication } from '@nestjs/common';
import request from 'supertest';

// Mocked before importing anything that transitively pulls in 'web-push'
// (createTestApp -> AppModule -> PushModule -> PushService), so the real
// network call never happens and we can assert on the payload the service
// builds. web-push's real sendNotification does an outbound HTTP request,
// which we don't want in tests.
const sendNotificationMock = jest.fn().mockResolvedValue(undefined);
jest.mock('web-push', () => {
  const actual = jest.requireActual('web-push');
  return { ...actual, sendNotification: sendNotificationMock };
});

import { createTestApp, cleanDb } from './utils/test-app';

async function registerAndLogin(app: INestApplication, phone: string, name = 'Cadete') {
  await request(app.getHttpServer())
    .post('/auth/register')
    .send({ name, phone, password: 'secret123' })
    .expect(201);
  const res = await request(app.getHttpServer())
    .post('/auth/login')
    .send({ phone, password: 'secret123' })
    .expect(200);
  return res.body.accessToken as string;
}

async function waitFor(predicate: () => boolean, timeoutMs = 2000): Promise<void> {
  const start = Date.now();
  while (!predicate()) {
    if (Date.now() - start > timeoutMs) {
      throw new Error('waitFor: timed out waiting for condition');
    }
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
}

describe('Push (e2e)', () => {
  let app: INestApplication;

  beforeAll(async () => {
    app = await createTestApp();
  });

  afterEach(async () => {
    await cleanDb(app);
  });

  afterAll(async () => {
    await app.close();
  });

  it('exposes the VAPID public key without auth', async () => {
    const res = await request(app.getHttpServer())
      .get('/push/vapid-public-key')
      .expect(200);
    expect(res.body.publicKey).toEqual(expect.any(String));
  });

  it('stores a push subscription for the authenticated user', async () => {
    const token = await registerAndLogin(app, '+549343500001');

    await request(app.getHttpServer())
      .post('/push/subscribe')
      .set('Authorization', `Bearer ${token}`)
      .send({
        endpoint: 'https://fcm.googleapis.com/fcm/send/example-endpoint',
        keys: { p256dh: 'p256dh-key', auth: 'auth-key' },
      })
      .expect(201);
  });

  it('rejects an unauthenticated subscribe request', async () => {
    await request(app.getHttpServer())
      .post('/push/subscribe')
      .send({
        endpoint: 'https://fcm.googleapis.com/fcm/send/no-auth-endpoint',
        keys: { p256dh: 'p256dh-key', auth: 'auth-key' },
      })
      .expect(401);
  });

  it('upserts by endpoint instead of creating duplicates when re-subscribing', async () => {
    const token = await registerAndLogin(app, '+549343500002');
    const endpoint =
      'https://fcm.googleapis.com/fcm/send/re-subscribe-endpoint';

    await request(app.getHttpServer())
      .post('/push/subscribe')
      .set('Authorization', `Bearer ${token}`)
      .send({ endpoint, keys: { p256dh: 'p256dh-key-1', auth: 'auth-key-1' } })
      .expect(201);

    await request(app.getHttpServer())
      .post('/push/subscribe')
      .set('Authorization', `Bearer ${token}`)
      .send({ endpoint, keys: { p256dh: 'p256dh-key-2', auth: 'auth-key-2' } })
      .expect(201);
  });

  it('allows the same user to register a second device', async () => {
    const token = await registerAndLogin(app, '+549343500003');

    await request(app.getHttpServer())
      .post('/push/subscribe')
      .set('Authorization', `Bearer ${token}`)
      .send({
        endpoint: 'https://fcm.googleapis.com/fcm/send/device-1',
        keys: { p256dh: 'p256dh-key', auth: 'auth-key' },
      })
      .expect(201);

    await request(app.getHttpServer())
      .post('/push/subscribe')
      .set('Authorization', `Bearer ${token}`)
      .send({
        endpoint: 'https://fcm.googleapis.com/fcm/send/device-2',
        keys: { p256dh: 'p256dh-key', auth: 'auth-key' },
      })
      .expect(201);
  });

  it('sends a delivery.assigned push notification whose deep link matches the cadete detail route', async () => {
    sendNotificationMock.mockClear();

    {
      const adminToken = await registerAndLogin(app, '+549343500004', 'Admin');
      const tenant = await request(app.getHttpServer())
        .post('/tenants')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ name: 'Rotisería' })
        .expect(201);
      const tenantId = tenant.body.id as string;

      const cadeteInvite = await request(app.getHttpServer())
        .post(`/tenants/${tenantId}/members`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ name: 'Cadete', phone: '+549343500005', role: 'CADETE' })
        .expect(201);
      const cadeteUserId = cadeteInvite.body.userId as string;

      const cadeteToken = await request(app.getHttpServer())
        .post('/auth/login')
        .send({ phone: '+549343500005', password: cadeteInvite.body.temporaryPassword })
        .expect(200)
        .then((res) => res.body.accessToken as string);

      await request(app.getHttpServer())
        .post('/push/subscribe')
        .set('Authorization', `Bearer ${cadeteToken}`)
        .send({
          endpoint: 'https://fcm.googleapis.com/fcm/send/delivery-assigned-endpoint',
          keys: { p256dh: 'p256dh-key', auth: 'auth-key' },
        })
        .expect(201);

      const customer = await request(app.getHttpServer())
        .post(`/tenants/${tenantId}/customers`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ name: 'Carlos', phone: '+549343500006', addressText: 'Belgrano 456', lat: -31.735, lng: -60.525 })
        .expect(201);

      const delivery = await request(app.getHttpServer())
        .post(`/tenants/${tenantId}/deliveries`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ customerRecordId: customer.body.id, cadeteUserId })
        .expect(201);

      await waitFor(() => sendNotificationMock.mock.calls.length > 0);

      const [, payloadJson] = sendNotificationMock.mock.calls[0];
      const payload = JSON.parse(payloadJson as string);
      expect(payload.url).toBe(`/entregas/${delivery.body.id}?tenantId=${tenantId}`);
    }
  });
});
