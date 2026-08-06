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

async function createTenant(app: INestApplication, token: string) {
  const res = await request(app.getHttpServer())
    .post('/tenants')
    .set('Authorization', `Bearer ${token}`)
    .send({ name: 'Rotisería Don José' })
    .expect(201);
  return res.body.id as string;
}

describe('Customers (e2e)', () => {
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

  it('creates a customer manually with a map pin', async () => {
    const token = await registerAndLogin(app, '+549343300001', 'Mostrador');
    const tenantId = await createTenant(app, token);

    const res = await request(app.getHttpServer())
      .post(`/tenants/${tenantId}/customers`)
      .set('Authorization', `Bearer ${token}`)
      .send({
        name: 'Carlos',
        phone: '+549343399999',
        addressText: 'Belgrano 456',
        lat: -31.735,
        lng: -60.525,
        notes: 'rejas negras, tocar timbre dos veces',
      })
      .expect(201);

    expect(res.body.name).toBe('Carlos');
    expect(res.body.notes).toContain('rejas negras');
  });

  it('links a self-registered customer by short code, autofilling their data', async () => {
    const customerToken = await registerAndLogin(app, '+549343300002', 'Carlos Cliente');
    await request(app.getHttpServer())
      .patch('/users/me/location')
      .set('Authorization', `Bearer ${customerToken}`)
      .send({ addressText: 'Belgrano 456', lat: -31.735, lng: -60.525 })
      .expect(200);
    const codeRes = await request(app.getHttpServer())
      .post('/users/me/short-code')
      .set('Authorization', `Bearer ${customerToken}`)
      .expect(201);

    const mostradorToken = await registerAndLogin(app, '+549343300003', 'Mostrador');
    const tenantId = await createTenant(app, mostradorToken);

    const res = await request(app.getHttpServer())
      .post(`/tenants/${tenantId}/customers`)
      .set('Authorization', `Bearer ${mostradorToken}`)
      .send({ linkShortCode: codeRes.body.shortCode })
      .expect(201);

    expect(res.body.name).toBe('Carlos Cliente');
    expect(res.body.addressText).toBe('Belgrano 456');
  });

  it('searches customers by phone within the tenant and updates notes/pin', async () => {
    const token = await registerAndLogin(app, '+549343300004', 'Mostrador');
    const tenantId = await createTenant(app, token);
    const created = await request(app.getHttpServer())
      .post(`/tenants/${tenantId}/customers`)
      .set('Authorization', `Bearer ${token}`)
      .send({ name: 'Carlos', phone: '+549343399998', addressText: 'Belgrano 456', lat: -31.735, lng: -60.525 })
      .expect(201);

    const search = await request(app.getHttpServer())
      .get(`/tenants/${tenantId}/customers?q=399998`)
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    expect(search.body).toHaveLength(1);

    const updated = await request(app.getHttpServer())
      .patch(`/tenants/${tenantId}/customers/${created.body.id}`)
      .set('Authorization', `Bearer ${token}`)
      .send({ lat: -31.736, lng: -60.526, notes: 'perro suelto' })
      .expect(200);
    expect(updated.body.notes).toBe('perro suelto');

    const detail = await request(app.getHttpServer())
      .get(`/tenants/${tenantId}/customers/${created.body.id}`)
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    expect(detail.body.averageRating).toBeNull();
    expect(detail.body.deliveryCount).toBe(0);
  });
});
