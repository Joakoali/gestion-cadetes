import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { createTestApp, cleanDb } from './utils/test-app';

describe('Rate limiting (e2e)', () => {
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

  it('blocks repeated login attempts after the limit', async () => {
    const attempts = Array.from({ length: 6 }, () =>
      request(app.getHttpServer())
        .post('/auth/login')
        .send({ phone: '+549343999999', password: 'wrong' }),
    );

    const results = await Promise.all(attempts);
    const tooMany = results.filter((r) => r.status === 429);

    expect(tooMany.length).toBeGreaterThan(0);
  });

  it('blocks repeated forgot-password requests', async () => {
    const attempts = Array.from({ length: 4 }, () =>
      request(app.getHttpServer())
        .post('/auth/forgot-password')
        .send({ email: 'someone@example.com' }),
    );

    const results = await Promise.all(attempts);
    const tooMany = results.filter((r) => r.status === 429);

    expect(tooMany.length).toBeGreaterThan(0);
  });

  it('blocks repeated short-code guesses against a tenant', async () => {
    await request(app.getHttpServer())
      .post('/auth/register')
      .send({ name: 'Mostrador', phone: '+549343999998', password: 'secret123' })
      .expect(201);
    const login = await request(app.getHttpServer())
      .post('/auth/login')
      .send({ phone: '+549343999998', password: 'secret123' })
      .expect(200);
    const token = login.body.accessToken as string;

    const tenant = await request(app.getHttpServer())
      .post('/tenants')
      .set('Authorization', `Bearer ${token}`)
      .send({ name: 'Rotisería' })
      .expect(201);

    const attempts = Array.from({ length: 12 }, (_, i) =>
      request(app.getHttpServer())
        .post(`/tenants/${tenant.body.id}/customers`)
        .set('Authorization', `Bearer ${token}`)
        .send({ linkShortCode: `GUESS0${i}` }),
    );

    const results = await Promise.all(attempts);
    const tooMany = results.filter((r) => r.status === 429);

    expect(tooMany.length).toBeGreaterThan(0);
  });
});
