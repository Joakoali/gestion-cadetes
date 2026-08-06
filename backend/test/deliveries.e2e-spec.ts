import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { createTestApp, cleanDb } from './utils/test-app';

async function registerAndLogin(app: INestApplication, phone: string, name = 'User') {
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

describe('Deliveries — create/reassign/cancel (e2e)', () => {
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

  async function setupTenantWithCadeteAndCustomer(phonePrefix: string) {
    const adminToken = await registerAndLogin(app, `${phonePrefix}1`, 'Admin');
    const tenant = await request(app.getHttpServer())
      .post('/tenants')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ name: 'Rotisería' })
      .expect(201);
    const tenantId = tenant.body.id as string;

    const invite = await request(app.getHttpServer())
      .post(`/tenants/${tenantId}/members`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ name: 'Cadete', phone: `${phonePrefix}2`, role: 'CADETE' })
      .expect(201);
    const cadeteUserId = invite.body.userId as string;

    const customer = await request(app.getHttpServer())
      .post(`/tenants/${tenantId}/customers`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ name: 'Carlos', phone: `${phonePrefix}3`, addressText: 'Belgrano 456', lat: -31.735, lng: -60.525 })
      .expect(201);

    return { adminToken, tenantId, cadeteUserId, customerId: customer.body.id as string };
  }

  it('assigns a delivery to a cadete', async () => {
    const { adminToken, tenantId, cadeteUserId, customerId } =
      await setupTenantWithCadeteAndCustomer('+54934340');

    const res = await request(app.getHttpServer())
      .post(`/tenants/${tenantId}/deliveries`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ customerRecordId: customerId, cadeteUserId })
      .expect(201);

    expect(res.body.status).toBe('ASSIGNED');
    expect(res.body.cadeteUserId).toBe(cadeteUserId);
  });

  it('rejects assigning to a user who is not a cadete in that tenant', async () => {
    const { adminToken, tenantId, customerId } = await setupTenantWithCadeteAndCustomer('+54934341');

    await request(app.getHttpServer())
      .post(`/tenants/${tenantId}/deliveries`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ customerRecordId: customerId, cadeteUserId: 'not-a-real-user' })
      .expect(400);
  });

  it('reassigns and cancels a delivery while still ASSIGNED', async () => {
    const { adminToken, tenantId, cadeteUserId, customerId } =
      await setupTenantWithCadeteAndCustomer('+54934342');

    const invite2 = await request(app.getHttpServer())
      .post(`/tenants/${tenantId}/members`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ name: 'Cadete 2', phone: '+549343429', role: 'CADETE' })
      .expect(201);

    const delivery = await request(app.getHttpServer())
      .post(`/tenants/${tenantId}/deliveries`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ customerRecordId: customerId, cadeteUserId })
      .expect(201);

    const reassigned = await request(app.getHttpServer())
      .patch(`/tenants/${tenantId}/deliveries/${delivery.body.id}/reassign`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ cadeteUserId: invite2.body.userId })
      .expect(200);
    expect(reassigned.body.cadeteUserId).toBe(invite2.body.userId);

    const cancelled = await request(app.getHttpServer())
      .patch(`/tenants/${tenantId}/deliveries/${delivery.body.id}/cancel`)
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);
    expect(cancelled.body.status).toBe('CANCELLED');

    await request(app.getHttpServer())
      .patch(`/tenants/${tenantId}/deliveries/${delivery.body.id}/cancel`)
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(400);
  });
});
