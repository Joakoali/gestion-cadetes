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

  it('sets a session cookie on register and allows cookie-only access to /auth/me', async () => {
    const agent = request.agent(app.getHttpServer());
    const res = await agent
      .post('/auth/register')
      .send({ name: 'Ana', phone: '+549343111112', password: 'secret123', email: 'ana@example.com' })
      .expect(201);

    expect(res.headers['set-cookie']).toBeDefined();

    const me = await agent.get('/auth/me').expect(200);
    expect(me.body).toEqual({
      id: expect.any(String),
      name: 'Ana',
      phone: '+549343111112',
      email: 'ana@example.com',
    });
  });

  it('rejects /auth/me without a session', async () => {
    await request(app.getHttpServer()).get('/auth/me').expect(401);
  });

  it('clears the session cookie on logout', async () => {
    const agent = request.agent(app.getHttpServer());
    await agent
      .post('/auth/register')
      .send({ name: 'Ana', phone: '+549343111113', password: 'secret123' })
      .expect(201);
    await agent.get('/auth/me').expect(200);

    await agent.post('/auth/logout').expect(200);
    await agent.get('/auth/me').expect(401);
  });

  it('rejects registration with an email already in use', async () => {
    await request(app.getHttpServer())
      .post('/auth/register')
      .send({ name: 'Ana', phone: '+549343111114', password: 'secret123', email: 'dup@example.com' })
      .expect(201);

    await request(app.getHttpServer())
      .post('/auth/register')
      .send({ name: 'Otra', phone: '+549343111115', password: 'secret123', email: 'dup@example.com' })
      .expect(409);
  });
});
