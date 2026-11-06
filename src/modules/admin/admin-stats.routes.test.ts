import request from 'supertest';
import { beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../../app.ts';
import { adminFixture } from '../../test/admin-fixture.ts';
import { InMemoryCollectionRepository } from '../../test/in-memory-collection.repository.ts';
import { InMemoryUserRepository } from '../../test/in-memory-user.repository.ts';
import { createTestDependencies } from '../../test/test-dependencies.ts';

// 2026-11-06 13:30 in Tehran.
const NOW = new Date('2026-11-06T10:00:00Z');
const row = (n: number, createdAt: string) => ({
  id: `c${String(n).padStart(23, '0')}`,
  createdAt: new Date(createdAt),
});

describe('GET /api/admin/stats', () => {
  let app: ReturnType<typeof createApp>;
  let ADMIN: string;

  beforeEach(() => {
    const collections = new InMemoryCollectionRepository({
      users: [
        row(1, '2026-11-05T21:00:00Z'),
        row(2, '2026-11-06T08:00:00Z'),
        row(3, '2025-01-01T00:00:00Z'),
      ],
      vehicles: [row(4, '2026-10-08T00:00:00Z')],
      fuel_logs: [row(5, '2026-10-07T19:00:00Z')], // 2026-10-07 22:30 in Tehran: before the default range
    });
    const users = new InMemoryUserRepository([
      { id: 'a00000000000000000000001', phone: '09120000001', blockedAt: NOW },
      { id: 'a00000000000000000000002', phone: '09120000002' },
    ]);
    const admin = adminFixture();
    ADMIN = admin.ADMIN;
    app = createApp(
      createTestDependencies({
        collectionRepository: collections,
        userRepository: users,
        adminRepository: admin.adminRepository,
        now: () => NOW,
      }),
    );
  });

  const get = (query = '') =>
    request(app).get(`/api/admin/stats${query}`).set('Authorization', ADMIN);

  it('returns 401 without an admin token', async () => {
    await request(app).get('/api/admin/stats').expect(401);
  });

  it('defaults to the last 30 Tehran days by day, with all-time totals and a dense series', async () => {
    const res = await get().expect(200);

    expect(res.body.range).toEqual({ from: '2026-10-08', to: '2026-11-06', bucket: 'day' });
    expect(res.body.totals).toEqual({
      users: 3,
      blockedUsers: 1,
      vehicles: 1,
      serviceVisits: 0,
      fuelLogs: 1,
      expenses: 0,
      odometerReadings: 0,
      documents: 0,
    });
    expect(res.body.series).toHaveLength(30);
    expect(res.body.series[0]).toEqual({
      bucketStart: '2026-10-08',
      users: 0,
      vehicles: 1,
      serviceVisits: 0,
      fuelLogs: 0,
      expenses: 0,
      odometerReadings: 0,
      documents: 0,
    });
    expect(res.body.series.at(-1)).toMatchObject({ bucketStart: '2026-11-06', users: 2 });
  });

  it('buckets by Saturday weeks and by months', async () => {
    const weeks = await get('?from=2026-10-25&to=2026-11-06&bucket=week').expect(200);
    expect(weeks.body.series.map((p: { bucketStart: string }) => p.bucketStart)).toEqual([
      '2026-10-24',
      '2026-10-31',
    ]);
    expect(weeks.body.series[1].users).toBe(2);

    const months = await get('?from=2026-10-01&to=2026-11-06&bucket=month').expect(200);
    expect(months.body.series).toMatchObject([
      { bucketStart: '2026-10-01', vehicles: 1, fuelLogs: 1 },
      { bucketStart: '2026-11-01', users: 2 },
    ]);
  });

  it('accepts a range of 366 days', async () => {
    const res = await get('?from=2025-11-06&to=2026-11-06').expect(200);

    expect(res.body.series).toHaveLength(366);
  });

  it.each([
    ['from after to', '?from=2026-11-06&to=2026-11-05'],
    ['a range over 366 days', '?from=2025-11-05&to=2026-11-06'],
    ['an invalid date', '?from=2026-02-30'],
    ['an unknown bucket', '?bucket=year'],
  ])('returns 400 for %s', async (_name, query) => {
    const res = await get(query).expect(400);

    expect(res.body.error.message).toBe('Validation failed');
  });
});
