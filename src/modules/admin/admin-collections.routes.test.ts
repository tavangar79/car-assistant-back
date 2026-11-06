import request from 'supertest';
import { beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../../app.ts';
import { adminFixture } from '../../test/admin-fixture.ts';
import { InMemoryCollectionRepository } from '../../test/in-memory-collection.repository.ts';
import { createTestDependencies } from '../../test/test-dependencies.ts';
import { COLLECTIONS } from './collection-browser.ts';

const VEHICLE_A = 'b00000000000000000000001';
const VEHICLE_B = 'b00000000000000000000002';
const USER = 'a00000000000000000000001';
const AT = new Date('2026-01-02T03:04:05.000Z');

const fuelLog = (n: number, vehicleId: string) => ({
  id: `c0000000000000000000000${n}`,
  vehicleId,
  fueledAt: AT,
  odometerKm: 1000 * n,
  fuelType: 'regular',
  volume: 30.5,
  totalCost: 500000,
  isFullFill: true,
  createdAt: AT,
  updatedAt: AT,
});

describe('/api/admin/collections', () => {
  let app: ReturnType<typeof createApp>;
  let ADMIN: string;

  beforeEach(() => {
    const collections = new InMemoryCollectionRepository({
      fuel_logs: [fuelLog(1, VEHICLE_A), fuelLog(2, VEHICLE_B), fuelLog(3, VEHICLE_A)],
      users: [{ id: USER, phone: '09120000001', role: 'admin', createdAt: AT, updatedAt: AT }],
      user_avatars: [
        {
          id: 'd00000000000000000000001',
          userId: USER,
          contentType: 'image/png',
          data: new Uint8Array([1, 2]),
          sizeBytes: 2,
          updatedAt: AT,
        },
      ],
    });
    const admin = adminFixture();
    ADMIN = admin.ADMIN;
    app = createApp(
      createTestDependencies({
        collectionRepository: collections,
        adminRepository: admin.adminRepository,
      }),
    );
  });

  const get = (path: string) => request(app).get(path).set('Authorization', ADMIN);

  it.each(['/api/admin/collections', '/api/admin/collections/fuel_logs'])(
    'GET %s returns 401 without an admin token',
    async (path) => {
      await request(app).get(path).expect(401);
    },
  );

  describe('GET /', () => {
    it('lists every registered collection with its count, in registry order', async () => {
      const res = await get('/api/admin/collections').expect(200);

      expect(res.body.collections.map((c: { name: string }) => c.name)).toEqual(
        COLLECTIONS.map((entry) => entry.name),
      );
      expect(res.body.collections).toContainEqual({ name: 'fuel_logs', count: 3 });
      expect(res.body.collections).toContainEqual({ name: 'vehicles', count: 0 });
      const names = res.body.collections.map((c: { name: string }) => c.name);
      expect(names).not.toContain('admins');
      expect(names).not.toContain('otp_codes');
      expect(names).not.toContain('otp_requests');
    });
  });

  describe('GET /:name', () => {
    it('returns the fields and flat documents, newest id first', async () => {
      const res = await get('/api/admin/collections/fuel_logs').expect(200);

      expect(res.body.name).toBe('fuel_logs');
      expect(res.body.fields[0]).toBe('id');
      expect(res.body.documents.map((d: { id: string }) => d.id)).toEqual([
        'c00000000000000000000003',
        'c00000000000000000000002',
        'c00000000000000000000001',
      ]);
      expect(Object.keys(res.body.documents[0])).toEqual(res.body.fields);
      expect(res.body.documents[0]).toMatchObject({
        station: null,
        volume: 30.5,
        fueledAt: AT.toISOString(),
      });
      expect(res.body.nextCursor).toBeNull();
    });

    it('pages with cursor and limit', async () => {
      const first = await get('/api/admin/collections/fuel_logs?limit=2').expect(200);
      expect(first.body.nextCursor).toBe('c00000000000000000000002');

      const second = await get(
        `/api/admin/collections/fuel_logs?limit=2&cursor=${first.body.nextCursor}`,
      ).expect(200);
      expect(second.body.documents.map((d: { id: string }) => d.id)).toEqual([
        'c00000000000000000000001',
      ]);
      expect(second.body.nextCursor).toBeNull();
    });

    it('filters by vehicleId and by userId', async () => {
      const byVehicle = await get(`/api/admin/collections/fuel_logs?vehicleId=${VEHICLE_B}`).expect(
        200,
      );
      expect(byVehicle.body.documents.map((d: { id: string }) => d.id)).toEqual([
        'c00000000000000000000002',
      ]);

      const byUser = await get(`/api/admin/collections/user_avatars?userId=${USER}`).expect(200);
      expect(byUser.body.documents).toHaveLength(1);
    });

    it('shows files as contentType and sizeBytes, never the bytes', async () => {
      const res = await get('/api/admin/collections/user_avatars').expect(200);

      expect(res.body.documents[0]).toEqual({
        id: 'd00000000000000000000001',
        userId: USER,
        contentType: 'image/png',
        sizeBytes: 2,
        updatedAt: AT.toISOString(),
      });
    });

    it('never shows unregistered fields', async () => {
      const res = await get('/api/admin/collections/users').expect(200);

      expect(res.body.documents[0]).not.toHaveProperty('role');
    });

    it.each(['admins', 'otp_codes', 'otp_requests', 'nope'])('returns 404 for %s', async (name) => {
      await get(`/api/admin/collections/${name}`).expect(404);
    });

    it.each([
      ['userId', 'fuel_logs'],
      ['vehicleId', 'users'],
      ['userId', 'vehicle_transfers'],
    ])('returns 400 for a %s filter on %s', async (field, name) => {
      const res = await get(`/api/admin/collections/${name}?${field}=${USER}`).expect(400);

      expect(res.body.error.details).toEqual({ [field]: [`${name} has no ${field} field`] });
    });

    it.each(['limit=0', 'limit=101', 'cursor=nope', 'vehicleId=nope'])(
      'returns 400 for %s',
      async (query) => {
        await get(`/api/admin/collections/fuel_logs?${query}`).expect(400);
      },
    );
  });
});
