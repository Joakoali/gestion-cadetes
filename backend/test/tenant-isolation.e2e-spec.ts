import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { createTestApp, cleanDb } from './utils/test-app';

async function registerAndLogin(app: INestApplication, phone: string, name = 'Admin') {
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

describe('Cross-tenant isolation (e2e)', () => {
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

  it('never lets a member of tenant A read or write tenant B data', async () => {
    const tokenA = await registerAndLogin(app, '+549343600001', 'Admin A');
    const tokenB = await registerAndLogin(app, '+549343600002', 'Admin B');

    const tenantA = await request(app.getHttpServer())
      .post('/tenants')
      .set('Authorization', `Bearer ${tokenA}`)
      .send({ name: 'Rotisería A' })
      .expect(201);

    const tenantB = await request(app.getHttpServer())
      .post('/tenants')
      .set('Authorization', `Bearer ${tokenB}`)
      .send({ name: 'Rotisería B' })
      .expect(201);

    const customerB = await request(app.getHttpServer())
      .post(`/tenants/${tenantB.body.id}/customers`)
      .set('Authorization', `Bearer ${tokenB}`)
      .send({ name: 'Cliente B', phone: '+549343600003', addressText: 'Calle B 1', lat: -31.7, lng: -60.5 })
      .expect(201);

    // Admin A cannot list tenant B's customers.
    await request(app.getHttpServer())
      .get(`/tenants/${tenantB.body.id}/customers`)
      .set('Authorization', `Bearer ${tokenA}`)
      .expect(403);

    // Admin A cannot read a specific tenant B customer by guessed ID.
    await request(app.getHttpServer())
      .get(`/tenants/${tenantB.body.id}/customers/${customerB.body.id}`)
      .set('Authorization', `Bearer ${tokenA}`)
      .expect(403);

    // Admin A cannot create a customer under tenant B.
    await request(app.getHttpServer())
      .post(`/tenants/${tenantB.body.id}/customers`)
      .set('Authorization', `Bearer ${tokenA}`)
      .send({ name: 'Intruso', phone: '+549343600004', addressText: 'X', lat: -31.7, lng: -60.5 })
      .expect(403);

    // Admin A cannot invite members into tenant B.
    await request(app.getHttpServer())
      .post(`/tenants/${tenantB.body.id}/members`)
      .set('Authorization', `Bearer ${tokenA}`)
      .send({ name: 'Intruso', phone: '+549343600005', role: 'CADETE' })
      .expect(403);

    // Admin A cannot assign a delivery under tenant B.
    await request(app.getHttpServer())
      .post(`/tenants/${tenantB.body.id}/deliveries`)
      .set('Authorization', `Bearer ${tokenA}`)
      .send({ customerRecordId: customerB.body.id, cadeteUserId: 'anyone' })
      .expect(403);
  });
});
