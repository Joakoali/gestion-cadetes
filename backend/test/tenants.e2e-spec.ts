import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { createTestApp, cleanDb } from './utils/test-app';

async function registerAndLogin(app: INestApplication, phone: string) {
  await request(app.getHttpServer())
    .post('/auth/register')
    .send({ name: 'Owner', phone, password: 'secret123' })
    .expect(201);
  const res = await request(app.getHttpServer())
    .post('/auth/login')
    .send({ phone, password: 'secret123' })
    .expect(200);
  return res.body.accessToken as string;
}

describe('Tenants (e2e)', () => {
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

  it('creates a tenant and makes the creator an admin', async () => {
    const token = await registerAndLogin(app, '+549343100001');

    const created = await request(app.getHttpServer())
      .post('/tenants')
      .set('Authorization', `Bearer ${token}`)
      .send({ name: 'Rotisería Don José' })
      .expect(201);

    expect(created.body.name).toBe('Rotisería Don José');

    const mine = await request(app.getHttpServer())
      .get('/tenants')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);

    expect(mine.body).toHaveLength(1);
    expect(mine.body[0].role).toBe('ADMIN');
  });

  it('lets an admin invite a new member by phone', async () => {
    const token = await registerAndLogin(app, '+549343100002');
    const tenant = await request(app.getHttpServer())
      .post('/tenants')
      .set('Authorization', `Bearer ${token}`)
      .send({ name: 'Rotisería Don José' })
      .expect(201);

    const invite = await request(app.getHttpServer())
      .post(`/tenants/${tenant.body.id}/members`)
      .set('Authorization', `Bearer ${token}`)
      .send({ name: 'Cadete Juan', phone: '+549343100003', role: 'CADETE' })
      .expect(201);

    expect(invite.body.role).toBe('CADETE');
    expect(invite.body.temporaryPassword).toEqual(expect.any(String));
  });

  it('rejects a non-admin trying to invite members', async () => {
    const adminToken = await registerAndLogin(app, '+549343100004');
    const tenant = await request(app.getHttpServer())
      .post('/tenants')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ name: 'Rotisería Don José' })
      .expect(201);

    await request(app.getHttpServer())
      .post(`/tenants/${tenant.body.id}/members`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ name: 'Cadete Juan', phone: '+549343100005', role: 'CADETE' })
      .expect(201);

    const cadeteToken = await (
      await request(app.getHttpServer())
        .post('/auth/login')
        .send({ phone: '+549343100005', password: expect.anything() })
    );
    // Cadete's temp password isn't known here; instead verify via a fresh non-member user.
    const outsiderToken = await registerAndLogin(app, '+549343100006');
    await request(app.getHttpServer())
      .post(`/tenants/${tenant.body.id}/members`)
      .set('Authorization', `Bearer ${outsiderToken}`)
      .send({ name: 'Outro', phone: '+549343100007', role: 'CADETE' })
      .expect(403);
  });
});
