import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { createTestApp, cleanDb } from './utils/test-app';

describe('Auth (e2e)', () => {
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

  it('registers a new user and returns an access token', async () => {
    const res = await request(app.getHttpServer())
      .post('/auth/register')
      .send({ name: 'Ana', phone: '+549343111111', password: 'secret123' })
      .expect(201);

    expect(res.body.accessToken).toEqual(expect.any(String));
  });

  it('rejects registration with a phone already in use', async () => {
    await request(app.getHttpServer())
      .post('/auth/register')
      .send({ name: 'Ana', phone: '+549343111111', password: 'secret123' })
      .expect(201);

    await request(app.getHttpServer())
      .post('/auth/register')
      .send({ name: 'Otra Ana', phone: '+549343111111', password: 'otherpass' })
      .expect(409);
  });

  it('logs in with correct credentials and rejects wrong password', async () => {
    await request(app.getHttpServer())
      .post('/auth/register')
      .send({ name: 'Ana', phone: '+549343111111', password: 'secret123' })
      .expect(201);

    const ok = await request(app.getHttpServer())
      .post('/auth/login')
      .send({ phone: '+549343111111', password: 'secret123' })
      .expect(200);
    expect(ok.body.accessToken).toEqual(expect.any(String));

    await request(app.getHttpServer())
      .post('/auth/login')
      .send({ phone: '+549343111111', password: 'wrong' })
      .expect(401);
  });
});
