import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { createTestApp, cleanDb } from './utils/test-app';

async function registerAndLogin(app: INestApplication, phone: string) {
  await request(app.getHttpServer())
    .post('/auth/register')
    .send({ name: 'Cliente', phone, password: 'secret123' })
    .expect(201);
  const res = await request(app.getHttpServer())
    .post('/auth/login')
    .send({ phone, password: 'secret123' })
    .expect(200);
  return res.body.accessToken as string;
}

describe('Users (e2e)', () => {
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

  it('generates a short code once and returns the same code on repeat calls', async () => {
    const token = await registerAndLogin(app, '+549343200001');

    const first = await request(app.getHttpServer())
      .post('/users/me/short-code')
      .set('Authorization', `Bearer ${token}`)
      .expect(201);

    const second = await request(app.getHttpServer())
      .post('/users/me/short-code')
      .set('Authorization', `Bearer ${token}`)
      .expect(201);

    expect(first.body.shortCode).toBe(second.body.shortCode);
    expect(first.body.shortCode).toHaveLength(6);
  });

  it('updates home location', async () => {
    const token = await registerAndLogin(app, '+549343200002');

    const res = await request(app.getHttpServer())
      .patch('/users/me/location')
      .set('Authorization', `Bearer ${token}`)
      .send({ addressText: 'San Martín 123', lat: -31.73, lng: -60.52 })
      .expect(200);

    expect(res.body).toEqual({ addressText: 'San Martín 123', lat: -31.73, lng: -60.52 });
  });
});
