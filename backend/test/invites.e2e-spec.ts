import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { createTestApp, cleanDb } from './utils/test-app';

async function registerAndLogin(app: INestApplication, phone: string, name = 'Owner') {
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

async function createTenant(app: INestApplication, token: string) {
  const res = await request(app.getHttpServer())
    .post('/tenants')
    .set('Authorization', `Bearer ${token}`)
    .send({ name: 'Rotisería Don José' })
    .expect(201);
  return res.body.id as string;
}

describe('Invites (e2e)', () => {
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

  it('lets an admin create an invite link and the invitee accept it', async () => {
    const adminToken = await registerAndLogin(app, '+549343500001');
    const tenantId = await createTenant(app, adminToken);

    const invite = await request(app.getHttpServer())
      .post(`/tenants/${tenantId}/invites`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ role: 'CADETE', label: 'Cadete Juan' })
      .expect(201);

    expect(invite.body.url).toEqual(expect.any(String));
    const token = invite.body.url.split('/').pop() as string;

    const info = await request(app.getHttpServer()).get(`/invites/${token}`).expect(200);
    expect(info.body).toEqual({ tenantName: 'Rotisería Don José', role: 'CADETE' });

    const accept = await request(app.getHttpServer())
      .post(`/invites/${token}/accept`)
      .send({ name: 'Juan', phone: '+549343500002', email: 'juan@example.com', password: 'secret123' })
      .expect(201);

    expect(accept.headers['set-cookie']).toBeDefined();
    expect(accept.body.user.name).toBe('Juan');

    const memberships = await request(app.getHttpServer())
      .get('/tenants')
      .set('Authorization', `Bearer ${accept.body.accessToken}`)
      .expect(200);
    expect(memberships.body).toEqual([{ tenantId, name: 'Rotisería Don José', role: 'CADETE' }]);
  });

  it('rejects a non-admin trying to create an invite', async () => {
    const adminToken = await registerAndLogin(app, '+549343500003');
    const tenantId = await createTenant(app, adminToken);

    const outsiderToken = await registerAndLogin(app, '+549343500004', 'Outsider');
    await request(app.getHttpServer())
      .post(`/tenants/${tenantId}/invites`)
      .set('Authorization', `Bearer ${outsiderToken}`)
      .send({ role: 'CADETE' })
      .expect(403);
  });

  it('rejects accepting an unknown, expired, or already-used invite', async () => {
    await request(app.getHttpServer())
      .post('/invites/does-not-exist/accept')
      .send({ name: 'User', phone: '+549343500005', password: 'secret123' })
      .expect(404);

    const adminToken = await registerAndLogin(app, '+549343500006');
    const tenantId = await createTenant(app, adminToken);
    const invite = await request(app.getHttpServer())
      .post(`/tenants/${tenantId}/invites`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ role: 'MOSTRADOR' })
      .expect(201);
    const token = invite.body.url.split('/').pop() as string;

    await request(app.getHttpServer())
      .post(`/invites/${token}/accept`)
      .send({ name: 'First', phone: '+549343500007', password: 'secret123' })
      .expect(201);

    await request(app.getHttpServer())
      .post(`/invites/${token}/accept`)
      .send({ name: 'Second', phone: '+549343500008', password: 'secret123' })
      .expect(404);
  });

  it('rejects accepting with a phone already in use', async () => {
    const adminToken = await registerAndLogin(app, '+549343500009');
    const tenantId = await createTenant(app, adminToken);
    const invite = await request(app.getHttpServer())
      .post(`/tenants/${tenantId}/invites`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ role: 'CADETE' })
      .expect(201);
    const token = invite.body.url.split('/').pop() as string;

    await request(app.getHttpServer())
      .post(`/invites/${token}/accept`)
      .send({ name: 'Dup', phone: '+549343500009', password: 'secret123' })
      .expect(409);
  });

  it('lists pending invites and excludes used or expired ones', async () => {
    const adminToken = await registerAndLogin(app, '+549343700005');
    const tenantId = await createTenant(app, adminToken);

    const invite = await request(app.getHttpServer())
      .post(`/tenants/${tenantId}/invites`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ role: 'CADETE', label: 'Cadete Juan' })
      .expect(201);

    const pendingBefore = await request(app.getHttpServer())
      .get(`/tenants/${tenantId}/invites`)
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);
    expect(pendingBefore.body).toHaveLength(1);
    expect(pendingBefore.body[0].label).toBe('Cadete Juan');

    const token = invite.body.url.split('/').pop() as string;
    await request(app.getHttpServer())
      .post(`/invites/${token}/accept`)
      .send({ name: 'Juan', phone: '+549343700006', password: 'secret123' })
      .expect(201);

    const pendingAfter = await request(app.getHttpServer())
      .get(`/tenants/${tenantId}/invites`)
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);
    expect(pendingAfter.body).toHaveLength(0);
  });
});
