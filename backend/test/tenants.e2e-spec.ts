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

  it('rejects a non-admin tenant member trying to invite others', async () => {
    const adminToken = await registerAndLogin(app, '+549343100004');
    const tenant = await request(app.getHttpServer())
      .post('/tenants')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ name: 'Rotisería Don José' })
      .expect(201);

    // Admin invites a cadete; capture the response to get temporaryPassword
    const inviteResponse = await request(app.getHttpServer())
      .post(`/tenants/${tenant.body.id}/members`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ name: 'Cadete Juan', phone: '+549343100005', role: 'CADETE' })
      .expect(201);

    const temporaryPassword = inviteResponse.body.temporaryPassword;
    expect(temporaryPassword).toEqual(expect.any(String));

    // Log in as the cadete using the temporary password
    const cadeteLoginRes = await request(app.getHttpServer())
      .post('/auth/login')
      .send({ phone: '+549343100005', password: temporaryPassword })
      .expect(200);
    const cadeteToken = cadeteLoginRes.body.accessToken;

    // Cadete (non-admin member) tries to invite another member; should be rejected by RolesGuard
    await request(app.getHttpServer())
      .post(`/tenants/${tenant.body.id}/members`)
      .set('Authorization', `Bearer ${cadeteToken}`)
      .send({ name: 'Another User', phone: '+549343100006', role: 'CADETE' })
      .expect(403);
  });

  it('rejects a non-member user trying to invite members', async () => {
    const adminToken = await registerAndLogin(app, '+549343100007');
    const tenant = await request(app.getHttpServer())
      .post('/tenants')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ name: 'Rotisería Don José' })
      .expect(201);

    // Register and login a completely different user who is not a member of this tenant
    const outsiderToken = await registerAndLogin(app, '+549343100008');

    // Outsider (non-member) tries to invite someone; should be rejected by TenantMembershipGuard
    await request(app.getHttpServer())
      .post(`/tenants/${tenant.body.id}/members`)
      .set('Authorization', `Bearer ${outsiderToken}`)
      .send({ name: 'New User', phone: '+549343100009', role: 'CADETE' })
      .expect(403);
  });

  it('rejects duplicate member invitations with 409 conflict', async () => {
    const adminToken = await registerAndLogin(app, '+549343100007');
    const tenant = await request(app.getHttpServer())
      .post('/tenants')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ name: 'Rotisería Don José' })
      .expect(201);

    // First invite succeeds
    await request(app.getHttpServer())
      .post(`/tenants/${tenant.body.id}/members`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ name: 'Member', phone: '+549343100008', role: 'CADETE' })
      .expect(201);

    // Attempt to invite the same phone again; should return 409 Conflict
    await request(app.getHttpServer())
      .post(`/tenants/${tenant.body.id}/members`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ name: 'Member', phone: '+549343100008', role: 'CADETE' })
      .expect(409);
  });

  it('lists all members of a tenant with their roles', async () => {
    const adminToken = await registerAndLogin(app, '+549343700001');
    const tenant = await request(app.getHttpServer())
      .post('/tenants')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ name: 'Rotisería Don José' })
      .expect(201);

    await request(app.getHttpServer())
      .post(`/tenants/${tenant.body.id}/members`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ name: 'Cadete Juan', phone: '+549343700002', role: 'CADETE' })
      .expect(201);

    const members = await request(app.getHttpServer())
      .get(`/tenants/${tenant.body.id}/members`)
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);

    expect(members.body).toHaveLength(2);
    expect(members.body.map((m: { role: string }) => m.role).sort()).toEqual(['ADMIN', 'CADETE']);
  });

  it('rejects a cadete trying to list members', async () => {
    const adminToken = await registerAndLogin(app, '+549343700003');
    const tenant = await request(app.getHttpServer())
      .post('/tenants')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ name: 'Rotisería Don José' })
      .expect(201);

    const invite = await request(app.getHttpServer())
      .post(`/tenants/${tenant.body.id}/members`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ name: 'Cadete Juan', phone: '+549343700004', role: 'CADETE' })
      .expect(201);
    const cadeteLogin = await request(app.getHttpServer())
      .post('/auth/login')
      .send({ phone: '+549343700004', password: invite.body.temporaryPassword })
      .expect(200);

    await request(app.getHttpServer())
      .get(`/tenants/${tenant.body.id}/members`)
      .set('Authorization', `Bearer ${cadeteLogin.body.accessToken}`)
      .expect(403);
  });
});
