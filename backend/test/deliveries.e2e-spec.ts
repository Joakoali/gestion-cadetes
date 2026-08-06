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

  it('rejects a customer that belongs to a different tenant', async () => {
    const tenantA = await setupTenantWithCadeteAndCustomer('+54934343');
    const tenantB = await setupTenantWithCadeteAndCustomer('+54934344');

    await request(app.getHttpServer())
      .post(`/tenants/${tenantA.tenantId}/deliveries`)
      .set('Authorization', `Bearer ${tenantA.adminToken}`)
      .send({ customerRecordId: tenantB.customerId, cadeteUserId: tenantA.cadeteUserId })
      .expect(404);
  });

  it('rejects a cadete who belongs to a different tenant', async () => {
    const tenantA = await setupTenantWithCadeteAndCustomer('+54934345');
    const tenantB = await setupTenantWithCadeteAndCustomer('+54934346');

    await request(app.getHttpServer())
      .post(`/tenants/${tenantA.tenantId}/deliveries`)
      .set('Authorization', `Bearer ${tenantA.adminToken}`)
      .send({ customerRecordId: tenantA.customerId, cadeteUserId: tenantB.cadeteUserId })
      .expect(400);
  });

  it('rejects a same-tenant member whose role is not CADETE', async () => {
    const { adminToken, tenantId, customerId } = await setupTenantWithCadeteAndCustomer('+54934347');

    const mostrador = await request(app.getHttpServer())
      .post(`/tenants/${tenantId}/members`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ name: 'Mostrador', phone: '+549343479', role: 'MOSTRADOR' })
      .expect(201);

    await request(app.getHttpServer())
      .post(`/tenants/${tenantId}/deliveries`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ customerRecordId: customerId, cadeteUserId: mostrador.body.userId })
      .expect(400);
  });

  it('rejects reassigning a delivery that is no longer ASSIGNED', async () => {
    const { adminToken, tenantId, cadeteUserId, customerId } =
      await setupTenantWithCadeteAndCustomer('+54934348');

    const invite2 = await request(app.getHttpServer())
      .post(`/tenants/${tenantId}/members`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ name: 'Cadete 2', phone: '+549343489', role: 'CADETE' })
      .expect(201);

    const delivery = await request(app.getHttpServer())
      .post(`/tenants/${tenantId}/deliveries`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ customerRecordId: customerId, cadeteUserId })
      .expect(201);

    await request(app.getHttpServer())
      .patch(`/tenants/${tenantId}/deliveries/${delivery.body.id}/cancel`)
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);

    await request(app.getHttpServer())
      .patch(`/tenants/${tenantId}/deliveries/${delivery.body.id}/reassign`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ cadeteUserId: invite2.body.userId })
      .expect(400);
  });

  it('rejects reassigning a delivery that belongs to a different tenant', async () => {
    const tenantA = await setupTenantWithCadeteAndCustomer('+54934349');
    const tenantB = await setupTenantWithCadeteAndCustomer('+54934350');

    const delivery = await request(app.getHttpServer())
      .post(`/tenants/${tenantA.tenantId}/deliveries`)
      .set('Authorization', `Bearer ${tenantA.adminToken}`)
      .send({ customerRecordId: tenantA.customerId, cadeteUserId: tenantA.cadeteUserId })
      .expect(201);

    await request(app.getHttpServer())
      .patch(`/tenants/${tenantB.tenantId}/deliveries/${delivery.body.id}/reassign`)
      .set('Authorization', `Bearer ${tenantB.adminToken}`)
      .send({ cadeteUserId: tenantB.cadeteUserId })
      .expect(404);
  });

  it('completes a delivery with a rating and updates the customer average', async () => {
    const { adminToken, tenantId, cadeteUserId, customerId } =
      await setupTenantWithCadeteAndCustomer('+54934343');

    const delivery = await request(app.getHttpServer())
      .post(`/tenants/${tenantId}/deliveries`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ customerRecordId: customerId, cadeteUserId })
      .expect(201);

    const completed = await request(app.getHttpServer())
      .patch(`/tenants/${tenantId}/deliveries/${delivery.body.id}/complete`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ rating: 4, ratingNote: 'Todo bien' })
      .expect(200);
    expect(completed.body.status).toBe('COMPLETED');

    const detail = await request(app.getHttpServer())
      .get(`/tenants/${tenantId}/customers/${customerId}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);
    expect(detail.body.averageRating).toBe(4);
    expect(detail.body.deliveryCount).toBe(1);
  });

  it('rejects an out-of-range rating', async () => {
    const { adminToken, tenantId, cadeteUserId, customerId } =
      await setupTenantWithCadeteAndCustomer('+54934344');

    const delivery = await request(app.getHttpServer())
      .post(`/tenants/${tenantId}/deliveries`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ customerRecordId: customerId, cadeteUserId })
      .expect(201);

    await request(app.getHttpServer())
      .patch(`/tenants/${tenantId}/deliveries/${delivery.body.id}/complete`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ rating: 7 })
      .expect(400);
  });

  it('lists only the caller-relevant assigned deliveries', async () => {
    const { adminToken, tenantId, cadeteUserId, customerId } =
      await setupTenantWithCadeteAndCustomer('+54934345');

    await request(app.getHttpServer())
      .post(`/tenants/${tenantId}/deliveries`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ customerRecordId: customerId, cadeteUserId })
      .expect(201);

    const list = await request(app.getHttpServer())
      .get(`/tenants/${tenantId}/deliveries/mine`)
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);

    // adminToken's userId is not the cadete, so its own assigned list is empty.
    expect(list.body).toEqual([]);
  });

  it('rejects completing a delivery that is already COMPLETED', async () => {
    const { adminToken, tenantId, cadeteUserId, customerId } =
      await setupTenantWithCadeteAndCustomer('+54934351');

    const delivery = await request(app.getHttpServer())
      .post(`/tenants/${tenantId}/deliveries`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ customerRecordId: customerId, cadeteUserId })
      .expect(201);

    await request(app.getHttpServer())
      .patch(`/tenants/${tenantId}/deliveries/${delivery.body.id}/complete`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ rating: 5 })
      .expect(200);

    await request(app.getHttpServer())
      .patch(`/tenants/${tenantId}/deliveries/${delivery.body.id}/complete`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ rating: 3 })
      .expect(400);
  });

  it('rejects completing a delivery that was CANCELLED', async () => {
    const { adminToken, tenantId, cadeteUserId, customerId } =
      await setupTenantWithCadeteAndCustomer('+54934352');

    const delivery = await request(app.getHttpServer())
      .post(`/tenants/${tenantId}/deliveries`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ customerRecordId: customerId, cadeteUserId })
      .expect(201);

    await request(app.getHttpServer())
      .patch(`/tenants/${tenantId}/deliveries/${delivery.body.id}/cancel`)
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);

    await request(app.getHttpServer())
      .patch(`/tenants/${tenantId}/deliveries/${delivery.body.id}/complete`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ rating: 3 })
      .expect(400);
  });

  it('lists the assigned deliveries for the cadete who is logged in', async () => {
    const { adminToken, tenantId, customerId } =
      await setupTenantWithCadeteAndCustomer('+54934353');

    const cadeteToken = await registerAndLogin(app, '+5493999001', 'Cadete');
    const invite = await request(app.getHttpServer())
      .post(`/tenants/${tenantId}/members`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ name: 'Cadete Real', phone: '+5493999001', role: 'CADETE' })
      .expect(201);

    const otherCadeteInvite = await request(app.getHttpServer())
      .post(`/tenants/${tenantId}/members`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ name: 'Otro Cadete', phone: '+5493999002', role: 'CADETE' })
      .expect(201);

    const myDelivery = await request(app.getHttpServer())
      .post(`/tenants/${tenantId}/deliveries`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ customerRecordId: customerId, cadeteUserId: invite.body.userId })
      .expect(201);

    await request(app.getHttpServer())
      .post(`/tenants/${tenantId}/deliveries`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ customerRecordId: customerId, cadeteUserId: otherCadeteInvite.body.userId })
      .expect(201);

    const list = await request(app.getHttpServer())
      .get(`/tenants/${tenantId}/deliveries/mine`)
      .set('Authorization', `Bearer ${cadeteToken}`)
      .expect(200);

    expect(list.body).toHaveLength(1);
    expect(list.body[0].id).toBe(myDelivery.body.id);
  });
});
