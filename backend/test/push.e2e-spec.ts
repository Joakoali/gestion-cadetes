import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { createTestApp, cleanDb } from './utils/test-app';

async function registerAndLogin(app: INestApplication, phone: string) {
  await request(app.getHttpServer())
    .post('/auth/register')
    .send({ name: 'Cadete', phone, password: 'secret123' })
    .expect(201);
  const res = await request(app.getHttpServer())
    .post('/auth/login')
    .send({ phone, password: 'secret123' })
    .expect(200);
  return res.body.accessToken as string;
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
});
