import request from 'supertest';
import { beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../../app.ts';
import { InMemoryVehicleRepository } from '../../test/in-memory-vehicle.repository.ts';

describe('/api/vehicles', () => {
  let app: ReturnType<typeof createApp>;

  beforeEach(() => {
    app = createApp({ vehicleRepository: new InMemoryVehicleRepository() });
  });

  it('POST creates a vehicle and GET returns it', async () => {
    const created = await request(app)
      .post('/api/vehicles')
      .send({ make: 'Toyota', model: 'Corolla', year: 2020 })
      .expect(201);

    expect(created.body).toMatchObject({ make: 'Toyota', model: 'Corolla', year: 2020, mileageKm: 0 });

    const fetched = await request(app).get(`/api/vehicles/${created.body.id}`).expect(200);
    expect(fetched.body.id).toBe(created.body.id);
  });

  it('POST rejects an invalid body with 400', async () => {
    const res = await request(app).post('/api/vehicles').send({ make: '' }).expect(400);

    expect(res.body.error.message).toBe('Validation failed');
  });

  it('GET returns 404 for an unknown vehicle', async () => {
    await request(app).get('/api/vehicles/000000000000000000000000').expect(404);
  });

  it('DELETE removes a vehicle', async () => {
    const created = await request(app)
      .post('/api/vehicles')
      .send({ make: 'Kia', model: 'Rio', year: 2021 });

    await request(app).delete(`/api/vehicles/${created.body.id}`).expect(204);
    await request(app).get(`/api/vehicles/${created.body.id}`).expect(404);
  });

  it('GET /health returns ok', async () => {
    await request(app).get('/health').expect(200, { status: 'ok' });
  });
});
